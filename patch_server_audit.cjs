const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const roleUpdate = `
        updateUserRole(id, role);
        const log = createAuditLog('system', 'System', 'update_role', 'user', id, \`Updated user role to \${role}\`);
        io.emit('audit:new', log);
        io.emit("users:role_updated", { id, role });
`;

code = code.replace(
  'updateUserRole(id, role);\n        io.emit("users:role_updated", { id, role });',
  roleUpdate
);

fs.writeFileSync('server.ts', code);
