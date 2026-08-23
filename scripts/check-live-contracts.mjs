import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SOURCE_ROOTS = ['app', 'src'];
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);
const SCHEMA_CONTRACT_PATH = path.join(ROOT, 'supabase', 'schema-contract.json');

function fail(message) {
  console.error(`\n❌ ${message}`);
  process.exitCode = 1;
}

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  const out = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) out.push(...walk(fullPath));
    else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) out.push(fullPath);
  }
  return out;
}

function loadSupabaseConfig() {
  const sourcePath = path.join(ROOT, 'src', 'lib', 'supabase.ts');
  const source = fs.readFileSync(sourcePath, 'utf8');
  const url = source.match(/const\s+supabaseUrl\s*=\s*['"]([^'"]+)['"]/i)?.[1];
  const key = source.match(/const\s+supabaseAnonKey\s*=\s*['"]([^'"]+)['"]/i)?.[1];

  if (!url || !key) {
    throw new Error('Configurazione Supabase non trovata in src/lib/supabase.ts.');
  }
  return { url: url.replace(/\/$/, ''), key };
}

function loadSchemaContract() {
  if (!fs.existsSync(SCHEMA_CONTRACT_PATH)) {
    throw new Error('Manca supabase/schema-contract.json.');
  }

  const contract = JSON.parse(fs.readFileSync(SCHEMA_CONTRACT_PATH, 'utf8'));
  if (!contract?.tables || !Array.isArray(contract?.functions)) {
    throw new Error('supabase/schema-contract.json non è valido.');
  }
  return contract;
}

function sourceFiles() {
  return SOURCE_ROOTS.flatMap((root) => walk(path.join(ROOT, root)));
}

function collectLiteralSelects(files) {
  const contracts = new Map();
  const pattern = /\.from\(\s*(['"])([^'"]+)\1\s*\)((?:(?!\.from\().){0,1600}?)\.select\(\s*(['"`])([^'"`]+)\3/gms;

  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    let match;
    while ((match = pattern.exec(source)) !== null) {
      const table = String(match[2] || '').trim();
      const select = String(match[4] || '').trim();
      if (!table || !select || select.includes('${')) continue;

      const key = `${table}\u0000${select}`;
      const line = source.slice(0, match.index).split('\n').length;
      const origin = `${path.relative(ROOT, file)}:${line}`;

      if (!contracts.has(key)) contracts.set(key, { table, select, origins: [origin] });
      else contracts.get(key).origins.push(origin);
    }
  }

  return Array.from(contracts.values());
}

