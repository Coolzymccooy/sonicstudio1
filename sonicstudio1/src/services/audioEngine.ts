import { InstrumentType } from "../types";

let audioCtx: AudioContext | null = null;
let masterCompressor: DynamicsCompressorNode | null = null;
let masterGain: GainNode | null = null;
let masterLimiter: DynamicsCompressorNode | null = null; // Safety Limiter
let masterStreamDest: MediaStreamAudioDestinationNode | null = null;

// Resource tracking to prevent memory leaks
const activeSourceNodes: Set<AudioBufferSourceNode | OscillatorNode> = new Set();

// DJ Decks State
interface DeckState {
  source: AudioBufferSourceNode | null;
  gain: GainNode;
  buffer: AudioBuffer | null;
  isPlaying: boolean;
  startTime: number;
  offset: number; // For pausing and resuming
}

const deckNodes: { [key: string]: DeckState } = {};

// Live Vocal Chain Nodes
let microphoneStreamSource: MediaStreamAudioSourceNode | null = null;
let vocalGateNode: GainNode | null = null;
let vocalAnalyser: AnalyserNode | null = null;
let vocalChainInput: GainNode | null = null;
let vocalChainOutput: GainNode | null = null;
let vocalBypassNode: GainNode | null = null;
let vocalProcessChain: GainNode | null = null;

// Analysis State for UI
let currentVocalLevel = -100;
let currentNoiseFloor = -60;
let isGateOpen = false;
let adaptiveGateThreshold = -40;

// Helper to get or create context with interaction check
export const getAudioContext = () => {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    audioCtx = new AudioContextClass({
      latencyHint: 'interactive', 
      sampleRate: 44100,
    });
    
    // CHAIN: MasterGain -> Compressor (Glue) -> Limiter (Safety) -> Destination
    
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.9;
    
    masterCompressor = audioCtx.createDynamicsCompressor();
    masterCompressor.threshold.value = -24;
    masterCompressor.knee.value = 30;
    masterCompressor.ratio.value = 12;
    masterCompressor.attack.value = 0.003;
    masterCompressor.release.value = 0.25;

    // Hard Limiter to prevent the "Noise Eruption" (Feedback loops going to Infinity)
    masterLimiter = audioCtx.createDynamicsCompressor();
    masterLimiter.threshold.value = -0.5; // Catch peaks just before clipping
    masterLimiter.knee.value = 0;
    masterLimiter.ratio.value = 20; // Hard limit
    masterLimiter.attack.value = 0.001;
    masterLimiter.release.value = 0.1;

    // Stream Destination for Recording the Master Output
    masterStreamDest = audioCtx.createMediaStreamDestination();

    masterGain.connect(masterCompressor);
    masterCompressor.connect(masterLimiter);
    masterLimiter.connect(audioCtx.destination);
    masterLimiter.connect(masterStreamDest); // Record the final limited output
  }
  return audioCtx;
};

export const getMasterRecordingStream = (): MediaStream => {
  getAudioContext(); // Ensure init
  if (!masterStreamDest) throw new Error("Audio Engine not initialized");
  return masterStreamDest.stream;
};

// --- SYSTEM UTILITIES ---

export const getAudioState = () => {
  return audioCtx ? audioCtx.state : 'uninitialized';
};

export const suspendAudio = async () => {
  if (audioCtx && audioCtx.state === 'running') {
    await audioCtx.suspend();
    // Emergency cleanup
    activeSourceNodes.forEach(node => {
      try { node.stop(); node.disconnect(); } catch(e){}
    });
    activeSourceNodes.clear();
  }
};

export const getVocalAnalysis = () => {
  return {
    level: currentVocalLevel, 
    isOpen: isGateOpen,
    thresholdDb: adaptiveGateThreshold
  };
};

export const playTestTone = async () => {
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') await ctx.resume();
  
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(440, ctx.currentTime); 
  gain.gain.setValueAtTime(0.5, ctx.currentTime); // Lower volume safety
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.0);
  
  osc.connect(gain);
  gain.connect(ctx.destination);
  
  osc.start();
  osc.stop(ctx.currentTime + 1.0);
  return "Playing Tone (440Hz)...";
};

export const unlockAudioContext = async () => {
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') {
    await ctx.resume();
  }
  
  // Play silent buffer to unlock
  const buffer = ctx.createBuffer(1, 1, 22050);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  source.start(0);

  if (!deckNodes['A']) initDeckNode('A');
  if (!deckNodes['B']) initDeckNode('B');

  return ctx.state;
};

export const initAudio = unlockAudioContext;

