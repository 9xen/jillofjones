const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

code = code.replace(
  "    socket.on('clients:deleted', (id: string) => {\n      setClients(prev => prev.filter(c => c.id !== id));\n    });",
  "    socket.on('clients:deleted', (id: string) => {\n      setClients(prev => prev.filter(c => c.id !== id));\n    });\n\n    socket.on('clients:updated', ({ id, updates }) => {\n      setClients(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));\n    });"
);

code = code.replace(
  "    socket.on('software_products:deleted', (id: string) => {\n      setSoftwareProducts(prev => prev.filter(p => p.id !== id));\n    });",
  "    socket.on('software_products:deleted', (id: string) => {\n      setSoftwareProducts(prev => prev.filter(p => p.id !== id));\n    });\n\n    socket.on('software_products:updated', ({ id, updates }) => {\n      setSoftwareProducts(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));\n    });"
);

code = code.replace(
  "    socket.on('license_tiers:deleted', (id: string) => {\n      setLicenseTiers(prev => prev.filter(t => t.id !== id));\n    });",
  "    socket.on('license_tiers:deleted', (id: string) => {\n      setLicenseTiers(prev => prev.filter(t => t.id !== id));\n    });\n\n    socket.on('license_tiers:updated', ({ id, updates }) => {\n      setLicenseTiers(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));\n    });"
);

fs.writeFileSync('src/App.tsx', code);
