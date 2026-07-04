const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

code = code.replace(
  '            deleteClient={removeClient} ',
  '            deleteClient={removeClient} \n            editClient={editClient}'
);

code = code.replace(
  'function FundsView({ \n  clients, \n  addClient, \n  deleteClient, \n  licenses, \n  currentUser,\n  showToast \n}: { \n  clients: Client[], \n  addClient: (c: Omit<Client, \\\'id\\\'>) => void, \n  deleteClient: (id: string) => void, ',
  'function FundsView({ \n  clients, \n  addClient, \n  deleteClient, \n  editClient, \n  licenses, \n  currentUser,\n  showToast \n}: { \n  clients: Client[], \n  addClient: (c: Omit<Client, \\\'id\\\'>) => void, \n  deleteClient: (id: string) => void, \n  editClient: (id: string, updates: Partial<Client>) => void, '
);

fs.writeFileSync('src/App.tsx', code);
