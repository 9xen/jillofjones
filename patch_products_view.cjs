const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

code = code.replace(
  '            deleteProduct={removeSoftwareProduct} ',
  '            deleteProduct={removeSoftwareProduct} \n            editProduct={editSoftwareProduct}'
);

code = code.replace(
  'function SoftwareProductsView({ \n  products, \n  addProduct, \n  deleteProduct, \n  licenses, \n  currentUser,\n  showToast \n}: { \n  products: SoftwareProduct[], \n  addProduct: (p: Omit<SoftwareProduct, \\\'id\\\'>) => void, \n  deleteProduct: (id: string) => void, ',
  'function SoftwareProductsView({ \n  products, \n  addProduct, \n  deleteProduct, \n  editProduct, \n  licenses, \n  currentUser,\n  showToast \n}: { \n  products: SoftwareProduct[], \n  addProduct: (p: Omit<SoftwareProduct, \\\'id\\\'>) => void, \n  deleteProduct: (id: string) => void, \n  editProduct: (id: string, updates: Partial<SoftwareProduct>) => void, '
);

const editState = `  const [editingProduct, setEditingProduct] = useState<SoftwareProduct | null>(null);`;
code = code.replace(
  "  const [formData, setFormData] = useState({ name: '', description: '', version: '', base_price: 10000 });",
  "  const [formData, setFormData] = useState({ name: '', description: '', version: '', base_price: 10000 });\n" + editState
);

const editUI = `
                      <button 
                        onClick={() => {
                          setEditingProduct(prod);
                          setFormData({
                            name: prod.name,
                            description: prod.description || '',
                            version: prod.version || '',
                            base_price: prod.base_price
                          });
                          setIsModalOpen(true);
                        }}
                        className="text-zinc-500 hover:text-indigo-400 text-xs font-medium transition-colors mr-3"
                      >
                        Edit
                      </button>
`;

code = code.replace(
  '                      <button \n                        onClick={() => deleteProduct(prod.id)} ',
  editUI + '                      <button \n                        onClick={() => deleteProduct(prod.id)} '
);

const submitUpdate = `
    const payload = { ...formData };
    if (editingProduct) {
      editProduct(editingProduct.id, payload);
    } else {
      addProduct(payload);
    }
    setEditingProduct(null);
`;

code = code.replace(
  "    addProduct(formData);",
  submitUpdate
);

const closeUpdate = `
              setIsModalOpen(false);
              setEditingProduct(null);
`;
code = code.replace(
  '              setIsModalOpen(false);\n            }}\n            className="p-1 hover:bg-zinc-800 rounded-lg transition-colors"',
  '              setIsModalOpen(false);\n              setEditingProduct(null);\n            }}\n            className="p-1 hover:bg-zinc-800 rounded-lg transition-colors"'
);

const titleUpdate = `
            <h3 className="text-xl font-bold text-white tracking-tight">{editingProduct ? 'Edit Software Product' : 'Add Software Product'}</h3>
`;
code = code.replace(
  '            <h3 className="text-xl font-bold text-white tracking-tight">Add Software Product</h3>',
  titleUpdate
);

const submitBtnUpdate = `
              <button 
                type="submit" 
                className="bg-indigo-500 hover:bg-indigo-400 text-white font-bold py-2.5 px-6 rounded-xl transition-all shadow-[0_0_15px_rgba(99,102,241,0.2)] text-sm flex items-center justify-center gap-2"
              >
                {editingProduct ? 'Update Product' : 'Save Product'}
              </button>
`;
code = code.replace(
  '              <button \n                type="submit" \n                className="bg-indigo-500 hover:bg-indigo-400 text-white font-bold py-2.5 px-6 rounded-xl transition-all shadow-[0_0_15px_rgba(99,102,241,0.2)] text-sm flex items-center justify-center gap-2"\n              >\n                Save Product\n              </button>',
  submitBtnUpdate
);

fs.writeFileSync('src/App.tsx', code);
