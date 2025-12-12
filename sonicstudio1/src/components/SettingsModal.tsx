import React, { useState, useEffect, useRef } from 'react';

import { Settings, Mic, Headphones, Cast, X, Volume2, Activity, Play, AlertTriangle, Zap, Radio, RefreshCw, Bluetooth, Info, Camera, Video, MonitorPlay, Loader2, ArrowRight, Cable } from 'lucide-react';

import type { AudioDeviceSettings, User as UserType } from '../types.ts';

import { playTestTone, getAudioState, getVocalAnalysis, setVocalEnhance } from '../services/audioEngine';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AudioDeviceSettings;
  onUpdateSettings: (s: AudioDeviceSettings) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ 
  isOpen, 
  onClose, 
  settings, 
  onUpdateSettings 
}) => {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioState, setAudioState] = useState<string>('unknown');
  const [testToneStatus, setTestToneStatus] = useState('');
  const [isScanningDevices, setIsScanningDevices] = useState(false);
  const [showRoutingGuide, setShowRoutingGuide] = useState(false);
  
  // Visualizer State
  const [vocalLevel, setVocalLevel] = useState(-100);
  const [isGateOpen, setIsGateOpen] = useState(false);
  const animationRef = useRef<number>(0);

  useEffect(() => {
    if (isOpen) {
      refreshDeviceList();
      setAudioState(getAudioState());
      const interval = setInterval(() => setAudioState(getAudioState()), 1000);

      // Animation Loop for Gate Visualizer
      const loop = () => {
         const analysis = getVocalAnalysis();
         setVocalLevel(analysis.level);
         setIsGateOpen(analysis.isOpen);
         animationRef.current = requestAnimationFrame(loop);
      };
      loop();

      return () => {
        clearInterval(interval);
        cancelAnimationFrame(animationRef.current);
      };
    }
  }, [isOpen]);

  const refreshDeviceList = async () => {
     try {
       const devs = await navigator.mediaDevices.enumerateDevices();
       setDevices(devs);
     } catch(e) { console.error(e); }
  };

  const handleHardRefreshDevices = async () => {
     setIsScanningDevices(true);
     try {
       // Force a real video request to ensure permissions
       const stream = await navigator.mediaDevices.getUserMedia({ 
           audio: true, 
           video: true // This is critical for Camo to show up
       });
       
       // Stop immediately after getting permission
       stream.getTracks().forEach(t => t.stop()); 
       
       // Re-enumerate
       const devs = await navigator.mediaDevices.enumerateDevices();
       setDevices(devs);
     } catch (e) {
       alert("Could not access devices. Please ensure you allow Camera access when prompted. This is required for Camo to appear.");
     } finally {
        setTimeout(() => setIsScanningDevices(false), 500);
     }
  };

  const handleTestTone = async () => {
    setTestToneStatus('Initializing...');
    const result = await playTestTone();
    setTestToneStatus(result);
    setTimeout(() => setTestToneStatus(''), 2000);
  };

  const toggleAIProfile = (enabled: boolean) => {
    onUpdateSettings({...settings, aiEnhanceEnabled: enabled});
    setVocalEnhance(enabled);
  };

  const toggleBluetoothMode = (enabled: boolean) => {
    onUpdateSettings({ ...settings, latencyCompensation: enabled ? 200 : 0 });
  }

  const audioInputs = devices.filter(d => d.kind === 'audioinput');
  const videoInputs = devices.filter(d => d.kind === 'videoinput');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-[#18181b] border border-gray-700 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-6 bg-gradient-to-r from-gray-900 to-gray-800 border-b border-gray-700 flex justify-between items-center">
          <div className="flex items-center gap-3">
             <div className="p-2 bg-blue-600 rounded-lg shadow-lg shadow-blue-900/50">
               <Settings className="text-white" size={24} />
             </div>
             <div>
               <h2 className="text-xl font-bold text-white">Studio I/O Settings</h2>
             </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X size={24} />
          </button>
        </div>

        {/* Body */}
        <div className="p-8 space-y-8 overflow-y-auto text-gray-300">
          
          {/* Section 1: Devices */}
          <div className="space-y-4">
             <div className="flex justify-between items-center">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Hardware Inputs</h3>
                <button 
                   onClick={handleHardRefreshDevices} 
                   className={`text-[10px] px-3 py-1.5 rounded flex items-center gap-2 transition-colors border ${isScanningDevices ? 'bg-indigo-900 text-white border-indigo-500' : 'bg-gray-800 hover:bg-gray-700 text-gray-300 border-gray-700'}`}
                >
                   {isScanningDevices ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                   {isScanningDevices ? "Scanning..." : "Force Detect Camo/Inputs"}
                </button>
             </div>
             
             <div className="grid md:grid-cols-2 gap-4">
                {/* Audio Input */}
                <div className="space-y-2">
                   <label className="flex items-center gap-2 text-sm font-bold text-blue-400">
                     <Mic size={16} /> Microphone
                   </label>
                   <select 
                     className="w-full bg-black border border-gray-700 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                     value={settings.inputDeviceId}
                     onChange={(e) => onUpdateSettings({...settings, inputDeviceId: e.target.value})}
                   >
                     <option value="default">Default System Microphone</option>
                     {audioInputs.map(d => (
                       <option key={d.deviceId} value={d.deviceId}>{d.label || `Mic ${d.deviceId.slice(0,5)}...`}</option>
                     ))}
                   </select>
                </div>

                {/* Video Input */}
                <div className="space-y-2">
                   <label className="flex items-center gap-2 text-sm font-bold text-purple-400">
                     <Camera size={16} /> Camera Source
                   </label>
                   <select 
                     className="w-full bg-black border border-gray-700 rounded-lg p-3 text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                     value={settings.videoInputDeviceId || 'default'}
                     onChange={(e) => onUpdateSettings({...settings, videoInputDeviceId: e.target.value})}
                   >
                     <option value="default">Default System Camera</option>
                     {videoInputs.map(d => (
                       <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${d.deviceId.slice(0,5)}...`}</option>
                     ))}
                   </select>
                   <div className="flex items-center gap-1 text-[10px] text-gray-500">
                      <Info size={10} />
                      <span>If Camo is missing, click Force Detect to request permission.</span>
                   </div>
                </div>
             </div>

             {/* Output Note & Routing Guide */}
             <div className="space-y-2">
                 <div className="flex items-center justify-between gap-2 text-[10px] text-gray-500 bg-gray-900/50 p-2 rounded border border-gray-800">
                    <div className="flex items-center gap-2">
                        <Volume2 size={12} />
                        <span>Audio Output is managed by your System Settings.</span>
                    </div>
                    <button 
                        onClick={() => setShowRoutingGuide(!showRoutingGuide)}
                        className="flex items-center gap-1 text-indigo-400 hover:text-indigo-300 font-bold"
                    >
                        <Cable size={12} />
                        Route to DAW?
                    </button>
                 </div>

                 {showRoutingGuide && (
                     <div className="bg-indigo-900/20 border border-indigo-900/50 p-4 rounded-xl text-xs space-y-3 animate-in fade-in slide-in-from-top-2">
                         <h4 className="font-bold text-indigo-300 flex items-center gap-2">
                             <Cable size={14} /> Routing to Ableton / Pro Tools
                         </h4>
                         <p className="text-indigo-200/70">
                             To route Tiwaton audio into another DAW, you need a Virtual Cable (e.g., VB-Cable or BlackHole).
                         </p>
                         <ol className="list-decimal pl-4 space-y-2 text-indigo-100/60">
                             <li>
                                 <span className="text-white font-bold">OS Settings:</span> Change your computer's main Output Device to <strong>"VB-Cable Input"</strong> (Windows) or <strong>"BlackHole"</strong> (Mac).
                             </li>
                             <li>
                                 <span className="text-white font-bold">DAW Settings:</span> In your DAW (e.g., Ableton), set the Audio Input Device to <strong>"VB-Cable Output"</strong>.
                             </li>
                             <li>
                                 <span className="text-white font-bold">Result:</span> Audio flows from Tiwaton &rarr; System &rarr; Virtual Cable &rarr; DAW.
                             </li>
                         </ol>
                     </div>
                 )}
             </div>
             
             {/* Bluetooth / Latency Toggle */}
             <div className="bg-blue-900/20 border border-blue-900/50 p-3 rounded-xl flex items-center justify-between mt-2">
                <div className="flex items-center gap-3">
                   <Bluetooth size={20} className={settings.latencyCompensation > 0 ? "text-blue-400" : "text-gray-500"} />
                   <div>
                      <div className="text-sm font-bold text-gray-200">Bluetooth Headphones Mode</div>
                      <div className="text-xs text-gray-500">Fixes lag/delay when using AirPods/Wireless Mics.</div>
                   </div>
                </div>
                <button 
                   onClick={() => toggleBluetoothMode(settings.latencyCompensation === 0)}
                   className={`px-3 py-1 rounded text-xs font-bold transition-all border ${settings.latencyCompensation > 0 ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400'}`}
                >
                   {settings.latencyCompensation > 0 ? "ENABLED (Intelligent Fix)" : "DISABLED"}
                </button>
             </div>
          </div>

          <div className="h-px bg-gray-800" />

          {/* Section 3: HyperGate & AI Polish */}
          <div className="space-y-6">
             <div className="flex items-center justify-between">
                <div className="space-y-1">
                   <h3 className="font-bold text-white flex items-center gap-2">
                     <Activity size={18} className="text-red-500" /> HyperGate™ Isolator
                   </h3>
                   <p className="text-xs text-gray-500 w-80">
                     The Red Zone kills noise. The Green Zone is your voice.
                   </p>
                </div>
                
                {/* AI Treat Toggle */}
                <div className="flex items-center gap-3 bg-gray-900 p-2 rounded-lg border border-gray-800">
                   <span className="text-xs font-bold text-purple-400">AI POLISH</span>
                   <button 
                     onClick={() => toggleAIProfile(!settings.aiEnhanceEnabled)}
                     className={`w-10 h-5 rounded-full relative transition-colors ${settings.aiEnhanceEnabled ? 'bg-purple-600' : 'bg-gray-700'}`}
                   >
                      <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${settings.aiEnhanceEnabled ? 'left-6' : 'left-1'}`} />
                   </button>
                </div>
             </div>
             
             {/* Gate Visualizer */}
             <div className="bg-black/80 rounded-2xl p-6 border-2 border-gray-800 relative shadow-2xl">
                {/* Status Text Overlay */}
                <div className="absolute top-4 left-0 right-0 text-center pointer-events-none z-10 flex justify-center">
                   {isGateOpen ? (
                      <span className="px-3 py-1 bg-green-600 text-white rounded border border-green-500 text-xs font-black tracking-widest animate-pulse shadow-[0_0_20px_rgba(34,197,94,0.6)]">
                         VOICE DETECTED
                      </span>
                   ) : (
                      <span className="px-3 py-1 bg-red-600 text-white rounded border border-red-500 text-xs font-black tracking-widest">
                         NOISE KILLED
                      </span>
                   )}
                </div>

                <div className="relative h-16 bg-gray-900 rounded-lg overflow-hidden border border-gray-700 mt-8">
                   {/* Background Zones - Improved Visibility */}
                   <div className="absolute inset-0 flex">
                      <div 
                         className="h-full bg-red-900/80 border-r-2 border-yellow-500/80 transition-all duration-100 flex items-center justify-center" 
                         style={{ width: `${Math.min(100, Math.max(0, settings.hyperGateThreshold + 100))}%` }} 
                      >
                      </div>
                      <div className="flex-1 bg-green-900/40 flex items-center justify-center">
                      </div>
                   </div>

                   {/* Signal Level Bar */}
                   <div 
                      className={`absolute top-0 bottom-0 left-0 transition-all duration-75 z-10 ${isGateOpen ? 'bg-white' : 'bg-red-300'}`}
                      style={{ width: `${Math.min(100, Math.max(0, vocalLevel + 100))}%`, opacity: 0.9, mixBlendMode: 'overlay' }}
                   />
                   
                   {/* Threshold Marker Line (The Yellow Line) */}
                   <div 
                      className="absolute top-0 bottom-0 w-1 bg-yellow-400 z-20 shadow-[0_0_15px_yellow] transition-all duration-100"
                      style={{ left: `${settings.hyperGateThreshold + 100}%` }}
                   >
                   </div>
                </div>

                <div className="flex items-center gap-4 mt-6">
                   <Volume2 size={24} className="text-gray-400" />
                   <input 
                     type="range" 
                     min="-80" 
                     max="0" 
                     step="1"
                     value={settings.hyperGateThreshold}
                     onChange={(e) => onUpdateSettings({...settings, hyperGateThreshold: parseInt(e.target.value)})}
                     className="flex-1 h-3 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                   />
                   <span className="font-mono text-lg font-bold w-16 text-right text-yellow-500">{settings.hyperGateThreshold}dB</span>
                </div>
             </div>
          </div>

          <div className="bg-gray-800/40 p-4 rounded-xl border border-gray-700 flex items-center justify-between">
             <div>
                <h3 className="font-bold text-gray-300">System Audio Check</h3>
                <p className="text-xs text-gray-500">
                  {testToneStatus || "Click to play a 440Hz sine wave to verify speakers."}
                </p>
             </div>
             <button 
               onClick={handleTestTone}
               className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg font-bold text-xs flex items-center gap-2 transition-transform active:scale-95"
             >
               <Play size={14} /> Test Sound
             </button>
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 bg-gray-900 border-t border-gray-800 flex justify-end">
           <button 
             onClick={onClose}
             className="px-6 py-2 bg-white text-black font-bold rounded-lg hover:bg-gray-200 transition-colors"
           >
             Done
           </button>
        </div>

      </div>
    </div>
  );
};