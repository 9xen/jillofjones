const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace(
  'export async function notifyUsers',
  'async function notifyUsers'
);

fs.writeFileSync('server.ts', code);
