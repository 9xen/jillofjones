const fs = require('fs');
let code = fs.readFileSync('src/db.ts', 'utf8');

code = code.replace(
  "export function deleteLicense(id: string): void {",
  `export function updateLicenseDetails(id: string, updates: Partial<License>): void {
  const fields = [];
  const values = [];
  for (const [key, value] of Object.entries(updates)) {
    if (key !== 'id' && key !== 'created_at' && key !== 'license_key') {
      fields.push(\`\${key} = ?\`);
      values.push(value);
    }
  }
  if (fields.length === 0) return;
  values.push(id);
  db.prepare(\`UPDATE licenses SET \${fields.join(', ')} WHERE id = ?\`).run(...values);
}

export function deleteLicense(id: string): void {`
);

fs.writeFileSync('src/db.ts', code);
