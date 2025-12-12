import React, { useState } from 'react';
import { ArrowRight, Mic2, Music4, Zap, Layers, Play, CheckCircle, Clock, Radio } from 'lucide-react';
import { mockBackend } from '../services/mockBackend';

interface LandingPageProps {
  onEnter: () => void;
  onOpenAuth: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onEnter, onOpenAuth }) => {
  const [hoveredCard, setHoveredCard] = useState<number | null>(null);
  const [waitlistEmail, setWaitlistEmail] = useState('');
  const [waitlistStatus, setWaitlistStatus] = useState<'IDLE'|'LOADING'|'SUCCESS'>('IDLE');

  const handleJoinWaitlist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!waitlistEmail) return;
    setWaitlistStatus('LOADING');
    await mockBackend.joinWaitlist(waitlistEmail);
    setWaitlistStatus('SUCCESS');
    setWaitlistEmail('');
  };

  // Feature Data
  const features = [
    {
      title: "HyperGate™ Noise Killer",
      desc: "Our proprietary AI noise gate silences background chaos instantly. Record studio-quality vocals in a noisy room without expensive treatment.",
      icon: <Mic2 size={24} className="text-yellow-400" />
    },
    {
      title: "Generative Beat Engine",
      desc: "Stuck? Ask Gemini AI to 'Make a Trap beat'. It generates editable 16-step patterns for drums, bass, and synth instantly.",
      icon: <Zap size={24} className="text-purple-400" />
    },
    {
      title: "Sampler & Mastering",
      desc: "Drag and drop your recordings. Trim loops, layer FX, and use our One-Click Master to get streaming-ready loudness.",
      icon: <Layers size={24} className="text-blue-400" />
    },
    {
      title: "Stream Studio",
      desc: "Go live with studio-quality audio and cinematic video filters. Connects seamlessly to OBS for pro-level broadcasting.",
      icon: <Radio size={24} className="text-red-500" />
    }
  ];

  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans overflow-x-hidden selection:bg-yellow-500/30">
      
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 px-6 py-4 flex justify-between items-center bg-black/50 backdrop-blur-md border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-yellow-400 to-yellow-700 rounded-lg flex items-center justify-center font-brand font-bold text-2xl text-black shadow-lg shadow-yellow-500/20">
            T
          </div>
          <span className="font-brand font-bold text-xl tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-yellow-200 to-yellow-600">
            TIWATON
          </span>
        </div>
        <div className="flex gap-4">
           <button 
             onClick={onOpenAuth}
             className="px-6 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full font-semibold transition-all text-sm backdrop-blur-md"
           >
             Sign In / Account
           </button>
           <button 
             onClick={onEnter}
             className="px-6 py-2 bg-yellow-600 hover:bg-yellow-500 text-black rounded-full font-bold transition-all text-sm shadow-lg shadow-yellow-900/40"
           >
             Launch Demo
           </button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative min-h-screen flex flex-col items-center justify-center text-center px-4 pt-20">
        
        {/* Background Effects */}
        <div className="absolute inset-0 pointer-events-none opacity-40">
           <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-600/30 rounded-full blur-[100px] animate-pulse"></div>
           <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-yellow-600/20 rounded-full blur-[120px] animate-pulse" style={{animationDuration: '4s'}}></div>
        </div>

        <div className="relative z-10 max-w-4xl mx-auto space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs font-bold text-yellow-400 uppercase tracking-widest mb-4">
            <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse"></span>
            Accepting Early Access
          </div>

          <h1 className="font-brand text-5xl md:text-8xl font-bold leading-tight">
            The AI-Native Studio <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-yellow-500 to-yellow-200">
              For Creators.
            </span>
          </h1>
          
          <p className="text-lg md:text-xl text-gray-400 max-w-2xl mx-auto font-light leading-relaxed">
            Record, Produce, and Master in the browser. <strong className="text-white">Tiwaton</strong> combines a simple "Grade 1" interface for beginners with a "Pro Mode" DAW for power users.
          </p>

          <div className="flex flex-col md:flex-row gap-4 justify-center mt-8">
            <button 
              onClick={onEnter}
              className="group relative px-8 py-4 bg-gradient-to-r from-yellow-500 to-yellow-700 rounded-full text-black font-bold text-lg shadow-[0_0_40px_rgba(234,179,8,0.4)] hover:shadow-[0_0_60px_rgba(234,179,8,0.6)] hover:scale-105 transition-all duration-300 flex items-center justify-center gap-3 overflow-hidden"
            >
              <span className="relative z-10">TRY IT NOW (LOCAL)</span>
              <ArrowRight className="relative z-10 group-hover:translate-x-1 transition-transform" />
              <div className="absolute inset-0 bg-white/30 skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-700"></div>
            </button>
            
            <button 
               onClick={() => document.getElementById('waitlist')?.scrollIntoView({behavior: 'smooth'})}
               className="px-8 py-4 bg-white/5 hover:bg-white/10 border border-white/20 rounded-full font-bold text-lg transition-all"
            >
               Join Waitlist
            </button>
          </div>
        </div>

      </section>

      {/* Feature Grid */}
      <section className="py-32 px-6 bg-[#0a0a0a] relative border-t border-white/5">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
             <h2 className="font-brand text-4xl mb-4 text-gray-200">What We Do</h2>
             <p className="text-gray-500">A complete audio ecosystem in your browser.</p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feat, idx) => (
              <div
                key={idx}
                className="p-8 rounded-3xl bg-[#121212] border border-white/5 shadow-2xl hover:border-yellow-500/30 hover:-translate-y-2 transition-all duration-300 flex flex-col"
              >
                <div className="mb-6 p-4 bg-white/5 rounded-2xl w-fit backdrop-blur-sm border border-white/5">
                   {feat.icon}
                </div>
                <h3 className="text-xl font-bold mb-4 text-white">{feat.title}</h3>
                <p className="text-sm text-gray-400 leading-relaxed">{feat.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Waitlist Section */}
      <section id="waitlist" className="py-24 px-6 bg-gradient-to-b from-[#0a0a0a] to-[#111] border-t border-white/5">
         <div className="max-w-3xl mx-auto text-center space-y-8 bg-gray-900/50 p-12 rounded-[3rem] border border-white/5 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-yellow-500 to-transparent"></div>
            
            <h2 className="font-brand text-4xl font-bold text-white">Join the Waitlist</h2>
            <p className="text-gray-400">
               Be the first to get access to cloud storage, collaboration features, and the mobile app.
            </p>

            {waitlistStatus === 'SUCCESS' ? (
               <div className="bg-green-900/30 text-green-400 p-4 rounded-xl flex items-center justify-center gap-2 border border-green-800">
                  <CheckCircle /> You are on the list! We'll be in touch.
               </div>
            ) : (
               <form onSubmit={handleJoinWaitlist} className="flex flex-col md:flex-row gap-4 max-w-md mx-auto">
                  <input 
                     type="email" 
                     placeholder="Enter your email" 
                     value={waitlistEmail}
                     onChange={(e) => setWaitlistEmail(e.target.value)}
                     required
                     className="flex-1 bg-black border border-gray-700 rounded-full px-6 py-4 text-white focus:ring-2 focus:ring-yellow-500 outline-none"
                  />
                  <button 
                     type="submit" 
                     disabled={waitlistStatus === 'LOADING'}
                     className="bg-white text-black font-bold rounded-full px-8 py-4 hover:bg-gray-200 transition-colors disabled:opacity-50"
                  >
                     {waitlistStatus === 'LOADING' ? 'Joining...' : 'Join Now'}
                  </button>
               </form>
            )}

            <div className="flex items-center justify-center gap-6 pt-8 opacity-50">
               <div className="flex items-center gap-2 text-xs text-gray-400">
                  <Clock size={14} /> Early Access 2025
               </div>
               <div className="flex items-center gap-2 text-xs text-gray-400">
                  <CheckCircle size={14} /> No Credit Card Required
               </div>
            </div>
         </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 border-t border-white/10 text-center bg-black">
        <div className="font-brand text-2xl font-bold text-yellow-600 mb-4">TIWATON</div>
        <p className="text-gray-600 text-sm">© 2025 Tiwaton Sonic Studio Pro. All rights reserved.</p>
      </footer>

    </div>
  );
};