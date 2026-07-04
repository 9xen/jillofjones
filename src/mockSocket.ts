import { License, Client, SoftwareProduct, LicenseTier, AppUser, AuditLog, LicenseEvent } from './types';
import { 
  MOCK_LICENSES, MOCK_CLIENTS, MOCK_PRODUCTS, MOCK_TIERS, MOCK_USERS, MOCK_AUDIT_LOGS, MOCK_RISK_SCORES 
} from './mockData';

export function createMockSocket() {
  const listeners: Record<string, Function[]> = {};

  // Helpers to get and set local states from localStorage for mock persistence
  const getStored = <T>(key: string, defaultValue: T): T => {
    const item = localStorage.getItem(`mock_db_${key}`);
    return item ? JSON.parse(item) : defaultValue;
  };

  const setStored = <T>(key: string, value: T) => {
    localStorage.setItem(`mock_db_${key}`, JSON.stringify(value));
  };

  // Initialize simulated DB states
  let licenses = getStored<License[]>('licenses', MOCK_LICENSES);
  let clients = getStored<Client[]>('clients', MOCK_CLIENTS);
  let products = getStored<SoftwareProduct[]>('products', MOCK_PRODUCTS);
  let tiers = getStored<LicenseTier[]>('tiers', MOCK_TIERS);
  let users = getStored<AppUser[]>('users', MOCK_USERS);
  let auditLogs = getStored<AuditLog[]>('audit_logs', MOCK_AUDIT_LOGS);
  let riskScores = getStored<Record<string, any>>('risk_scores', MOCK_RISK_SCORES);

  const saveAll = () => {
    setStored('licenses', licenses);
    setStored('clients', clients);
    setStored('products', products);
    setStored('tiers', tiers);
    setStored('users', users);
    setStored('audit_logs', auditLogs);
    setStored('risk_scores', riskScores);
  };

  const trigger = (event: string, data: any) => {
    if (listeners[event]) {
      listeners[event].forEach(fn => fn(data));
    }
  };

  const logAudit = (user: AppUser | null, action: string, entity_type: string, entity_id: string, details: string) => {
    const log: AuditLog = {
      id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      user_id: user?.id || 'system',
      user_name: user?.name || 'System Auto-Defender',
      action,
      entity_type,
      entity_id,
      details,
      timestamp: new Date().toISOString()
    };
    auditLogs = [log, ...auditLogs];
    saveAll();
    trigger('audit:new', log);
  };

  const socket = {
    on(event: string, callback: Function) {
      if (!listeners[event]) {
        listeners[event] = [];
      }
      listeners[event].push(callback);
    },

    off(event: string, callback?: Function) {
      if (!listeners[event]) return;
      if (callback) {
        listeners[event] = listeners[event].filter(fn => fn !== callback);
      } else {
        delete listeners[event];
      }
    },

    emit(event: string, payload: any) {
      setTimeout(() => {
        switch (event) {
          case 'licenses:extend': {
            const { id, expiresAt, user } = payload;
            licenses = licenses.map(l => l.id === id ? { ...l, expires_at: expiresAt } : l);
            saveAll();
            trigger('licenses:status_updated', { id, status: 'active' }); // sets active on renewal/extension
            trigger('licenses:updated', { id, expires_at: expiresAt });
            logAudit(user, 'Extend License', 'License', id, `Extended expiration date to ${expiresAt}`);
            break;
          }

          case 'licenses:batch_update': {
            const { ids, updates, user } = payload;
            licenses = licenses.map(l => ids.includes(l.id) ? { ...l, ...updates } : l);
            saveAll();
            trigger('licenses:batch_updated', { ids, updates });
            logAudit(user, 'Bulk Update Licenses', 'License', ids.join(','), `Bulk updated ${ids.length} licenses: ${JSON.stringify(updates)}`);
            break;
          }

          case 'licenses:update_details': {
            const { id, updates, user } = payload;
            licenses = licenses.map(l => l.id === id ? { ...l, ...updates } : l);
            saveAll();
            trigger('licenses:updated', { id, ...updates });
            logAudit(user, 'Update Details', 'License', id, `Updated fields: ${JSON.stringify(updates)}`);
            break;
          }

          case 'licenses:create': {
            const { license, user } = payload;
            const newLicense: License = {
              ...license,
              id: license.id || `lic_${Date.now()}`,
              created_at: new Date().toISOString(),
              current_earnings: 0,
              daily_earnings: 0,
              weekly_earnings: 0,
              monthly_earnings: 0,
              api_calls_count_daily: 0,
              api_calls_count_monthly: 0,
              api_calls_count_yearly: 0
            };
            licenses = [newLicense, ...licenses];
            // Setup default risk score
            riskScores[newLicense.id] = { failed_pings: 0, failed_pings_last_hour: 0, distinct_ips: 0, distinct_hwids: 0, risk_score: 0, high_risk_flag: false };
            saveAll();
            trigger('licenses:created', newLicense);
            logAudit(user, 'Create License', 'License', newLicense.id, `Created new license for ${newLicense.issued_to}`);
            break;
          }

          case 'licenses:update_status': {
            const { id, status, user } = payload;
            licenses = licenses.map(l => l.id === id ? { ...l, status } : l);
            saveAll();
            trigger('licenses:status_updated', { id, status });
            logAudit(user, 'Update Status', 'License', id, `Updated license status to ${status}`);
            break;
          }

          case 'licenses:delete': {
            const { id, user } = payload;
            licenses = licenses.filter(l => l.id !== id);
            saveAll();
            trigger('licenses:deleted', id);
            logAudit(user, 'Delete License', 'License', id, `Permanently deleted license key`);
            break;
          }

          case 'clients:create': {
            const { client, user } = payload;
            const newClient: Client = {
              ...client,
              id: client.id || `cli_${Date.now()}`
            };
            clients = [...clients, newClient];
            saveAll();
            trigger('clients:created', newClient);
            logAudit(user, 'Create Client', 'Client', newClient.id, `Registered client: ${newClient.name}`);
            break;
          }

          case 'clients:update': {
            const { id, updates, user } = payload;
            clients = clients.map(c => c.id === id ? { ...c, ...updates } : c);
            saveAll();
            // Trigger refresh by re-emitting all clients
            trigger('clients:init', clients);
            logAudit(user, 'Update Client', 'Client', id, `Updated client info`);
            break;
          }

          case 'clients:delete': {
            const { id, user } = payload;
            clients = clients.filter(c => c.id !== id);
            saveAll();
            trigger('clients:deleted', id);
            logAudit(user, 'Delete Client', 'Client', id, `Removed client record`);
            break;
          }

          case 'software_products:create': {
            const prod = payload;
            const newProd: SoftwareProduct = {
              ...prod,
              id: prod.id || `prod_${Date.now()}`
            };
            products = [...products, newProd];
            saveAll();
            trigger('software_products:created', newProd);
            break;
          }

          case 'software_products:delete': {
            const id = payload;
            products = products.filter(p => p.id !== id);
            saveAll();
            trigger('software_products:deleted', id);
            break;
          }

          case 'license_tiers:create': {
            const tierObj = payload;
            const newTier: LicenseTier = {
              ...tierObj,
              id: tierObj.id || `tier_${Date.now()}`
            };
            tiers = [...tiers, newTier];
            saveAll();
            trigger('license_tiers:created', newTier);
            break;
          }

          case 'license_tiers:delete': {
            const id = payload;
            tiers = tiers.filter(t => t.id !== id);
            saveAll();
            trigger('license_tiers:deleted', id);
            break;
          }

          case 'licenses:update_config': {
            const { id, config } = payload;
            licenses = licenses.map(l => l.id === id ? { ...l, ...config } : l);
            saveAll();
            trigger('licenses:config_updated', { id, config });
            break;
          }

          case 'licenses:reset_hwid': {
            const { id, user } = payload;
            licenses = licenses.map(l => l.id === id ? { ...l, hardware_id: '' } : l);
            saveAll();
            trigger('licenses:hwid_reset', id);
            logAudit(user, 'Reset Hardware Lock', 'License', id, `Cleared system hardware ID locking parameter`);
            break;
          }

          case 'users:create': {
            const userObj = payload;
            const newUser: AppUser = {
              ...userObj,
              id: userObj.id || `user_${Date.now()}`,
              created_at: new Date().toISOString()
            };
            users = [newUser, ...users];
            saveAll();
            trigger('users:created', newUser);
            break;
          }

          case 'users:update_role': {
            const { id, role } = payload;
            users = users.map(u => u.id === id ? { ...u, role } : u);
            saveAll();
            trigger('users:role_updated', { id, role });
            break;
          }

          case 'users:delete': {
            const id = payload;
            users = users.filter(u => u.id !== id);
            saveAll();
            trigger('users:deleted', id);
            break;
          }

          case 'node:simulate_api_call': {
            const { license_key, count } = payload;
            const target = licenses.find(l => l.license_key === license_key);
            if (target) {
              const prevDaily = target.api_calls_count_daily || 0;
              const newDaily = prevDaily + count;
              licenses = licenses.map(l => l.license_key === license_key ? { 
                ...l, 
                api_calls_count_daily: newDaily,
                api_calls_count_monthly: (l.api_calls_count_monthly || 0) + count,
                api_calls_count_yearly: (l.api_calls_count_yearly || 0) + count,
                last_active_ip: l.ip_whitelist.split(',')[0] || '127.0.0.1'
              } : l);
              saveAll();
              trigger('licenses:api_calls_updated', { id: target.id, counts: {
                daily: newDaily,
                monthly: (target.api_calls_count_monthly || 0) + count,
                yearly: (target.api_calls_count_yearly || 0) + count
              }});
            }
            break;
          }

          case 'node:disconnect_node': {
            const { license_key } = payload;
            // Clear simulated live nodes
            trigger('nodes:live', []);
            break;
          }

          case 'node:connect': {
            const { license_key, ip, hardwareId } = payload;
            const target = licenses.find(l => l.license_key === license_key);
            if (target) {
              // Simulating live nodes list
              const nodes = [{
                license_key,
                socketId: `mock_sock_${Date.now()}`,
                ip: ip || '127.0.0.1',
                hardwareId: hardwareId || 'MOCK_HWID',
                connectedAt: new Date().toISOString()
              }];
              trigger('nodes:live', nodes);
            }
            break;
          }
        }
      }, 50);
    },

    disconnect() {
      // Stub
    }
  };

  // Broadcast the initial load after instantiation so client catches it
  setTimeout(() => {
    trigger('licenses:init', licenses);
    trigger('clients:init', clients);
    trigger('software_products:init', products);
    trigger('license_tiers:init', tiers);
    trigger('users:init', users);
    trigger('audit_logs:init', auditLogs);
  }, 100);

  return socket;
}
