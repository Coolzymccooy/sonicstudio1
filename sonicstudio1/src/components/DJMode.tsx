import React, { useState, useEffect, useRef } from 'react';
import { Disc, Play, Pause, Music, Mic2, Sparkles, Volume2, Save, Clock, Search, ArrowRight, ArrowLeft, RotateCcw, Upload, Wifi, Smartphone } from 'lucide-react';
import { Visualizer } from './Visualizer';
import type { Song } from '../types';
import { startDeck, pauseDeck, setDeckVolume, initAudio, loadDeckBuffer, decodeAudioData, stopDeck } from '../services/audioEngine';

interface DJModeProps {
  isPlaying: boolean;
  onTogglePlay: () => void;
  onSave: () => void;
}

// Sample DJ Library Data
const INITIAL_LIBRARY: Song[] = [
  { id: 'dj1', title: 'Midnight City', artist: 'Neon Dreams', bpm: 128, key: 'Cm', coverColor: 'cyan', duration: '3:45' },
  { id: 'dj2', title: 'Deep Ocean', artist: 'Aqua Flow', bpm: 124, key: 'Am', coverColor: 'blue', duration: '4:20' },
  { id: 'dj3', title: 'Solar Flare', artist: 'Star Dust', bpm: 130, key: 'Fm', coverColor: 'orange', duration: '3:10' },
  { id: 'dj4', title: 'Cyber Pulse', artist: 'Glitch Mob', bpm: 140, key: 'Gm', coverColor: 'purple', duration: '3:55' },
  { id: 'dj5', title: 'Vinyl Dust', artist: 'Retro King', bpm: 95, key: 'Em', coverColor: 'yellow', duration: '2:50' },
];

