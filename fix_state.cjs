const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

code = code.replace(
  "  const [formData, setFormData] = useState({ name: '', description: '', base_price: 5000 });\n  const handleSubmit = () => {",
  "  const [editingProduct, setEditingProduct] = useState<SoftwareProduct | null>(null);\n  const [formData, setFormData] = useState({ name: '', description: '', version: '', base_price: 5000 });\n  const handleSubmit = () => {"
);

code = code.replace(
  "  const [formData, setFormData] = useState({ name: '', description: '', max_volume_usd: 10000000, api_calls_limit: 10000 });\n  const handleSubmit = () => {",
  "  const [editingTier, setEditingTier] = useState<LicenseTier | null>(null);\n  const [formData, setFormData] = useState({ name: '', description: '', max_volume_usd: 10000000, api_calls_limit: 10000, api_calls_limit_monthly: 300000, api_calls_limit_yearly: 3600000 });\n  const handleSubmit = () => {"
);

fs.writeFileSync('src/App.tsx', code);
