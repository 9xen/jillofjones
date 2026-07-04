import { License, Client, SoftwareProduct, LicenseTier, AppUser, AuditLog, LicenseEvent } from './types';

export const MOCK_USERS: AppUser[] = [
  { id: 'user_01', name: 'System Admin', email: 'admin@nonaxen.infra', role: 'Administrator', created_at: '2026-01-01T00:00:00Z' },
  { id: 'user_02', name: 'License Manager', email: 'manager@nonaxen.infra', role: 'Manager', created_at: '2026-01-10T00:00:00Z' },
  { id: 'user_03', name: 'Compliance Auditor', email: 'auditor@nonaxen.infra', role: 'Auditor', created_at: '2026-02-01T00:00:00Z' }
];

export const MOCK_LICENSES: License[] = [
  {
    id: 'lic_01',
    software_name: 'HFT Terminal Alpha',
    tier: 'Institutional',
    license_key: 'sk_live_HFT_Alpha_001',
    status: 'active',
    issued_to: 'Polaris Hedge Fund',
    hardware_id: 'HWID-POLARIS-9832',
    ip_whitelist: '192.168.1.100,203.0.113.5',
    features: '["HFT_CORE", "MAX_LEVERAGE_100x"]',
    max_volume_usd: 10000000,
    api_calls_limit: 50000,
    api_calls_limit_monthly: 1500000,
    api_calls_limit_yearly: 18000000,
    api_calls_count_daily: 1205,
    api_calls_count_monthly: 34910,
    api_calls_count_yearly: 412095,
    created_at: '2026-01-15T08:00:00Z',
    expires_at: '2027-01-15T08:00:00Z',
    product_price: 12500,
    current_earnings: 3849.20,
    daily_earnings: 10.5,
    weekly_earnings: 75.3,
    monthly_earnings: 310.2,
    last_active_ip: '203.0.113.5',
    device_fingerprint: 'FP-POLARIS-X',
    asset_classes: '["forex", "stocks"]',
    restricted_accounts: '["ACC-12345", "ACC-67890"]',
    billing_cycle: 'yearly'
  },
  {
    id: 'lic_02',
    software_name: 'Arbitrage Bot v4',
    tier: 'Professional',
    license_key: 'sk_live_ArbBot_002',
    status: 'active',
    issued_to: 'Aether Capital',
    hardware_id: 'HWID-AETHER-2349',
    ip_whitelist: '198.51.100.22',
    features: '["ARB_STANDARD", "MULTI_EXCHANGE"]',
    max_volume_usd: 2000000,
    api_calls_limit: 25000,
    api_calls_limit_monthly: 750000,
    api_calls_limit_yearly: 9000000,
    api_calls_count_daily: 485,
    api_calls_count_monthly: 12904,
    api_calls_count_yearly: 150931,
    created_at: '2026-03-10T10:30:00Z',
    expires_at: '2026-09-10T10:30:00Z',
    product_price: 4500,
    current_earnings: 129.50,
    daily_earnings: 2.1,
    weekly_earnings: 14.8,
    monthly_earnings: 55.4,
    last_active_ip: '198.51.100.22',
    device_fingerprint: 'FP-AETHER-4',
    asset_classes: '["crypto"]',
    restricted_accounts: '["BINANCE-API-KEY-HASH-001"]',
    billing_cycle: 'monthly'
  },
  {
    id: 'lic_03',
    software_name: 'Trend Follower Core',
    tier: 'Starter',
    license_key: 'sk_live_Trend_003',
    status: 'suspended',
    issued_to: 'Nova Alpha',
    hardware_id: 'HWID-NOVA-8822',
    ip_whitelist: '203.0.113.99',
    features: '["TREND_INDICATORS"]',
    max_volume_usd: 500000,
    api_calls_limit: 10000,
    api_calls_limit_monthly: 300000,
    api_calls_limit_yearly: 3600000,
    api_calls_count_daily: 0,
    api_calls_count_monthly: 0,
    api_calls_count_yearly: 0,
    created_at: '2026-05-01T14:15:00Z',
    expires_at: '2026-11-01T14:15:00Z',
    product_price: 1200,
    current_earnings: 0.00,
    daily_earnings: 0,
    weekly_earnings: 0,
    monthly_earnings: 0,
    last_active_ip: '203.0.113.99',
    device_fingerprint: 'FP-NOVA-Z',
    asset_classes: '["forex"]',
    restricted_accounts: '[]',
    billing_cycle: 'onetime'
  },
  {
    id: 'lic_04',
    software_name: 'HFT Terminal Alpha',
    tier: 'Institutional',
    license_key: 'sk_live_HFT_Alpha_004',
    status: 'active',
    issued_to: 'BlackWood Trust',
    hardware_id: 'HWID-BLACKWOOD-1111',
    ip_whitelist: '192.0.2.1',
    features: '["HFT_CORE"]',
    max_volume_usd: 5000000,
    api_calls_limit: 30000,
    api_calls_limit_monthly: 900000,
    api_calls_limit_yearly: 10800000,
    api_calls_count_daily: 29014,
    api_calls_count_monthly: 895310,
    api_calls_count_yearly: 10795320,
    created_at: '2026-02-20T09:00:00Z',
    expires_at: '2027-02-20T09:00:00Z',
    product_price: 9500,
    current_earnings: 5521.80,
    daily_earnings: 24.5,
    weekly_earnings: 145.2,
    monthly_earnings: 590.5,
    last_active_ip: '192.0.2.1',
    device_fingerprint: 'FP-BLACKWOOD-1',
    asset_classes: '["stocks"]',
    restricted_accounts: '["NY-TICKER-FEED-001"]',
    billing_cycle: 'yearly'
  },
  {
    id: 'lic_05',
    software_name: 'Market Maker Pro',
    tier: 'Professional',
    license_key: 'sk_live_MMPro_005',
    status: 'active',
    issued_to: 'Orion Capital',
    hardware_id: 'HWID-ORION-5555',
    ip_whitelist: '198.51.100.5',
    features: '["MARKET_MAKER_CORE", "LOW_LATENCY_API"]',
    max_volume_usd: 4000000,
    api_calls_limit: 40000,
    api_calls_limit_monthly: 1200000,
    api_calls_limit_yearly: 14400000,
    api_calls_count_daily: 895,
    api_calls_count_monthly: 25612,
    api_calls_count_yearly: 309485,
    created_at: '2026-04-05T11:00:00Z',
    expires_at: '2026-10-05T11:00:00Z',
    product_price: 6000,
    current_earnings: 3200.00,
    daily_earnings: 15.2,
    weekly_earnings: 98.4,
    monthly_earnings: 380.1,
    last_active_ip: '198.51.100.5',
    device_fingerprint: 'FP-ORION-A',
    asset_classes: '["crypto", "forex"]',
    restricted_accounts: '["BYBIT-001", "MT5-998877"]',
    billing_cycle: 'monthly'
  }
];