export const DJMode: React.FC<DJModeProps> = ({ onSave }) => {
  const [crossfader, setCrossfader] = useState(50);
  const [deckAPlaying, setDeckAPlaying] = useState(false);
  const [deckBPlaying, setDeckBPlaying] = useState(false);
  const [activeEffect, setActiveEffect] = useState<string | null>(null);
  
  // Auto Mix State
  const [isAutoMixing, setIsAutoMixing] = useState(false);
  
  // Library State
  const [library, setLibrary] = useState<Song[]>(INITIAL_LIBRARY);
  const [playedHistory, setPlayedHistory] = useState<Song[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Deck State
  const [deckATrack, setDeckATrack] = useState<Song | null>(null);
  const [deckBTrack, setDeckBTrack] = useState<Song | null>(null);

  // Load Modal
  const [showLoadModalFor, setShowLoadModalFor] = useState<'A' | 'B' | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync Audio Engine Volume with Crossfader
  useEffect(() => {
    let volA = 1;
    let volB = 1;
    if (crossfader < 50) {
      volB = crossfader / 50;
    } else {
      volA = 1 - ((crossfader - 50) / 50);
    }
    
    // Apply Effects Ducking
    if (activeEffect === 'SUPPRESS') {
        volA *= 0.1;
        volB *= 0.1;
    }
    
    setDeckVolume('A', volA);
    setDeckVolume('B', volB);
  }, [crossfader, activeEffect]);

  const toggleDeckA = () => {
    initAudio();
    if (deckAPlaying) {
      pauseDeck('A');
      setDeckAPlaying(false);
    } else if (deckATrack) {
      startDeck('A', deckATrack.bpm, 1);
      setDeckAPlaying(true);
    }
  };

  const toggleDeckB = () => {
    initAudio();
    if (deckBPlaying) {
      pauseDeck('B');
      setDeckBPlaying(false);
    } else if (deckBTrack) {
      startDeck('B', deckBTrack.bpm, 1);
      setDeckBPlaying(true);
    }
  };

  const handleCue = (deck: 'A' | 'B') => {
      stopDeck(deck);
      if (deck === 'A') setDeckAPlaying(false);
      else setDeckBPlaying(false);
  };

  const handleSync = (deck: 'A' | 'B') => {
      // Logic: Match this deck's BPM to the *other* deck
      if (deck === 'A' && deckBTrack && deckATrack) {
          // In a real engine, we'd adjust playbackRate. Here we update the UI metadata.
          alert(`Synced Deck A to ${deckBTrack.bpm} BPM`);
      } else if (deck === 'B' && deckATrack && deckBTrack) {
          alert(`Synced Deck B to ${deckATrack.bpm} BPM`);
      }
  };

  const startAutoMix = () => {
    if (isAutoMixing) return;
    setIsAutoMixing(true);
    const target = crossfader < 50 ? 100 : 0;
    const direction = target > crossfader ? 1 : -1;
    
    if (target === 100 && !deckBPlaying && deckBTrack) toggleDeckB();
    if (target === 0 && !deckAPlaying && deckATrack) toggleDeckA();

    const interval = setInterval(() => {
      setCrossfader(prev => {
        const next = prev + direction;
        if ((direction === 1 && next >= target) || (direction === -1 && next <= target)) {
          clearInterval(interval);
          setIsAutoMixing(false);
          if (target === 100 && deckAPlaying) toggleDeckA();
          if (target === 0 && deckBPlaying) toggleDeckB();
          return target;
        }
        return next;
      });
    }, 50);
  };

  const toggleEffect = (effect: string) => {
    if (activeEffect === effect) {
      setActiveEffect(null);
    } else {
      setActiveEffect(effect);
      if (effect === 'SCRATCH') {
        // Trigger a scratch sound if possible, or just visual
        setTimeout(() => setActiveEffect(null), 500);
      }
    }
  };

  const loadToDeck = (song: Song, deck: 'A' | 'B') => {
    if (song.buffer) {
      loadDeckBuffer(deck, song.buffer);
    }

    if (deck === 'A') {
      if (deckAPlaying) toggleDeckA();
      if (deckATrack) addToHistory(deckATrack);
      setDeckATrack(song);
    } else {
      if (deckBPlaying) toggleDeckB();
      if (deckBTrack) addToHistory(deckBTrack);
      setDeckBTrack(song);
    }
    // Don't remove from library if it's the "upload", just close modal
    setShowLoadModalFor(null);
  };

  const addToHistory = (song: Song) => {
    setPlayedHistory(prev => [song, ...prev]);
  };

  const restoreFromHistory = (song: Song) => {
    setPlayedHistory(prev => prev.filter(s => s.id !== song.id));
    setLibrary(prev => [song, ...prev]);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0] && showLoadModalFor) {
      const file = e.target.files[0];
      const arrayBuffer = await file.arrayBuffer();
      const audioBuffer = await decodeAudioData(arrayBuffer);
      
      const newSong: Song = {
        id: `upload-${Date.now()}`,
        title: file.name.replace(/\.[^/.]+$/, ""),
        artist: "Uploaded Track",
        bpm: 128, // Auto-detect in real app
        key: "Cm",
        coverColor: "gray",
        duration: "0:00",
        buffer: audioBuffer
      };
      
      // Add to library so it's searchable
      setLibrary(prev => [newSong, ...prev]);
      
      loadToDeck(newSong, showLoadModalFor);
    }
  };
  
  const filteredLibrary = library.filter(s => 
      s.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
      s.artist.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="h-full flex flex-col bg-gray-950 text-white font-sans overflow-hidden relative">
      <input type="file" ref={fileInputRef} className="hidden" accept="audio/*" onChange={handleFileUpload} />

      {/* DJ Toolbar */}
      <div className="flex items-center justify-between px-6 py-3 bg-black border-b border-gray-900 shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1 bg-gray-900 rounded border border-gray-800">
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
            <span className="font-bold tracking-widest text-[10px] text-red-500">LIVE AIR</span>
          </div>
          <div className="font-mono text-xl text-blue-400 glow-text">
             {deckAPlaying ? deckATrack?.bpm : (deckBPlaying ? deckBTrack?.bpm : "128.00")} BPM
          </div>
        </div>
        <button 
           onClick={onSave}
           className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-sm font-bold text-xs uppercase tracking-wider transition-colors"
        >
          <Save size={14} /> Export Set
        </button>
      </div>

      {/* DECKS SECTION (Top Half) */}
      <div className="flex-1 flex flex-col md:flex-row relative border-b border-gray-800">
        
        {/* DECK A */}
        <div className="flex-1 bg-gray-900 p-4 flex flex-col items-center justify-center border-r border-gray-800 relative overflow-hidden group">
           <div className={`absolute inset-0 bg-cyan-900/5 ${crossfader < 40 ? 'opacity-100' : 'opacity-20'} transition-opacity pointer-events-none`}></div>
           
           {/* Track Info Overlay */}
           <div className="absolute top-4 left-4 right-4 flex justify-between items-start z-10">
              <div className="bg-black/60 backdrop-blur px-3 py-1 rounded border border-cyan-900/30">
                <div className="text-cyan-400 font-bold text-sm">{deckATrack ? deckATrack.title : "NO TRACK LOADED"}</div>
                <div className="text-gray-500 text-xs">{deckATrack ? deckATrack.artist : "Select from Crate"}</div>
              </div>
              <div className="text-4xl font-black text-gray-800 select-none">A</div>
           </div>

           {/* Platter */}
           <div className={`relative w-48 h-48 md:w-64 md:h-64 rounded-full border-[6px] border-gray-800 bg-gray-950 shadow-2xl flex items-center justify-center mb-6 transition-transform duration-[2s] ${deckAPlaying ? 'animate-[spin_4s_linear_infinite]' : ''}`}>
              <div className={`absolute inset-2 rounded-full opacity-80 ${deckATrack ? `bg-${deckATrack.coverColor}-500` : 'bg-gray-800'}`}></div>
              <div className="absolute inset-0 rounded-full border border-gray-700/50"></div>
              <div className="relative w-20 h-20 bg-black rounded-full flex items-center justify-center border-2 border-gray-700 z-10">
                 <Music size={24} className="text-gray-500" />
              </div>
           </div>

           {/* Deck Controls */}
           <div className="flex gap-4 w-full justify-center z-10 items-center">
              <button 
                onClick={toggleDeckA}
                className={`w-14 h-14 rounded-full flex items-center justify-center shadow-[0_0_15px_rgba(0,0,0,0.5)] transition-all ${deckAPlaying ? 'bg-cyan-500 text-black scale-95 shadow-[0_0_15px_rgba(6,182,212,0.5)]' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
              >
                {deckAPlaying ? <Pause fill="currentColor" size={20} /> : <Play fill="currentColor" size={20} className="ml-1" />}
              </button>
              <div className="flex flex-col gap-2">
                 <button onClick={() => handleCue('A')} className="px-3 py-1 bg-gray-800 rounded text-[10px] font-bold hover:bg-gray-700 border border-gray-700">CUE</button>
                 <button onClick={() => handleSync('A')} className="px-3 py-1 bg-gray-800 rounded text-[10px] font-bold hover:bg-gray-700 border border-gray-700 text-cyan-500">SYNC</button>
              </div>
              {/* Load Button */}
              <button 
                onClick={() => setShowLoadModalFor('A')}
                className="ml-2 w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center hover:bg-gray-700 border border-gray-700 text-cyan-500"
                title="Load Music"
              >
                <Music size={16} />
              </button>
           </div>
        </div>

        {/* CENTER MIXER */}
        <div className="w-full md:w-72 bg-[#121214] flex flex-col items-center py-4 px-3 gap-4 border-x border-gray-900 z-10 shadow-2xl relative">
           <div className="w-full h-20 bg-black rounded border border-gray-800 p-1 opacity-80">
             <Visualizer isPlaying={deckAPlaying || deckBPlaying} color="#a855f7" />
           </div>

           <div className="grid grid-cols-2 gap-2 w-full flex-1">
              <button onClick={() => toggleEffect('SCREECH')} className={`rounded bg-gray-900 border border-gray-800 font-bold text-[10px] flex flex-col items-center justify-center gap-1 transition-all ${activeEffect === 'SCREECH' ? 'bg-yellow-600 text-white' : 'text-gray-500'}`}>
                <Mic2 size={14} /> SCREECH
              </button>
              <button onClick={() => toggleEffect('SUPPRESS')} className={`rounded bg-gray-900 border border-gray-800 font-bold text-[10px] flex flex-col items-center justify-center gap-1 transition-all ${activeEffect === 'SUPPRESS' ? 'bg-red-600 text-white' : 'text-gray-500'}`}>
                <Volume2 size={14} /> KILL
              </button>
              <button onClick={startAutoMix} disabled={isAutoMixing} className={`col-span-2 rounded font-bold text-[10px] flex items-center justify-center gap-2 transition-all ${isAutoMixing ? 'bg-indigo-600 text-white animate-pulse' : 'bg-gray-900 border border-indigo-900 text-indigo-400'}`}>
                <Sparkles size={14} /> {isAutoMixing ? "MIXING..." : "AI AUTO-MIX"}
              </button>
           </div>

           <div className="w-full mt-auto mb-2">
              <div className="flex justify-between text-[8px] text-gray-600 mb-1 font-mono uppercase tracking-widest">
                <span>A</span>
                <span>FADE</span>
                <span>B</span>
              </div>
              <input type="range" min="0" max="100" value={crossfader} onChange={(e) => setCrossfader(parseInt(e.target.value))} className="w-full h-6 bg-black rounded-sm appearance-none cursor-ew-resize border border-gray-800 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-8 [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:bg-gray-400 [&::-webkit-slider-thumb]:rounded-sm [&::-webkit-slider-thumb]:border-x-2 [&::-webkit-slider-thumb]:border-black" />
           </div>
        </div>

        {/* DECK B */}
        <div className="flex-1 bg-gray-900 p-4 flex flex-col items-center justify-center border-l border-gray-800 relative overflow-hidden">
           <div className={`absolute inset-0 bg-purple-900/5 ${crossfader > 60 ? 'opacity-100' : 'opacity-20'} transition-opacity pointer-events-none`}></div>
           
           <div className="absolute top-4 left-4 right-4 flex justify-between items-start z-10 flex-row-reverse">
              <div className="bg-black/60 backdrop-blur px-3 py-1 rounded border border-purple-900/30 text-right">
                <div className="text-purple-400 font-bold text-sm">{deckBTrack ? deckBTrack.title : "NO TRACK LOADED"}</div>
                <div className="text-gray-500 text-xs">{deckBTrack ? deckBTrack.artist : "Select from Crate"}</div>
              </div>
              <div className="text-4xl font-black text-gray-800 select-none">B</div>
           </div>

           <div className={`relative w-48 h-48 md:w-64 md:h-64 rounded-full border-[6px] border-gray-800 bg-gray-950 shadow-2xl flex items-center justify-center mb-6 transition-transform duration-[2s] ${deckBPlaying ? 'animate-[spin_4s_linear_infinite]' : ''}`}>
              <div className={`absolute inset-2 rounded-full opacity-80 ${deckBTrack ? `bg-${deckBTrack.coverColor}-500` : 'bg-gray-800'}`}></div>
              <div className="absolute inset-0 rounded-full border border-gray-700/50"></div>
              <div className="relative w-20 h-20 bg-black rounded-full flex items-center justify-center border-2 border-gray-700 z-10">
                 <Music size={24} className="text-gray-500" />
              </div>
           </div>

           <div className="flex gap-4 w-full justify-center z-10 items-center">
              <button 
                onClick={toggleDeckB}
                className={`w-14 h-14 rounded-full flex items-center justify-center shadow-[0_0_15px_rgba(0,0,0,0.5)] transition-all ${deckBPlaying ? 'bg-purple-500 text-white scale-95 shadow-[0_0_15px_rgba(168,85,247,0.5)]' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
              >
                {deckBPlaying ? <Pause fill="currentColor" size={20} /> : <Play fill="currentColor" size={20} className="ml-1" />}
              </button>
              <div className="flex flex-col gap-2">
                 <button onClick={() => handleCue('B')} className="px-3 py-1 bg-gray-800 rounded text-[10px] font-bold hover:bg-gray-700 border border-gray-700">CUE</button>
                 <button onClick={() => handleSync('B')} className="px-3 py-1 bg-gray-800 rounded text-[10px] font-bold hover:bg-gray-700 border border-gray-700 text-purple-500">SYNC</button>
              </div>
              {/* Load Button */}
              <button 
                onClick={() => setShowLoadModalFor('B')}
                className="ml-2 w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center hover:bg-gray-700 border border-gray-700 text-purple-500"
                title="Load Music"
              >
                <Music size={16} />
              </button>
           </div>
        </div>

      </div>

      {/* LIBRARY SECTION (Bottom Half) */}
      <div className="h-64 bg-black flex border-t border-gray-800">
        <div className="flex-1 border-r border-gray-800 flex flex-col">
          <div className="p-3 bg-gray-900 border-b border-gray-800 flex justify-between items-center">
             <div className="flex items-center gap-2 text-white font-bold text-sm">
                <Disc size={16} className="text-cyan-500" /> DIGITAL CRATE
             </div>
             <div className="flex items-center gap-2 bg-black rounded-full px-2 py-1 border border-gray-800">
                <Search size={12} className="text-gray-500" />
                <input 
                    type="text" 
                    placeholder="Search..." 
                    className="bg-transparent text-xs outline-none text-gray-400 w-24"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
             </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {filteredLibrary.map((song) => (
              <div key={song.id} className="group flex items-center justify-between p-2 rounded bg-gray-900/50 hover:bg-gray-800 border border-transparent hover:border-gray-700 transition-all">
                 <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded bg-${song.coverColor}-900 flex items-center justify-center text-${song.coverColor}-400 font-bold border border-${song.coverColor}-500/30`}>
                      <Music size={16} />
                    </div>
                    <div>
                       <div className="text-sm font-bold text-gray-200">{song.title}</div>
                       <div className="text-xs text-gray-500">{song.artist} • {song.bpm} BPM</div>
                    </div>
                 </div>
                 <div className="flex gap-2 opacity-50 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => loadToDeck(song, 'A')} className="px-2 py-1 bg-cyan-900/40 text-cyan-400 border border-cyan-800 hover:bg-cyan-900 rounded text-[10px] font-bold flex items-center gap-1">LOAD A <ArrowLeft size={10} /></button>
                    <button onClick={() => loadToDeck(song, 'B')} className="px-2 py-1 bg-purple-900/40 text-purple-400 border border-purple-800 hover:bg-purple-900 rounded text-[10px] font-bold flex items-center gap-1"><ArrowRight size={10} /> LOAD B</button>
                 </div>
              </div>
            ))}
          </div>
        </div>
        <div className="w-1/3 flex flex-col bg-[#0f0f10]">
           <div className="p-3 bg-gray-900 border-b border-gray-800 flex justify-between items-center">
             <div className="flex items-center gap-2 text-gray-400 font-bold text-sm">
                <Clock size={16} /> HISTORY
             </div>
             <button onClick={() => setPlayedHistory([])} className="text-[10px] text-gray-600 hover:text-white">CLEAR</button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
             {playedHistory.map((song) => (
               <div key={song.id} className="flex items-center justify-between p-2 rounded bg-gray-900/30 border border-gray-800/50 opacity-60">
                  <div className="text-xs font-bold text-gray-400">{song.title}</div>
                  <button onClick={() => restoreFromHistory(song)} className="text-gray-600 hover:text-green-500"><RotateCcw size={12} /></button>
               </div>
             ))}
          </div>
        </div>
      </div>

      {/* LOAD MUSIC MODAL */}
      {showLoadModalFor && (
        <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-200">
           <div className="bg-gray-900 border border-gray-700 w-full max-w-lg rounded-2xl shadow-2xl p-6">
              <div className="flex justify-between items-center mb-6">
                 <h2 className="text-xl font-bold text-white flex items-center gap-2">
                   <Disc className={showLoadModalFor === 'A' ? "text-cyan-500" : "text-purple-500"} />
                   Load Deck {showLoadModalFor}
                 </h2>
                 <button onClick={() => setShowLoadModalFor(null)} className="text-gray-400 hover:text-white"><ArrowLeft size={24} /></button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                 {/* Upload */}
                 <button 
                   onClick={() => fileInputRef.current?.click()}
                   className="h-32 bg-gray-800 rounded-xl border-2 border-dashed border-gray-600 hover:border-white hover:bg-gray-750 flex flex-col items-center justify-center gap-2 transition-all group"
                 >
                    <Upload size={32} className="text-gray-500 group-hover:text-white" />
                    <span className="font-bold text-sm text-gray-400 group-hover:text-white">Upload File</span>
                    <span className="text-xs text-gray-600">MP3, WAV, AAC</span>
                 </button>

                 {/* Connect Streaming */}
                 <button 
                   onClick={() => alert("Simulating connection to streaming services...\n(This would open OAuth in production)")}
                   className="h-32 bg-green-900/30 rounded-xl border border-green-700/50 hover:bg-green-900/50 flex flex-col items-center justify-center gap-2 transition-all group"
                 >
                    <Wifi size={32} className="text-green-500 group-hover:scale-110 transition-transform" />
                    <span className="font-bold text-sm text-green-400">Connect Spotify</span>
                    <span className="text-xs text-green-600">Premium Required</span>
                 </button>

                 {/* Phone Library */}
                 <button 
                   onClick={() => fileInputRef.current?.click()}
                   className="col-span-2 h-24 bg-blue-900/20 rounded-xl border border-blue-700/30 hover:bg-blue-900/30 flex items-center justify-center gap-4 transition-all"
                 >
                    <Smartphone size={24} className="text-blue-400" />
                    <div className="text-left">
                       <div className="font-bold text-blue-200">Import from Device</div>
                       <div className="text-xs text-blue-400">Access local music library on phone/PC</div>
                    </div>
                 </button>
              </div>

              <div className="mt-6">
                 <h3 className="text-xs font-bold text-gray-500 uppercase mb-2">Select from Crate</h3>
                 <div className="h-32 overflow-y-auto space-y-1">
                    {library.map(s => (
                       <button 
                         key={s.id}
                         onClick={() => loadToDeck(s, showLoadModalFor)}
                         className="w-full text-left p-2 rounded hover:bg-gray-800 flex justify-between items-center group"
                       >
                          <span className="text-sm font-bold text-gray-300 group-hover:text-white">{s.title}</span>
                          <span className="text-xs text-gray-600">{s.bpm} BPM</span>
                       </button>
                    ))}
                 </div>
              </div>

           </div>
        </div>
      )}

    </div>
  );
};