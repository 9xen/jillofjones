const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

code = code.replace(
  "  const [toast, setToast] = useState<{message: string, type: 'success'|'error', onUndo?: () => void} | null>(null);",
  "  const [toast, setToast] = useState<{message: string, type: 'success'|'error', onUndo?: () => void} | null>(null);\n  const [editingMainLicense, setEditingMainLicense] = useState<License | null>(null);"
);

const newCreateFunc = `  const handleCreateLicense = (licenseData: Partial<License>) => {
    if (!socketRef.current) return;
    
    if (editingMainLicense) {
      socketRef.current.emit("licenses:update_details", { id: editingMainLicense.id, updates: licenseData, user: currentUser });
      showToast('License details updated', 'success');
      setEditingMainLicense(null);
      return;
    }
`;
code = code.replace(
  "  const handleCreateLicense = (licenseData: Partial<License>) => {\n    if (!socketRef.current) return;",
  newCreateFunc
);

code = code.replace(
  "        onClose={() => setIsCreateModalOpen(false)} ",
  "        onClose={() => { setIsCreateModalOpen(false); setEditingMainLicense(null); }} \n        editingLicense={editingMainLicense}"
);

fs.writeFileSync('src/App.tsx', code);
