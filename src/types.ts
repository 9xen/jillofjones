export interface AuditLog {
  id: string;
  user_id: string | null;
  user_name: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  details: string;
  timestamp: string;
}

export type AppRole = 'Administrator' | 'Manager' | 'Auditor';

export interface AppUser {
  id: string;
  name: string;
  email: string;
  role: AppRole;
  created_at: string;
}

export interface License {
  id: string;
  software_name: string;
  tier: string;
  license_key: string;
  status: 'active' | 'revoked' | 'expired' | 'suspended';
  issued_to: string;
  hardware_id: string | null;
  ip_whitelist: string | null;
  features: string; // JSON string array of active modules
  max_volume_usd: number;
  api_calls_limit: number;
  api_calls_limit_monthly: number;
  api_calls_limit_yearly: number;
  api_calls_count_daily: number;
  api_calls_count_monthly: number;
  api_calls_count_yearly: number;
  created_at: string;
  expires_at: string;
  product_price: number;
  current_earnings: number;
  daily_earnings: number;
  weekly_earnings: number;
  monthly_earnings: number;
  last_active_ip: string | null;
  device_fingerprint: string | null;
  asset_classes: string; // JSON string of allowed classes: ['forex', 'crypto', 'stocks']
  restricted_accounts: string; // JSON string of allowed account IDs or API keys
}

export interface LicenseEvent {
  id: string;
  license_id: string;
  event_type: 'verification_success' | 'verification_failed' | 'webhook_call' | 'suspension' | 'limit_exceeded';
  event_data: string; // JSON string
  timestamp: string;
}

export interface Client {
  id: string;
  name: string;
  email: string;
  mobile: string;
  address: string;
  extra_info: string; // JSON string representing any custom field key-values
}

export interface SoftwareProduct {
  id: string;
  name: string;
  description: string;
  base_price: number;
}

export interface LicenseTier {
  id: string;
  name: string;
  max_volume_usd: number;
  api_calls_limit: number;
  api_calls_limit_monthly: number;
  api_calls_limit_yearly: number;
  description: string;
}

export interface Fund {
  id: string;
  name: string;
  contact_email: string;
  notes: string;
}

export interface AuditSchedule {
  id: string;
  enabled: number; // 0 or 1
  recipients: string;
  dispatch_hour: number;
  report_scope: 'comprehensive' | 'summary' | 'risk_only';
  last_run_at: string | null;
  next_run_at: string | null;
}