const initDeckNode = (id: string) => {
  const ctx = getAudioContext();
  const gain = ctx.createGain();
  gain.connect(masterGain!);
  deckNodes[id] = {
    source: null,
    gain: gain,
    buffer: null,
    isPlaying: false,
    startTime: 0,
    offset: 0
  };
};

// --- GENERIC SAMPLE PLAYER (For Sampler Mode) ---
export const playBufferRaw = (buffer: AudioBuffer, volume: number = 1.0, loop: boolean = false): AudioBufferSourceNode => {
  const ctx = getAudioContext();
  const source = ctx.createBufferSource();
  const gain = ctx.createGain();
  
  source.buffer = buffer;
  source.loop = loop;
  gain.gain.value = volume;
  
  source.connect(gain);
  gain.connect(masterGain!);
  
  source.start();
  
  // Track active nodes for cleanup if needed
  activeSourceNodes.add(source);
  source.onended = () => {
      activeSourceNodes.delete(source);
      // Disconnect to ensure garbage collection
      setTimeout(() => {
          try {
            source.disconnect();
            gain.disconnect();
          } catch(e) {}
      }, 100);
  };
  
  return source;
};

// --- DJ ENGINE ---

export const loadDeckBuffer = (deckId: 'A' | 'B', buffer: AudioBuffer) => {
  initAudio();
  if (deckNodes[deckId]) {
    stopDeck(deckId); 
    deckNodes[deckId].buffer = buffer;
    deckNodes[deckId].offset = 0;
  }
};

export const startDeck = (deckId: 'A' | 'B', bpm: number, volume: number) => {
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') ctx.resume();

  const deck = deckNodes[deckId];
  if (!deck) return;
  if (deck.isPlaying) return; 

  deck.gain.gain.setValueAtTime(volume, ctx.currentTime);

  if (deck.buffer) {
    const source = ctx.createBufferSource();
    source.buffer = deck.buffer;
    source.loop = true;
    source.connect(deck.gain);
    source.start(0, deck.offset % deck.buffer.duration);
    deck.source = source;
    deck.startTime = ctx.currentTime;
    deck.isPlaying = true;
  } else {
    playSynthLoop(deckId, bpm, volume);
  }
};

export const pauseDeck = (deckId: 'A' | 'B') => {
  const ctx = getAudioContext();
  const deck = deckNodes[deckId];
  if (deck && deck.isPlaying && deck.source) {
    deck.source.stop();
    deck.source = null;
    deck.isPlaying = false;
    deck.offset += ctx.currentTime - deck.startTime;
  } else if (deck && deck.isPlaying) {
    stopDeck(deckId);
  }
};

export const stopDeck = (deckId: 'A' | 'B') => {
  const deck = deckNodes[deckId];
  if (deck) {
    if (deck.source) {
      try { deck.source.stop(); } catch(e) {}
      deck.source = null;
    }
    deck.isPlaying = false;
    deck.offset = 0;
  }
};

export const setDeckVolume = (deckId: 'A' | 'B', volume: number) => {
  const ctx = getAudioContext();
  if (deckNodes[deckId]) {
    deckNodes[deckId].gain.gain.setTargetAtTime(volume, ctx.currentTime, 0.05);
  }
};

const playSynthLoop = (deckId: 'A' | 'B', bpm: number, volume: number) => {
  const ctx = getAudioContext();
  const deck = deckNodes[deckId];
  deck.isPlaying = true;
  const sr = ctx.sampleRate;
  const beatLen = 60 / bpm;
  const barLen = beatLen * 4;
  const frameCount = sr * barLen;
  const buffer = ctx.createBuffer(2, frameCount, sr);
  
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < frameCount; i++) {
      const t = i / sr;
      const beatTime = t % beatLen;
      if (beatTime < 0.1) {
        data[i] = Math.sin(2 * Math.PI * 100 * beatTime) * Math.exp(-10 * beatTime);
      }
    }
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  source.connect(deck.gain);
  source.start();
  deck.source = source;
};


