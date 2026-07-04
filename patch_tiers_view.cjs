const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

code = code.replace(
  '            deleteTier={removeLicenseTier} ',
  '            deleteTier={removeLicenseTier} \n            editTier={editLicenseTier}'
);

code = code.replace(
  'function LicenseTiersView({ \n  tiers, \n  addTier, \n  deleteTier, \n  licenses, \n  currentUser,\n  showToast \n}: { \n  tiers: LicenseTier[], \n  addTier: (t: Omit<LicenseTier, \\\'id\\\'>) => void, \n  deleteTier: (id: string) => void, ',
  'function LicenseTiersView({ \n  tiers, \n  addTier, \n  deleteTier, \n  editTier, \n  licenses, \n  currentUser,\n  showToast \n}: { \n  tiers: LicenseTier[], \n  addTier: (t: Omit<LicenseTier, \\\'id\\\'>) => void, \n  deleteTier: (id: string) => void, \n  editTier: (id: string, updates: Partial<LicenseTier>) => void, '
);

const editState = `  const [editingTier, setEditingTier] = useState<LicenseTier | null>(null);`;
code = code.replace(
  "  const [formData, setFormData] = useState({ name: '', description: '', max_volume_usd: 10000000, api_calls_limit: 10000, api_calls_limit_monthly: 300000, api_calls_limit_yearly: 3600000 });",
  "  const [formData, setFormData] = useState({ name: '', description: '', max_volume_usd: 10000000, api_calls_limit: 10000, api_calls_limit_monthly: 300000, api_calls_limit_yearly: 3600000 });\n" + editState
);

const editUI = `
                      <button 
                        onClick={() => {
                          setEditingTier(t);
                          setFormData({
                            name: t.name,
                            description: t.description || '',
                            max_volume_usd: t.max_volume_usd,
                            api_calls_limit: t.api_calls_limit,
                            api_calls_limit_monthly: t.api_calls_limit_monthly || 300000,
                            api_calls_limit_yearly: t.api_calls_limit_yearly || 3600000
                          });
                          setIsModalOpen(true);
                        }}
                        className="text-zinc-500 hover:text-indigo-400 text-xs font-medium transition-colors mr-3"
                      >
                        Edit
                      </button>
`;

code = code.replace(
  '                      <button \n                        onClick={() => deleteTier(t.id)} ',
  editUI + '                      <button \n                        onClick={() => deleteTier(t.id)} '
);

const submitUpdate = `
    const payload = { ...formData };
    if (editingTier) {
      editTier(editingTier.id, payload);
    } else {
      addTier(payload);
    }
    setEditingTier(null);
`;

code = code.replace(
  "    addTier(formData);",
  submitUpdate
);

const closeUpdate = `
              setIsModalOpen(false);
              setEditingTier(null);
`;
code = code.replace(
  '              setIsModalOpen(false);\n            }}\n            className="p-1 hover:bg-zinc-800 rounded-lg transition-colors"',
  '              setIsModalOpen(false);\n              setEditingTier(null);\n            }}\n            className="p-1 hover:bg-zinc-800 rounded-lg transition-colors"'
);

const titleUpdate = `
            <h3 className="text-xl font-bold text-white tracking-tight">{editingTier ? 'Edit License Tier' : 'Add License Tier'}</h3>
`;
code = code.replace(
  '            <h3 className="text-xl font-bold text-white tracking-tight">Add License Tier</h3>',
  titleUpdate
);

const submitBtnUpdate = `
              <button 
                type="submit" 
                className="bg-indigo-500 hover:bg-indigo-400 text-white font-bold py-2.5 px-6 rounded-xl transition-all shadow-[0_0_15px_rgba(99,102,241,0.2)] text-sm flex items-center justify-center gap-2"
              >
                {editingTier ? 'Update Tier' : 'Save Tier'}
              </button>
`;
code = code.replace(
  '              <button \n                type="submit" \n                className="bg-indigo-500 hover:bg-indigo-400 text-white font-bold py-2.5 px-6 rounded-xl transition-all shadow-[0_0_15px_rgba(99,102,241,0.2)] text-sm flex items-center justify-center gap-2"\n              >\n                Save Tier\n              </button>',
  submitBtnUpdate
);

fs.writeFileSync('src/App.tsx', code);
