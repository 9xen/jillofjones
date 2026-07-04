const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

code = code.replace(
  "version: '', base_price: 5000",
  "base_price: 5000"
);

code = code.replace(
  "version: prod.version || '',\n",
  ""
);

code = code.replace(
  "version: '', base_price: 10000",
  "base_price: 10000"
);

fs.writeFileSync('src/App.tsx', code);
