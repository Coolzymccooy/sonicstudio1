import React, { useState } from 'react';
import { X, Mail, Lock, User, ArrowRight, Loader2, AlertCircle } from 'lucide-react';
import { mockBackend } from '../services/mockBackend';
import type { User as UserType } from '../types';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (user: UserType) => void;
}

type AuthMode = 'LOGIN' | 'SIGNUP' | 'RESET';

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onLoginSuccess }) => {
  const [mode, setMode] = useState<AuthMode>('LOGIN');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setSuccessMsg('');

    try {
      if (mode === 'LOGIN') {
        const user = await mockBackend.login(email, password);
        onLoginSuccess(user);
        onClose();
      } else if (mode === 'SIGNUP') {
        const user = await mockBackend.signup(email, password);
        onLoginSuccess(user);
        onClose();
      } else if (mode === 'RESET') {
        await mockBackend.resetPassword(email);
        setSuccessMsg("Password reset link sent to your email.");
        setMode('LOGIN');
      }
    } catch {
      setError("Authentication failed. Please check your credentials.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-gray-900 border border-gray-700 w-full max-w-md rounded-2xl shadow-2xl p-8 relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-white">
          <X size={20} />
        </button>

        <div className="text-center mb-8">
           <div className="inline-block p-3 bg-gradient-to-br from-yellow-400 to-yellow-600 rounded-xl shadow-lg mb-4">
              <User size={32} className="text-black" />
           </div>
           <h2 className="text-2xl font-bold text-white">
             {mode === 'LOGIN' ? 'Welcome Back' : mode === 'SIGNUP' ? 'Create Account' : 'Reset Password'}
           </h2>
           <p className="text-gray-400 text-sm mt-2">
             {mode === 'LOGIN' ? 'Enter your credentials to access your studio.' : mode === 'SIGNUP' ? 'Join Tiwaton to save and master your tracks.' : 'We will send you a recovery link.'}
           </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-900/30 border border-red-800 rounded-lg flex items-center gap-2 text-red-300 text-sm">
             <AlertCircle size={16} /> {error}
          </div>
        )}

        {successMsg && (
          <div className="mb-4 p-3 bg-green-900/30 border border-green-800 rounded-lg flex items-center gap-2 text-green-300 text-sm">
             <AlertCircle size={16} /> {successMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
           <div>
             <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Email Address</label>
             <div className="relative">
                <Mail className="absolute top-3 left-3 text-gray-600" size={18} />
                <input 
                  type="email" 
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full bg-black border border-gray-700 rounded-lg py-3 pl-10 pr-4 text-white focus:ring-2 focus:ring-yellow-500 outline-none"
                  placeholder="name@example.com"
                  required
                />
             </div>
           </div>

           {mode !== 'RESET' && (
             <div>
               <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Password</label>
               <div className="relative">
                  <Lock className="absolute top-3 left-3 text-gray-600" size={18} />
                  <input 
                    type="password" 
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full bg-black border border-gray-700 rounded-lg py-3 pl-10 pr-4 text-white focus:ring-2 focus:ring-yellow-500 outline-none"
                    placeholder="••••••••"
                    required
                  />
               </div>
             </div>
           )}

           <button 
             type="submit" 
             disabled={isLoading}
             className="w-full py-3 bg-gradient-to-r from-yellow-500 to-yellow-600 text-black font-bold rounded-lg hover:brightness-110 transition-all flex items-center justify-center gap-2"
           >
             {isLoading ? <Loader2 className="animate-spin" /> : (
               <>
                 {mode === 'LOGIN' ? 'Sign In' : mode === 'SIGNUP' ? 'Create Account' : 'Send Reset Link'}
                 <ArrowRight size={18} />
               </>
             )}
           </button>
        </form>

        <div className="mt-6 text-center space-y-2">
           {mode === 'LOGIN' && (
             <>
               <p className="text-sm text-gray-400">
                 Don't have an account? <button onClick={() => setMode('SIGNUP')} className="text-yellow-400 hover:underline">Sign up</button>
               </p>
               <button onClick={() => setMode('RESET')} className="text-xs text-gray-500 hover:text-gray-300">Forgot password?</button>
             </>
           )}
           {(mode === 'SIGNUP' || mode === 'RESET') && (
               <p className="text-sm text-gray-400">
                 Already have an account? <button onClick={() => setMode('LOGIN')} className="text-yellow-400 hover:underline">Sign in</button>
               </p>
           )}
        </div>

      </div>
    </div>
  );
};