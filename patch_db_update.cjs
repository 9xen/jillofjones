const fs = require('fs');
let code = fs.readFileSync('src/db.ts', 'utf8');

const updateFn = `
export function updateUserPreferences(id: string, preferences: string): AppUser {
  const stmt = db.prepare('UPDATE users SET notification_preferences = ? WHERE id = ? RETURNING *');
  return stmt.get(preferences, id) as AppUser;
}
`;

code = code + '\n' + updateFn;
fs.writeFileSync('src/db.ts', code);
