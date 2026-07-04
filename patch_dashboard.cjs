const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const dashboardTop = `
  const [showPredictiveRisk, setShowPredictiveRisk] = useState(false);
  const predictiveRiskLicenses = licenses.filter(l => {
    const risk = riskScores[l.id]?.risk_score || 0;
    const isExpiringSoon = (new Date(l.expires_at).getTime() - new Date().getTime()) / (1000 * 3600 * 24) <= 30;
    return l.status === 'active' && (risk >= 60 || isExpiringSoon);
  });
`;

code = code.replace(
  '  const riskDistribution = [',
  dashboardTop + '\n  const riskDistribution = ['
);

const toggleHtml = `
      {/* Predictive Risk Toggle */}
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
          className={cn("px-4 py-2 rounded-lg text-sm font-medium transition-colors border", 
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
`;

code = code.replace(
  '{/* Database Diagnostic Card */}',
  toggleHtml + '\n      {/* Database Diagnostic Card */}'
);

fs.writeFileSync('src/App.tsx', code);
