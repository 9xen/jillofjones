const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const eventsToSecure = [
  "node:disconnect_node",
  "licenses:create",
  "licenses:update_status",
  "licenses:update_details",
  "licenses:delete",
  "licenses:extend",
  "licenses:reset_hwid",
  "licenses:update_config",
  "licenses:batch_update",
  "clients:create",
  "clients:update",
  "clients:delete",
  "software_products:create",
  "software_products:update",
  "software_products:delete",
  "license_tiers:create",
  "license_tiers:update",
  "license_tiers:delete",
  "users:create",
  "users:update_role",
  "users:delete"
];

for (const ev of eventsToSecure) {
  const search = `socket.on("${ev}", `;
  const replace = `socket.on("${ev}", (...args) => { if (!isAuthenticated) return; const cb = `;
  // We need to wrap the callback.
  // Actually, simpler:
  // Find `socket.on("event", (params) => {`
  // and insert `if (!isAuthenticated) return;` after `{`.
  const regex = new RegExp(`(socket\\.on\\("${ev}",\\s*(?:async\\s*)?\\([^)]*\\)\\s*=>\\s*\\{\n)`, 'g');
  code = code.replace(regex, `$1      if (!isAuthenticated) return;\n`);
}

fs.writeFileSync('server.ts', code);
