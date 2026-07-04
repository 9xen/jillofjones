import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Terminal, ShieldAlert, Cpu, Network, Check, Copy, RefreshCw, X } from 'lucide-react';

interface DiagnosticUtilityProps {
  showToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

export function DiagnosticUtility({ showToast }: DiagnosticUtilityProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [probeStatus, setProbeStatus] = useState<'idle' | 'probing' | 'success' | 'failed'>('idle');
  const [probeResult, setProbeResult] = useState<{
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body: string;
    isNetlify: boolean;
    isStaticSPA: boolean;
  } | null>(null);

  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Raw environment parameters safe to display client-side
  const envInfo = {
    "window.location.href": window.location.href,
    "window.location.origin": window.location.origin,
    "import.meta.env.MODE": (import.meta as any).env?.MODE || 'unknown',
    "import.meta.env.BASE_URL": (import.meta as any).env?.BASE_URL || 'unknown',
    "navigator.userAgent": navigator.userAgent,
    "nonaxen_static_mode": localStorage.getItem('nonaxen_static_mode') || 'not active',
  };

  const copyToClipboard = (key: string, value: string) => {
    navigator.clipboard.writeText(value);
    setCopiedKey(key);
    showToast(`Copied ${key} to clipboard`, 'success');
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const runDiagnostics = async () => {
    setProbeStatus('probing');
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 6000);

      const url = '/api/auth/login'; // Probe login endpoint
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'probe@nonaxen.infra', password: 'probe' }),
        signal: controller.signal
      });

      clearTimeout(id);

      // Read response headers
      const headersMap: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headersMap[key] = value;
      });

      const bodyText = await response.text();
      let slicedBody = bodyText;
      if (bodyText.length > 300) {
        slicedBody = bodyText.substring(0, 300) + '... (truncated)';
      }

      const isNetlify = window.location.hostname.includes('netlify.app') || !!headersMap['server']?.toLowerCase().includes('netlify');
      const isStaticSPA = response.status === 404 || bodyText.includes('<!DOCTYPE html>') || bodyText.includes('<div id="root">');

      setProbeResult({
        status: response.status,
        statusText: response.statusText,
        headers: headersMap,
        body: slicedBody,
        isNetlify,
        isStaticSPA
      });
      setProbeStatus(response.status >= 200 && response.status < 400 ? 'success' : 'failed');
    } catch (err: any) {
      console.error("Diagnostic probe failed:", err);
      const isNetlify = window.location.hostname.includes('netlify.app');
      setProbeResult({
        status: 0,
        statusText: err.message || 'Network Error / Aborted',
        headers: { 'X-Error': 'Connection timed out or refused' },
        body: 'Failed to establish connection to Express backend. The endpoint is unreachable.',
        isNetlify,
        isStaticSPA: true
      });
      setProbeStatus('failed');
    }
  };

  useEffect(() => {
    if (isOpen && probeStatus === 'idle') {
      runDiagnostics();
    }
  }, [isOpen]);

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {/* Floating Toggle Trigger Button */}
      <button
        id="diagnostics-toggle-btn"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3.5 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-indigo-400 rounded-xl text-xs font-mono shadow-xl transition-all cursor-pointer"
      >
        <Terminal className="w-3.5 h-3.5" />
        Diagnostics & Environment Panel
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            id="diagnostics-panel"
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="absolute bottom-12 right-0 w-[420px] max-w-[calc(100vw-2rem)] bg-zinc-950/95 backdrop-blur-md border border-zinc-800 rounded-2xl p-5 shadow-2xl text-zinc-300 font-sans"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-zinc-800/60 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-indigo-400" />
                <span className="text-xs font-mono font-bold tracking-wider text-indigo-300 uppercase">
                  Connection Diagnostic Tool
                </span>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="text-zinc-500 hover:text-zinc-400 p-1 hover:bg-zinc-900 rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content Scroll Area */}
            <div className="space-y-4 max-h-[360px] overflow-y-auto pr-1 text-xs font-mono">
              {/* Context Notice */}
              <div className="p-3 bg-zinc-900/50 border border-zinc-800/80 rounded-xl space-y-1.5">
                <div className="flex items-center gap-1.5 text-zinc-400 font-bold">
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
                  Static Deployment Detected
                </div>
                <p className="text-zinc-500 text-[10px] leading-relaxed">
                  You are viewing this on Netlify (<span className="text-indigo-400">{window.location.hostname}</span>). 
                  Because Netlify serves only static assets, the backend Express server is not available on this domain.
                </p>
                <div className="pt-1">
                  <span className="px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-full text-[9px] font-bold">
                    Static Fallback Active
                  </span>
                  <span className="text-zinc-400 text-[9px] ml-2">Use demo passwords directly.</span>
                </div>
              </div>

              {/* Endpoint Probe Result */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-zinc-400 font-bold border-b border-zinc-900 pb-1">
                  <span className="flex items-center gap-1.5">
                    <Network className="w-3.5 h-3.5 text-indigo-400" />
                    API Endpoint Probe
                  </span>
                  <button
                    onClick={runDiagnostics}
                    disabled={probeStatus === 'probing'}
                    className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-indigo-400 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3 h-3 ${probeStatus === 'probing' ? 'animate-spin' : ''}`} />
                    Retest
                  </button>
                </div>

                <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-500">Target URL:</span>
                    <span className="text-zinc-400 font-semibold">/api/auth/login</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-500">Response Status:</span>
                    <span className={`font-bold ${
                      probeResult?.status === 200 ? 'text-emerald-400' :
                      probeResult?.status === 0 ? 'text-rose-500' : 'text-amber-500'
                    }`}>
                      {probeResult ? `${probeResult.status} ${probeResult.statusText}` : 'Testing...'}
                    </span>
                  </div>

                  {probeResult && (
                    <>
                      {/* Response Headers */}
                      <div className="space-y-1 pt-1.5 border-t border-zinc-900">
                        <span className="text-zinc-500 block text-[10px]">Response Headers:</span>
                        <div className="bg-zinc-900/60 p-2 rounded-lg max-h-[80px] overflow-y-auto text-[9px] text-zinc-400 space-y-0.5">
                          {Object.keys(probeResult.headers).length > 0 ? (
                            Object.entries(probeResult.headers).map(([k, v]) => (
                              <div key={k} className="flex justify-between">
                                <span className="text-zinc-600 select-all">{k}:</span>
                                <span className="text-zinc-400 select-all">{v}</span>
                              </div>
                            ))
                          ) : (
                            <div className="text-zinc-600 italic">No headers received</div>
                          )}
                        </div>
                      </div>

                      {/* Response Body Snippet */}
                      <div className="space-y-1">
                        <span className="text-zinc-500 block text-[10px]">Response Body Preview:</span>
                        <pre className="p-2 bg-zinc-900/60 rounded-lg text-[9px] text-zinc-400 overflow-x-auto select-all max-h-[80px]">
                          {probeResult.body || '(Empty Response)'}
                        </pre>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Environment Parameters */}
              <div className="space-y-2">
                <div className="text-zinc-400 font-bold border-b border-zinc-900 pb-1">
                  Environment Context Variables
                </div>
                <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 space-y-2">
                  {Object.entries(envInfo).map(([key, val]) => (
                    <div key={key} className="flex items-start justify-between gap-4 py-0.5">
                      <span className="text-zinc-500 break-all leading-tight">{key}:</span>
                      <div className="flex items-center gap-1.5 text-zinc-400">
                        <span className="break-all text-right max-w-[200px] leading-tight select-all">{val}</span>
                        <button
                          onClick={() => copyToClipboard(key, val)}
                          className="p-1 hover:bg-zinc-900 rounded text-zinc-500 hover:text-indigo-400 transition-colors"
                        >
                          {copiedKey === key ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Quick Action Info */}
            <div className="mt-4 pt-3 border-t border-zinc-800/60 flex items-center justify-between text-[10px] text-zinc-500">
              <span>Nonaxen Safe Diagnostics Shield</span>
              <span>Client-Side Analyzer</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
