import React, { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { motion, AnimatePresence } from 'motion/react';
import { License, LicenseEvent, Fund, Client, SoftwareProduct, LicenseTier, AuditSchedule, AppUser, AppRole, AuditLog } from './types';
import { Activity, Key, Shield, ShieldAlert, ShieldCheck, Trash2, Bell, Plus, Clock, Search, Building, Cpu, Database, Server, Zap, StopCircle, List, Send, X, Users, Settings, Menu, ChevronDown, ChevronUp, ChevronRight, Download, Layers, Calendar, Mail, Check, SlidersHorizontal, AlertTriangle, FileText, RefreshCw, Code2, Info, Lock, Eye, EyeOff, LogOut, Undo2, Archive, GripVertical, Calculator, DollarSign, BarChart3 } from 'lucide-react';
import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';
import { cn } from './lib/utils';
import { format, addDays } from 'date-fns';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend, Line, RadialBarChart, RadialBar, PieChart, Pie, Cell } from 'recharts';
import { LoginPage } from './components/LoginPage';
import { ValidateKeyView } from './components/ValidateKeyView';
import { generateSecureLicenseKey } from './lib/licenseKeyUtils';
import { RevenueForecastWidget } from './components/RevenueForecastWidget';
import { RiskMitigationModal } from './components/RiskMitigationModal';

export const getLicenseFee = (license: License): number => {
  if (license.billing_cycle === 'profit_share') {
    return (license.monthly_earnings || 0) * (license.profit_share_pct ?? 15) / 100;
  }
  return license.product_price || 0;
};

