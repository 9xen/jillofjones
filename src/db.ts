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
    restricted_accounts TEXT
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
    extra_info TEXT NOT NULL
  );

  -- Create Software Products table
  CREATE TABLE IF NOT EXISTS software_products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    base_price REAL NOT NULL
  );

  -- Create License Tiers table
  DROP TABLE IF EXISTS license_tiers;
  CREATE TABLE license_tiers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    max_volume_usd REAL NOT NULL,
    api_calls_limit INTEGER NOT NULL,
    api_calls_limit_monthly INTEGER NOT NULL DEFAULT 0,
    api_calls_limit_yearly INTEGER NOT NULL DEFAULT 0,
    description TEXT
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
    email TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );

  -- Create Users table for RBAC
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_login TEXT
  );

  -- Seed Default Users (Passwords are 'admin123', 'manager123', 'auditor123')
  INSERT OR IGNORE INTO users (id, name, email, password, role, created_at)
  VALUES 
    ('user_01', 'System Admin', 'admin@quantfund.net', '$2a$10$zR8WfJb.fB6iG7KjP9q1u.7x6f5g4h3j2k1l0m9n8b7v6c5x4z3y2', 'Administrator', '2026-01-01T00:00:00Z'),
    ('user_02', 'License Manager', 'manager@quantfund.net', '$2a$10$zR8WfJb.fB6iG7KjP9q1u.7x6f5g4h3j2k1l0m9n8b7v6c5x4z3y2', 'Manager', '2026-01-10T00:00:00Z'),
    ('user_03', 'Compliance Auditor', 'auditor@quantfund.net', '$2a$10$zR8WfJb.fB6iG7KjP9q1u.7x6f5g4h3j2k1l0m9n8b7v6c5x4z3y2', 'Auditor', '2026-02-01T00:00:00Z');

  -- Seed Default Licenses
  INSERT OR IGNORE INTO licenses (id, software_name, tier, license_key, status, issued_to, hardware_id, ip_whitelist, features, max_volume_usd, api_calls_limit, api_calls_limit_monthly, api_calls_limit_yearly, api_calls_count_daily, api_calls_count_monthly, api_calls_count_yearly, created_at, expires_at, product_price, current_earnings, daily_earnings, weekly_earnings, monthly_earnings, last_active_ip, device_fingerprint, asset_classes, restricted_accounts)
  VALUES 
    ('lic_01', 'HFT Terminal Alpha', 'Institutional', 'sk_live_HFT_Alpha_001', 'active', 'Polaris Hedge Fund', 'HWID-POLARIS-9832', '192.168.1.100,203.0.113.5', '["HFT_CORE", "MAX_LEVERAGE_100x"]', 10000000, 50000, 1500000, 18000000, 1205, 34910, 412095, '2026-01-15T08:00:00Z', '2027-01-15T08:00:00Z', 12500, 3849.20, 10.5, 75.3, 310.2, '203.0.113.5', 'FP-POLARIS-X', '["forex", "stocks"]', '["ACC-12345", "ACC-67890"]'),
    ('lic_02', 'Arbitrage Bot v4', 'Professional', 'sk_live_ArbBot_002', 'active', 'Aether Capital', 'HWID-AETHER-2349', '198.51.100.22', '["ARB_STANDARD", "MULTI_EXCHANGE"]', 2000000, 25000, 750000, 9000000, 485, 12904, 150931, '2026-03-10T10:30:00Z', '2026-09-10T10:30:00Z', 4500, 129.50, 2.1, 14.8, 55.4, '198.51.100.22', 'FP-AETHER-4', '["crypto"]', '["BINANCE-API-KEY-HASH-001"]'),
    ('lic_03', 'Trend Follower Core', 'Starter', 'sk_live_Trend_003', 'suspended', 'Nova Alpha', 'HWID-NOVA-8822', '203.0.113.99', '["TREND_INDICATORS"]', 500000, 10000, 300000, 3600000, 0, 0, 0, '2026-05-01T14:15:00Z', '2026-11-01T14:15:00Z', 1200, 0.00, 0, 0, 0, '203.0.113.99', 'FP-NOVA-Z', '["forex"]', '[]'),
    ('lic_04', 'HFT Terminal Alpha', 'Institutional', 'sk_live_HFT_Alpha_004', 'active', 'BlackWood Trust', 'HWID-BLACKWOOD-1111', '192.0.2.1', '["HFT_CORE"]', 5000000, 30000, 900000, 10800000, 29014, 895310, 10795320, '2026-02-20T09:00:00Z', '2027-02-20T09:00:00Z', 9500, 5521.80, 24.5, 145.2, 590.5, '192.0.2.1', 'FP-BLACKWOOD-1', '["stocks"]', '["NY-TICKER-FEED-001"]'),
    ('lic_05', 'Market Maker Pro', 'Professional', 'sk_live_MMPro_005', 'active', 'Orion Capital', 'HWID-ORION-5555', '198.51.100.5', '["MARKET_MAKER_CORE", "LOW_LATENCY_API"]', 4000000, 40000, 1200000, 14400000, 895, 25612, 309485, '2026-04-05T11:00:00Z', '2026-10-05T11:00:00Z', 6000, 3200.00, 15.2, 98.4, 380.1, '198.51.100.5', 'FP-ORION-A', '["crypto", "forex"]', '["BYBIT-001", "MT5-998877"]');

  -- Seed Default Verification Events
  INSERT OR IGNORE INTO license_events (id, license_id, event_type, event_data, timestamp)
  VALUES
    ('ev_01', 'lic_01', 'verification_success', '{"ip":"203.0.113.5","hardware_id":"HWID-POLARIS-9832"}', '2026-06-25T10:00:00Z'),
    ('ev_02', 'lic_02', 'verification_success', '{"ip":"198.51.100.22","hardware_id":"HWID-AETHER-2349"}', '2026-06-25T11:00:00Z'),
    
    -- lic_04 triggers risk events (Failed pings, IP changes, hardware ID inconsistency)
    ('ev_03', 'lic_04', 'verification_success', '{"ip":"192.0.2.1","hardware_id":"HWID-BLACKWOOD-1111"}', '2026-06-26T08:00:00Z'),
    ('ev_04', 'lic_04', 'verification_failed', '{"reason":"IP not whitelisted","ip":"192.0.2.99","hardware_id":"HWID-BLACKWOOD-1111"}', '2026-06-26T09:30:00Z'),
    ('ev_05', 'lic_04', 'verification_failed', '{"reason":"Hardware ID mismatch","ip":"192.0.2.1","hardware_id":"HWID-SUSPECT-9999"}', '2026-06-26T12:00:00Z'),
    ('ev_06', 'lic_04', 'verification_failed', '{"reason":"IP not whitelisted","ip":"185.190.140.12","hardware_id":"HWID-CLONE-XYZ"}', '2026-06-26T15:15:00Z'),

    -- lic_05 triggers regular success events
    ('ev_07', 'lic_05', 'verification_success', '{"ip":"198.51.100.5","hardware_id":"HWID-ORION-5555"}', '2026-06-26T01:00:00Z'),
    ('ev_08', 'lic_05', 'verification_success', '{"ip":"198.51.100.5","hardware_id":"HWID-ORION-5555"}', '2026-06-26T06:00:00Z');
