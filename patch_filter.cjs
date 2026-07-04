const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const filterCode = `
  const filteredLicenses = licenses.filter(l => {
    const matchesSearch = l.issued_to.toLowerCase().includes(search.toLowerCase()) || 
                          l.license_key.toLowerCase().includes(search.toLowerCase()) ||
                          l.software_name.toLowerCase().includes(search.toLowerCase()) ||
                          (l.hardware_id?.toLowerCase().includes(search.toLowerCase()) ?? false) ||
                          (l.ip_whitelist?.toLowerCase().includes(search.toLowerCase()) ?? false);
    const matchesStatus = filterStatus === 'all' ? l.status !== 'archived' : l.status === filterStatus;
    
    const dateValue = new Date(l[dateRange.type]);
    const matchesDate = (!dateRange.start || dateValue >= new Date(dateRange.start)) &&
                        (!dateRange.end || dateValue <= new Date(dateRange.end));
    
    return matchesSearch && matchesStatus && matchesDate;
  }).sort((a, b) => {
    if (!sortConfig) return 0;
    const { key, direction } = sortConfig;
    let aValue = a[key as keyof License] ?? '';
    let bValue = b[key as keyof License] ?? '';

    // special handling for risk score
    if (key === 'risk_score') {
      aValue = duckDBRiskScores[a.id]?.risk_score || calculateRiskScore(a);
      bValue = duckDBRiskScores[b.id]?.risk_score || calculateRiskScore(b);
    }
    
    if (aValue < bValue) {
      return direction === 'asc' ? -1 : 1;
    }
    if (aValue > bValue) {
      return direction === 'asc' ? 1 : -1;
    }
    return 0;
  });

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };
`;

code = code.replace(
  `  const filteredLicenses = licenses.filter(l => {
    const matchesSearch = l.issued_to.toLowerCase().includes(search.toLowerCase()) || 
                          l.license_key.toLowerCase().includes(search.toLowerCase()) ||
                          l.software_name.toLowerCase().includes(search.toLowerCase()) ||
                          (l.hardware_id?.toLowerCase().includes(search.toLowerCase()) ?? false) ||
                          (l.ip_whitelist?.toLowerCase().includes(search.toLowerCase()) ?? false);
    const matchesStatus = filterStatus === 'all' ? l.status !== 'archived' : l.status === filterStatus;
    
    const dateValue = new Date(l[dateRange.type]);
    const matchesDate = (!dateRange.start || dateValue >= new Date(dateRange.start)) &&
                        (!dateRange.end || dateValue <= new Date(dateRange.end));
    
    return matchesSearch && matchesStatus && matchesDate;
  });`,
  filterCode
);

fs.writeFileSync('src/App.tsx', code);
