const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const notifyCode = `
export async function notifyUsers(event: string, subject: string, text: string) {
  const users = getAllUsers();
  const settings = getSMTPSettings();
  if (!settings || !settings.host) return;

  for (const user of users) {
    if (!user.notification_preferences) continue;
    try {
      const prefs = JSON.parse(user.notification_preferences);
      if (prefs[event]) {
        await sendEmail(user.email, subject, text);
      }
    } catch(e) {}
  }
}
`;

code = code.replace(
  'async function sendEmail(',
  notifyCode + '\nasync function sendEmail('
);

// Inject into license renewals and new license assignments
code = code.replace(
  "io.emit('licenses:update', newLicense);",
  "io.emit('licenses:update', newLicense);\n      notifyUsers('assignments', 'New License Assigned', `A new license has been assigned for ${newLicense.software_name}.`);"
);
code = code.replace(
  "io.emit('licenses:update', updatedLicense);",
  "io.emit('licenses:update', updatedLicense);\n        notifyUsers('renewals', 'License Renewed/Extended', `License ${updatedLicense.id} for ${updatedLicense.software_name} has been extended.`);"
);

// We need to also hook into the cron job for expirations
code = code.replace(
  "const criticalAlerts = alerts.filter(a => a.severity === 'critical');",
  "const criticalAlerts = alerts.filter(a => a.severity === 'critical');\n    const warningAlerts = alerts.filter(a => a.severity === 'warning');\n\n    if (criticalAlerts.length > 0 || warningAlerts.length > 0) {\n      const expText = [...criticalAlerts, ...warningAlerts].map(a => `- ${a.software_name}: Expires in ${a.days_remaining} days`).join('\\n');\n      notifyUsers('expirations', 'Upcoming License Expirations', `The following licenses are expiring soon:\\n\\n${expText}`);\n    }"
);

fs.writeFileSync('server.ts', code);
