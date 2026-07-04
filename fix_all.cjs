const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

// Fix FundsView props
code = code.replace(
  "  deleteClient,\n  licenses,\n  currentUser,\n  showToast\n}: {\n  clients: Client[],\n  addClient: (c: Omit<Client, 'id'>) => void,\n  deleteClient: (id: string) => void,\n  licenses: License[],\n  currentUser: AppUser | null,\n  showToast: (msg: string, type: 'success'|'error') => void\n}) {",
  "  deleteClient,\n  editClient,\n  licenses,\n  currentUser,\n  showToast\n}: {\n  clients: Client[],\n  addClient: (c: Omit<Client, 'id'>) => void,\n  deleteClient: (id: string) => void,\n  editClient: (id: string, updates: Partial<Client>) => void,\n  licenses: License[],\n  currentUser: AppUser | null,\n  showToast: (msg: string, type: 'success'|'error') => void\n}) {"
);

// Fix SoftwareProductsView props and state
code = code.replace(
  "  deleteProduct,\n  licenses,\n  currentUser,\n  showToast\n}: {\n  products: SoftwareProduct[],\n  addProduct: (p: Omit<SoftwareProduct, 'id'>) => void,\n  deleteProduct: (id: string) => void,\n  licenses: License[],\n  currentUser: AppUser | null,\n  showToast: (msg: string, type: 'success'|'error') => void\n}) {",
  "  deleteProduct,\n  editProduct,\n  licenses,\n  currentUser,\n  showToast\n}: {\n  products: SoftwareProduct[],\n  addProduct: (p: Omit<SoftwareProduct, 'id'>) => void,\n  deleteProduct: (id: string) => void,\n  editProduct: (id: string, updates: Partial<SoftwareProduct>) => void,\n  licenses: License[],\n  currentUser: AppUser | null,\n  showToast: (msg: string, type: 'success'|'error') => void\n}) {"
);

// Fix LicenseTiersView props and state
code = code.replace(
  "  deleteTier,\n  licenses,\n  currentUser,\n  showToast\n}: {\n  tiers: LicenseTier[],\n  addTier: (t: Omit<LicenseTier, 'id'>) => void,\n  deleteTier: (id: string) => void,\n  licenses: License[],\n  currentUser: AppUser | null,\n  showToast: (msg: string, type: 'success'|'error') => void\n}) {",
  "  deleteTier,\n  editTier,\n  licenses,\n  currentUser,\n  showToast\n}: {\n  tiers: LicenseTier[],\n  addTier: (t: Omit<LicenseTier, 'id'>) => void,\n  deleteTier: (id: string) => void,\n  editTier: (id: string, updates: Partial<LicenseTier>) => void,\n  licenses: License[],\n  currentUser: AppUser | null,\n  showToast: (msg: string, type: 'success'|'error') => void\n}) {"
);

fs.writeFileSync('src/App.tsx', code);
