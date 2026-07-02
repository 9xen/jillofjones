import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import http from "http";
import { Server } from "socket.io";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";
import {
  getAllLicenses, createLicense, updateLicenseStatus, deleteLicense, updateLicenseEarnings, getLicenseByKey, logLicenseEvent,
  updateLicenseConfig, incrementApiCalls,
  getAllClients, createClient, deleteClient,
  getAllSoftwareProducts, createSoftwareProduct, deleteSoftwareProduct,
  getAllLicenseTiers, createLicenseTier, deleteLicenseTier,
  getAuditSchedule, updateAuditSchedule, logAuditRun,
  getAllUsers, createUser, deleteUser, updateUserRole, getUserByEmail,
  getAllAuditLogs, createAuditLog, extendLicenseExpiry,
  getSMTPSettings, updateSMTPSettings,
  updateLicenseHWID, updateLicenseLastActive,
  getSystemConfig, setSystemConfig,
  getUserWithPasswordByEmail, updateLastLogin,
  saveRecoveryCode, getRecoveryCode, deleteRecoveryCode, updateUserPassword
} from "./src/db";
import { License, AppUser, AuditLog } from "./src/types";
import crypto from "crypto";
import nodemailer from "nodemailer";
import bcrypt from "bcryptjs";
import { execSync } from "child_process";
import { initializeDuckDBSchema, calculateDuckDBRiskScores } from "./src/analytics";