function collectLiteralRpcs(files) {
  const calls = new Map();
  const pattern = /\.rpc\(\s*(['"])([^'"]+)\1/gm;

  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    let match;
    while ((match = pattern.exec(source)) !== null) {
      const name = String(match[2] || '').trim();
      if (!name) continue;
      const line = source.slice(0, match.index).split('\n').length;
      const origin = `${path.relative(ROOT, file)}:${line}`;
      if (!calls.has(name)) calls.set(name, []);
      calls.get(name).push(origin);
    }
  }

  return calls;
}

function splitTopLevel(value) {
  const parts = [];
  let current = '';
  let depth = 0;

  for (const char of value) {
    if (char === '(') depth += 1;
    if (char === ')') depth = Math.max(0, depth - 1);

    if (char === ',' && depth === 0) {
      if (current.trim()) parts.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }

  if (current.trim()) parts.push(current.trim());
  return parts;
}

function plainSelectedColumns(select) {
  const columns = new Set();

  for (const rawToken of splitTopLevel(select)) {
    let token = rawToken.trim();
    if (!token || token === '*') continue;

    // Relazioni PostgREST, embed e aggregazioni sono validate dal probe live.
    if (token.includes('(') || token.includes(')')) continue;

    if (token.includes(':')) token = token.slice(token.lastIndexOf(':') + 1);
    token = token.split('::')[0];
    token = token.split('->')[0];
    token = token.split('!')[0];
    token = token.trim();

    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(token)) columns.add(token);
  }

  return [...columns];
}

function validateSnapshot(schema, selects, rpcs) {
  let failures = 0;

  for (const contract of selects) {
    const columns = schema.tables[contract.table];
    if (!Array.isArray(columns)) {
      failures += 1;
      console.error(`\n❌ Tabella/view non presente nello schema: ${contract.table}`);
      console.error(`   ${contract.origins.slice(0, 4).join(', ')}`);
      continue;
    }

    const available = new Set(columns);
    for (const column of plainSelectedColumns(contract.select)) {
      if (!available.has(column)) {
        failures += 1;
        console.error(`\n❌ Colonna inesistente: ${contract.table}.${column}`);
        console.error(`   select: ${contract.select}`);
        console.error(`   ${contract.origins.slice(0, 4).join(', ')}`);
      }
    }
  }

  const functions = new Set(schema.functions);
  for (const [name, origins] of rpcs.entries()) {
    if (!functions.has(name)) {
      failures += 1;
      console.error(`\n❌ RPC inesistente nello schema: ${name}`);
      console.error(`   ${origins.slice(0, 4).join(', ')}`);
    }
  }

  return failures;
}

function compactMessage(body, fallback) {
  if (!body || typeof body !== 'object') return fallback;
  return String(body.message || body.error_description || body.error || fallback).slice(0, 400);
}

async function probeSelect(config, contract) {
  const url = new URL(`${config.url}/rest/v1/${encodeURIComponent(contract.table)}`);
  url.searchParams.set('select', contract.select);
  url.searchParams.set('limit', '0');

  const response = await fetch(url, {
    headers: {
      apikey: config.key,
      Accept: 'application/json',
    },
  });

  if (response.ok) return { ok: true, protected: false };

  let body = null;
  try { body = await response.json(); } catch {}

  // Alcune risorse sono volutamente invisibili ad anon. In quel caso lo
  // snapshot DB resta il controllo autoritativo e non generiamo falsi errori.
  if (response.status === 401 || response.status === 403) {
    return { ok: true, protected: true };
  }

  return {
    ok: false,
    protected: false,
    status: response.status,
    code: body?.code || '',
    message: compactMessage(body, response.statusText || 'Errore sconosciuto'),
  };
}

async function main() {
  console.log('🔎 Bajuju release contract check');
  const config = loadSupabaseConfig();
  const schema = loadSchemaContract();
  const files = sourceFiles();
  const selects = collectLiteralSelects(files);
  const rpcs = collectLiteralRpcs(files);

  if (selects.length === 0) {
    fail('Nessuna select Supabase letterale trovata: il controllo non sarebbe affidabile.');
    return;
  }

  const snapshotFailures = validateSnapshot(schema, selects, rpcs);
  if (snapshotFailures > 0) {
    fail(`Contratto schema non valido: ${snapshotFailures} riferimenti inesistenti.`);
    return;
  }

  console.log(`   Snapshot DB: ${selects.length} SELECT e ${rpcs.size} RPC valide.`);

  let liveFailures = 0;
  let protectedCount = 0;
  for (const contract of selects) {
    const result = await probeSelect(config, contract);
    if (result.protected) protectedCount += 1;
    if (!result.ok) {
      liveFailures += 1;
      console.error(`\n❌ Probe live: ${contract.table} -> ${contract.select}`);
      console.error(`   ${contract.origins.slice(0, 4).join(', ')}`);
      console.error(`   HTTP ${result.status} ${result.code || ''} ${result.message}`);
    }
  }

  if (liveFailures > 0) {
    fail(`Contratti live non validi: ${liveFailures} SELECT fallite.`);
    return;
  }

  if (protectedCount > 0) {
    console.log(`   ${protectedCount} SELECT protette da RLS/grant: validate tramite snapshot DB.`);
  }

  console.log('✅ Contratti Supabase coerenti con il codice. Nessuna RPC di scrittura è stata eseguita.');
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
