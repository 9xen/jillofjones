const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace(
  "createClient, deleteClient,",
  "createClient, deleteClient, updateClient,"
);

code = code.replace(
  "createSoftwareProduct, deleteSoftwareProduct,",
  "createSoftwareProduct, deleteSoftwareProduct, updateSoftwareProduct,"
);

code = code.replace(
  "createLicenseTier, deleteLicenseTier,",
  "createLicenseTier, deleteLicenseTier, updateLicenseTier,"
);

code = code.replace(
  '    socket.on("clients:delete", ({ id, user }: { id: string, user: AppUser }) => {',
  `    socket.on("clients:update", ({ id, updates, user }: { id: string, updates: any, user: AppUser }) => {
      try {
        updateClient(id, updates);
        io.emit("clients:updated", { id, updates });
        logAction(user, 'update', 'client', id, \`Updated client profile\`);
      } catch (err) {
        console.error("Error updating client:", err);
      }
    });

    socket.on("clients:delete", ({ id, user }: { id: string, user: AppUser }) => {`
);

code = code.replace(
  '    socket.on("software_products:delete", (id: string) => {',
  `    socket.on("software_products:update", ({ id, updates }: { id: string, updates: any }) => {
      try {
        updateSoftwareProduct(id, updates);
        io.emit("software_products:updated", { id, updates });
      } catch (err) {
        console.error("Error updating software product:", err);
      }
    });

    socket.on("software_products:delete", (id: string) => {`
);

code = code.replace(
  '    socket.on("license_tiers:delete", (id: string) => {',
  `    socket.on("license_tiers:update", ({ id, updates }: { id: string, updates: any }) => {
      try {
        updateLicenseTier(id, updates);
        io.emit("license_tiers:updated", { id, updates });
      } catch (err) {
        console.error("Error updating license tier:", err);
      }
    });

    socket.on("license_tiers:delete", (id: string) => {`
);

fs.writeFileSync('server.ts', code);
