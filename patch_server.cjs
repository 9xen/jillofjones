const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace(
  'import { License, AppUser, AuditLog }',
  'import { updateUserPreferences } from "./src/db";\nimport { License, AppUser, AuditLog }'
);

const userPrefRoute = `
  app.put("/api/users/:id/preferences", (req, res) => {
    try {
      const updatedUser = updateUserPreferences(req.params.id, JSON.stringify(req.body));
      res.json(updatedUser);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });
`;

code = code.replace(
  'app.delete("/api/users/:id",',
  userPrefRoute + '\n  app.delete("/api/users/:id",'
);

fs.writeFileSync('server.ts', code);
