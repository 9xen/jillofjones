const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

code = code.replace(
  'function FundsView({ \n  clients, \n  addClient, \n  deleteClient, \n  licenses, \n  currentUser,\n  showToast \n}: { \n  clients: Client[], \n  addClient: (c: Omit<Client, \\\'id\\\'>) => void, \n  deleteClient: (id: string) => void, ',
  'function FundsView({ \n  clients, \n  addClient, \n  deleteClient, \n  editClient, \n  licenses, \n  currentUser,\n  showToast \n}: { \n  clients: Client[], \n  addClient: (c: Omit<Client, \\\'id\\\'>) => void, \n  deleteClient: (id: string) => void, \n  editClient: (id: string, updates: Partial<Client>) => void, '
);

code = code.replace(
  'function SoftwareProductsView({ \n  products, \n  addProduct, \n  deleteProduct, \n  licenses, \n  currentUser,\n  showToast \n}: { \n  products: SoftwareProduct[], \n  addProduct: (p: Omit<SoftwareProduct, \\\'id\\\'>) => void, \n  deleteProduct: (id: string) => void, ',
  'function SoftwareProductsView({ \n  products, \n  addProduct, \n  deleteProduct, \n  editProduct, \n  licenses, \n  currentUser,\n  showToast \n}: { \n  products: SoftwareProduct[], \n  addProduct: (p: Omit<SoftwareProduct, \\\'id\\\'>) => void, \n  deleteProduct: (id: string) => void, \n  editProduct: (id: string, updates: Partial<SoftwareProduct>) => void, '
);

code = code.replace(
  'function LicenseTiersView({ \n  tiers, \n  addTier, \n  deleteTier, \n  licenses, \n  currentUser,\n  showToast \n}: { \n  tiers: LicenseTier[], \n  addTier: (t: Omit<LicenseTier, \\\'id\\\'>) => void, \n  deleteTier: (id: string) => void, ',
  'function LicenseTiersView({ \n  tiers, \n  addTier, \n  deleteTier, \n  editTier, \n  licenses, \n  currentUser,\n  showToast \n}: { \n  tiers: LicenseTier[], \n  addTier: (t: Omit<LicenseTier, \\\'id\\\'>) => void, \n  deleteTier: (id: string) => void, \n  editTier: (id: string, updates: Partial<LicenseTier>) => void, '
);

fs.writeFileSync('src/App.tsx', code);
