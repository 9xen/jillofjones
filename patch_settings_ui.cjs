const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const autoPauseUI = `
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
                className={\`relative inline-flex h-6 w-11 items-center rounded-full transition-colors \${autoPauseEnabled ? 'bg-indigo-500' : 'bg-zinc-700'} \${isSavingAutoPause ? 'opacity-50' : ''}\`}
              >
                <span className={\`inline-block h-4 w-4 transform rounded-full bg-white transition-transform \${autoPauseEnabled ? 'translate-x-6' : 'translate-x-1'}\`} />
              </button>
            </div>
          </div>
`;

code = code.replace(
  "          </button>\n        </div>\n      </div>\n\n      {/* General Settings Card */}",
  "          </button>\n" + autoPauseUI + "        </div>\n      </div>\n\n      {/* General Settings Card */}"
);

fs.writeFileSync('src/App.tsx', code);