async function startServer() {
  await initializeDuckDBSchema();
  const app = express();
  const PORT = 3000;
  
  app.use(helmet({
    contentSecurityPolicy: false, // Disable CSP for easier integration with Vite in dev
  }));
  app.use(cors());
  app.use(compression());
  app.use(express.json());

  // Cryptographic Setup for Offline Licensing
  let privateKey = getSystemConfig("private_key");
  let publicKey = getSystemConfig("public_key");

  if (!privateKey || !publicKey) {
    console.log("Generating new system RSA keypair for offline licensing...");
    const { publicKey: pub, privateKey: priv } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });
    setSystemConfig("private_key", priv);
    setSystemConfig("public_key", pub);
    privateKey = priv;
    publicKey = pub;
  }

  // Enterprise HWID Helper (for local deployments)
  const getServerHWID = () => {
    try {
      if (process.platform === 'win32') {
        const output = execSync('wmic csproduct get uuid').toString();
        return output.split('\n')[1].trim();
      } else {
        // Linux/Container fallback
        const machineId = execSync('cat /etc/machine-id || cat /proc/sys/kernel/random/boot_id').toString().trim();
        return machineId;
      }
    } catch (e) {
      return "CONTAINER-ENV-" + (process.env.HOSTNAME || "UNKNOWN");
    }
  };

  // SMTP Transporter Helper
  const getTransporter = async () => {
    const settings = getSMTPSettings();
    if (!settings) return null;

    return nodemailer.createTransport({
      host: settings.host,
      port: settings.port,
      secure: settings.secure === 1,
      auth: {
        user: settings.user,
        pass: settings.pass
      }
    });
  };

  const sendEmail = async (to: string, subject: string, text: string, html?: string, attachments?: any[]) => {
    const transporter = await getTransporter();
    if (!transporter) {
      console.warn("SMTP not configured, email not sent.");
      return false;
    }

    const settings = getSMTPSettings();
    try {
      await transporter.sendMail({
        from: settings.from_email,
        to,
        subject,
        text,
        html,
        attachments
      });
      return true;
    } catch (err) {
      console.error("Failed to send email:", err);
      return false;
    }
  };

  // Audit Logging Helper
  const logAction = (user: AppUser | null, action: string, entityType: string, entityId: string, details?: string) => {
    try {
      const log: AuditLog = {
        id: crypto.randomUUID(),
        user_id: user?.id || 'system',
        user_name: user?.name || 'System',
        action,
        entity_type: entityType,
        entity_id: entityId,
        details: details || '',
        timestamp: new Date().toISOString()
      };
      createAuditLog(log);
      io.emit("audit:new", log);
    } catch (err) {
      console.error("Failed to log audit action:", err);
    }
  };

  // Renewal Alerts Logic
  const getRenewalAlerts = () => {
    const licenses = getAllLicenses();
    const now = new Date();
    const alerts: any[] = [];

    licenses.forEach(l => {
      const expiry = new Date(l.expires_at);
      const diffTime = expiry.getTime() - now.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays <= 90 && diffDays > 0) {
        let severity: 'critical' | 'warning' | 'info' = 'info';
        if (diffDays <= 30) severity = 'critical';
        else if (diffDays <= 60) severity = 'warning';

        alerts.push({
          id: `renewal-${l.id}-${diffDays}`,
          license_id: l.id,
          software_name: l.software_name,
          days_remaining: diffDays,
          expires_at: l.expires_at,
          severity
        });
      }
    });

    return alerts;
  };

  const server = http.createServer(app);
  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  // Keep track of live WebSocket nodes
  const liveNodes = new Map<string, { 
    socketId: string, 
    ip: string, 
    hardwareId: string, 
    connectedAt: string, 
    rtt?: number, 
    isDegraded?: boolean,
    nextPingAt?: number,
    heartbeatInterval?: number,
    rttHistory?: number[],
    lastPongAt?: number
  }>();

  io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);
    
    socket.emit("licenses:init", getAllLicenses());
    socket.emit("clients:init", getAllClients());
    socket.emit("software_products:init", getAllSoftwareProducts());
    socket.emit("license_tiers:init", getAllLicenseTiers());
    socket.emit("audit_schedule:init", getAuditSchedule());
    socket.emit("users:init", getAllUsers());
    socket.emit("audit_logs:init", getAllAuditLogs());
    socket.emit("alerts:renewal", getRenewalAlerts());
    socket.emit("nodes:live", Array.from(liveNodes.entries()).map(([key, val]) => ({
      license_key: key,
      ...val
    })));

    socket.on("node:connect", ({ license_key, hardware_id, ip, asset_class, account_id, heartbeat_interval }: any) => {
      try {
        if (!license_key) {
          socket.emit("node:error", { error: "license_key is required" });
          return;
        }

        const license = getLicenseByKey(license_key);
        if (!license) {
          socket.emit("node:error", { error: "License not found" });
          return;
        }

        if (license.status !== 'active') {
          logLicenseEvent({
            id: crypto.randomUUID(),
            license_id: license.id,
            event_type: 'verification_failed',
            event_data: JSON.stringify({ reason: `License is ${license.status}`, ip, hardware_id, transport: 'websocket' }),
            timestamp: new Date().toISOString()
          });
          socket.emit("node:error", { error: `License is ${license.status}` });
          return;
        }

        // Asset Class Enforcement
        if (license.asset_classes && asset_class) {
          const allowedClasses = JSON.parse(license.asset_classes);
          if (allowedClasses.length > 0 && !allowedClasses.includes(asset_class)) {
            logLicenseEvent({
              id: crypto.randomUUID(),
              license_id: license.id,
              event_type: 'verification_failed',
              event_data: JSON.stringify({ reason: `Unauthorized asset class: ${asset_class}`, ip, hardware_id, transport: 'websocket' }),
              timestamp: new Date().toISOString()
            });
            socket.emit("node:error", { error: `Unauthorized asset class: ${asset_class}` });
            return;
          }
        }

        // Restricted Account Enforcement
        if (license.restricted_accounts && account_id) {
          const allowedAccounts = JSON.parse(license.restricted_accounts);
          if (allowedAccounts.length > 0 && !allowedAccounts.includes(account_id)) {
            logLicenseEvent({
              id: crypto.randomUUID(),
              license_id: license.id,
              event_type: 'verification_failed',
              event_data: JSON.stringify({ reason: `Unauthorized account/API key: ${account_id}`, ip, hardware_id, transport: 'websocket' }),
              timestamp: new Date().toISOString()
            });
            socket.emit("node:error", { error: `Unauthorized account ID or API key: ${account_id}` });
            return;
          }
        }

        if (new Date(license.expires_at) < new Date()) {
          updateLicenseStatus(license.id, 'expired');
          io.emit("licenses:status_updated", { id: license.id, status: 'expired' });
          
          logLicenseEvent({
            id: crypto.randomUUID(),
            license_id: license.id,
            event_type: 'verification_failed',
            event_data: JSON.stringify({ reason: "License expired", ip, hardware_id, transport: 'websocket' }),
            timestamp: new Date().toISOString()
          });
          socket.emit("node:error", { error: "License expired" });
          return;
        }

        let risk_detected = false;
        let risk_reason = "";

        if (license.hardware_id && hardware_id && license.hardware_id !== hardware_id) {
          logLicenseEvent({
            id: crypto.randomUUID(),
            license_id: license.id,
            event_type: 'verification_failed',
            event_data: JSON.stringify({ reason: "Hardware ID mismatch", hardware_id, provided_hwid: hardware_id, ip, transport: 'websocket' }),
            timestamp: new Date().toISOString()
          });
          risk_detected = true;
          risk_reason = "Hardware ID mismatch";
        }

        if (license.ip_whitelist && ip) {
          const ips = license.ip_whitelist.split(',').map(item => item.trim());
          if (!ips.includes(ip)) {
            logLicenseEvent({
              id: crypto.randomUUID(),
              license_id: license.id,
              event_type: 'verification_failed',
              event_data: JSON.stringify({ reason: "IP not whitelisted", ip, provided_ip: ip, hardware_id, transport: 'websocket' }),
              timestamp: new Date().toISOString()
            });
            risk_detected = true;
            risk_reason = "IP not whitelisted";
          }
        }

        if (license.api_calls_limit > 0 && license.api_calls_count_daily >= license.api_calls_limit) {
          logLicenseEvent({
            id: crypto.randomUUID(),
            license_id: license.id,
            event_type: 'verification_failed',
            event_data: JSON.stringify({ reason: "Daily API call limit exceeded", count: license.api_calls_count_daily, limit: license.api_calls_limit, transport: 'websocket' }),
            timestamp: new Date().toISOString()
          });
          socket.emit("node:error", { error: "Daily API quota exceeded" });
          return;
        }

        if (license.api_calls_limit_monthly > 0 && license.api_calls_count_monthly >= license.api_calls_limit_monthly) {
          logLicenseEvent({
            id: crypto.randomUUID(),
            license_id: license.id,
            event_type: 'verification_failed',
            event_data: JSON.stringify({ reason: "Monthly API call limit exceeded", count: license.api_calls_count_monthly, limit: license.api_calls_limit_monthly, transport: 'websocket' }),
            timestamp: new Date().toISOString()
          });
          socket.emit("node:error", { error: "Monthly API quota exceeded" });
          return;
        }

        if (license.api_calls_limit_yearly > 0 && license.api_calls_count_yearly >= license.api_calls_limit_yearly) {
          logLicenseEvent({
            id: crypto.randomUUID(),
            license_id: license.id,
            event_type: 'verification_failed',
            event_data: JSON.stringify({ reason: "Yearly API call limit exceeded", count: license.api_calls_count_yearly, limit: license.api_calls_limit_yearly, transport: 'websocket' }),
            timestamp: new Date().toISOString()
          });
          socket.emit("node:error", { error: "Yearly API quota exceeded" });
          return;
        }

        // Live connection authorized!
        // Calculate dynamic ideal heartbeat interval based on current global average RTT
        const connectedNodesWithRtt = Array.from(liveNodes.values()).filter(n => n.rtt !== undefined && n.rtt >= 0);
        const serverAverageRtt = connectedNodesWithRtt.length > 0
          ? Math.round(connectedNodesWithRtt.reduce((sum, n) => sum + (n.rtt || 0), 0) / connectedNodesWithRtt.length)
          : null;

        const serverIdealInterval = serverAverageRtt !== null
          ? Math.max(3000, Math.min(15000, Math.round((3000 + (serverAverageRtt * 20)) / 500) * 500))
          : 3000;

        const finalInterval = heartbeat_interval || serverIdealInterval;

        liveNodes.set(license_key, {
          socketId: socket.id,
          ip: ip || '127.0.0.1',
          hardwareId: hardware_id || 'WS-NODE',
          connectedAt: new Date().toISOString(),
          nextPingAt: Date.now() + finalInterval,
          heartbeatInterval: finalInterval,
          rttHistory: [],
          lastPongAt: Date.now()
        });

        logLicenseEvent({
          id: crypto.randomUUID(),
          license_id: license.id,
          event_type: 'verification_success',
          event_data: JSON.stringify({ ip, hardware_id, transport: 'websocket' }),
          timestamp: new Date().toISOString()
        });

        socket.emit("node:connected", {
          license_id: license.id,
          software_name: license.software_name,
          tier: license.tier,
          risk_detected,
          error: risk_reason
        });

        // Broadcast updated list of live nodes to all connected clients
        io.emit("nodes:live", Array.from(liveNodes.entries()).map(([key, val]) => ({
          license_key: key,
          ...val
        })));
      } catch (err) {
        console.error("WS verification error:", err);
        socket.emit("node:error", { error: "Internal server error" });
      }
    });

    socket.on("node:disconnect_node", ({ license_key, isZombie }: { license_key: string, isZombie?: boolean }) => {
      const val = liveNodes.get(license_key);
      if (val) {
        const socketToDisconnect = io.sockets.sockets.get(val.socketId);
        if (socketToDisconnect) {
          socketToDisconnect.disconnect(true);
        }
        liveNodes.delete(license_key);
        if (isZombie) {
          logAction(null, 'zombie_disconnection', 'node', license_key, `Node (${license_key.substring(0, 12)}...) flagged as Zombie and disconnected automatically after >30s of heartbeat silence`);
          io.emit("audit_logs:updated", getAllAuditLogs());
        }
        io.emit("nodes:live", Array.from(liveNodes.entries()).map(([key, nodeVal]) => ({
          license_key: key,
          ...nodeVal
        })));
      }
    });

    socket.on("node:pong", ({ license_key, sentAt }: { license_key: string, sentAt: number }) => {
      const node = liveNodes.get(license_key);
      if (node) {
        node.rtt = Date.now() - sentAt;
        node.lastPongAt = Date.now();
        
        const thresholdStr = getSystemConfig("latency_threshold");
        const threshold = thresholdStr ? parseInt(thresholdStr, 10) : 150;
        
        const isDegraded = node.rtt > threshold;
        if (isDegraded && !node.isDegraded) {
          node.isDegraded = true;
          logAction(null, 'degraded_performance', 'node', license_key, `Node latency (${node.rtt}ms) exceeded threshold of ${threshold}ms`);
          io.emit("audit_logs:updated", getAllAuditLogs());
        } else if (!isDegraded && node.isDegraded) {
          node.isDegraded = false;
          logAction(null, 'nominal_performance', 'node', license_key, `Node latency recovered to nominal limits (${node.rtt}ms)`);
          io.emit("audit_logs:updated", getAllAuditLogs());
        }

        // Track heartbeat and RTT history
        if (!node.rttHistory) {
          node.rttHistory = [];
        }
        node.rttHistory.push(node.rtt);
        if (node.rttHistory.length > 5) {
          node.rttHistory.shift();
        }

        // Determine if RTT is low and stable
        // "low": RTT is less than 50% of the alert threshold (and below 75ms minimum safe low latency bound)
        const lowLimit = Math.max(50, threshold * 0.5);
        const isLow = node.rtt < lowLimit;
        
        let isStable = false;
        let jitter = 0;
        if (node.rttHistory.length >= 3) {
          const maxRtt = Math.max(...node.rttHistory);
          const minRtt = Math.min(...node.rttHistory);
          jitter = maxRtt - minRtt;
          // stable jitter is small (under 15ms or 10% of latency threshold)
          isStable = jitter < Math.max(15, threshold * 0.1);
        }

        const prevInterval = node.heartbeatInterval || 3000;
        if (isLow && isStable) {
          // Progressively increase heartbeat interval to reduce network overhead (max 12s)
          node.heartbeatInterval = Math.min(12000, prevInterval + 3000);
        } else {
          // Instability or high latency detected: reset interval to fast baseline immediately for responsive telemetry
          node.heartbeatInterval = 3000;
        }

        io.emit("nodes:live", Array.from(liveNodes.entries()).map(([key, val]) => ({
          license_key: key,
          ...val
        })));
      }
    });

    socket.on("licenses:create", ({ license, user }: { license: License, user: AppUser }) => {
      try {
        const created = createLicense(license);
        io.emit("licenses:created", created);
        logAction(user, 'create', 'license', created.id, `Provisioned ${created.software_name} to ${created.issued_to}`);
      } catch (err) {
        console.error("Error creating license:", err);
      }
    });

    socket.on("licenses:update_status", ({ id, status, user }: { id: string, status: string, user: AppUser }) => {
      try {
        updateLicenseStatus(id, status);
        io.emit("licenses:status_updated", { id, status });
        logAction(user, 'update_status', 'license', id, `Status changed to ${status}`);
      } catch (err) {
        console.error("Error updating status:", err);
      }
    });

    socket.on("licenses:delete", ({ id, user }: { id: string, user: AppUser }) => {
      try {
        deleteLicense(id);
        io.emit("licenses:deleted", id);
        logAction(user, 'delete', 'license', id, `Deleted license permanently`);
      } catch (err) {
        console.error("Error deleting license:", err);
      }
    });

    socket.on("licenses:extend", ({ id, expiresAt, user }: { id: string, expiresAt: string, user: AppUser }) => {
      try {
        extendLicenseExpiry(id, expiresAt);
        io.emit("licenses:extended", { id, expiresAt });
        logAction(user, 'extend', 'license', id, `Extended license validity to ${new Date(expiresAt).toLocaleDateString()}`);
      } catch (err) {
        console.error("Error extending license:", err);
      }
    });

    socket.on("licenses:reset_hwid", ({ id, user }: { id: string, user: AppUser }) => {
      try {
        updateLicenseHWID(id, ''); // Clear the HWID
        io.emit("licenses:hwid_reset", id);
        logAction(user, 'reset_hwid', 'license', id, `Hardware ID lock reset by administrator`);
      } catch (err) {
        console.error("Error resetting HWID:", err);
      }
    });

    socket.on("licenses:update_config", ({ id, config }: { id: string, config: any }) => {
      try {
        updateLicenseConfig(id, config);
        io.emit("licenses:config_updated", { id, config });
      } catch (err) {
        console.error("Error updating license config:", err);
      }
    });

    socket.on("node:simulate_api_call", ({ license_key, count }) => {
      try {
        const license = getLicenseByKey(license_key);
        if (!license) return;

        // Increment API calls
        const updatedCounts = incrementApiCalls(license.id, count);
        io.emit("licenses:api_calls_updated", { id: license.id, counts: updatedCounts });

        // Validate limits
        let exceeded = false;
        let reason = "";

        if (license.api_calls_limit > 0 && updatedCounts.daily > license.api_calls_limit) {
          exceeded = true;
          reason = "Daily API call limit exceeded";
        } else if (license.api_calls_limit_monthly > 0 && updatedCounts.monthly > license.api_calls_limit_monthly) {
          exceeded = true;
          reason = "Monthly API call limit exceeded";
        } else if (license.api_calls_limit_yearly > 0 && updatedCounts.yearly > license.api_calls_limit_yearly) {
          exceeded = true;
          reason = "Yearly API call limit exceeded";
        }

        if (exceeded) {
          // Suspend license automatically
          updateLicenseStatus(license.id, 'suspended');
          io.emit("licenses:status_updated", { id: license.id, status: 'suspended' });

          logLicenseEvent({
            id: crypto.randomUUID(),
            license_id: license.id,
            event_type: 'limit_exceeded',
            event_data: JSON.stringify({ reason, counts: updatedCounts, limits: { daily: license.api_calls_limit, monthly: license.api_calls_limit_monthly, yearly: license.api_calls_limit_yearly } }),
            timestamp: new Date().toISOString()
          });

          // Disconnect from live node map
          if (liveNodes.has(license_key)) {
            liveNodes.delete(license_key);
            io.emit("nodes:live", Array.from(liveNodes.entries()).map(([key, val]) => ({
              license_key: key,
              ...val
            })));
          }

          socket.emit("node:error", { error: reason + " - Node suspended" });
        } else {
          logLicenseEvent({
            id: crypto.randomUUID(),
            license_id: license.id,
            event_type: 'webhook_call',
            event_data: JSON.stringify({ detail: `Logged ${count} API calls`, counts: updatedCounts }),
            timestamp: new Date().toISOString()
          });

          socket.emit("node:api_call_logged", { counts: updatedCounts });
        }
      } catch (err) {
        console.error("Error simulating API call:", err);
      }
    });

    socket.on("clients:create", ({ client, user }: { client: any, user: AppUser }) => {
      try {
        const created = createClient(client);
        io.emit("clients:created", created);
        logAction(user, 'create', 'client', created.id, `Created client ${created.name}`);
      } catch (err) {
        console.error("Error creating client:", err);
      }
    });

    socket.on("clients:delete", ({ id, user }: { id: string, user: AppUser }) => {
      try {
        deleteClient(id);
        io.emit("clients:deleted", id);
        logAction(user, 'delete', 'client', id, `Deleted client profile`);
      } catch (err) {
        console.error("Error deleting client:", err);
      }
    });

    socket.on("software_products:create", (prod) => {
      try {
        const created = createSoftwareProduct(prod);
        io.emit("software_products:created", created);
      } catch (err) {
        console.error("Error creating software product:", err);
      }
    });

    socket.on("software_products:delete", (id: string) => {
      try {
        deleteSoftwareProduct(id);
        io.emit("software_products:deleted", id);
      } catch (err) {
        console.error("Error deleting software product:", err);
      }
    });

    socket.on("license_tiers:create", (tier) => {
      try {
        const created = createLicenseTier(tier);
        io.emit("license_tiers:created", created);
      } catch (err) {
        console.error("Error creating license tier:", err);
      }
    });

    socket.on("license_tiers:delete", (id: string) => {
      try {
        deleteLicenseTier(id);
        io.emit("license_tiers:deleted", id);
      } catch (err) {
        console.error("Error deleting license tier:", err);
      }
    });

    socket.on("users:create", (user: AppUser) => {
      try {
        const created = createUser(user);
        io.emit("users:created", created);
      } catch (err) {
        console.error("Error creating user:", err);
      }
    });

    socket.on("users:update_role", ({ id, role }: { id: string, role: string }) => {
      try {
        updateUserRole(id, role);
        io.emit("users:role_updated", { id, role });
      } catch (err) {
        console.error("Error updating user role:", err);
      }
    });

    socket.on("users:delete", (id: string) => {
      try {
        deleteUser(id);
        io.emit("users:deleted", id);
      } catch (err) {
        console.error("Error deleting user:", err);
      }
    });

    socket.on("disconnect", () => {
      console.log("Client disconnected:", socket.id);
      let changed = false;
      for (const [key, val] of liveNodes.entries()) {
        if (val.socketId === socket.id) {
          liveNodes.delete(key);
          changed = true;
        }
      }
      if (changed) {
        io.emit("nodes:live", Array.from(liveNodes.entries()).map(([key, val]) => ({
          license_key: key,
          ...val
        })));
      }
    });
  });

  // Heartbeat loop - runs every 1 second to evaluate individual node schedule and trigger dynamic pings
  setInterval(() => {
    try {
      const now = Date.now();
      if (liveNodes.size > 0) {
        let broadcastRequired = false;
        for (const [key, val] of liveNodes.entries()) {
          // Initialize nextPingAt and dynamic attributes if not set
          if (!val.nextPingAt) {
            val.nextPingAt = now + 3000;
            val.heartbeatInterval = 3000;
            val.rttHistory = [];
            val.lastPongAt = now;
            broadcastRequired = true;
          }

          // Server-side Zombie check: if lastPongAt or connectedAt is more than 30 seconds ago, disconnect the node
          const lastPong = val.lastPongAt || new Date(val.connectedAt).getTime();
          const inactiveTime = now - lastPong;
          if (inactiveTime > 30000) {
            console.log(`[SERVER-SIDE ZOMBIE CLEANUP] Node ${key} has been silent for ${Math.round(inactiveTime / 1000)}s. Terminating connection.`);
            
            // Log to audit log
            logAction(null, 'zombie_disconnection', 'node', key, `Node (${key.substring(0, 12)}...) flagged as Zombie and disconnected automatically after >30s of heartbeat silence (detected by backend cleanup loop)`);
            
            // Physically disconnect the socket
            const socketToDisconnect = io.sockets.sockets.get(val.socketId);
            if (socketToDisconnect) {
              socketToDisconnect.disconnect(true);
            }
            
            // Remove from server-side state Map
            liveNodes.delete(key);
            broadcastRequired = true;
            continue;
          }

          if (now >= val.nextPingAt) {
            io.to(val.socketId).emit("node:ping", {
              license_key: key,
              sentAt: now
            });
            // Schedule the next ping according to its dynamic interval
            val.nextPingAt = now + (val.heartbeatInterval || 3000);
          }
        }
        if (broadcastRequired) {
          io.emit("nodes:live", Array.from(liveNodes.entries()).map(([k, v]) => ({
            license_key: k,
            ...v
          })));
          io.emit("audit_logs:updated", getAllAuditLogs());
        }
      }
    } catch (err) {
      console.error("Heartbeat interval error:", err);
    }
  }, 1000);

  // Earnings simulation loop
  setInterval(() => {
    try {
      const licenses = getAllLicenses();
      const updates = [];
      for (const license of licenses) {
        if (license.status === 'active') {
          // Simulate some earnings (e.g., $1 to $500 per tick depending on tier)
          const baseEarn = license.tier === 'Institutional' ? 500 : (license.tier === 'Professional' ? 50 : 5);
          const earnTick = Math.random() * baseEarn;
          const newEarnings = (license.current_earnings || 0) + earnTick;
          const newDaily = (license.daily_earnings || 0) + earnTick;
          const newWeekly = (license.weekly_earnings || 0) + earnTick;
          const newMonthly = (license.monthly_earnings || 0) + earnTick;
          
          updateLicenseEarnings(license.id, newEarnings, newDaily, newWeekly, newMonthly);
          updates.push({ 
            id: license.id, 
            current_earnings: newEarnings,
            daily_earnings: newDaily,
            weekly_earnings: newWeekly,
            monthly_earnings: newMonthly
          });
        }
      }
      if (updates.length > 0) {
        io.emit("licenses:earnings_updated", updates);
      }
    } catch (err) {
      console.error("Simulation error:", err);
    }
  }, 2000);

  // Renewal Alerts Interval
  setInterval(async () => {
    const alerts = getRenewalAlerts();
    io.emit("alerts:renewal", alerts);

    // If there are critical alerts, notify via email (once a day)
    const criticalAlerts = alerts.filter(a => a.severity === 'critical');
    if (criticalAlerts.length > 0) {
      const settings = getSMTPSettings();
      const schedule = getAuditSchedule();
      if (settings && schedule && schedule.recipients) {
        const recipients = schedule.recipients.split(',').map((e: string) => e.trim());
        const subject = `[CRITICAL] ${criticalAlerts.length} Licenses Expiring Within 30 Days`;
        const text = `The following licenses are approaching critical expiration:\n\n` + 
          criticalAlerts.map(a => `- ${a.software_name} (ID: ${a.license_id}): Expires in ${a.days_remaining} days`).join('\n') +
          `\n\nPlease log in to the management portal to extend these licenses.`;
        
        for (const email of recipients) {
          await sendEmail(email, subject, text);
        }
      }
    }
  }, 86400000); // Daily check

  // API routes FIRST
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/api/auth/login", async (req, res) => {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    try {
      const user = getUserWithPasswordByEmail(email);
      if (!user) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const isValid = await bcrypt.compare(password, user.password);
      if (!isValid) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      // Update last login
      updateLastLogin(user.id);

      // Remove password before sending back
      const { password: _, ...userWithoutPassword } = user;
      
      logAction(userWithoutPassword as any, "Login", "User", user.id, "User logged in via web interface");
      
      res.json({ user: userWithoutPassword });
    } catch (err) {
      console.error("Login error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/auth/recover-request", async (req, res) => {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    try {
      const user = getUserByEmail(email);
      if (!user) {
        return res.status(404).json({ error: "No user registered with this email address" });
      }

      // Generate a 6-digit PIN
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 mins expiry
      
      saveRecoveryCode(email, code, expiresAt);

      logAction(
        { id: user.id, name: user.name } as any, 
        "Password Recovery Request", 
        "User", 
        user.id, 
        `Password recovery code ${code} generated for ${email}`
      );

      const smtpSettings = getSMTPSettings();
      const subject = "QuantFund Portal - Password Recovery";
      const text = `Hello ${user.name},\n\nWe received a request to recover your password.\nYour account recovery verification code is:\n\n${code}\n\nThis code expires in 15 minutes.\n\nIf you did not request this, please ignore this email and secure your account.\n\nBest regards,\nQuantFund Security Desk`;
      const html = `
        <div style="font-family: sans-serif; max-width: 500px; padding: 20px; border: 1px solid #e4e4e7; border-radius: 8px;">
          <h2 style="color: #10b981; margin-top: 0;">QuantFund Security</h2>
          <p>Hello <strong>${user.name}</strong>,</p>
          <p>We received a request to reset your password. Use the following 6-digit verification code to complete the process:</p>
          <div style="background-color: #f4f4f5; padding: 15px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 4px; border-radius: 6px; margin: 20px 0; color: #0f172a;">
            ${code}
          </div>
          <p style="font-size: 12px; color: #71717a;">This verification code is valid for 15 minutes. If you did not make this request, you can safely ignore this email.</p>
          <hr style="border: 0; border-top: 1px solid #e4e4e7; margin: 20px 0;" />
          <p style="font-size: 11px; color: #a1a1aa; font-style: italic;">QuantFund Security Desk • Enterprise Licensing & Compliance Platform</p>
        </div>
      `;

      let emailSent = false;
      if (smtpSettings) {
        emailSent = await sendEmail(email, subject, text, html);
      }

      res.json({ 
        success: true, 
        email, 
        isSimulated: !emailSent, 
        code // Provide code for easy workspace copy/simulation if SMTP is not fully connected
      });
    } catch (err) {
      console.error("Recovery request error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/auth/recover-verify", async (req, res) => {
    const { email, code, newPassword } = req.body;
    if (!email || !code || !newPassword) {
      return res.status(400).json({ error: "Email, code, and new password are required" });
    }

    try {
      const user = getUserByEmail(email);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const record = getRecoveryCode(email);
      if (!record || record.code !== code) {
        return res.status(400).json({ error: "Invalid verification code" });
      }

      if (new Date() > new Date(record.expires_at)) {
        return res.status(400).json({ error: "Verification code has expired" });
      }

      // Hash the new password
      const passwordHash = await bcrypt.hash(newPassword, 10);
      updateUserPassword(email, passwordHash);
      deleteRecoveryCode(email);

      logAction(
        { id: user.id, name: user.name } as any, 
        "Password Recovery Successful", 
        "User", 
        user.id, 
        `Password successfully recovered and reset for ${email}`
      );

      res.json({ success: true });
    } catch (err) {
      console.error("Recovery verify error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/smtp", (req, res) => {
    const settings = getSMTPSettings();
    if (settings) {
      // Don't send back the password in plain text if possible, but for this app we'll send it for editing
      res.json(settings);
    } else {
      res.json(null);
    }
  });

  app.post("/api/smtp", (req, res) => {
    try {
      updateSMTPSettings(req.body);
      res.json({ success: true, settings: getSMTPSettings() });
    } catch (err) {
      res.status(500).json({ error: "Failed to update SMTP settings" });
    }
  });

  app.get("/api/settings/latency-threshold", (req, res) => {
    const threshold = getSystemConfig("latency_threshold");
    res.json({ threshold: threshold ? parseInt(threshold, 10) : 150 });
  });

  app.post("/api/settings/latency-threshold", (req, res) => {
    try {
      const { threshold, user } = req.body;
      setSystemConfig("latency_threshold", String(threshold));
      io.emit("settings:latency-threshold", { threshold: parseInt(threshold, 10) });

      logAction(user || null, 'update_latency_threshold', 'system_config', 'latency_threshold', `Latency alert threshold updated to ${threshold}ms`);
      io.emit("audit_logs:updated", getAllAuditLogs());

      res.json({ success: true, threshold: parseInt(threshold, 10) });
    } catch (err) {
      res.status(500).json({ error: "Failed to update latency threshold" });
    }
  });

  app.get("/api/system/public-key", (req, res) => {
    res.json({ publicKey });
  });

  app.post("/api/license/:id/sign", (req, res) => {
    try {
      const { id } = req.params;
      const license = getAllLicenses().find(l => l.id === id);
      
      if (!license) return res.status(404).json({ error: "License not found" });
      if (!license.hardware_id) return res.status(400).json({ error: "License must be hardware-locked before signing an offline ticket." });

      const payload = {
        id: license.id,
        key: license.license_key,
        hwid: license.hardware_id,
        expires: license.expires_at,
        issuer: "QuantFund-Auth-v1",
        timestamp: new Date().toISOString()
      };

      const signer = crypto.createSign('SHA256');
      signer.update(JSON.stringify(payload));
      signer.end();
      
      const signature = signer.sign(privateKey as string, 'base64');
      
      res.json({
        payload,
        signature,
        token: Buffer.from(JSON.stringify({ p: payload, s: signature })).toString('base64')
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to generate signed token" });
    }
  });

  app.post("/api/smtp/test", async (req, res) => {
    const { to } = req.body;
    const success = await sendEmail(
      to,
      "SMTP Test Connection",
      "This is a test email from your License Management System. If you are reading this, your SMTP configuration is correct.",
      "<h1>SMTP Test Connection</h1><p>This is a test email from your <b>License Management System</b>. If you are reading this, your SMTP configuration is correct.</p>"
    );

    if (success) {
      res.json({ success: true });
    } else {
      res.status(500).json({ error: "Failed to send test email. Check your SMTP configuration." });
    }
  });

  app.post("/api/license/verify", (req, res) => {
    try {
      let { license_key, hardware_id, ip, asset_class, account_id } = req.body;
      
      // Fallback to request IP if not provided
      if (!ip) {
        ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
      }

      if (!license_key) {
        return res.status(400).json({ valid: false, error: "license_key is required" });
      }

      const license = getLicenseByKey(license_key);
      
      if (!license) {
        return res.status(404).json({ valid: false, error: "License not found" });
      }

      if (license.status !== 'active') {
        logLicenseEvent({
          id: crypto.randomUUID(),
          license_id: license.id,
          event_type: 'verification_failed',
          event_data: JSON.stringify({ reason: `License is ${license.status}`, ip, hardware_id }),
          timestamp: new Date().toISOString()
        });
        return res.status(403).json({ valid: false, error: `License is ${license.status}` });
      }

      // Asset Class Enforcement
      if (license.asset_classes && asset_class) {
        const allowedClasses = JSON.parse(license.asset_classes);
        if (allowedClasses.length > 0 && !allowedClasses.includes(asset_class)) {
          logLicenseEvent({
            id: crypto.randomUUID(),
            license_id: license.id,
            event_type: 'verification_failed',
            event_data: JSON.stringify({ reason: `Unauthorized asset class: ${asset_class}`, ip, hardware_id, transport: 'rest' }),
            timestamp: new Date().toISOString()
          });
          return res.status(403).json({ valid: false, error: `Unauthorized asset class: ${asset_class}` });
        }
      }

      // Restricted Account Enforcement
      if (license.restricted_accounts && account_id) {
        const allowedAccounts = JSON.parse(license.restricted_accounts);
        if (allowedAccounts.length > 0 && !allowedAccounts.includes(account_id)) {
          logLicenseEvent({
            id: crypto.randomUUID(),
            license_id: license.id,
            event_type: 'verification_failed',
            event_data: JSON.stringify({ reason: `Unauthorized account/API key: ${account_id}`, ip, hardware_id, transport: 'rest' }),
            timestamp: new Date().toISOString()
          });
          return res.status(403).json({ valid: false, error: `Unauthorized account ID or API key: ${account_id}` });
        }
      }

      if (new Date(license.expires_at) < new Date()) {
        updateLicenseStatus(license.id, 'expired');
        io.emit("licenses:status_updated", { id: license.id, status: 'expired' });
        
        logLicenseEvent({
          id: crypto.randomUUID(),
          license_id: license.id,
          event_type: 'verification_failed',
          event_data: JSON.stringify({ reason: "License expired", ip, hardware_id }),
          timestamp: new Date().toISOString()
        });
        return res.status(403).json({ valid: false, error: "License expired" });
      }

      // Auto-bind HWID if it's empty
      if (!license.hardware_id && hardware_id) {
        updateLicenseHWID(license.id, hardware_id);
        license.hardware_id = hardware_id; // Update local object for subsequent checks
        io.emit("licenses:updated", { id: license.id, hardware_id });
      } else if (license.hardware_id && hardware_id && license.hardware_id !== hardware_id) {
        logLicenseEvent({
          id: crypto.randomUUID(),
          license_id: license.id,
          event_type: 'verification_failed',
          event_data: JSON.stringify({ reason: "Hardware ID mismatch", hardware_id, provided_hwid: hardware_id, ip }),
          timestamp: new Date().toISOString()
        });
        return res.status(200).json({ valid: true, risk_detected: true, error: "Hardware ID mismatch" });
      }

      if (license.ip_whitelist && ip) {
        const whitelist = license.ip_whitelist.split(',').map((s: string) => s.trim());
        if (whitelist.length > 0 && !whitelist.includes(ip)) {
          logLicenseEvent({
            id: crypto.randomUUID(),
            license_id: license.id,
            event_type: 'verification_failed',
            event_data: JSON.stringify({ reason: "IP not whitelisted", ip, provided_ip: ip, hardware_id }),
            timestamp: new Date().toISOString()
          });
          return res.status(200).json({ valid: true, risk_detected: true, error: "IP not whitelisted" });
        }
      }

      // Update last active IP
      updateLicenseLastActive(license.id, ip);
      io.emit("licenses:updated", { id: license.id, last_active_ip: ip });

      if (license.api_calls_limit > 0 && license.api_calls_count_daily >= license.api_calls_limit) {
        logLicenseEvent({
          id: crypto.randomUUID(),
          license_id: license.id,
          event_type: 'verification_failed',
          event_data: JSON.stringify({ reason: "Daily API call limit exceeded", count: license.api_calls_count_daily, limit: license.api_calls_limit, transport: 'rest' }),
          timestamp: new Date().toISOString()
        });
        return res.status(403).json({ valid: false, error: "Daily API quota exceeded" });
      }

      if (license.api_calls_limit_monthly > 0 && license.api_calls_count_monthly >= license.api_calls_limit_monthly) {
        logLicenseEvent({
          id: crypto.randomUUID(),
          license_id: license.id,
          event_type: 'verification_failed',
          event_data: JSON.stringify({ reason: "Monthly API call limit exceeded", count: license.api_calls_count_monthly, limit: license.api_calls_limit_monthly, transport: 'rest' }),
          timestamp: new Date().toISOString()
        });
        return res.status(403).json({ valid: false, error: "Monthly API quota exceeded" });
      }

      if (license.api_calls_limit_yearly > 0 && license.api_calls_count_yearly >= license.api_calls_limit_yearly) {
        logLicenseEvent({
          id: crypto.randomUUID(),
          license_id: license.id,
          event_type: 'verification_failed',
          event_data: JSON.stringify({ reason: "Yearly API call limit exceeded", count: license.api_calls_count_yearly, limit: license.api_calls_limit_yearly, transport: 'rest' }),
          timestamp: new Date().toISOString()
        });
        return res.status(403).json({ valid: false, error: "Yearly API quota exceeded" });
      }

      // Increment API call
      const updatedCounts = incrementApiCalls(license.id, 1);
      io.emit("licenses:api_calls_updated", { id: license.id, counts: updatedCounts });

      logLicenseEvent({
        id: crypto.randomUUID(),
        license_id: license.id,
        event_type: 'verification_success',
        event_data: JSON.stringify({ ip, hardware_id }),
        timestamp: new Date().toISOString()
      });

      res.json({
        valid: true,
        license: {
          software_name: license.software_name,
          tier: license.tier,
          features: license.features ? JSON.parse(license.features) : [],
          max_volume_usd: license.max_volume_usd,
          api_calls_limit: license.api_calls_limit,
          api_calls_limit_monthly: license.api_calls_limit_monthly,
          api_calls_limit_yearly: license.api_calls_limit_yearly,
          api_calls_count_daily: updatedCounts.daily,
          api_calls_count_monthly: updatedCounts.monthly,
          api_calls_count_yearly: updatedCounts.yearly,
          expires_at: license.expires_at
        }
      });
    } catch (err) {
      console.error("License verification error:", err);
      res.status(500).json({ valid: false, error: "Internal server error" });
    }
  });

  app.post("/api/license/webhook", (req, res) => {
    try {
      const { license_key, event, data } = req.body;
      
      if (!license_key) return res.status(400).json({ error: "Missing license_key" });
      
      const license = getLicenseByKey(license_key);
      if (!license) return res.status(404).json({ error: "License not found" });

      logLicenseEvent({
        id: crypto.randomUUID(),
        license_id: license.id,
        event_type: 'webhook_call',
        event_data: JSON.stringify({ event, ...data }),
        timestamp: new Date().toISOString()
      });

      res.json({ success: true });
    } catch (err) {
      console.error("Webhook error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/license/:id/events", (req, res) => {
    try {
      const { id } = req.params;
      const { getLicenseEvents } = require("./src/db");
      const events = getLicenseEvents(id);
      res.json(events);
    } catch (err) {
      console.error("Events fetch error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/events", (req, res) => {
    try {
      const { getAllEvents } = require("./src/db");
      const events = getAllEvents();
      res.json(events);
    } catch (err) {
      console.error("All events fetch error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/clients", (req, res) => {
    res.json(getAllClients());
  });

  app.post("/api/clients", (req, res) => {
    try {
      const created = createClient(req.body);
      io.emit("clients:created", created);
      res.json(created);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.delete("/api/clients/:id", (req, res) => {
    try {
      deleteClient(req.params.id);
      io.emit("clients:deleted", req.params.id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get("/api/software_products", (req, res) => {
    res.json(getAllSoftwareProducts());
  });

  app.post("/api/software_products", (req, res) => {
    try {
      const created = createSoftwareProduct(req.body);
      io.emit("software_products:created", created);
      res.json(created);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.delete("/api/software_products/:id", (req, res) => {
    try {
      deleteSoftwareProduct(req.params.id);
      io.emit("software_products:deleted", req.params.id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get("/api/license_tiers", (req, res) => {
    res.json(getAllLicenseTiers());
  });

  app.post("/api/license_tiers", (req, res) => {
    try {
      const created = createLicenseTier(req.body);
      io.emit("license_tiers:created", created);
      res.json(created);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.delete("/api/license_tiers/:id", (req, res) => {
    try {
      deleteLicenseTier(req.params.id);
      io.emit("license_tiers:deleted", req.params.id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get("/api/analytics/risk-scores", async (req, res) => {
    try {
      const scores = await calculateDuckDBRiskScores();
      res.json(scores);
    } catch (err) {
      console.error("DuckDB risk-scores API error:", err);
      res.status(500).json({ error: "Analytical service unavailable" });
    }
  });

  app.get("/api/audit-schedule", (req, res) => {
    try {
      res.json(getAuditSchedule());
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post("/api/audit-schedule", (req, res) => {
    try {
      const { enabled, recipients, dispatch_hour, report_scope, next_run_at } = req.body;
      updateAuditSchedule({ enabled, recipients, dispatch_hour, report_scope, next_run_at });
      const updated = getAuditSchedule();
      io.emit("audit_schedule:updated", updated);
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post("/api/audit-schedule/run-simulation", (req, res) => {
    try {
      const { last_run_at, next_run_at } = req.body;
      logAuditRun(last_run_at, next_run_at);
      const updated = getAuditSchedule();
      io.emit("audit_schedule:updated", updated);
      res.json({ success: true, schedule: updated });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get("/api/users", (req, res) => {
    res.json(getAllUsers());
  });

  app.get("/api/audit-logs", (req, res) => {
    res.json(getAllAuditLogs());
  });

  app.post("/api/users", (req, res) => {
    try {
      const created = createUser(req.body);
      io.emit("users:created", created);
      res.json(created);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post("/api/auth/login-sim", (req, res) => {
    // Simulating login by email
    const { email } = req.body;
    const user = getUserByEmail(email);
    if (user) {
      res.json(user);
    } else {
      res.status(401).json({ error: "User not found" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(console.error);
