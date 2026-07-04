const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const thLicense = `
                  {visibleColumns.license && (
                    <th className="px-6 py-4 font-mono text-[10px] uppercase tracking-wider cursor-pointer hover:text-zinc-100" onClick={() => handleSort('license_key')}>
                      License / Tier
                      {sortConfig?.key === 'license_key' && (sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3 inline ml-1" /> : <ChevronDown className="w-3 h-3 inline ml-1" />)}
                    </th>
                  )}
`;
const thSoftware = `
                  {visibleColumns.software && (
                    <th className="px-6 py-4 font-mono text-[10px] uppercase tracking-wider cursor-pointer hover:text-zinc-100" onClick={() => handleSort('software_name')}>
                      Software / Fund
                      {sortConfig?.key === 'software_name' && (sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3 inline ml-1" /> : <ChevronDown className="w-3 h-3 inline ml-1" />)}
                    </th>
                  )}
`;
const thSecurity = `
                  {visibleColumns.security && <th className="px-6 py-4 font-mono text-[10px] uppercase tracking-wider">Security / Limits</th>}
`;
const thRisk = `
                  {visibleColumns.risk && (
                    <th className="px-6 py-4 font-mono text-[10px] uppercase tracking-wider cursor-pointer hover:text-zinc-100" onClick={() => handleSort('risk_score')}>
                      License Health
                      {sortConfig?.key === 'risk_score' && (sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3 inline ml-1" /> : <ChevronDown className="w-3 h-3 inline ml-1" />)}
                    </th>
                  )}
`;
const thEarnings = `
                  {visibleColumns.earnings && (
                    <th className="px-6 py-4 font-mono text-[10px] uppercase tracking-wider cursor-pointer hover:text-zinc-100" onClick={() => handleSort('current_earnings')}>
                      Client Earnings
                      {sortConfig?.key === 'current_earnings' && (sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3 inline ml-1" /> : <ChevronDown className="w-3 h-3 inline ml-1" />)}
                    </th>
                  )}
`;
const thStatus = `
                  {visibleColumns.status && (
                    <th className="px-6 py-4 font-mono text-[10px] uppercase tracking-wider cursor-pointer hover:text-zinc-100" onClick={() => handleSort('expires_at')}>
                      Status / Dates
                      {sortConfig?.key === 'expires_at' && (sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3 inline ml-1" /> : <ChevronDown className="w-3 h-3 inline ml-1" />)}
                    </th>
                  )}
`;

code = code.replace(
  '{visibleColumns.license && <th className="px-6 py-4 font-mono text-[10px] uppercase tracking-wider">License / Tier</th>}',
  thLicense
);
code = code.replace(
  '{visibleColumns.software && <th className="px-6 py-4 font-mono text-[10px] uppercase tracking-wider">Software / Fund</th>}',
  thSoftware
);
code = code.replace(
  '{visibleColumns.security && <th className="px-6 py-4 font-mono text-[10px] uppercase tracking-wider">Security / Limits</th>}',
  thSecurity
);
code = code.replace(
  '{visibleColumns.risk && <th className="px-6 py-4 font-mono text-[10px] uppercase tracking-wider">License Health</th>}',
  thRisk
);
code = code.replace(
  '{visibleColumns.earnings && <th className="px-6 py-4 font-mono text-[10px] uppercase tracking-wider">Client Earnings</th>}',
  thEarnings
);
code = code.replace(
  '{visibleColumns.status && <th className="px-6 py-4 font-mono text-[10px] uppercase tracking-wider">Status / Dates</th>}',
  thStatus
);

fs.writeFileSync('src/App.tsx', code);
