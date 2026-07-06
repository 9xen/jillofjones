import React, { useState } from 'react';
import { ShieldCheck, ShieldAlert, Key } from 'lucide-react';
import { validateLicenseKeyFormat } from '../lib/licenseKeyUtils';
import { cn } from '../lib/utils';

export function ValidateKeyView() {
  const [keyInput, setKeyInput] = useState('');
  const [result, setResult] = useState<'idle' | 'valid' | 'invalid'>('idle');

  const handleValidate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyInput.trim()) return;
    
    const isValid = validateLicenseKeyFormat(keyInput.trim().toUpperCase());
    setResult(isValid ? 'valid' : 'invalid');
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto mt-10">
      <div className="bg-zinc-900/30 border border-zinc-800/80 rounded-xl p-8 backdrop-blur-sm">
        <div className="flex flex-col items-center text-center space-y-4 mb-8">
          <div className="w-16 h-16 rounded-full bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
            <Key className="w-8 h-8 text-indigo-400" />
          </div>
          <div>
            <h3 className="text-xl font-medium text-zinc-100">License Key Validation</h3>
            <p className="text-sm text-zinc-400 mt-2">Enter a license key to cryptographically verify its format and checksum.</p>
          </div>
        </div>

        <form onSubmit={handleValidate} className="space-y-4">
          <div>
            <input 
              type="text"
              value={keyInput}
              onChange={(e) => {
                setKeyInput(e.target.value.toUpperCase());
                setResult('idle');
              }}
              placeholder="XXXX-XXXX-XXXX-XXXX"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-4 text-center font-mono text-xl text-zinc-100 focus:outline-none focus:border-indigo-500 transition-colors uppercase tracking-widest placeholder:text-zinc-700"
            />
          </div>
          <button 
            type="submit"
            disabled={!keyInput.trim()}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg px-4 py-3 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Verify Cryptographic Checksum
          </button>
        </form>

        {result !== 'idle' && (
          <div className={cn(
            "mt-6 p-4 rounded-lg border flex items-center gap-4 animate-in fade-in slide-in-from-bottom-2",
            result === 'valid' ? "bg-emerald-500/10 border-emerald-500/20" : "bg-rose-500/10 border-rose-500/20"
          )}>
            {result === 'valid' ? (
              <>
                <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <h4 className="text-emerald-400 font-medium">Valid Key Format</h4>
                  <p className="text-emerald-500/80 text-sm mt-0.5 font-mono">Cryptographic checksum verified successfully.</p>
                </div>
              </>
            ) : (
              <>
                <div className="w-10 h-10 rounded-full bg-rose-500/20 flex items-center justify-center shrink-0">
                  <ShieldAlert className="w-5 h-5 text-rose-400" />
                </div>
                <div>
                  <h4 className="text-rose-400 font-medium">Invalid Key</h4>
                  <p className="text-rose-500/80 text-sm mt-0.5 font-mono">The key failed checksum validation or format requirements.</p>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
