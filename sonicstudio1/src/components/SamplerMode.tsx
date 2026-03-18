import React, { useState, useRef } from 'react';
import { Upload, Play, Square, Scissors, Repeat, Layers, Music, Share2, Download, CheckCircle, Plus, Disc, Volume2, Mic } from 'lucide-react';
import type { SampleClip, AudioRecording, Track } from '../types';
import { decodeAudioData, playBufferRaw } from '../services/audioEngine';

interface SamplerModeProps {
  recordings: AudioRecording[]; 
  tracks?: Track[]; // Added tracks to import mic recordings
}

export const SamplerMode: React.FC<SamplerModeProps> = ({ recordings, tracks = [] }) => {
  const [samples, setSamples] = useState<SampleClip[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [masteringState, setMasteringState] = useState<'IDLE' | 'PROCESSING' | 'COMPLETE'>('IDLE');
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [showLibraryImport, setShowLibraryImport] = useState(false);
  const [masterGain, setMasterGain] = useState(1.0); // 1.0 = 0dB
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sampleListRef = useRef<HTMLDivElement>(null);

  // Filter for tracks that actually have audio
  const audioTracks = tracks.filter(t => t.audioBuffer);

  // Drag & Drop Handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await processFiles(Array.from(e.dataTransfer.files));
    }
  };

  const processFiles = async (files: File[]) => {
    const newSamplesToAdd: SampleClip[] = [];
    let errorCount = 0;
    
    for (const file of files) {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const audioBuffer = await decodeAudioData(arrayBuffer);
        
        const newSample: SampleClip = {
          id: Date.now().toString() + Math.random(),
          name: file.name.replace(/\.[^/.]+$/, ""),
          buffer: audioBuffer,
          startTime: 0,
          duration: audioBuffer.duration,
          volume: 1.0,
          isLooping: false
        };
        newSamplesToAdd.push(newSample);
      } catch (e) {
        console.error("Failed to load sample", file.name, e);
        errorCount++;
      }
    }
    
    if (errorCount > 0) {
        alert(`Failed to load ${errorCount} file(s). Please check they are valid audio (MP3/WAV).`);
    }

    if (newSamplesToAdd.length > 0) {
        setSamples(prev => [...prev, ...newSamplesToAdd]);
    }
  };

  const importFromRecording = async (rec: AudioRecording) => {
    try {
      const arrayBuffer = await rec.blob.arrayBuffer();
      const audioBuffer = await decodeAudioData(arrayBuffer);
      addSampleFromBuffer(audioBuffer, rec.name, `lib-${rec.id}`);
    } catch(e) {
      console.error("Failed to import recording", e);
      alert("Could not import recording.");
    }
  };

  const importFromTrack = (track: Track) => {
      if (track.audioBuffer) {
          addSampleFromBuffer(track.audioBuffer, track.name, `track-${track.id}`);
      }
  };

  const addSampleFromBuffer = (audioBuffer: AudioBuffer, name: string, idPrefix: string) => {
      const newSample: SampleClip = {
          id: `${idPrefix}-${crypto.randomUUID()}`,
          name: name,
          buffer: audioBuffer,
          startTime: 0,
          duration: audioBuffer.duration,
          volume: 1.0,
          isLooping: false
      };
      setSamples(prev => [...prev, newSample]);
      setShowLibraryImport(false);
  };

  // Sample Actions
  const togglePlaySample = (sample: SampleClip) => {
    if (playingId === sample.id) {
        setPlayingId(null);
    } else {
        // Apply master gain to the sample play
        playBufferRaw(sample.buffer, sample.volume * masterGain, sample.isLooping);
        setPlayingId(sample.id);
        if (!sample.isLooping) {
            setTimeout(() => setPlayingId(null), sample.duration * 1000);
        }
    }
  };

  const toggleLoop = (id: string) => {
     setSamples(samples.map(s => s.id === id ? {...s, isLooping: !s.isLooping} : s));
  };

  const removeSample = (id: string) => {
    setSamples(samples.filter(s => s.id !== id));
  };

  const runMasteringProcess = () => {
    if (samples.length === 0) return;
    setMasteringState('PROCESSING');
    setTimeout(() => {
       setMasteringState('COMPLETE');
    }, 3000);
  };
  
  const handleCheckSampleList = () => {
      if (samples.length === 0) {
          // If empty, trigger file upload to help the user
          fileInputRef.current?.click();
      } else {
          sampleListRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
  };

  return (
    <div className="h-full bg-gray-900 text-white flex flex-col font-sans relative">
       <input 
         ref={fileInputRef}
         type="file" 
         multiple 
         accept="audio/*,.mp3,.wav,.ogg,.m4a"
         className="hidden" 
         onClick={(e) => (e.currentTarget.value = '')} // Reset value
         onChange={(e) => e.target.files && processFiles(Array.from(e.target.files))}
       />

       {/* Header Toolbar */}
       <div className="h-16 bg-gray-950 border-b border-gray-800 flex items-center justify-between px-6 shadow-lg z-10">
          <div className="flex items-center gap-3">
             <div className="bg-gradient-to-r from-pink-500 to-rose-500 p-2 rounded-lg">
                <Scissors size={20} className="text-white" />
             </div>
             <div>
                <h2 className="font-bold text-lg leading-tight">Sampler & Editor</h2>
                <div className="text-[10px] text-gray-400 font-mono">DRAG & DROP • TRIM • MASTER</div>
             </div>
          </div>

          <div className="flex items-center gap-3">
             <button 
                onClick={() => setShowLibraryImport(!showLibraryImport)}
                className="px-4 py-2 bg-gray-800 border border-gray-700 hover:bg-gray-700 rounded font-bold text-xs flex items-center gap-2"
             >
                <Disc size={14} /> Import Audio
             </button>
             
             {masteringState === 'COMPLETE' ? (
                <div className="flex gap-2 animate-in fade-in zoom-in">
                   <button className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded font-bold text-xs flex items-center gap-2">
                      <Download size={14} /> EXPORT MP3
                   </button>
                   <button className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded font-bold text-xs flex items-center gap-2">
                      <Share2 size={14} /> SHARE
                   </button>
                </div>
             ) : (
                <button 
                  onClick={runMasteringProcess}
                  disabled={samples.length === 0 || masteringState === 'PROCESSING'}
                  className={`
                    px-6 py-2 rounded font-bold text-xs flex items-center gap-2 transition-all
                    ${samples.length === 0 ? 'bg-gray-800 text-gray-500 cursor-not-allowed' : 'bg-gradient-to-r from-yellow-500 to-orange-600 hover:brightness-110 shadow-lg shadow-orange-900/20'}
                  `}
                >
                  {masteringState === 'PROCESSING' ? (
                    <>MASTERING <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"/></>
                  ) : (
                    <>✨ WORLD STANDARD MASTER</>
                  )}
                </button>
             )}
          </div>
       </div>

       {/* Library Import Dropdown */}
       {showLibraryImport && (
         <div className="absolute top-16 right-6 w-80 bg-gray-800 border border-gray-600 rounded-b-xl shadow-2xl z-50 max-h-96 overflow-y-auto animate-in slide-in-from-top-2">
            
            {/* Section 1: Active Tracks (Mic Recordings) */}
            {audioTracks.length > 0 && (
                <>
                    <div className="p-3 bg-gray-900 border-b border-gray-700 font-bold text-xs text-blue-400">ACTIVE SESSION TRACKS</div>
                    {audioTracks.map(track => (
                        <button 
                            key={track.id}
                            onClick={() => importFromTrack(track)}
                            className="w-full text-left p-3 hover:bg-gray-700 flex justify-between items-center border-b border-gray-700"
                        >
                            <div className="flex items-center gap-2">
                                <Mic size={14} className="text-gray-500" />
                                <div>
                                    <div className="font-bold text-sm text-gray-200">{track.name}</div>
                                    <div className="text-xs text-gray-500">{(track.audioBuffer?.duration || 0).toFixed(1)}s</div>
                                </div>
                            </div>
                            <Plus size={16} className="text-blue-500" />
                        </button>
                    ))}
                </>
            )}

            {/* Section 2: Library Bounces */}
            <div className="p-3 bg-gray-900 border-b border-gray-700 font-bold text-xs text-pink-400">LIBRARY RECORDINGS</div>
            {recordings.length === 0 && audioTracks.length === 0 ? (
               <div className="p-4 text-center text-gray-500 text-sm">No audio found. Record something first!</div>
            ) : (
               recordings.map(rec => (
                  <button 
                    key={rec.id}
                    onClick={() => importFromRecording(rec)}
                    className="w-full text-left p-3 hover:bg-gray-700 flex justify-between items-center border-b border-gray-700 last:border-0"
                  >
                     <div>
                        <div className="font-bold text-sm text-gray-200">{rec.name}</div>
                        <div className="text-xs text-gray-500">{rec.duration}</div>
                     </div>
                     <Plus size={16} className="text-pink-500" />
                  </button>
               ))
            )}
         </div>
       )}

       {/* Main Content */}
       <div className="flex-1 flex overflow-hidden">
          
          {/* Sample List / Drop Zone */}
          <div className="flex-1 p-6 overflow-y-auto relative" ref={sampleListRef}>
             
             {dragActive && (
               <div 
                 className="absolute inset-4 bg-indigo-500/20 border-4 border-dashed border-indigo-500 rounded-3xl z-40 flex flex-col items-center justify-center backdrop-blur-sm"
                 onDragEnter={handleDrag}
                 onDragLeave={handleDrag}
                 onDragOver={handleDrag}
                 onDrop={handleDrop}
               >
                  <Upload size={64} className="text-indigo-400 mb-4 animate-bounce" />
                  <h3 className="text-2xl font-bold text-indigo-300">Drop Samples Here</h3>
               </div>
             )}

             {samples.length === 0 ? (
                <div 
                  className="h-full border-2 border-dashed border-gray-700 rounded-3xl flex flex-col items-center justify-center gap-4 text-gray-500 hover:border-gray-500 hover:bg-gray-800/30 transition-all cursor-pointer"
                  onClick={() => fileInputRef.current?.click()}
                  onDragEnter={handleDrag}
                >
                   <Music size={48} />
                   <div className="text-center">
                      <p className="font-bold text-lg">Drag & Drop Audio Files</p>
                      <p className="text-sm">Beats, Vocals, FX (MP3, WAV)</p>
                   </div>
                   <button className="px-4 py-2 bg-gray-800 rounded-full text-sm font-bold border border-gray-600">Browse Files</button>
                </div>
             ) : (
                <div className="space-y-4 pb-24">
                   {samples.map((sample, idx) => (
                      <div key={sample.id} className="bg-gray-800 rounded-xl p-4 flex items-center gap-4 group border border-gray-700 hover:border-gray-500 transition-all">
                         <div className="w-8 h-8 flex items-center justify-center bg-gray-900 rounded-full font-mono text-xs text-gray-500">
                            {idx + 1}
                         </div>
                         
                         <div className="flex-1">
                            <h4 className="font-bold text-gray-200">{sample.name}</h4>
                            <div className="flex items-center gap-4 text-xs text-gray-500 mt-1">
                               <span>{sample.duration.toFixed(2)}s</span>
                               <span className="flex items-center gap-1"><Layers size={10} /> 44.1kHz</span>
                            </div>
                         </div>

                         <div className="hidden md:flex h-10 w-48 bg-gray-900 rounded items-center justify-center overflow-hidden gap-[2px] opacity-50">
                            {Array(20).fill(0).map((_, i) => (
                               <div key={i} className="w-1 bg-gray-500 rounded-full" style={{height: `${Math.random() * 100}%`}} />
                            ))}
                         </div>

                         <div className="flex items-center gap-2">
                            <button 
                               onClick={() => toggleLoop(sample.id)}
                               className={`p-2 rounded hover:bg-gray-700 transition-colors ${sample.isLooping ? 'text-green-400' : 'text-gray-500'}`}
                               title="Toggle Loop"
                            >
                               <Repeat size={16} />
                            </button>
                            <button 
                               onClick={() => togglePlaySample(sample)}
                               className={`p-3 rounded-full transition-all ${playingId === sample.id ? 'bg-indigo-500 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                            >
                               {playingId === sample.id ? <Square size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
                            </button>
                            <button 
                               onClick={() => removeSample(sample.id)}
                               className="p-2 text-gray-600 hover:text-red-400 transition-colors"
                            >
                               <span className="text-xl font-bold">×</span>
                            </button>
                         </div>
                      </div>
                   ))}

                   <div 
                      className="p-8 border-2 border-dashed border-gray-800 rounded-xl flex items-center justify-center text-gray-600 hover:text-gray-400 hover:border-gray-600 cursor-pointer transition-all"
                      onClick={() => fileInputRef.current?.click()}
                   >
                      <Plus size={24} /> <span className="ml-2 font-bold">Add More Samples</span>
                   </div>
                </div>
             )}
          </div>

          {/* Master Channel Strip (Right) - Added pb-20 for AI Assistant visibility */}
          <div className="w-72 bg-gray-950 border-l border-gray-800 p-4 pb-24 flex flex-col gap-6">
             <div className="text-center">
                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4">Master Bus</h3>
                
                <div className="h-32 bg-black border border-gray-800 rounded-lg mb-4 relative overflow-hidden">
                   <div className="absolute inset-0 flex items-center justify-center gap-1 opacity-60">
                      {/* Master VU Meter Visualization based on Gain */}
                      <div className={`w-3 bg-green-500 transition-all duration-75`} style={{height: playingId ? `${50 * masterGain}%` : '5%'}} />
                      <div className={`w-3 bg-green-500 transition-all duration-75`} style={{height: playingId ? `${80 * masterGain}%` : '5%'}} />
                      <div className={`w-3 bg-green-500 transition-all duration-75`} style={{height: playingId ? `${60 * masterGain}%` : '5%'}} />
                      <div className={`w-3 bg-green-500 transition-all duration-75`} style={{height: playingId ? `${70 * masterGain}%` : '5%'}} />
                   </div>
                </div>

                {masteringState === 'COMPLETE' && (
                   <div className="bg-green-900/20 border border-green-800 p-3 rounded-lg flex items-center gap-2 text-green-400 text-xs font-bold mb-4 animate-in slide-in-from-right">
                      <CheckCircle size={16} /> Mastering Complete
                   </div>
                )}
                
                <div className="space-y-2">
                   <div className="flex justify-between text-xs text-gray-500 font-bold">
                      <span>GAIN</span>
                      <span>{(20 * Math.log10(masterGain)).toFixed(1)} dB</span>
                   </div>
                   <input 
                     type="range" 
                     min="0" 
                     max="2" 
                     step="0.05"
                     value={masterGain}
                     onChange={(e) => setMasterGain(parseFloat(e.target.value))}
                     className="w-full accent-pink-500 h-1 bg-gray-800 rounded appearance-none cursor-ew-resize" 
                   />
                </div>
             </div>

             <div className="mt-auto">
                 <button 
                    onClick={handleCheckSampleList}
                    className="w-full py-3 bg-gray-800 hover:bg-gray-700 rounded-lg text-xs font-bold text-gray-300 border border-gray-700 flex items-center justify-center gap-2"
                 >
                    <Volume2 size={14} /> 
                    {samples.length === 0 ? "UPLOAD SAMPLES" : "CHECK SAMPLE LIST"}
                 </button>
             </div>
          </div>

       </div>
    </div>
  );
};