`);

// Seed default software products if empty
const softwareCount = (db.prepare('SELECT COUNT(*) as count FROM software_products').get() as any).count;
if (softwareCount === 0) {
  db.exec(`
    INSERT INTO software_products (id, name, description, base_price) VALUES
      ('prod_1', 'QuantMaster HFT', 'High frequency execution algorithms with low latency market feeds', 12500),
      ('prod_2', 'AlphaSeeker Neural', 'Neural network models for sentiment and trend predictions', 9500),
      ('prod_3', 'HedgeBot Pro', 'Algorithmic spot/futures hedge automation system', 6000),
      ('prod_4', 'Arbitrage Scanner AI', 'Multi-exchange real-time arbitrage scanner', 4500);
  `);
}

// Seed default tiers if empty
const tierCount = (db.prepare('SELECT COUNT(*) as count FROM license_tiers').get() as any).count;
if (tierCount === 0) {
  db.exec(`
    INSERT INTO license_tiers (id, name, max_volume_usd, api_calls_limit, api_calls_limit_monthly, api_calls_limit_yearly, description) VALUES
      ('tier_1', 'Standard', 10000000, 10000, 300000, 3600000, 'Up to $10M Monthly Volume'),
      ('tier_2', 'Professional', 100000000, 25000, 750000, 9000000, 'Up to $100M Monthly Volume'),
      ('tier_3', 'Institutional', 1000000000, 50000, 1500000, 18000000, 'Institutional level with unlimited volume limits');
  `);
}

// Seed default clients if empty
const clientCount = (db.prepare('SELECT COUNT(*) as count FROM clients').get() as any).count;
if (clientCount === 0) {
  db.exec(`
    INSERT INTO clients (id, name, email, mobile, address, extra_info) VALUES
      ('cli_1', 'Polaris Hedge Fund', 'ops@polaris.com', '+1-555-0199', '120 Wall Street, New York, NY', '{"region":"AMER","payout_terms":"Net-30"}'),
      ('cli_2', 'Aether Capital', 'contact@aethercap.io', '+44-20-7946-0192', '30 St Mary Axe, London, UK', '{"region":"EMEA","payout_terms":"Net-15"}'),
      ('cli_3', 'Nova Alpha', 'trade@novaalpha.sg', '+65-6789-0123', 'Marina Bay Financial Centre, Singapore', '{"region":"APAC","payout_terms":"Prepaid"}'),
      ('cli_4', 'BlackWood Trust', 'admin@blackwood.ch', '+41-22-789-0122', 'Rue du Rhône, Geneva, Switzerland', '{"region":"EMEA","payout_terms":"Net-30"}'),
      ('cli_5', 'Orion Capital', 'ops@orioncap.com', '+1-415-555-2345', 'Montgomery St, San Francisco, CA', '{"region":"AMER","payout_terms":"Net-30"}');
  `);
}

export function getAllLicenses(): License[] {
  return db.prepare('SELECT * FROM licenses ORDER BY created_at DESC').all() as License[];
}

export function createLicense(license: License): License {
  const stmt = db.prepare(`
    INSERT INTO licenses (id, software_name, tier, license_key, status, issued_to, hardware_id, ip_whitelist, features, max_volume_usd, api_calls_limit, api_calls_limit_monthly, api_calls_limit_yearly, api_calls_count_daily, api_calls_count_monthly, api_calls_count_yearly, created_at, expires_at, product_price, current_earnings, daily_earnings, weekly_earnings, monthly_earnings, last_active_ip, device_fingerprint, asset_classes, restricted_accounts)
    VALUES (@id, @software_name, @tier, @license_key, @status, @issued_to, @hardware_id, @ip_whitelist, @features, @max_volume_usd, @api_calls_limit, @api_calls_limit_monthly, @api_calls_limit_yearly, @api_calls_count_daily, @api_calls_count_monthly, @api_calls_count_yearly, @created_at, @expires_at, @product_price, @current_earnings, @daily_earnings, @weekly_earnings, @monthly_earnings, @last_active_ip, @device_fingerprint, @asset_classes, @restricted_accounts)
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

