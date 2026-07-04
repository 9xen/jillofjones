const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const autoPauseState = `
  const [autoPauseEnabled, setAutoPauseEnabled] = useState(false);
  const [isSavingAutoPause, setIsSavingAutoPause] = useState(false);

  useEffect(() => {
    fetch('/api/settings/auto-pause')
      .then(res => res.json())
      .then(data => setAutoPauseEnabled(data.enabled))
      .catch(err => console.error('Failed to fetch auto-pause setting', err));
  }, []);

  const handleToggleAutoPause = async () => {
    setIsSavingAutoPause(true);
    const newValue = !autoPauseEnabled;
    try {
      const res = await fetch('/api/settings/auto-pause', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: newValue, user: currentUser })
      });
      if (res.ok) {
        setAutoPauseEnabled(newValue);
        showToast(\`Auto-Pause \${newValue ? 'enabled' : 'disabled'} successfully\`, 'success');
      } else {
        throw new Error('Failed to save');
      }
    } catch (err) {
      showToast('Error saving auto-pause setting', 'error');
    } finally {
      setIsSavingAutoPause(false);
    }
  };
`;

code = code.replace(
  "  const [isSavingLatency, setIsSavingLatency] = useState(false);",
  "  const [isSavingLatency, setIsSavingLatency] = useState(false);\n" + autoPauseState
);

fs.writeFileSync('src/App.tsx', code);
