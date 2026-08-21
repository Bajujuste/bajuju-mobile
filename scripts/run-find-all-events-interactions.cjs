const fs = require('fs');
const path = require('path');

const patcher = path.join(__dirname, 'apply-find-all-events-interactions.cjs');
let source = fs.readFileSync(patcher, 'utf8');

const startToken = '                              {distance < 1 ?';
const start = source.indexOf(startToken);
if (start < 0) throw new Error('Riga distanza non trovata nel patcher.');
const end = source.indexOf('\n', start);
if (end < 0) throw new Error('Fine riga distanza non trovata nel patcher.');

source =
  source.slice(0, start) +
  "                              {distance < 1 ? Math.round(distance * 1000) + ' m' : distance.toFixed(1) + ' km'} da te" +
  source.slice(end);

fs.writeFileSync(patcher, source);
require(patcher);

if (fs.existsSync(__filename)) fs.unlinkSync(__filename);
