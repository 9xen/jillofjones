const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace(
  "const log = createAuditLog('system', 'System', 'update_role', 'user', id, `Updated user role to ${role}`);\n        io.emit('audit:new', log);",
  "logAction(null, 'update_role', 'user', id, `Updated user role to ${role}`);"
);

fs.writeFileSync('server.ts', code);
