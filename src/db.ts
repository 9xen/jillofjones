import Database from 'better-sqlite3';
import { License, LicenseEvent, Client, SoftwareProduct, LicenseTier, AppUser, AuditLog } from './types';

const db = new Database('licenses.sqlite', { verbose: console.log });
db.pragma('journal_mode = WAL');

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    user_name TEXT,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    details TEXT,
    timestamp TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS licenses (
    id TEXT PRIMARY KEY,
    software_name TEXT NOT NULL,
    tier TEXT NOT NULL,
    license_key TEXT NOT NULL,
    status TEXT NOT NULL,
    issued_to TEXT NOT NULL,
    hardware_id TEXT,
    ip_whitelist TEXT,
    features TEXT,
    max_volume_usd REAL,
    api_calls_limit INTEGER,
    api_calls_limit_monthly INTEGER DEFAULT 0,
    api_calls_limit_yearly INTEGER DEFAULT 0,
    api_calls_count_daily INTEGER DEFAULT 0,
    api_calls_count_monthly INTEGER DEFAULT 0,
    api_calls_count_yearly INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    product_price REAL,
    current_earnings REAL,
    daily_earnings REAL DEFAULT 0,
    weekly_earnings REAL DEFAULT 0,
    monthly_earnings REAL DEFAULT 0,
    last_active_ip TEXT,
    device_fingerprint TEXT,
    asset_classes TEXT,
    restricted_accounts TEXT,
    billing_cycle TEXT DEFAULT 'onetime',
    profit_share_pct REAL DEFAULT 15
  );

  CREATE TABLE IF NOT EXISTS license_events (
    id TEXT PRIMARY KEY,
    license_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    event_data TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    FOREIGN KEY(license_id) REFERENCES licenses(id)
  );

  -- Create Clients table
  CREATE TABLE IF NOT EXISTS clients (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    mobile TEXT NOT NULL,
    address TEXT NOT NULL,
    extra_info TEXT NOT NULL,
    kyc_status TEXT DEFAULT 'pending',
    company_registration_number TEXT,
    tax_id TEXT,
    risk_rating TEXT DEFAULT 'low',
    aml_status TEXT DEFAULT 'clear',
    kyc_notes TEXT
  );

  -- Create Software Products table
  CREATE TABLE IF NOT EXISTS software_products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    base_price REAL NOT NULL,
    version TEXT DEFAULT '1.0.0',
    status TEXT DEFAULT 'active',
    release_date TEXT DEFAULT '',
    maintenance_window TEXT DEFAULT '',
    support_level TEXT DEFAULT 'basic'
  );

  -- Create License Tiers table
  CREATE TABLE IF NOT EXISTS license_tiers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    max_volume_usd REAL NOT NULL,
    api_calls_limit INTEGER NOT NULL,
    api_calls_limit_monthly INTEGER NOT NULL DEFAULT 0,
    api_calls_limit_yearly INTEGER NOT NULL DEFAULT 0,
    description TEXT,
    features TEXT DEFAULT '[]',
    sla_guarantee TEXT DEFAULT 'none',
    support_type TEXT DEFAULT 'email',
    custom_fields TEXT DEFAULT '{}'
  );

  -- Create Audit Schedule table
  CREATE TABLE IF NOT EXISTS audit_schedule (
    id TEXT PRIMARY KEY,
    enabled INTEGER DEFAULT 0,
    recipients TEXT NOT NULL,
    dispatch_hour INTEGER DEFAULT 0,
    report_scope TEXT DEFAULT 'comprehensive',
    last_run_at TEXT,
    next_run_at TEXT
  );

  CREATE TABLE IF NOT EXISTS smtp_settings (
    id TEXT PRIMARY KEY,
    host TEXT NOT NULL,
    port INTEGER NOT NULL,
    user TEXT NOT NULL,
    pass TEXT NOT NULL,
    secure INTEGER DEFAULT 0,
    from_email TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS system_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS password_recovery_codes (
    email TEXT PRIMARY KEY COLLATE NOCASE,
    code TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS risk_snapshots (
    id TEXT PRIMARY KEY,
    avg_score REAL NOT NULL,
    critical_nodes INTEGER NOT NULL,
    total_nodes INTEGER NOT NULL,
    timestamp TEXT NOT NULL
  );

  -- Create Users table for RBAC
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL COLLATE NOCASE,
    password TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_login TEXT,
    notification_preferences TEXT DEFAULT '{"expirations":true,"renewals":true,"assignments":true}'
  );

  -- Seed Default Users (Passwords are 'admin123')
  INSERT OR IGNORE INTO users (id, name, email, password, role, created_at)
  VALUES 
    ('user_01', 'System Admin', 'admin@nonaxen.infra', '$2b$10$klPN26ona5o53jkn1j/vM.28EzGuX063Flv2B4CiBa2OhBOLkHE9K', 'Administrator', '2026-01-01T00:00:00Z');

  -- Ensure existing seeded users have the correct passwords
  UPDATE users SET password = '$2b$10$klPN26ona5o53jkn1j/vM.28EzGuX063Flv2B4CiBa2OhBOLkHE9K' WHERE id = 'user_01';
`);

// Migration: Add software_products columns if missing
const spColumns = db.prepare("PRAGMA table_info(software_products)").all() as any[];
const spColumnNames = spColumns.map(c => c.name);
if (!spColumnNames.includes('version')) db.exec("ALTER TABLE software_products ADD COLUMN version TEXT DEFAULT '1.0.0'");
if (!spColumnNames.includes('status')) db.exec("ALTER TABLE software_products ADD COLUMN status TEXT DEFAULT 'active'");
if (!spColumnNames.includes('release_date')) db.exec("ALTER TABLE software_products ADD COLUMN release_date TEXT DEFAULT ''");
if (!spColumnNames.includes('maintenance_window')) db.exec("ALTER TABLE software_products ADD COLUMN maintenance_window TEXT DEFAULT ''");
if (!spColumnNames.includes('support_level')) db.exec("ALTER TABLE software_products ADD COLUMN support_level TEXT DEFAULT 'basic'");

// Migration: Add license_tiers columns if missing
const ltColumns = db.prepare("PRAGMA table_info(license_tiers)").all() as any[];
const ltColumnNames = ltColumns.map(c => c.name);
if (!ltColumnNames.includes('features')) db.exec("ALTER TABLE license_tiers ADD COLUMN features TEXT DEFAULT '[]'");
if (!ltColumnNames.includes('sla_guarantee')) db.exec("ALTER TABLE license_tiers ADD COLUMN sla_guarantee TEXT DEFAULT 'none'");
if (!ltColumnNames.includes('support_type')) db.exec("ALTER TABLE license_tiers ADD COLUMN support_type TEXT DEFAULT 'email'");
if (!ltColumnNames.includes('custom_fields')) db.exec("ALTER TABLE license_tiers ADD COLUMN custom_fields TEXT DEFAULT '{}'");

// Migration: Add billing_cycle if missing
try {
  db.prepare("SELECT billing_cycle FROM licenses LIMIT 1").get();
} catch (e) {
  try {
    db.exec("ALTER TABLE licenses ADD COLUMN billing_cycle TEXT DEFAULT 'onetime'");
  } catch (err) {
    console.error("Migration failed:", err);
  }
}

// Migration: Add profit_share_pct if missing
try {
  db.prepare("SELECT profit_share_pct FROM licenses LIMIT 1").get();
} catch (e) {
  try {
    db.exec("ALTER TABLE licenses ADD COLUMN profit_share_pct REAL DEFAULT 15");
  } catch (err) {
    console.error("Migration failed for profit_share_pct:", err);
  }
}

// Seed default software products if empty
const softwareCount = (db.prepare('SELECT COUNT(*) as count FROM software_products').get() as any).count;
if (softwareCount === 0) {
  const insertProduct = db.prepare(`
    INSERT INTO software_products (id, name, description, base_price, version, status, release_date, maintenance_window, support_level)
    VALUES (@id, @name, @description, @base_price, @version, @status, @release_date, @maintenance_window, @support_level)
  `);
  
  insertProduct.run({
    id: 'prod_01',
    name: 'QuantMaster HFT',
    description: 'High-frequency trading terminal for multi-exchange arbitrage and low-latency order execution.',
    base_price: 15000,
    version: '2.4.1',
    status: 'active',
    release_date: '2026-01-15',
    maintenance_window: '02:00-03:00 UTC',
    support_level: 'enterprise'
  });

  insertProduct.run({
    id: 'prod_02',
    name: 'SentimentFlow AI',
    description: 'AI-driven sentiment analysis engine parsing real-time financial news, social feeds, and market announcements.',
    base_price: 4500,
    version: '1.2.0',
    status: 'active',
    release_date: '2026-03-10',
    maintenance_window: '04:00-04:30 UTC',
    support_level: 'premium'
  });

  insertProduct.run({
    id: 'prod_03',
    name: 'Nexus Arbitrage Core',
    description: 'Cross-asset triangular arbitrage core with direct market access (DMA) gateways.',
    base_price: 9500,
    version: '3.0.0-beta',
    status: 'beta',
    release_date: '2026-06-01',
    maintenance_window: '01:00-02:00 UTC',
    support_level: 'premium'
  });
}

// Seed default tiers if empty
const tierCount = (db.prepare('SELECT COUNT(*) as count FROM license_tiers').get() as any).count;
if (tierCount === 0) {
  const insertTier = db.prepare(`
    INSERT INTO license_tiers (id, name, max_volume_usd, api_calls_limit, api_calls_limit_monthly, api_calls_limit_yearly, description, features, sla_guarantee, support_type, custom_fields)
    VALUES (@id, @name, @max_volume_usd, @api_calls_limit, @api_calls_limit_monthly, @api_calls_limit_yearly, @description, @features, @sla_guarantee, @support_type, @custom_fields)
  `);

  insertTier.run({
    id: 'tier_01',
    name: 'Standard',
    max_volume_usd: 5000000,
    api_calls_limit: 10000,
    api_calls_limit_monthly: 250000,
    api_calls_limit_yearly: 3000000,
    description: 'Standard tier for emerging retail algorithmic funds.',
    features: JSON.stringify(['Sentiment']),
    sla_guarantee: '99.9%',
    support_type: 'email',
    custom_fields: JSON.stringify({ allowed_pairs: ['BTCUSD', 'ETHUSD'] })
  });

  insertTier.run({
    id: 'tier_02',
    name: 'Professional',
    max_volume_usd: 50000000,
    api_calls_limit: 50000,
    api_calls_limit_monthly: 1500000,
    api_calls_limit_yearly: 18000000,
    description: 'Professional tier for established boutique asset managers and active proprietary desks.',
    features: JSON.stringify(['Sentiment', 'HFT']),
    sla_guarantee: '99.95%',
    support_type: 'chat',
    custom_fields: JSON.stringify({ max_leverage: '20x', allowed_pairs: ['ALL'] })
  });

  insertTier.run({
    id: 'tier_03',
    name: 'Institutional',
    max_volume_usd: 1000000000,
    api_calls_limit: 500000,
    api_calls_limit_monthly: 15000000,
    api_calls_limit_yearly: 180000000,
    description: 'Institutional grade license for tier-1 funds, investment banks, and enterprise market makers.',
    features: JSON.stringify(['Sentiment', 'HFT', 'Dark Pool']),
    sla_guarantee: '99.99%',
    support_type: 'dedicated',
    custom_fields: JSON.stringify({ max_leverage: '100x', co_location: 'NY4/LD4' })
  });
}

// Seed default clients if empty
const clientCount = (db.prepare('SELECT COUNT(*) as count FROM clients').get() as any).count;
if (clientCount === 0) {
  const insertClient = db.prepare(`
    INSERT INTO clients (id, name, email, mobile, address, extra_info, kyc_status, company_registration_number, tax_id, risk_rating, aml_status, kyc_notes)
    VALUES (@id, @name, @email, @mobile, @address, @extra_info, @kyc_status, @company_registration_number, @tax_id, @risk_rating, @aml_status, @kyc_notes)
  `);

  insertClient.run({
    id: 'cli_01',
    name: 'Apex Capital Solutions',
    email: 'compliance@apexcap.io',
    mobile: '+1 (555) 019-2831',
    address: '120 Broadway, New York, NY 10271',
    extra_info: JSON.stringify({ founded: '2018', aum_millions: 450 }),
    kyc_status: 'approved',
    company_registration_number: 'CRN-984310-A',
    tax_id: 'TX-44-9812-C',
    risk_rating: 'low',
    aml_status: 'clear',
    kyc_notes: 'Full compliance audit completed. Beneficial owners verified.'
  });

  insertClient.run({
    id: 'cli_02',
    name: 'Blackwood Quantitative',
    email: 'ops@blackwoodquant.de',
    mobile: '+49 89 2019482',
    address: 'Maximilianstrasse 35, 80539 Munich, Germany',
    extra_info: JSON.stringify({ founded: '2021', aum_millions: 85 }),
    kyc_status: 'approved',
    company_registration_number: 'HRB-112233-M',
    tax_id: 'DE-99118833',
    risk_rating: 'medium',
    aml_status: 'clear',
    kyc_notes: 'EU regulated entity. Annual AML review passed.'
  });

  insertClient.run({
    id: 'cli_03',
    name: 'Suspect Trading Ltd',
    email: 'anonymous@hushmail.com',
    mobile: '+1 (555) 014-9922',
    address: 'Unknown, Tortola, British Virgin Islands',
    extra_info: JSON.stringify({ founded: '2025', aum_millions: 1.2 }),
    kyc_status: 'pending',
    company_registration_number: 'BVI-90124',
    tax_id: 'None',
    risk_rating: 'high',
    aml_status: 'flagged',
    kyc_notes: 'Flagged due to shell company structure in offshore jurisdiction and high-risk domain.'
  });
}

// Seed default licenses if empty
const licenseCount = (db.prepare('SELECT COUNT(*) as count FROM licenses').get() as any).count;
if (licenseCount === 0) {
  const insertLicense = db.prepare(`
    INSERT INTO licenses (id, software_name, tier, license_key, status, issued_to, hardware_id, ip_whitelist, features, max_volume_usd, api_calls_limit, api_calls_limit_monthly, api_calls_limit_yearly, api_calls_count_daily, api_calls_count_monthly, api_calls_count_yearly, created_at, expires_at, product_price, current_earnings, daily_earnings, weekly_earnings, monthly_earnings, last_active_ip, device_fingerprint, asset_classes, restricted_accounts, billing_cycle, profit_share_pct)
    VALUES (@id, @software_name, @tier, @license_key, @status, @issued_to, @hardware_id, @ip_whitelist, @features, @max_volume_usd, @api_calls_limit, @api_calls_limit_monthly, @api_calls_limit_yearly, @api_calls_count_daily, @api_calls_count_monthly, @api_calls_count_yearly, @created_at, @expires_at, @product_price, @current_earnings, @daily_earnings, @weekly_earnings, @monthly_earnings, @last_active_ip, @device_fingerprint, @asset_classes, @restricted_accounts, @billing_cycle, @profit_share_pct)
  `);

  insertLicense.run({
    id: 'lic_01',
    software_name: 'QuantMaster HFT',
    tier: 'Institutional',
    license_key: 'NX-HFT-INST-8843-9921-X',
    status: 'active',
    issued_to: 'Apex Capital Solutions',
    hardware_id: 'HWID-APEX-NY4-8891',
    ip_whitelist: '198.51.100.45, 198.51.100.46',
    features: JSON.stringify(['Sentiment', 'HFT', 'Dark Pool']),
    max_volume_usd: 1000000000,
    api_calls_limit: 500000,
    api_calls_limit_monthly: 15000000,
    api_calls_limit_yearly: 180000000,
    api_calls_count_daily: 24500,
    api_calls_count_monthly: 1205000,
    api_calls_count_yearly: 14500000,
    created_at: '2026-01-20T12:00:00Z',
    expires_at: '2027-01-20T12:00:00Z',
    product_price: 15000,
    current_earnings: 1254300,
    daily_earnings: 12300,
    weekly_earnings: 84500,
    monthly_earnings: 345000,
    last_active_ip: '198.51.100.45',
    device_fingerprint: 'FPR-APEX-9843-A',
    asset_classes: JSON.stringify(['forex', 'crypto']),
    restricted_accounts: JSON.stringify(['AC-APEX-01', 'AC-APEX-02']),
    billing_cycle: 'profit_share',
    profit_share_pct: 15
  });

  insertLicense.run({
    id: 'lic_02',
    software_name: 'SentimentFlow AI',
    tier: 'Professional',
    license_key: 'NX-SFLOW-PRO-1102-8833-Y',
    status: 'active',
    issued_to: 'Blackwood Quantitative',
    hardware_id: 'HWID-BLACKWOOD-1111',
    ip_whitelist: '192.0.2.1',
    features: JSON.stringify(['Sentiment', 'HFT']),
    max_volume_usd: 50000000,
    api_calls_limit: 50000,
    api_calls_limit_monthly: 1500000,
    api_calls_limit_yearly: 18000000,
    api_calls_count_daily: 4100,
    api_calls_count_monthly: 132000,
    api_calls_count_yearly: 1540000,
    created_at: '2026-03-15T08:30:00Z',
    expires_at: '2027-03-15T08:30:00Z',
    product_price: 4500,
    current_earnings: 87400,
    daily_earnings: 1450,
    weekly_earnings: 9800,
    monthly_earnings: 42500,
    last_active_ip: '192.0.2.1',
    device_fingerprint: 'FPR-BW-2019-B',
    asset_classes: JSON.stringify(['crypto', 'stocks']),
    restricted_accounts: JSON.stringify(['AC-BW-01']),
    billing_cycle: 'monthly',
    profit_share_pct: 15
  });

  insertLicense.run({
    id: 'lic_03',
    software_name: 'Nexus Arbitrage Core',
    tier: 'Professional',
    license_key: 'NX-NEXUS-PRO-9944-1249-Z',
    status: 'suspended',
    issued_to: 'Suspect Trading Ltd',
    hardware_id: 'HWID-SUSPECT-9999',
    ip_whitelist: '185.190.140.12',
    features: JSON.stringify(['Sentiment', 'HFT']),
    max_volume_usd: 50000000,
    api_calls_limit: 50000,
    api_calls_limit_monthly: 1500000,
    api_calls_limit_yearly: 18000000,
    api_calls_count_daily: 120,
    api_calls_count_monthly: 3200,
    api_calls_count_yearly: 12400,
    created_at: '2026-06-10T14:22:00Z',
    expires_at: '2026-12-10T14:22:00Z',
    product_price: 9500,
    current_earnings: 4300,
    daily_earnings: 0,
    weekly_earnings: 0,
    monthly_earnings: 4300,
    last_active_ip: '185.190.140.12',
    device_fingerprint: 'FPR-SUSPECT-3311-C',
    asset_classes: JSON.stringify(['forex', 'crypto', 'stocks']),
    restricted_accounts: JSON.stringify([]),
    billing_cycle: 'monthly',
    profit_share_pct: 15
  });

  // Seed default license events for DuckDB analytics!
  const insertEvent = db.prepare(`
    INSERT INTO license_events (id, license_id, event_type, event_data, timestamp)
    VALUES (@id, @license_id, @event_type, @event_data, @timestamp)
  `);

  insertEvent.run({
    id: 'ev_apex_01',
    license_id: 'lic_01',
    event_type: 'verification_success',
    event_data: JSON.stringify({ ip: '198.51.100.45', hardware_id: 'HWID-APEX-NY4-8891' }),
    timestamp: '2026-07-06T10:00:00Z'
  });

  insertEvent.run({
    id: 'ev_apex_02',
    license_id: 'lic_01',
    event_type: 'verification_success',
    event_data: JSON.stringify({ ip: '198.51.100.46', hardware_id: 'HWID-APEX-NY4-8891' }),
    timestamp: '2026-07-06T12:00:00Z'
  });

  insertEvent.run({
    id: 'ev_bw_01',
    license_id: 'lic_02',
    event_type: 'verification_success',
    event_data: JSON.stringify({ ip: '192.0.2.1', hardware_id: 'HWID-BLACKWOOD-1111' }),
    timestamp: '2026-07-06T09:00:00Z'
  });

  insertEvent.run({
    id: 'ev_sus_01',
    license_id: 'lic_03',
    event_type: 'verification_failed',
    event_data: JSON.stringify({ reason: 'IP not whitelisted', ip: '185.190.140.99', provided_hwid: 'HWID-SUSPECT-9999' }),
    timestamp: '2026-07-06T11:00:00Z'
  });

  insertEvent.run({
    id: 'ev_sus_02',
    license_id: 'lic_03',
    event_type: 'verification_failed',
    event_data: JSON.stringify({ reason: 'Hardware ID mismatch', ip: '185.190.140.12', provided_hwid: 'HWID-CLONED-DEVICE' }),
    timestamp: '2026-07-06T11:30:00Z'
  });

  insertEvent.run({
    id: 'ev_sus_03',
    license_id: 'lic_03',
    event_type: 'verification_failed',
    event_data: JSON.stringify({ reason: 'IP not whitelisted', ip: '109.244.12.5', provided_hwid: 'HWID-CLONED-DEVICE' }),
    timestamp: '2026-07-06T11:45:00Z'
  });
}

export function getAllLicenses(): License[] {
  return db.prepare('SELECT * FROM licenses ORDER BY created_at DESC').all() as License[];
}

export function createLicense(license: License): License {
  if (license.profit_share_pct === undefined) {
    license.profit_share_pct = 15;
  }
  const stmt = db.prepare(`
    INSERT INTO licenses (id, software_name, tier, license_key, status, issued_to, hardware_id, ip_whitelist, features, max_volume_usd, api_calls_limit, api_calls_limit_monthly, api_calls_limit_yearly, api_calls_count_daily, api_calls_count_monthly, api_calls_count_yearly, created_at, expires_at, product_price, current_earnings, daily_earnings, weekly_earnings, monthly_earnings, last_active_ip, device_fingerprint, asset_classes, restricted_accounts, billing_cycle, profit_share_pct)
    VALUES (@id, @software_name, @tier, @license_key, @status, @issued_to, @hardware_id, @ip_whitelist, @features, @max_volume_usd, @api_calls_limit, @api_calls_limit_monthly, @api_calls_limit_yearly, @api_calls_count_daily, @api_calls_count_monthly, @api_calls_count_yearly, @created_at, @expires_at, @product_price, @current_earnings, @daily_earnings, @weekly_earnings, @monthly_earnings, @last_active_ip, @device_fingerprint, @asset_classes, @restricted_accounts, @billing_cycle, @profit_share_pct)
  `);
  stmt.run(license);
  return license;
}

export function updateLicenseConfig(id: string, config: { 
  hardware_id: string | null, 
  ip_whitelist: string | null, 
  features: string, 
  max_volume_usd: number, 
  api_calls_limit: number,
  api_calls_limit_monthly: number,
  api_calls_limit_yearly: number,
  expires_at: string,
  asset_classes: string,
  restricted_accounts: string
}): void {
  const stmt = db.prepare(`
    UPDATE licenses 
    SET hardware_id = @hardware_id, 
        ip_whitelist = @ip_whitelist, 
        features = @features, 
        max_volume_usd = @max_volume_usd, 
        api_calls_limit = @api_calls_limit,
        api_calls_limit_monthly = @api_calls_limit_monthly,
        api_calls_limit_yearly = @api_calls_limit_yearly,
        expires_at = @expires_at,
        asset_classes = @asset_classes,
        restricted_accounts = @restricted_accounts
    WHERE id = @id
  `);
  stmt.run({ id, ...config });
}

export function incrementApiCalls(id: string, count: number): { daily: number, monthly: number, yearly: number } {
  db.prepare(`
    UPDATE licenses 
    SET api_calls_count_daily = api_calls_count_daily + ?,
        api_calls_count_monthly = api_calls_count_monthly + ?,
        api_calls_count_yearly = api_calls_count_yearly + ?
    WHERE id = ?
  `).run(count, count, count, id);
  
  const updated = db.prepare('SELECT api_calls_count_daily, api_calls_count_monthly, api_calls_count_yearly FROM licenses WHERE id = ?').get(id) as any;
  return {
    daily: updated.api_calls_count_daily,
    monthly: updated.api_calls_count_monthly,
    yearly: updated.api_calls_count_yearly
  };
}

export function getLicenseByKey(key: string): License | undefined {
  return db.prepare('SELECT * FROM licenses WHERE license_key = ?').get(key) as License | undefined;
}

export function updateLicenseEarnings(id: string, earnings: number, daily: number, weekly: number, monthly: number): void {
  const stmt = db.prepare('UPDATE licenses SET current_earnings = @earnings, daily_earnings = @daily, weekly_earnings = @weekly, monthly_earnings = @monthly WHERE id = @id');
  stmt.run({ id, earnings, daily, weekly, monthly });
}

export function updateLicenseStatus(id: string, status: string): void {
  const stmt = db.prepare('UPDATE licenses SET status = @status WHERE id = @id');
  stmt.run({ id, status });
}

export function extendLicenseExpiry(id: string, newExpiry: string): void {
  const stmt = db.prepare('UPDATE licenses SET expires_at = @newExpiry WHERE id = @id');
  stmt.run({ id, newExpiry });
}

export function updateLicenseHWID(id: string, hwid: string): void {
  const stmt = db.prepare('UPDATE licenses SET hardware_id = @hwid WHERE id = @id');
  stmt.run({ id, hwid });
}

export function updateLicenseLastActive(id: string, last_ip: string): void {
  const stmt = db.prepare('UPDATE licenses SET last_active_ip = @last_ip WHERE id = @id');
  stmt.run({ id, last_ip });
}

export function updateLicenseDetails(id: string, updates: Partial<License>): void {
  const allowedKeys = [
    'software_name', 'tier', 'license_key', 'status', 'issued_to', 
    'hardware_id', 'ip_whitelist', 'features', 'max_volume_usd', 
    'api_calls_limit', 'api_calls_limit_monthly', 'api_calls_limit_yearly',
    'api_calls_count_daily', 'api_calls_count_monthly', 'api_calls_count_yearly',
    'expires_at', 'product_price', 'current_earnings', 'daily_earnings',
    'weekly_earnings', 'monthly_earnings', 'last_active_ip', 
    'device_fingerprint', 'asset_classes', 'restricted_accounts',
    'billing_cycle', 'profit_share_pct'
  ];
  const fields = [];
  const values = [];
  for (const [key, value] of Object.entries(updates)) {
    if (allowedKeys.includes(key)) {
      fields.push(`${key} = ?`);
      values.push(value);
    }
  }
  if (fields.length === 0) return;
  values.push(id);
  db.prepare(`UPDATE licenses SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

export function deleteLicense(id: string): void {
  const stmt = db.prepare('DELETE FROM licenses WHERE id = @id');
  stmt.run({ id });
}

export function batchUpdateLicenses(ids: string[], updates: {
  expires_at?: string;
  max_volume_usd?: number;
  api_calls_limit?: number;
  api_calls_limit_monthly?: number;
  api_calls_limit_yearly?: number;
  billing_cycle?: string;
  profit_share_pct?: number;
  status?: string;
  features?: string;
  asset_classes?: string;
  restricted_accounts?: string;
}): void {
  if (ids.length === 0 || Object.keys(updates).length === 0) return;
  
  const allowedKeys = [
    'expires_at', 'max_volume_usd', 'api_calls_limit', 
    'api_calls_limit_monthly', 'api_calls_limit_yearly', 
    'billing_cycle', 'profit_share_pct', 'status', 'features', 'asset_classes', 'restricted_accounts'
  ];
  
  const keys = Object.keys(updates).filter(k => allowedKeys.includes(k) && updates[k as keyof typeof updates] !== undefined);
  if (keys.length === 0) return;

  const setString = keys.map(k => `${k} = @${k}`).join(', ');
  const params: Record<string, any> = {};
  keys.forEach(k => {
    params[k] = updates[k as keyof typeof updates];
  });
  
  const stmt = db.prepare(`UPDATE licenses SET ${setString} WHERE id = @id`);
  
  const transaction = db.transaction((licenseIds: string[]) => {
    for (const id of licenseIds) {
      stmt.run({ id, ...params });
    }
  });
  
  transaction(ids);
}

export function logLicenseEvent(event: LicenseEvent): void {
  const stmt = db.prepare(`
    INSERT INTO license_events (id, license_id, event_type, event_data, timestamp)
    VALUES (@id, @license_id, @event_type, @event_data, @timestamp)
  `);
  stmt.run(event);
}

export function getLicenseEvents(licenseId: string): LicenseEvent[] {
  return db.prepare('SELECT * FROM license_events WHERE license_id = ? ORDER BY timestamp DESC LIMIT 50').all(licenseId) as LicenseEvent[];
}

export function getAllEvents(): LicenseEvent[] {
  return db.prepare('SELECT * FROM license_events ORDER BY timestamp DESC LIMIT 100').all() as LicenseEvent[];
}

export function getFailedVerificationsInLastHour(licenseId: string, sinceISOString: string): number {
  const row = db.prepare(`
    SELECT COUNT(*) as count 
    FROM license_events 
    WHERE license_id = ? 
      AND event_type = 'verification_failed' 
      AND timestamp >= ?
  `).get(licenseId, sinceISOString) as { count: number } | undefined;
  return row ? row.count : 0;
}

// Client Database Operations
export function getAllClients(): Client[] {
  return db.prepare('SELECT * FROM clients ORDER BY name ASC').all() as Client[];
}

export function createClient(client: Client): Client {
  if (!client.kyc_status) client.kyc_status = 'pending';
  if (!client.risk_rating) client.risk_rating = 'low';
  if (!client.aml_status) client.aml_status = 'clear';
  const stmt = db.prepare(`
    INSERT INTO clients (id, name, email, mobile, address, extra_info, kyc_status, company_registration_number, tax_id, risk_rating, aml_status, kyc_notes)
    VALUES (@id, @name, @email, @mobile, @address, @extra_info, @kyc_status, @company_registration_number, @tax_id, @risk_rating, @aml_status, @kyc_notes)
  `);
  stmt.run(client);
  return client;
}

export function updateClient(id: string, updates: Partial<Client>): void {
  const allowedKeys = [
    'name', 'email', 'mobile', 'address', 'extra_info', 
    'kyc_status', 'company_registration_number', 'tax_id', 
    'risk_rating', 'aml_status', 'kyc_notes'
  ];
  const fields = [];
  const values = [];
  for (const [key, value] of Object.entries(updates)) {
    if (allowedKeys.includes(key)) {
      fields.push(`${key} = ?`);
      values.push(key === 'extra_info' && typeof value !== 'string' ? JSON.stringify(value) : value);
    }
  }
  if (fields.length === 0) return;
  values.push(id);
  db.prepare(`UPDATE clients SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

export function deleteClient(id: string): void {
  const stmt = db.prepare('DELETE FROM clients WHERE id = ?');
  stmt.run(id);
}

// Software Product Database Operations
export function getAllSoftwareProducts(): SoftwareProduct[] {
  return db.prepare('SELECT * FROM software_products ORDER BY name ASC').all() as SoftwareProduct[];
}

export function createSoftwareProduct(product: SoftwareProduct): SoftwareProduct {
  const stmt = db.prepare(`
    INSERT INTO software_products (id, name, description, base_price, version, status, release_date, maintenance_window, support_level)
    VALUES (@id, @name, @description, @base_price, @version, @status, @release_date, @maintenance_window, @support_level)
  `);
  stmt.run(product);
  return product;
}

export function updateSoftwareProduct(id: string, updates: Partial<SoftwareProduct>): void {
  const allowedKeys = ['name', 'description', 'base_price', 'version', 'status', 'release_date', 'maintenance_window', 'support_level'];
  const fields = [];
  const values = [];
  for (const [key, value] of Object.entries(updates)) {
    if (allowedKeys.includes(key)) {
      fields.push(`${key} = ?`);
      values.push(value);
    }
  }
  if (fields.length === 0) return;
  values.push(id);
  db.prepare(`UPDATE software_products SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

export function deleteSoftwareProduct(id: string): void {
  const stmt = db.prepare('DELETE FROM software_products WHERE id = ?');
  stmt.run(id);
}

export function getSoftwareProductById(id: string): SoftwareProduct | undefined {
  return db.prepare('SELECT * FROM software_products WHERE id = ?').get(id) as SoftwareProduct | undefined;
}

// License Tier Database Operations
export function getAllLicenseTiers(): LicenseTier[] {
  return db.prepare('SELECT * FROM license_tiers ORDER BY max_volume_usd ASC').all() as LicenseTier[];
}

export function getLicenseTierById(id: string): LicenseTier | undefined {
  return db.prepare('SELECT * FROM license_tiers WHERE id = ?').get(id) as LicenseTier | undefined;
}

export function createLicenseTier(tier: LicenseTier): LicenseTier {
  const stmt = db.prepare(`
    INSERT INTO license_tiers (id, name, max_volume_usd, api_calls_limit, api_calls_limit_monthly, api_calls_limit_yearly, description, features, sla_guarantee, support_type, custom_fields)
    VALUES (@id, @name, @max_volume_usd, @api_calls_limit, @api_calls_limit_monthly, @api_calls_limit_yearly, @description, @features, @sla_guarantee, @support_type, @custom_fields)
  `);
  stmt.run(tier);
  return tier;
}

export function updateLicenseTier(id: string, updates: Partial<LicenseTier>): void {
  const allowedKeys = [
    'name', 'max_volume_usd', 'api_calls_limit', 
    'api_calls_limit_monthly', 'api_calls_limit_yearly', 'description',
    'features', 'sla_guarantee', 'support_type', 'custom_fields'
  ];
  const fields = [];
  const values = [];
  for (const [key, value] of Object.entries(updates)) {
    if (allowedKeys.includes(key)) {
      fields.push(`${key} = ?`);
      values.push(value);
    }
  }
  if (fields.length === 0) return;
  values.push(id);
  db.prepare(`UPDATE license_tiers SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

export function deleteLicenseTier(id: string): void {
  const stmt = db.prepare('DELETE FROM license_tiers WHERE id = ?');
  stmt.run(id);
}

// Seed default audit schedule if empty
const auditScheduleCount = (db.prepare("SELECT COUNT(*) as count FROM audit_schedule").get() as any).count;
if (auditScheduleCount === 0) {
  db.prepare(`
    INSERT OR IGNORE INTO audit_schedule (id, enabled, recipients, dispatch_hour, report_scope, last_run_at, next_run_at)
    VALUES ('default', 1, 'secops@nonaxen.infra, compliance@nonaxen.infra', 9, 'comprehensive', NULL, '2026-08-01T09:00:00Z')
  `).run();
}

export function getAuditSchedule(): any {
  return db.prepare('SELECT * FROM audit_schedule WHERE id = ?').get('default');
}

export function updateAuditSchedule(schedule: { enabled: number, recipients: string, dispatch_hour: number, report_scope: string, next_run_at: string | null, last_run_at?: string | null }): void {
  const stmt = db.prepare(`
    UPDATE audit_schedule 
    SET enabled = @enabled, 
        recipients = @recipients, 
        dispatch_hour = @dispatch_hour, 
        report_scope = @report_scope, 
        next_run_at = @next_run_at
    WHERE id = 'default'
  `);
  stmt.run(schedule);
}

export function logAuditRun(last_run_at: string, next_run_at: string): void {
  const stmt = db.prepare('UPDATE audit_schedule SET last_run_at = ?, next_run_at = ? WHERE id = ?');
  stmt.run(last_run_at, next_run_at, 'default');
}

// User Database Operations
export function getAllUsers(): AppUser[] {
  return db.prepare('SELECT * FROM users ORDER BY created_at DESC').all() as AppUser[];
}

export function getUserById(id: string): AppUser | undefined {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as AppUser | undefined;
}

export function getUserByEmail(email: string): AppUser | undefined {
  const row = db.prepare('SELECT id, name, email, role, created_at FROM users WHERE email = ?').get(email) as any;
  return row as AppUser | undefined;
}

export function getUserWithPasswordByEmail(email: string): (AppUser & { password: string }) | undefined {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email) as (AppUser & { password: string }) | undefined;
}

export function updateLastLogin(id: string): void {
  db.prepare('UPDATE users SET last_login = ? WHERE id = ?').run(new Date().toISOString(), id);
}

export function createUser(user: AppUser & { password?: string }): AppUser {
  const stmt = db.prepare(`
    INSERT INTO users (id, name, email, password, role, created_at)
    VALUES (@id, @name, @email, @password, @role, @created_at)
  `);
  stmt.run({ ...user, password: user.password || '' });
  return user;
}

export function updateUserRole(id: string, role: string): void {
  const stmt = db.prepare('UPDATE users SET role = ? WHERE id = ?');
  stmt.run(role, id);
}

export function deleteUser(id: string): void {
  const stmt = db.prepare('DELETE FROM users WHERE id = ?');
  stmt.run(id);
}

// Audit Log Database Operations
export function getAllAuditLogs(): AuditLog[] {
  return db.prepare('SELECT * FROM audit_logs ORDER BY timestamp DESC').all() as AuditLog[];
}

export function createAuditLog(log: AuditLog): void {
  const stmt = db.prepare(`
    INSERT INTO audit_logs (id, user_id, user_name, action, entity_type, entity_id, details, timestamp)
    VALUES (@id, @user_id, @user_name, @action, @entity_type, @entity_id, @details, @timestamp)
  `);
  stmt.run(log);
}

// SMTP Settings Database Operations
export function getSMTPSettings() {
  return db.prepare('SELECT * FROM smtp_settings LIMIT 1').get() as any;
}

export function updateSMTPSettings(settings: any) {
  db.prepare('DELETE FROM smtp_settings').run();
  const stmt = db.prepare(`
    INSERT INTO smtp_settings (id, host, port, user, pass, secure, from_email)
    VALUES (@id, @host, @port, @user, @pass, @secure, @from_email)
  `);
  stmt.run({ ...settings, id: 'main' });
}

// System Config Operations
export function getSystemConfig(key: string): string | null {
  const row = db.prepare('SELECT value FROM system_config WHERE key = ?').get(key) as any;
  return row ? row.value : null;
}

export function setSystemConfig(key: string, value: string): void {
  db.prepare('INSERT OR REPLACE INTO system_config (key, value) VALUES (?, ?)').run(key, value);
}

// Password Recovery Database Operations
export function saveRecoveryCode(email: string, code: string, expiresAt: string): void {
  db.prepare('INSERT OR REPLACE INTO password_recovery_codes (email, code, expires_at) VALUES (?, ?, ?)').run(email, code, expiresAt);
}

export function getRecoveryCode(email: string): { code: string, expires_at: string } | undefined {
  return db.prepare('SELECT * FROM password_recovery_codes WHERE email = ?').get(email) as { code: string; expires_at: string } | undefined;
}

export function deleteRecoveryCode(email: string): void {
  db.prepare('DELETE FROM password_recovery_codes WHERE email = ?').run(email);
}

export function updateUserPassword(email: string, passwordHash: string): void {
  db.prepare('UPDATE users SET password = ? WHERE email = ?').run(passwordHash, email);
}

export function checkSQLiteHealth() {
  try {
    const result = db.pragma('integrity_check', { simple: true });
    const tableCount = (db.prepare("SELECT count(*) as count FROM sqlite_master WHERE type='table'").get() as any).count;
    const connectionStatus = db.open ? 'healthy' : 'disconnected';
    
    return {
      status: result === 'ok' ? 'healthy' : 'corrupted',
      tables: tableCount,
      journal_mode: db.pragma('journal_mode', { simple: true }),
      open: db.open,
      connectionStatus
    };
  } catch (err) {
    return {
      status: 'error',
      error: (err as Error).message,
      connectionStatus: 'error'
    };
  }
}



export function updateUserPreferences(id: string, preferences: string): AppUser {
  const stmt = db.prepare('UPDATE users SET notification_preferences = ? WHERE id = ? RETURNING *');
  return stmt.get(preferences, id) as AppUser;
}

export function createRiskSnapshot(snapshot: { id: string, avg_score: number, critical_nodes: number, total_nodes: number, timestamp: string }): void {
  const stmt = db.prepare(`
    INSERT INTO risk_snapshots (id, avg_score, critical_nodes, total_nodes, timestamp)
    VALUES (@id, @avg_score, @critical_nodes, @total_nodes, @timestamp)
  `);
  stmt.run(snapshot);
}

export function getRiskSnapshots(limit: number = 24): any[] {
  return db.prepare('SELECT * FROM risk_snapshots ORDER BY timestamp DESC LIMIT ?').all(limit);
}
