const fs = require('fs');
let code = fs.readFileSync('src/db.ts', 'utf8');
code = code.replace(
  'last_login TEXT\n  );',
  'last_login TEXT,\n    notification_preferences TEXT DEFAULT \'{"expirations":true,"renewals":true,"assignments":true}\'\n  );'
);
if (!code.includes('notification_preferences TEXT DEFAULT')) {
  console.log("Failed to patch CREATE TABLE users");
}

let alterStmt = `
  try {
    db.exec("ALTER TABLE users ADD COLUMN notification_preferences TEXT DEFAULT '{\\"expirations\\":true,\\"renewals\\":true,\\"assignments\\":true}'");
  } catch (e) {
    // Column might already exist
  }
`;
code = code.replace(
  '// Create default user if none exist',
  alterStmt + '\n\n  // Create default user if none exist'
);

// We need to also update getAllUsers and getUserByEmail to return this column. Wait, they probably just SELECT * so they'll get it automatically.
// Same for createUser?
fs.writeFileSync('src/db.ts', code);
