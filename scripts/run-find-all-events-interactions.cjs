const fs = require('fs');
const path = require('path');

const patcher = path.join(__dirname, 'apply-find-all-events-interactions.cjs');
let source = fs.readFileSync(patcher, 'utf8');

source = source.replace(
  '${Math.round(distance * 1000)}',
  '\\${Math.round(distance * 1000)}'
);
source = source.replace(
  '${distance.toFixed(1)}',
  '\\${distance.toFixed(1)}'
);

fs.writeFileSync(patcher, source);
require(patcher);

if (fs.existsSync(__filename)) fs.unlinkSync(__filename);
