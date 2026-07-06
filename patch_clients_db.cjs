const Database = require('better-sqlite3');
const db = new Database('licenses.sqlite');

try {
  db.prepare("SELECT kyc_status FROM clients LIMIT 1").get();
} catch (e) {
  try {
    db.exec("ALTER TABLE clients ADD COLUMN kyc_status TEXT DEFAULT 'pending'");
    db.exec("ALTER TABLE clients ADD COLUMN company_registration_number TEXT");
    db.exec("ALTER TABLE clients ADD COLUMN tax_id TEXT");
    db.exec("ALTER TABLE clients ADD COLUMN risk_rating TEXT DEFAULT 'low'");
    db.exec("ALTER TABLE clients ADD COLUMN aml_status TEXT DEFAULT 'clear'");
    db.exec("ALTER TABLE clients ADD COLUMN kyc_notes TEXT");
    console.log("Migration successful");
  } catch (err) {
    console.error("Migration failed:", err);
  }
}
