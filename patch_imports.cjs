const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

code = code.replace(
  "Trash2,",
  "Trash2, Bell,"
);

fs.writeFileSync('src/App.tsx', code);
