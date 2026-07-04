const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const editMethods = `
  const editClient = (id: string, updates: Partial<Client>) => {
    if (!socketRef.current) return;
    socketRef.current.emit('clients:update', { id, updates, user: currentUser });
    showToast('Client updated', 'success');
  };

  const editSoftwareProduct = (id: string, updates: Partial<SoftwareProduct>) => {
    if (!socketRef.current) return;
    socketRef.current.emit('software_products:update', { id, updates });
    showToast('Product updated', 'success');
  };

  const editLicenseTier = (id: string, updates: Partial<LicenseTier>) => {
    if (!socketRef.current) return;
    socketRef.current.emit('license_tiers:update', { id, updates });
    showToast('Tier updated', 'success');
  };
`;

code = code.replace(
  "  const removeClient = (id: string) => {",
  editMethods + "\n  const removeClient = (id: string) => {"
);

fs.writeFileSync('src/App.tsx', code);
