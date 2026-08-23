import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SOURCE_ROOTS = ['app', 'src'];
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);

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

function collectLiteralSelects() {
  const contracts = new Map();
  const files = SOURCE_ROOTS.flatMap((root) => walk(path.join(ROOT, root)));
  const pattern = /\.from\(\s*(['"])([^'"]+)\1\s*\)((?:(?!\.from\().){0,1600}?)\.select\(\s*(['"`])([^'"`]+)\3/gms;

  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    let match;
    while ((match = pattern.exec(source)) !== null) {
      const table = String(match[2] || '').trim();
      const select = String(match[4] || '').trim();
      if (!table || !select || select.includes('${')) continue;

      const key = `${table}\u0000${select}`;
      if (!contracts.has(key)) {
        const line = source.slice(0, match.index).split('\n').length;
        contracts.set(key, {
          table,
          select,
          origins: [`${path.relative(ROOT, file)}:${line}`],
        });
      } else {
        const current = contracts.get(key);
        const line = source.slice(0, match.index).split('\n').length;
        current.origins.push(`${path.relative(ROOT, file)}:${line}`);
      }
    }
  }

  return Array.from(contracts.values());
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

  if (response.ok) return { ok: true };

  let body = null;
  try { body = await response.json(); } catch {}
  return {
    ok: false,
    status: response.status,
    code: body?.code || '',
    message: compactMessage(body, response.statusText || 'Errore sconosciuto'),
  };
}

const RPC_CONTRACTS = [
  ['join_standard_activity', { p_activity_id: '00000000-0000-0000-0000-000000000000' }],
  ['join_activity_waitlist', { p_activity_id: '00000000-0000-0000-0000-000000000000' }],
  ['leave_activity_waitlist', { p_activity_id: '00000000-0000-0000-0000-000000000000' }],
  ['get_my_activity_waitlist', { p_activity_id: '00000000-0000-0000-0000-000000000000' }],
  ['master_get_analytics_summary', { days_back: 7 }],
  ['admin_create_experience_command', { p_idempotency_key: 'release-contract-probe', p_payload: {} }],
];

async function probeRpc(config, name, payload) {
  const response = await fetch(`${config.url}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: config.key,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  let body = null;
  try { body = await response.json(); } catch {}

  const missing = response.status === 404 && String(body?.code || '').startsWith('PGRST');
  if (missing) {
    return {
      ok: false,
      status: response.status,
      code: body?.code || '',
      message: compactMessage(body, 'RPC non trovata'),
    };
  }

  // 400/401/403 sono accettabili in questo probe anonimo: significano che
  // la route RPC esiste ma rifiuta parametri, autenticazione o autorizzazione.
  return { ok: true, status: response.status };
}

async function main() {
  console.log('🔎 Bajuju release contract check');
  const config = loadSupabaseConfig();
  const contracts = collectLiteralSelects();

  if (contracts.length === 0) {
    fail('Nessuna select Supabase letterale trovata: il controllo non sarebbe affidabile.');
    return;
  }

  console.log(`   ${contracts.length} contratti SELECT trovati nel codice.`);

  let selectFailures = 0;
  for (const contract of contracts) {
    const result = await probeSelect(config, contract);
    if (!result.ok) {
      selectFailures += 1;
      console.error(`\n❌ ${contract.table} -> ${contract.select}`);
      console.error(`   ${contract.origins.slice(0, 4).join(', ')}`);
      console.error(`   HTTP ${result.status} ${result.code || ''} ${result.message}`);
    }
  }

  let rpcFailures = 0;
  for (const [name, payload] of RPC_CONTRACTS) {
    const result = await probeRpc(config, name, payload);
    if (!result.ok) {
      rpcFailures += 1;
      console.error(`\n❌ RPC ${name}`);
      console.error(`   HTTP ${result.status} ${result.code || ''} ${result.message}`);
    }
  }

  if (selectFailures || rpcFailures) {
    fail(`Contratti live non validi: ${selectFailures} SELECT, ${rpcFailures} RPC.`);
    return;
  }

  console.log(`✅ Contratti live OK: ${contracts.length} SELECT e ${RPC_CONTRACTS.length} RPC critiche.`);
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
