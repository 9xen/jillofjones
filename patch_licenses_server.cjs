const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace(
  "deleteLicense,",
  "deleteLicense, updateLicenseDetails,"
);

code = code.replace(
  '    socket.on("licenses:delete", ({ id, user }: { id: string, user: AppUser }) => {',
  `    socket.on("licenses:update_details", ({ id, updates, user }: { id: string, updates: any, user: AppUser }) => {
      try {
        updateLicenseDetails(id, updates);
        io.emit("licenses:updated", { id, ...updates });
        logAction(user, 'update', 'license', id, \`Updated license profile details\`);
      } catch (err) {
        console.error("Error updating license details:", err);
      }
    });

    socket.on("licenses:delete", ({ id, user }: { id: string, user: AppUser }) => {`
);

fs.writeFileSync('server.ts', code);
