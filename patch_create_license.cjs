const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

code = code.replace(
  'function CreateLicenseModal({ \n  isOpen, \n  onClose, \n  onCreate,\n  clients,\n  softwareProducts,\n  licenseTiers\n}: { \n  isOpen: boolean, \n  onClose: () => void, \n  onCreate: (data: Partial<License>) => void,\n  clients: Client[],\n  softwareProducts: SoftwareProduct[],\n  licenseTiers: LicenseTier[]\n}) {',
  'function CreateLicenseModal({ \n  isOpen, \n  onClose, \n  onCreate,\n  clients,\n  softwareProducts,\n  licenseTiers,\n  editingLicense\n}: { \n  isOpen: boolean, \n  onClose: () => void, \n  onCreate: (data: Partial<License>) => void,\n  clients: Client[],\n  softwareProducts: SoftwareProduct[],\n  licenseTiers: LicenseTier[],\n  editingLicense?: License | null\n}) {'
);

code = code.replace(
  '  useEffect(() => {\n    if (isOpen) {\n      setFormData({\n        issued_to: clients[0]?.name || \\\'\\\',\n        software_name: softwareProducts[0]?.name || \\\'QuantMaster HFT\\\',\n        tier: licenseTiers[0]?.name || \\\'Professional\\\',\n        billing_cycle: \\\'onetime\\\'\n      });\n    }\n  }, [isOpen, clients, softwareProducts, licenseTiers]);',
  `  useEffect(() => {
    if (isOpen) {
      if (editingLicense) {
        setFormData({
          issued_to: editingLicense.issued_to,
          software_name: editingLicense.software_name,
          tier: editingLicense.tier,
          billing_cycle: (editingLicense.billing_cycle || 'onetime') as any
        });
      } else {
        setFormData({
          issued_to: clients[0]?.name || '',
          software_name: softwareProducts[0]?.name || 'QuantMaster HFT',
          tier: licenseTiers[0]?.name || 'Professional',
          billing_cycle: 'onetime'
        });
      }
    }
  }, [isOpen, clients, softwareProducts, licenseTiers, editingLicense]);`
);

code = code.replace(
  '<h3 className="text-zinc-100 font-medium text-sm">Provision New License</h3>',
  '<h3 className="text-zinc-100 font-medium text-sm">{editingLicense ? \'Edit License\' : \'Provision New License\'}</h3>'
);

code = code.replace(
  '<button \n            onClick={() => {\n              onCreate(formData);\n              onClose();\n            }}\n            className="bg-indigo-500 hover:bg-indigo-400 text-zinc-950 px-6 py-2 rounded-lg text-xs font-bold transition-all"\n          >\n            Provision Key\n          </button>',
  `<button 
            onClick={() => {
              onCreate(formData);
              onClose();
            }}
            className="bg-indigo-500 hover:bg-indigo-400 text-zinc-950 px-6 py-2 rounded-lg text-xs font-bold transition-all"
          >
            {editingLicense ? 'Save Changes' : 'Provision Key'}
          </button>`
);

fs.writeFileSync('src/App.tsx', code);
