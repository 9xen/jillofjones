import React, { useState } from 'react';
import { ShieldAlert, RefreshCw, Zap, X } from 'lucide-react';
import { License } from '../types';

interface RiskMitigationModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedLicenses: License[];
  onExecute: (actions: { resetCredentials: boolean; triggerHeartbeat: boolean; toggleSafetyMode: boolean }) => void;
}

export function RiskMitigationModal({ isOpen, onClose, selectedLicenses, onExecute }: RiskMitigationModalProps) {
  const [actions, setActions] = useState({
    resetCredentials: false,
    triggerHeartbeat: false,
    toggleSafetyMode: false,
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 w-full max-w-lg space-y-6">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-rose-500" />
            Risk Mitigation Actions
          </h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        
        <p className="text-sm text-zinc-400">
          Apply emergency tasks to <span className="text-white font-bold">{selectedLicenses.length}</span> selected licenses.
        </p>

        <div className="space-y-3">
          <label className="flex items-center gap-3 p-3 bg-zinc-950 rounded-lg cursor-pointer hover:bg-zinc-800 transition-colors">
            <input type="checkbox" checked={actions.resetCredentials} onChange={e => setActions({...actions, resetCredentials: e.target.checked})} className="rounded border-zinc-700" />
            <div className="flex items-center gap-2 text-sm text-zinc-200">
              <RefreshCw className="w-4 h-4 text-amber-500" />
              Reset Hardware Credentials (HWID)
            </div>
          </label>

          <label className="flex items-center gap-3 p-3 bg-zinc-950 rounded-lg cursor-pointer hover:bg-zinc-800 transition-colors">
            <input type="checkbox" checked={actions.triggerHeartbeat} onChange={e => setActions({...actions, triggerHeartbeat: e.target.checked})} className="rounded border-zinc-700" />
            <div className="flex items-center gap-2 text-sm text-zinc-200">
              <Zap className="w-4 h-4 text-indigo-500" />
              Trigger Immediate Node Heartbeat
            </div>
          </label>
          
          <label className="flex items-center gap-3 p-3 bg-zinc-950 rounded-lg cursor-pointer hover:bg-zinc-800 transition-colors">
            <input type="checkbox" checked={actions.toggleSafetyMode} onChange={e => setActions({...actions, toggleSafetyMode: e.target.checked})} className="rounded border-zinc-700" />
            <div className="flex items-center gap-2 text-sm text-zinc-200">
              <ShieldAlert className="w-4 h-4 text-rose-500" />
              Toggle Safety Mode
            </div>
          </label>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-zinc-800">
          <button onClick={onClose} className="px-4 py-2 text-sm text-zinc-400 hover:text-white">Cancel</button>
          <button onClick={() => onExecute(actions)} className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-sm font-semibold">Execute Mitigation</button>
        </div>
      </div>
    </div>
  );
}
