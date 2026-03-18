import React, { useState } from 'react';
import type { Track } from '../types';
import { Sliders, Activity, Cpu, Play, Power } from 'lucide-react';
import { Visualizer } from './Visualizer';

interface ProModeProps {
  bpm: number;
  onSetBpm: (newBpm: number) => void;
  tracks: Track[];
  isPlaying: boolean;
  onUpdateVol: (trackId: string, vol: number) => void;
  onUpdateTracks: (tracks: Track[]) => void;
}

export const ProMode: React.FC<ProModeProps> = ({
  bpm,
  onSetBpm,
  tracks,
  isPlaying,
  onUpdateVol,
  onUpdateTracks
}) => {
  const [aiMasterEnabled, setAiMasterEnabled] = useState(true);

  const toggleTrackEffect = (trackId: string, effectName: string) => {
    const newTracks = tracks.map(t => {
       if (t.id === trackId) {
          const hasEffect = t.effects.includes(effectName);
          const newEffects = hasEffect 
             ? t.effects.filter(e => e !== effectName) 
             : [...t.effects, effectName];
          return { ...t, effects: newEffects };
       }
       return t;
    });
    onUpdateTracks(newTracks);
  };

  return (
    <div className="h-full flex flex-col bg-[#121214] text-gray-300 font-sans select-none">
      
      {/* Pro Toolbar / Status Bar */}
      <div className="h-12 border-b border-gray-800 bg-[#0a0a0a] flex items-center justify-between px-4 shadow-md z-10">
        <div className="flex items-center gap-3 text-[11px] font-mono tracking-wide">
          <div className="flex items-center gap-2 text-emerald-500">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>AI ENGINE: ONLINE</span>
          </div>
          <div className="flex items-center gap-2 text-blue-400">
            <Activity size={12} />
            <span>LATENCY: 4.2ms</span>
          </div>
          <div className="flex items-center gap-2 text-purple-400">
            <Cpu size={12} />
            <span>CPU: 12%</span>
          </div>
          <div className="flex items-center gap-2 bg-slate-800 rounded-full px-2 py-1 text-[10px]">
            <span className="font-bold text-sky-300">BPM</span>
            <input
              type="range"
              min="60"
              max="220"
              step="1"
              value={bpm}
              onChange={(e) => onSetBpm(Number(e.target.value))}
              className="w-24 accent-cyan-400"
            />
            <span className="font-bold text-white">{bpm}</span>
          </div>
        </div>
        <div className="text-[10px] font-bold uppercase tracking-widest text-gray-300">Pro DAW Console</div>
      </div>
      
      <div className="flex-1 flex overflow-x-auto overflow-y-hidden p-4 gap-3 bg-[#18181b]">
        
        {/* Track Channels */}
        {tracks.map((track) => (
          <div 
            key={track.id} 
            className="w-36 flex-shrink-0 flex flex-col rounded-sm bg-[#27272a] shadow-xl border border-gray-800"
          >
            
            {/* 1. Track Header */}
            <div className={`
              h-8 flex items-center px-3 gap-2 font-bold text-xs tracking-tight text-white shadow-sm
              bg-gradient-to-r from-${track.color}-600 to-${track.color}-800
            `}>
              <div className="w-2 h-2 rounded-full bg-white/50" />
              {track.name.toUpperCase()}
            </div>

            {/* 2. Clip Slots (Ableton Style) */}
            <div className="flex-none p-1.5 space-y-1 bg-[#202023] border-b border-black">
              {[1, 2, 3, 4].map((slot) => (
                 <div 
                   key={slot} 
                   className={`
                     h-10 w-full rounded-[2px] flex items-center justify-center relative group transition-all duration-100
                     ${slot === 1 
                       ? `bg-${track.color}-900/30 border-l-4 border-${track.color}-500` 
                       : 'bg-[#2a2a2e] hover:bg-[#323236] border-l-4 border-transparent'}
                   `}
                 >
                   {slot === 1 ? (
                      // Pattern Mini-View
                      <div className="w-full h-full flex items-center justify-between px-2 cursor-pointer">
                         <div className="flex gap-[1px] h-3 w-16 opacity-80">
                            {track.steps.map((s, i) => (
                               <div 
                                 key={i} 
                                 className={`flex-1 rounded-[1px] ${s.active ? `bg-${track.color}-400` : 'bg-gray-700/50'}`}
                               />
                            ))}
                         </div>
                         <Play size={10} className={`text-${track.color}-400 fill-current opacity-0 group-hover:opacity-100 transition-opacity`} />
                      </div>
                   ) : (
                     <div className="opacity-0 group-hover:opacity-20 text-[9px] uppercase font-bold tracking-widest">Stop</div>
                   )}
                 </div>
              ))}
            </div>

            {/* 3. AI FX Rack (Insert) */}
            <div className="px-2 py-3 bg-[#1c1c1f] border-b border-black flex flex-col gap-2">
              <div className="flex items-center justify-between text-[9px] text-gray-500 font-bold uppercase">
                <span>AI Inserts</span>
                <Power size={10} className="text-green-500" />
              </div>
              
              <div className="bg-black/40 rounded border border-gray-800 p-1.5 flex flex-wrap gap-1.5 min-h-[40px]">
                 {track.type === 'VOCAL' ? (
                    <>
                      <button 
                        onClick={() => toggleTrackEffect(track.id, 'AutoTune')}
                        title="Pitch Correction: Corrects off-key notes in real-time."
                        className={`flex items-center gap-1 px-1.5 py-0.5 rounded-[2px] border text-[9px] transition-all cursor-pointer ${track.effects.includes('AutoTune') ? 'bg-purple-900/40 border-purple-500/30 text-purple-200 shadow-[0_0_10px_rgba(168,85,247,0.1)]' : 'bg-gray-800 border-gray-700 text-gray-500'}`}
                      >
                        <Activity size={8} /> AutoTune
                      </button>
                      
                      <button 
                        onClick={() => toggleTrackEffect(track.id, 'DeNoise')}
                        title="HyperGate DeNoise: Cleans background noise using AI polish."
                        className={`flex items-center gap-1 px-1.5 py-0.5 rounded-[2px] border text-[9px] transition-all cursor-pointer ${track.effects.includes('DeNoise') ? 'bg-blue-900/40 border-blue-500/30 text-blue-200 shadow-[0_0_10px_rgba(59,130,246,0.1)]' : 'bg-gray-800 border-gray-700 text-gray-500'}`}
                      >
                         DeNoise
                      </button>
                    </>
                 ) : (
                    <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-[2px] bg-emerald-900/40 border border-emerald-500/30 text-[9px] text-emerald-200 cursor-help" title="EQ Matching: Matches tone to genre automatically.">
                      <Sliders size={8} /> EQ-Match
                    </div>
                 )}
              </div>
            </div>

            {/* 4. Mixer Section */}
            <div className="flex-1 bg-[#222225] p-2 flex flex-col justify-end relative">
              
              {/* Pan Knob */}
              <div className="mb-4 flex flex-col items-center gap-1 group">
                 <div className="w-10 h-10 rounded-full border-2 border-gray-700 bg-gray-800 shadow-lg relative flex items-center justify-center transform rotate-[-45deg] hover:border-gray-500 transition-colors cursor-ns-resize">
                    <div className="w-1 h-3 bg-white rounded-full absolute top-1"></div>
                 </div>
                 <span className="text-[9px] text-gray-500 font-mono group-hover:text-gray-300">C</span>
              </div>

              {/* Mute / Solo Buttons */}
              <div className="flex gap-2 mb-4 px-1">
                 <button className="flex-1 h-8 rounded-[2px] bg-gray-800 border border-gray-600 text-[10px] font-bold text-gray-400 hover:text-white hover:border-gray-400 active:bg-yellow-600 active:text-white active:border-yellow-400 transition-all shadow-sm">
                    S
                 </button>
                 <button 
                    className={`flex-1 h-8 rounded-[2px] border text-[10px] font-bold transition-all shadow-sm ${track.muted 
                       ? 'bg-orange-500 border-orange-400 text-white shadow-[0_0_8px_rgba(249,115,22,0.4)]' 
                       : 'bg-gray-800 border-gray-600 text-gray-400 hover:text-white hover:border-gray-400'}`}
                 >
                    M
                 </button>
              </div>

              {/* Volume Fader Area */}
              <div className="flex-1 relative mx-auto w-10 bg-[#151517] rounded-sm border border-gray-800/80 shadow-inner group">
                
                {/* Meter Markings */}
                <div className="absolute top-4 bottom-4 left-1 flex flex-col justify-between text-[7px] text-gray-600 font-mono pointer-events-none select-none">
                   <span>+6</span>
                   <span>0</span>
                   <span>-6</span>
                   <span>-12</span>
                   <span>-inf</span>
                </div>

                {/* Fader Track (Groove) */}
                <div className="absolute top-2 bottom-2 left-1/2 w-[2px] bg-black -translate-x-1/2 rounded-full"></div>

                {/* Level Meter (Behind Fader) */}
                <div 
                   className={`absolute bottom-2 left-1/2 w-1 -translate-x-1/2 bg-gradient-to-t from-green-500 via-yellow-500 to-red-500 opacity-40 blur-[1px] transition-all duration-75`}
                   style={{ height: `${track.volume * 85}%` }} 
                />

                {/* The Fader Cap */}
                <div 
                  className="absolute left-1/2 -translate-x-1/2 w-8 h-12 bg-gradient-to-b from-gray-600 to-gray-800 rounded-[2px] shadow-[0_4px_6px_rgba(0,0,0,0.5)] border-t border-gray-500 flex items-center justify-center cursor-grab active:cursor-grabbing z-20 pointer-events-none"
                  style={{ bottom: `${(track.volume * 80)}%` }}
                >
                   <div className="w-full h-[1px] bg-black/50"></div>
                   <div className="absolute w-full h-[1px] bg-white/20 top-[4px]"></div>
                </div>

                {/* Invisible Range Input for Interaction */}
                <input 
                  type="range" 
                  min="0" 
                  max="1" 
                  step="0.01"
                  value={track.volume}
                  onChange={(e) => onUpdateVol(track.id, parseFloat(e.target.value))}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-ns-resize z-30"
                  style={{ writingMode: 'vertical-lr', WebkitAppearance: 'slider-vertical' }}
                />

              </div>

              {/* Volume Text */}
              <div className="mt-2 text-center text-[10px] font-mono text-gray-500">
                 {(track.volume * 100).toFixed(0)}%
              </div>

            </div>
          </div>
        ))}

        {/* Master Bus */}
        <div className="w-28 flex-shrink-0 flex flex-col rounded-sm bg-[#1e1e22] shadow-xl border-l-2 border-gray-800 ml-2">
            <div className="h-8 bg-black flex items-center justify-center font-bold text-xs text-gray-400 tracking-widest border-b border-gray-800">
               MASTER
            </div>
            
            <div className="flex-1 p-2 flex flex-col gap-2">
               {/* Master Visualizer */}
               <div className="h-24 bg-black rounded border border-gray-800 p-1">
                  <Visualizer isPlaying={isPlaying} color="#f472b6" />
               </div>

               {/* Master AI Agent Toggle */}
               <button 
                 onClick={() => setAiMasterEnabled(!aiMasterEnabled)}
                 className={`
                   border p-2 rounded flex flex-col gap-1 items-center justify-center text-center transition-all cursor-pointer
                   ${aiMasterEnabled 
                     ? 'bg-[#1a1a1d] border-gray-700 hover:border-pink-500' 
                     : 'bg-gray-900 border-gray-800 opacity-50'}
                 `}
               >
                   <div className={`text-[9px] font-bold uppercase ${aiMasterEnabled ? 'text-pink-500 animate-pulse' : 'text-gray-500'}`}>
                     AI Mastering
                   </div>
                   <div className="text-[8px] text-gray-500">
                     {aiMasterEnabled ? 'Target: -14 LUFS' : 'Bypassed'}
                   </div>
                   <div className={`w-6 h-3 rounded-full mt-1 relative transition-colors ${aiMasterEnabled ? 'bg-pink-900' : 'bg-gray-700'}`}>
                      <div className={`absolute top-0.5 w-2 h-2 rounded-full bg-white transition-all ${aiMasterEnabled ? 'left-3.5' : 'left-0.5'}`}></div>
                   </div>
               </button>
               
               {/* Master Fader */}
               <div className="flex-1 relative bg-black rounded-sm border border-gray-800 mx-2 mb-2 shadow-inner">
                   <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-2 bg-pink-600/60 blur-[2px] transition-all" style={{height: isPlaying ? '70%' : '0%'}}></div>
                   {/* Cap */}
                   <div className="absolute bottom-[70%] left-1/2 -translate-x-1/2 w-12 h-8 bg-gray-700 border border-gray-500 rounded-sm shadow-lg z-10"></div>
               </div>
            </div>
        </div>

      </div>
    </div>
  );
};