// --- PRO VOCAL CHAIN ---
export const setupLiveVocalChain = async (stream: MediaStream, thresholdDB: number = -40, aiEnhance: boolean = true) => {
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') await ctx.resume();

  if (microphoneStreamSource) {
    try { microphoneStreamSource.disconnect(); } catch(e){}
  }

  adaptiveGateThreshold = thresholdDB;

  microphoneStreamSource = ctx.createMediaStreamSource(stream);
  vocalAnalyser = ctx.createAnalyser();
  vocalAnalyser.fftSize = 2048; 
  vocalAnalyser.smoothingTimeConstant = 0.3;
  
  // 1. INPUT STAGE
  vocalChainInput = ctx.createGain();
  
  // 2. VOICE ISOLATION (BANDPASS)
  // Cuts < 85Hz (Generator Hum, Truck rumble)
  const lowCut = ctx.createBiquadFilter();
  lowCut.type = 'highpass';
  lowCut.frequency.value = 85; 

  // Cuts > 10kHz (High Hiss)
  const highCut = ctx.createBiquadFilter();
  highCut.type = 'lowpass';
  highCut.frequency.value = 10000;

  // Boosts "Presence" (Voice Intelligibility)
  const presence = ctx.createBiquadFilter();
  presence.type = 'peaking';
  presence.frequency.value = 2500;
  presence.gain.value = 3; // +3dB boost for clarity
  presence.Q.value = 0.5;

  // 3. THE HYPERGATE
  vocalGateNode = ctx.createGain();
  vocalGateNode.gain.value = 0; // Start closed

  // 4. COMPRESSION (Levelling)
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -30;
  compressor.ratio.value = 4; 
  compressor.attack.value = 0.002;
  compressor.release.value = 0.15;
  
  // Chain Connections
  microphoneStreamSource.connect(vocalChainInput);
  vocalChainInput.connect(lowCut);
  lowCut.connect(highCut);
  highCut.connect(presence);
  
  // Analyzer sits before the gate so we can see noise floor
  presence.connect(vocalAnalyser);
  
  // Gate sits after filtering (so we don't gate based on rumble)
  presence.connect(vocalGateNode);

  // Split Output: Processed vs Clean/Bypass
  vocalProcessChain = ctx.createGain(); 
  vocalBypassNode = ctx.createGain();   

  vocalGateNode.connect(compressor);
  compressor.connect(vocalProcessChain);
  
  // Bypass route (for when AI Polish is OFF but we still want audio)
  vocalGateNode.connect(vocalBypassNode);

  if (masterGain) {
    vocalProcessChain.connect(masterGain);
    vocalBypassNode.connect(masterGain);
  }

  setVocalEnhance(aiEnhance);
  
  // Start the analysis loop
  processAdaptiveGate(thresholdDB);
  
  return vocalGateNode;
};

export const setVocalEnhance = (enabled: boolean) => {
  const ctx = getAudioContext();
  const t = ctx.currentTime;
  if (vocalProcessChain && vocalBypassNode) {
    if (enabled) {
      vocalProcessChain.gain.setTargetAtTime(1, t, 0.02);
      vocalBypassNode.gain.setTargetAtTime(0, t, 0.02);
    } else {
      vocalProcessChain.gain.setTargetAtTime(0, t, 0.02);
      vocalBypassNode.gain.setTargetAtTime(1, t, 0.02);
    }
  }
};

// NEW: Adaptive Gate Logic
const processAdaptiveGate = (userThresholdDB: number) => {
  if (!vocalAnalyser || !vocalGateNode) return;
  const dataArray = new Uint8Array(vocalAnalyser.frequencyBinCount);
  
  const checkGate = () => {
    if (!vocalAnalyser || !vocalGateNode) return;
    vocalAnalyser.getByteFrequencyData(dataArray);
    
    // Calculate RMS Level
    let sum = 0;
    const startBin = Math.floor(100 / (44100 / 2048)); 
    const endBin = Math.floor(8000 / (44100 / 2048)); 
    
    for (let i = startBin; i < endBin; i++) {
        sum += (dataArray[i] / 255) * (dataArray[i] / 255);
    }
    const rms = Math.sqrt(sum / (endBin - startBin));
    
    // Convert to dB
    let levelDB = 20 * Math.log10(rms || 0.001); 
    levelDB = Math.max(-100, levelDB * 100 + 40); 

    currentVocalLevel = levelDB;
    adaptiveGateThreshold = userThresholdDB;

    // Gate Logic
    if (levelDB > userThresholdDB) {
      vocalGateNode.gain.setTargetAtTime(1, getAudioContext().currentTime, 0.01); 
      isGateOpen = true;
    } else {
      vocalGateNode.gain.setTargetAtTime(0, getAudioContext().currentTime + 0.1, 0.3); 
      isGateOpen = false;
    }
    requestAnimationFrame(checkGate);
  };
  checkGate();
};

export const decodeAudioData = async (arrayBuffer: ArrayBuffer): Promise<AudioBuffer> => {
  const ctx = getAudioContext();
  return await ctx.decodeAudioData(arrayBuffer);
};

// --- PLAYBACK ENGINE ---

