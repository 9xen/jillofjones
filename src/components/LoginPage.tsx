import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Shield, Mail, Lock, Eye, EyeOff, Loader2, Zap, ArrowLeft, KeyRound, CheckCircle2, AlertTriangle } from 'lucide-react';
import { cn } from '../lib/utils';
import { AppUser } from '../types';

interface LoginPageProps {
  onLogin: (user: AppUser) => void;
  showToast: (msg: string, type: 'success' | 'error') => void;
}

export function LoginPage({ onLogin, showToast }: LoginPageProps) {
  const [mode, setMode] = useState<'login' | 'forgot' | 'verify' | 'success'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Recovery States
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [simulationCode, setSimulationCode] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      showToast('Please enter both email and password', 'error');
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Login failed');
      }

      showToast('Authentication successful', 'success');
      onLogin(data.user);
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRequestRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recoveryEmail) {
      showToast('Please enter your email address', 'error');
      return;
    }

    setIsLoading(true);
    setSimulationCode(null);
    try {
      const res = await fetch('/api/auth/recover-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: recoveryEmail }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to request recovery');
      }

      showToast('Recovery verification code generated', 'success');
      if (data.isSimulated && data.code) {
        setSimulationCode(data.code);
      }
      setMode('verify');
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recoveryCode || !newPassword || !confirmPassword) {
      showToast('Please fill in all recovery fields', 'error');
      return;
    }

    if (newPassword !== confirmPassword) {
      showToast('Passwords do not match', 'error');
      return;
    }

    if (newPassword.length < 6) {
      showToast('Password must be at least 6 characters long', 'error');
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/recover-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email: recoveryEmail, 
          code: recoveryCode, 
          newPassword 
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Verification failed');
      }

      showToast('Password successfully reset', 'success');
      setMode('success');
      setSimulationCode(null);
      // Pre-fill login email for convenience
      setEmail(recoveryEmail);
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background Orbs */}
      <div className="absolute top-0 -left-4 w-72 h-72 bg-emerald-500/10 rounded-full blur-[128px] pointer-events-none" />
      <div className="absolute bottom-0 -right-4 w-72 h-72 bg-indigo-500/10 rounded-full blur-[128px] pointer-events-none" />
      
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md relative z-10"
      >
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-8 backdrop-blur-xl shadow-2xl">
          
          {/* LOGIN MODE */}
          {mode === 'login' && (
            <>
              <div className="flex flex-col items-center mb-8">
                <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-center mb-4 shadow-[0_0_20px_rgba(16,185,129,0.1)]">
                  <Shield className="w-8 h-8 text-emerald-400" />
                </div>
                <h1 className="text-2xl font-bold text-white tracking-tight">QuantFund Portal</h1>
                <p className="text-zinc-500 text-sm mt-2">Enterprise Licensing & Audit Management</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-400 ml-1">Email Address</label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Mail className="h-4 w-4 text-zinc-500 group-focus-within:text-emerald-400 transition-colors" />
                    </div>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="block w-full pl-10 pr-3 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-200 text-sm placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all"
                      placeholder="admin@quantfund.net"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between items-center ml-1">
                    <label className="text-xs font-medium text-zinc-400">Password</label>
                    <button
                      type="button"
                      onClick={() => {
                        setRecoveryEmail(email);
                        setMode('forgot');
                      }}
                      className="text-xs text-indigo-400 hover:text-indigo-300 font-medium transition-colors hover:underline"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Lock className="h-4 w-4 text-zinc-500 group-focus-within:text-emerald-400 transition-colors" />
                    </div>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="block w-full pl-10 pr-10 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-200 text-sm placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all"
                      placeholder="••••••••"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center"
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4 text-zinc-500 hover:text-zinc-400" />
                      ) : (
                        <Eye className="h-4 w-4 text-zinc-500 hover:text-zinc-400" />
                      )}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:hover:bg-emerald-500 text-zinc-950 font-bold py-3 px-4 rounded-xl transition-all shadow-[0_0_15px_rgba(16,185,129,0.2)] flex items-center justify-center gap-2 mt-6 active:scale-[0.98]"
                >
                  {isLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <Zap className="w-4 h-4 fill-current" />
                      Authorize Session
                    </>
                  )}
                </button>
              </form>
            </>
          )}

          {/* REQUEST RECOVERY MODE */}
          {mode === 'forgot' && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-6"
            >
              <div className="flex flex-col items-center">
                <div className="w-16 h-16 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl flex items-center justify-center mb-4 shadow-[0_0_20px_rgba(99,102,241,0.1)]">
                  <KeyRound className="w-8 h-8 text-indigo-400" />
                </div>
                <h2 className="text-xl font-bold text-white">Recover Password</h2>
                <p className="text-zinc-500 text-xs text-center mt-2 px-4">
                  Enter your registered corporate email to receive a 6-digit session security recovery code.
                </p>
              </div>

              <form onSubmit={handleRequestRecovery} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-400 ml-1">Corporate Email</label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Mail className="h-4 w-4 text-zinc-500 group-focus-within:text-indigo-400 transition-colors" />
                    </div>
                    <input
                      type="email"
                      value={recoveryEmail}
                      onChange={(e) => setRecoveryEmail(e.target.value)}
                      className="block w-full pl-10 pr-3 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-200 text-sm placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all"
                      placeholder="e.g. admin@quantfund.net"
                      required
                    />
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setMode('login')}
                    className="flex-1 bg-zinc-950 hover:bg-zinc-900 border border-zinc-800 text-zinc-400 font-bold py-2.5 px-4 rounded-xl transition-all flex items-center justify-center gap-1.5 text-xs"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="flex-[2] bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 text-white font-bold py-2.5 px-4 rounded-xl transition-all shadow-[0_0_15px_rgba(99,102,241,0.2)] flex items-center justify-center gap-1.5 text-xs active:scale-[0.98]"
                  >
                    {isLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      'Send Recovery Code'
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          )}

          {/* VERIFY CODE & RESET PASSWORD MODE */}
          {mode === 'verify' && (
            <motion.div
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-6"
            >
              <div className="flex flex-col items-center">
                <div className="w-16 h-16 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl flex items-center justify-center mb-4 shadow-[0_0_20px_rgba(99,102,241,0.1)]">
                  <Lock className="w-8 h-8 text-indigo-400" />
                </div>
                <h2 className="text-xl font-bold text-white">Enter Security PIN</h2>
                <p className="text-zinc-500 text-xs text-center mt-2 px-4">
                  We've sent a 6-digit verification code to <span className="text-zinc-300 font-mono font-bold">{recoveryEmail}</span>
                </p>
              </div>

              {simulationCode && (
                <div className="bg-indigo-950/40 border border-indigo-800/40 rounded-xl p-3.5 text-xs space-y-1.5 animate-pulse">
                  <div className="flex items-center gap-1.5 text-indigo-400 font-bold uppercase tracking-wider text-[9px] font-mono">
                    <AlertTriangle className="w-3.5 h-3.5" /> Developer Simulation Banner
                  </div>
                  <p className="text-zinc-300">
                    SMTP Relay is currently simulated/not configured. Copy your 6-digit recovery PIN below:
                  </p>
                  <div className="flex items-center justify-between bg-zinc-950 px-3 py-1.5 rounded-lg border border-indigo-900/50">
                    <span className="text-indigo-400 font-mono font-black text-sm tracking-widest">{simulationCode}</span>
                    <button 
                      onClick={() => {
                        setRecoveryCode(simulationCode);
                        showToast('Verification code copied!', 'success');
                      }}
                      className="text-[10px] text-indigo-300 hover:text-indigo-200 underline font-mono font-bold"
                    >
                      Fill Code
                    </button>
                  </div>
                </div>
              )}

              <form onSubmit={handleVerifyRecovery} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-400 ml-1">Verification Code</label>
                  <input
                    type="text"
                    maxLength={6}
                    value={recoveryCode}
                    onChange={(e) => setRecoveryCode(e.target.value.replace(/\D/g, ''))}
                    className="block w-full px-3 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-200 text-sm placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all font-mono tracking-widest text-center text-lg animate-none"
                    placeholder="000000"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-400 ml-1">New Password</label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Lock className="h-4 w-4 text-zinc-500 group-focus-within:text-indigo-400 transition-colors" />
                    </div>
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="block w-full pl-10 pr-10 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-200 text-sm placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all"
                      placeholder="At least 6 characters"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center"
                    >
                      {showNewPassword ? (
                        <EyeOff className="h-4 w-4 text-zinc-500 hover:text-zinc-400" />
                      ) : (
                        <Eye className="h-4 w-4 text-zinc-500 hover:text-zinc-400" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-400 ml-1">Confirm New Password</label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Lock className="h-4 w-4 text-zinc-500 group-focus-within:text-indigo-400 transition-colors" />
                    </div>
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="block w-full pl-10 pr-10 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-200 text-sm placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all"
                      placeholder="Confirm password"
                      required
                    />
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setMode('forgot');
                      setSimulationCode(null);
                    }}
                    className="flex-1 bg-zinc-950 hover:bg-zinc-900 border border-zinc-800 text-zinc-400 font-bold py-2.5 px-4 rounded-xl transition-all flex items-center justify-center gap-1.5 text-xs"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="flex-[2] bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 text-white font-bold py-2.5 px-4 rounded-xl transition-all shadow-[0_0_15px_rgba(99,102,241,0.2)] flex items-center justify-center gap-1.5 text-xs active:scale-[0.98]"
                  >
                    {isLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      'Reset Password'
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          )}

          {/* SUCCESS MODE */}
          {mode === 'success' && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-6 text-center py-4"
            >
              <div className="flex flex-col items-center">
                <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center mb-4 shadow-[0_0_20px_rgba(16,185,129,0.15)]">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                </div>
                <h2 className="text-xl font-bold text-white">Password Updated</h2>
                <p className="text-zinc-500 text-xs mt-2 px-4">
                  Your security credentials have been successfully updated. You may now authorize a new secure login session.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setMode('login')}
                className="w-full bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold py-3 px-4 rounded-xl transition-all shadow-[0_0_15px_rgba(16,185,129,0.2)] flex items-center justify-center gap-2 mt-4 text-sm font-bold active:scale-[0.98]"
              >
                Back to Secure Login
              </button>
            </motion.div>
          )}

          <div className="mt-8 pt-8 border-t border-zinc-800/50">
            <div className="flex items-center gap-3 bg-zinc-950/50 border border-zinc-800 rounded-xl p-3">
              <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center">
                <Shield className="w-4 h-4 text-indigo-400" />
              </div>
              <div className="text-[10px] text-zinc-500">
                <span className="text-zinc-400 font-bold">RSA Protected</span>
                <p>This session is encrypted with 2048-bit system keys.</p>
              </div>
            </div>
          </div>
        </div>
        
        <p className="text-center text-zinc-600 text-[10px] mt-6 font-mono tracking-widest uppercase">
          QuantFund Security Infrastructure v4.2.0
        </p>
      </motion.div>
    </div>
  );
}