export function deleteLicense(id: string): void {
  const stmt = db.prepare('DELETE FROM licenses WHERE id = @id');
  stmt.run({ id });
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

// Client Database Operations
export function getAllClients(): Client[] {
  return db.prepare('SELECT * FROM clients ORDER BY name ASC').all() as Client[];
}

export function createClient(client: Client): Client {
  const stmt = db.prepare(`
    INSERT INTO clients (id, name, email, mobile, address, extra_info)
    VALUES (@id, @name, @email, @mobile, @address, @extra_info)
  `);
  stmt.run(client);
  return client;
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
    INSERT INTO software_products (id, name, description, base_price)
    VALUES (@id, @name, @description, @base_price)
  `);
  stmt.run(product);
  return product;
}

export function deleteSoftwareProduct(id: string): void {
  const stmt = db.prepare('DELETE FROM software_products WHERE id = ?');
  stmt.run(id);
}

// License Tier Database Operations
export function getAllLicenseTiers(): LicenseTier[] {
  return db.prepare('SELECT * FROM license_tiers ORDER BY max_volume_usd ASC').all() as LicenseTier[];
}

export function createLicenseTier(tier: LicenseTier): LicenseTier {
  const stmt = db.prepare(`
    INSERT INTO license_tiers (id, name, max_volume_usd, api_calls_limit, api_calls_limit_monthly, api_calls_limit_yearly, description)
    VALUES (@id, @name, @max_volume_usd, @api_calls_limit, @api_calls_limit_monthly, @api_calls_limit_yearly, @description)
  `);
  stmt.run(tier);
  return tier;
}

export function deleteLicenseTier(id: string): void {
  const stmt = db.prepare('DELETE FROM license_tiers WHERE id = ?');
  stmt.run(id);
}

// Seed default audit schedule if empty
const auditScheduleCount = (db.prepare("SELECT COUNT(*) as count FROM audit_schedule").get() as any).count;
if (auditScheduleCount === 0) {
  db.prepare(`
    INSERT INTO audit_schedule (id, enabled, recipients, dispatch_hour, report_scope, last_run_at, next_run_at)
    VALUES ('default', 1, 'secops@quantfund.net, compliance@quantfund.net', 9, 'comprehensive', NULL, '2026-08-01T09:00:00Z')
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

