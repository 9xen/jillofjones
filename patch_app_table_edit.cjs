const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const editBtn = `
                                <button onClick={(e) => { 
                                  e.stopPropagation(); 
                                  setEditingMainLicense(license);
                                  setIsCreateModalOpen(true);
                                }} className="p-1.5 text-zinc-400 hover:text-indigo-400 hover:bg-indigo-500/10 rounded transition-colors border border-transparent hover:border-indigo-500/20" title="Edit details">
                                  <SlidersHorizontal className="w-4 h-4" />
                                </button>
`;

code = code.replace(
  '                                <div className="w-px h-4 bg-zinc-800 mx-1"></div>\n                                <button onClick={(e) => { e.stopPropagation(); deleteLicense(license.id); }}',
  '                                <div className="w-px h-4 bg-zinc-800 mx-1"></div>\n' + editBtn + '                                <button onClick={(e) => { e.stopPropagation(); deleteLicense(license.id); }}'
);

fs.writeFileSync('src/App.tsx', code);
