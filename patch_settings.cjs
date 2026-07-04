const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const notifState = `
  const [notificationPrefs, setNotificationPrefs] = useState({ expirations: true, renewals: true, assignments: true });
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
      const res = await fetch(\`/api/users/\${currentUser.id}/preferences\`, {
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
`;

code = code.replace(
  'const handleSaveLatencyThreshold = async () => {',
  notifState + '\n  const handleSaveLatencyThreshold = async () => {'
);

const uiCode = `
      {/* Notification Preferences Section */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-3 text-zinc-100 font-medium">
            <Bell className="w-5 h-5 text-indigo-400" />
            My Notification Preferences
          </div>
        </div>
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-zinc-200">Upcoming Expirations</div>
              <div className="text-xs text-zinc-500">Receive alerts for licenses expiring soon (30, 15, 7 days)</div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" checked={notificationPrefs.expirations} onChange={e => setNotificationPrefs({...notificationPrefs, expirations: e.target.checked})} className="sr-only peer" />
              <div className="w-9 h-5 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-500"></div>
            </label>
          </div>
          
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-zinc-200">License Renewals</div>
              <div className="text-xs text-zinc-500">Get notified when a license is renewed or extended</div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" checked={notificationPrefs.renewals} onChange={e => setNotificationPrefs({...notificationPrefs, renewals: e.target.checked})} className="sr-only peer" />
              <div className="w-9 h-5 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-500"></div>
            </label>
          </div>
          
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-zinc-200">New Assignments</div>
              <div className="text-xs text-zinc-500">Receive an email when a new license is assigned</div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" checked={notificationPrefs.assignments} onChange={e => setNotificationPrefs({...notificationPrefs, assignments: e.target.checked})} className="sr-only peer" />
              <div className="w-9 h-5 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-500"></div>
            </label>
          </div>

          <div className="pt-4 border-t border-zinc-800 flex justify-end">
            <button 
              onClick={handleSavePrefs} 
              disabled={isSavingPrefs}
              className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              {isSavingPrefs ? 'Saving...' : 'Save Preferences'}
            </button>
          </div>
        </div>
      </div>
`;

code = code.replace(
  '{/* Audit Log Engine Settings */}',
  uiCode + '\n\n      {/* Audit Log Engine Settings */}'
);

fs.writeFileSync('src/App.tsx', code);
