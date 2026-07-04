const fs = require('fs');
let code = fs.readFileSync('src/components/LoginPage.tsx', 'utf8');

const demoCreds = `
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 mb-4 text-xs">
                <p className="text-zinc-400 font-semibold mb-1">Demo Credentials:</p>
                <div className="flex justify-between items-center mt-1">
                  <span className="text-zinc-300">admin@nonaxen.infra</span>
                  <span className="text-zinc-500">admin123</span>
                </div>
                <div className="flex justify-between items-center mt-1">
                  <span className="text-zinc-300">manager@nonaxen.infra</span>
                  <span className="text-zinc-500">manager123</span>
                </div>
                <div className="flex justify-between items-center mt-1">
                  <span className="text-zinc-300">auditor@nonaxen.infra</span>
                  <span className="text-zinc-500">auditor123</span>
                </div>
              </div>
`;

code = code.replace(
  '              <form onSubmit={handleSubmit} className="space-y-4">',
  demoCreds + '\n              <form onSubmit={handleSubmit} className="space-y-4">'
);

fs.writeFileSync('src/components/LoginPage.tsx', code);
