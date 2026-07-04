const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const autoPauseApi = `
  app.get("/api/settings/auto-pause", (req, res) => {
    const enabled = getSystemConfig("auto_pause_enabled");
    res.json({ enabled: enabled === "true" });
  });

  app.post("/api/settings/auto-pause", (req, res) => {
    try {
      const { enabled, user } = req.body;
      setSystemConfig("auto_pause_enabled", enabled ? "true" : "false");
      io.emit("settings:auto-pause", { enabled });

      logAction(user || null, 'update_auto_pause', 'system_config', 'auto_pause_enabled', \`Auto-Pause feature \${enabled ? 'enabled' : 'disabled'}\`);
      
      res.json({ success: true, enabled });
    } catch (err) {
      console.error("Error setting auto-pause:", err);
      res.status(500).json({ error: "Failed to update setting" });
    }
  });

  // Auto-pause background task
  setInterval(async () => {
    try {
      const autoPause = getSystemConfig("auto_pause_enabled") === "true";
      if (!autoPause) return;

      const scores = await calculateDuckDBRiskScores();
      const licenses = getAllLicenses();

      for (const license of licenses) {
        if (license.status === 'active') {
          const scoreData = scores[license.id];
          if (scoreData && scoreData.risk_score > 90) {
            updateLicenseStatus(license.id, 'suspended');
            io.emit("licenses:status_updated", { id: license.id, status: 'suspended' });
            
            // Log the action
            logLicenseEvent({
              id: crypto.randomUUID(),
              license_id: license.id,
              event_type: 'auto_suspended',
              event_data: JSON.stringify({ reason: \`Risk score exceeded 90 (\${scoreData.risk_score})\` }),
              timestamp: new Date().toISOString()
            });

            logAction(null, 'auto_suspend', 'license', license.id, \`License auto-suspended due to risk score \${scoreData.risk_score} > 90\`);
            io.emit("audit_logs:updated", getAllAuditLogs());
          }
        }
      }
    } catch (err) {
      console.error("Auto-pause evaluation error:", err);
    }
  }, 10000);
`;

code = code.replace(
  '  app.get("/api/settings/latency-threshold", (req, res) => {',
  autoPauseApi + '\n  app.get("/api/settings/latency-threshold", (req, res) => {'
);

fs.writeFileSync('server.ts', code);