export default function App() {
  const [licenses, setLicenses] = useState<License[]>([]);
  const [connected, setConnected] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterTier, setFilterTier] = useState<string>('all');
  const [filterAssetClass, setFilterAssetClass] = useState<string>('all');
  const [visibleColumns, setVisibleColumns] = useState({
    license: true,
    software: true,
    security: true,
    risk: true,
    earnings: true,
    status: true,
  });
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [dateRange, setDateRange] = useState({ start: '', end: '', type: 'created_at' as 'created_at' | 'expires_at' });
  const [showProfitShareCalc, setShowProfitShareCalc] = useState(false);
  const [selectedLicenses, setSelectedLicenses] = useState<Set<string>>(new Set());

  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);

  const [clients, setClients] = useState<Client[]>([]);
  const [softwareProducts, setSoftwareProducts] = useState<SoftwareProduct[]>([]);
  const [licenseTiers, setLicenseTiers] = useState<LicenseTier[]>([]);
  const [activeTab, setActiveTab] = useState('licenses');
  const [duckDBRiskScores, setDuckDBRiskScores] = useState<Record<string, { failed_pings: number, distinct_ips: number, distinct_hwids: number, risk_score: number }>>({});
  const [liveWebSocketNodes, setLiveWebSocketNodes] = useState<Array<{ license_key: string, socketId: string, ip: string, hardwareId: string, connectedAt: string, rtt?: number, isDegraded?: boolean, heartbeatInterval?: number, lastPongAt?: number }>>([]);
  const [allUsers, setAllUsers] = useState<AppUser[]>([]);
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [renewalAlerts, setRenewalAlerts] = useState<Array<{ id: string, license_id: string, software_name: string, days_remaining: number, expires_at: string, severity: 'critical' | 'warning' | 'info' }>>([]);
  const [riskAlerts, setRiskAlerts] = useState<Array<{ id: string, license_id: string, software_name: string, score: number, message: string }>>([]);
  const [riskSnapshots, setRiskSnapshots] = useState<any[]>([]);
  const [simulatedClientKey, setSimulatedClientKey] = useState<string>('');
  const [simulationLogs, setSimulationLogs] = useState<string[]>([]);
  const [systemPublicKey, setSystemPublicKey] = useState<string>('');
  const [latencyThreshold, setLatencyThreshold] = useState<number>(150);
  const socketRef = useRef<Socket | null>(null);

  const fetchPublicKey = async () => {
    if (localStorage.getItem('nonaxen_static_mode') === 'true') {
      setSystemPublicKey("MOCK-PUBLIC-KEY-RSA-2048-NETLIFY");
      return;
    }
    try {
      const res = await fetch('/api/system/public-key');
      const data = await res.json();
      setSystemPublicKey(data.publicKey);
    } catch (err) {
      console.error("Failed to fetch system public key");
    }
  };

  const fetchLatencyThreshold = async () => {
    if (localStorage.getItem('nonaxen_static_mode') === 'true') {
      const threshold = localStorage.getItem('mock_db_latency_threshold') || "150";
      setLatencyThreshold(Number(threshold));
      return;
    }
    try {
      const res = await fetch('/api/settings/latency-threshold');
      const data = await res.json();
      setLatencyThreshold(data.threshold);
    } catch (err) {
      console.error("Failed to fetch latency threshold:", err);
    }
  };

  useEffect(() => {
    fetchPublicKey();
    fetchLatencyThreshold();
    
    // Check for existing session
    const savedUser = localStorage.getItem('nonaxen_user');
    if (savedUser) {
      try {
        setCurrentUser(JSON.parse(savedUser));
        setIsAuthenticated(true);
      } catch (err) {
        localStorage.removeItem('nonaxen_user');
      }
    }
  }, []);

  const handleLogin = (user: AppUser) => {
    setCurrentUser(user);
    setIsAuthenticated(true);
    localStorage.setItem('nonaxen_user', JSON.stringify(user));
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (e) {
      console.error('Logout error:', e);
    }
    setCurrentUser(null);
    setIsAuthenticated(false);
    localStorage.removeItem('nonaxen_user');
    showToast('Logged out successfully', 'success');
  };

  const fetchRiskSnapshots = async () => {
    if (localStorage.getItem('nonaxen_static_mode') === 'true') {
      return;
    }
    try {
      const res = await fetch('/api/risk/snapshots');
      const data = await res.json();
      setRiskSnapshots(data);
    } catch (err) {
      console.error("Failed to fetch risk snapshots:", err);
    }
  };

  const fetchRiskScores = async () => {
    try {
      const res = await fetch('/api/analytics/risk-scores');
      const data = await res.json();
      setDuckDBRiskScores(data);
      await fetchRiskSnapshots();
    } catch (err) {
      console.error("Failed to fetch DuckDB risk scores:", err);
    }
  };

  // RBAC Permission Helpers
  const canManageLicenses = currentUser?.role === 'Administrator' || currentUser?.role === 'Manager' || currentUser?.role === 'User';
  const canManageSystem = currentUser?.role === 'Administrator';
  const canDeleteLicenses = currentUser?.role === 'Administrator' || currentUser?.role === 'Manager';
  const canViewAudit = !!currentUser;
  const isReadOnly = currentUser?.role === 'Auditor' || currentUser?.role === 'Viewer';
  
  const toggleSelectAll = () => {
    if (selectedLicenses.size === filteredLicenses.length) {
      setSelectedLicenses(new Set());
    } else {
      setSelectedLicenses(new Set(filteredLicenses.map(l => l.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedLicenses);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedLicenses(next);
  };

  const executeBulkAction = (action: 'delete' | 'suspend' | 'activate' | 'archive' | 'restore') => {
    // Store previous states for undo (only for status changes)
    const previousStates = new Map<string, string>();
    if (action !== 'delete') {
      selectedLicenses.forEach(id => {
        const license = licenses.find(l => l.id === id);
        if (license) previousStates.set(id, license.status);
      });
    }

    const affectedCount = selectedLicenses.size;

    selectedLicenses.forEach(id => {
      if (action === 'delete') deleteLicense(id);
      else if (action === 'archive') updateStatus(id, 'archived');
      else if (action === 'restore') updateStatus(id, 'active');
      else updateStatus(id, action === 'suspend' ? 'suspended' : 'active');
    });

    setSelectedLicenses(new Set());

    const undoHandler = action !== 'delete' ? () => {
      previousStates.forEach((status, id) => {
        updateStatus(id, status as any);
      });
      showToast('Action undone successfully', 'success');
    } : undefined;

    showToast(
      `Bulk action '${action}' applied to ${affectedCount} licenses`, 
      'success',
      undoHandler
    );
  };

  const handleRiskMitigation = (actions: { resetCredentials: boolean; triggerHeartbeat: boolean; toggleSafetyMode: boolean }) => {
    const selected = licenses.filter(l => selectedLicenses.has(l.id));
    
    selected.forEach(license => {
      if (actions.resetCredentials) {
        socketRef.current.emit('licenses:reset_hwid', { id: license.id, user: currentUser });
      }
      if (actions.triggerHeartbeat) {
        socketRef.current.emit('node:ping', { id: license.license_key });
      }
      if (actions.toggleSafetyMode) {
        const newConfig = { ...JSON.parse(license.config || '{}'), safety_mode: !JSON.parse(license.config || '{}').safety_mode };
        socketRef.current.emit('licenses:update_config', { id: license.id, config: JSON.stringify(newConfig), user: currentUser });
      }
    });
    
    setIsRiskMitigationModalOpen(false);
    showToast(`Applied risk mitigation to ${selected.length} licenses`, 'success');
  };

  const toggleRow = (id: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const exportLicense = (license: License) => {
    const blob = new Blob([JSON.stringify(license, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `license-audit-${license.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportLicensesToCSV = () => {
    window.location.href = '/api/licenses/export/csv';
  };

  const exportLicensesToPDF = () => {
    window.location.href = '/api/licenses/export/pdf';
  };
  const extendLicense = (id: string, days: number) => {
    if (!socketRef.current) return;
    const license = licenses.find(l => l.id === id);
    if (!license) return;
    
    const newExpiry = addDays(new Date(license.expires_at), days).toISOString();
    socketRef.current.emit('licenses:extend', { id, expiresAt: newExpiry, user: currentUser });
    
    setIsExtendModalOpen(false);
    showToast('License extension requested', 'success');
  };

  const renewLicense = (id: string) => {
    if (!socketRef.current) return;
    const license = licenses.find(l => l.id === id);
    if (!license) return;

    let newExpiry = new Date(license.expires_at);
    if (license.billing_cycle === 'monthly') {
      newExpiry.setMonth(newExpiry.getMonth() + 1);
    } else {
      newExpiry.setFullYear(newExpiry.getFullYear() + 1);
    }
    const newExpiryIso = newExpiry.toISOString();
    socketRef.current.emit('licenses:extend', { id, expiresAt: newExpiryIso, user: currentUser });
    
    setIsRenewModalOpen(false);
    showToast('License renewal requested', 'success');
  };

  const calculateRiskScore = (license: License) => {
    let score = 0;
    // Mock calculation based on status, IP, etc.
    if (license.status === 'revoked') score += 50;
    if (license.status === 'suspended') score += 30;
    if (!license.hardware_id) score += 20; // Unlocked hardware is riskier
    if (!license.ip_whitelist) score += 10;
    
    // Cap at 100
    return Math.min(score, 100);
  };

  const transferLicenses = (newFund: string) => {
    setLicenses(prev => prev.map(l => {
      if (selectedLicenses.has(l.id)) {
        return { ...l, issued_to: newFund };
      }
      return l;
    }));
    setIsTransferModalOpen(false);
    setSelectedLicenses(new Set());
    showToast(`Transferred ${selectedLicenses.size} licenses to ${newFund}`, 'success');
  };
  const [isExtendModalOpen, setIsExtendModalOpen] = useState(false);
  const [isRenewModalOpen, setIsRenewModalOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [isBatchEditModalOpen, setIsBatchEditModalOpen] = useState(false);
  const [selectedLicense, setSelectedLicense] = useState<License | null>(null);
  const [extendingLicense, setExtendingLicense] = useState<License | null>(null);
  const [renewingLicense, setRenewingLicense] = useState<License | null>(null);
  const [smtp, setSmtp] = useState({ host: '', port: 587, user: '', pass: '', secure: false, from_email: '' });
  const [isSavingSmtp, setIsSavingSmtp] = useState(false);

  const handleSaveSmtp = async () => {
    setIsSavingSmtp(true);
    try {
      const res = await fetch('/api/smtp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...smtp,
          secure: smtp.secure ? 1 : 0
        })
      });
      if (res.ok) {
        showToast('SMTP settings saved successfully', 'success');
      } else {
        throw new Error('Failed to save');
      }
    } catch (err) {
      showToast('Error saving SMTP settings', 'error');
    } finally {
      setIsSavingSmtp(false);
    }
  };

  
  const [notificationPrefs, setNotificationPrefs] = useState({ 
    expirations: true, 
    renewals: true, 
    assignments: true,
    risk_alerts: true,
    expiration_alerts: true
  });
  const [isSavingPrefs, setIsSavingPrefs] = useState(false);

  useEffect(() => {
    if (currentUser?.notification_preferences) {
      try {
        setNotificationPrefs(JSON.parse(currentUser.notification_preferences));
      } catch(e) {}
    }
  }, [currentUser]);

  const handleSavePrefs = async () => {
    if (!currentUser) return;
    setIsSavingPrefs(true);
    try {
      const res = await fetch(`/api/users/${currentUser.id}/preferences`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(notificationPrefs)
      });
      if (res.ok) {
        showToast('Notification preferences updated', 'success');
      } else {
        showToast('Failed to update preferences', 'error');
      }
    } catch (err) {
      showToast('Error saving preferences', 'error');
    } finally {
      setIsSavingPrefs(false);
    }
  };

  const handleSaveLatencyThreshold = async () => {
    try {
      const res = await fetch('/api/settings/latency-threshold', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threshold: latencyThreshold })
      });
      if (!res.ok) throw new Error('Failed to save');
    } catch (err) {
      showToast('Error saving latency threshold', 'error');
    }
  };

  const isInitialSmtp = useRef(true);
  const isInitialLatency = useRef(true);

  useEffect(() => {
    if (isInitialSmtp.current) {
        isInitialSmtp.current = false;
        return;
    }
    const handler = setTimeout(() => {
      if (smtp.host) {
        handleSaveSmtp();
      }
    }, 1500);
    return () => clearTimeout(handler);
  }, [smtp]);

  useEffect(() => {
    if (isInitialLatency.current) {
        isInitialLatency.current = false;
        return;
    }
    const handler = setTimeout(() => {
      handleSaveLatencyThreshold();
    }, 1500);
    return () => clearTimeout(handler);
  }, [latencyThreshold]);

  const batchUpdateSelectedLicenses = (updates: any) => {
    if (!socketRef.current || selectedLicenses.size === 0) return;
    socketRef.current.emit('licenses:batch_update', {
      ids: Array.from(selectedLicenses),
      updates,
      user: currentUser
    });
    setIsBatchEditModalOpen(false);
    setSelectedLicenses(new Set());
    showToast(`Successfully bulk-updated ${selectedLicenses.size} licenses`, 'success');
  };
  const [events, setEvents] = useState<LicenseEvent[]>([]);
  const [isEventsOpen, setIsEventsOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isRiskMitigationModalOpen, setIsRiskMitigationModalOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [toast, setToast] = useState<{message: string, type: 'success'|'error', onUndo?: () => void} | null>(null);
  const [editingMainLicense, setEditingMainLicense] = useState<License | null>(null);
  const [auditResults, setAuditResults] = useState<Record<string, string>>({});
  
  const runAudit = (licenseId: string) => {
    // Simulate audit
    const result = Math.random() > 0.1 ? "Security Compliant" : "Minor Vulnerability Found";
    setAuditResults(prev => ({...prev, [licenseId]: result}));
    showToast(`Audit for ${licenseId}: ${result}`, 'success');
  };

  const showToast = (message: string, type: 'success' | 'error' = 'success', onUndo?: () => void) => {
    setToast({ message, type, onUndo });
    setTimeout(() => setToast(null), 5000);
  };

  const openEvents = async (license: License) => {
    setSelectedLicense(license);
    setIsEventsOpen(true);
    if (localStorage.getItem('nonaxen_static_mode') === 'true') {
      const key = `mock_db_events_${license.id}`;
      const stored = localStorage.getItem(key);
      if (stored) {
        setEvents(JSON.parse(stored));
      } else {
        // Initial mock events seed
        let initialEvents: any[] = [
          {
            id: `ev_init_${Date.now()}`,
            license_id: license.id,
            event_type: 'verification_success',
            event_data: JSON.stringify({ ip: license.last_active_ip || '203.0.113.5', hardware_id: license.hardware_id || 'HWID-SIMULATED' }),
            timestamp: new Date(Date.now() - 3600000).toISOString()
          }
        ];
        if (license.id === 'lic_04') {
          initialEvents = [
            { id: 'ev_03', license_id: 'lic_04', event_type: 'verification_success', event_data: '{"ip":"192.0.2.1","hardware_id":"HWID-BLACKWOOD-1111"}', timestamp: '2026-06-26T08:00:00Z' },
            { id: 'ev_04', license_id: 'lic_04', event_type: 'verification_failed', event_data: '{"reason":"IP not whitelisted","ip":"192.0.2.99","hardware_id":"HWID-BLACKWOOD-1111"}', timestamp: '2026-06-26T09:30:00Z' },
            { id: 'ev_05', license_id: 'lic_04', event_type: 'verification_failed', event_data: '{"reason":"Hardware ID mismatch","ip":"192.0.2.1","hardware_id":"HWID-SUSPECT-9999"}', timestamp: '2026-06-26T12:00:00Z' },
            { id: 'ev_06', license_id: 'lic_04', event_type: 'verification_failed', event_data: '{"reason":"IP not whitelisted","ip":"185.190.140.12","hardware_id":"HWID-CLONE-XYZ"}', timestamp: '2026-06-26T15:15:00Z' }
          ];
        }
        localStorage.setItem(key, JSON.stringify(initialEvents));
        setEvents(initialEvents);
      }
      return;
    }
    try {
      const res = await fetch(`/api/license/${license.id}/events`);
      const data = await res.json();
      setEvents(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setEvents([]);
    }
  };

  const simulatePing = async (license: License) => {
    if (localStorage.getItem('nonaxen_static_mode') === 'true') {
      const key = `mock_db_events_${license.id}`;
      const stored = localStorage.getItem(key);
      const evs = stored ? JSON.parse(stored) : [];
      const newEv = {
        id: `ev_sim_${Date.now()}`,
        license_id: license.id,
        event_type: 'verification_success',
        event_data: JSON.stringify({ ip: license.last_active_ip || '127.0.0.1', hardware_id: license.hardware_id || 'HWID-SIMULATED' }),
        timestamp: new Date().toISOString()
      };
      const updatedEvs = [newEv, ...evs];
      localStorage.setItem(key, JSON.stringify(updatedEvs));
      
      // Update ping/volume stats client side
      const licensesKey = 'mock_db_licenses';
      const storedLicenses = localStorage.getItem(licensesKey);
      if (storedLicenses) {
        const parsed = JSON.parse(storedLicenses);
        const updatedLicenses = parsed.map((l: License) => {
          if (l.id === license.id) {
            return {
              ...l,
              api_calls_count_daily: (l.api_calls_count_daily || 0) + 1,
              api_calls_count_monthly: (l.api_calls_count_monthly || 0) + 1,
              api_calls_count_yearly: (l.api_calls_count_yearly || 0) + 1,
            };
          }
          return l;
        });
        localStorage.setItem(licensesKey, JSON.stringify(updatedLicenses));
        setLicenses(updatedLicenses);
      }
      
      showToast('Client ping verification simulated successfully!', 'success');
      if (isEventsOpen && selectedLicense?.id === license.id) {
        setEvents(updatedEvs);
      }
      return;
    }
    try {
      await fetch('/api/license/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          license_key: license.license_key,
          hardware_id: license.hardware_id || 'HWID-SIMULATED',
          ip: license.last_active_ip || '127.0.0.1'
        })
      });
      // Refresh events if open
      if (isEventsOpen && selectedLicense?.id === license.id) {
        openEvents(license);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    const socket = io();
    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    socket.on('licenses:init', (data: License[]) => {
      setLicenses(data);
      fetchRiskScores();
    });

    socket.on('nodes:live', (data: any[]) => {
      setLiveWebSocketNodes(data);
    });

    socket.on('settings:latency-threshold', ({ threshold }: { threshold: number }) => {
      setLatencyThreshold(threshold);
    });

    socket.on('node:ping', (data: { license_key: string, sentAt: number }) => {
      socket.emit('node:pong', { license_key: data.license_key, sentAt: data.sentAt });
    });

    socket.on('licenses:created', (license: License) => {
      setLicenses((prev) => [license, ...prev]);
      fetchRiskScores();
    });

    socket.on('licenses:status_updated', ({ id, status }) => {
      setLicenses((prev) => 
        prev.map((l) => l.id === id ? { ...l, status: status as License['status'] } : l)
      );
      fetchRiskScores();
    });

    socket.on('licenses:earnings_updated', (updates: any[]) => {
      setLicenses((prev) => {
        const updateMap = new Map(updates.map(u => [u.id, u]));
        return prev.map(l => {
          if (updateMap.has(l.id)) {
            const u = updateMap.get(l.id)!;
            return {
              ...l,
              current_earnings: u.current_earnings,
              daily_earnings: u.daily_earnings,
              weekly_earnings: u.weekly_earnings,
              monthly_earnings: u.monthly_earnings
            };
          }
          return l;
        });
      });
    });

    socket.on('licenses:config_updated', ({ id, config }) => {
      setLicenses((prev) =>
        prev.map((l) => l.id === id ? { ...l, ...config } : l)
      );
      fetchRiskScores();
    });

    socket.on('licenses:api_calls_updated', ({ id, counts }) => {
      setLicenses((prev) =>
        prev.map((l) => l.id === id ? {
          ...l,
          api_calls_count_daily: counts.daily,
          api_calls_count_monthly: counts.monthly,
          api_calls_count_yearly: counts.yearly
        } : l)
      );
    });

    socket.on('licenses:updated', (data: Partial<License> & { id: string }) => {
      setLicenses((prev) => prev.map((l) => (l.id === data.id ? { ...l, ...data } : l)));
    });

    socket.on('licenses:batch_updated', ({ ids, updates }: { ids: string[], updates: any }) => {
      setLicenses((prev) =>
        prev.map((l) => ids.includes(l.id) ? { ...l, ...updates } : l)
      );
      fetchRiskScores();
    });

    socket.on('licenses:status_updated', ({ id, status }: { id: string, status: string }) => {
      setLicenses((prev) => prev.map((l) => (l.id === id ? { ...l, status } : l)));
    });

    socket.on('licenses:extended', ({ id, expiresAt }: { id: string, expiresAt: string }) => {
      setLicenses((prev) => prev.map((l) => (l.id === id ? { ...l, expires_at: expiresAt } : l)));
    });

    socket.on('licenses:hwid_reset', (id: string) => {
      setLicenses((prev) => prev.map((l) => (l.id === id ? { ...l, hardware_id: null } : l)));
      showToast('Hardware ID lock has been reset', 'success');
    });

    socket.on('system:alert', (alert: { 
      type: 'risk' | 'expiration', 
      license_id: string, 
      software_name: string,
      issued_to: string,
      score?: number,
      days?: number,
      message: string 
    }) => {
      const isRisk = alert.type === 'risk';
      showToast(
        `${isRisk ? '[CRITICAL RISK]' : '[EXPIRATION]'} ${alert.message}`, 
        isRisk ? 'error' : 'success'
      );
      
      if (isRisk && alert.score !== undefined) {
        setRiskAlerts(prev => {
          const exists = prev.find(a => a.license_id === alert.license_id);
          if (exists) return prev.map(a => a.license_id === alert.license_id ? { ...a, score: alert.score!, message: alert.message } : a);
          return [...prev, { id: Math.random().toString(36).substr(2, 9), license_id: alert.license_id, software_name: alert.software_name, score: alert.score!, message: alert.message }];
        });
      }

      // Also fetch audit logs to keep them updated
      fetch('/api/audit_logs')
        .then(res => res.json())
        .then(data => setAuditLogs(data))
        .catch(err => console.error('Failed to update audit logs on alert', err));
    });

    socket.on('licenses:deleted', (id: string) => {
      setLicenses((prev) => prev.filter((l) => l.id !== id));
      fetchRiskScores();
    });

    socket.on('license:anomaly', ({ license_id, failed_count }: { license_id: string, failed_count: number }) => {
      fetchRiskScores();
      showToast(`CRITICAL ANOMALY: License ${license_id.substring(0, 8)}... has logged ${failed_count} failed verifications in the last hour!`, 'error');
    });

    socket.on('clients:init', (data: Client[]) => {
      setClients(data);
    });

    socket.on('clients:created', (client: Client) => {
      setClients((prev) => [...prev, client]);
    });

    socket.on('clients:deleted', (id: string) => {
      setClients((prev) => prev.filter((c) => c.id !== id));
    });

    socket.on('software_products:init', (data: SoftwareProduct[]) => {
      setSoftwareProducts(data);
    });

    socket.on('software_products:created', (prod: SoftwareProduct) => {
      setSoftwareProducts((prev) => [...prev, prod]);
    });

    socket.on('software_products:deleted', (id: string) => {
      setSoftwareProducts((prev) => prev.filter((p) => p.id !== id));
    });

    socket.on('license_tiers:init', (data: LicenseTier[]) => {
      setLicenseTiers(data);
    });

    socket.on('users:init', (data: AppUser[]) => {
      setAllUsers(data);
      const saved = localStorage.getItem('nonaxen_user');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          const found = data.find(u => u.id === parsed.id);
          if (found) setCurrentUser(found);
          else setCurrentUser(data[0]);
        } catch (e) {
          setCurrentUser(data[0]);
        }
      } else if (data.length > 0) {
        setCurrentUser(data[0]);
      }
    });

    socket.on('users:created', (user: AppUser) => {
      setAllUsers(prev => [user, ...prev]);
    });

    socket.on('users:role_updated', ({ id, role }: { id: string, role: AppRole }) => {
      setAllUsers(prev => prev.map(u => u.id === id ? { ...u, role } : u));
      setCurrentUser(prev => (prev && prev.id === id) ? { ...prev, role } : prev);
    });

    socket.on('users:deleted', (id: string) => {
      setAllUsers(prev => prev.filter(u => u.id !== id));
      setCurrentUser(prev => (prev && prev.id === id) ? null : prev);
    });

    socket.on('audit_logs:init', (data: AuditLog[]) => {
      setAuditLogs(data);
    });

    socket.on('audit:new', (log: AuditLog) => {
      setAuditLogs(prev => [log, ...prev]);
      if (log.action === 'zombie_disconnection') {
        showToast(`Zombie node ${log.entity_id.substring(0, 8)}... disconnected automatically`, 'error');
        setSimulationLogs(prev => [
          ...prev,
          `[${new Date().toLocaleTimeString()}] [ZOMBIE CLEANUP] Server automatically disconnected stale node: ${log.entity_id.substring(0, 8)}... (No heartbeat for >30s)`
        ]);
      }
    });

    socket.on('alerts:renewal', (data: any[]) => {
      setRenewalAlerts(data);
    });

    socket.on('license_tiers:created', (tier: LicenseTier) => {
      setLicenseTiers((prev) => [...prev, tier]);
    });

    socket.on('license_tiers:deleted', (id: string) => {
      setLicenseTiers((prev) => prev.filter((t) => t.id !== id));
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const handleCreateLicense = (licenseData: Partial<License>) => {
    if (!socketRef.current) return;
    
    if (editingMainLicense) {
      socketRef.current.emit("licenses:update_details", { id: editingMainLicense.id, updates: licenseData, user: currentUser });
      showToast('License details updated', 'success');
      setEditingMainLicense(null);
      return;
    }

    
    // Resolve dynamic price and limit config
    const prod = softwareProducts.find(p => p.name === licenseData.software_name);
    const tier = licenseTiers.find(t => t.name === licenseData.tier);

    const price = prod ? prod.base_price : 10000;
    const max_volume = tier ? tier.max_volume_usd : 10000000;
    const api_limit = tier ? tier.api_calls_limit : 10000;
    const api_limit_monthly = tier ? tier.api_calls_limit_monthly : 300000;
    const api_limit_yearly = tier ? tier.api_calls_limit_yearly : 3600000;

    const newLicense: License = {
      id: crypto.randomUUID(),
      software_name: licenseData.software_name || 'QuantMaster Pro',
      tier: licenseData.tier || 'Standard',
      license_key: generateSecureLicenseKey(),
      status: 'active',
      issued_to: licenseData.issued_to || 'Unknown Entity',
      hardware_id: null,
      ip_whitelist: null,
      features: JSON.stringify(licenseData.tier === 'Institutional' ? ['HFT', 'Sentiment', 'Dark Pool'] : ['Sentiment']),
      max_volume_usd: max_volume,
      api_calls_limit: api_limit,
      api_calls_limit_monthly: api_limit_monthly,
      api_calls_limit_yearly: api_limit_yearly,
      api_calls_count_daily: 0,
      api_calls_count_monthly: 0,
      api_calls_count_yearly: 0,
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      product_price: price,
      current_earnings: 0,
      daily_earnings: 0,
      weekly_earnings: 0,
      monthly_earnings: 0,
      last_active_ip: null,
      device_fingerprint: null,
      asset_classes: '["forex"]',
      restricted_accounts: '[]',
      billing_cycle: (licenseData.billing_cycle as 'monthly' | 'yearly' | 'onetime' | 'profit_share') || 'onetime',
      profit_share_pct: licenseData.billing_cycle === 'profit_share' ? (licenseData.profit_share_pct ?? 15) : undefined,
    };
    socketRef.current.emit('licenses:create', { license: newLicense, user: currentUser });
    setIsCreateModalOpen(false);
    showToast('License successfully provisioned', 'success');
  };

  const updateStatus = (id: string, status: string) => {
    if (!socketRef.current) return;
    socketRef.current.emit('licenses:update_status', { id, status, user: currentUser });
    showToast(`License status updated to ${status}`, 'success');
  };

  const deleteLicense = (id: string) => {
    if (!socketRef.current) return;
    socketRef.current.emit('licenses:delete', { id, user: currentUser });
    showToast('License permanently deleted', 'error');
  };

  const addClient = (clientData: Omit<Client, 'id'>) => {
    if (!socketRef.current) return;
    const newClient: Client = {
      ...clientData,
      id: 'cli_' + Math.random().toString(36).substring(2, 9)
    };
    socketRef.current.emit('clients:create', { client: newClient, user: currentUser });
  };


  const editClient = (id: string, updates: Partial<Client>) => {
    if (!socketRef.current) return;
    socketRef.current.emit('clients:update', { id, updates, user: currentUser });
    showToast('Client updated', 'success');
  };

  const editSoftwareProduct = (id: string, updates: Partial<SoftwareProduct>) => {
    if (!socketRef.current) return;
    socketRef.current.emit('software_products:update', { id, updates });
    showToast('Product updated', 'success');
  };

  const editLicenseTier = (id: string, updates: Partial<LicenseTier>) => {
    if (!socketRef.current) return;
    socketRef.current.emit('license_tiers:update', { id, updates });
    showToast('Tier updated', 'success');
  };

  const removeClient = (id: string) => {
    if (!socketRef.current) return;
    socketRef.current.emit('clients:delete', { id, user: currentUser });
    showToast('Client removed', 'error');
  };

  const addSoftwareProduct = (prodData: Omit<SoftwareProduct, 'id'>) => {
    if (!socketRef.current) return;
    const newProd: SoftwareProduct = {
      ...prodData,
      id: 'prod_' + Math.random().toString(36).substring(2, 9)
    };
    socketRef.current.emit('software_products:create', newProd);
  };

  const removeSoftwareProduct = (id: string) => {
    if (!socketRef.current) return;
    socketRef.current.emit('software_products:delete', id);
    showToast('Software Product removed', 'error');
  };

  const addLicenseTier = (tierData: Omit<LicenseTier, 'id'>) => {
    if (!socketRef.current) return;
    const newTier: LicenseTier = {
      ...tierData,
      id: 'tier_' + Math.random().toString(36).substring(2, 9)
    };
    socketRef.current.emit('license_tiers:create', newTier);
  };

  const removeLicenseTier = (id: string) => {
    if (!socketRef.current) return;
    socketRef.current.emit('license_tiers:delete', id);
    showToast('License Tier removed', 'error');
  };

  const isExpiringSoon = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = date.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays <= 30 && diffDays >= 0;
  };


  const filteredLicenses = licenses.filter(l => {
    const matchesSearch = l.issued_to.toLowerCase().includes(search.toLowerCase()) || 
                          l.license_key.toLowerCase().includes(search.toLowerCase()) ||
                          l.software_name.toLowerCase().includes(search.toLowerCase()) ||
                          l.tier.toLowerCase().includes(search.toLowerCase()) ||
                          (l.hardware_id?.toLowerCase().includes(search.toLowerCase()) ?? false) ||
                          (l.ip_whitelist?.toLowerCase().includes(search.toLowerCase()) ?? false) ||
                          (l.asset_classes?.toLowerCase().includes(search.toLowerCase()) ?? false);
    const matchesStatus = filterStatus === 'all' ? l.status !== 'archived' : l.status === filterStatus;
    
    const matchesTier = filterTier === 'all' || l.tier.toLowerCase() === filterTier.toLowerCase();
    
    let matchesAssetClass = true;
    if (filterAssetClass !== 'all') {
      try {
        const classes = JSON.parse(l.asset_classes || '[]');
        matchesAssetClass = Array.isArray(classes) && classes.some((c: string) => c.toLowerCase() === filterAssetClass.toLowerCase());
      } catch (e) {
        matchesAssetClass = false;
      }
    }
    
    const dateValue = new Date(l[dateRange.type]);
    const matchesDate = (!dateRange.start || dateValue >= new Date(dateRange.start)) &&
                        (!dateRange.end || dateValue <= new Date(dateRange.end));
    
    return matchesSearch && matchesStatus && matchesTier && matchesAssetClass && matchesDate;
  }).sort((a, b) => {
    if (!sortConfig) return 0;
    const { key, direction } = sortConfig;
    let aValue = a[key as keyof License] ?? '';
    let bValue = b[key as keyof License] ?? '';

    // special handling for risk score
    if (key === 'risk_score') {
      aValue = duckDBRiskScores[a.id]?.risk_score || calculateRiskScore(a);
      bValue = duckDBRiskScores[b.id]?.risk_score || calculateRiskScore(b);
    }
    
    if (aValue < bValue) {
      return direction === 'asc' ? -1 : 1;
    }
    if (aValue > bValue) {
      return direction === 'asc' ? 1 : -1;
    }
    return 0;
  });

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };


  const handleUpdateLicenseConfig = (id: string, config: any) => {
    if (!socketRef.current) return;
    socketRef.current.emit("licenses:update_config", { id, config });
    showToast('License configuration updated successfully!', 'success');
  };

  const handleResetHwid = (id: string) => {
    if (!socketRef.current) return;
    if (window.confirm('Are you sure you want to reset the hardware lock for this license? This will allow activation on a new device.')) {
      socketRef.current.emit('licenses:reset_hwid', { id, user: currentUser });
    }
  };

  const handleGenerateOfflineToken = async (id: string) => {
    try {
      const res = await fetch(`/api/license/${id}/sign`, { method: 'POST' });
      const data = await res.json();
      if (data.token) {
        // Find SettingsView's state or pass it back up? 
        // For now let's just show a toast or handle it globally if needed.
        // Actually, the SettingsView should probably handle its own state for the token display.
        // But the action can be triggered from elsewhere.
        showToast('Offline cryptographic token generated', 'success');
        return data.token;
      } else {
        showToast(data.error || 'Failed to generate token', 'error');
      }
    } catch (err) {
      showToast('Error generating token', 'error');
    }
    return null;
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    showToast('Copied to clipboard', 'success');
  };

  if (!isAuthenticated) {
    return <LoginPage onLogin={handleLogin} showToast={showToast} />;
  }

  const activeCount = licenses.filter(l => l.status === 'active').length;
  const revokedCount = licenses.filter(l => l.status === 'revoked').length;
  const expiredCount = licenses.filter(l => l.status === 'expired').length;

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-50 font-sans overflow-hidden selection:bg-indigo-500/30">
      {/* Mobile Menu Backdrop */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 w-64 bg-zinc-950 border-r border-zinc-800/50 flex flex-col shrink-0 transition-transform duration-300 lg:static lg:translate-x-0",
        isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="p-6 flex items-center justify-between text-zinc-50 border-b border-zinc-800/50 lg:border-none">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-500/20 border border-indigo-500/30 p-2 rounded-lg">
              <Key className="w-5 h-5 text-indigo-400" />
            </div>
            <h1 className="text-sm font-semibold tracking-wide leading-tight">QUANT<br/>LICENSE MGR</h1>
          </div>
          <button onClick={() => setIsMobileMenuOpen(false)} className="lg:hidden text-zinc-500 hover:text-zinc-300">
            <X className="w-5 h-5" />
          </button>
        </div>
        <nav className="flex-1 px-4 space-y-1.5 mt-4 lg:mt-2 overflow-y-auto">
          <button onClick={() => { setActiveTab('dashboard'); setIsMobileMenuOpen(false); }} className={cn("w-full flex items-center gap-3 px-3 py-2 rounded-lg font-medium text-sm transition-colors text-left border", activeTab === 'dashboard' ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/20" : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50 border-transparent")}>
            <Activity className="w-4 h-4" />
            Dashboard
          </button>
          {canViewAudit && (
            <button onClick={() => { setActiveTab('audit_logs'); setIsMobileMenuOpen(false); }} className={cn("w-full flex items-center gap-3 px-3 py-2 rounded-lg font-medium text-sm transition-colors text-left border", activeTab === 'audit_logs' ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/20" : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50 border-transparent")}>
              <FileText className="w-4 h-4" />
              Audit Trail
            </button>
          )}
          <button onClick={() => { setActiveTab('licenses'); setIsMobileMenuOpen(false); }} className={cn("w-full flex items-center gap-3 px-3 py-2 rounded-lg font-medium text-sm transition-colors text-left border", activeTab === 'licenses' ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/20" : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50 border-transparent")}>
            <Key className="w-4 h-4" />
            License Management
          </button>
          <button onClick={() => { setActiveTab('validate_key'); setIsMobileMenuOpen(false); }} className={cn("w-full flex items-center gap-3 px-3 py-2 rounded-lg font-medium text-sm transition-colors text-left border", activeTab === 'validate_key' ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/20" : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50 border-transparent")}>
            <Check className="w-4 h-4" />
            Validate Key
          </button>
          {canManageSystem && (
            <button onClick={() => { setActiveTab('users'); setIsMobileMenuOpen(false); }} className={cn("w-full flex items-center gap-3 px-3 py-2 rounded-lg font-medium text-sm transition-colors text-left border", activeTab === 'users' ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/20" : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50 border-transparent")}>
              <Users className="w-4 h-4" />
              User Management
            </button>
          )}
          <button onClick={() => { setActiveTab('funds'); setIsMobileMenuOpen(false); }} className={cn("w-full flex items-center gap-3 px-3 py-2 rounded-lg font-medium text-sm transition-colors text-left border", activeTab === 'funds' ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/20" : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50 border-transparent")}>
            <Building className="w-4 h-4" />
            Funds & Clients
          </button>
          {canManageSystem && (
            <>
              <button onClick={() => { setActiveTab('products'); setIsMobileMenuOpen(false); }} className={cn("w-full flex items-center gap-3 px-3 py-2 rounded-lg font-medium text-sm transition-colors text-left border", activeTab === 'products' ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/20" : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50 border-transparent")}>
                <Cpu className="w-4 h-4" />
                Software Products
              </button>
              <button onClick={() => { setActiveTab('tiers'); setIsMobileMenuOpen(false); }} className={cn("w-full flex items-center gap-3 px-3 py-2 rounded-lg font-medium text-sm transition-colors text-left border", activeTab === 'tiers' ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/20" : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50 border-transparent")}>
                <Layers className="w-4 h-4" />
                License Tiers
              </button>
            </>
          )}
          <button onClick={() => { setActiveTab('nodes'); setIsMobileMenuOpen(false); }} className={cn("w-full flex items-center gap-3 px-3 py-2 rounded-lg font-medium text-sm transition-colors text-left border", activeTab === 'nodes' ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/20" : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50 border-transparent")}>
            <Server className="w-4 h-4" />
            Nodes
          </button>
          <button onClick={() => { setActiveTab('settings'); setIsMobileMenuOpen(false); }} className={cn("w-full flex items-center gap-3 px-3 py-2 rounded-lg font-medium text-sm transition-colors text-left border", activeTab === 'settings' ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/20" : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50 border-transparent")}>
            <Settings className="w-4 h-4" />
            Settings
          </button>
        </nav>
        <div className="p-4 border-t border-zinc-800/50 shrink-0 space-y-2">
          <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-400 bg-zinc-900/50 px-3 py-2 rounded border border-zinc-800">
            <div className={cn("w-1.5 h-1.5 rounded-full", connected ? "bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)]" : "bg-rose-500")} />
            {connected ? 'SYNC_ACTIVE' : 'OFFLINE'}
          </div>
          {systemPublicKey && (
            <div className="flex items-center gap-2 text-[10px] font-mono text-emerald-400/80 bg-emerald-500/5 px-3 py-2 rounded border border-emerald-500/10">
              <ShieldCheck className="w-3 h-3" />
              RSA_KEY_ACTIVE
            </div>
          )}
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-2 text-[10px] font-mono text-zinc-500 hover:text-rose-400 bg-zinc-900/30 hover:bg-rose-500/5 px-3 py-2 rounded border border-zinc-800 hover:border-rose-500/20 transition-all cursor-pointer group"
          >
            <LogOut className="w-3 h-3 group-hover:rotate-12 transition-transform" />
            TERMINATE_SESSION
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden w-full">
        {/* Renewal & Risk Alerts Banner */}
        {(renewalAlerts.length > 0 || riskAlerts.length > 0) && (
          <div className="bg-rose-500/5 border-b border-rose-500/10 shrink-0">
            <div className="px-4 lg:px-6 py-2 flex items-center gap-6 overflow-x-auto no-scrollbar">
              {renewalAlerts.length > 0 && (
                <div className="flex items-center gap-4 shrink-0">
                  <div className="flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
                    <span className="text-[10px] font-bold text-rose-500 uppercase tracking-widest">Expiration</span>
                  </div>
                  <div className="flex gap-2">
                    {renewalAlerts.map(alert => (
                      <div key={alert.id} className={cn(
                        "flex items-center gap-2 px-2.5 py-0.5 rounded-md text-[10px] font-mono border transition-all",
                        alert.severity === 'critical' ? "bg-rose-500/20 text-rose-200 border-rose-500/30 shadow-[0_0_10px_rgba(244,63,94,0.1)]" : 
                        alert.severity === 'warning' ? "bg-amber-500/10 text-amber-300 border-amber-500/20" : 
                        "bg-zinc-800 text-zinc-400 border-zinc-700"
                      )}>
                        <span className="font-bold uppercase">{alert.software_name}</span>
                        <span className="opacity-70">{alert.days_remaining}D</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {riskAlerts.length > 0 && (
                <div className="flex items-center gap-4 shrink-0 border-l border-zinc-800 pl-6">
                  <div className="flex items-center gap-1.5">
                    <ShieldAlert className="w-3.5 h-3.5 text-indigo-400" />
                    <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">Security</span>
                  </div>
                  <div className="flex gap-2">
                    {riskAlerts.map(alert => (
                      <div key={alert.id} className="flex items-center gap-2 px-2.5 py-0.5 rounded-md text-[10px] font-mono bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 transition-all">
                        <span className="font-bold uppercase">{alert.software_name}</span>
                        <span className="opacity-70">RISK: {alert.score}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        
        {/* Header */}
        <header className="bg-zinc-900/30 border-b border-zinc-800/50 shrink-0 backdrop-blur-md">
          <div className="px-4 lg:px-6 h-16 flex items-center justify-between">
            <div className="flex items-center gap-3 lg:gap-0">
              <button 
                onClick={() => setIsMobileMenuOpen(true)}
                className="p-2 -ml-2 text-zinc-400 hover:text-zinc-100 lg:hidden"
              >
                <Menu className="w-5 h-5" />
              </button>
              <h2 className="text-lg font-medium tracking-tight text-zinc-100 truncate max-w-[200px] sm:max-w-none">
                {activeTab === 'dashboard' && 'System Dashboard'}
                {activeTab === 'licenses' && 'License Activity Console'}
                {activeTab === 'users' && 'User Management'}
                {activeTab === 'validate_key' && 'Validate License Key'}
                {activeTab === 'funds' && 'Funds & Clients'}
                {activeTab === 'products' && 'Software Products Catalog'}
                {activeTab === 'tiers' && 'License Tiers Settings'}
                {activeTab === 'nodes' && 'Trading Nodes'}
                {activeTab === 'settings' && 'System Settings'}
              </h2>
            </div>
            <div className="flex items-center gap-4">
              {activeTab === 'licenses' && canManageLicenses && (
                <button 
                  onClick={() => setIsCreateModalOpen(true)}
                  className="flex items-center gap-2 bg-indigo-500 hover:bg-indigo-400 text-zinc-950 px-4 py-1.5 rounded-md text-sm font-semibold transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Provision License
                </button>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6 lg:p-8">
          
          {/* Stats */}
        {(activeTab === 'dashboard' || activeTab === 'licenses') && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <StatCard title="Active Trading Nodes" value={activeCount} icon={Server} color="text-indigo-400" bgColor="bg-indigo-500/10 border border-indigo-500/20" />
            <StatCard title="Total Client Earnings" value={`$${(licenses.reduce((acc, l) => acc + (l.current_earnings || 0), 0) / 1000).toFixed(1)}k`} icon={Activity} color="text-emerald-400" bgColor="bg-emerald-500/10 border border-emerald-500/20" />
            <StatCard title="Total License Revenue" value={`$${(licenses.reduce((acc, l) => acc + getLicenseFee(l), 0) / 1000).toFixed(0)}k`} icon={Building} color="text-blue-400" bgColor="bg-blue-500/10 border border-blue-500/20" />
            <StatCard title="Suspended/Revoked" value={revokedCount + licenses.filter(l => l.status === 'suspended').length} icon={ShieldAlert} color="text-rose-400" bgColor="bg-rose-500/10 border border-rose-500/20" />
          </div>
        )}

        {/* Licenses Tab */}
        {activeTab === 'licenses' && (
          <>
            {/* Controls */}
        <div className="bg-zinc-900/50 p-4 rounded-xl border border-zinc-800/50 mb-6 flex flex-wrap gap-4 items-center">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input 
              type="text" 
              placeholder="Search by fund, key, or product..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-zinc-950/50 border border-zinc-800 rounded-lg text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 placeholder:text-zinc-600 transition-all font-mono"
            />
          </div>
          
          <div className="flex items-center gap-2 flex-wrap">
            <select value={dateRange.type} onChange={e => setDateRange({...dateRange, type: e.target.value as any})} className="bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-2 text-xs text-zinc-300 font-mono focus:outline-none">
              <option value="created_at">Issued At</option>
              <option value="expires_at">Expires At</option>
            </select>
            <input type="date" value={dateRange.start} onChange={e => setDateRange({...dateRange, start: e.target.value})} className="bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-2 text-xs text-zinc-300 font-mono focus:outline-none" />
            <input type="date" value={dateRange.end} onChange={e => setDateRange({...dateRange, end: e.target.value})} className="bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-2 text-xs text-zinc-300 font-mono focus:outline-none" />
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">Tier</span>
            <select 
              value={filterTier} 
              onChange={e => setFilterTier(e.target.value)} 
              className="bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-2 text-xs text-zinc-300 font-mono focus:outline-none focus:border-indigo-500 cursor-pointer"
            >
              <option value="all">All Tiers</option>
              {licenseTiers.map(t => (
                <option key={t.id} value={t.name}>{t.name}</option>
              ))}
              {!licenseTiers.some(t => t.name.toLowerCase() === 'standard') && <option value="Standard">Standard</option>}
              {!licenseTiers.some(t => t.name.toLowerCase() === 'professional') && <option value="Professional">Professional</option>}
              {!licenseTiers.some(t => t.name.toLowerCase() === 'enterprise') && <option value="Enterprise">Enterprise</option>}
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">Asset</span>
            <select 
              value={filterAssetClass} 
              onChange={e => setFilterAssetClass(e.target.value)} 
              className="bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-2 text-xs text-zinc-300 font-mono focus:outline-none focus:border-indigo-500 cursor-pointer"
            >
              <option value="all">All Assets</option>
              <option value="forex">Forex</option>
              <option value="crypto">Crypto</option>
              <option value="stocks">Stocks</option>
            </select>
          </div>

          {canManageLicenses && (
            <>
              <button 
                onClick={() => setShowProfitShareCalc(true)}
                className="flex items-center gap-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                <Calculator className="w-4 h-4" />
                Profit Share Calculator
              </button>
              <button 
                onClick={() => setIsCreateModalOpen(true)}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                <Plus className="w-4 h-4" />
                New License
              </button>
            </>
          )}

          <div className="flex bg-zinc-950 p-1 rounded-lg ml-auto border border-zinc-800">
            {['all', 'active', 'suspended', 'revoked', 'archived'].map(status => (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                className={cn(
                  "px-4 py-1.5 text-xs font-mono rounded-md uppercase tracking-wider transition-colors",
                  filterStatus === status ? "bg-zinc-800 text-indigo-400 shadow-sm border border-zinc-700/50" : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50"
                )}
              >
                {status}
              </button>
            ))}
          </div>
        </div>

        {/* Bulk Actions Toolbar */}
        {selectedLicenses.size > 0 && (
          (() => {
            const selected = licenses.filter(l => selectedLicenses.has(l.id));
            const activeCount = selected.filter(l => l.status === 'active').length;
            const suspendedCount = selected.filter(l => l.status === 'suspended').length;
            return (
              <div className="bg-indigo-900/20 border border-indigo-500/30 p-4 rounded-xl mb-6 flex items-center justify-between">
                <span className="text-sm text-indigo-200 font-medium">
                  {selectedLicenses.size} licenses selected
                  <span className="text-xs ml-3 text-indigo-300/70 font-mono">
                    ({activeCount} Active, {suspendedCount} Suspended)
                  </span>
                </span>
                <div className="flex gap-2">
                  {canManageLicenses && (
                    <>
                      <button onClick={() => executeBulkAction('activate')} className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 px-3 py-1.5 rounded text-xs font-semibold hover:bg-emerald-500/30">Activate</button>
                      <button onClick={() => executeBulkAction('suspend')} className="bg-amber-500/20 text-amber-400 border border-amber-500/20 px-3 py-1.5 rounded text-xs font-semibold hover:bg-amber-500/30">Suspend</button>
                      {selected.some(l => l.status !== 'archived') && (
                        <button onClick={() => executeBulkAction('archive')} className="bg-purple-500/20 text-purple-400 border border-purple-500/20 px-3 py-1.5 rounded text-xs font-semibold hover:bg-purple-500/30">Archive</button>
                      )}
                      {selected.some(l => l.status === 'archived') && (
                        <button onClick={() => executeBulkAction('restore')} className="bg-teal-500/20 text-teal-400 border border-teal-500/20 px-3 py-1.5 rounded text-xs font-semibold hover:bg-teal-500/30">Restore</button>
                      )}
                      <button onClick={() => setIsBatchEditModalOpen(true)} className="bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 px-3 py-1.5 rounded text-xs font-semibold hover:bg-indigo-500/30">Batch Edit</button>
                      <button onClick={() => { setExtendingLicense(null); setIsTransferModalOpen(true); }} className="bg-blue-500/20 text-blue-400 border border-blue-500/20 px-3 py-1.5 rounded text-xs font-semibold hover:bg-blue-500/30">Transfer</button>
                      <button onClick={() => setIsRiskMitigationModalOpen(true)} className="bg-rose-500/20 text-rose-400 border border-rose-500/20 px-3 py-1.5 rounded text-xs font-semibold hover:bg-rose-500/30">Risk Mitigation</button>
                    </>
                  )}
                  <button onClick={exportLicensesToCSV} className="bg-zinc-700/20 text-zinc-300 border border-zinc-700/20 px-3 py-1.5 rounded text-xs font-semibold hover:bg-zinc-700/30">Export CSV</button>
                  <button onClick={exportLicensesToPDF} className="bg-zinc-700/20 text-zinc-300 border border-zinc-700/20 px-3 py-1.5 rounded text-xs font-semibold hover:bg-zinc-700/30">Export PDF</button>
                  {canManageLicenses && (
                    <button onClick={() => executeBulkAction('delete')} className="bg-rose-500/20 text-rose-400 border border-rose-500/20 px-3 py-1.5 rounded text-xs font-semibold hover:bg-rose-500/30">Delete</button>
                  )}
                </div>
              </div>
            );
          })()
        )}

        {/* Card View (Mobile) */}
        <div className="md:hidden space-y-4">
          {filteredLicenses.map((license) => {
            const scoreDetails = duckDBRiskScores[license.id];
            const score = scoreDetails ? scoreDetails.risk_score : calculateRiskScore(license);
            const Icon = score <= 30 ? ShieldCheck : score <= 70 ? Shield : ShieldAlert;
            const textColor = score <= 30 ? "text-emerald-500" : score <= 70 ? "text-amber-500" : "text-rose-500";
            return (
              <div key={license.id} className="bg-zinc-900/30 border border-zinc-800/80 rounded-xl p-4 space-y-3" onClick={() => setSelectedLicense(license)}>
                <div className="flex justify-between items-start">
                  <div className="flex flex-col">
                    <span className="font-mono text-zinc-200">{license.license_key}</span>
                    <span className="text-zinc-400 text-xs">{license.software_name}</span>
                  </div>
                  <StatusBadge status={license.status} />
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-zinc-500">Earnings:</span>
                  <span className="text-emerald-400 font-mono">${(license.current_earnings || 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-zinc-500">Risk Score:</span>
                  <div className="flex items-center gap-1">
                    <Icon className={cn("w-4 h-4", textColor)} />
                    <span className={cn("font-mono font-bold", textColor)}>{score}</span>
                  </div>
                </div>
                <div className="pt-2 border-t border-zinc-800 flex justify-end gap-2">
                    <button onClick={(e) => { e.stopPropagation(); simulatePing(license); }} className="p-2 text-zinc-400 hover:text-indigo-400 bg-zinc-950 rounded border border-zinc-800" title="Simulate Bot Ping">
                      <Send className="w-4 h-4" />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); openEvents(license); }} className="p-2 text-zinc-400 hover:text-indigo-400 bg-zinc-950 rounded border border-zinc-800" title="View Audit Logs & Events">
                      <List className="w-4 h-4" />
                    </button>
                    {canManageLicenses && (
                      <button onClick={(e) => { e.stopPropagation(); setRenewingLicense(license); setIsRenewModalOpen(true); }} className="p-2 text-zinc-400 hover:text-indigo-400 bg-zinc-950 rounded border border-zinc-800" title="Renew">
                        <RefreshCw className="w-4 h-4" />
                      </button>
                    )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Table */}
        <div className="hidden md:block bg-zinc-900/30 border border-zinc-800/80 rounded-xl overflow-hidden backdrop-blur-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-zinc-900/80 border-b border-zinc-800/80 text-zinc-400">
                <tr>
                  <th className="px-6 py-4">
                    <input type="checkbox" checked={selectedLicenses.size === filteredLicenses.length && filteredLicenses.length > 0} onChange={toggleSelectAll} className="rounded border-zinc-700 bg-zinc-900 text-indigo-500 focus:ring-indigo-500/20 w-4 h-4" />
                  </th>
                  
                  {visibleColumns.license && (
                    <th className="px-6 py-4 font-mono text-[10px] uppercase tracking-wider cursor-pointer hover:text-zinc-100" onClick={() => handleSort('license_key')}>
                      License / Tier
                      {sortConfig?.key === 'license_key' && (sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3 inline ml-1" /> : <ChevronDown className="w-3 h-3 inline ml-1" />)}
                    </th>
                  )}

                  
                  {visibleColumns.software && (
                    <th className="px-6 py-4 font-mono text-[10px] uppercase tracking-wider cursor-pointer hover:text-zinc-100" onClick={() => handleSort('software_name')}>
                      Software / Fund
                      {sortConfig?.key === 'software_name' && (sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3 inline ml-1" /> : <ChevronDown className="w-3 h-3 inline ml-1" />)}
                    </th>
                  )}

                  
                  {visibleColumns.security && <th className="px-6 py-4 font-mono text-[10px] uppercase tracking-wider">Security / Limits</th>}

                  
                  {visibleColumns.risk && (
                    <th className="px-6 py-4 font-mono text-[10px] uppercase tracking-wider cursor-pointer hover:text-zinc-100" onClick={() => handleSort('risk_score')}>
                      License Health
                      {sortConfig?.key === 'risk_score' && (sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3 inline ml-1" /> : <ChevronDown className="w-3 h-3 inline ml-1" />)}
                    </th>
                  )}

                  
                  {visibleColumns.earnings && (
                    <th className="px-6 py-4 font-mono text-[10px] uppercase tracking-wider cursor-pointer hover:text-zinc-100" onClick={() => handleSort('current_earnings')}>
                      Client Earnings
                      {sortConfig?.key === 'current_earnings' && (sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3 inline ml-1" /> : <ChevronDown className="w-3 h-3 inline ml-1" />)}
                    </th>
                  )}

                  
                  {visibleColumns.status && (
                    <th className="px-6 py-4 font-mono text-[10px] uppercase tracking-wider cursor-pointer hover:text-zinc-100" onClick={() => handleSort('expires_at')}>
                      Status / Dates
                      {sortConfig?.key === 'expires_at' && (sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3 inline ml-1" /> : <ChevronDown className="w-3 h-3 inline ml-1" />)}
                    </th>
                  )}

                  <th className="px-6 py-4 font-mono text-[10px] uppercase tracking-wider text-right flex items-center justify-end gap-2">
                    Actions
                    <div className="relative group">
                      <Settings className="w-3 h-3 cursor-pointer hover:text-indigo-400" />
                      <div className="absolute right-0 top-full mt-2 w-48 bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl p-2 hidden group-hover:block z-20">
                        {Object.entries(visibleColumns).map(([key, value]) => (
                          <label key={key} className="flex items-center gap-2 px-2 py-1.5 hover:bg-zinc-800 rounded cursor-pointer text-xs text-zinc-300">
                            <input type="checkbox" checked={value} onChange={e => setVisibleColumns({...visibleColumns, [key]: e.target.checked})} className="rounded border-zinc-700 bg-zinc-900 text-indigo-500 w-3 h-3" />
                            {key.charAt(0).toUpperCase() + key.slice(1)}
                          </label>
                        ))}
                      </div>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {filteredLicenses.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-zinc-500">
                      <div className="flex flex-col items-center justify-center">
                        <Key className="w-8 h-8 text-zinc-700 mb-3" />
                        <p className="font-mono text-xs">NO LICENSES FOUND</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredLicenses.map((license) => (
                    <React.Fragment key={license.id}>
                      <tr className={cn("hover:bg-zinc-800/30 transition-colors group cursor-pointer", selectedLicenses.has(license.id) && "bg-indigo-900/10")} onClick={() => toggleRow(license.id)}>
                        <td className="px-6 py-4">
                          <input type="checkbox" checked={selectedLicenses.has(license.id)} onChange={(e) => { e.stopPropagation(); toggleSelect(license.id); }} className="rounded border-zinc-700 bg-zinc-900 text-indigo-500 focus:ring-indigo-500/20 w-4 h-4" />
                        </td>
                        <td className="px-1 py-4">
                          {expandedRows.has(license.id) ? <ChevronDown className="w-4 h-4 text-zinc-400" /> : <ChevronRight className="w-4 h-4 text-zinc-400" />}
                        </td>
                        {visibleColumns.license && (
                          <td className="px-6 py-4">
                            <div className="flex flex-col gap-1.5">
                              <div className="flex items-center gap-2">
                                <div className="font-mono text-zinc-300 bg-zinc-950 px-2 py-1 rounded text-xs border border-zinc-800/80 max-w-fit shadow-inner">
                                  {license.license_key}
                                </div>
                                {duckDBRiskScores[license.id]?.high_risk_flag && (
                                  <span className="text-[9px] font-mono font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30 px-1.5 py-0.5 rounded uppercase tracking-wider animate-pulse flex items-center gap-1" title={`${duckDBRiskScores[license.id]?.failed_pings_last_hour} failed verifications in the last hour`}>
                                    <AlertTriangle className="w-3 h-3 text-rose-400" /> HIGH-RISK
                                  </span>
                                )}
                              </div>
                              <span className={cn("text-[10px] font-mono font-medium px-1.5 py-0.5 rounded max-w-fit uppercase tracking-wider", 
                                license.tier === 'Institutional' ? "bg-purple-500/10 text-purple-400 border border-purple-500/20" :
                                license.tier === 'Professional' ? "bg-blue-500/10 text-blue-400 border border-blue-500/20" :
                                "bg-zinc-800 text-zinc-400 border border-zinc-700"
                              )}>
                                {license.tier}
                              </span>
                            </div>
                          </td>
                        )}
                        {visibleColumns.software && (
                          <td className="px-6 py-4">
                            <div className="flex flex-col">
                              <span className="font-medium text-zinc-200">{license.software_name}</span>
                              <span className="text-zinc-500 text-xs flex items-center gap-1 mt-1 font-mono">
                                <Building className="w-3 h-3 text-zinc-600" />
                                {license.issued_to}
                              </span>
                              <span className="text-emerald-400 text-[10px] font-mono mt-1.5 bg-emerald-500/10 px-1.5 py-0.5 rounded w-fit border border-emerald-500/20 animate-pulse">
                                {license.billing_cycle === 'profit_share' ? (
                                  `FEE: ${license.profit_share_pct ?? 15}% PROFIT SHARE ($${getLicenseFee(license).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}/mo)`
                                ) : (
                                  `FEE: $${license.product_price?.toLocaleString()}`
                                )}
                              </span>
                            </div>
                          </td>
                        )}
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-1.5">
                            <div className="flex items-center gap-2">
                              {license.hardware_id ? (
                                <span className="text-[10px] font-mono text-zinc-400 flex items-center gap-1 bg-zinc-950 px-1.5 py-0.5 rounded border border-zinc-800" title="Hardware Locked"><Cpu className="w-3 h-3 text-indigo-400"/> {license.hardware_id}</span>
                              ) : (
                                <span className="text-[10px] font-mono text-zinc-600 flex items-center gap-1"><Cpu className="w-3 h-3"/> UNLOCKED</span>
                              )}
                              {license.ip_whitelist && (
                                <span className="text-[10px] font-mono text-zinc-400 flex items-center gap-1 bg-zinc-950 px-1.5 py-0.5 rounded border border-zinc-800" title="IP Whitelisted"><Server className="w-3 h-3 text-indigo-400"/> {license.ip_whitelist}</span>
                              )}
                            </div>
                            <div className="text-[10px] font-mono text-zinc-500 flex items-center gap-1 mt-1">
                              <Activity className="w-3 h-3 text-zinc-600" /> 
                              VOL_CAP: ${(license.max_volume_usd / 1000000).toFixed(0)}M
                            </div>
                            {license.device_fingerprint && (
                              <div className="text-[9px] text-zinc-600 font-mono mt-0.5" title={`Last IP: ${license.last_active_ip}`}>
                                FP:{license.device_fingerprint}
                              </div>
                            )}
                          </div>
                        </td>
                        {visibleColumns.risk && (
                          <td className="px-6 py-4">
                            {(() => {
                              const scoreDetails = duckDBRiskScores[license.id];
                              const score = scoreDetails ? scoreDetails.risk_score : calculateRiskScore(license);
                              const Icon = score <= 30 ? ShieldCheck : score <= 70 ? Shield : ShieldAlert;
                              const color = score <= 30 ? "bg-emerald-500" : score <= 70 ? "bg-amber-500" : "bg-rose-500";
                              const textColor = score <= 30 ? "text-emerald-500" : score <= 70 ? "text-amber-500" : "text-rose-500";
                              return (
                                <div className="flex items-center gap-3 relative group cursor-help">
                                  {/* Rich Tooltip Breakdown */}
                                  <div className="absolute bottom-full left-0 mb-3 w-64 p-4 bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl opacity-0 group-hover:opacity-100 transition-all pointer-events-none z-[100] transform translate-y-2 group-hover:translate-y-0 backdrop-blur-xl">
                                    <div className="flex items-center justify-between mb-3 pb-2 border-b border-zinc-800">
                                      <div className="flex items-center gap-2">
                                        <div className={cn("p-1.5 rounded-md", color.replace('bg-', 'bg-opacity-20 '))}>
                                          <Icon className={cn("w-3.5 h-3.5", textColor)} />
                                        </div>
                                        <span className="text-[11px] font-bold text-zinc-100 uppercase tracking-wider">Risk Analysis</span>
                                      </div>
                                      <span className={cn("text-xs font-mono font-bold", textColor)}>{score}%</span>
                                    </div>
                                    
                                    <div className="space-y-3">
                                      <div className="space-y-1">
                                        <div className="flex justify-between items-center text-[10px]">
                                          <span className="text-zinc-500">Heartbeat Failures</span>
                                          <span className={cn("font-mono font-bold", (scoreDetails?.failed_pings || 0) > 0 ? "text-rose-400" : "text-emerald-400")}>
                                            +{Math.min((scoreDetails?.failed_pings || 0) * 10, 30)}
                                          </span>
                                        </div>
                                        <div className="w-full h-1 bg-zinc-900 rounded-full overflow-hidden">
                                          <div className="h-full bg-rose-500/50" style={{ width: `${Math.min(((scoreDetails?.failed_pings || 0) * 10) / 1, 100)}%` }} />
                                        </div>
                                        <div className="text-[9px] text-zinc-600 italic">Detected {scoreDetails?.failed_pings || 0} failed verification attempts</div>
                                        {scoreDetails?.high_risk_flag && (
                                          <div className="text-[9px] text-rose-400 font-bold mt-1.5 bg-rose-500/10 border border-rose-500/20 rounded px-1.5 py-0.5 flex items-center gap-1">
                                            ⚠️ ANOMALY: {scoreDetails.failed_pings_last_hour} fails in the last hour!
                                          </div>
                                        )}
                                      </div>

                                      <div className="space-y-1">
                                        <div className="flex justify-between items-center text-[10px]">
                                          <span className="text-zinc-500">Geographic Anomalies</span>
                                          <span className={cn("font-mono font-bold", (scoreDetails?.distinct_ips || 0) > 1 ? "text-rose-400" : "text-emerald-400")}>
                                            +{Math.min(Math.max((scoreDetails?.distinct_ips || 0) - 1, 0) * 15, 35)}
                                          </span>
                                        </div>
                                        <div className="w-full h-1 bg-zinc-900 rounded-full overflow-hidden">
                                          <div className="h-full bg-amber-500/50" style={{ width: `${Math.min((Math.max((scoreDetails?.distinct_ips || 0) - 1, 0) * 15) / 0.35, 100)}%` }} />
                                        </div>
                                        <div className="text-[9px] text-zinc-600 italic">Accessed from {scoreDetails?.distinct_ips || 1} distinct IP addresses</div>
                                      </div>

                                      <div className="space-y-1">
                                        <div className="flex justify-between items-center text-[10px]">
                                          <span className="text-zinc-500">Hardware Drift</span>
                                          <span className={cn("font-mono font-bold", (scoreDetails?.distinct_hwids || 0) > 1 ? "text-rose-400" : "text-emerald-400")}>
                                            +{Math.min(Math.max((scoreDetails?.distinct_hwids || 0) - 1, 0) * 20, 35)}
                                          </span>
                                        </div>
                                        <div className="w-full h-1 bg-zinc-900 rounded-full overflow-hidden">
                                          <div className="h-full bg-indigo-500/50" style={{ width: `${Math.min((Math.max((scoreDetails?.distinct_hwids || 0) - 1, 0) * 20) / 0.35, 100)}%` }} />
                                        </div>
                                        <div className="text-[9px] text-zinc-600 italic">Shared across {scoreDetails?.distinct_hwids || 1} hardware signatures</div>
                                      </div>

                                      {(license.status === 'revoked' || license.status === 'suspended') && (
                                        <div className="pt-2 border-t border-zinc-800">
                                          <div className="flex justify-between items-center text-[10px]">
                                            <span className="text-zinc-500">Administrative Penalty</span>
                                            <span className="font-mono font-bold text-rose-400">+{license.status === 'revoked' ? 50 : 25}</span>
                                          </div>
                                          <div className="text-[9px] text-rose-600 italic mt-0.5 uppercase font-bold">Status: {license.status}</div>
                                        </div>
                                      )}
                                    </div>

                                    <div className="mt-4 pt-3 border-t border-zinc-800 flex items-center justify-between">
                                      <div className="flex items-center gap-1.5">
                                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                                        <span className="text-[9px] text-zinc-500 font-mono uppercase tracking-tighter">OLAP Engine: DuckDB v0.10</span>
                                      </div>
                                    </div>
                                  </div>

                                  <Icon className={cn("w-4 h-4", textColor)} />
                                  <div className="flex flex-col gap-1">
                                    <div className="w-20 h-1.5 bg-zinc-800 rounded-full overflow-hidden shadow-inner">
                                      <div className={cn("h-full transition-all duration-500 ease-out", color)} style={{ width: `${score}%` }} />
                                    </div>
                                    <span className={cn("text-[10px] font-mono font-bold", textColor)}>
                                      Score: {score}
                                    </span>
                                  </div>
                                </div>
                              );
                            })()}
                          </td>
                        )}
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-1.5">
                            <span className="text-emerald-400 font-mono font-medium tracking-tight bg-emerald-950/30 px-2 py-1 rounded-md border border-emerald-900/50 max-w-fit shadow-inner">
                              ${(license.current_earnings || 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                            </span>
                            <div className="flex items-center gap-2 text-[10px] text-zinc-500 font-mono mt-0.5">
                              <span title="Daily" className="bg-zinc-900 px-1 rounded border border-zinc-800">D:${(license.daily_earnings || 0).toLocaleString(undefined, {maximumFractionDigits:0})}</span>
                              <span title="Weekly" className="bg-zinc-900 px-1 rounded border border-zinc-800">W:${(license.weekly_earnings || 0).toLocaleString(undefined, {maximumFractionDigits:0})}</span>
                              <span title="Monthly" className="bg-zinc-900 px-1 rounded border border-zinc-800">M:${(license.monthly_earnings || 0).toLocaleString(undefined, {maximumFractionDigits:0})}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-1.5">
                            <StatusBadge status={license.status} />
                            <div className="flex flex-col mt-0.5">
                              <span className="text-zinc-500 font-mono text-[9px] uppercase">Iss: {format(new Date(license.created_at), 'MMM d, yy')}</span>
                              <span className={cn("font-mono text-[9px] uppercase", isExpiringSoon(license.expires_at) ? "text-yellow-500" : "text-zinc-600")}>Exp: {format(new Date(license.expires_at), 'MMM d, yy')}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end items-center gap-2 opacity-100 sm:opacity-50 group-hover:opacity-100 transition-opacity">
                            {!isReadOnly && (
                              <button onClick={(e) => { e.stopPropagation(); simulatePing(license); }} className="p-1.5 text-zinc-400 hover:text-indigo-400 hover:bg-indigo-500/10 rounded transition-colors border border-transparent hover:border-indigo-500/20" title="Simulate Bot Ping">
                                <Send className="w-4 h-4" />
                              </button>
                            )}
                            <button onClick={(e) => { e.stopPropagation(); openEvents(license); }} className="p-1.5 text-zinc-400 hover:text-indigo-400 hover:bg-indigo-500/10 rounded transition-colors border border-transparent hover:border-indigo-500/20" title="View Audit Logs & Events">
                              <List className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={(e) => { e.stopPropagation(); runAudit(license.id); }} 
                              className="p-1.5 text-zinc-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded transition-colors border border-transparent hover:border-emerald-500/20 relative group" 
                              title={auditResults[license.id] || "Run Quick Audit"}
                            >
                              <ShieldCheck className="w-4 h-4" />
                              <div className="absolute right-0 bottom-full mb-2 hidden group-hover:block bg-zinc-950 text-emerald-400 text-[10px] p-2 rounded border border-zinc-800 whitespace-nowrap z-50">
                                {auditResults[license.id] || "Click to audit"}
                              </div>
                            </button>
                            {canManageLicenses && (
                              <>
                                <div className="w-px h-4 bg-zinc-800 mx-1"></div>
                                <button onClick={(e) => { e.stopPropagation(); setRenewingLicense(license); setIsRenewModalOpen(true); }} className="p-1.5 text-zinc-400 hover:text-indigo-400 hover:bg-indigo-500/10 rounded transition-colors border border-transparent hover:border-indigo-500/20" title="Renew">
                                  <RefreshCw className="w-4 h-4" />
                                </button>
                                {license.status !== 'active' && (
                                  <button onClick={(e) => { e.stopPropagation(); updateStatus(license.id, 'active'); }} className="p-1.5 text-zinc-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded transition-colors border border-transparent hover:border-emerald-500/20" title="Activate">
                                    <ShieldCheck className="w-4 h-4" />
                                  </button>
                                )}
                                {license.status === 'active' && (
                                  <button onClick={(e) => { e.stopPropagation(); updateStatus(license.id, 'suspended'); }} className="p-1.5 text-zinc-400 hover:text-amber-400 hover:bg-amber-500/10 rounded transition-colors border border-transparent hover:border-amber-500/20" title="Suspend (Kill Switch)">
                                    <StopCircle className="w-4 h-4" />
                                  </button>
                                )}
                                {license.status !== 'revoked' && (
                                  <button onClick={(e) => { e.stopPropagation(); updateStatus(license.id, 'revoked'); }} className="p-1.5 text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 rounded transition-colors border border-transparent hover:border-rose-500/20" title="Revoke Permanently">
                                    <ShieldAlert className="w-4 h-4" />
                                  </button>
                                )}
                                <div className="w-px h-4 bg-zinc-800 mx-1"></div>
                                {license.status === 'archived' ? (
                                  <button onClick={(e) => { e.stopPropagation(); updateStatus(license.id, 'active'); }} className="p-1.5 text-zinc-400 hover:text-teal-400 hover:bg-teal-500/10 rounded transition-colors border border-transparent hover:border-teal-500/20" title="Restore / Retrieve from Archive">
                                    <Undo2 className="w-4 h-4" />
                                  </button>
                                ) : (
                                  <button onClick={(e) => { e.stopPropagation(); updateStatus(license.id, 'archived'); }} className="p-1.5 text-zinc-400 hover:text-purple-400 hover:bg-purple-500/10 rounded transition-colors border border-transparent hover:border-purple-500/20" title="Archive">
                                    <Archive className="w-4 h-4" />
                                  </button>
                                )}
                                <div className="w-px h-4 bg-zinc-800 mx-1"></div>

                                <button onClick={(e) => { 
                                  e.stopPropagation(); 
                                  setEditingMainLicense(license);
                                  setIsCreateModalOpen(true);
                                }} className="p-1.5 text-zinc-400 hover:text-indigo-400 hover:bg-indigo-500/10 rounded transition-colors border border-transparent hover:border-indigo-500/20" title="Edit details">
                                  <SlidersHorizontal className="w-4 h-4" />
                                </button>
                                {canDeleteLicenses && (
                                  <button onClick={(e) => { e.stopPropagation(); deleteLicense(license.id); }} className="p-1.5 text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 rounded transition-colors border border-transparent hover:border-rose-500/20" title="Delete">
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                      {expandedRows.has(license.id) && (
                        <tr>
                          <td colSpan={7} className="bg-zinc-950/50 p-6 border-b border-zinc-800">
                            <div className="grid grid-cols-2 gap-8 text-xs font-mono">
                              <div>
                                <h4 className="text-zinc-500 mb-2 flex justify-between items-center">
                                  RAW CONFIGURATION
                                  <div className="flex gap-2">
                                    {canManageLicenses && (
                                      <button 
                                        onClick={() => { setExtendingLicense(license); setIsExtendModalOpen(true); }}
                                        className="text-[10px] text-amber-400 hover:text-amber-300 bg-amber-500/10 px-2 py-1 rounded border border-amber-500/20"
                                      >
                                        Extend
                                      </button>
                                    )}
                                    <button 
                                      onClick={() => exportLicense(license)}
                                      className="text-[10px] text-indigo-400 hover:text-indigo-300 bg-indigo-500/10 px-2 py-1 rounded border border-indigo-500/20"
                                    >
                                      Audit Export
                                    </button>
                                  </div>
                                </h4>
                                <pre className="bg-zinc-900 p-3 rounded border border-zinc-800 text-zinc-300 overflow-x-auto">{JSON.stringify(license, null, 2)}</pre>
                              </div>
                              <div>
                                <h4 className="text-zinc-500 mb-2">USAGE STATISTICS & API QUOTAS</h4>
                                <div className="space-y-3 text-zinc-300">
                                  <div className="flex justify-between"><span>Last Active IP:</span><span>{license.last_active_ip || 'N/A'}</span></div>
                                  <div className="flex justify-between"><span>Fingerprint:</span><span>{license.device_fingerprint || 'N/A'}</span></div>
                                  <div className="flex justify-between"><span>Max Volume Cap:</span><span>${(license.max_volume_usd / 1000000).toFixed(0)}M</span></div>
                                  
                                  <div className="border-t border-zinc-800/80 pt-2 space-y-2">
                                    <div>
                                      <div className="flex justify-between text-[10px] text-zinc-400 mb-1">
                                        <span>Daily API Quota:</span>
                                        <span>{(license.api_calls_count_daily || 0).toLocaleString()} / {license.api_calls_limit > 0 ? license.api_calls_limit.toLocaleString() : 'Unlimited'}</span>
                                      </div>
                                      <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                                        <div className="bg-indigo-500 h-full transition-all duration-300" style={{ width: `${license.api_calls_limit > 0 ? Math.min(100, ((license.api_calls_count_daily || 0) / license.api_calls_limit) * 100) : 0}%` }} />
                                      </div>
                                    </div>

                                    <div>
                                      <div className="flex justify-between text-[10px] text-zinc-400 mb-1">
                                        <span>Monthly API Quota:</span>
                                        <span>{(license.api_calls_count_monthly || 0).toLocaleString()} / {license.api_calls_limit_monthly > 0 ? license.api_calls_limit_monthly.toLocaleString() : 'Unlimited'}</span>
                                      </div>
                                      <div className="w-full bg-zinc-850 h-1.5 rounded-full overflow-hidden">
                                        <div className="bg-emerald-500 h-full transition-all duration-300" style={{ width: `${license.api_calls_limit_monthly > 0 ? Math.min(100, ((license.api_calls_count_monthly || 0) / license.api_calls_limit_monthly) * 100) : 0}%` }} />
                                      </div>
                                    </div>

                                    <div>
                                      <div className="flex justify-between text-[10px] text-zinc-400 mb-1">
                                        <span>Yearly API Quota:</span>
                                        <span>{(license.api_calls_count_yearly || 0).toLocaleString()} / {license.api_calls_limit_yearly > 0 ? license.api_calls_limit_yearly.toLocaleString() : 'Unlimited'}</span>
                                      </div>
                                      <div className="w-full bg-zinc-850 h-1.5 rounded-full overflow-hidden">
                                        <div className="bg-amber-500 h-full transition-all duration-300" style={{ width: `${license.api_calls_limit_yearly > 0 ? Math.min(100, ((license.api_calls_count_yearly || 0) / license.api_calls_limit_yearly) * 100) : 0}%` }} />
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
          </>
        )}

        {/* Other Tabs */}
        {activeTab === 'dashboard' && (
          <DashboardView 
            licenses={licenses} 
            riskScores={duckDBRiskScores} 
            riskAlerts={riskAlerts}
            renewalAlerts={renewalAlerts}
            showToast={showToast}
            riskSnapshots={riskSnapshots}
            clients={clients}
          />
        )}
        {activeTab === 'audit_logs' && <AuditLogsView logs={auditLogs} currentUser={currentUser} />}
        {activeTab === 'users' && (
          <UsersView 
            users={allUsers} 
            currentUser={currentUser}
            showToast={showToast}
            onUpdateRole={(id, role) => socketRef.current?.emit('users:update_role', { id, role })}
            onDelete={(id) => socketRef.current?.emit('users:delete', id)}
            onInvite={(user) => {
              const newUser = {
                ...user,
                id: 'user_' + Math.random().toString(36).substring(2, 9),
                created_at: new Date().toISOString()
              };
              socketRef.current?.emit('users:create', newUser);
              showToast(`Invitation created for ${user.name}`, 'success');
            }}
          />
        )}
        {activeTab === 'validate_key' && <ValidateKeyView />}
        {activeTab === 'funds' && (
          <FundsView 
            clients={clients} 
            addClient={addClient} 
            deleteClient={removeClient} 
            editClient={editClient}
            licenses={licenses} 
            currentUser={currentUser}
            showToast={showToast} 
          />
        )}
        {activeTab === 'products' && (
          <SoftwareProductsView 
            products={softwareProducts} 
            addProduct={addSoftwareProduct} 
            deleteProduct={removeSoftwareProduct} 
            editProduct={editSoftwareProduct}
            licenses={licenses} 
            currentUser={currentUser}
            showToast={showToast} 
          />
        )}
        {activeTab === 'tiers' && (
          <LicenseTiersView 
            tiers={licenseTiers} 
            addTier={addLicenseTier} 
            deleteTier={removeLicenseTier} 
            editTier={editLicenseTier}
            licenses={licenses} 
            currentUser={currentUser}
            showToast={showToast} 
          />
        )}
        {activeTab === 'nodes' && (
          <NodesView 
            licenses={licenses} 
            liveWebSocketNodes={liveWebSocketNodes} 
            socketRef={socketRef}
            simulatedClientKey={simulatedClientKey}
            setSimulatedClientKey={setSimulatedClientKey}
            simulationLogs={simulationLogs}
            setSimulationLogs={setSimulationLogs}
            fetchRiskScores={fetchRiskScores}
            showToast={showToast}
            handleResetHwid={handleResetHwid}
            handleGenerateOfflineToken={handleGenerateOfflineToken}
            copyToClipboard={copyToClipboard}
            latencyThreshold={latencyThreshold}
          />
        )}
        {activeTab === 'settings' && (
          <SettingsView 
            showToast={showToast} 
            licenses={licenses} 
            socketRef={socketRef}
            currentUser={currentUser}
            handleGenerateOfflineToken={handleGenerateOfflineToken}
            copyToClipboard={copyToClipboard}
            latencyThreshold={latencyThreshold}
            setLatencyThreshold={setLatencyThreshold}
            smtp={smtp}
            setSmtp={setSmtp}
            handleSaveSmtp={handleSaveSmtp}
            isSavingSmtp={isSavingSmtp}
            notificationPrefs={notificationPrefs}
            setNotificationPrefs={setNotificationPrefs}
            handleSavePrefs={handleSavePrefs}
            isSavingPrefs={isSavingPrefs}
          />
        )}

      </main>

      {/* Events Modal */}
      {isEventsOpen && selectedLicense && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-sm">
          <div className="bg-zinc-900 rounded-xl shadow-2xl border border-zinc-800 w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50 rounded-t-xl">
              <div>
                <h3 className="font-semibold text-zinc-100 flex items-center gap-2">
                  <Database className="w-4 h-4 text-indigo-400" />
                  Telemetry & Audit Log
                </h3>
                <p className="text-xs text-zinc-500 font-mono mt-1">{selectedLicense.license_key} • {selectedLicense.software_name}</p>
              </div>
              <button onClick={() => setIsEventsOpen(false)} className="p-2 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 rounded-md transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto p-4 flex-1">
              {events.length === 0 ? (
                <div className="text-center py-12 text-zinc-600">
                  <Activity className="w-8 h-8 mx-auto mb-3 text-zinc-700" />
                  <p className="font-mono text-xs">NO EVENTS LOGGED</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {events.map((evt) => (
                    <div key={evt.id} className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <div className={cn("w-2 h-2 rounded-full mt-1.5 shadow-[0_0_8px_rgba(0,0,0,0.5)]", 
                          evt.event_type === 'verification_success' ? 'bg-emerald-500 shadow-emerald-500/50' :
                          evt.event_type === 'verification_failed' ? 'bg-rose-500 shadow-rose-500/50' :
                          'bg-indigo-500 shadow-indigo-500/50'
                        )} />
                        <div className="w-px h-full bg-zinc-800 mt-2" />
                      </div>
                      <div className="flex-1 pb-4">
                        <div className="flex justify-between items-start mb-1">
                          <span className="font-medium text-xs text-zinc-300 font-mono uppercase tracking-wider">
                            {evt.event_type.replace(/_/g, ' ')}
                          </span>
                          <span className="text-[10px] text-zinc-500 font-mono">{format(new Date(evt.timestamp), 'MMM d, HH:mm:ss')}</span>
                        </div>
                        <div className="bg-zinc-950/50 border border-zinc-800/80 rounded-md p-3 text-[10px] font-mono text-zinc-400 overflow-x-auto shadow-inner">
                          <pre>{JSON.stringify(JSON.parse(evt.event_data), null, 2)}</pre>
                          
                          {/* Quick Actions for Verification Failures */}
                          {evt.event_type === 'verification_failed' && (
                            <div className="mt-3 flex gap-2 pt-3 border-t border-zinc-800/50">
                              {JSON.parse(evt.event_data).reason === 'IP not whitelisted' && (
                                <button 
                                  onClick={() => {
                                    const ip = JSON.parse(evt.event_data).ip;
                                    const currentWhitelist = selectedLicense.ip_whitelist ? selectedLicense.ip_whitelist.split(',').map(s => s.trim()) : [];
                                    if (!currentWhitelist.includes(ip)) {
                                      const newWhitelist = [...currentWhitelist, ip].join(', ');
                                      handleUpdateLicenseConfig(selectedLicense.id, { ip_whitelist: newWhitelist });
                                      showToast(`IP ${ip} whitelisted`, 'success');
                                    }
                                  }}
                                  className="bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-1 rounded hover:bg-indigo-500/20 transition-colors"
                                >
                                  Whitelist this IP
                                </button>
                              )}
                              {JSON.parse(evt.event_data).reason === 'Hardware ID mismatch' && (
                                <button 
                                  onClick={() => {
                                    const hwid = JSON.parse(evt.event_data).hardware_id || JSON.parse(evt.event_data).provided_hwid;
                                    handleUpdateLicenseConfig(selectedLicense.id, { hardware_id: hwid });
                                    showToast(`Hardware lock updated to ${hwid}`, 'success');
                                  }}
                                  className="bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-1 rounded hover:bg-amber-500/20 transition-colors"
                                >
                                  Update Hardware Lock
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      
      {/* Transfer License Modal */}
      <TransferLicenseModal 
        isOpen={isTransferModalOpen}
        onClose={() => setIsTransferModalOpen(false)}
        onTransfer={transferLicenses}
      />

      {/* Extend License Modal */}
      <ExtendLicenseModal 
        isOpen={isExtendModalOpen}
        onClose={() => setIsExtendModalOpen(false)}
        onExtend={(days) => extendingLicense && extendLicense(extendingLicense.id, days)}
      />

      {/* Renew License Modal */}
      <RenewLicenseModal 
        isOpen={isRenewModalOpen}
        onClose={() => setIsRenewModalOpen(false)}
        onRenew={() => renewingLicense && renewLicense(renewingLicense.id)}
      />

      {/* Create License Modal */}
      <ProfitShareCalculatorModal 
        isOpen={showProfitShareCalc}
        onClose={() => setShowProfitShareCalc(false)}
        licenses={licenses}
      />
      <CreateLicenseModal 
        isOpen={isCreateModalOpen} 
        onClose={() => { setIsCreateModalOpen(false); setEditingMainLicense(null); }} 
        editingLicense={editingMainLicense}
        onCreate={handleCreateLicense} 
        clients={clients}
        softwareProducts={softwareProducts}
        licenseTiers={licenseTiers}
      />
      <RiskMitigationModal 
        isOpen={isRiskMitigationModalOpen} 
        onClose={() => setIsRiskMitigationModalOpen(false)} 
        selectedLicenses={licenses.filter(l => selectedLicenses.has(l.id))}
        onExecute={handleRiskMitigation}
      />

      {/* Batch Edit Modal */}
      <BatchEditModal 
        isOpen={isBatchEditModalOpen}
        onClose={() => setIsBatchEditModalOpen(false)}
        onSubmit={batchUpdateSelectedLicenses}
        selectedCount={selectedLicenses.size}
      />

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 animate-in fade-in slide-in-from-bottom-4">
          <div className={cn("px-4 py-3 rounded-lg border shadow-lg backdrop-blur-md flex items-center gap-4", 
            toast.type === 'success' ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-rose-500/10 border-rose-500/20 text-rose-400"
          )}>
            <div className="flex items-center gap-3">
              {toast.type === 'success' ? <ShieldCheck className="w-5 h-5" /> : <ShieldAlert className="w-5 h-5" />}
              <span className="text-sm font-medium">{toast.message}</span>
            </div>
            {toast.onUndo && (
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  toast.onUndo?.();
                  setToast(null);
                }}
                className="px-2 py-1 rounded bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30 text-[10px] font-bold uppercase tracking-wider border border-indigo-500/30 transition-all flex items-center gap-1"
              >
                <Undo2 className="w-3 h-3" />
                Undo
              </button>
            )}
          </div>
        </div>
      )}

      </div>
    </div>
  );
}

function AuditLogsView({ logs, currentUser }: { logs: AuditLog[], currentUser: AppUser | null }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [timePreset, setTimePreset] = useState('all');
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState('');

  const formatDateTimeLocal = (date: Date) => {
    const pad = (num: number) => String(num).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };

  const handlePresetChange = (preset: string) => {
    setTimePreset(preset);
    const now = new Date();
    if (preset === 'all') {
      setStartDate('');
      setEndDate('');
    } else if (preset === 'today') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      setStartDate(formatDateTimeLocal(start));
      setEndDate(formatDateTimeLocal(now));
    } else if (preset === 'past_24h') {
      const start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      setStartDate(formatDateTimeLocal(start));
      setEndDate(formatDateTimeLocal(now));
    } else if (preset === 'past_7d') {
      const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      setStartDate(formatDateTimeLocal(start));
      setEndDate(formatDateTimeLocal(now));
    } else if (preset === 'past_30d') {
      const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      setStartDate(formatDateTimeLocal(start));
      setEndDate(formatDateTimeLocal(now));
    }
  };

  const filteredLogs = logs.filter(log => {
    const logTime = new Date(log.timestamp).getTime();
    if (startDate) {
      const start = new Date(startDate).getTime();
      if (logTime < start) return false;
    }
    if (endDate) {
      const end = new Date(endDate).getTime();
      if (logTime > end) return false;
    }

    const search = searchTerm.toLowerCase();
    const matchesSearch = (
      (log.user_name && log.user_name.toLowerCase().includes(search)) ||
      (log.action && log.action.toLowerCase().includes(search)) ||
      (log.entity_type && log.entity_type.toLowerCase().includes(search)) ||
      (log.details && log.details.toLowerCase().includes(search)) ||
      (new Date(log.timestamp).toLocaleString().toLowerCase().includes(search))
    );
    const matchesType = filterType === 'all' || (filterType === 'compliance' && log.action.includes('compliance_webhook'));
    return matchesSearch && matchesType;
  });

  const exportToExcel = () => {
    setIsExporting(true);
    setExportError('');
    try {
      if (filteredLogs.length === 0) {
        throw new Error('No logs found for the selected filter criteria to export.');
      }

      // Generate a data integrity hash/fingerprint of the exported dataset
      const hashInput = filteredLogs.map(l => `${l.id}-${l.timestamp}-${l.action}`).join('|');
      let hash = 0;
      for (let i = 0; i < hashInput.length; i++) {
        hash = (hash << 5) - hash + hashInput.charCodeAt(i);
        hash |= 0;
      }
      const integrityCheckDigest = 'NX-SEC-' + Math.abs(hash).toString(16).toUpperCase() + '-' + filteredLogs.length;

      // 1. Audit Logs Worksheet
      const dataRows = filteredLogs.map(log => ({
        'Log ID': log.id,
        'Timestamp (UTC)': log.timestamp,
        'Timestamp (Local)': new Date(log.timestamp).toLocaleString(),
        'Authorized Operator': log.user_name || 'System Action (Automated)',
        'Operator ID': log.user_id || 'N/A',
        'Action': log.action.toUpperCase(),
        'Target Entity Class': log.entity_type.toUpperCase(),
        'Entity ID/Context': log.entity_id,
        'Log Details / Description': log.details,
        'Compliance Verification': log.action === 'compliance_webhook' ? 'VERIFIED COMPLIANCE' : 'SECURE AUDIT RECORD'
      }));

      const wb = XLSX.utils.book_new();
      const wsLogs = XLSX.utils.json_to_sheet(dataRows);

      // Auto-adjust column widths
      wsLogs['!cols'] = [
        { wch: 38 }, // Log ID
        { wch: 22 }, // UTC Time
        { wch: 22 }, // Local Time
        { wch: 25 }, // Authorized Operator
        { wch: 38 }, // Operator ID
        { wch: 15 }, // Action
        { wch: 20 }, // Entity Class
        { wch: 38 }, // Entity ID
        { wch: 60 }, // Details
        { wch: 22 }  // Compliance Verification
      ];

      XLSX.utils.book_append_sheet(wb, wsLogs, 'Audit Logs Trail');

      // 2. Compliance Certification Worksheet
      const metadataRows = [
        { 'Compliance Attribute': 'Export Timestamp (Local)', 'Value / Reference': new Date().toLocaleString() },
        { 'Compliance Attribute': 'Export Timestamp (UTC)', 'Value / Reference': new Date().toISOString() },
        { 'Compliance Attribute': 'Authorized Exporter Name', 'Value / Reference': currentUser?.name || 'Unknown Operator' },
        { 'Compliance Attribute': 'Authorized Exporter Email', 'Value / Reference': currentUser?.email || 'N/A' },
        { 'Compliance Attribute': 'Authorized Exporter Role', 'Value / Reference': currentUser?.role || 'N/A' },
        { 'Compliance Attribute': 'Active Filters Applied', 'Value / Reference': `Preset: ${timePreset.toUpperCase()} | Type: ${filterType.toUpperCase()}` },
        { 'Compliance Attribute': 'Target Range Start', 'Value / Reference': startDate ? new Date(startDate).toLocaleString() : 'All historical ledger (no limit)' },
        { 'Compliance Attribute': 'Target Range End', 'Value / Reference': endDate ? new Date(endDate).toLocaleString() : 'Up to present (no limit)' },
        { 'Compliance Attribute': 'Total Records Exported', 'Value / Reference': filteredLogs.length },
        { 'Compliance Attribute': 'Cryptographic Integrity Check', 'Value / Reference': integrityCheckDigest },
        { 'Compliance Attribute': 'Regulatory Audit Certification', 'Value / Reference': 'VERIFIED COMPLIANT' },
        { 'Compliance Attribute': 'Standard Operating Statement', 'Value / Reference': 'This export is generated from an immutable organizational administrative ledger under security and SOC2/ISO27001 regulatory guidelines.' }
      ];

      const wsMeta = XLSX.utils.json_to_sheet(metadataRows);
      wsMeta['!cols'] = [
        { wch: 35 },
        { wch: 90 }
      ];

      XLSX.utils.book_append_sheet(wb, wsMeta, 'Compliance Metadata');

      // Save Workbook
      const fileDate = new Date().toISOString().replace(/[:.]/g, '-');
      XLSX.writeFile(wb, `nonaxen_audit_log_export_${fileDate}.xlsx`);
    } catch (err: any) {
      setExportError(err.message || 'Failed to export audit logs.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-zinc-100 font-semibold flex items-center gap-2">
            <FileText className="w-4 h-4 text-indigo-400" /> Immutable Audit Trail
          </h3>
          <p className="text-xs text-zinc-500 font-mono mt-1">Real-time ledger of all organizational administrative actions</p>
        </div>
        <div className="flex items-center gap-4">
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-md text-sm text-zinc-200 focus:outline-none focus:border-indigo-500/50"
          >
            <option value="all">All Logs</option>
            <option value="compliance">Compliance Only</option>
          </select>
          <div className="relative">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text"
              placeholder="Search audit logs..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-4 py-1.5 bg-zinc-900 border border-zinc-800 rounded-md text-sm text-zinc-200 focus:outline-none focus:border-indigo-500/50 w-64"
            />
          </div>
          <div className="flex items-center gap-2 px-3 py-1 bg-zinc-900 border border-zinc-800 rounded text-[10px] font-mono text-zinc-400">
            <Database className="w-3 h-3" />
            PERSISTED IN DUCKDB
          </div>
        </div>
      </div>

      {/* Date Range Selection & Export Control Panel */}
      <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h4 className="text-sm font-medium text-zinc-200 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-indigo-400" /> Export Range Configuration
            </h4>
            <p className="text-xs text-zinc-500 mt-1">Select specific log time-ranges to generate compliance-grade XLSX documents.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {['all', 'today', 'past_24h', 'past_7d', 'past_30d', 'custom'].map((preset) => (
              <button
                key={preset}
                onClick={() => {
                  if (preset === 'custom') {
                    setTimePreset('custom');
                  } else {
                    handlePresetChange(preset);
                  }
                }}
                className={cn(
                  "px-2.5 py-1 text-xs rounded border transition-all font-mono uppercase tracking-wider",
                  timePreset === preset
                    ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/30 font-medium"
                    : "bg-zinc-950/40 text-zinc-400 border-zinc-800/80 hover:text-zinc-300 hover:border-zinc-700"
                )}
              >
                {preset.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-end bg-zinc-950/30 p-4 rounded-lg border border-zinc-800/50">
          <div>
            <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-1.5">Start Date & Time</label>
            <div className="relative">
              <input
                type="datetime-local"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setTimePreset('custom');
                }}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 text-xs focus:outline-none focus:border-indigo-500/50 font-mono"
              />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-1.5">End Date & Time</label>
            <div className="relative">
              <input
                type="datetime-local"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setTimePreset('custom');
                }}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 text-xs focus:outline-none focus:border-indigo-500/50 font-mono"
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <button
              onClick={exportToExcel}
              disabled={isExporting}
              className="w-full flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 disabled:bg-zinc-800 disabled:text-zinc-500 text-zinc-950 px-4 py-2 rounded-lg text-xs font-bold transition-all shadow-lg cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              {isExporting ? 'Generating Spreadsheet...' : 'Export to XLSX (Excel)'}
            </button>
          </div>
        </div>

        {exportError && (
          <p className="text-xs text-rose-400 font-mono mt-1 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
            {exportError}
          </p>
        )}
      </div>

      <div className="bg-zinc-900/30 border border-zinc-800/80 rounded-xl overflow-hidden backdrop-blur-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-zinc-900/80 border-b border-zinc-800/80 text-zinc-400 font-mono text-[10px] uppercase tracking-wider">
              <tr>
                <th className="px-6 py-4">Timestamp</th>
                <th className="px-6 py-4">User</th>
                <th className="px-6 py-4">Action</th>
                <th className="px-6 py-4">Entity</th>
                <th className="px-6 py-4">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {filteredLogs.map((log) => (
                <tr key={log.id} className="hover:bg-zinc-800/30 group transition-colors">
                  <td className="px-6 py-4 text-zinc-500 font-mono text-[10px]">
                    {new Date(log.timestamp).toLocaleString()}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] text-zinc-400 border border-zinc-700 uppercase">
                        {log.user_name?.substring(0, 2) || 'S'}
                      </div>
                      <span className="text-zinc-300 font-medium">{log.user_name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      "px-2 py-0.5 rounded text-[10px] font-mono uppercase border",
                      log.action === 'create' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                      log.action === 'delete' ? "bg-rose-500/10 text-rose-400 border-rose-500/20" :
                      "bg-indigo-500/10 text-indigo-400 border-indigo-500/20"
                    )}>
                      {log.action}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-zinc-400 text-xs font-mono">{log.entity_type.toUpperCase()}</div>
                    <div className="text-[10px] text-zinc-600 font-mono">{log.entity_id}</div>
                  </td>
                  <td className="px-6 py-4 text-zinc-400 text-xs italic">
                    {log.details}
                  </td>
                </tr>
              ))}
              {filteredLogs.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-zinc-500 font-mono text-xs uppercase tracking-widest">
                    {searchTerm ? "No records match search" : "No records found in audit ledger"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function UsersView({ 
  users, 
  currentUser,
  onUpdateRole, 
  onDelete, 
  onInvite,
  showToast 
}: { 
  users: AppUser[], 
  currentUser: AppUser | null,
  onUpdateRole: (id: string, role: AppRole) => void,
  onDelete: (id: string) => void,
  onInvite: (user: Omit<AppUser, 'id' | 'created_at'>) => void,
  showToast: (msg: string, type: 'success'|'error') => void 
}) {
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [formData, setFormData] = useState({ name: '', email: '', role: 'Auditor' as AppRole });

  const handleInvite = () => {
    if (!formData.name || !formData.email) return;
    onInvite(formData);
    setFormData({ name: '', email: '', role: 'Auditor' });
    setIsInviteOpen(false);
  };

  const roles: AppRole[] = ['Administrator', 'Manager', 'User', 'Viewer', 'Auditor'];

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-zinc-100 font-semibold flex items-center gap-2">
            <Users className="w-4 h-4 text-indigo-400" /> Team Access Control
          </h3>
          <p className="text-xs text-zinc-500 font-mono mt-1">Manage personnel roles and organizational permissions</p>
        </div>
        {currentUser?.role === 'Administrator' && (
          <button 
            onClick={() => setIsInviteOpen(true)}
            className="flex items-center gap-2 bg-indigo-500 hover:bg-indigo-400 text-zinc-950 px-4 py-1.5 rounded-md text-xs font-bold transition-all shadow-lg"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Team Member
          </button>
        )}
      </div>

      {isInviteOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-sm overflow-hidden shadow-2xl p-6 space-y-4">
            <h3 className="text-zinc-100 font-medium text-sm border-b border-zinc-800 pb-2">Invite New Member</h3>
            <div>
              <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-1.5">Full Name</label>
              <input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="e.g. Alex Rivera" className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 text-sm focus:outline-none focus:border-indigo-500 font-mono" />
            </div>
            <div>
              <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-1.5">Email Address</label>
              <input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} placeholder="alex@quantfund.net" className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 text-sm focus:outline-none focus:border-indigo-500 font-mono" />
            </div>
            <div>
              <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-1.5">Assigned Role</label>
              <select 
                value={formData.role} 
                onChange={e => setFormData({...formData, role: e.target.value as AppRole})}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 text-sm focus:outline-none focus:border-indigo-500 font-mono"
              >
                {roles.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setIsInviteOpen(false)} className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors font-semibold">Cancel</button>
              <button onClick={handleInvite} className="bg-indigo-500 hover:bg-indigo-400 text-zinc-950 px-4 py-1.5 rounded-md text-xs font-bold transition-all shadow-lg">Create User</button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-zinc-900/30 border border-zinc-800/80 rounded-xl overflow-hidden backdrop-blur-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-zinc-900/80 border-b border-zinc-800/80 text-zinc-400 font-mono text-[10px] uppercase tracking-wider">
              <tr>
                <th className="px-6 py-4">User Details</th>
                <th className="px-6 py-4">Access Role</th>
                <th className="px-6 py-4">Joined At</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-zinc-800/30 group">
                  <td className="px-6 py-4">
                    <div className="text-zinc-200 font-medium">{u.name} {u.id === currentUser?.id && <span className="text-[10px] bg-indigo-500/20 text-indigo-400 px-1.5 py-0.5 rounded ml-2">YOU</span>}</div>
                    <div className="text-zinc-500 font-mono text-[10px] mt-0.5">{u.email}</div>
                  </td>
                  <td className="px-6 py-4">
                    {currentUser?.role === 'Administrator' && u.id !== currentUser.id ? (
                      <select 
                        value={u.role}
                        onChange={(e) => onUpdateRole(u.id, e.target.value as AppRole)}
                        className="bg-zinc-950 border border-zinc-800 text-zinc-400 text-[10px] font-mono uppercase px-2 py-0.5 rounded focus:outline-none focus:border-indigo-500 transition-colors"
                      >
                        {roles.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    ) : (
                      <span className="bg-zinc-800 text-zinc-400 border border-zinc-700 px-2 py-0.5 rounded text-[10px] font-mono uppercase">
                        {u.role}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-zinc-500 font-mono text-[10px]">
                    {new Date(u.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-right">
                    {currentUser?.role === 'Administrator' && u.id !== currentUser.id && (
                      <button 
                        onClick={() => onDelete(u.id)} 
                        className="text-zinc-500 hover:text-rose-400 text-xs font-medium transition-colors opacity-0 group-hover:opacity-100"
                      >
                        Revoke Access
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function FundsView({ 
  clients, 
  addClient, 
  deleteClient, 
  editClient,
  licenses, 
  currentUser,
  showToast 
}: { 
  clients: Client[], 
  addClient: (c: Omit<Client, 'id'>) => void, 
  deleteClient: (id: string) => void, 
  editClient: (id: string, updates: Partial<Client>) => void,
  licenses: License[], 
  currentUser: AppUser | null,
  showToast: (msg: string, type: 'success'|'error') => void 
}) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({ 
    name: '', 
    email: '', 
    mobile: '', 
    address: '',
    extra_info: '',
    kyc_status: 'pending' as 'pending' | 'approved' | 'rejected' | 'restricted',
    company_registration_number: '',
    tax_id: '',
    risk_rating: 'low' as 'low' | 'medium' | 'high',
    aml_status: 'clear' as 'clear' | 'flagged',
    kyc_notes: ''
  });
  
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [extraFields, setExtraFields] = useState<Array<{ key: string, value: string }>>([
    { key: 'AUM Tier', value: 'Over $50M' },
    { key: 'Jurisdiction', value: 'Cayman Islands' }
  ]);

  const addExtraField = () => {
    setExtraFields([...extraFields, { key: '', value: '' }]);
  };

  const removeExtraField = (index: number) => {
    setExtraFields(extraFields.filter((_, i) => i !== index));
  };

  const handleFieldChange = (index: number, field: 'key' | 'value', val: string) => {
    const updated = [...extraFields];
    updated[index][field] = val;
    setExtraFields(updated);
  };

  const handleSubmit = () => {
    if (!formData.name) return;
    
    // Construct extra_info JSON dictionary from custom fields
    const extraInfoObj: Record<string, string> = {};
    extraFields.forEach(f => {
      if (f.key.trim()) {
        extraInfoObj[f.key.trim()] = f.value;
      }
    });

    const payload = {
      name: formData.name,
      email: formData.email,
      mobile: formData.mobile,
      address: formData.address,
      extra_info: JSON.stringify(extraInfoObj),
      kyc_status: formData.kyc_status,
      company_registration_number: formData.company_registration_number,
      tax_id: formData.tax_id,
      risk_rating: formData.risk_rating,
      aml_status: formData.aml_status,
      kyc_notes: formData.kyc_notes
    };

    if (editingClient) {
      editClient(editingClient.id, payload);
      showToast('Client updated successfully', 'success');
    } else {
      addClient(payload);
      showToast('Client added successfully', 'success');
    }

    setFormData({ 
      name: '', email: '', mobile: '', address: '', extra_info: '',
      kyc_status: 'pending', company_registration_number: '', tax_id: '',
      risk_rating: 'low', aml_status: 'clear', kyc_notes: ''
    });
    setExtraFields([
      { key: 'AUM Tier', value: 'Over $50M' },
      { key: 'Jurisdiction', value: 'Cayman Islands' }
    ]);
    setIsModalOpen(false);
    setEditingClient(null);
  };

  const getClientStats = (name: string) => {
    const relevantLicenses = licenses.filter(l => l.issued_to === name);
    return {
      count: relevantLicenses.filter(l => l.status === 'active').length,
      value: relevantLicenses.reduce((acc, l) => acc + getLicenseFee(l), 0)
    };
  };
  
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center bg-zinc-900/40 p-4 rounded-xl border border-zinc-800/60">
        <div>
          <h3 className="text-zinc-100 font-semibold flex items-center gap-2">
            <Building className="w-4 h-4 text-indigo-400" /> Client & Fund Directory
          </h3>
          <p className="text-xs text-zinc-500 font-mono mt-1">Manage institutional license counter-parties and verification details</p>
        </div>
        {currentUser?.role !== 'Auditor' && (
          <button 
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 bg-indigo-500 hover:bg-indigo-400 text-zinc-950 px-4 py-1.5 rounded-md text-xs font-bold transition-all shadow-lg"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Client Profile
          </button>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-lg overflow-hidden shadow-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-zinc-100 font-medium text-sm border-b border-zinc-800 pb-2">Add Registered Client / Fund</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-1.5">Fund / Client Name</label>
                <input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="e.g. Millennium Capital" className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 text-xs focus:outline-none focus:border-indigo-500 transition-colors" />
              </div>
              <div>
                <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-1.5">Official Email</label>
                <input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} placeholder="compliance@millennium.com" className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 text-xs focus:outline-none focus:border-indigo-500 transition-colors" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-1.5">Mobile/Phone Number</label>
                <input type="text" value={formData.mobile} onChange={e => setFormData({...formData, mobile: e.target.value})} placeholder="+1 (212) 555-0199" className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 text-xs focus:outline-none focus:border-indigo-500 transition-colors" />
              </div>
              <div>
                <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-1.5">Physical Address</label>
                <input type="text" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} placeholder="601 Lexington Ave, New York" className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 text-xs focus:outline-none focus:border-indigo-500 transition-colors" />
              </div>
            </div>

            <div className="border-t border-zinc-800 pt-4 mt-2">
              <span className="block text-[10px] font-mono text-zinc-400 uppercase mb-3">Enterprise KYC & Compliance</span>
              
              <div className="grid grid-cols-2 gap-4 mb-3">
                <div>
                  <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-1.5">KYC Status</label>
                  <select value={formData.kyc_status} onChange={e => setFormData({...formData, kyc_status: e.target.value as any})} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 text-xs focus:outline-none focus:border-indigo-500 transition-colors">
                    <option value="pending">Pending Review</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                    <option value="restricted">Restricted / Watchlist</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-1.5">AML Status</label>
                  <select value={formData.aml_status} onChange={e => setFormData({...formData, aml_status: e.target.value as any})} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 text-xs focus:outline-none focus:border-indigo-500 transition-colors">
                    <option value="clear">Clear (No Match)</option>
                    <option value="flagged">Flagged (Review Required)</option>
                  </select>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4 mb-3">
                <div>
                  <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-1.5">Company Reg Number (LEI)</label>
                  <input type="text" value={formData.company_registration_number} onChange={e => setFormData({...formData, company_registration_number: e.target.value})} placeholder="e.g. 5493006MHB84DD0ZWV18" className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 text-xs focus:outline-none focus:border-indigo-500 transition-colors font-mono" />
                </div>
                <div>
                  <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-1.5">Tax ID / EIN</label>
                  <input type="text" value={formData.tax_id} onChange={e => setFormData({...formData, tax_id: e.target.value})} placeholder="e.g. 12-3456789" className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 text-xs focus:outline-none focus:border-indigo-500 transition-colors font-mono" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-1.5">Risk Rating</label>
                  <select value={formData.risk_rating} onChange={e => setFormData({...formData, risk_rating: e.target.value as any})} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 text-xs focus:outline-none focus:border-indigo-500 transition-colors">
                    <option value="low">Low Risk</option>
                    <option value="medium">Medium Risk</option>
                    <option value="high">High Risk</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-1.5">Compliance Notes</label>
                  <input type="text" value={formData.kyc_notes} onChange={e => setFormData({...formData, kyc_notes: e.target.value})} placeholder="Internal auditor notes..." className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 text-xs focus:outline-none focus:border-indigo-500 transition-colors" />
                </div>
              </div>
            </div>

            <div className="border-t border-zinc-800 pt-4 mt-2">
              <div className="flex justify-between items-center mb-3">
                <span className="block text-[10px] font-mono text-zinc-400 uppercase">Custom Attributes / Metadata</span>
                <button type="button" onClick={addExtraField} className="text-[10px] text-indigo-400 hover:text-indigo-300 font-bold flex items-center gap-1">+ Add Attribute</button>
              </div>

              <div className="space-y-2">
                {extraFields.map((f, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <input type="text" value={f.key} onChange={e => handleFieldChange(i, 'key', e.target.value)} placeholder="Field Key" className="w-1/3 bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-zinc-200 text-xs focus:outline-none focus:border-indigo-500 font-mono" />
                    <input type="text" value={f.value} onChange={e => handleFieldChange(i, 'value', e.target.value)} placeholder="Value" className="w-2/3 bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-zinc-200 text-xs focus:outline-none focus:border-indigo-500" />
                    <button type="button" onClick={() => removeExtraField(i)} className="text-zinc-600 hover:text-rose-400 text-xs px-1">×</button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-zinc-800 mt-4">
              <button onClick={() => setIsModalOpen(false)} className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors font-semibold">Cancel</button>
              <button onClick={handleSubmit} className="bg-indigo-500 hover:bg-indigo-400 text-zinc-950 px-4 py-1.5 rounded-md text-xs font-bold transition-all shadow-lg">Save Client Profile</button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-zinc-900/30 border border-zinc-800/80 rounded-xl overflow-hidden backdrop-blur-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-zinc-900/80 border-b border-zinc-800/80 text-zinc-400 font-mono text-[10px] uppercase tracking-wider">
              <tr>
                <th className="px-6 py-4">Client / Fund Name</th>
                <th className="px-6 py-4">KYC Status</th>
                <th className="px-6 py-4">Contact Details</th>
                <th className="px-6 py-4">Registered Address</th>
                <th className="px-6 py-4">Metadata attributes</th>
                <th className="px-6 py-4">Active Keys</th>
                <th className="px-6 py-4">Total Revenue</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {clients.map(cli => {
                const stats = getClientStats(cli.name);
                let meta: Record<string, string> = {};
                try {
                  meta = cli.extra_info ? JSON.parse(cli.extra_info) : {};
                } catch(e) {}

                return (
                  <tr key={cli.id} className="hover:bg-zinc-800/30 group">
                    <td className="px-6 py-4 text-zinc-200 font-semibold flex items-center gap-2 text-sm font-sans">
                      <Building className="w-4 h-4 text-zinc-500 group-hover:text-indigo-400 transition-colors"/>
                      {cli.name}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col items-start gap-1">
                        <span className={cn(
                          "text-[10px] px-1.5 py-0.5 rounded font-mono uppercase font-bold tracking-wider",
                          cli.kyc_status === 'approved' ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400" :
                          cli.kyc_status === 'rejected' ? "bg-rose-500/10 border border-rose-500/20 text-rose-400" :
                          cli.kyc_status === 'restricted' ? "bg-amber-500/10 border border-amber-500/20 text-amber-400" :
                          "bg-zinc-500/10 border border-zinc-500/20 text-zinc-400"
                        )}>
                          {cli.kyc_status || 'PENDING'}
                        </span>
                        {cli.risk_rating && cli.risk_rating !== 'low' && (
                          <span className={cn(
                            "text-[8px] px-1 rounded font-mono uppercase",
                            cli.risk_rating === 'high' ? "text-rose-400 bg-rose-500/10" : "text-amber-400 bg-amber-500/10"
                          )}>
                            {cli.risk_rating} risk
                          </span>
                        )}
                        {cli.aml_status === 'flagged' && (
                          <span className="text-[8px] px-1 rounded font-mono uppercase text-rose-400 bg-rose-500/10 border border-rose-500/20">
                            AML FLAGGED
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-zinc-300 font-mono text-xs">
                      <div>{cli.email || 'N/A'}</div>
                      <div className="text-[10px] text-zinc-500 mt-0.5">{cli.mobile || 'N/A'}</div>
                    </td>
                    <td className="px-6 py-4 text-zinc-400 text-xs font-sans max-w-xs truncate" title={cli.address}>
                      {cli.address || 'N/A'}
                    </td>
                    <td className="px-6 py-4 text-zinc-400 font-mono text-xs">
                      <div className="flex flex-wrap gap-1 max-w-xs">
                        {Object.entries(meta).map(([k, v]) => (
                          <span key={k} className="bg-zinc-800/60 border border-zinc-700/50 text-[10px] text-indigo-400 px-1.5 py-0.5 rounded font-mono">
                            {k}: {v}
                          </span>
                        ))}
                        {Object.keys(meta).length === 0 && <span className="text-zinc-600">—</span>}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-zinc-300 font-mono text-xs">{stats.count} nodes</td>
                    <td className="px-6 py-4 text-emerald-400 font-mono text-xs">${stats.value.toLocaleString()}/mo</td>
                    <td className="px-6 py-4 text-right">

                      <button 
                        onClick={() => {
                          setEditingClient(cli);
                          setFormData({
                            name: cli.name,
                            email: cli.email,
                            mobile: cli.mobile,
                            address: cli.address || '',
                            extra_info: '',
                            kyc_status: cli.kyc_status || 'pending',
                            company_registration_number: cli.company_registration_number || '',
                            tax_id: cli.tax_id || '',
                            risk_rating: cli.risk_rating || 'low',
                            aml_status: cli.aml_status || 'clear',
                            kyc_notes: cli.kyc_notes || ''
                          });
                          if (cli.extra_info) {
                            try {
                              const parsed = JSON.parse(cli.extra_info);
                              setExtraFields(Object.entries(parsed).map(([key, value]) => ({ key, value: String(value) })));
                            } catch(e) {}
                          } else {
                            setExtraFields([]);
                          }
                          setIsModalOpen(true);
                        }}
                        className="text-zinc-500 hover:text-indigo-400 text-xs font-medium transition-colors mr-3"
                      >
                        Edit
                      </button>
                      <button 
                        onClick={() => deleteClient(cli.id)} 
                        className="text-zinc-500 hover:text-rose-400 text-xs font-medium transition-colors"
                        title="Permanently remove client profile"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
              {clients.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-zinc-500 font-mono text-xs">
                    NO REGISTERED CLIENTS FOUND
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function NodesView({ 
  licenses, 
  liveWebSocketNodes, 
  socketRef, 
  simulatedClientKey, 
  setSimulatedClientKey, 
  simulationLogs, 
  setSimulationLogs, 
  fetchRiskScores,
  showToast,
  handleResetHwid,
  handleGenerateOfflineToken,
  copyToClipboard,
  latencyThreshold
}: { 
  licenses: License[], 
  liveWebSocketNodes: Array<{ license_key: string, socketId: string, ip: string, hardwareId: string, connectedAt: string, rtt?: number, isDegraded?: boolean, heartbeatInterval?: number, lastPongAt?: number }>,
  socketRef: React.MutableRefObject<Socket | null>,
  simulatedClientKey: string,
  setSimulatedClientKey: (val: string) => void,
  simulationLogs: string[],
  setSimulationLogs: React.Dispatch<React.SetStateAction<string[]>>,
  fetchRiskScores: () => Promise<void>,
  showToast: (msg: string, type: 'success'|'error') => void,
  handleResetHwid: (id: string) => void,
  handleGenerateOfflineToken: (id: string) => Promise<string | null>,
  copyToClipboard: (text: string) => void,
  latencyThreshold: number
}) {
  const activeLicenses = licenses.filter(l => l.status === 'active');
  const [hwIdInput, setHwIdInput] = useState('HWID-SIMULATED-9832');
  const [ipInput, setIpInput] = useState('203.0.113.5');
  const [assetClassInput, setAssetClassInput] = useState('forex');
  const [accountIdInput, setAccountIdInput] = useState('MT5-998877');
  const [editingLicense, setEditingLicense] = useState<License | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);
  const [rttHistory, setRttHistory] = useState<Record<string, { rtt: number; time: number }[]>>({});

  useEffect(() => {
    const now = Date.now();
    setRttHistory(prev => {
      const next = { ...prev };
      liveWebSocketNodes.forEach(node => {
        if (node.rtt !== undefined) {
          const history = next[node.license_key] || [];
          next[node.license_key] = [
            ...history.filter(h => now - h.time < 300000), // Last 5 mins
            { rtt: node.rtt, time: now }
          ];
        }
      });
      return next;
    });
  }, [liveWebSocketNodes]);

  const handleSaveConfig = (id: string, config: any) => {
    if (!socketRef.current) return;
    socketRef.current.emit("licenses:update_config", { id, config });
    showToast('Active node configuration updated successfully!', 'success');
  };

  const parseLogs = (logs: string[]) => {
    return logs.map(log => {
      const match = log.match(/^\[(.*?)\]\s*\[(.*?)\]\s*(.*)$/);
      if (match) {
        return {
          timestamp: match[1],
          level: match[2],
          message: match[3]
        };
      }
      const singleMatch = log.match(/^\[(.*?)\]\s*(.*)$/);
      if (singleMatch) {
        return {
          timestamp: singleMatch[1],
          level: 'LOG',
          message: singleMatch[2]
        };
      }
      return {
        timestamp: new Date().toLocaleTimeString(),
        level: 'LOG',
        message: log
      };
    });
  };

  const exportLogsAsJSON = () => {
    try {
      const parsed = parseLogs(simulationLogs);
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(parsed, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `websocket-simulation-logs-${new Date().toISOString().substring(0, 19).replace(/:/g, '-')}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      showToast('Logs exported as JSON successfully', 'success');
    } catch (error) {
      showToast('Failed to export JSON logs', 'error');
    }
  };

  const exportLogsAsCSV = () => {
    try {
      const parsed = parseLogs(simulationLogs);
      const headers = ["Timestamp", "Level", "Message"];
      const csvContent = [
        headers.join(","),
        ...parsed.map(row => {
          const timestamp = `"${row.timestamp.replace(/"/g, '""')}"`;
          const level = `"${row.level.replace(/"/g, '""')}"`;
          const message = `"${row.message.replace(/"/g, '""')}"`;
          return [timestamp, level, message].join(",");
        })
      ].join("\n");

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", url);
      downloadAnchor.setAttribute("download", `websocket-simulation-logs-${new Date().toISOString().substring(0, 19).replace(/:/g, '-')}.csv`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      URL.revokeObjectURL(url);
      showToast('Logs exported as CSV successfully', 'success');
    } catch (error) {
      showToast('Failed to export CSV logs', 'error');
    }
  };

  const [apiSimCount, setApiSimCount] = useState(100);

  const simulateApiCalls = () => {
    if (!socketRef.current || !simulatedClientKey) return;
    setSimulationLogs(prev => [
      ...prev,
      `[${new Date().toLocaleTimeString()}] [API] Dispatching ${apiSimCount} secure node calls to validation engine...`
    ]);
    socketRef.current.emit("node:simulate_api_call", { license_key: simulatedClientKey, count: apiSimCount });
  };

  // Sync inputs when selected license changes
  useEffect(() => {
    if (simulatedClientKey) {
      const selected = licenses.find(l => l.license_key === simulatedClientKey);
      if (selected) {
        setHwIdInput(selected.hardware_id || 'HWID-SIMULATED-9832');
        setIpInput(selected.ip_whitelist ? selected.ip_whitelist.split(',')[0] : '127.0.0.1');
      }
    } else if (activeLicenses.length > 0) {
      setSimulatedClientKey(activeLicenses[0].license_key);
      setHwIdInput(activeLicenses[0].hardware_id || 'HWID-SIMULATED-9832');
      setIpInput(activeLicenses[0].ip_whitelist ? activeLicenses[0].ip_whitelist.split(',')[0] : '127.0.0.1');
    }
  }, [simulatedClientKey, licenses]);

  // Server-side heartbeat loop automatically cleans up zombie nodes (stale for >30s)

  // Handle server responses specifically for our connection handshake
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;

    const onNodeConnected = (data: any) => {
      setSimulationLogs(prev => [
        ...prev, 
        `[${new Date().toLocaleTimeString()}] [SUCCESS] Handshake approved for license_key ${simulatedClientKey?.substring(0, 8)}...`,
        `[${new Date().toLocaleTimeString()}] [INFO] Active stream established with ${data.software_name} [${data.tier} tier].`
      ]);
      showToast('WebSocket node authorized successfully!', 'success');
      fetchRiskScores();
    };

    const onNodeError = (err: any) => {
      setSimulationLogs(prev => [
        ...prev, 
        `[${new Date().toLocaleTimeString()}] [DENIED] Authorization failed: ${err.error}`
      ]);
      showToast(`WS connection rejected: ${err.error}`, 'error');
      fetchRiskScores();
    };

    const onApiCallLogged = (data: any) => {
      setSimulationLogs(prev => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] [SUCCESS] Logged API traffic successfully! Counts -> Daily: ${data.counts.daily}, Monthly: ${data.counts.monthly}, Yearly: ${data.counts.yearly}`
      ]);
      showToast('API traffic successfully processed and verified!', 'success');
    };

    socket.on("node:connected", onNodeConnected);
    socket.on("node:error", onNodeError);
    socket.on("node:api_call_logged", onApiCallLogged);

    return () => {
      socket.off("node:connected", onNodeConnected);
      socket.off("node:error", onNodeError);
      socket.off("node:api_call_logged", onApiCallLogged);
    };
  }, [socketRef.current, simulatedClientKey]);

  const disconnectWebSocketNode = (keyToDisconnect?: string) => {
    const key = keyToDisconnect || simulatedClientKey;
    if (!socketRef.current || !key) return;
    
    setSimulationLogs(prev => [
      ...prev, 
      `[${new Date().toLocaleTimeString()}] [WS] Terminated node session for key: ${key.substring(0, 8)}...`
    ]);
    socketRef.current.emit("node:disconnect_node", { license_key: key });
    showToast('WebSocket Node disconnected.', 'success');
  };

  const getLatencyIndicator = (licenseKey: string | undefined, rtt: number | undefined) => {
    if (rtt === undefined || rtt < 0) {
      return (
        <span className="inline-flex items-center gap-1.5 text-[9px] font-mono text-zinc-500 bg-zinc-900/50 px-1.5 py-0.5 rounded border border-zinc-800/80">
          <span className="w-1 h-1 bg-zinc-500 rounded-full animate-pulse" />
          PINGING...
        </span>
      );
    }
    
    let colorClass = "text-emerald-400 bg-emerald-950/40 border-emerald-900/50 shadow-[0_0_8px_rgba(16,185,129,0.1)]";
    let dotColor = "bg-emerald-400 shadow-[0_0_4px_rgba(16,185,129,0.8)]";
    
    if (rtt >= latencyThreshold) {
      colorClass = "text-rose-400 bg-rose-950/40 border-rose-900/50 shadow-[0_0_8px_rgba(244,63,94,0.1)]";
      dotColor = "bg-rose-400 shadow-[0_0_4px_rgba(244,63,94,0.8)] animate-pulse";
    } else if (rtt >= latencyThreshold / 3) {
      colorClass = "text-amber-400 bg-amber-950/40 border-amber-900/50 shadow-[0_0_8px_rgba(245,158,11,0.1)]";
      dotColor = "bg-amber-400 shadow-[0_0_4px_rgba(245,158,11,0.8)]";
    }
    
    const history = licenseKey ? rttHistory[licenseKey] || [] : [];
    
    return (
      <div className="relative group inline-flex">
        <span className={cn("inline-flex items-center gap-1.5 text-[9px] font-mono px-1.5 py-0.5 rounded border cursor-help", colorClass)}>
          <span className={cn("w-1 h-1 rounded-full", dotColor)} />
          {rtt}ms
        </span>
        <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block bg-zinc-950 text-zinc-300 text-[10px] p-2 rounded border border-zinc-800 whitespace-nowrap z-50">
          <div className="font-semibold mb-1 text-zinc-100">Last 5 min latency:</div>
          <div className="max-h-32 overflow-y-auto">
            {history.length > 0
              ? history.map((h, i) => (
                  <div key={i}>{new Date(h.time).toLocaleTimeString()}: {h.rtt}ms</div>
                ))
              : 'No history'}
          </div>
        </div>
      </div>
    );
  };

  // Calculate Network Health metrics
  const connectedNodes = liveWebSocketNodes.filter(n => n.rtt !== undefined && n.rtt >= 0);
  const averageRtt = connectedNodes.length > 0 
    ? Math.round(connectedNodes.reduce((sum, n) => sum + (n.rtt || 0), 0) / connectedNodes.length) 
    : null;

  const minRtt = connectedNodes.length > 0
    ? Math.min(...connectedNodes.map(n => n.rtt || 0))
    : null;

  const maxRtt = connectedNodes.length > 0
    ? Math.max(...connectedNodes.map(n => n.rtt || 0))
    : null;

  // Calculate dynamic ideal heartbeat interval based on current global average RTT
  const idealHeartbeatInterval = averageRtt !== null 
    ? Math.max(3000, Math.min(15000, Math.round((3000 + (averageRtt * 20)) / 500) * 500))
    : 3000;

  const connectWebSocketNode = () => {
    if (!socketRef.current) {
      showToast('Master socket disconnected', 'error');
      return;
    }
    if (!simulatedClientKey) {
      showToast('Please select a license key first', 'error');
      return;
    }
    setSimulationLogs(prev => [
      ...prev, 
      `[${new Date().toLocaleTimeString()}] [WS] Dialing secure licensing socket...`,
      `[${new Date().toLocaleTimeString()}] [WS] Submitting verification payload (IP: ${ipInput}, HWID: ${hwIdInput}, Adaptive Heartbeat: ${idealHeartbeatInterval / 1000}s)...`
    ]);
    socketRef.current.emit("node:connect", {
      license_key: simulatedClientKey,
      hardware_id: hwIdInput,
      ip: ipInput,
      asset_class: assetClassInput,
      account_id: accountIdInput,
      heartbeat_interval: idealHeartbeatInterval
    });
  };

  // Health assessment
  let healthStatus = "STANDBY";
  let healthColor = "text-zinc-400 bg-zinc-900/50 border-zinc-800/80";
  let healthDot = "bg-zinc-500";
  let healthDescription = "No active WebSocket pipelines currently open.";

  if (liveWebSocketNodes.length > 0) {
    if (averageRtt === null) {
      healthStatus = "INITIALIZING";
      healthColor = "text-indigo-400 bg-indigo-950/20 border-indigo-900/40 shadow-[0_0_12px_rgba(129,140,248,0.05)]";
      healthDot = "bg-indigo-400 animate-ping";
      healthDescription = "Sockets established. Dispatching handshake pings...";
    } else if (averageRtt < 50) {
      healthStatus = "EXCELLENT";
      healthColor = "text-emerald-400 bg-emerald-950/30 border-emerald-900/40 shadow-[0_0_12px_rgba(16,185,129,0.08)]";
      healthDot = "bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.8)]";
      healthDescription = "All channels routing at sub-millisecond hyper-speed.";
    } else if (averageRtt < 150) {
      healthStatus = "STABLE";
      healthColor = "text-amber-400 bg-amber-950/30 border-amber-900/40 shadow-[0_0_12px_rgba(245,158,11,0.08)]";
      healthDot = "bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.8)]";
      healthDescription = "Nominal pipeline overhead. Fully within operational limits.";
    } else {
      healthStatus = "DEGRADED";
      healthColor = "text-rose-400 bg-rose-950/30 border-rose-900/40 shadow-[0_0_12px_rgba(244,63,94,0.08)] animate-pulse";
      healthDot = "bg-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.8)]";
      healthDescription = "High latency detected. Congestion on validation tunnels.";
    }
  }

  return (
    <div className="space-y-6">
      
      {/* Network Health Summary Stat Card */}
      <div className="bg-zinc-900/30 border border-zinc-800/80 rounded-xl p-5 backdrop-blur-sm relative overflow-hidden">
        {/* Glow effect matching health status */}
        {liveWebSocketNodes.length > 0 && (
          <div className={cn(
            "absolute -top-12 -left-12 w-48 h-48 rounded-full blur-[64px] pointer-events-none opacity-20 transition-all duration-500",
            healthStatus === "EXCELLENT" && "bg-emerald-500",
            healthStatus === "STABLE" && "bg-amber-500",
            healthStatus === "DEGRADED" && "bg-rose-500",
            healthStatus === "INITIALIZING" && "bg-indigo-500"
          )} />
        )}
        
        <div className="relative flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                <Activity className="w-4 h-4 animate-pulse" />
              </span>
              <h2 className="text-zinc-100 font-bold tracking-tight text-sm uppercase">Global Network Pipeline Status</h2>
            </div>
            <p className="text-xs text-zinc-500 font-mono">Real-time WebSocket transport & telemetry monitor</p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 w-full md:w-auto">
            {/* Pipeline Health */}
            <div className="bg-zinc-950/40 border border-zinc-800/60 rounded-lg p-3 space-y-1">
              <span className="text-[10px] text-zinc-500 font-mono uppercase block">Pipeline Status</span>
              <div className="flex items-center gap-1.5">
                <span className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono border font-bold", healthColor)}>
                  <span className={cn("w-1 h-1 rounded-full", healthDot)} />
                  {healthStatus}
                </span>
              </div>
            </div>

            {/* Average Latency */}
            <div className="bg-zinc-950/40 border border-zinc-800/60 rounded-lg p-3 space-y-1">
              <span className="text-[10px] text-zinc-500 font-mono uppercase block">Average Latency</span>
              <div className="flex items-baseline gap-1">
                <span className={cn(
                  "text-base font-bold font-mono tracking-tight",
                  averageRtt === null ? "text-zinc-500" : averageRtt < 50 ? "text-emerald-400" : averageRtt < 150 ? "text-amber-400" : "text-rose-400"
                )}>
                  {averageRtt !== null ? `${averageRtt}` : "N/A"}
                </span>
                {averageRtt !== null && <span className="text-[9px] text-zinc-500 font-mono">RTT</span>}
              </div>
            </div>

            {/* Active Tunnels */}
            <div className="bg-zinc-950/40 border border-zinc-800/60 rounded-lg p-3 space-y-1">
              <span className="text-[10px] text-zinc-500 font-mono uppercase block">Active Tunnels</span>
              <div className="flex items-baseline gap-1">
                <span className={cn("text-base font-bold font-mono tracking-tight", liveWebSocketNodes.length > 0 ? "text-indigo-400" : "text-zinc-500")}>
                  {liveWebSocketNodes.length}
                </span>
                <span className="text-[9px] text-zinc-500 font-mono">ACTIVE</span>
              </div>
            </div>

            {/* Jitter / Range */}
            <div className="bg-zinc-950/40 border border-zinc-800/60 rounded-lg p-3 space-y-1">
              <span className="text-[10px] text-zinc-500 font-mono uppercase block">Telemetry Span</span>
              <div className="flex items-baseline gap-0.5">
                <span className="text-xs font-bold font-mono tracking-tight text-zinc-300">
                  {minRtt !== null && maxRtt !== null ? `${minRtt}-${maxRtt}` : "N/A"}
                </span>
                {minRtt !== null && maxRtt !== null && <span className="text-[9px] text-zinc-500 font-mono pl-0.5">ms</span>}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-zinc-800/40 flex items-center gap-2 text-[10px] text-zinc-400 font-mono">
          <span className="text-zinc-500">Diagnostic Summary:</span>
          <span>{healthDescription}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      
      {/* Configured Whitelist Registry (SQLite) */}
      <div className="lg:col-span-2 space-y-6">
        <div className="bg-zinc-900/30 border border-zinc-800/80 rounded-xl p-6 backdrop-blur-sm">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 className="text-zinc-100 font-semibold flex items-center gap-2">
                <Database className="w-4 h-4 text-indigo-400" />
                Active Node Configs (SQLite)
              </h3>
              <p className="text-xs text-zinc-500 font-mono mt-1">Configured licensing endpoints from database</p>
            </div>
            <span className="bg-zinc-800 border border-zinc-700 px-2 py-1 rounded text-[10px] font-mono text-zinc-400">
              {activeLicenses.length} Whitelisted
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-zinc-900/50 border-b border-zinc-800/80 text-zinc-400 font-mono text-[10px] uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">Client / Key</th>
                  <th className="px-4 py-3">HWID Policy</th>
                  <th className="px-4 py-3">IP Policy</th>
                  <th className="px-4 py-3 text-right">Channel Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/40">
                {activeLicenses.map(l => {
                  const isLiveWS = liveWebSocketNodes.some(n => n.license_key === l.license_key);
                  return (
                    <tr key={l.id} className="hover:bg-zinc-800/10">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-zinc-200 text-xs">{l.issued_to}</span>
                          {l.billing_cycle && (
                            <span className={cn(
                              "text-[8px] px-1.5 py-0.5 rounded font-mono uppercase font-bold tracking-wider",
                              l.billing_cycle === 'monthly' ? "bg-cyan-500/10 border border-cyan-500/20 text-cyan-400" :
                              l.billing_cycle === 'yearly' ? "bg-amber-500/10 border border-amber-500/20 text-amber-400" :
                              l.billing_cycle === 'profit_share' ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 animate-pulse" :
                              "bg-indigo-500/10 border border-indigo-500/20 text-indigo-400"
                            )}>
                              {l.billing_cycle === 'onetime' ? 'lifetime' : l.billing_cycle === 'profit_share' ? `profit share (${l.profit_share_pct ?? 15}%)` : l.billing_cycle}
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] font-mono text-zinc-500 flex items-center gap-1 mt-0.5">
                          <Key className="w-3 h-3 text-indigo-400/80" />
                          {l.license_key ? `${l.license_key.substring(0, 12)}...` : 'N/A'}
                        </div>
                        {l.asset_classes && (
                          <div className="flex gap-1 mt-1.5">
                            {JSON.parse(l.asset_classes).map((a: string) => (
                              <span key={a} className="bg-zinc-800/80 text-[8px] text-zinc-400 px-1 py-0.5 rounded border border-zinc-700/50 uppercase font-bold tracking-tighter">
                                {a}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <button 
                          onClick={() => l.hardware_id && copyToClipboard(l.hardware_id)}
                          className="flex items-center hover:text-indigo-400 transition-colors text-zinc-400 font-mono text-[10px]"
                        >
                          <Cpu className="w-3 h-3 mr-1.5 text-zinc-500" />
                          {l.hardware_id || 'UNLOCKED'}
                        </button>
                        {l.hardware_id && (
                          <button 
                            onClick={() => handleResetHwid(l.id)}
                            className="ml-2 text-rose-400 hover:text-rose-300 transition-colors p-1"
                            title="Reset Hardware Lock"
                          >
                            <RefreshCw className="w-3 h-3" />
                          </button>
                        )}
                        <button 
                          onClick={() => handleGenerateOfflineToken(l.id)}
                          className="ml-2 text-indigo-400 hover:text-indigo-300 transition-colors p-1"
                          title="Generate Offline Token"
                        >
                          <Zap className="w-3 h-3" />
                        </button>
                      </td>
                      <td className="px-4 py-3 text-zinc-400 font-mono text-[10px]">
                        <Server className="w-3 h-3 inline mr-1.5 text-zinc-500" />
                        {l.ip_whitelist || '0.0.0.0/0'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {isLiveWS ? (
                          <div className="flex items-center justify-end gap-2">
                            <div className="inline-flex items-center gap-1.5 text-indigo-400 font-mono text-[10px] bg-indigo-950/40 border border-indigo-900/50 px-2 py-0.5 rounded-full">
                              <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-pulse shadow-[0_0_8px_rgba(129,140,248,0.8)]" />
                              WS LIVE
                            </div>
                            {getLatencyIndicator(l.license_key, liveWebSocketNodes.find(n => n.license_key === l.license_key)?.rtt)}
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1.5 text-emerald-500 font-mono text-[10px] bg-emerald-950/20 border border-emerald-900/30 px-2 py-0.5 rounded-full">
                            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                            HTTP IDLE
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button 
                          onClick={() => setEditingLicense(l)}
                          className="bg-zinc-800/80 hover:bg-zinc-700/80 border border-zinc-700/50 text-indigo-400 hover:text-indigo-300 text-[10px] font-mono px-2 py-1 rounded transition-all inline-flex items-center gap-1"
                        >
                          <SlidersHorizontal className="w-3 h-3" />
                          Configure
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {activeLicenses.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-zinc-500 font-mono text-xs">
                      NO ACTIVE LICENSES
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Live Connected WS Pipes */}
        <div className="bg-zinc-900/30 border border-zinc-800/80 rounded-xl p-6 backdrop-blur-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <h3 className="text-zinc-100 font-semibold flex items-center gap-2">
              <Zap className="w-4 h-4 text-indigo-400" />
              Live Connected Pipes ({liveWebSocketNodes.length})
            </h3>
            {liveWebSocketNodes.length > 0 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const allKeys = liveWebSocketNodes.map(n => n.license_key);
                    const allSelected = allKeys.every(k => selectedKeys.includes(k));
                    if (allSelected) {
                      setSelectedKeys(prev => prev.filter(k => !allKeys.includes(k)));
                    } else {
                      setSelectedKeys(prev => {
                        const next = [...prev];
                        allKeys.forEach(k => {
                          if (!next.includes(k)) next.push(k);
                        });
                        return next;
                      });
                    }
                  }}
                  className="bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-750 text-zinc-300 hover:text-zinc-200 text-[10px] px-2.5 py-1 rounded font-mono transition-colors flex items-center gap-1"
                >
                  {liveWebSocketNodes.map(n => n.license_key).every(k => selectedKeys.includes(k)) ? "Deselect All" : "Select All"}
                </button>
                {selectedKeys.filter(k => liveWebSocketNodes.some(n => n.license_key === k)).length > 0 && (
                  <button
                    onClick={() => setShowDisconnectConfirm(true)}
                    className="bg-rose-500/20 hover:bg-rose-500 border border-rose-500/30 hover:border-rose-400/50 text-rose-400 hover:text-white text-[10px] font-bold px-2.5 py-1 rounded font-mono transition-all flex items-center gap-1 shadow-[0_0_10px_rgba(244,63,94,0.1)]"
                  >
                    <StopCircle className="w-3 h-3" />
                    Disconnect Selected ({selectedKeys.filter(k => liveWebSocketNodes.some(n => n.license_key === k)).length})
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="space-y-3">
            {liveWebSocketNodes.map((node, idx) => {
              const isSelected = selectedKeys.includes(node.license_key);
              const isLatencyExceeded = node.rtt !== undefined && node.rtt > latencyThreshold;
              return (
                <div 
                  key={idx} 
                  className={cn(
                    "flex justify-between items-center bg-zinc-950/40 border p-3 rounded-lg transition-all relative overflow-hidden",
                    isLatencyExceeded 
                      ? "border-rose-500/40 bg-rose-950/15 shadow-[0_0_12px_rgba(244,63,94,0.08)]"
                      : isSelected 
                        ? "border-indigo-500/50 bg-indigo-950/10 shadow-[0_0_12px_rgba(99,102,241,0.05)]" 
                        : "border-zinc-800/60 hover:border-zinc-700/80"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {
                        if (isSelected) {
                          setSelectedKeys(prev => prev.filter(k => k !== node.license_key));
                        } else {
                          setSelectedKeys(prev => [...prev, node.license_key]);
                        }
                      }}
                      className="w-4 h-4 rounded border-zinc-800 bg-zinc-950 text-indigo-600 focus:ring-indigo-500/50 focus:ring-offset-zinc-950 cursor-pointer"
                    />
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-zinc-300 font-semibold">{node.license_key.substring(0, 12)}...</span>
                        <span className="bg-indigo-950 text-indigo-400 text-[9px] px-1.5 py-0.5 rounded font-mono border border-indigo-900/50">LIVE SOCKET</span>
                        {getLatencyIndicator(node.license_key, node.rtt)}
                        {isLatencyExceeded && (
                          <span className="bg-rose-500/10 border border-rose-500/30 text-rose-400 text-[9px] px-1.5 py-0.5 rounded font-mono flex items-center gap-1 animate-pulse font-semibold">
                            <AlertTriangle className="w-2.5 h-2.5" /> DEGRADED
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] font-mono text-zinc-500 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span>IP: {node.ip}</span>
                        <span>HWID: {node.hardwareId}</span>
                        <span>Since: {new Date(node.connectedAt).toLocaleTimeString()}</span>
                        <span className="flex items-center gap-1 text-indigo-400 font-semibold bg-indigo-950/20 px-1.5 py-0.5 rounded border border-indigo-950/40">
                          <span>Heartbeat: {node.heartbeatInterval ? `${node.heartbeatInterval / 1000}s` : '3s'}</span>
                          {node.heartbeatInterval && node.heartbeatInterval > 3000 && (
                            <span className="text-[8px] bg-indigo-500 text-zinc-950 px-1 rounded-sm font-bold scale-90 origin-left uppercase">OPTIMIZED</span>
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                  <button 
                    onClick={() => disconnectWebSocketNode(node.license_key)}
                    className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/60 hover:border-zinc-600 text-rose-400 hover:text-rose-300 text-[10px] px-2.5 py-1 rounded font-mono transition-colors"
                  >
                    DISCONNECT
                  </button>
                </div>
              );
            })}
            {liveWebSocketNodes.length === 0 && (
              <div className="text-center py-6 text-zinc-500 font-mono text-xs border border-dashed border-zinc-800/80 rounded-lg">
                NO ACTIVE SOCKET CONNECTIONS ESTABLISHED
              </div>
            )}
          </div>
        </div>
      </div>

      {/* WebSocket Simulation Terminal Console */}
      <div className="space-y-6">
        <div className="bg-zinc-900/30 border border-zinc-800/80 rounded-xl p-6 backdrop-blur-sm flex flex-col h-full space-y-4">
          <div>
            <h3 className="text-zinc-100 font-semibold flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400 animate-pulse" />
              WS Validation Console
            </h3>
            <p className="text-xs text-zinc-500 font-mono mt-1">Simulate live node licensing handshakes</p>
          </div>

          <div className="space-y-3 pt-2">
            <div>
              <label className="block text-[9px] font-mono text-zinc-500 uppercase mb-1">Select Whitelisted License</label>
              <select 
                value={simulatedClientKey} 
                onChange={e => setSimulatedClientKey(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 text-xs font-mono outline-none focus:border-indigo-500"
              >
                <option value="">-- Choose License Key --</option>
                {activeLicenses.map(l => (
                  <option key={l.id} value={l.license_key}>
                    {l.issued_to} ({l.license_key.substring(0, 8)}...)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[9px] font-mono text-zinc-500 uppercase mb-1">Simulated Hardware ID (HWID)</label>
              <input 
                type="text" 
                value={hwIdInput} 
                onChange={e => setHwIdInput(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-300 text-xs font-mono outline-none focus:border-indigo-500" 
              />
            </div>

            <div>
              <label className="block text-[9px] font-mono text-zinc-500 uppercase mb-1">Simulated Source IP</label>
              <input 
                type="text" 
                value={ipInput} 
                onChange={e => setIpInput(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-300 text-xs font-mono outline-none focus:border-indigo-500" 
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[9px] font-mono text-zinc-500 uppercase mb-1">Asset Class</label>
                <select 
                  value={assetClassInput} 
                  onChange={e => setAssetClassInput(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-300 text-xs font-mono outline-none focus:border-indigo-500" 
                >
                  <option value="forex">Forex</option>
                  <option value="crypto">Crypto</option>
                  <option value="stocks">Stocks</option>
                  <option value="commodities">Commodities</option>
                </select>
              </div>
              <div>
                <label className="block text-[9px] font-mono text-zinc-500 uppercase mb-1">Account ID / Key</label>
                <input 
                  type="text" 
                  value={accountIdInput} 
                  onChange={e => setAccountIdInput(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-300 text-xs font-mono outline-none focus:border-indigo-500" 
                />
              </div>
            </div>

            <div className="bg-zinc-950/60 border border-zinc-850/80 rounded-lg p-3 space-y-1">
              <div className="flex justify-between items-center">
                <span className="text-[9px] font-mono text-zinc-500 uppercase">Adaptive Heartbeat Interval</span>
                <span className="text-[8px] font-mono font-extrabold px-1.5 py-0.5 rounded bg-indigo-950 text-indigo-400 border border-indigo-900/40">AUTO OPTIMIZED</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-mono font-bold text-zinc-200">{idealHeartbeatInterval / 1000}s ({idealHeartbeatInterval}ms)</span>
                <span className="text-[9px] font-mono text-zinc-500">
                  Calculated from {averageRtt !== null ? `${averageRtt}ms Avg RTT` : "3000ms Baseline"}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <button 
                onClick={connectWebSocketNode}
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-[10px] font-bold py-2 px-3 rounded-lg transition-colors flex items-center justify-center gap-1"
              >
                <Zap className="w-3.5 h-3.5" />
                WS_CONNECT
              </button>
              <button 
                onClick={() => disconnectWebSocketNode()}
                className="bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 font-mono text-[10px] py-2 px-3 rounded-lg transition-colors flex items-center justify-center gap-1"
              >
                <StopCircle className="w-3.5 h-3.5" />
                WS_ABORT
              </button>
            </div>

            {liveWebSocketNodes.some(n => n.license_key === simulatedClientKey) && (
              <div className="bg-zinc-950/40 border border-indigo-900/40 p-3 rounded-lg space-y-2 mt-2">
                <div className="text-[10px] font-mono text-indigo-400 font-semibold uppercase flex items-center gap-1">
                  <Zap className="w-3 h-3 text-indigo-400 animate-pulse" />
                  Secure Live Traffic Simulator
                </div>
                <div className="flex gap-2">
                  <input 
                    type="number" 
                    value={apiSimCount} 
                    onChange={e => setApiSimCount(Math.max(1, Number(e.target.value)))}
                    className="w-1/2 bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1 text-zinc-300 text-xs font-mono outline-none focus:border-indigo-500" 
                  />
                  <button 
                    onClick={simulateApiCalls}
                    className="w-1/2 bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-[10px] font-bold py-1 px-3 rounded-lg transition-colors flex items-center justify-center gap-1"
                  >
                    Simulate Traffic
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Terminal output */}
          <div className="flex-1 flex flex-col space-y-1.5">
            <div className="flex justify-between items-center">
              <label className="text-[9px] font-mono text-zinc-500 uppercase">Interactive Terminal Logs</label>
              <div className="flex items-center gap-2 font-mono text-[9px]">
                {simulationLogs.length > 0 && (
                  <>
                    <button 
                      onClick={exportLogsAsJSON} 
                      className="text-indigo-400 hover:text-indigo-300 uppercase hover:underline"
                      title="Export logs as structured JSON"
                    >
                      Export JSON
                    </button>
                    <span className="text-zinc-700 font-bold">|</span>
                    <button 
                      onClick={exportLogsAsCSV} 
                      className="text-indigo-400 hover:text-indigo-300 uppercase hover:underline"
                      title="Export logs as CSV spreadsheet"
                    >
                      Export CSV
                    </button>
                    <span className="text-zinc-700 font-bold">|</span>
                  </>
                )}
                <button 
                  onClick={() => setSimulationLogs([])} 
                  className="text-zinc-400 hover:text-zinc-300 uppercase"
                >
                  Clear
                </button>
              </div>
            </div>
            <div className="bg-zinc-950/90 border border-zinc-850 p-3 rounded-lg font-mono text-[10px] text-zinc-400 h-48 overflow-y-auto space-y-1 select-text scrollbar-thin scrollbar-thumb-zinc-800">
              {simulationLogs.map((log, idx) => {
                let color = 'text-zinc-400';
                if (log.includes('[SUCCESS]')) color = 'text-emerald-400';
                else if (log.includes('[ERROR]') || log.includes('[DENIED]')) color = 'text-rose-400';
                else if (log.includes('[INFO]')) color = 'text-blue-400';
                return (
                  <div key={idx} className={cn("leading-relaxed break-all", color)}>
                    {log}
                  </div>
                );
              })}
              {simulationLogs.length === 0 && (
                <div className="text-zinc-600 text-center py-12">
                  System diagnostic logs will print here...
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <EditNodeConfigModal 
        isOpen={editingLicense !== null} 
        onClose={() => setEditingLicense(null)} 
        license={editingLicense} 
        onSave={handleSaveConfig} 
      />

      {/* Bulk Disconnect Confirmation Modal */}
      {showDisconnectConfirm && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-zinc-900 border border-zinc-800/80 rounded-xl w-full max-w-md overflow-hidden shadow-2xl relative">
            <div className="p-5 border-b border-zinc-800/80 bg-zinc-950/50 flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
                <AlertTriangle className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <h4 className="text-zinc-100 font-bold tracking-tight text-sm uppercase">Terminate Sessions</h4>
                <p className="text-[10px] text-zinc-500 font-mono">Requires administrator authorization</p>
              </div>
            </div>
            
            <div className="p-5 space-y-4">
              <p className="text-xs text-zinc-300 leading-relaxed">
                You are about to terminate <span className="text-rose-400 font-bold">{selectedKeys.filter(k => liveWebSocketNodes.some(n => n.license_key === k)).length} active WebSocket pipeline(s)</span>. 
                Any client terminals bound to these sessions will lose authorization and be disconnected immediately.
              </p>

              <div className="bg-zinc-950/80 border border-zinc-850 rounded-lg p-3 max-h-40 overflow-y-auto space-y-2">
                <span className="text-[9px] font-mono text-zinc-500 uppercase block mb-1">Target Licenses:</span>
                {selectedKeys.filter(k => liveWebSocketNodes.some(n => n.license_key === k)).map(key => {
                  const node = liveWebSocketNodes.find(n => n.license_key === key);
                  return (
                    <div key={key} className="flex justify-between items-center text-[10px] font-mono text-zinc-400 border-b border-zinc-900/50 pb-1.5 last:border-0 last:pb-0">
                      <span className="font-semibold text-zinc-300">{key.substring(0, 16)}...</span>
                      {node && <span className="text-zinc-500">IP: {node.ip}</span>}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="p-4 bg-zinc-950/40 border-t border-zinc-800/80 flex justify-end gap-3">
              <button
                onClick={() => setShowDisconnectConfirm(false)}
                className="bg-zinc-800 hover:bg-zinc-700 border border-zinc-700/60 text-zinc-300 font-mono text-[10px] py-2 px-4 rounded-lg transition-colors"
              >
                CANCEL_ABORT
              </button>
              <button
                onClick={() => {
                  const toDisconnect = selectedKeys.filter(k => liveWebSocketNodes.some(n => n.license_key === k));
                  toDisconnect.forEach(key => {
                    disconnectWebSocketNode(key);
                  });
                  setSelectedKeys([]);
                  setShowDisconnectConfirm(false);
                  showToast(`Dispatched termination signals for ${toDisconnect.length} connection(s).`, 'success');
                }}
                className="bg-rose-500 hover:bg-rose-600 text-white font-mono text-[10px] font-bold py-2 px-4 rounded-lg transition-all shadow-[0_0_15px_rgba(244,63,94,0.3)] flex items-center gap-1.5"
              >
                <StopCircle className="w-3.5 h-3.5" />
                CONFIRM_TERMINATE
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

function SettingsView({ 
  showToast, 
  licenses, 
  socketRef, 
  currentUser,
  handleGenerateOfflineToken,
  copyToClipboard,
  latencyThreshold,
  setLatencyThreshold,
  smtp,
  setSmtp,
  handleSaveSmtp,
  isSavingSmtp,
  notificationPrefs,
  setNotificationPrefs,
  handleSavePrefs,
  isSavingPrefs
}: { 
  showToast: (msg: string, type: 'success'|'error') => void, 
  licenses: License[],
  socketRef: React.MutableRefObject<Socket | null>,
  currentUser: AppUser | null,
  handleGenerateOfflineToken: (id: string) => Promise<string | null>,
  copyToClipboard: (text: string) => void,
  latencyThreshold: number,
  setLatencyThreshold: React.Dispatch<React.SetStateAction<number>>,
  smtp: { host: string, port: number, user: string, pass: string, secure: boolean, from_email: string },
  setSmtp: React.Dispatch<React.SetStateAction<{ host: string, port: number, user: string, pass: string, secure: boolean, from_email: string }>>,
  handleSaveSmtp: () => Promise<void>,
  isSavingSmtp: boolean,
  notificationPrefs: { expirations: boolean, renewals: boolean, assignments: boolean, risk_alerts: boolean, expiration_alerts: boolean },
  setNotificationPrefs: React.Dispatch<React.SetStateAction<{ expirations: boolean, renewals: boolean, assignments: boolean, risk_alerts: boolean, expiration_alerts: boolean }>>,
  handleSavePrefs: () => Promise<void>,
  isSavingPrefs: boolean
}) {
  const [activeTab, setActiveTab] = useState<'general' | 'audit' | 'notifications'>('general');

  const [riskEnabled, setRiskEnabled] = useState(false);
  const [riskThreshold, setRiskThreshold] = useState(80);
  const [expEnabled, setExpEnabled] = useState(false);
  const [expThreshold, setExpThreshold] = useState(7);
  const [isSavingNotifications, setIsSavingNotifications] = useState(false);
  const [isSimulatingNotificationAlert, setIsSimulatingNotificationAlert] = useState(false);
  const [simulatedAlertData, setSimulatedAlertData] = useState<{
    subject: string;
    body: string;
    triggeredBy: string;
    recipients: string;
  } | null>(null);

  const [isRotating, setIsRotating] = useState(false);
  const [isSavingLatency, setIsSavingLatency] = useState(false);

  const [autoPauseEnabled, setAutoPauseEnabled] = useState(false);
  const [isSavingAutoPause, setIsSavingAutoPause] = useState(false);

  useEffect(() => {
    if (localStorage.getItem('nonaxen_static_mode') === 'true') {
      const saved = localStorage.getItem('mock_db_auto_pause');
      setAutoPauseEnabled(saved === 'true');
      
      setRiskEnabled(localStorage.getItem('mock_db_notify_risk_score_enabled') === 'true');
      setRiskThreshold(Number(localStorage.getItem('mock_db_notify_risk_score_threshold') || '80'));
      setExpEnabled(localStorage.getItem('mock_db_notify_expiration_enabled') === 'true');
      setExpThreshold(Number(localStorage.getItem('mock_db_notify_expiration_threshold') || '7'));
      return;
    }
    fetch('/api/settings/auto-pause')
      .then(res => res.json())
      .then(data => setAutoPauseEnabled(data.enabled))
      .catch(err => console.error('Failed to fetch auto-pause setting', err));

    fetch('/api/settings/notifications')
      .then(res => res.json())
      .then(data => {
        setRiskEnabled(data.riskEnabled);
        setRiskThreshold(data.riskThreshold);
        setExpEnabled(data.expEnabled);
        setExpThreshold(data.expThreshold);
      })
      .catch(err => console.error('Failed to fetch notification settings', err));
  }, []);

  const handleToggleAutoPause = async () => {
    setIsSavingAutoPause(true);
    const newValue = !autoPauseEnabled;
    try {
      if (localStorage.getItem('nonaxen_static_mode') === 'true') {
        localStorage.setItem('mock_db_auto_pause', newValue ? 'true' : 'false');
        setAutoPauseEnabled(newValue);
        showToast(`Auto-Pause ${newValue ? 'enabled' : 'disabled'} successfully`, 'success');
        
        // Simulating the backend suspend trigger immediately if enabled
        if (newValue) {
          const storedLicenses = localStorage.getItem('mock_db_licenses');
          if (storedLicenses) {
            const parsedLicenses: License[] = JSON.parse(storedLicenses);
            const scores = JSON.parse(localStorage.getItem('mock_db_risk_scores') || '{}');
            let updated = false;
            
            const newLicenses = parsedLicenses.map(l => {
              if (l.status === 'active' && scores[l.id]?.risk_score > 90) {
                updated = true;
                // Add an audit log
                const logs = JSON.parse(localStorage.getItem('mock_db_audit_logs') || '[]');
                logs.unshift({
                  id: `log_auto_${Date.now()}`,
                  user_id: 'system',
                  user_name: 'System Auto-Defender',
                  action: 'auto_suspend',
                  entity_type: 'license',
                  entity_id: l.id,
                  details: `License auto-suspended due to risk score ${scores[l.id].risk_score} > 90`,
                  timestamp: new Date().toISOString()
                });
                localStorage.setItem('mock_db_audit_logs', JSON.stringify(logs));
                
                return { ...l, status: 'suspended' as const };
              }
              return l;
            });
            
            if (updated) {
              localStorage.setItem('mock_db_licenses', JSON.stringify(newLicenses));
              setTimeout(() => {
                window.location.reload();
              }, 1000);
            }
          }
        }
        setIsSavingAutoPause(false);
        return;
      }
      const res = await fetch('/api/settings/auto-pause', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: newValue, user: currentUser })
      });
      if (res.ok) {
        setAutoPauseEnabled(newValue);
        showToast(`Auto-Pause ${newValue ? 'enabled' : 'disabled'} successfully`, 'success');
      } else {
        throw new Error('Failed to save');
      }
    } catch (err) {
      showToast('Error saving auto-pause setting', 'error');
    } finally {
      setIsSavingAutoPause(false);
    }
  };


  const handleSaveLatencyThreshold = async () => {
    setIsSavingLatency(true);
    try {
      if (localStorage.getItem('nonaxen_static_mode') === 'true') {
        localStorage.setItem('mock_db_latency_threshold', String(latencyThreshold));
        showToast('Latency alert threshold updated successfully (Local Session)', 'success');
        setIsSavingLatency(false);
        return;
      }
      const res = await fetch('/api/settings/latency-threshold', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          threshold: latencyThreshold,
          user: currentUser
        })
      });
      if (res.ok) {
        showToast('Latency alert threshold updated successfully', 'success');
      } else {
        throw new Error('Failed to save');
      }
    } catch (err) {
      showToast('Error saving latency threshold', 'error');
    } finally {
      setIsSavingLatency(false);
    }
  };

  const handleSaveNotifications = async () => {
    setIsSavingNotifications(true);
    try {
      if (localStorage.getItem('nonaxen_static_mode') === 'true') {
        localStorage.setItem('mock_db_notify_risk_score_enabled', riskEnabled ? 'true' : 'false');
        localStorage.setItem('mock_db_notify_risk_score_threshold', String(riskThreshold));
        localStorage.setItem('mock_db_notify_expiration_enabled', expEnabled ? 'true' : 'false');
        localStorage.setItem('mock_db_notify_expiration_threshold', String(expThreshold));
        
        const logs = JSON.parse(localStorage.getItem('mock_db_audit_logs') || '[]');
        logs.unshift({
          id: `log_notif_${Date.now()}`,
          user_id: currentUser?.id || 'system',
          user_name: currentUser?.name || 'Administrator',
          action: 'update_notification_thresholds',
          entity_type: 'system_config',
          entity_id: 'notification_thresholds',
          details: `Notification thresholds updated: Risk > ${riskThreshold}% (${riskEnabled ? 'Enabled' : 'Disabled'}), Expiration < ${expThreshold} days (${expEnabled ? 'Enabled' : 'Disabled'})`,
          timestamp: new Date().toISOString()
        });
        localStorage.setItem('mock_db_audit_logs', JSON.stringify(logs));
        
        showToast('Notification thresholds updated successfully (Local Session)', 'success');
        setIsSavingNotifications(false);
        return;
      }
      const res = await fetch('/api/settings/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          riskEnabled,
          riskThreshold,
          expEnabled,
          expThreshold,
          user: currentUser
        })
      });
      if (res.ok) {
        showToast('Notification thresholds updated successfully', 'success');
      } else {
        throw new Error('Failed to save');
      }
    } catch (err) {
      showToast('Error saving notification thresholds', 'error');
    } finally {
      setIsSavingNotifications(false);
    }
  };

  const handleSimulateNotificationAlert = () => {
    if (!riskEnabled && !expEnabled) {
      showToast('Please enable at least one notification trigger threshold first.', 'error');
      return;
    }

    setIsSimulatingNotificationAlert(true);

    // Retrieve risk scores map
    let riskScores: Record<string, { risk_score: number }> = {};
    try {
      const stored = localStorage.getItem('mock_db_risk_scores');
      if (stored) {
        riskScores = JSON.parse(stored);
      } else {
        // Fallback mockup
        riskScores = {
          'lic_01': { risk_score: 12 },
          'lic_02': { risk_score: 45 },
          'lic_03': { risk_score: 8 },
          'lic_04': { risk_score: 94 },
        };
      }
    } catch (e) {
      console.error(e);
    }

    const triggeredRisks: Array<{ license: License; score: number }> = [];
    const triggeredExpirations: Array<{ license: License; days: number }> = [];

    licenses.forEach(l => {
      // Check risk score trigger
      if (riskEnabled) {
        const score = riskScores[l.id]?.risk_score ?? (l.id === 'lic_04' ? 94 : 15);
        if (score > riskThreshold) {
          triggeredRisks.push({ license: l, score });
        }
      }

      // Check expiration trigger
      if (expEnabled && l.expires_at) {
        const diffMs = new Date(l.expires_at).getTime() - Date.now();
        const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        if (days > 0 && days < expThreshold) {
          triggeredExpirations.push({ license: l, days });
        }
      }
    });

    if (triggeredRisks.length === 0 && triggeredExpirations.length === 0) {
      // If no license triggers, fabricate one simulation so the admin sees the alert payload in action
      const mockLicense = licenses[0] || {
        id: 'lic_sim',
        license_key: 'SIM-KEY-ALPHA-7777',
        issued_to: 'Simulated Suspect Corp',
        software_name: 'Advanced Arbitrage Bot',
        tier: 'enterprise',
        expires_at: new Date(Date.now() + 2 * 24 * 3600000).toISOString()
      };
      triggeredRisks.push({ license: mockLicense as any, score: Math.max(riskThreshold + 5, 85) });
      triggeredExpirations.push({ license: mockLicense as any, days: Math.max(1, expThreshold - 2) });
    }

    // Format Email Body
    let bodyText = `Dear Systems Administrator,\n\n`;
    bodyText += `This is an automated critical notification from your Nonaxen Licensing & Anti-Tamper Core.\n`;
    bodyText += `The following nodes or licenses have breached your configured alert thresholds:\n\n`;

    if (triggeredRisks.length > 0) {
      bodyText += `============================================================\n`;
      bodyText += `⚠️ HIGH-RISK DETECTIONS (Threshold: > ${riskThreshold}%)\n`;
      bodyText += `============================================================\n`;
      triggeredRisks.forEach(tr => {
        bodyText += `- Client: ${tr.license.issued_to}\n`;
        bodyText += `  Product: ${tr.license.software_name}\n`;
        bodyText += `  Key: ${tr.license.license_key || 'N/A'}\n`;
        bodyText += `  Current Risk Score: ${tr.score}% (CRITICAL POLICY VIOLATION)\n\n`;
      });
    }

    if (triggeredExpirations.length > 0) {
      bodyText += `============================================================\n`;
      bodyText += `⏳ EXPIRATION WARNINGS (Threshold: < ${expThreshold} Days)\n`;
      bodyText += `============================================================\n`;
      triggeredExpirations.forEach(te => {
        bodyText += `- Client: ${te.license.issued_to}\n`;
        bodyText += `  Product: ${te.license.software_name}\n`;
        bodyText += `  Key: ${te.license.license_key || 'N/A'}\n`;
        bodyText += `  Days Remaining: ${te.days} days (Expires ${new Date(te.license.expires_at!).toLocaleDateString()})\n\n`;
      });
    }

    bodyText += `Action Required:\n`;
    bodyText += `Please log in to the Nonaxen Security Shield administrative panel to review these anomalies, reset hardware bindings, or suspend non-compliant licenses.\n\n`;
    bodyText += `Regards,\n`;
    bodyText += `Nonaxen Compliance & Licensing Robot`;

    const recipientList = recipients || 'secops@nonaxen.infra';

    setSimulatedAlertData({
      subject: `[CRITICAL SECURITY ALERT] Threshold Breach on Nonaxen Licensing Engine`,
      body: bodyText,
      triggeredBy: `Risk Score (> ${riskThreshold}%) / Expiration (< ${expThreshold} days)`,
      recipients: recipientList
    });

    showToast('Trigger alert evaluation completed (Simulated Dispatch)', 'success');
    setIsSimulatingNotificationAlert(false);
  };
  const [schedule, setSchedule] = useState<AuditSchedule | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [recipients, setRecipients] = useState('');
  const [dispatchHour, setDispatchHour] = useState(9);
  const [reportScope, setReportScope] = useState<'comprehensive' | 'summary' | 'risk_only'>('comprehensive');
  const [isSaving, setIsSaving] = useState(false);

  const mt5Snippet = `
// MT5 Connection Snippet for Quant Fund Licensing
// Paste this inside your Expert Advisor code

#include <JSON\\json.mqh> // Ensure you have a JSON library installed

int OnInit() {
   string serverUrl = "${window.location.origin}/api/license/verify";
   string licenseKey = "YOUR_LICENSE_KEY_HERE";
   
   // Generate Hardware Fingerprint
   string hardwareID = TerminalInfoString(TERMINAL_COMMONDATA_PATH);
   long account = AccountInfoInteger(ACCOUNT_LOGIN);
   string fingerprint = hardwareID + "_" + IntegerToString(account);
   
   // Specific asset and account context
   string assetClass = "forex"; // or "crypto", "stocks"
   string accountID = IntegerToString(account);

   string postData = "{\\"license_key\\":\\"" + licenseKey + 
                    "\\", \\"hardware_id\\":\\"" + fingerprint + 
                    "\\", \\"asset_class\\":\\"" + assetClass + 
                    "\\", \\"account_id\\":\\"" + accountID + "\\" }";
   
   char post[], result[];
   string headers = "Content-Type: application/json\\r\\n";
   StringToCharArray(postData, post);
   
   int res = WebRequest("POST", serverUrl, headers, 5000, post, result, headers);
   
   if(res == 200) {
      Print("License Verified. Node-Lock Bound: " + fingerprint);
      return(INIT_SUCCEEDED);
   } else {
      Alert("License Unauthorized! Check HWID or Expiry.");
      return(INIT_FAILED);
   }
}
  `;

  const [isSimulating, setIsSimulating] = useState(false);
  const [simResult, setSimResult] = useState<{ pdfName: string, recipients: string[], timestamp: string, scope: string } | null>(null);
  const [isTestingSmtp, setIsTestingSmtp] = useState(false);
  const [general, setGeneral] = useState({ appName: 'QUANT FUND LICENSING', systemEmail: 'admin@quantfund.net' });
  const [systemPublicKey, setSystemPublicKey] = useState('');
  const [offlineToken, setOfflineToken] = useState<{ id: string, token: string } | null>(null);

  const onGenerateOfflineToken = async (id: string) => {
    const token = await handleGenerateOfflineToken(id);
    if (token) {
      setOfflineToken({ id, token });
    }
  };

  const fetchSchedule = async () => {
    if (localStorage.getItem('nonaxen_static_mode') === 'true') {
      const storedSch = localStorage.getItem('mock_db_audit_schedule');
      const data = storedSch ? JSON.parse(storedSch) : {
        id: 'sch_1',
        enabled: 1,
        recipients: 'compliance@nonaxen.infra',
        dispatch_hour: 9,
        report_scope: 'comprehensive',
        next_run_at: '2026-08-01T09:00:00Z'
      };
      setSchedule(data);
      setEnabled(data.enabled === 1);
      setRecipients(data.recipients || '');
      setDispatchHour(data.dispatch_hour || 0);
      setReportScope(data.report_scope || 'comprehensive');

      const storedSmtp = localStorage.getItem('mock_db_smtp');
      const smtpData = storedSmtp ? JSON.parse(storedSmtp) : {
        host: 'smtp.nonaxen.infra',
        port: 587,
        user: 'audit-sender',
        pass: '••••••••',
        secure: false,
        from_email: 'audit@nonaxen.infra'
      };
      setSmtp({
        ...smtpData,
        secure: smtpData.secure === 1 || smtpData.secure === true
      });

      setSystemPublicKey("MOCK-PUBLIC-KEY-RSA-2048-NETLIFY");
      
      const threshold = localStorage.getItem('mock_db_latency_threshold') || "150";
      setLatencyThreshold(Number(threshold));
      return;
    }
    try {
      const res = await fetch('/api/audit-schedule');
      const data = await res.json();
      if (data) {
        setSchedule(data);
        setEnabled(data.enabled === 1);
        setRecipients(data.recipients || '');
        setDispatchHour(data.dispatch_hour || 0);
        setReportScope(data.report_scope || 'comprehensive');
      }

      const smtpRes = await fetch('/api/smtp');
      const smtpData = await smtpRes.json();
      if (smtpData) {
        setSmtp({
          ...smtpData,
          secure: smtpData.secure === 1
        });
      }

      const pubKeyRes = await fetch('/api/system/public-key');
      const pubKeyData = await pubKeyRes.json();
      setSystemPublicKey(pubKeyData.publicKey);

      const thresholdRes = await fetch('/api/settings/latency-threshold');
      const thresholdData = await thresholdRes.json();
      if (thresholdData) {
        setLatencyThreshold(thresholdData.threshold);
      }
    } catch (err) {
      console.error("Failed to fetch settings:", err);
    }
  };

  const handleTestSmtp = async () => {
    if (!smtp.from_email) {
      showToast('Please set a from email first', 'error');
      return;
    }
    setIsTestingSmtp(true);
    if (localStorage.getItem('nonaxen_static_mode') === 'true') {
      setTimeout(() => {
        showToast('Test email sent successfully (Simulated Local SMTP Relay)', 'success');
        setIsTestingSmtp(false);
      }, 1000);
      return;
    }
    try {
      const res = await fetch('/api/smtp/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: smtp.from_email })
      });
      if (res.ok) {
        showToast('Test email sent successfully', 'success');
      } else {
        const data = await res.json();
        showToast(data.error || 'Failed to send test email', 'error');
      }
    } catch (err) {
      showToast('Network error during SMTP test', 'error');
    } finally {
      setIsTestingSmtp(false);
    }
  };

  useEffect(() => {
    fetchSchedule();
  }, []);

  // Listen to socket updates for real-time sync
  useEffect(() => {
    if (localStorage.getItem('nonaxen_static_mode') === 'true') {
      return; // Handled directly inside mockSocket emissions
    }
    const socket = io();
    socket.on('audit_schedule:updated', (data: AuditSchedule) => {
      if (data) {
        setSchedule(data);
        setEnabled(data.enabled === 1);
        setRecipients(data.recipients || '');
        setDispatchHour(data.dispatch_hour || 0);
        setReportScope(data.report_scope || 'comprehensive');
      }
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const handleRotate = () => {
    setIsRotating(true);
    setTimeout(() => {
      setIsRotating(false);
      showToast('API Keys rotated successfully. Update your clients.', 'success');
    }, 1500);
  };

  const handleSaveSchedule = async () => {
    if (!recipients.trim()) {
      showToast('Please enter at least one recipient email address', 'error');
      return;
    }
    setIsSaving(true);
    const nextRunDate = new Date();
    nextRunDate.setMonth(nextRunDate.getMonth() + 1);
    nextRunDate.setDate(1);
    nextRunDate.setHours(dispatchHour, 0, 0, 0);
    const next_run_at = nextRunDate.toISOString();

    const payloadSchedule = {
      id: 'sch_1',
      enabled: enabled ? 1 : 0,
      recipients: recipients.trim(),
      dispatch_hour: dispatchHour,
      report_scope: reportScope,
      next_run_at: enabled ? next_run_at : null
    };

    if (localStorage.getItem('nonaxen_static_mode') === 'true') {
      setTimeout(() => {
        localStorage.setItem('mock_db_audit_schedule', JSON.stringify(payloadSchedule));
        setSchedule(payloadSchedule);
        showToast('Monthly audit schedule updated successfully (Local Session)', 'success');
        setIsSaving(false);
      }, 500);
      return;
    }

    try {
      const res = await fetch('/api/audit-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadSchedule)
      });

      if (!res.ok) throw new Error('Failed to update schedule');
      const data = await res.json();
      setSchedule(data);
      showToast('Monthly audit schedule updated successfully', 'success');
    } catch (err) {
      console.error(err);
      showToast('Failed to save audit schedule', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSimulateRun = async () => {
    if (!schedule) return;
    if (!recipients.trim()) {
      showToast('Please specify a recipient email to dispatch simulated reports', 'error');
      return;
    }
    setIsSimulating(true);
    try {
      // 1. Fetch events
      let events: LicenseEvent[] = [];
      if (localStorage.getItem('nonaxen_static_mode') === 'true') {
        const mockEvents: LicenseEvent[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith('mock_db_events_')) {
            try {
              const val = JSON.parse(localStorage.getItem(key) || '[]');
              mockEvents.push(...val);
            } catch (err) {
              console.error(err);
            }
          }
        }
        events = mockEvents;
      } else {
        const resEvents = await fetch('/api/events');
        const eventsData = await resEvents.json();
        events = Array.isArray(eventsData) ? eventsData : [];
      }

      // 2. Compile PDF via client-side jsPDF
      const doc = new jsPDF();
      const margin = 15;
      let y = 20;

      // Title header
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(18);
      doc.setTextColor(15, 23, 42); // slate-900
      doc.text("MONTHLY AUTOMATED LICENSE AUDIT REPORT", margin, y);
      y += 8;

      // Subtitle
      doc.setFont("Helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(100, 116, 139); // slate-500
      doc.text(`Frequency: Monthly (1st of Month) | Dispatch Destination: ${recipients}`, margin, y);
      y += 6;
      doc.text(`Run Timestamp: ${new Date().toLocaleString()} (UTC)`, margin, y);
      y += 12;

      // Divider
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.5);
      doc.line(margin, y, 195, y);
      y += 10;

      // Active licenses stats
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(30, 41, 59);
      doc.text("1. SYSTEM HEALTH AND ACTIVE LICENSE SUMMARY", margin, y);
      y += 8;

      const activeLicenses = licenses.filter(l => l.status === 'active');
      const suspendedLicenses = licenses.filter(l => l.status === 'suspended');

      doc.setFont("Helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(51, 65, 85);
      doc.text(`Active / Total Licenses: ${activeLicenses.length} / ${licenses.length}`, margin + 5, y);
      y += 6;
      doc.text(`Configured Report Scope: ${reportScope.toUpperCase()}`, margin + 5, y);
      y += 12;

      // Table Header for Licenses
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(9);
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, y, 180, 8, "F");
      doc.setTextColor(71, 85, 105);
      doc.text("License Key / Client", margin + 2, y + 6);
      doc.text("Software", margin + 70, y + 6);
      doc.text("Tier", margin + 110, y + 6);
      doc.text("Expires At", margin + 135, y + 6);
      doc.text("Status", margin + 165, y + 6);
      y += 8;

      doc.setFont("Helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(51, 65, 85);

      licenses.slice(0, 15).forEach((l) => {
        if (y > 270) {
          doc.addPage();
          y = 20;
        }
        const keyText = l.license_key ? `${l.license_key.substring(0, 8)}... (${l.issued_to.substring(0, 12)})` : l.issued_to;
        const softwareText = l.software_name ? l.software_name.substring(0, 18) : 'N/A';
        const tierText = l.tier || 'N/A';
        const expiresText = l.expires_at ? new Date(l.expires_at).toLocaleDateString() : 'N/A';
        const statusText = (l.status || 'N/A').toUpperCase();

        doc.text(keyText, margin + 2, y + 6);
        doc.text(softwareText, margin + 70, y + 6);
        doc.text(tierText, margin + 110, y + 6);
        doc.text(expiresText, margin + 135, y + 6);
        doc.text(statusText, margin + 165, y + 6);

        doc.setDrawColor(241, 245, 249);
        doc.line(margin, y + 8, margin + 180, y + 8);
        y += 8;
      });

      y += 10;
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(30, 41, 59);
      doc.text("2. TELEMETRY LOGS & COMPLIANCE VERIFICATIONS", margin, y);
      y += 8;

      if (!events || events.length === 0) {
        doc.setFont("Helvetica", "normal");
        doc.setFontSize(10);
        doc.setTextColor(148, 163, 184);
        doc.text("No events logged this month.", margin + 5, y);
        y += 10;
      } else {
        doc.setFont("Helvetica", "bold");
        doc.setFontSize(9);
        doc.setFillColor(248, 250, 252);
        doc.rect(margin, y, 180, 8, "F");
        doc.setTextColor(71, 85, 105);
        doc.text("Timestamp", margin + 2, y + 6);
        doc.text("Type", margin + 50, y + 6);
        doc.text("Details Payload", margin + 90, y + 6);
        y += 8;

        doc.setFont("Helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(51, 65, 85);

        events.slice(0, 10).forEach((evt) => {
          if (y > 270) {
            doc.addPage();
            y = 20;
          }
          const timeStr = evt.timestamp ? new Date(evt.timestamp).toLocaleString() : 'N/A';
          const typeStr = evt.event_type || 'N/A';
          let payloadStr = evt.event_data || '';

          try {
            const parsed = JSON.parse(evt.event_data);
            payloadStr = Object.entries(parsed)
              .map(([k, v]) => `${k}: ${v}`)
              .join(", ");
          } catch (_) {}

          if (payloadStr.length > 60) {
            payloadStr = payloadStr.substring(0, 57) + "...";
          }

          doc.text(timeStr, margin + 2, y + 5);
          doc.text(typeStr, margin + 50, y + 5);
          doc.text(payloadStr, margin + 90, y + 5);

          doc.setDrawColor(241, 245, 249);
          doc.line(margin, y + 7, margin + 180, y + 7);
          y += 7;
        });
      }

      // Add page numbers
      const pageCount = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFont("Helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184);
        doc.text(`Page ${i} of ${pageCount} | CONFIDENTIAL compliance auto-audit for ${recipients}`, margin, 285);
      }

      // Download file to browser
      const pdfName = `monthly-license-audit-${new Date().toISOString().substring(0, 10)}.pdf`;
      doc.save(pdfName);

      // 3. Persist run metadata
      const lastRunStr = new Date().toISOString();
      const nextRunDate = new Date();
      nextRunDate.setMonth(nextRunDate.getMonth() + 1);
      nextRunDate.setDate(1);
      nextRunDate.setHours(dispatchHour, 0, 0, 0);
      const nextRunStr = nextRunDate.toISOString();

      const response = await fetch('/api/audit-schedule/run-simulation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          last_run_at: lastRunStr,
          next_run_at: nextRunStr
        })
      });

      if (!response.ok) throw new Error('Simulation endpoint failed');
      const resJson = await response.json();
      if (resJson.success) {
        setSchedule(resJson.schedule);
        setSimResult({
          pdfName,
          recipients: recipients.split(',').map(e => e.trim()),
          timestamp: lastRunStr,
          scope: reportScope,
        });
        showToast('Simulated dispatch completed & report downloaded', 'success');
      }
    } catch (err) {
      console.error(err);
      showToast('Simulation failed to execute', 'error');
    } finally {
      setIsSimulating(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      {/* Sub-tabs header */}
      <div className="flex border-b border-zinc-800/80 mb-6 font-mono text-xs select-none">
        <button
          onClick={() => setActiveTab('general')}
          className={`px-4 py-3 border-b-2 font-semibold transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'general'
              ? 'border-indigo-500 text-indigo-400 bg-indigo-500/5 font-bold'
              : 'border-transparent text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <Settings className="w-3.5 h-3.5" />
          GENERAL_CONFIG
        </button>
        <button
          onClick={() => setActiveTab('audit')}
          className={`px-4 py-3 border-b-2 font-semibold transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'audit'
              ? 'border-indigo-500 text-indigo-400 bg-indigo-500/5 font-bold'
              : 'border-transparent text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <Mail className="w-3.5 h-3.5" />
          AUDIT_&_SMTP
        </button>
        <button
          onClick={() => setActiveTab('notifications')}
          className={`px-4 py-3 border-b-2 font-semibold transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'notifications'
              ? 'border-indigo-500 text-indigo-400 bg-indigo-500/5 font-bold'
              : 'border-transparent text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <Bell className="w-3.5 h-3.5" />
          NOTIFICATIONS_ALERTS
        </button>
      </div>

      {activeTab === 'audit' && (
        <>
          {/* Schedule Auto-Audit Section */}
      <div className="bg-zinc-900/30 border border-zinc-800/80 rounded-xl p-6 backdrop-blur-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-zinc-100 font-medium flex items-center gap-2">
            <Calendar className="w-4.5 h-4.5 text-indigo-400"/> Schedule Auto-Audit
          </h3>
          <span className="text-[9px] bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded font-mono uppercase tracking-wider font-semibold">
            1st of Every Month
          </span>
        </div>
        
        <p className="text-xs text-zinc-400 mb-6 font-sans leading-relaxed">
          Configure the automated background compliance engine to compile historical licensing records, compute active nodes performance, and dispatch PDF audit reports securely.
        </p>

        {schedule === null ? (
          <div className="text-center py-8 text-zinc-600 font-mono text-xs flex items-center justify-center gap-2">
            <span className="w-4 h-4 border-2 border-zinc-700 border-t-zinc-400 rounded-full animate-spin"></span>
            Retrieving server cron configurations...
          </div>
        ) : (
          <div className="space-y-5">
            {/* Enabled toggle */}
            <div className="flex items-center justify-between p-3.5 bg-zinc-950/40 rounded-lg border border-zinc-800/60">
              <div>
                <span className="text-xs text-zinc-200 font-semibold block">Enable Monthly Automated Dispatches</span>
                <span className="text-[10px] text-zinc-500 font-mono mt-0.5 block">Calculates active risk indices and compiles raw DuckDB tables</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={enabled} 
                  onChange={(e) => setEnabled(e.target.checked)}
                  className="sr-only peer" 
                />
                <div className="w-9 h-5 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-zinc-400 after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-500 peer-checked:after:bg-zinc-950"></div>
              </label>
            </div>

            {/* Recipients */}
            <div>
              <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-1.5">Dispatch Recipient Emails</label>
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 w-4 h-4 text-zinc-600" />
                <input 
                  type="text" 
                  value={recipients}
                  onChange={(e) => setRecipients(e.target.value)}
                  placeholder="secops@quantfund.net, compliance@quantfund.net"
                  className="w-full bg-zinc-950/50 border border-zinc-800 rounded-lg pl-10 pr-3 py-2 text-zinc-200 font-mono text-xs outline-none focus:border-indigo-500 transition-colors" 
                />
              </div>
              <span className="text-[9px] text-zinc-600 font-sans mt-1.5 block">Use comma-separated format for multiple administrators</span>
            </div>

            {/* Row with Dispatch Hour and Report Scope */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-1.5">Scheduled Time of Day (UTC)</label>
                <select 
                  value={dispatchHour}
                  onChange={(e) => setDispatchHour(parseInt(e.target.value, 10))}
                  className="w-full bg-zinc-950/50 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 font-mono text-xs outline-none focus:border-indigo-500 transition-colors"
                >
                  {Array.from({ length: 24 }).map((_, i) => (
                    <option key={i} value={i}>
                      {i.toString().padStart(2, '0')}:00 UTC ({i === 12 ? '12 PM' : i > 12 ? `${i - 12} PM` : i === 0 ? '12 AM' : `${i} AM`})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-1.5">Compliance PDF Scope</label>
                <select 
                  value={reportScope}
                  onChange={(e) => setReportScope(e.target.value as any)}
                  className="w-full bg-zinc-950/50 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 font-mono text-xs outline-none focus:border-indigo-500 transition-colors"
                >
                  <option value="comprehensive">Comprehensive Audit (Licenses + Events)</option>
                  <option value="summary">Summary Report (Active Licenses Only)</option>
                  <option value="risk_only">Risk Telemetry Logs Only</option>
                </select>
              </div>
            </div>

            {/* Next Scheduled & Last Run Status Badge */}
            <div className="p-3.5 bg-zinc-950/30 rounded-lg border border-zinc-800/40 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <span className="text-[9px] font-mono text-zinc-500 uppercase block mb-1">Last Automated Execution</span>
                <span className="text-xs font-mono text-zinc-300 flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-zinc-500" />
                  {schedule.last_run_at ? new Date(schedule.last_run_at).toLocaleString() : 'No run logged'}
                </span>
              </div>
              <div>
                <span className="text-[9px] font-mono text-zinc-500 uppercase block mb-1">Next Scheduled Dispatch</span>
                <span className="text-xs font-mono text-zinc-300 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
                  {enabled ? (
                    schedule.next_run_at ? new Date(schedule.next_run_at).toLocaleString() : 'Calculated on save'
                  ) : (
                    <span className="text-zinc-600">Scheduler Suspended</span>
                  )}
                </span>
              </div>
            </div>

            {/* Save and Run simulation buttons */}
            <div className="flex items-center gap-3 pt-2">
              <button 
                onClick={handleSaveSchedule} 
                disabled={isSaving}
                className="bg-indigo-500 text-zinc-950 px-4 py-2 rounded-md text-xs font-bold hover:bg-indigo-400 transition-colors disabled:opacity-50"
              >
                {isSaving ? 'Saving...' : 'Save Audit Schedule'}
              </button>
              <button 
                onClick={handleSimulateRun} 
                disabled={isSimulating}
                className="bg-zinc-800 text-zinc-300 border border-zinc-700 px-4 py-2 rounded-md text-xs font-semibold hover:bg-zinc-700 transition-colors flex items-center gap-1.5 disabled:opacity-50"
              >
                {isSimulating ? (
                  <>
                    <span className="w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin"></span>
                    Generating...
                  </>
                ) : (
                  <>
                    <Send className="w-3 h-3 text-indigo-400" />
                    Simulate Dispatch Run
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Simulation Result Modal Overlay */}
      {simResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-sm">
          <div className="bg-zinc-900 rounded-xl shadow-2xl border border-zinc-850 w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-950/50">
              <h4 className="font-semibold text-zinc-100 text-sm flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-400" />
                Dispatch Successfully Dispatched
              </h4>
              <button 
                onClick={() => setSimResult(null)} 
                className="p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 rounded-md transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="p-5 space-y-4">
              <p className="text-xs text-zinc-400 leading-relaxed font-sans">
                The automated audit compiled correctly and triggered SMTP relays. Here is the simulated mail server log trace:
              </p>

              <div className="bg-zinc-950 p-4 rounded-lg border border-zinc-850 font-mono text-[10px] text-indigo-400 space-y-1.5 overflow-x-auto max-h-56">
                <p className="text-zinc-500">[{new Date(simResult.timestamp).toISOString()}] SMTP Gateway Initialized</p>
                <p className="text-zinc-500">[{new Date(simResult.timestamp).toISOString()}] HELO secure-mail.quantfund.net</p>
                <p className="text-zinc-300">MAIL FROM: &lt;noreply@quantfund.net&gt; [OK 250]</p>
                {simResult.recipients.map((email, idx) => (
                  <p key={idx} className="text-emerald-400">RCPT TO: &lt;{email}&gt; [OK 250]</p>
                ))}
                <p className="text-indigo-300 font-semibold">DATA [Initiated]</p>
                <p className="text-indigo-400">Subject: [SEC-OPS] Automated License Compliance Audit - Monthly Report</p>
                <p className="text-zinc-400">Attachment: {simResult.pdfName} (MIME Type: application/pdf)</p>
                <p className="text-zinc-400">Content-Scope: {simResult.scope.toUpperCase()}</p>
                <p className="text-indigo-300 font-semibold">. [OK Message Accepted for Delivery]</p>
                <p className="text-zinc-500">[{new Date(simResult.timestamp).toISOString()}] connection closed.</p>
              </div>

              <div className="bg-zinc-900/50 p-3 rounded-lg border border-zinc-800 text-center">
                <span className="text-[10px] text-zinc-500 block uppercase font-mono tracking-wider">ATTACHED REPORT DOWNLOADED</span>
                <span className="text-xs text-zinc-300 font-medium block mt-1 truncate">{simResult.pdfName}</span>
              </div>

              <button 
                onClick={() => setSimResult(null)}
                className="w-full bg-zinc-800 text-zinc-200 border border-zinc-700 py-2 rounded-md text-xs font-semibold hover:bg-zinc-700 transition-colors"
              >
                Close Output Log
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SMTP Configuration Card */}
      <div className="bg-zinc-900/30 border border-zinc-800/80 rounded-xl p-6 backdrop-blur-sm">
        <h3 className="text-zinc-100 font-medium mb-4 flex items-center gap-2">
          <Mail className="w-4 h-4 text-indigo-400"/> SMTP Relay Configuration
        </h3>
        <p className="text-xs text-zinc-400 mb-6 leading-relaxed">
          Configure the SMTP server details for automated report dispatches and critical license alerts. All credentials are encrypted and stored in the secure local vault.
        </p>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-1">SMTP Host</label>
              <input 
                type="text" 
                value={smtp.host} 
                onChange={e => setSmtp({...smtp, host: e.target.value})}
                placeholder="smtp.example.com"
                className="w-full bg-zinc-950/50 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 font-mono text-xs outline-none focus:border-indigo-500 transition-colors" 
              />
            </div>
            <div>
              <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-1">SMTP Port</label>
              <input 
                type="number" 
                value={smtp.port} 
                onChange={e => setSmtp({...smtp, port: parseInt(e.target.value) || 587})}
                placeholder="587"
                className="w-full bg-zinc-950/50 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 font-mono text-xs outline-none focus:border-indigo-500 transition-colors" 
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-1">SMTP User</label>
              <input 
                type="text" 
                value={smtp.user} 
                onChange={e => setSmtp({...smtp, user: e.target.value})}
                placeholder="user@example.com"
                className="w-full bg-zinc-950/50 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 font-mono text-xs outline-none focus:border-indigo-500 transition-colors" 
              />
            </div>
            <div>
              <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-1">SMTP Password</label>
              <input 
                type="password" 
                value={smtp.pass} 
                onChange={e => setSmtp({...smtp, pass: e.target.value})}
                placeholder="••••••••"
                className="w-full bg-zinc-950/50 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 font-mono text-xs outline-none focus:border-indigo-500 transition-colors" 
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-1">From Email Address</label>
              <input 
                type="text" 
                value={smtp.from_email} 
                onChange={e => setSmtp({...smtp, from_email: e.target.value})}
                placeholder="noreply@quantfund.net"
                className="w-full bg-zinc-950/50 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 font-mono text-xs outline-none focus:border-indigo-500 transition-colors" 
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-3 cursor-pointer p-2 h-[38px]">
                <input 
                  type="checkbox" 
                  checked={smtp.secure} 
                  onChange={e => setSmtp({...smtp, secure: e.target.checked})}
                  className="rounded border-zinc-700 bg-zinc-900 text-indigo-500 focus:ring-indigo-500/20 w-4 h-4" 
                />
                <span className="text-xs text-zinc-400 font-mono uppercase tracking-wider">Use SSL/TLS (Port 465)</span>
              </label>
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button 
              onClick={handleSaveSmtp} 
              disabled={isSavingSmtp}
              className="bg-indigo-500 text-zinc-950 px-4 py-2 rounded-md text-xs font-bold hover:bg-indigo-400 transition-colors disabled:opacity-50"
            >
              {isSavingSmtp ? 'Saving...' : 'Save SMTP Settings'}
            </button>
            <button 
              onClick={handleTestSmtp} 
              disabled={isTestingSmtp}
              className="bg-zinc-800 text-zinc-300 border border-zinc-700 px-4 py-2 rounded-md text-xs font-semibold hover:bg-zinc-700 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {isTestingSmtp ? (
                <span className="w-3 h-3 border-2 border-zinc-500 border-t-white rounded-full animate-spin"></span>
              ) : (
                <Send className="w-3 h-3" />
              )}
              Test Connection
            </button>
          </div>
        </div>
      </div>

      {/* Performance & Telemetry Alerts Card */}
      <div className="bg-zinc-900/30 border border-zinc-800/80 rounded-xl p-6 backdrop-blur-sm">
        <h3 className="text-zinc-100 font-medium mb-4 flex items-center gap-2">
          <Activity className="w-4 h-4 text-indigo-400"/> Performance & Alerts Settings
        </h3>
        <p className="text-xs text-zinc-400 mb-6 leading-relaxed font-sans">
          Configure node latency limits. The system monitors the round-trip-time (RTT) of active socket connections, highlighting any nodes exceeding this threshold as degraded and appending a diagnostic audit trail.
        </p>
        <div className="space-y-4">
          <div>
            <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-1">
              Latency Warning Threshold (RTT)
            </label>
            <div className="flex gap-3 items-center">
              <input 
                type="number" 
                value={latencyThreshold} 
                onChange={e => setLatencyThreshold(Math.max(10, parseInt(e.target.value) || 150))}
                className="w-full max-w-[200px] bg-zinc-950/50 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 font-mono text-xs outline-none focus:border-indigo-500 transition-colors" 
              />
              <span className="text-xs text-zinc-500 font-mono">ms</span>
            </div>
            <span className="text-[10px] text-zinc-500 font-mono mt-1.5 block">
              Connected pipes exceeding this round-trip limit are instantly flagged as DEGRADED in the validation panel.
            </span>
          </div>
          <button 
            onClick={handleSaveLatencyThreshold} 
            disabled={isSavingLatency}
            className="bg-indigo-500 text-zinc-950 px-4 py-2 rounded-md text-xs font-bold hover:bg-indigo-400 transition-colors disabled:opacity-50"
          >
            {isSavingLatency ? 'Saving...' : 'Update Latency Threshold'}
          </button>

          <div className="pt-4 border-t border-zinc-800/50 mt-4">
            <div className="flex items-center justify-between">
              <div>
                <label className="block text-sm font-medium text-zinc-200 mb-1">
                  Risk-Based Auto-Pause
                </label>
                <span className="text-[10px] text-zinc-500 font-mono block max-w-xl">
                  Automatically triggers an instant license suspension if the calculated DuckDB Risk Score exceeds 90.
                </span>
              </div>
              <button
                onClick={handleToggleAutoPause}
                disabled={isSavingAutoPause}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${autoPauseEnabled ? 'bg-indigo-500' : 'bg-zinc-700'} ${isSavingAutoPause ? 'opacity-50' : ''}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${autoPauseEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )}

  {activeTab === 'general' && (
    <>
      {/* General Settings Card */}
      <div className="bg-zinc-900/30 border border-zinc-800/80 rounded-xl p-6 backdrop-blur-sm">
        <h3 className="text-zinc-100 font-medium mb-4 flex items-center gap-2"><Settings className="w-4 h-4 text-indigo-400"/> General Settings</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-1">Application Identifier</label>
            <input 
              type="text" 
              value={general.appName} 
              onChange={e => setGeneral({...general, appName: e.target.value})}
              className="w-full bg-zinc-950/50 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 font-mono text-xs outline-none focus:border-indigo-500 transition-colors" 
            />
          </div>
          <div>
            <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-1">System Admin Email</label>
            <input 
              type="text" 
              value={general.systemEmail} 
              onChange={e => setGeneral({...general, systemEmail: e.target.value})}
              className="w-full bg-zinc-950/50 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 font-mono text-xs outline-none focus:border-indigo-500 transition-colors" 
            />
          </div>
          <button onClick={() => showToast('General settings saved', 'success')} className="bg-zinc-800 text-zinc-300 border border-zinc-700 px-4 py-2 rounded-md text-xs font-semibold hover:bg-zinc-700 transition-colors">
            Update General Config
          </button>
        </div>
      </div>

      {/* MT5 Integration Guide Card */}
      <div className="bg-zinc-900/30 border border-zinc-800/80 rounded-xl p-6 backdrop-blur-sm overflow-hidden">
        <h3 className="text-zinc-100 font-medium mb-4 flex items-center gap-2">
          <Code2 className="w-4 h-4 text-indigo-400"/> MT5 Integration Guide
        </h3>
        <p className="text-xs text-zinc-400 mb-4">
          Copy this MQL5 snippet into your Expert Advisor's <code>OnInit()</code> function to enable hardware-locked licensing.
        </p>
        <div className="relative group">
          <pre className="bg-zinc-950/80 border border-zinc-800 rounded-lg p-4 text-[10px] font-mono text-zinc-300 overflow-x-auto max-h-[300px] scrollbar-thin">
            {mt5Snippet}
          </pre>
          <button 
            onClick={() => copyToClipboard(mt5Snippet)}
            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 bg-indigo-500 text-zinc-950 px-2 py-1 rounded text-[10px] font-bold transition-opacity"
          >
            Copy Script
          </button>
        </div>
        <div className="mt-4 flex items-start gap-3 bg-indigo-500/5 border border-indigo-500/10 p-3 rounded-lg">
          <Info className="w-4 h-4 text-indigo-400 mt-0.5 flex-shrink-0" />
          <div className="text-[10px] text-zinc-500 leading-relaxed">
            <strong className="text-zinc-300 block mb-1">Hardware Fingerprinting Note:</strong>
            The snippet above combines <code>TERMINAL_COMMONDATA_PATH</code> with the <code>ACCOUNT_LOGIN</code> to create a unique device-account fingerprint. 
            <br/><br/>
            <strong className="text-emerald-500 block mb-1">Air-Gapped Note:</strong>
            For air-gapped environments, use the <code>Offline Token</code> generator. Your bot should decode the token and verify the signature, including any <code>Asset Class</code> or <code>Account ID</code> restrictions embedded in your client logic.
          </div>
        </div>
      </div>

      {/* Enterprise Offline Licensing Card */}
      <div className="bg-zinc-900/30 border border-zinc-800/80 rounded-xl p-6 backdrop-blur-sm">
        <h3 className="text-zinc-100 font-medium mb-4 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400"/> Air-Gapped Enterprise Licensing
        </h3>
        <p className="text-xs text-zinc-400 mb-6 leading-relaxed">
          For clients in high-security environments where external network access is prohibited. These cryptographic tokens verify locally using the system's RSA public key.
        </p>
        
        <div className="space-y-6">
          {offlineToken && (
            <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-4 animate-in fade-in slide-in-from-top-2 duration-300">
              <label className="block text-[10px] font-mono text-emerald-500 uppercase mb-2 font-bold">Generated Signed Offline Token</label>
              <div className="relative">
                <textarea 
                  readOnly 
                  value={offlineToken.token} 
                  className="w-full bg-zinc-950/50 border border-zinc-800 rounded-lg px-3 py-2 text-emerald-400 font-mono text-[10px] h-24 outline-none resize-none"
                />
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(offlineToken.token);
                    showToast('Token copied to clipboard', 'success');
                  }}
                  className="absolute top-2 right-2 bg-emerald-500 text-zinc-950 px-2 py-1 rounded text-[10px] font-bold hover:bg-emerald-400 transition-colors"
                >
                  Copy
                </button>
              </div>
              <p className="text-[10px] text-zinc-500 mt-2 italic">
                Provide this token to the client. Their local instance will decode it and verify the hardware lock without internet access.
              </p>
            </div>
          )}

          <div>
            <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-2">System RSA Public Key (Standard SPKI PEM)</label>
            <div className="relative group">
              <pre className="bg-zinc-950/50 border border-zinc-800 rounded-lg p-4 text-[10px] font-mono text-zinc-400 overflow-x-auto max-h-[150px] scrollbar-thin">
                {systemPublicKey}
              </pre>
              <button 
                onClick={() => {
                  navigator.clipboard.writeText(systemPublicKey);
                  showToast('Public key copied', 'success');
                }}
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 bg-zinc-700 text-zinc-200 px-2 py-1 rounded text-[10px] font-bold hover:bg-zinc-600 transition-opacity"
              >
                Copy
              </button>
            </div>
            <p className="text-[10px] text-zinc-500 mt-2">
              This public key must be hardcoded into your client-side application (MT5, C++, Node.js) to verify the authenticity of offline tokens.
            </p>
          </div>
        </div>
      </div>

      {/* API Authentication Card */}
      <div className="bg-zinc-900/30 border border-zinc-800/80 rounded-xl p-6 backdrop-blur-sm">
        <h3 className="text-zinc-100 font-medium mb-4 flex items-center gap-2"><Key className="w-4 h-4 text-indigo-400"/> API Authentication</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-1">Master API Key</label>
            <input type="password" value="sk_live_1234567890abcdef" readOnly className="w-full bg-zinc-950/50 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-400 font-mono text-xs outline-none" />
          </div>
          <div>
            <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-1">Webhook Endpoint</label>
            <input type="text" defaultValue="https://api.quantfund.net/v1/license-events" className="w-full bg-zinc-950/50 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 font-mono text-xs outline-none focus:border-indigo-500 transition-colors" />
          </div>
          <button onClick={handleRotate} disabled={isRotating} className="bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-4 py-2 rounded-md text-xs font-semibold hover:bg-indigo-500/20 transition-colors disabled:opacity-50">
            {isRotating ? 'Rotating...' : 'Rotate Keys'}
          </button>
        </div>
      </div>

    </>
  )}

  {activeTab === 'audit' && (
    <div className="bg-zinc-900/30 border border-zinc-800/80 rounded-xl p-6 backdrop-blur-sm">
      <h3 className="text-zinc-100 font-medium mb-4 flex items-center gap-2"><ShieldAlert className="w-4 h-4 text-indigo-400"/> Security & Alerts</h3>
      <div className="space-y-4">
        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" defaultChecked className="rounded border-zinc-700 bg-zinc-900 text-indigo-500 focus:ring-indigo-500/20 w-4 h-4" />
          <span className="text-sm text-zinc-300">Auto-suspend on hardware mismatch</span>
        </label>
        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" defaultChecked className="rounded border-zinc-700 bg-zinc-900 text-indigo-500 focus:ring-indigo-500/20 w-4 h-4" />
          <span className="text-sm text-zinc-300">Alert on multiple failed pings</span>
        </label>
        <div className="mt-4">
          <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-2">Expiration Alert Thresholds (Days)</label>
          <div className="flex gap-2">
            {[7, 14, 30].map(days => (
              <label key={days} className="flex items-center gap-2 bg-zinc-950 px-3 py-2 rounded-lg border border-zinc-800 cursor-pointer">
                <input type="checkbox" className="rounded border-zinc-700 bg-zinc-900 text-indigo-500 focus:ring-indigo-500/20 w-4 h-4" />
                <span className="text-xs text-zinc-300">{days} Days</span>
              </label>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-1 mt-4">Security Contact Email</label>
          <input type="email" defaultValue="secops@quantfund.net" className="w-full bg-zinc-950/50 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 text-xs outline-none focus:border-indigo-500 transition-colors" />
        </div>
        <button onClick={() => showToast('Security preferences updated', 'success')} className="bg-zinc-800 text-zinc-200 border border-zinc-700 px-4 py-2 rounded-md text-xs font-semibold hover:bg-zinc-700 transition-colors mt-2">Save Preferences</button>
      </div>
    </div>
  )}

  {activeTab === 'notifications' && (
    <div className="space-y-6">
      <div className="bg-zinc-900/30 border border-zinc-800/80 rounded-xl p-6 backdrop-blur-sm">
        <h3 className="text-zinc-100 font-medium mb-4 flex items-center gap-2">
          <Bell className="w-4.5 h-4.5 text-indigo-400"/> Custom Email Trigger Thresholds
        </h3>
        <p className="text-xs text-zinc-400 mb-6 leading-relaxed">
          Configure precise alarm parameters to dispatch critical email warnings via the SMTP relay. The license monitoring engine evaluates these triggers on every hardware ping and compliance check.
        </p>

        <div className="space-y-6">
          {/* Risk Score Trigger */}
          <div className="p-4 bg-zinc-950/40 rounded-lg border border-zinc-800/60 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs text-zinc-200 font-semibold block">Risk Index Violation Alerts</span>
                <span className="text-[10px] text-zinc-500 font-mono mt-0.5 block">Triggered when any license or client node risk score exceeds limits</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={riskEnabled} 
                  onChange={(e) => setRiskEnabled(e.target.checked)}
                  className="sr-only peer" 
                />
                <div className="w-9 h-5 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-zinc-400 after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-500 peer-checked:after:bg-zinc-950"></div>
              </label>
            </div>

            {riskEnabled && (
              <div className="pt-2 border-t border-zinc-900/60 flex items-center gap-4">
                <div className="w-full max-w-[240px]">
                  <label className="block text-[9px] font-mono text-zinc-500 uppercase mb-1">Trigger Threshold (%)</label>
                  <div className="flex items-center gap-2">
                    <input 
                      type="range"
                      min="10"
                      max="95"
                      step="5"
                      value={riskThreshold}
                      onChange={(e) => setRiskThreshold(Number(e.target.value))}
                      className="w-full accent-indigo-500 bg-zinc-800 h-1 rounded-lg appearance-none cursor-pointer"
                    />
                    <span className="text-xs font-mono text-indigo-400 font-bold min-w-[32px] text-right">{riskThreshold}%</span>
                  </div>
                </div>
                <div className="text-[10px] text-zinc-500 font-mono leading-normal pl-4 border-l border-zinc-800">
                  Alerts generated when calculated risk score is &gt; {riskThreshold}%. Default standard threshold is 80%.
                </div>
              </div>
            )}
          </div>

          {/* Expiration Trigger */}
          <div className="p-4 bg-zinc-950/40 rounded-lg border border-zinc-800/60 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs text-zinc-200 font-semibold block">Approaching Expiration Warnings</span>
                <span className="text-[10px] text-zinc-500 font-mono mt-0.5 block">Triggered when any active license is close to expiring</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={expEnabled} 
                  onChange={(e) => setExpEnabled(e.target.checked)}
                  className="sr-only peer" 
                />
                <div className="w-9 h-5 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-zinc-400 after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-500 peer-checked:after:bg-zinc-950"></div>
              </label>
            </div>

            {expEnabled && (
              <div className="pt-2 border-t border-zinc-900/60 flex items-center gap-4">
                <div className="w-full max-w-[240px]">
                  <label className="block text-[9px] font-mono text-zinc-500 uppercase mb-1">Trigger Limit (Days Remaining)</label>
                  <div className="flex items-center gap-2">
                    <input 
                      type="number"
                      min="1"
                      max="90"
                      value={expThreshold}
                      onChange={(e) => setExpThreshold(Math.max(1, Number(e.target.value) || 7))}
                      className="w-full bg-zinc-950/50 border border-zinc-800 rounded-lg px-3 py-1.5 text-zinc-200 font-mono text-xs outline-none focus:border-indigo-500 transition-colors"
                    />
                    <span className="text-xs text-zinc-500 font-mono">Days</span>
                  </div>
                </div>
                <div className="text-[10px] text-zinc-500 font-mono leading-normal pl-4 border-l border-zinc-800">
                  Alerts generated when any license reaches &lt; {expThreshold} days from expiration. Standard recommendation is 7 days.
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-3 justify-end mt-8 pt-4 border-t border-zinc-800/60">
          <button
            type="button"
            onClick={handleSimulateNotificationAlert}
            disabled={isSimulatingNotificationAlert}
            className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 px-4 py-2 rounded-md text-xs font-semibold transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {isSimulatingNotificationAlert ? (
              <>
                <span className="w-3 h-3 border-2 border-zinc-500 border-t-zinc-200 rounded-full animate-spin"></span>
                Evaluating...
              </>
            ) : (
              <>
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                Simulate Threshold Check
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleSaveNotifications}
            disabled={isSavingNotifications}
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-md text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            {isSavingNotifications ? (
              <>
                <span className="w-3 h-3 border-2 border-indigo-400 border-t-white rounded-full animate-spin"></span>
                Saving...
              </>
            ) : (
              <>
                <Check className="w-3.5 h-3.5" />
                Save Thresholds
              </>
            )}
          </button>
        </div>
      </div>

      {/* Simulated Email Modal overlay if available */}
      {simulatedAlertData && (
        <div className="bg-zinc-900 border border-amber-500/30 rounded-xl p-6 relative overflow-hidden shadow-2xl">
          <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-amber-500 to-indigo-500"></div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="p-1 bg-amber-500/10 text-amber-400 rounded">
                <Mail className="w-4 h-4" />
              </span>
              <div>
                <h4 className="text-zinc-100 text-xs font-bold font-mono">SIMULATED_DISPATCHED_SMTP_PAYLOAD</h4>
                <p className="text-[10px] text-zinc-500 font-mono">This email was formatted and simulated based on active triggers.</p>
              </div>
            </div>
            <button
              onClick={() => setSimulatedAlertData(null)}
              className="text-zinc-500 hover:text-zinc-300 font-mono text-[10px] uppercase border border-zinc-800 hover:border-zinc-700 px-2.5 py-1 rounded cursor-pointer"
            >
              Clear Output
            </button>
          </div>

          <div className="bg-zinc-950/80 rounded-lg p-4 font-mono text-xs border border-zinc-800/80 text-zinc-300 space-y-3.5 leading-relaxed">
            <div>
              <span className="text-zinc-500 uppercase text-[10px] block">To:</span>
              <span className="text-indigo-400 font-semibold">{simulatedAlertData.recipients}</span>
            </div>
            <div>
              <span className="text-zinc-500 uppercase text-[10px] block">Subject:</span>
              <span className="text-amber-400 font-semibold">{simulatedAlertData.subject}</span>
            </div>
            <div className="pt-3 border-t border-zinc-900">
              <span className="text-zinc-500 uppercase text-[10px] block mb-2">Message Body:</span>
              <pre className="text-zinc-300 font-mono text-[10px] overflow-x-auto bg-zinc-950 p-3 rounded border border-zinc-900/60 max-h-[300px] whitespace-pre-wrap leading-relaxed">
                {simulatedAlertData.body}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* Personal Alert Subscriptions */}
      <div className="bg-zinc-900/30 border border-zinc-800/80 rounded-xl p-6 backdrop-blur-sm">
        <h3 className="text-zinc-100 font-medium mb-4 flex items-center gap-2">
          <Mail className="w-4.5 h-4.5 text-indigo-400"/> My Alert Subscriptions
        </h3>
        <p className="text-xs text-zinc-400 mb-6 leading-relaxed">
          As an administrator, you must subscribe to these events to receive the dispatched emails. These preferences are unique to your account.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="flex items-center justify-between p-3 bg-zinc-950/40 rounded-lg border border-zinc-800/60 cursor-pointer hover:border-indigo-500/30 transition-colors">
            <div>
              <span className="text-xs text-zinc-200 font-semibold block">Risk Violations</span>
              <span className="text-[10px] text-zinc-500 font-mono">Subscribe to real-time risk alerts</span>
            </div>
            <input 
              type="checkbox" 
              checked={notificationPrefs.risk_alerts}
              onChange={(e) => setNotificationPrefs({...notificationPrefs, risk_alerts: e.target.checked})}
              className="rounded border-zinc-700 bg-zinc-900 text-indigo-500 focus:ring-indigo-500/20 w-4 h-4" 
            />
          </label>

          <label className="flex items-center justify-between p-3 bg-zinc-950/40 rounded-lg border border-zinc-800/60 cursor-pointer hover:border-indigo-500/30 transition-colors">
            <div>
              <span className="text-xs text-zinc-200 font-semibold block">Expiration Warnings</span>
              <span className="text-[10px] text-zinc-500 font-mono">Subscribe to upcoming expirations</span>
            </div>
            <input 
              type="checkbox" 
              checked={notificationPrefs.expiration_alerts}
              onChange={(e) => setNotificationPrefs({...notificationPrefs, expiration_alerts: e.target.checked})}
              className="rounded border-zinc-700 bg-zinc-900 text-indigo-500 focus:ring-indigo-500/20 w-4 h-4" 
            />
          </label>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={handleSavePrefs}
            disabled={isSavingPrefs}
            className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 px-4 py-2 rounded-md text-xs font-semibold transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {isSavingPrefs ? 'Saving...' : 'Update My Subscriptions'}
          </button>
        </div>
      </div>
    </div>
  )}
</div>
  );
}

function ExtendLicenseModal({ isOpen, onClose, onExtend }: { isOpen: boolean, onClose: () => void, onExtend: (days: number) => void }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-sm overflow-hidden shadow-2xl">
        <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-950/50">
          <h3 className="text-zinc-100 font-medium">Extend License</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 grid grid-cols-3 gap-3">
          {[30, 60, 90].map(days => (
            <button key={days} onClick={() => onExtend(days)} className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 py-3 rounded-lg text-sm font-semibold transition-colors">
              +{days} Days
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function RenewLicenseModal({ isOpen, onClose, onRenew }: { isOpen: boolean, onClose: () => void, onRenew: () => void }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-sm overflow-hidden shadow-2xl">
        <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-950/50">
          <h3 className="text-zinc-100 font-medium">Renew License</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6">
          <p className="text-zinc-400 text-sm mb-6">Are you sure you want to renew this license? The new expiry date will be calculated based on the billing cycle.</p>
          <button onClick={onRenew} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-3 rounded-lg text-sm font-semibold transition-colors">
            Confirm Renewal
          </button>
        </div>
      </div>
    </div>
  );
}

function TransferLicenseModal({ isOpen, onClose, onTransfer }: { isOpen: boolean, onClose: () => void, onTransfer: (fund: string) => void }) {
  const [newFund, setNewFund] = useState('');
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-sm overflow-hidden shadow-2xl">
        <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-950/50">
          <h3 className="text-zinc-100 font-medium">Transfer Licenses</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <input 
            type="text" 
            value={newFund}
            onChange={e => setNewFund(e.target.value)}
            placeholder="Enter new fund/client name"
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 text-sm focus:outline-none focus:border-indigo-500 transition-colors placeholder:text-zinc-700" 
          />
          <button 
            onClick={() => { if (newFund) onTransfer(newFund); }} 
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Confirm Transfer
          </button>
        </div>
      </div>
    </div>
  );
}

function SoftwareProductsView({ 
  products, 
  addProduct, 
  deleteProduct, 
  editProduct,
  licenses, 
  currentUser,
  showToast 
}: { 
  products: SoftwareProduct[], 
  addProduct: (p: Omit<SoftwareProduct, 'id'>) => void, 
  deleteProduct: (id: string) => void, 
  editProduct: (id: string, updates: Partial<SoftwareProduct>) => void,
  licenses: License[], 
  currentUser: AppUser | null,
  showToast: (msg: string, type: 'success'|'error') => void 
}) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<SoftwareProduct | null>(null);
  const [formData, setFormData] = useState({ 
    name: '', description: '', base_price: 5000, version: '1.0.0', status: 'active' as 'active' | 'deprecated' | 'beta', release_date: new Date().toISOString().split('T')[0], maintenance_window: '02:00 UTC', support_level: 'basic' as 'basic' | 'premium' | 'enterprise'
  });

  const handleSubmit = () => {
    if (!formData.name) return;

    const payload = { ...formData };
    if (editingProduct) {
      editProduct(editingProduct.id, payload);
    } else {
      addProduct(payload);
    }
    setEditingProduct(null);

    setFormData({ 
        name: '', description: '', base_price: 5000, version: '1.0.0', status: 'active', release_date: new Date().toISOString().split('T')[0], maintenance_window: '02:00 UTC', support_level: 'basic'
    });
    setIsModalOpen(false);
    showToast('Software product successfully saved', 'success');
  };

  const getProductLicenseCount = (name: string) => {
    return licenses.filter(l => l.software_name === name).length;
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center bg-zinc-900/40 p-4 rounded-xl border border-zinc-800/60">
        <div>
          <h3 className="text-zinc-100 font-semibold flex items-center gap-2">
            <Cpu className="w-4 h-4 text-indigo-400" /> Software Products Catalog
          </h3>
          <p className="text-xs text-zinc-500 font-mono mt-1">Manage trading systems and standard monthly base rates</p>
        </div>
        {currentUser?.role === 'Administrator' && (
          <button 
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 bg-indigo-500 hover:bg-indigo-400 text-zinc-950 px-4 py-1.5 rounded-md text-xs font-bold transition-all shadow-lg"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Product
          </button>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-sm overflow-hidden shadow-2xl p-6 space-y-4">
            <h3 className="text-zinc-100 font-medium text-sm border-b border-zinc-800 pb-2">Add Software Product</h3>
            <div>
              <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-1.5">Product Name</label>
              <input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="e.g. HFT Terminal Alpha" className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 text-sm focus:outline-none focus:border-indigo-500 transition-colors font-mono" />
            </div>
            <div>
              <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-1.5">Description</label>
              <textarea value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} placeholder="Describe key characteristics and target loops..." className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 text-sm focus:outline-none focus:border-indigo-500 h-20 placeholder:text-zinc-700" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-1.5">Base Price (USD/mo)</label>
                <input type="number" value={formData.base_price} onChange={e => setFormData({...formData, base_price: Number(e.target.value)})} placeholder="12500" className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 text-sm focus:outline-none focus:border-indigo-500 font-mono" />
              </div>
              <div>
                <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-1.5">Version</label>
                <input type="text" value={formData.version} onChange={e => setFormData({...formData, version: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 text-sm focus:outline-none focus:border-indigo-500 font-mono" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-1.5">Status</label>
                <select value={formData.status} onChange={e => setFormData({...formData, status: e.target.value as any})} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 text-sm focus:outline-none focus:border-indigo-500 font-mono">
                    <option value="active">Active</option>
                    <option value="deprecated">Deprecated</option>
                    <option value="beta">Beta</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-1.5">Release Date</label>
                <input type="date" value={formData.release_date} onChange={e => setFormData({...formData, release_date: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 text-sm focus:outline-none focus:border-indigo-500 font-mono" />
              </div>
              <div>
                <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-1.5">Support</label>
                <select value={formData.support_level} onChange={e => setFormData({...formData, support_level: e.target.value as any})} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 text-sm focus:outline-none focus:border-indigo-500 font-mono">
                    <option value="basic">Basic</option>
                    <option value="premium">Premium</option>
                    <option value="enterprise">Enterprise</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-1.5">Maintenance Window</label>
              <input type="text" value={formData.maintenance_window} onChange={e => setFormData({...formData, maintenance_window: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 text-sm focus:outline-none focus:border-indigo-500 font-mono" />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setIsModalOpen(false)} className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors font-semibold">Cancel</button>
              <button onClick={handleSubmit} className="bg-indigo-500 hover:bg-indigo-400 text-zinc-950 px-4 py-1.5 rounded-md text-xs font-bold transition-all shadow-lg">Save Product</button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-zinc-900/30 border border-zinc-800/80 rounded-xl overflow-hidden backdrop-blur-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-zinc-900/80 border-b border-zinc-800/80 text-zinc-400 font-mono text-[10px] uppercase tracking-wider">
              <tr>
                <th className="px-6 py-4">Product Name</th>
                <th className="px-6 py-4">Version</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Base License Cost</th>
                <th className="px-6 py-4">Release Date</th>
                <th className="px-6 py-4">Support</th>
                <th className="px-6 py-4">Active Deployments</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50 font-mono text-xs">
              {products.map(prod => {
                const count = getProductLicenseCount(prod.name);
                return (
                  <tr key={prod.id} className="hover:bg-zinc-800/30 group">
                    <td className="px-6 py-4 text-zinc-200 font-semibold font-sans text-sm flex items-center gap-2">
                      <Cpu className="w-4 h-4 text-indigo-400 group-hover:scale-110 transition-transform" />
                      {prod.name}
                    </td>
                    <td className="px-6 py-4 text-zinc-400 font-mono text-xs">{prod.version}</td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase",
                        prod.status === 'active' ? "bg-emerald-500/10 text-emerald-400" :
                        prod.status === 'beta' ? "bg-amber-500/10 text-amber-400" :
                        "bg-zinc-700/50 text-zinc-300"
                      )}>
                        {prod.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-emerald-400 font-mono text-xs">${prod.base_price.toLocaleString()}/mo</td>
                    <td className="px-6 py-4 text-zinc-400 font-mono text-xs">{prod.release_date}</td>
                    <td className="px-6 py-4 text-zinc-400 font-mono text-xs uppercase">{prod.support_level}</td>
                    <td className="px-6 py-4 text-zinc-400 font-mono text-xs">{count} active</td>
                    <td className="px-6 py-4 text-right">

                      <button 
                        onClick={() => {
                          setEditingProduct(prod);
                          setFormData({
                            name: prod.name,
                            description: prod.description || '',
                            base_price: prod.base_price,
                            version: prod.version,
                            status: prod.status,
                            release_date: prod.release_date,
                            maintenance_window: prod.maintenance_window,
                            support_level: prod.support_level
                          });
                          setIsModalOpen(true);
                        }}
                        className="text-zinc-500 hover:text-indigo-400 text-xs font-medium transition-colors mr-3"
                      >
                        Edit
                      </button>
                      <button 
                        onClick={() => deleteProduct(prod.id)} 
                        className="text-zinc-500 hover:text-rose-400 text-xs font-medium transition-colors"
                        title="Delete product catalog entry"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
              {products.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-zinc-500 font-mono text-xs">
                    NO SOFTWARE PRODUCTS CONFIGURED
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function LicenseTiersView({ 
  tiers, 
  addTier, 
  deleteTier, 
  editTier,
  licenses, 
  currentUser,
  showToast 
}: { 
  tiers: LicenseTier[], 
  addTier: (t: Omit<LicenseTier, 'id'>) => void, 
  deleteTier: (id: string) => void, 
  editTier: (id: string, updates: Partial<LicenseTier>) => void,
  licenses: License[], 
  currentUser: AppUser | null,
  showToast: (msg: string, type: 'success'|'error') => void 
}) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTier, setEditingTier] = useState<LicenseTier | null>(null);
  const [formData, setFormData] = useState({ 
    name: '', max_volume_usd: 10000000, api_calls_limit: 10000, api_calls_limit_monthly: 300000, api_calls_limit_yearly: 3600000, 
    description: '', features: '[]', sla_guarantee: 'none', support_type: 'email', custom_fields: '{}' 
  });

  const handleSubmit = () => {
    if (!formData.name) return;

    const payload = { ...formData };
    if (editingTier) {
      editTier(editingTier.id, payload);
    } else {
      addTier(payload);
    }
    setEditingTier(null);

    setFormData({ 
      name: '', max_volume_usd: 10000000, api_calls_limit: 10000, api_calls_limit_monthly: 300000, api_calls_limit_yearly: 3600000, 
      description: '', features: '[]', sla_guarantee: 'none', support_type: 'email', custom_fields: '{}' 
    });
    setIsModalOpen(false);
    showToast('License tier successfully saved', 'success');
  };

  const getTierLicenseCount = (name: string) => {
    return licenses.filter(l => l.tier === name).length;
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center bg-zinc-900/40 p-4 rounded-xl border border-zinc-800/60">
        <div>
          <h3 className="text-zinc-100 font-semibold flex items-center gap-2">
            <Layers className="w-4 h-4 text-indigo-400" /> Licensing Tiers Settings
          </h3>
          <p className="text-xs text-zinc-500 font-mono mt-1">Configure limits, max volumes, and call quotas per tier level</p>
        </div>
        {currentUser?.role === 'Administrator' && (
          <button 
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 bg-indigo-500 hover:bg-indigo-400 text-zinc-950 px-4 py-1.5 rounded-md text-xs font-bold transition-all shadow-lg"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Tier
          </button>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-sm overflow-hidden shadow-2xl p-6 space-y-4">
            <h3 className="text-zinc-100 font-medium text-sm border-b border-zinc-800 pb-2">Add License Tier</h3>
            <div>
              <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-1.5">Tier Name</label>
              <input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="e.g. Starter, Premium, VIP" className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 text-sm focus:outline-none focus:border-indigo-500 font-mono" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-1.5">Max Volume (USD/mo)</label>
                <input type="number" value={formData.max_volume_usd} onChange={e => setFormData({...formData, max_volume_usd: Number(e.target.value)})} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 text-sm focus:outline-none focus:border-indigo-500 font-mono" />
              </div>
              <div>
                <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-1.5">API Calls (Day)</label>
                <input type="number" value={formData.api_calls_limit} onChange={e => setFormData({...formData, api_calls_limit: Number(e.target.value)})} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 text-sm focus:outline-none focus:border-indigo-500 font-mono" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-1.5">API Calls (Month)</label>
                <input type="number" value={formData.api_calls_limit_monthly} onChange={e => setFormData({...formData, api_calls_limit_monthly: Number(e.target.value)})} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 text-sm focus:outline-none focus:border-indigo-500 font-mono" />
              </div>
              <div>
                <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-1.5">API Calls (Year)</label>
                <input type="number" value={formData.api_calls_limit_yearly} onChange={e => setFormData({...formData, api_calls_limit_yearly: Number(e.target.value)})} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 text-sm focus:outline-none focus:border-indigo-500 font-mono" />
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-1.5">Features (JSON Array)</label>
              <input type="text" value={formData.features} onChange={e => setFormData({...formData, features: e.target.value})} placeholder='["HFT", "Sentiment"]' className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 text-sm focus:outline-none focus:border-indigo-500 font-mono" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-1.5">SLA Guarantee</label>
                <input type="text" value={formData.sla_guarantee} onChange={e => setFormData({...formData, sla_guarantee: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 text-sm focus:outline-none focus:border-indigo-500 font-mono" />
              </div>
              <div>
                <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-1.5">Support Type</label>
                <select value={formData.support_type} onChange={e => setFormData({...formData, support_type: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 text-sm focus:outline-none focus:border-indigo-500 font-mono">
                  <option value="email">Email</option>
                  <option value="chat">Chat</option>
                  <option value="dedicated">Dedicated</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-1.5">Description</label>
              <textarea value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} placeholder="Describe limits segment..." className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 text-sm focus:outline-none focus:border-indigo-500 h-20 placeholder:text-zinc-700" />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setIsModalOpen(false)} className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors font-semibold">Cancel</button>
              <button onClick={handleSubmit} className="bg-indigo-500 hover:bg-indigo-400 text-zinc-950 px-4 py-1.5 rounded-md text-xs font-bold transition-all shadow-lg">Save Tier</button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-zinc-900/30 border border-zinc-800/80 rounded-xl overflow-hidden backdrop-blur-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-zinc-900/80 border-b border-zinc-800/80 text-zinc-400 font-mono text-[10px] uppercase tracking-wider">
              <tr>
                <th className="px-6 py-4">Tier Level</th>
                <th className="px-6 py-4">Max Volume Limit</th>
                <th className="px-6 py-4">API Quota</th>
                <th className="px-6 py-4">Description</th>
                <th className="px-6 py-4">Active Keys</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50 font-mono text-xs">
              {tiers.map(t => {
                const count = getTierLicenseCount(t.name);
                return (
                  <tr key={t.id} className="hover:bg-zinc-800/30 group">
                    <td className="px-6 py-4 text-zinc-200 font-bold font-sans text-sm flex items-center gap-2 uppercase">
                      <Layers className="w-4 h-4 text-indigo-400 group-hover:scale-110 transition-transform" />
                      {t.name}
                    </td>
                    <td className="px-6 py-4 text-zinc-300 font-mono text-xs">
                      {t.max_volume_usd >= 1000000000 ? 'Unlimited' : `$${(t.max_volume_usd / 1000000).toFixed(0)}M USD`}
                    </td>
                    <td className="px-6 py-4 text-zinc-300 font-mono text-xs">
                      {t.api_calls_limit <= 0 ? 'Unlimited' : `${t.api_calls_limit.toLocaleString()} / day`}
                    </td>
                    <td className="px-6 py-4 text-zinc-400 text-xs font-sans max-w-xs truncate" title={t.description}>
                      {t.description || 'No description'}
                    </td>
                    <td className="px-6 py-4 text-zinc-400 font-mono text-xs">{count} active</td>
                    <td className="px-6 py-4 text-right">

                      <button 
                        onClick={() => {
                          setEditingTier(t);
                          setFormData({
                            name: t.name,
                            description: t.description || '',
                            max_volume_usd: t.max_volume_usd,
                            api_calls_limit: t.api_calls_limit,
                            api_calls_limit_monthly: t.api_calls_limit_monthly || 300000,
                            api_calls_limit_yearly: t.api_calls_limit_yearly || 3600000
                          });
                          setIsModalOpen(true);
                        }}
                        className="text-zinc-500 hover:text-indigo-400 text-xs font-medium transition-colors mr-3"
                      >
                        Edit
                      </button>
                      <button 
                        onClick={() => deleteTier(t.id)} 
                        className="text-zinc-500 hover:text-rose-400 text-xs font-medium transition-colors"
                        title="Delete license tier entry"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
              {tiers.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-zinc-500 font-mono text-xs">
                    NO CUSTOM LICENSE TIERS CONFIGURED
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ProfitShareCalculatorModal({ isOpen, onClose, licenses }: { isOpen: boolean, onClose: () => void, licenses: License[] }) {
  const [avgNodeProfit, setAvgNodeProfit] = useState<number>(50000);

  if (!isOpen) return null;

  const profitShareLicenses = licenses.filter(l => l.billing_cycle === 'profit_share' && l.status === 'active');
  
  const projectedRevenuePerMonth = profitShareLicenses.reduce((acc, l) => {
    return acc + (avgNodeProfit * ((l.profit_share_pct || 15) / 100));
  }, 0);

  const avgPct = profitShareLicenses.length > 0 
    ? profitShareLicenses.reduce((acc, l) => acc + (l.profit_share_pct || 15), 0) / profitShareLicenses.length 
    : 0;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl">
        <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50">
          <div className="flex items-center gap-2">
            <Calculator className="w-5 h-5 text-indigo-400" />
            <h2 className="text-sm font-semibold text-zinc-100">Profit Share Projections</h2>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6">
          <p className="text-xs text-zinc-400 mb-6">
            Calculate hypothetical future license earnings across all active hedge fund profit share licenses.
          </p>

          <div className="bg-zinc-900/50 p-5 rounded-xl border border-zinc-800/80 mb-6">
            <div className="flex justify-between items-end mb-4">
              <div>
                <label className="block text-[10px] font-mono text-zinc-500 uppercase tracking-wider mb-1">
                  Avg. Monthly Trading Profit (Per Node)
                </label>
                <div className="text-2xl font-semibold text-zinc-200">
                  ${avgNodeProfit.toLocaleString()}
                </div>
              </div>
            </div>
            
            <input 
              type="range" 
              min="1000" 
              max="500000" 
              step="1000"
              value={avgNodeProfit}
              onChange={(e) => setAvgNodeProfit(Number(e.target.value))}
              className="w-full accent-indigo-500 h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer"
            />
            <div className="flex justify-between text-[10px] font-mono text-zinc-500 mt-2">
              <span>$1k</span>
              <span>$250k</span>
              <span>$500k</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800/50">
              <span className="block text-[10px] font-mono text-zinc-500 uppercase tracking-wider mb-1">Active PS Licenses</span>
              <div className="text-xl font-semibold text-zinc-200">{profitShareLicenses.length}</div>
            </div>
            <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800/50">
              <span className="block text-[10px] font-mono text-zinc-500 uppercase tracking-wider mb-1">Avg. Profit Share %</span>
              <div className="text-xl font-semibold text-emerald-400">{avgPct.toFixed(1)}%</div>
            </div>
          </div>

          <div className="bg-indigo-500/10 p-5 rounded-xl border border-indigo-500/20">
            <span className="block text-[10px] font-mono text-indigo-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <BarChart3 className="w-3.5 h-3.5" />
              Projected License Revenue
            </span>
            <div className="flex items-end gap-3">
              <span className="text-4xl font-bold text-indigo-400">${projectedRevenuePerMonth.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
              <span className="text-xs font-mono text-zinc-400 mb-1.5">/ month</span>
            </div>
            <div className="mt-2 text-xs font-mono text-zinc-500">
              ${(projectedRevenuePerMonth * 12).toLocaleString(undefined, { maximumFractionDigits: 0 })} / year
            </div>
          </div>
        </div>
        <div className="p-4 border-t border-zinc-800 bg-zinc-950/30 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors">
            Close Calculator
          </button>
        </div>
      </div>
    </div>
  );
}

function CreateLicenseModal({ 
  isOpen, 
  onClose, 
  onCreate,
  clients,
  softwareProducts,
  licenseTiers,
  editingLicense
}: { 
  isOpen: boolean, 
  onClose: () => void, 
  onCreate: (data: Partial<License>) => void,
  clients: Client[],
  softwareProducts: SoftwareProduct[],
  licenseTiers: LicenseTier[],
  editingLicense?: License | null
}) {
  const [formData, setFormData] = useState({
    issued_to: '',
    software_name: '',
    tier: '',
    billing_cycle: 'onetime' as 'monthly' | 'yearly' | 'onetime' | 'profit_share',
    profit_share_pct: 15
  });

  useEffect(() => {
    if (isOpen) {
      setFormData({
        issued_to: clients[0]?.name || '',
        software_name: softwareProducts[0]?.name || 'QuantMaster HFT',
        tier: licenseTiers[0]?.name || 'Professional',
        billing_cycle: editingLicense?.billing_cycle || 'onetime',
        profit_share_pct: editingLicense?.profit_share_pct || 15
      });
    }
  }, [isOpen, clients, softwareProducts, licenseTiers, editingLicense]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-md overflow-hidden shadow-2xl">
        <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-950/50">
          <h3 className="text-zinc-100 font-medium text-sm">{editingLicense ? 'Edit License' : 'Provision New License'}</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-1.5">Client / Fund Name</label>
            <div className="space-y-2">
              <select 
                value={formData.issued_to}
                onChange={e => setFormData({...formData, issued_to: e.target.value})}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 text-sm focus:outline-none focus:border-indigo-500 transition-colors font-mono"
              >
                <option value="">-- Select Registered Client --</option>
                {clients.map(c => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
                <option value="CUSTOM">-- Type Custom Client --</option>
              </select>
              
              {(!formData.issued_to || formData.issued_to === 'CUSTOM' || !clients.some(c => c.name === formData.issued_to)) && (
                <input 
                  type="text" 
                  value={formData.issued_to === 'CUSTOM' ? '' : formData.issued_to}
                  onChange={e => setFormData({...formData, issued_to: e.target.value})}
                  placeholder="Type custom client or fund name"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 text-sm focus:outline-none focus:border-indigo-500 transition-colors placeholder:text-zinc-700 font-mono" 
                />
              )}
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-1.5">Software Product</label>
            <select 
              value={formData.software_name}
              onChange={e => setFormData({...formData, software_name: e.target.value})}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 text-sm focus:outline-none focus:border-indigo-500 transition-colors font-mono"
            >
              {softwareProducts.map(p => (
                <option key={p.id} value={p.name}>{p.name} (${p.base_price.toLocaleString()}/mo)</option>
              ))}
              {softwareProducts.length === 0 && (
                <>
                  <option value="QuantMaster HFT">QuantMaster HFT</option>
                  <option value="AlphaSeeker Neural">AlphaSeeker Neural</option>
                  <option value="HedgeBot Pro">HedgeBot Pro</option>
                  <option value="Arbitrage Scanner AI">Arbitrage Scanner AI</option>
                </>
              )}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-1.5">License Tier</label>
            <select 
              value={formData.tier}
              onChange={e => setFormData({...formData, tier: e.target.value})}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 text-sm focus:outline-none focus:border-indigo-500 transition-colors font-mono"
            >
              {licenseTiers.map(t => (
                <option key={t.id} value={t.name}>{t.name} (Limit: ${t.max_volume_usd >= 1000000000 ? 'Unlimited' : (t.max_volume_usd / 1000000) + 'M'})</option>
              ))}
              {licenseTiers.length === 0 && (
                <>
                  <option value="Standard">Standard (Up to $10M Volume)</option>
                  <option value="Professional">Professional (Up to $100M Volume)</option>
                  <option value="Institutional">Institutional (Unlimited Volume)</option>
                </>
              )}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-1.5">Billing Cycle</label>
            <select 
              value={formData.billing_cycle}
              onChange={e => setFormData({...formData, billing_cycle: e.target.value as any})}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 text-sm focus:outline-none focus:border-indigo-500 transition-colors font-mono"
            >
              <option value="onetime">One-time / Lifetime</option>
              <option value="monthly">Monthly Subscription</option>
              <option value="yearly">Yearly Subscription</option>
              <option value="profit_share">Hedge Fund (% of Monthly Profit Share)</option>
            </select>
          </div>
          {formData.billing_cycle === 'profit_share' && (
            <div>
              <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-1.5">Monthly Profit Share Percentage (%)</label>
              <div className="relative flex items-center">
                <input 
                  type="number" 
                  min="1" 
                  max="100"
                  value={formData.profit_share_pct}
                  onChange={e => setFormData({...formData, profit_share_pct: parseFloat(e.target.value) || 0})}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-3 pr-28 py-2 text-zinc-200 text-sm focus:outline-none focus:border-indigo-500 transition-colors font-mono"
                  placeholder="e.g. 15"
                />
                <span className="absolute right-3 text-xs font-mono text-zinc-500 pointer-events-none">% of Monthly Profit</span>
              </div>
              <p className="text-[10px] text-zinc-500 font-mono mt-1">
                License fee will be dynamically calculated every month based on this percentage of simulated node trading profits.
              </p>
            </div>
          )}
        </div>
        <div className="p-4 border-t border-zinc-800 bg-zinc-950/30 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-xs font-semibold text-zinc-400 hover:text-zinc-200 transition-colors">Cancel</button>
          <button 
            onClick={() => {
              if (!formData.issued_to || formData.issued_to === 'CUSTOM') return;
              onCreate(formData);
            }} 
            disabled={!formData.issued_to || formData.issued_to === 'CUSTOM'}
            className="px-4 py-2 bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 disabled:hover:bg-indigo-500 text-zinc-950 text-xs font-bold rounded-md transition-colors"
          >
            Provision License
          </button>
        </div>
      </div>
    </div>
  );
}

function EditNodeConfigModal({
  isOpen,
  onClose,
  license,
  onSave
}: {
  isOpen: boolean,
  onClose: () => void,
  license: License | null,
  onSave: (id: string, config: any) => void
}) {
  const [formData, setFormData] = useState({
    hardware_id: '',
    ip_whitelist: '',
    features: '',
    max_volume_usd: 0,
    api_calls_limit: 0,
    api_calls_limit_monthly: 0,
    api_calls_limit_yearly: 0,
    expires_at: '',
    asset_classes: '[]',
    restricted_accounts: ''
  });

  useEffect(() => {
    if (isOpen && license) {
      setFormData({
        hardware_id: license.hardware_id || '',
        ip_whitelist: license.ip_whitelist || '',
        features: license.features ? JSON.parse(license.features).join(', ') : '',
        max_volume_usd: license.max_volume_usd || 10000000,
        api_calls_limit: license.api_calls_limit || 10000,
        api_calls_limit_monthly: license.api_calls_limit_monthly || 300000,
        api_calls_limit_yearly: license.api_calls_limit_yearly || 3600000,
        expires_at: license.expires_at ? license.expires_at.split('T')[0] : '',
        asset_classes: license.asset_classes || '[]',
        restricted_accounts: license.restricted_accounts ? JSON.parse(license.restricted_accounts).join(', ') : ''
      });
    }
  }, [isOpen, license]);

  if (!isOpen || !license) return null;

  const toggleAssetClass = (asset: string) => {
    let classes = JSON.parse(formData.asset_classes);
    if (classes.includes(asset)) {
      classes = classes.filter((a: string) => a !== asset);
    } else {
      classes.push(asset);
    }
    setFormData({ ...formData, asset_classes: JSON.stringify(classes) });
  };

  const handleSave = () => {
    let featureArray: string[] = [];
    try {
      featureArray = formData.features
        .split(',')
        .map(f => f.trim())
        .filter(f => f.length > 0);
    } catch (e) {
      featureArray = [];
    }

    let accountArray: string[] = [];
    try {
      accountArray = formData.restricted_accounts
        .split(',')
        .map(a => a.trim())
        .filter(a => a.length > 0);
    } catch (e) {
      accountArray = [];
    }

    onSave(license.id, {
      hardware_id: formData.hardware_id || null,
      ip_whitelist: formData.ip_whitelist || null,
      features: JSON.stringify(featureArray),
      max_volume_usd: Number(formData.max_volume_usd),
      api_calls_limit: Number(formData.api_calls_limit),
      api_calls_limit_monthly: Number(formData.api_calls_limit_monthly),
      api_calls_limit_yearly: Number(formData.api_calls_limit_yearly),
      expires_at: formData.expires_at ? new Date(formData.expires_at).toISOString() : license.expires_at,
      asset_classes: formData.asset_classes,
      restricted_accounts: JSON.stringify(accountArray)
    });
    onClose();
  };

  const currentAssets = JSON.parse(formData.asset_classes);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-lg overflow-hidden shadow-2xl">
        <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-950/50">
          <div>
            <h3 className="text-zinc-100 font-medium text-sm">Edit Active Node Config</h3>
            <p className="text-[10px] font-mono text-zinc-500 mt-0.5">
              License: {license.issued_to} ({license.license_key.substring(0, 12)}...)
              {license.billing_cycle && (
                <span className="text-indigo-400 capitalize ml-1">({license.billing_cycle === 'onetime' ? 'lifetime' : license.billing_cycle === 'profit_share' ? `profit share (${license.profit_share_pct ?? 15}%)` : license.billing_cycle})</span>
              )}
            </p>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto scrollbar-thin">
          
          {/* Asset Class Restrictions */}
          <div className="bg-indigo-500/5 border border-indigo-500/10 rounded-lg p-4 mb-2">
            <label className="block text-[10px] font-mono text-indigo-400 uppercase mb-3 font-bold">Asset Class Authorization</label>
            <div className="flex gap-3">
              {['forex', 'crypto', 'stocks'].map(asset => (
                <button
                  key={asset}
                  onClick={() => toggleAssetClass(asset)}
                  className={cn(
                    "flex-1 py-2 px-3 rounded-md text-[10px] font-bold uppercase transition-all border",
                    currentAssets.includes(asset) 
                      ? "bg-indigo-500 text-zinc-950 border-indigo-400" 
                      : "bg-zinc-950 text-zinc-500 border-zinc-800 hover:border-zinc-700"
                  )}
                >
                  {asset}
                </button>
              ))}
            </div>
            <p className="text-[9px] text-zinc-500 mt-2 italic">Restricts the licensed bot to only trade selected asset classes.</p>
          </div>

          <div>
            <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-1.5 flex items-center justify-between">
              Restricted Account IDs / API Keys
              <span className="text-[9px] lowercase opacity-60">(Comma separated)</span>
            </label>
            <textarea 
              value={formData.restricted_accounts}
              onChange={e => setFormData({...formData, restricted_accounts: e.target.value})}
              placeholder="e.g. MT5-12345, BINANCE-API-HASH, BROKER-ID-99"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 text-xs font-mono h-20 outline-none focus:border-indigo-500 transition-colors placeholder:text-zinc-800" 
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-1.5">Hardware Lock (HWID)</label>
              <input 
                type="text" 
                value={formData.hardware_id}
                onChange={e => setFormData({...formData, hardware_id: e.target.value})}
                placeholder="e.g. HWID-CLIENT-1234 (Empty = Unlocked)"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 text-xs font-mono focus:outline-none focus:border-indigo-500 transition-colors placeholder:text-zinc-700" 
              />
            </div>
            <div>
              <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-1.5">IP Whitelist</label>
              <input 
                type="text" 
                value={formData.ip_whitelist}
                onChange={e => setFormData({...formData, ip_whitelist: e.target.value})}
                placeholder="e.g. 192.168.1.1, 203.0.113.5 (Comma sep)"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 text-xs font-mono focus:outline-none focus:border-indigo-500 transition-colors placeholder:text-zinc-700" 
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-1.5">Active Modules / Features</label>
            <input 
              type="text" 
              value={formData.features}
              onChange={e => setFormData({...formData, features: e.target.value})}
              placeholder="e.g. HFT_CORE, SENTIMENT, DARK_POOL (Comma sep)"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 text-xs font-mono focus:outline-none focus:border-indigo-500 transition-colors placeholder:text-zinc-700" 
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-1.5">Daily API Call Limit</label>
              <input 
                type="number" 
                value={formData.api_calls_limit}
                onChange={e => setFormData({...formData, api_calls_limit: Number(e.target.value)})}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 text-xs font-mono focus:outline-none focus:border-indigo-500 transition-colors" 
              />
            </div>
            <div>
              <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-1.5">Monthly API Call Limit</label>
              <input 
                type="number" 
                value={formData.api_calls_limit_monthly}
                onChange={e => setFormData({...formData, api_calls_limit_monthly: Number(e.target.value)})}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 text-xs font-mono focus:outline-none focus:border-indigo-500 transition-colors" 
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-1.5">Yearly API Call Limit</label>
              <input 
                type="number" 
                value={formData.api_calls_limit_yearly}
                onChange={e => setFormData({...formData, api_calls_limit_yearly: Number(e.target.value)})}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 text-xs font-mono focus:outline-none focus:border-indigo-500 transition-colors" 
              />
            </div>
            <div>
              <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-1.5">Max Volume (USD)</label>
              <input 
                type="number" 
                value={formData.max_volume_usd}
                onChange={e => setFormData({...formData, max_volume_usd: Number(e.target.value)})}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 text-xs font-mono focus:outline-none focus:border-indigo-500 transition-colors" 
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-1.5">Expiration Date</label>
            <input 
              type="date" 
              value={formData.expires_at}
              onChange={e => setFormData({...formData, expires_at: e.target.value})}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 text-xs font-mono focus:outline-none focus:border-indigo-500 transition-colors" 
            />
          </div>
        </div>
        <div className="p-4 border-t border-zinc-800 bg-zinc-950/30 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-xs font-semibold text-zinc-400 hover:text-zinc-200 transition-colors">Cancel</button>
          <button 
            onClick={handleSave} 
            className="px-4 py-2 bg-indigo-500 hover:bg-indigo-400 text-zinc-950 text-xs font-bold rounded-md transition-colors"
          >
            Save Configuration
          </button>
        </div>
      </div>
    </div>
  );
}

function DashboardView({ licenses, riskScores, riskAlerts, renewalAlerts, showToast, riskSnapshots, clients }: { 
  licenses: License[], 
  riskScores: Record<string, any>,
  riskAlerts: any[],
  renewalAlerts: any[],
  showToast: (msg: string, type: 'success'|'error') => void,
  riskSnapshots: any[],
  clients: Client[]
}) {
  const currentRevenue = licenses.reduce((acc, l) => acc + getLicenseFee(l), 0);
  const currentActive = licenses.filter(l => l.status === 'active').length;
  const [generating, setGenerating] = useState(false);
  const [dbHealth, setDbHealth] = useState<any>(null);

  // Drag and drop customizable widget state
  const [widgets, setWidgets] = useState<{ id: string; title: string; visible: boolean; size: string }[]>(() => {
    const saved = localStorage.getItem('dashboard_widgets_v1');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const ids = parsed.map(w => w.id);
          const defaults = [
            { id: 'system_health', title: 'System Integrity & Posture', visible: true, size: 'md:col-span-2 lg:col-span-2' },
            { id: 'risk_distribution', title: 'Risk Distribution', visible: true, size: 'md:col-span-1 lg:col-span-1' },
            { id: 'historical_risk', title: 'Historical Risk & Telemetry', visible: true, size: 'md:col-span-2 lg:col-span-3' },
            { id: 'revenue_trend', title: 'Revenue Trend', visible: true, size: 'md:col-span-2 lg:col-span-2' },
            { id: 'active_nodes', title: 'Active Node Status', visible: true, size: 'md:col-span-1 lg:col-span-1' },
            { id: 'alert_logs', title: 'Alert Logs', visible: true, size: 'md:col-span-1 lg:col-span-1' },
            { id: 'db_diagnostic', title: 'Database Diagnostics', visible: true, size: 'md:col-span-2 lg:col-span-2' },
            { id: 'pending_kyc', title: 'Pending KYC Reviews', visible: true, size: 'md:col-span-1 lg:col-span-1' },
            { id: 'top_clients', title: 'Top Clients & Nodes', visible: true, size: 'md:col-span-2 lg:col-span-2' },
            { id: 'revenue_forecast', title: 'Revenue Forecast', visible: true, size: 'md:col-span-2 lg:col-span-2' },
          ];
          const missing = defaults.filter(d => !ids.includes(d.id));
          return [...parsed, ...missing];
        }
      } catch (e) {
        // fallback
      }
    }
    return [
      { id: 'system_health', title: 'System Integrity & Posture', visible: true, size: 'md:col-span-2 lg:col-span-2' },
      { id: 'risk_distribution', title: 'Risk Distribution', visible: true, size: 'md:col-span-1 lg:col-span-1' },
      { id: 'historical_risk', title: 'Historical Risk & Telemetry', visible: true, size: 'md:col-span-2 lg:col-span-3' },
      { id: 'revenue_trend', title: 'Revenue Trend', visible: true, size: 'md:col-span-2 lg:col-span-2' },
      { id: 'active_nodes', title: 'Active Node Status', visible: true, size: 'md:col-span-1 lg:col-span-1' },
      { id: 'alert_logs', title: 'Alert Logs', visible: true, size: 'md:col-span-1 lg:col-span-1' },
      { id: 'db_diagnostic', title: 'Database Diagnostics', visible: true, size: 'md:col-span-2 lg:col-span-2' },
      { id: 'pending_kyc', title: 'Pending KYC Reviews', visible: true, size: 'md:col-span-1 lg:col-span-1' },
      { id: 'top_clients', title: 'Top Clients & Nodes', visible: true, size: 'md:col-span-2 lg:col-span-2' },
      { id: 'revenue_forecast', title: 'Revenue Forecast', visible: true, size: 'md:col-span-2 lg:col-span-2' },
    ];
  });

  const [isCustomizing, setIsCustomizing] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem('dashboard_widgets_v1', JSON.stringify(widgets));
  }, [widgets]);

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (draggedId && draggedId !== id) {
      setDragOverId(id);
    }
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) return;

    const draggedIdx = widgets.findIndex(w => w.id === draggedId);
    const targetIdx = widgets.findIndex(w => w.id === targetId);

    if (draggedIdx !== -1 && targetIdx !== -1) {
      const updated = [...widgets];
      const [moved] = updated.splice(draggedIdx, 1);
      updated.splice(targetIdx, 0, moved);
      setWidgets(updated);
    }
    setDraggedId(null);
    setDragOverId(null);
  };

  const handleDragEnd = () => {
    setDraggedId(null);
    setDragOverId(null);
  };

  const toggleWidgetVisibility = (id: string) => {
    setWidgets(prev => prev.map(w => w.id === id ? { ...w, visible: !w.visible } : w));
  };

  const resetWidgets = () => {
    setWidgets([
      { id: 'system_health', title: 'System Integrity & Posture', visible: true, size: 'md:col-span-2 lg:col-span-2' },
      { id: 'risk_distribution', title: 'Risk Distribution', visible: true, size: 'md:col-span-1 lg:col-span-1' },
      { id: 'historical_risk', title: 'Historical Risk & Telemetry', visible: true, size: 'md:col-span-2 lg:col-span-3' },
      { id: 'revenue_trend', title: 'Revenue Trend', visible: true, size: 'md:col-span-2 lg:col-span-2' },
      { id: 'active_nodes', title: 'Active Node Status', visible: true, size: 'md:col-span-1 lg:col-span-1' },
      { id: 'alert_logs', title: 'Alert Logs', visible: true, size: 'md:col-span-1 lg:col-span-1' },
      { id: 'db_diagnostic', title: 'Database Diagnostics', visible: true, size: 'md:col-span-2 lg:col-span-2' },
      { id: 'pending_kyc', title: 'Pending KYC Reviews', visible: true, size: 'md:col-span-1 lg:col-span-1' },
      { id: 'top_clients', title: 'Top Clients & Nodes', visible: true, size: 'md:col-span-2 lg:col-span-2' },
      { id: 'revenue_forecast', title: 'Revenue Forecast', visible: true, size: 'md:col-span-2 lg:col-span-2' },
    ]);
    showToast('Dashboard widgets reset to default layout', 'success');
  };

  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const res = await fetch('/api/diagnostics/db-health');
        const data = await res.json();
        setDbHealth(data);
      } catch (err) {
        console.error("Failed to fetch DB health:", err);
      }
    };
    fetchHealth();
    const interval = setInterval(fetchHealth, 10000); // Check every 10s
    return () => clearInterval(interval);
  }, []);

  const generateMonthlyAuditPDF = async () => {
    setGenerating(true);
    try {
      const res = await fetch('/api/events');
      const eventsData = await res.json();
      const events: LicenseEvent[] = Array.isArray(eventsData) ? eventsData : [];
      
      const doc = new jsPDF();
      
      const margin = 15;
      let y = 20;
      
      // Title
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(18);
      doc.setTextColor(15, 23, 42); // slate-900
      doc.text("MONTHLY LICENSE AUDIT REPORT", margin, y);
      y += 8;
      
      // Subtitle / Date
      doc.setFont("Helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(100, 116, 139); // slate-500
      doc.text(`Generated on: ${new Date().toLocaleString()} (UTC)`, margin, y);
      y += 15;
      
      // Divider
      doc.setDrawColor(226, 232, 240); // slate-200
      doc.setLineWidth(0.5);
      doc.line(margin, y, 195, y);
      y += 10;
      
      // License Status Summary Section
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(30, 41, 59); // slate-800
      doc.text("1. ACTIVE LICENSE SUMMARY", margin, y);
      y += 8;
      
      const activeLicenses = licenses.filter(l => l.status === 'active');
      const suspendedLicenses = licenses.filter(l => l.status === 'suspended');
      const revokedLicenses = licenses.filter(l => l.status === 'revoked');
      
      doc.setFont("Helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(51, 65, 85); // slate-700
      doc.text(`Total Registered Licenses: ${licenses.length}`, margin + 5, y);
      y += 6;
      doc.text(`Active Licenses: ${activeLicenses.length}`, margin + 5, y);
      y += 6;
      doc.text(`Suspended Licenses: ${suspendedLicenses.length}`, margin + 5, y);
      y += 6;
      doc.text(`Revoked Licenses: ${revokedLicenses.length}`, margin + 5, y);
      y += 12;
      
      // Table Header for Licenses
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(10);
      doc.setFillColor(248, 250, 252); // slate-50
      doc.rect(margin, y, 180, 8, "F");
      doc.setTextColor(71, 85, 105); // slate-600
      doc.text("License Key / Client", margin + 2, y + 6);
      doc.text("Software", margin + 70, y + 6);
      doc.text("Tier", margin + 110, y + 6);
      doc.text("Expires At", margin + 135, y + 6);
      doc.text("Status", margin + 165, y + 6);
      y += 8;
      
      // Table Body for Licenses
      doc.setFont("Helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(51, 65, 85);
      
      licenses.slice(0, 15).forEach((license) => {
        if (y > 270) {
          doc.addPage();
          y = 20;
        }
        
        const keyText = license.license_key ? `${license.license_key.substring(0, 8)}... (${license.issued_to.substring(0, 12)})` : license.issued_to;
        const softwareText = license.software_name ? license.software_name.substring(0, 18) : 'N/A';
        const tierText = license.tier || 'N/A';
        const expiresText = license.expires_at ? new Date(license.expires_at).toLocaleDateString() : 'N/A';
        const statusText = (license.status || 'N/A').toUpperCase();
        
        doc.text(keyText, margin + 2, y + 6);
        doc.text(softwareText, margin + 70, y + 6);
        doc.text(tierText, margin + 110, y + 6);
        doc.text(expiresText, margin + 135, y + 6);
        doc.text(statusText, margin + 165, y + 6);
        
        doc.setDrawColor(241, 245, 249);
        doc.line(margin, y + 8, margin + 180, y + 8);
        y += 8;
      });
      
      if (licenses.length > 15) {
        doc.text(`... and ${licenses.length - 15} more licenses listed in system.`, margin + 2, y + 6);
        y += 10;
      } else {
        y += 5;
      }
      
      // Divider
      if (y > 250) {
        doc.addPage();
        y = 20;
      }
      doc.setDrawColor(226, 232, 240);
      doc.line(margin, y, 195, y);
      y += 10;
      
      // Recent Audit Log Events
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(30, 41, 59);
      doc.text("2. RECENT TELEMETRY & SYSTEM EVENTS", margin, y);
      y += 8;
      
      if (!events || events.length === 0) {
        doc.setFont("Helvetica", "normal");
        doc.setFontSize(10);
        doc.setTextColor(148, 163, 184); // slate-400
        doc.text("No system events recorded this month.", margin + 5, y);
        y += 10;
      } else {
        // Table Header for Events
        doc.setFont("Helvetica", "bold");
        doc.setFontSize(10);
        doc.setFillColor(248, 250, 252);
        doc.rect(margin, y, 180, 8, "F");
        doc.setTextColor(71, 85, 105);
        doc.text("Timestamp", margin + 2, y + 6);
        doc.text("Event Type", margin + 50, y + 6);
        doc.text("Payload / Details", margin + 90, y + 6);
        y += 8;
        
        doc.setFont("Helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(51, 65, 85);
        
        events.slice(0, 20).forEach((event) => {
          if (y > 270) {
            doc.addPage();
            y = 20;
            doc.setFont("Helvetica", "bold");
            doc.setFontSize(10);
            doc.setFillColor(248, 250, 252);
            doc.rect(margin, y, 180, 8, "F");
            doc.setTextColor(71, 85, 105);
            doc.text("Timestamp", margin + 2, y + 6);
            doc.text("Event Type", margin + 50, y + 6);
            doc.text("Payload / Details", margin + 90, y + 6);
            y += 8;
            doc.setFont("Helvetica", "normal");
            doc.setFontSize(8);
            doc.setTextColor(51, 65, 85);
          }
          
          const timeStr = event.timestamp ? new Date(event.timestamp).toLocaleString() : 'N/A';
          const typeStr = event.event_type || 'N/A';
          let detailsStr = event.event_data || '';
          
          try {
            const parsed = JSON.parse(event.event_data);
            detailsStr = Object.entries(parsed)
              .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
              .join(", ");
          } catch (_) {}
          
          if (detailsStr.length > 65) {
            detailsStr = detailsStr.substring(0, 62) + "...";
          }
          
          doc.text(timeStr, margin + 2, y + 5);
          doc.text(typeStr, margin + 50, y + 5);
          doc.text(detailsStr, margin + 90, y + 5);
          
          doc.setDrawColor(241, 245, 249);
          doc.line(margin, y + 7, margin + 180, y + 7);
          y += 7;
        });
      }
      
      const pageCount = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFont("Helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184);
        doc.text(`Page ${i} of ${pageCount}`, 195 - margin, 287, { align: "right" });
        doc.text("CONFIDENTIAL - FOR INTERNAL AUDITING PURPOSES ONLY", margin, 287);
      }
      
      doc.save(`monthly-license-audit-${new Date().toISOString().substring(0, 7)}.pdf`);
    } catch (error) {
      console.error("Failed to generate PDF:", error);
    } finally {
      setGenerating(false);
    }
  };

  const chartData = [
    { name: 'Jan', revenue: 14000, active: 24 },
    { name: 'Feb', revenue: 23000, active: 28 },
    { name: 'Mar', revenue: 35000, active: 35 },
    { name: 'Apr', revenue: 47000, active: 42 },
    { name: 'May', revenue: 46000, active: 48 },
    { name: 'Jun', revenue: 69000, active: 55 },
    { name: 'Jul', revenue: 91000 + currentRevenue, active: 62 + currentActive },
  ];

  const n = chartData.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;
  
  chartData.forEach((d, i) => {
    sumX += i;
    sumY += d.revenue;
    sumXY += i * d.revenue;
    sumX2 += i * i;
  });

  const m = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const c = (sumY - m * sumX) / n;
  
  const projectedChartData = [
    ...chartData.map((d, i) => ({
      ...d,
      projected: Math.max(0, m * i + c)
    })),
    { name: 'Aug', revenue: null, projected: Math.max(0, m * 7 + c) },
    { name: 'Sep', revenue: null, projected: Math.max(0, m * 8 + c) },
    { name: 'Oct', revenue: null, projected: Math.max(0, m * 9 + c) }
  ];

  const currentMonthRevenue = chartData[5].revenue;
  const prevMonthRevenue = chartData[4].revenue;
  const growth = ((currentMonthRevenue - prevMonthRevenue) / prevMonthRevenue) * 100;

  const [showPredictiveRisk, setShowPredictiveRisk] = useState(false);
  const predictiveRiskLicenses = licenses.filter(l => {
    const risk = riskScores[l.id]?.risk_score || 0;
    const isExpiringSoon = (new Date(l.expires_at).getTime() - new Date().getTime()) / (1000 * 3600 * 24) <= 30;
    return l.status === 'active' && (risk >= 60 || isExpiringSoon);
  });

  const riskDistribution = [
    { name: 'Critical (80-100)', value: licenses.filter(l => (riskScores[l.id]?.risk_score || 0) >= 80).length, fill: '#f43f5e' },
    { name: 'High (60-79)', value: licenses.filter(l => (riskScores[l.id]?.risk_score || 0) >= 60 && (riskScores[l.id]?.risk_score || 0) < 80).length, fill: '#fb923c' },
    { name: 'Moderate (40-59)', value: licenses.filter(l => (riskScores[l.id]?.risk_score || 0) >= 40 && (riskScores[l.id]?.risk_score || 0) < 60).length, fill: '#fbbf24' },
    { name: 'Low (0-39)', value: licenses.filter(l => (riskScores[l.id]?.risk_score || 0) < 40).length, fill: '#10b981' }
  ].filter(d => d.value > 0);

  const trendData = riskSnapshots && riskSnapshots.length > 0
    ? [...riskSnapshots].reverse().map(s => ({
        time: new Date(s.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        avgScore: Math.round(s.avg_score),
        critical: s.critical_nodes,
        total: s.total_nodes
      }))
    : [
        { time: '12:00', avgScore: 32, critical: 0, total: 4 },
        { time: '13:00', avgScore: 34, critical: 0, total: 4 },
        { time: '14:00', avgScore: 45, critical: 1, total: 5 },
        { time: '15:00', avgScore: 41, critical: 0, total: 5 },
      ];

  const getWidgetIcon = (id: string) => {
    switch (id) {
      case 'system_health':
        return <ShieldCheck className="w-4 h-4 text-indigo-400" />;
      case 'risk_distribution':
        return <Activity className="w-4 h-4 text-indigo-400" />;
      case 'historical_risk':
        return <Activity className="w-4 h-4 text-indigo-400" />;
      case 'revenue_trend':
        return <Building className="w-4 h-4 text-emerald-400" />;
      case 'active_nodes':
        return <Server className="w-4 h-4 text-blue-400" />;
      case 'alert_logs':
        return <Bell className="w-4 h-4 text-rose-400" />;
      case 'pending_kyc':
        return <ShieldAlert className="w-4 h-4 text-amber-400" />;
      case 'db_diagnostic':
        return <Database className="w-4 h-4 text-cyan-400" />;
      case 'top_clients':
        return <Layers className="w-4 h-4 text-purple-400" />;
      default:
        return <Activity className="w-4 h-4" />;
    }
  };

  const renderWidgetContent = (id: string) => {
    switch (id) {
      case 'system_health':
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-zinc-500 font-mono">INTEGRITY STATUS</span>
              <span className={cn(
                "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border",
                riskAlerts.length === 0 && renewalAlerts.length === 0 ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                riskAlerts.length > 0 ? "bg-rose-500/10 text-rose-400 border-rose-500/20" : "bg-amber-500/10 text-amber-400 border-amber-500/20"
              )}>
                {riskAlerts.length === 0 && renewalAlerts.length === 0 ? 'COMPLIANT' : riskAlerts.length > 0 ? 'BREACH_DETECTED' : 'ACTION_REQUIRED'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 bg-zinc-950/40 rounded-lg border border-zinc-800/60">
                <span className="text-[10px] text-zinc-500 font-mono uppercase block mb-1">Risk Violations</span>
                <div className="flex items-baseline gap-2">
                  <span className={cn("text-2xl font-bold font-mono", riskAlerts.length > 0 ? "text-rose-400" : "text-zinc-100")}>{riskAlerts.length}</span>
                  <span className="text-[10px] text-zinc-500 font-mono">active</span>
                </div>
              </div>
              <div className="p-4 bg-zinc-950/40 rounded-lg border border-zinc-800/60">
                <span className="text-[10px] text-zinc-500 font-mono uppercase block mb-1">Expiring Soon</span>
                <div className="flex items-baseline gap-2">
                  <span className={cn("text-2xl font-bold font-mono", renewalAlerts.length > 0 ? "text-amber-400" : "text-zinc-100")}>{renewalAlerts.length}</span>
                  <span className="text-[10px] text-zinc-500 font-mono">licenses</span>
                </div>
              </div>
              <div className="p-4 bg-zinc-950/40 rounded-lg border border-zinc-800/60">
                <span className="text-[10px] text-zinc-500 font-mono uppercase block mb-1">Network Health</span>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold font-mono text-emerald-400">100%</span>
                  <span className="text-[10px] text-zinc-500 font-mono">uptime</span>
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button 
                onClick={async () => {
                  try {
                    const res = await fetch('/api/diagnostics/trigger-threshold-check', { method: 'POST' });
                    if (res.ok) showToast('System integrity scan initiated', 'success');
                  } catch (e) {
                    showToast('Failed to trigger scan', 'error');
                  }
                }}
                className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 px-3 py-2 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Scan Integrity
              </button>
              <button className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-2 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer">
                <ShieldAlert className="w-3.5 h-3.5" />
                Security Logs
              </button>
            </div>
          </div>
        );

      case 'risk_distribution':
        return (
          <div className="flex flex-col h-full justify-between">
            <div className="h-44 flex items-center justify-center relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={riskDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={65}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {riskDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} stroke="transparent" />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '8px', fontSize: '10px' }}
                    itemStyle={{ color: '#e4e4e7' }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute flex flex-col items-center">
                <span className="text-lg font-bold text-zinc-100 font-mono">{licenses.length}</span>
                <span className="text-[8px] text-zinc-500 uppercase font-mono">Total Nodes</span>
              </div>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-1.5 pb-2">
              {riskDistribution.map((item, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: item.fill }}></div>
                  <span className="text-[9px] text-zinc-400 truncate">{item.name.split(' ')[0]}</span>
                </div>
              ))}
            </div>
          </div>
        );

      case 'historical_risk':
        return (
          <div className="space-y-2">
            <p className="text-[11px] text-zinc-400">
              Live tracked average tamper risk score across all active license nodes.
            </p>
            <div className="h-60 mt-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorAvg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                  <XAxis dataKey="time" stroke="#71717a" fontSize={10} tickLine={false} />
                  <YAxis stroke="#71717a" fontSize={10} domain={[0, 100]} tickLine={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '8px', fontSize: '10px' }}
                    itemStyle={{ color: '#e4e4e7' }}
                  />
                  <Area type="monotone" dataKey="avgScore" name="Avg Tamper Risk (%)" stroke="#6366f1" fillOpacity={1} fill="url(#colorAvg)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        );

      case 'revenue_trend':
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-zinc-500 font-mono">REVENUE TREND</span>
              <span className={cn("text-xs font-mono px-2 py-0.5 rounded", growth >= 0 ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400")}>
                {growth >= 0 ? '+' : ''}{growth.toFixed(1)}%
              </span>
            </div>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={projectedChartData} margin={{ top: 10, right: 5, left: -25, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#818cf8" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#818cf8" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                  <XAxis dataKey="name" stroke="#52525b" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis stroke="#52525b" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(value) => `$${value/1000}k`} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '8px', fontSize: '10px' }}
                    itemStyle={{ color: '#e4e4e7' }}
                    formatter={(value: number | null, name: string) => [
                      value ? `$${value.toLocaleString()}` : 'N/A', 
                      name === 'revenue' ? 'Revenue' : 'Projected'
                    ]}
                  />
                  <Area type="monotone" dataKey="revenue" stroke="#818cf8" strokeWidth={2} fillOpacity={1} fill="url(#colorRevenue)" />
                  <Line type="monotone" dataKey="projected" stroke="#fbbf24" strokeDasharray="5 5" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        );

      case 'revenue_forecast':
        return (
          <div className="space-y-4">
            <span className="text-[10px] text-zinc-500 font-mono block">REVENUE FORECAST</span>
            <RevenueForecastWidget licenses={licenses} />
          </div>
        );

      case 'active_nodes':
        return (
          <div className="space-y-4">
            <span className="text-[10px] text-zinc-500 font-mono block">NODE ENROLLMENT TREND</span>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 5, left: -25, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                  <XAxis dataKey="name" stroke="#52525b" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis stroke="#52525b" fontSize={10} tickLine={false} axisLine={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '8px', fontSize: '10px' }}
                    itemStyle={{ color: '#e4e4e7' }}
                    cursor={{ fill: '#27272a', opacity: 0.4 }}
                  />
                  <Bar dataKey="active" fill="#34d399" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        );

      case 'alert_logs':
        return (
          <div className="flex flex-col">
            <span className="text-[10px] text-zinc-500 font-mono block mb-3">ACTIVE SYSTEM ALERTS</span>
            <div className="h-56 overflow-y-auto space-y-2 pr-1 scrollbar-thin scrollbar-thumb-zinc-800">
              {riskAlerts.map(alert => (
                <div key={`risk-${alert.id}`} className="p-2.5 bg-rose-500/5 rounded-lg border border-rose-500/10 flex flex-col gap-0.5 text-[11px]">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-rose-400 flex items-center gap-1 font-mono uppercase text-[9px]">
                      <ShieldAlert className="w-3 h-3 animate-pulse" /> High Risk
                    </span>
                    <span className="text-[9px] text-zinc-500 font-mono">Score: {alert.score}</span>
                  </div>
                  <p className="text-zinc-300 font-medium">{alert.software_name}</p>
                  <p className="text-zinc-500 leading-tight">{alert.message}</p>
                </div>
              ))}
              {renewalAlerts.map(alert => (
                <div key={`renew-${alert.id}`} className="p-2.5 bg-amber-500/5 rounded-lg border border-amber-500/10 flex flex-col gap-0.5 text-[11px]">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-amber-400 flex items-center gap-1 font-mono uppercase text-[9px]">
                      <AlertTriangle className="w-3 h-3" /> Expiring Soon
                    </span>
                    <span className="text-[9px] text-zinc-500 font-mono">{alert.days_remaining}d left</span>
                  </div>
                  <p className="text-zinc-300 font-medium">{alert.software_name}</p>
                  <p className="text-zinc-500 leading-tight">Expires in {alert.days_remaining} days</p>
                </div>
              ))}
              {riskAlerts.length === 0 && renewalAlerts.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-center text-zinc-600 py-12">
                  <ShieldCheck className="w-6 h-6 text-emerald-500/30 mb-1" />
                  <span className="text-xs font-mono">No active alerts.</span>
                  <span className="text-[9px] text-zinc-600">All nodes are fully compliant.</span>
                </div>
              )}
            </div>
          </div>
        );

      case 'db_diagnostic':
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-zinc-950/40 border border-zinc-800/40 p-4 rounded-xl flex items-center gap-4">
              <div className={cn("p-2.5 rounded-lg bg-opacity-10", 
                dbHealth?.sqlite?.status === 'healthy' ? "bg-emerald-500 text-emerald-400" : "bg-rose-500 text-rose-400"
              )}>
                <Database className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <h4 className="text-xs font-medium text-zinc-100 truncate">SQLite Engine</h4>
                  <span className={cn("text-[8px] font-bold uppercase tracking-wider px-1 py-0.5 rounded shrink-0", 
                    dbHealth?.sqlite?.status === 'healthy' ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                  )}>
                    {dbHealth?.sqlite?.status || 'Checking...'}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 font-mono text-[9px] text-zinc-500">
                  <span>Journal: <span className="text-zinc-300">{dbHealth?.sqlite?.journal_mode || '...'}</span></span>
                  <span>Tables: <span className="text-zinc-300">{dbHealth?.sqlite?.tables || 0}</span></span>
                </div>
              </div>
            </div>

            <div className="bg-zinc-950/40 border border-zinc-800/40 p-4 rounded-xl flex items-center gap-4">
              <div className={cn("p-2.5 rounded-lg bg-opacity-10", 
                dbHealth?.duckdb?.status === 'healthy' ? "bg-indigo-500 text-indigo-400" : "bg-rose-500 text-rose-400"
              )}>
                <Zap className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <h4 className="text-xs font-medium text-zinc-100 truncate">DuckDB OLAP</h4>
                  <span className={cn("text-[8px] font-bold uppercase tracking-wider px-1 py-0.5 rounded shrink-0", 
                    dbHealth?.duckdb?.status === 'healthy' ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20" : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                  )}>
                    {dbHealth?.duckdb?.status || 'Checking...'}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 font-mono text-[9px] text-zinc-500">
                  <span>RAM: <span className="text-zinc-300">{dbHealth?.duckdb?.memory_usage ? `${Math.round(dbHealth.duckdb.memory_usage / 1024 / 1024)}MB` : '...'}</span></span>
                  <span>Records: <span className="text-zinc-300">{dbHealth?.duckdb?.records || 0}</span></span>
                </div>
              </div>
            </div>
          </div>
        );

      case 'pending_kyc': {
        const pendingClients = clients.filter(c => c.kyc_status === 'pending');
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] text-zinc-500 font-mono">KYC REVIEWS</span>
              <span className={cn(
                "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border",
                pendingClients.length === 0 ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-amber-500/10 text-amber-400 border-amber-500/20"
              )}>
                {pendingClients.length} PENDING
              </span>
            </div>
            {pendingClients.length === 0 ? (
              <div className="text-center py-6">
                <ShieldCheck className="w-6 h-6 text-emerald-500 mx-auto mb-2 opacity-50" />
                <p className="text-xs text-zinc-500 font-mono">All clients verified</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1 no-scrollbar">
                {pendingClients.map(c => (
                  <div key={c.id} className="p-3 bg-zinc-950/50 border border-zinc-800/80 rounded-lg flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-medium text-zinc-200">{c.name}</h4>
                      <div className="text-[10px] font-mono text-zinc-500 mt-1">
                        Risk: <span className={cn(c.risk_rating === 'high' ? 'text-rose-400' : c.risk_rating === 'medium' ? 'text-amber-400' : 'text-emerald-400')}>{c.risk_rating || 'low'}</span>
                      </div>
                    </div>
                    <button className="px-3 py-1 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 rounded text-[10px] font-bold uppercase transition-colors">
                      Review
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      }

      case 'top_clients':
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-4 bg-zinc-950/30 border border-zinc-850 rounded-xl">
              <h4 className="text-xs font-medium text-zinc-300 mb-3 flex items-center gap-1.5"><Building className="w-3.5 h-3.5 text-purple-400"/> Top Clients (Revenue)</h4>
              <div className="space-y-2">
                {Array.from(licenses.reduce((acc, l) => acc.set(l.issued_to, (acc.get(l.issued_to) || 0) + getLicenseFee(l)), new Map<string, number>()).entries())
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 5)
                  .map(([name, revenue], i) => (
                    <div key={name} className="flex items-center justify-between bg-zinc-900/30 p-2.5 rounded-lg border border-zinc-800/40">
                      <span className="text-xs text-zinc-300 font-medium truncate max-w-[140px]">{i + 1}. {name}</span>
                      <span className="text-xs text-emerald-400 font-mono font-medium">${revenue.toLocaleString()}</span>
                    </div>
                  ))}
              </div>
            </div>

            <div className="p-4 bg-zinc-950/30 border border-zinc-850 rounded-xl">
              <h4 className="text-xs font-medium text-zinc-300 mb-3 flex items-center gap-1.5"><Cpu className="w-3.5 h-3.5 text-blue-400"/> Top Active Nodes</h4>
              <div className="space-y-2">
                {[...licenses].sort((a, b) => (b.current_earnings || 0) - (a.current_earnings || 0))
                  .slice(0, 5)
                  .map((l, i) => (
                    <div key={l.id} className="flex items-center justify-between bg-zinc-900/30 p-2.5 rounded-lg border border-zinc-800/40">
                      <span className="text-xs text-zinc-300 font-mono truncate max-w-[140px]">{i + 1}. {l.hardware_id || 'UNKNOWN'}</span>
                      <span className="text-xs text-emerald-400 font-mono font-medium">${(l.current_earnings || 0).toLocaleString()}</span>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Customization Toolbar */}
      <div className="bg-zinc-900/40 border border-zinc-800/80 p-4 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <SlidersHorizontal className="w-4 h-4 text-indigo-400" />
          <div>
            <h4 className="text-sm font-medium text-zinc-200">Custom Dashboard Layout</h4>
            <p className="text-[11px] text-zinc-500 font-mono">Toggle dashboard widgets and drag them to arrange your workspace.</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2.5 flex-wrap">
          <button 
            onClick={() => setIsCustomizing(!isCustomizing)}
            className={cn("px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all border cursor-pointer", 
              isCustomizing 
                ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/30 ring-1 ring-indigo-500/20" 
                : "bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-750"
            )}
          >
            {isCustomizing ? 'Done Customizing' : 'Customize Widgets'}
          </button>
          
          {isCustomizing && (
            <button 
              onClick={resetWidgets}
              className="bg-zinc-800/50 hover:bg-zinc-800 text-zinc-400 border border-zinc-800 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer"
            >
              Reset Layout
            </button>
          )}
        </div>
      </div>

      {/* Widget Toggle Panel */}
      {isCustomizing && (
        <div className="bg-zinc-900/20 border border-zinc-800/40 rounded-xl p-4 space-y-2">
          <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider block">Visible Dashboard Widgets</span>
          <div className="flex flex-wrap gap-2">
            {widgets.map(w => (
              <button
                key={w.id}
                onClick={() => toggleWidgetVisibility(w.id)}
                className={cn("px-3 py-1.5 rounded-lg text-xs font-medium border transition-all flex items-center gap-1.5 cursor-pointer", 
                  w.visible 
                    ? "bg-indigo-500/10 text-indigo-300 border-indigo-500/20" 
                    : "bg-zinc-950/40 text-zinc-600 border-zinc-900 line-through"
                )}
              >
                {w.visible ? <Check className="w-3.5 h-3.5 text-indigo-400" /> : <Plus className="w-3.5 h-3.5" />}
                {w.title}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main Grid containing widgets */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {widgets.map((widget) => {
          if (!widget.visible) return null;
          
          const isCurrentlyDragged = draggedId === widget.id;
          const isCurrentlyOver = dragOverId === widget.id;

          return (
            <div
              key={widget.id}
              draggable={isCustomizing}
              onDragStart={(e) => handleDragStart(e, widget.id)}
              onDragOver={(e) => handleDragOver(e, widget.id)}
              onDrop={(e) => handleDrop(e, widget.id)}
              onDragEnd={handleDragEnd}
              className={cn(
                "bg-zinc-900/30 border rounded-xl p-6 backdrop-blur-sm transition-all duration-250 flex flex-col justify-between",
                widget.size,
                isCustomizing ? "border-dashed" : "border-zinc-800/80",
                isCurrentlyDragged ? "opacity-30 border-indigo-500/40" : "",
                isCurrentlyOver ? "border-indigo-500 bg-indigo-500/5 shadow-[0_0_15px_rgba(99,102,241,0.15)] scale-[1.01]" : "border-zinc-800/80 hover:border-zinc-750"
              )}
            >
              {/* Widget Header with drag handle and remove toggle */}
              <div className="flex items-center justify-between mb-5 pb-2 border-b border-zinc-800/40 select-none">
                <div className="flex items-center gap-2">
                  {isCustomizing && (
                    <div className="cursor-grab active:cursor-grabbing text-zinc-500 hover:text-indigo-400 p-1 rounded hover:bg-zinc-800/60 transition-colors">
                      <GripVertical className="w-4 h-4" />
                    </div>
                  )}
                  <span className="text-zinc-100 font-medium flex items-center gap-2">
                    {getWidgetIcon(widget.id)} {widget.title}
                  </span>
                </div>
                
                {isCustomizing && (
                  <button 
                    onClick={() => toggleWidgetVisibility(widget.id)}
                    className="text-zinc-500 hover:text-rose-400 p-1 rounded hover:bg-zinc-800/60 transition-colors cursor-pointer"
                    title="Remove widget"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Render Widget Content */}
              <div className="flex-1">
                {renderWidgetContent(widget.id)}
              </div>
            </div>
          );
        })}
      </div>

      {/* Predictive Risk Toggle and Panel */}
      <div className="flex items-center justify-between bg-zinc-900 border border-zinc-800 p-4 rounded-xl">
        <div>
          <h3 className="text-zinc-100 font-medium flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" /> Predictive Risk Analysis
          </h3>
          <p className="text-sm text-zinc-400 mt-1">
            Highlight active licenses that are likely to expire or be revoked within the next 30 days based on telemetry scores.
          </p>
        </div>
        <button 
          onClick={() => setShowPredictiveRisk(!showPredictiveRisk)}
          className={cn("px-4 py-2 rounded-lg text-sm font-medium transition-colors border cursor-pointer", 
            showPredictiveRisk ? "bg-amber-500/10 text-amber-400 border-amber-500/30" : "bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700"
          )}>
          {showPredictiveRisk ? 'Hide Risks' : 'Analyze Risks'}
        </button>
      </div>

      {showPredictiveRisk && (
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-amber-500/10 bg-amber-500/10">
            <h4 className="text-amber-500 font-medium text-sm flex items-center gap-2">
              <Activity className="w-4 h-4" />
              High-Risk Licenses Detected ({predictiveRiskLicenses.length})
            </h4>
          </div>
          <div className="p-0">
            <table className="w-full text-left text-sm text-zinc-400">
              <thead className="text-[10px] uppercase tracking-wider text-zinc-500 bg-black/20 border-b border-amber-500/10">
                <tr>
                  <th className="px-6 py-3 font-medium">License ID</th>
                  <th className="px-6 py-3 font-medium">Client / Project</th>
                  <th className="px-6 py-3 font-medium">Risk Score</th>
                  <th className="px-6 py-3 font-medium">Expires In</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {predictiveRiskLicenses.map(l => {
                  const daysLeft = Math.ceil((new Date(l.expires_at).getTime() - new Date().getTime()) / (1000 * 3600 * 24));
                  const score = riskScores[l.id]?.risk_score || 0;
                  return (
                    <tr key={l.id} className="hover:bg-amber-500/5 transition-colors">
                      <td className="px-6 py-3 font-mono text-[11px] text-zinc-300">{l.id.substring(0, 8)}...</td>
                      <td className="px-6 py-3">{l.issued_to}</td>
                      <td className="px-6 py-3">
                        <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold", 
                          score >= 80 ? "bg-rose-500/20 text-rose-400" : score >= 60 ? "bg-amber-500/20 text-amber-400" : "bg-emerald-500/20 text-emerald-400"
                        )}>
                          {score}/100
                        </span>
                      </td>
                      <td className="px-6 py-3">
                        <span className={cn(daysLeft <= 7 ? "text-rose-400 font-medium" : daysLeft <= 30 ? "text-amber-400 font-medium" : "text-zinc-400")}>
                          {daysLeft} days
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {predictiveRiskLicenses.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-zinc-500">
                      No high-risk licenses detected in the current telemetry window.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Audit Action Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-zinc-900/30 border border-zinc-800/80 p-6 rounded-xl backdrop-blur-sm gap-4">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100 flex items-center gap-2">
            <Activity className="w-5 h-5 text-indigo-400" />
            Monthly Licensing Overview
          </h2>
          <p className="text-xs text-zinc-500 font-mono mt-1">Consolidated system auditing, license lifecycles, and network telemetry logs</p>
        </div>
        <button
          onClick={generateMonthlyAuditPDF}
          disabled={generating}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors shadow-lg shadow-indigo-600/15 cursor-pointer"
        >
          <Download className="w-4 h-4 animate-bounce" />
          {generating ? 'Compiling PDF...' : 'Generate Monthly Audit PDF'}
        </button>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, color, bgColor }: { title: string, value: string | number, icon: any, color: string, bgColor: string }) {
  return (
    <div className="bg-zinc-900/30 p-6 rounded-xl border border-zinc-800/80 shadow-sm flex items-center gap-4 backdrop-blur-sm">
      <div className={cn("p-3 rounded-lg", bgColor, color)}>
        <Icon className="w-6 h-6" />
      </div>
      <div>
        <p className="text-xs font-mono font-medium text-zinc-500 uppercase tracking-wider mb-1">{title}</p>
        <p className="text-2xl font-bold text-zinc-100">{value}</p>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'active') {
    return <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 w-fit uppercase tracking-widest"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]"></span>ACTIVE</span>;
  }
  if (status === 'suspended') {
    return <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20 w-fit uppercase tracking-widest"><span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>SUSPEND</span>;
  }
  if (status === 'revoked') {
    return <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20 w-fit uppercase tracking-widest"><span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>REVOKED</span>;
  }
  if (status === 'archived') {
    return <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-purple-500/10 text-purple-400 border border-purple-500/20 w-fit uppercase tracking-widest"><span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>ARCHIVED</span>;
  }
  return <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-zinc-800 text-zinc-400 border border-zinc-700 w-fit uppercase tracking-widest"><span className="w-1.5 h-1.5 rounded-full bg-zinc-500"></span>EXPIRED</span>;
}

function BatchEditModal({ 
  isOpen, 
  onClose, 
  onSubmit, 
  selectedCount 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  onSubmit: (updates: any) => void; 
  selectedCount: number; 
}) {
  const [enabledFields, setEnabledFields] = useState<Record<string, boolean>>({
    expires_at: false,
    max_volume_usd: false,
    api_calls_limit: false,
    api_calls_limit_monthly: false,
    api_calls_limit_yearly: false,
    billing_cycle: false,
    profit_share_pct: false,
    status: false,
    asset_classes: false,
    features: false,
  });

  const [formData, setFormData] = useState({
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    max_volume_usd: 1000000,
    api_calls_limit: 50000,
    api_calls_limit_monthly: 1500000,
    api_calls_limit_yearly: 18000000,
    billing_cycle: 'monthly',
    profit_share_pct: 15,
    status: 'active',
    asset_classes: {
      forex: true,
      crypto: false,
      stocks: false,
    },
    features: 'HFT_CORE, MAX_LEVERAGE_100x',
  });

  const toggleField = (field: string) => {
    setEnabledFields(prev => ({ ...prev, [field]: !prev[field] }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const updates: any = {};
    
    if (enabledFields.expires_at) {
      updates.expires_at = new Date(formData.expires_at).toISOString();
    }
    if (enabledFields.max_volume_usd) {
      updates.max_volume_usd = Number(formData.max_volume_usd);
    }
    if (enabledFields.api_calls_limit) {
      updates.api_calls_limit = Number(formData.api_calls_limit);
    }
    if (enabledFields.api_calls_limit_monthly) {
      updates.api_calls_limit_monthly = Number(formData.api_calls_limit_monthly);
    }
    if (enabledFields.api_calls_limit_yearly) {
      updates.api_calls_limit_yearly = Number(formData.api_calls_limit_yearly);
    }
    if (enabledFields.billing_cycle) {
      updates.billing_cycle = formData.billing_cycle;
    }
    if (enabledFields.profit_share_pct) {
      updates.profit_share_pct = Number(formData.profit_share_pct);
    }
    if (enabledFields.status) {
      updates.status = formData.status;
    }
    if (enabledFields.asset_classes) {
      const selectedAssets = Object.entries(formData.asset_classes)
        .filter(([_, enabled]) => enabled)
        .map(([name]) => name);
      updates.asset_classes = JSON.stringify(selectedAssets);
    }
    if (enabledFields.features) {
      const parsedFeatures = formData.features
        .split(',')
        .map(f => f.trim())
        .filter(f => f.length > 0);
      updates.features = JSON.stringify(parsedFeatures);
    }

    if (Object.keys(updates).length === 0) {
      alert("Please select at least one field to update.");
      return;
    }

    onSubmit(updates);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-2xl overflow-hidden shadow-2xl">
        <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-950/50">
          <div>
            <h3 className="text-zinc-100 font-medium text-sm flex items-center gap-2">
              <Settings className="w-4 h-4 text-indigo-400" />
              Batch Edit License Properties
            </h3>
            <p className="text-[11px] text-zinc-500 font-mono mt-0.5">
              Bulk-updating {selectedCount} selected licenses simultaneously.
            </p>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto custom-scrollbar">
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-[11px] text-amber-400 font-mono flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold uppercase tracking-wider mb-0.5">Warning</p>
                <p>Only checked fields will be modified across selected licenses. Unchecked properties will remain intact.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Expiration Date */}
              <div className={cn("p-4 rounded-xl border transition-all", enabledFields.expires_at ? "bg-indigo-950/10 border-indigo-500/30" : "bg-zinc-950/20 border-zinc-800/60 opacity-60")}>
                <label className="flex items-center gap-2.5 cursor-pointer select-none mb-3">
                  <input type="checkbox" checked={enabledFields.expires_at} onChange={() => toggleField('expires_at')} className="rounded border-zinc-700 bg-zinc-900 text-indigo-500 focus:ring-indigo-500/20 w-4 h-4" />
                  <span className="text-xs font-mono uppercase tracking-wider text-zinc-300 font-medium">Expiration Date</span>
                </label>
                <input 
                  type="date" 
                  value={formData.expires_at} 
                  disabled={!enabledFields.expires_at}
                  onChange={e => setFormData({ ...formData, expires_at: e.target.value })}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 text-sm focus:outline-none focus:border-indigo-500 transition-colors font-mono disabled:opacity-50" 
                />
              </div>

              {/* Volume limit */}
              <div className={cn("p-4 rounded-xl border transition-all", enabledFields.max_volume_usd ? "bg-indigo-950/10 border-indigo-500/30" : "bg-zinc-950/20 border-zinc-800/60 opacity-60")}>
                <label className="flex items-center gap-2.5 cursor-pointer select-none mb-3">
                  <input type="checkbox" checked={enabledFields.max_volume_usd} onChange={() => toggleField('max_volume_usd')} className="rounded border-zinc-700 bg-zinc-900 text-indigo-500 focus:ring-indigo-500/20 w-4 h-4" />
                  <span className="text-xs font-mono uppercase tracking-wider text-zinc-300 font-medium">Max Volume (USD)</span>
                </label>
                <input 
                  type="number" 
                  value={formData.max_volume_usd} 
                  disabled={!enabledFields.max_volume_usd}
                  onChange={e => setFormData({ ...formData, max_volume_usd: Number(e.target.value) })}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 text-sm focus:outline-none focus:border-indigo-500 transition-colors font-mono disabled:opacity-50" 
                />
              </div>

              {/* Daily API limit */}
              <div className={cn("p-4 rounded-xl border transition-all", enabledFields.api_calls_limit ? "bg-indigo-950/10 border-indigo-500/30" : "bg-zinc-950/20 border-zinc-800/60 opacity-60")}>
                <label className="flex items-center gap-2.5 cursor-pointer select-none mb-3">
                  <input type="checkbox" checked={enabledFields.api_calls_limit} onChange={() => toggleField('api_calls_limit')} className="rounded border-zinc-700 bg-zinc-900 text-indigo-500 focus:ring-indigo-500/20 w-4 h-4" />
                  <span className="text-xs font-mono uppercase tracking-wider text-zinc-300 font-medium">Daily API Call Limit</span>
                </label>
                <input 
                  type="number" 
                  value={formData.api_calls_limit} 
                  disabled={!enabledFields.api_calls_limit}
                  onChange={e => setFormData({ ...formData, api_calls_limit: Number(e.target.value) })}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 text-sm focus:outline-none focus:border-indigo-500 transition-colors font-mono disabled:opacity-50" 
                />
              </div>

              {/* Monthly API limit */}
              <div className={cn("p-4 rounded-xl border transition-all", enabledFields.api_calls_limit_monthly ? "bg-indigo-950/10 border-indigo-500/30" : "bg-zinc-950/20 border-zinc-800/60 opacity-60")}>
                <label className="flex items-center gap-2.5 cursor-pointer select-none mb-3">
                  <input type="checkbox" checked={enabledFields.api_calls_limit_monthly} onChange={() => toggleField('api_calls_limit_monthly')} className="rounded border-zinc-700 bg-zinc-900 text-indigo-500 focus:ring-indigo-500/20 w-4 h-4" />
                  <span className="text-xs font-mono uppercase tracking-wider text-zinc-300 font-medium">Monthly API Limit</span>
                </label>
                <input 
                  type="number" 
                  value={formData.api_calls_limit_monthly} 
                  disabled={!enabledFields.api_calls_limit_monthly}
                  onChange={e => setFormData({ ...formData, api_calls_limit_monthly: Number(e.target.value) })}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 text-sm focus:outline-none focus:border-indigo-500 transition-colors font-mono disabled:opacity-50" 
                />
              </div>

              {/* Yearly API limit */}
              <div className={cn("p-4 rounded-xl border transition-all", enabledFields.api_calls_limit_yearly ? "bg-indigo-950/10 border-indigo-500/30" : "bg-zinc-950/20 border-zinc-800/60 opacity-60")}>
                <label className="flex items-center gap-2.5 cursor-pointer select-none mb-3">
                  <input type="checkbox" checked={enabledFields.api_calls_limit_yearly} onChange={() => toggleField('api_calls_limit_yearly')} className="rounded border-zinc-700 bg-zinc-900 text-indigo-500 focus:ring-indigo-500/20 w-4 h-4" />
                  <span className="text-xs font-mono uppercase tracking-wider text-zinc-300 font-medium">Yearly API Limit</span>
                </label>
                <input 
                  type="number" 
                  value={formData.api_calls_limit_yearly} 
                  disabled={!enabledFields.api_calls_limit_yearly}
                  onChange={e => setFormData({ ...formData, api_calls_limit_yearly: Number(e.target.value) })}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 text-sm focus:outline-none focus:border-indigo-500 transition-colors font-mono disabled:opacity-50" 
                />
              </div>

              {/* Billing Cycle */}
              <div className={cn("p-4 rounded-xl border transition-all", enabledFields.billing_cycle ? "bg-indigo-950/10 border-indigo-500/30" : "bg-zinc-950/20 border-zinc-800/60 opacity-60")}>
                <label className="flex items-center gap-2.5 cursor-pointer select-none mb-3">
                  <input type="checkbox" checked={enabledFields.billing_cycle} onChange={() => toggleField('billing_cycle')} className="rounded border-zinc-700 bg-zinc-900 text-indigo-500 focus:ring-indigo-500/20 w-4 h-4" />
                  <span className="text-xs font-mono uppercase tracking-wider text-zinc-300 font-medium">Billing Cycle</span>
                </label>
                <select 
                  value={formData.billing_cycle} 
                  disabled={!enabledFields.billing_cycle}
                  onChange={e => setFormData({ ...formData, billing_cycle: e.target.value })}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 text-sm focus:outline-none focus:border-indigo-500 transition-colors font-mono disabled:opacity-50"
                >
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                  <option value="onetime">One-time</option>
                  <option value="profit_share">Hedge Fund Profit Share</option>
                </select>
              </div>

              {/* Profit Share % */}
              <div className={cn("p-4 rounded-xl border transition-all", enabledFields.profit_share_pct ? "bg-indigo-950/10 border-indigo-500/30" : "bg-zinc-950/20 border-zinc-800/60 opacity-60")}>
                <label className="flex items-center gap-2.5 cursor-pointer select-none mb-3">
                  <input type="checkbox" checked={enabledFields.profit_share_pct} onChange={() => toggleField('profit_share_pct')} className="rounded border-zinc-700 bg-zinc-900 text-indigo-500 focus:ring-indigo-500/20 w-4 h-4" />
                  <span className="text-xs font-mono uppercase tracking-wider text-zinc-300 font-medium">Profit Share %</span>
                </label>
                <input 
                  type="number" 
                  min="1"
                  max="100"
                  value={formData.profit_share_pct} 
                  disabled={!enabledFields.profit_share_pct}
                  onChange={e => setFormData({ ...formData, profit_share_pct: Number(e.target.value) })}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 text-sm focus:outline-none focus:border-indigo-500 transition-colors font-mono disabled:opacity-50" 
                />
              </div>

              {/* License Status */}
              <div className={cn("p-4 rounded-xl border transition-all", enabledFields.status ? "bg-indigo-950/10 border-indigo-500/30" : "bg-zinc-950/20 border-zinc-800/60 opacity-60")}>
                <label className="flex items-center gap-2.5 cursor-pointer select-none mb-3">
                  <input type="checkbox" checked={enabledFields.status} onChange={() => toggleField('status')} className="rounded border-zinc-700 bg-zinc-900 text-indigo-500 focus:ring-indigo-500/20 w-4 h-4" />
                  <span className="text-xs font-mono uppercase tracking-wider text-zinc-300 font-medium">License Status</span>
                </label>
                <select 
                  value={formData.status} 
                  disabled={!enabledFields.status}
                  onChange={e => setFormData({ ...formData, status: e.target.value })}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 text-sm focus:outline-none focus:border-indigo-500 transition-colors font-mono disabled:opacity-50"
                >
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                  <option value="revoked">Revoked</option>
                  <option value="archived">Archived</option>
                </select>
              </div>

              {/* Asset Classes */}
              <div className={cn("p-4 rounded-xl border transition-all md:col-span-2", enabledFields.asset_classes ? "bg-indigo-950/10 border-indigo-500/30" : "bg-zinc-950/20 border-zinc-800/60 opacity-60")}>
                <label className="flex items-center gap-2.5 cursor-pointer select-none mb-3">
                  <input type="checkbox" checked={enabledFields.asset_classes} onChange={() => toggleField('asset_classes')} className="rounded border-zinc-700 bg-zinc-900 text-indigo-500 focus:ring-indigo-500/20 w-4 h-4" />
                  <span className="text-xs font-mono uppercase tracking-wider text-zinc-300 font-medium">Allowed Asset Classes</span>
                </label>
                <div className="flex items-center gap-6">
                  {['forex', 'crypto', 'stocks'].map(asset => (
                    <label key={asset} className="flex items-center gap-2 cursor-pointer select-none text-zinc-300 text-xs font-mono uppercase">
                      <input 
                        type="checkbox" 
                        disabled={!enabledFields.asset_classes}
                        checked={formData.asset_classes[asset as keyof typeof formData.asset_classes]} 
                        onChange={e => setFormData({
                          ...formData,
                          asset_classes: {
                            ...formData.asset_classes,
                            [asset]: e.target.checked
                          }
                        })}
                        className="rounded border-zinc-800 bg-zinc-950 text-indigo-500 focus:ring-indigo-500/20 w-3.5 h-3.5 disabled:opacity-50" 
                      />
                      {asset}
                    </label>
                  ))}
                </div>
              </div>

              {/* Features / Modules */}
              <div className={cn("p-4 rounded-xl border transition-all md:col-span-2", enabledFields.features ? "bg-indigo-950/10 border-indigo-500/30" : "bg-zinc-950/20 border-zinc-800/60 opacity-60")}>
                <label className="flex items-center gap-2.5 cursor-pointer select-none mb-3">
                  <input type="checkbox" checked={enabledFields.features} onChange={() => toggleField('features')} className="rounded border-zinc-700 bg-zinc-900 text-indigo-500 focus:ring-indigo-500/20 w-4 h-4" />
                  <span className="text-xs font-mono uppercase tracking-wider text-zinc-300 font-medium">Features / Active Modules (Comma Separated)</span>
                </label>
                <input 
                  type="text" 
                  value={formData.features} 
                  disabled={!enabledFields.features}
                  placeholder="e.g. HFT_CORE, MAX_LEVERAGE_100x"
                  onChange={e => setFormData({ ...formData, features: e.target.value })}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 text-sm focus:outline-none focus:border-indigo-500 transition-colors font-mono disabled:opacity-50 placeholder:text-zinc-700" 
                />
              </div>

            </div>
          </div>

          <div className="p-4 border-t border-zinc-800 flex justify-end gap-3 bg-zinc-950/50">
            <button 
              type="button" 
              onClick={onClose} 
              className="px-4 py-2 text-xs font-semibold text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2 rounded-lg text-xs font-semibold transition-colors"
            >
              Apply Bulk Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

