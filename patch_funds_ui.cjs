const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const editState = `  const [editingClient, setEditingClient] = useState<Client | null>(null);`;

code = code.replace(
  "  const [extraFields, setExtraFields] = useState<Array<{ key: string, value: string }>>([",
  editState + "\n  const [extraFields, setExtraFields] = useState<Array<{ key: string, value: string }>>(["
);

const editUI = `
                      <button 
                        onClick={() => {
                          setEditingClient(cli);
                          setFormData({
                            name: cli.name,
                            email: cli.email,
                            mobile: cli.mobile,
                            address: cli.address || '',
                            extra_info: ''
                          });
                          if (cli.extra_info) {
                            try {
                              const parsed = JSON.parse(cli.extra_info);
                              setExtraFields(Object.entries(parsed).map(([key, value]) => ({ key, value: String(value) })));
                            } catch(e) {}
                          } else {
                            setExtraFields([]);
                          }
                          setIsModalOpen(true);
                        }}
                        className="text-zinc-500 hover:text-indigo-400 text-xs font-medium transition-colors mr-3"
                      >
                        Edit
                      </button>
`;

code = code.replace(
  '                      <button \n                        onClick={() => deleteClient(cli.id)} ',
  editUI + '                      <button \n                        onClick={() => deleteClient(cli.id)} '
);

const submitUpdate = `
    const payload = {
      name: formData.name,
      email: formData.email,
      mobile: formData.mobile,
      address: formData.address,
      extra_info: JSON.stringify(extrasObj)
    };
    
    if (editingClient) {
      editClient(editingClient.id, payload);
    } else {
      addClient(payload);
    }
    
    setEditingClient(null);
`;

code = code.replace(
  "    addClient({\n      name: formData.name,\n      email: formData.email,\n      mobile: formData.mobile,\n      address: formData.address,\n      extra_info: JSON.stringify(extrasObj)\n    });",
  submitUpdate
);

const closeUpdate = `
              setIsModalOpen(false);
              setEditingClient(null);
`;

code = code.replace(
  '              setIsModalOpen(false);\n            }}\n            className="p-1 hover:bg-zinc-800 rounded-lg transition-colors"',
  '              setIsModalOpen(false);\n              setEditingClient(null);\n            }}\n            className="p-1 hover:bg-zinc-800 rounded-lg transition-colors"'
);

const titleUpdate = `
            <h3 className="text-xl font-bold text-white tracking-tight">{editingClient ? 'Edit Client/Fund' : 'Add Client/Fund Profile'}</h3>
`;

code = code.replace(
  '            <h3 className="text-xl font-bold text-white tracking-tight">Add Client/Fund Profile</h3>',
  titleUpdate
);

const submitBtnUpdate = `
              <button 
                type="submit" 
                className="bg-indigo-500 hover:bg-indigo-400 text-white font-bold py-2.5 px-6 rounded-xl transition-all shadow-[0_0_15px_rgba(99,102,241,0.2)] text-sm flex items-center justify-center gap-2"
              >
                {editingClient ? 'Update Profile' : 'Save Profile'}
              </button>
`;

code = code.replace(
  '              <button \n                type="submit" \n                className="bg-indigo-500 hover:bg-indigo-400 text-white font-bold py-2.5 px-6 rounded-xl transition-all shadow-[0_0_15px_rgba(99,102,241,0.2)] text-sm flex items-center justify-center gap-2"\n              >\n                Save Profile\n              </button>',
  submitBtnUpdate
);

fs.writeFileSync('src/App.tsx', code);
