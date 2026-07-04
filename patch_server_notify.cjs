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
  'const sendEmail = async (',
  notifyCode + '\n  const sendEmail = async ('
);

fs.writeFileSync('server.ts', code);