export const MOCK_CLIENTS: Client[] = [
  { id: 'cli_1', name: 'Polaris Hedge Fund', email: 'ops@polaris.com', mobile: '+1-555-0199', address: '120 Wall Street, New York, NY', extra_info: '{"region":"AMER","payout_terms":"Net-30"}' },
  { id: 'cli_2', name: 'Aether Capital', email: 'contact@aethercap.io', mobile: '+44-20-7946-0192', address: '30 St Mary Axe, London, UK', extra_info: '{"region":"EMEA","payout_terms":"Net-15"}' },
  { id: 'cli_3', name: 'Nova Alpha', email: 'trade@novaalpha.sg', mobile: '+65-6789-0123', address: 'Marina Bay Financial Centre, Singapore', extra_info: '{"region":"APAC","payout_terms":"Prepaid"}' },
  { id: 'cli_4', name: 'BlackWood Trust', email: 'admin@blackwood.ch', mobile: '+41-22-789-0122', address: 'Rue du Rhône, Geneva, Switzerland', extra_info: '{"region":"EMEA","payout_terms":"Net-30"}' },
  { id: 'cli_5', name: 'Orion Capital', email: 'ops@orioncap.com', mobile: '+1-415-555-2345', address: 'Montgomery St, San Francisco, CA', extra_info: '{"region":"AMER","payout_terms":"Net-30"}' }
];

export const MOCK_PRODUCTS: SoftwareProduct[] = [
  { id: 'prod_1', name: 'QuantMaster HFT', description: 'High frequency execution algorithms with low latency market feeds', base_price: 12500 },
  { id: 'prod_2', name: 'AlphaSeeker Neural', description: 'Neural network models for sentiment and trend predictions', base_price: 9500 },
  { id: 'prod_3', name: 'HedgeBot Pro', description: 'Algorithmic spot/futures hedge automation system', base_price: 6000 },
  { id: 'prod_4', name: 'Arbitrage Scanner AI', description: 'Multi-exchange real-time arbitrage scanner', base_price: 4500 }
];

export const MOCK_TIERS: LicenseTier[] = [
  { id: 'tier_1', name: 'Standard', max_volume_usd: 10000000, api_calls_limit: 10000, api_calls_limit_monthly: 300000, api_calls_limit_yearly: 3600000, description: 'Up to $10M Monthly Volume' },
  { id: 'tier_2', name: 'Professional', max_volume_usd: 100000000, api_calls_limit: 25000, api_calls_limit_monthly: 750000, api_calls_limit_yearly: 9000000, description: 'Up to $100M Monthly Volume' },
  { id: 'tier_3', name: 'Institutional', max_volume_usd: 1000000000, api_calls_limit: 50000, api_calls_limit_monthly: 1500000, api_calls_limit_yearly: 18000000, description: 'Institutional level with unlimited volume limits' }
];

export const MOCK_AUDIT_LOGS: AuditLog[] = [
  { id: 'log_01', user_id: 'user_01', user_name: 'System Admin', action: 'Login', entity_type: 'User', entity_id: 'user_01', details: 'User logged in via web interface', timestamp: '2026-07-04T00:01:00Z' },
  { id: 'log_02', user_id: 'user_02', user_name: 'License Manager', action: 'Create License', entity_type: 'License', entity_id: 'lic_05', details: 'Provisioned Market Maker Pro to Orion Capital', timestamp: '2026-07-04T00:15:00Z' }
];

export const MOCK_RISK_SCORES: Record<string, { failed_pings: number, failed_pings_last_hour: number, distinct_ips: number, distinct_hwids: number, risk_score: number, high_risk_flag: boolean }> = {
  'lic_01': { failed_pings: 0, failed_pings_last_hour: 0, distinct_ips: 1, distinct_hwids: 1, risk_score: 5, high_risk_flag: false },
  'lic_02': { failed_pings: 0, failed_pings_last_hour: 0, distinct_ips: 1, distinct_hwids: 1, risk_score: 5, high_risk_flag: false },
  'lic_03': { failed_pings: 0, failed_pings_last_hour: 0, distinct_ips: 1, distinct_hwids: 1, risk_score: 70, high_risk_flag: false },
  'lic_04': { failed_pings: 12, failed_pings_last_hour: 6, distinct_ips: 3, distinct_hwids: 3, risk_score: 95, high_risk_flag: true },
  'lic_05': { failed_pings: 0, failed_pings_last_hour: 0, distinct_ips: 1, distinct_hwids: 1, risk_score: 10, high_risk_flag: false }
};
