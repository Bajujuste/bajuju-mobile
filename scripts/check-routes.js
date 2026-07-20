const fs = require('fs');
const path = require('path');

const root = process.cwd();
const appDirectory = path.join(root, 'app');

const ignoredDirectories = new Set([
  'node_modules',
  '.git',
  '.expo',
  'dist',
  'build',
]);

function walk(directory) {
  const results = [];

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (ignoredDirectories.has(entry.name)) continue;

    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      results.push(...walk(fullPath));
    } else {
      results.push(fullPath);
    }
  }

  return results;
}

function normalizeRouteFromFile(filePath) {
  let relative = path
    .relative(appDirectory, filePath)
    .replace(/\\/g, '/')
    .replace(/\.(tsx|ts|jsx|js)$/, '');

  relative = relative
    .replace(/\/index$/, '')
    .replace(/^index$/, '')
    .replace(/\/_layout$/, '')
    .replace(/^_layout$/, '');

  const parts = relative
    .split('/')
    .filter(Boolean)
    .filter((part) => !(part.startsWith('(') && part.endsWith(')')));

  if (parts.length === 0) return '/';

  return `/${parts.join('/')}`;
}

function normalizeLinkedRoute(route) {
  if (!route.startsWith('/')) return null;

  return route
    .split('?')[0]
    .split('#')[0]
    .replace(/\/+$/, '') || '/';
}

const routeFiles = walk(appDirectory).filter((file) =>
  /\.(tsx|ts|jsx|js)$/.test(file)
);

const existingRoutes = new Set(
  routeFiles
    .map(normalizeRouteFromFile)
    .filter(Boolean)
);

console.log('Rotte trovate nell’app:');

for (const route of [...existingRoutes].sort()) {
  console.log(`  ✅ ${route}`);
}

const sourceFiles = walk(root).filter((file) => {
  if (!/\.(tsx|ts|jsx|js)$/.test(file)) return false;
  if (file.includes(`${path.sep}node_modules${path.sep}`)) return false;
  if (file.includes(`${path.sep}backup-`)) return false;
  return true;
});

const routePatterns = [
  /router\.(?:push|replace|navigate)\(\s*['"`]([^'"`]+)['"`]/g,
  /href\s*=\s*['"`]([^'"`]+)['"`]/g,
  /href\s*=\s*\{\s*['"`]([^'"`]+)['"`]\s*\}/g,
];

const references = [];

for (const file of sourceFiles) {
  const content = fs.readFileSync(file, 'utf8');

  for (const pattern of routePatterns) {
    let match;

    while ((match = pattern.exec(content)) !== null) {
      references.push({
        file: path.relative(root, file),
        original: match[1],
        normalized: normalizeLinkedRoute(match[1]),
      });
    }
  }
}

const failures = [];

console.log('\nCollegamenti controllati:');

for (const reference of references) {
  const route = reference.normalized;

  if (!route) continue;

  const isDynamicTemplate =
    reference.original.includes('${') ||
    reference.original.includes('[');

  const exactExists = existingRoutes.has(route);

  const dynamicExists = [...existingRoutes].some((existingRoute) => {
    if (!existingRoute.includes('[')) return false;

    const expression = new RegExp(
      '^' +
        existingRoute
          .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          .replace(/\\\[.*?\\\]/g, '[^/]+') +
        '$'
    );

    return expression.test(route);
  });

  if (exactExists || dynamicExists || isDynamicTemplate) {
    console.log(`  ✅ ${reference.original} — ${reference.file}`);
  } else {
    console.log(`  ❌ ${reference.original} — ${reference.file}`);
    failures.push(reference);
  }
}

const requiredRoutes = [
  '/',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/auth/callback',
  '/home',
  '/profile',
  '/experiences',
  '/experiences-map',
  '/create-experience',
  '/experience-detail',
  '/flash',
];

console.log('\nRotte critiche obbligatorie:');

for (const route of requiredRoutes) {
  if (existingRoutes.has(route)) {
    console.log(`  ✅ ${route}`);
  } else {
    console.log(`  ❌ ${route}`);
    failures.push({
      file: 'controllo rotte critiche',
      original: route,
    });
  }
}

if (failures.length > 0) {
  console.error('\n❌ AUDIT ROTTE NON SUPERATO');
  process.exit(1);
}

console.log('\n✅ AUDIT ROTTE SUPERATO');
