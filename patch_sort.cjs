const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const sortState = `
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);
`;

code = code.replace(
  "const [selectedLicenses, setSelectedLicenses] = useState<Set<string>>(new Set());",
  "const [selectedLicenses, setSelectedLicenses] = useState<Set<string>>(new Set());\n" + sortState
);

fs.writeFileSync('src/App.tsx', code);