export const playSound = (type: InstrumentType, volume: number, pan: number, customBuffer?: AudioBuffer | null) => {
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') ctx.resume();

  const t = ctx.currentTime + 0.01;
  const trackGain = ctx.createGain();
  trackGain.gain.setValueAtTime(volume, t);
  const panner = ctx.createStereoPanner();
  panner.pan.setValueAtTime(pan, t);
  trackGain.connect(panner);
  panner.connect(masterGain!); 

  if (customBuffer) {
    playSample(ctx, customBuffer, trackGain, t);
    return;
  }

  switch (type) {
    case InstrumentType.DRUMS: playProKick(ctx, trackGain, t); break;
    case InstrumentType.BASS: playProBass(ctx, trackGain, t); break;
    case InstrumentType.SYNTH: playProSynth(ctx, trackGain, t); break;
    case InstrumentType.VOCAL: playVocalSynth(ctx, trackGain, t); break;
    case InstrumentType.PIANO: playPiano(ctx, trackGain, t); break;
    case InstrumentType.GUITAR: playGuitar(ctx, trackGain, t); break;
    case InstrumentType.STRINGS: playStrings(ctx, trackGain, t); break;
    case InstrumentType.EIGHT_OH_EIGHT: play808(ctx, trackGain, t); break;
  }
};

const playSample = (ctx: AudioContext, buffer: AudioBuffer, output: AudioNode, t: number) => {
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(output);
  
  // Clean up old nodes if overlapping significantly
  activeSourceNodes.add(source);
  source.onended = () => activeSourceNodes.delete(source);

  source.start(t);
};

// ... existing synth functions (playProKick, etc) ...
const playProKick = (ctx: AudioContext, output: AudioNode, t: number) => {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.setValueAtTime(150, t);
  osc.frequency.exponentialRampToValueAtTime(40, t + 0.5);
  gain.gain.setValueAtTime(1.0, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
  osc.connect(gain);
  gain.connect(output);
  osc.start(t);
  osc.stop(t + 0.6);
};

const playProBass = (ctx: AudioContext, output: AudioNode, t: number) => {
  const osc = ctx.createOscillator();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(55, t); 
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(800, t);
  filter.frequency.exponentialRampToValueAtTime(100, t + 0.2);
  gain.gain.setValueAtTime(0.8, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(output);
  osc.start(t);
  osc.stop(t + 0.5);
};

const playProSynth = (ctx: AudioContext, output: AudioNode, t: number) => {
  const osc1 = ctx.createOscillator();
  const gain = ctx.createGain();
  osc1.type = 'square';
  osc1.frequency.setValueAtTime(440, t);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(2000, t);
  gain.gain.setValueAtTime(0.4, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
  osc1.connect(filter);
  filter.connect(gain);
  gain.connect(output);
  osc1.start(t);
  osc1.stop(t + 0.4);
};

const playVocalSynth = (ctx: AudioContext, output: AudioNode, t: number) => {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(220, t);
  gain.gain.setValueAtTime(0.3, t);
  gain.gain.linearRampToValueAtTime(0, t + 0.4);
  osc.connect(gain);
  gain.connect(output);
  osc.start(t);
  osc.stop(t + 0.5);
};

const playPiano = (ctx: AudioContext, output: AudioNode, t: number) => {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(523.25, t); 
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(0.8, t + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.01, t + 1.5);
  osc.connect(gain);
  gain.connect(output);
  osc.start(t);
  osc.stop(t + 1.5);
};

const playGuitar = (ctx: AudioContext, output: AudioNode, t: number) => {
  const osc = ctx.createOscillator();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(329.63, t); 
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(2000, t);
  filter.frequency.linearRampToValueAtTime(500, t + 0.3);
  gain.gain.setValueAtTime(0.6, t);
  gain.gain.exponentialRampToValueAtTime(0.01, t + 0.8);
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(output);
  osc.start(t);
  osc.stop(t + 0.8);
};

const playStrings = (ctx: AudioContext, output: AudioNode, t: number) => {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(440, t);
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(0.4, t + 0.2);
  gain.gain.linearRampToValueAtTime(0, t + 0.8);
  osc.connect(gain);
  gain.connect(output);
  osc.start(t);
  osc.stop(t + 0.8);
};

const play808 = (ctx: AudioContext, output: AudioNode, t: number) => {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.setValueAtTime(150, t);
  osc.frequency.exponentialRampToValueAtTime(40, t + 0.1); 
  gain.gain.setValueAtTime(1, t);
  gain.gain.exponentialRampToValueAtTime(0.01, t + 0.8);
  osc.connect(gain);
  gain.connect(output);
  osc.start(t);
  osc.stop(t + 0.9);
};