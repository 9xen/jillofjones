const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace(
  "event_type: 'auto_suspended',",
  "event_type: 'suspension',"
);

fs.writeFileSync('server.ts', code);
