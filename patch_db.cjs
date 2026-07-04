const fs = require('fs');
let code = fs.readFileSync('src/db.ts', 'utf8');

code = code.replace(
  "export function deleteClient(id: string): void {",
  `export function updateClient(id: string, updates: Partial<Client>): void {
  const fields = [];
  const values = [];
  for (const [key, value] of Object.entries(updates)) {
    if (key !== 'id' && key !== 'created_at') {
      fields.push(\`\${key} = ?\`);
      values.push(key === 'extra_info' && typeof value !== 'string' ? JSON.stringify(value) : value);
    }
  }
  if (fields.length === 0) return;
  values.push(id);
  db.prepare(\`UPDATE clients SET \${fields.join(', ')} WHERE id = ?\`).run(...values);
}

export function deleteClient(id: string): void {`
);

code = code.replace(
  "export function deleteSoftwareProduct(id: string): void {",
  `export function updateSoftwareProduct(id: string, updates: Partial<SoftwareProduct>): void {
  const fields = [];
  const values = [];
  for (const [key, value] of Object.entries(updates)) {
    if (key !== 'id' && key !== 'created_at') {
      fields.push(\`\${key} = ?\`);
      values.push(value);
    }
  }
  if (fields.length === 0) return;
  values.push(id);
  db.prepare(\`UPDATE software_products SET \${fields.join(', ')} WHERE id = ?\`).run(...values);
}

export function deleteSoftwareProduct(id: string): void {`
);

code = code.replace(
  "export function deleteLicenseTier(id: string): void {",
  `export function updateLicenseTier(id: string, updates: Partial<LicenseTier>): void {
  const fields = [];
  const values = [];
  for (const [key, value] of Object.entries(updates)) {
    if (key !== 'id' && key !== 'created_at') {
      fields.push(\`\${key} = ?\`);
      values.push(value);
    }
  }
  if (fields.length === 0) return;
  values.push(id);
  db.prepare(\`UPDATE license_tiers SET \${fields.join(', ')} WHERE id = ?\`).run(...values);
}

export function deleteLicenseTier(id: string): void {`
);

fs.writeFileSync('src/db.ts', code);
