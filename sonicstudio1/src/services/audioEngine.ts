// src/service/audioEngine.ts
import { InstrumentType } from "../types";

/**
 * AUDIO ENGINE (Refactor - Non-breaking)
 * -------------------------------------
 * Kept all existing exports + logic.
 * Added:
 *  - Master "studio bass" enhancement (low shelf + sub enhancer) with safe limiter
 *  - Groove engine helpers (swing + humanize) usable by Grade1/DAW sequencing
 *  - Optional sample layer hooks (Rhodes/piano/horns/upright bass) if you provide buffers
 *  - Stronger safety + cleanup patterns
 *
 * NOTE: This file still supports:
 *  - DJ decks A/B
 *  - Master recording stream
 *  - Live vocal chain with gate + analysis
 *  - Sampler raw playback
 */

// -----------------------------
// Core WebAudio singletons
// -----------------------------
let audioCtx: AudioContext | null = null;
let masterCompressor: DynamicsCompressorNode | null = null;
let masterGain: GainNode | null = null;
let masterLimiter: DynamicsCompressorNode | null = null;
let masterStreamDest: MediaStreamAudioDestinationNode | null = null;

// NEW: "Studio tone" nodes (pre-master glue)
let masterPreGain: GainNode | null = null;
let masterBassShelf: BiquadFilterNode | null = null;
let masterSubEnhancer: WaveShaperNode | null = null;
let masterStereoWidener: StereoPannerNode | null = null; // lightweight “center” control

// NEW: optional analyser on master for UI metering later (non-breaking)
let masterAnalyser: AnalyserNode | null = null;

// Resource tracking to prevent memory leaks
const activeSourceNodes: Set<AudioBufferSourceNode | OscillatorNode> = new Set();

// -----------------------------
// Groove feel (swing/humanize)
// -----------------------------
type GrooveFeel = {
  swing: number; // 0..1 (0 = straight)
  humanizeMs: number; // 0..60-ish
};

let grooveFeel: GrooveFeel = {
  swing: 0.15,
  humanizeMs: 10,
};

export const setGrooveFeel = (feel: Partial<GrooveFeel>) => {
  grooveFeel = { ...grooveFeel, ...feel };
};

export const getGrooveFeel = () => grooveFeel;

// Compute scheduled time for a step index in a 16-step bar.
// Applies swing to offbeats and random humanize jitter.
export const computeStepTime = (
  barStartTime: number,
  bpm: number,
  stepIndex: number
) => {
  const ctx = getAudioContext();
  const stepDur = (60 / bpm) / 4; // 16th note
  let t = barStartTime + stepIndex * stepDur;

  // Swing: delay the "off" 16ths (odd steps) by a fraction of stepDur
  const swingAmt = Math.max(0, Math.min(1, grooveFeel.swing));
  if (stepIndex % 2 === 1) {
    t += stepDur * 0.33 * swingAmt; // classic MPC-ish swing direction
  }

  // Humanize: random +/- jitter in seconds
  const hm = Math.max(0, grooveFeel.humanizeMs);
  const jitter = ((Math.random() * 2 - 1) * hm) / 1000;
  t += jitter;

  // Never schedule in the past
  return Math.max(t, ctx.currentTime + 0.002);
};

// -----------------------------
// DJ Decks State
// -----------------------------
interface DeckState {
  source: AudioBufferSourceNode | null;
  gain: GainNode;
  buffer: AudioBuffer | null;
  isPlaying: boolean;
  startTime: number;
  offset: number; // For pausing and resuming
}

const deckNodes: { [key: string]: DeckState } = {};

// -----------------------------
// Live Vocal Chain Nodes
// -----------------------------
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

// -----------------------------
// Helpers
// -----------------------------
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

const safeDisconnect = (node: AudioNode | null) => {
  if (!node) return;
  try {
    node.disconnect();
  } catch {}
};

// Soft saturation curve for “sub enhancer”
const makeSubEnhancerCurve = (amount: number) => {
  // amount 0..1
  const k = 2 + amount * 18;
  const n = 44100;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = (1 + k) * x / (1 + k * Math.abs(x));
  }
  return curve;
};

// -----------------------------
// Context init
// -----------------------------
export const getAudioContext = () => {
  if (!audioCtx) {
    const AudioContextClass =
      window.AudioContext || (window as any).webkitAudioContext;

    audioCtx = new AudioContextClass({
      latencyHint: "interactive",
      sampleRate: 44100,
    });

    // --- MASTER CHAIN (refactor) ---
    // Sources -> masterPreGain -> bassShelf -> subEnhancer -> masterGain -> compressor -> limiter -> destination
    masterPreGain = audioCtx.createGain();
    masterPreGain.gain.value = 1.0;

    // "Studio Bass" low-shelf EQ (safe by default)
    masterBassShelf = audioCtx.createBiquadFilter();
    masterBassShelf.type = "lowshelf";
    masterBassShelf.frequency.value = 110;
    masterBassShelf.gain.value = 0; // default OFF (set via setMasterBassBoost)

    // Sub enhancer (soft saturation); default subtle
    masterSubEnhancer = audioCtx.createWaveShaper();
    masterSubEnhancer.curve = makeSubEnhancerCurve(0.12);
    masterSubEnhancer.oversample = "2x";

    // Optional simple stereo control
    masterStereoWidener = audioCtx.createStereoPanner();
    masterStereoWidener.pan.value = 0;

    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.9;

    masterCompressor = audioCtx.createDynamicsCompressor();
    masterCompressor.threshold.value = -24;
    masterCompressor.knee.value = 30;
    masterCompressor.ratio.value = 12;
    masterCompressor.attack.value = 0.003;
    masterCompressor.release.value = 0.25;

    // Hard Limiter to prevent “Noise Eruption”
    masterLimiter = audioCtx.createDynamicsCompressor();
    masterLimiter.threshold.value = -0.5;
    masterLimiter.knee.value = 0;
    masterLimiter.ratio.value = 20;
    masterLimiter.attack.value = 0.001;
    masterLimiter.release.value = 0.1;

    // Stream Destination for Recording the Master Output
    masterStreamDest = audioCtx.createMediaStreamDestination();

    // Optional analyser for metering
    masterAnalyser = audioCtx.createAnalyser();
    masterAnalyser.fftSize = 2048;
    masterAnalyser.smoothingTimeConstant = 0.2;

    // Wire chain
    masterPreGain.connect(masterBassShelf);
    masterBassShelf.connect(masterSubEnhancer);
    masterSubEnhancer.connect(masterStereoWidener);
    masterStereoWidener.connect(masterGain);

    masterGain.connect(masterCompressor);
    masterCompressor.connect(masterLimiter);

    masterLimiter.connect(audioCtx.destination);
    masterLimiter.connect(masterStreamDest);

    // Tap analyser post-limiter (safe)
    masterLimiter.connect(masterAnalyser);
  }

  return audioCtx;
};

export const getMasterRecordingStream = (): MediaStream => {
  getAudioContext();
  if (!masterStreamDest) throw new Error("Audio Engine not initialized");
  return masterStreamDest.stream;
};

// NEW: allow UI to boost bass safely (0..1)
export const setMasterBassBoost = (amount: number) => {
  getAudioContext();
  if (!masterBassShelf || !masterSubEnhancer) return;
  const a = clamp01(amount);

  // Low shelf EQ up to about +10dB
  masterBassShelf.gain.setTargetAtTime(10 * a, audioCtx!.currentTime, 0.03);

  // Sub enhancer intensity
  masterSubEnhancer.curve = makeSubEnhancerCurve(0.08 + 0.6 * a);
};

// NEW: optional “loudness” drive (careful)
export const setMasterDrive = (amount: number) => {
  getAudioContext();
  if (!masterPreGain) return;
  const a = clamp01(amount);
  // small drive into compressor/limiter, still protected by limiter
  masterPreGain.gain.setTargetAtTime(1.0 + a * 0.65, audioCtx!.currentTime, 0.03);
};

// NEW: optional master pan control (kept simple)
export const setMasterPan = (pan: number) => {
  getAudioContext();
  if (!masterStereoWidener) return;
  masterStereoWidener.pan.setTargetAtTime(
    Math.max(-1, Math.min(1, pan)),
    audioCtx!.currentTime,
    0.03
  );
};

// -----------------------------
// System utilities
// -----------------------------
export const getAudioState = () => {
  return audioCtx ? audioCtx.state : "uninitialized";
};

export const suspendAudio = async () => {
  if (audioCtx && audioCtx.state === "running") {
    await audioCtx.suspend();

    // Emergency cleanup
    activeSourceNodes.forEach((node) => {
      try {
        node.stop();
        node.disconnect();
      } catch {}
    });
    activeSourceNodes.clear();
  }
};

export const getVocalAnalysis = () => {
  return {
    level: currentVocalLevel,
    isOpen: isGateOpen,
    thresholdDb: adaptiveGateThreshold,
  };
};

export const playTestTone = async () => {
  const ctx = getAudioContext();
  if (ctx.state === "suspended") await ctx.resume();

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(440, ctx.currentTime);
  gain.gain.setValueAtTime(0.5, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.0);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start();
  osc.stop(ctx.currentTime + 1.0);
  return "Playing Tone (440Hz)...";
};

export const unlockAudioContext = async () => {
  const ctx = getAudioContext();
  if (ctx.state === "suspended") {
    await ctx.resume();
  }

  // Play silent buffer to unlock
  const buffer = ctx.createBuffer(1, 1, 22050);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  source.start(0);

  if (!deckNodes["A"]) initDeckNode("A");
  if (!deckNodes["B"]) initDeckNode("B");

  return ctx.state;
};

export const initAudio = unlockAudioContext;

// -----------------------------
// DJ deck init
// -----------------------------
const initDeckNode = (id: string) => {
  const ctx = getAudioContext();
  const gain = ctx.createGain();

  // NOTE: keep DJ decks feeding master chain
  gain.connect(masterPreGain!);

  deckNodes[id] = {
    source: null,
    gain: gain,
    buffer: null,
    isPlaying: false,
    startTime: 0,
    offset: 0,
  };
};

// -----------------------------
// Generic Sample Player (Sampler mode)
// -----------------------------
export const playBufferRaw = (
  buffer: AudioBuffer,
  volume: number = 1.0,
  loop: boolean = false
): AudioBufferSourceNode => {
  const ctx = getAudioContext();

  const source = ctx.createBufferSource();
  const gain = ctx.createGain();

  source.buffer = buffer;
  source.loop = loop;
  gain.gain.value = volume;

  source.connect(gain);

  // Feed master chain
  gain.connect(masterPreGain!);

  source.start();

  activeSourceNodes.add(source);
  source.onended = () => {
    activeSourceNodes.delete(source);
    setTimeout(() => {
      try {
        source.disconnect();
        gain.disconnect();
      } catch {}
    }, 100);
  };

  return source;
};

// -----------------------------
// DJ Engine (existing exports preserved)
// -----------------------------
export const loadDeckBuffer = (deckId: "A" | "B", buffer: AudioBuffer) => {
  initAudio();
  if (deckNodes[deckId]) {
    stopDeck(deckId);
    deckNodes[deckId].buffer = buffer;
    deckNodes[deckId].offset = 0;
  }
};

export const startDeck = (deckId: "A" | "B", bpm: number, volume: number) => {
  const ctx = getAudioContext();
  if (ctx.state === "suspended") ctx.resume();

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

export const pauseDeck = (deckId: "A" | "B") => {
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

export const stopDeck = (deckId: "A" | "B") => {
  const deck = deckNodes[deckId];
  if (deck) {
    if (deck.source) {
      try {
        deck.source.stop();
      } catch {}
      deck.source = null;
    }
    deck.isPlaying = false;
    deck.offset = 0;
  }
};

export const setDeckVolume = (deckId: "A" | "B", volume: number) => {
  const ctx = getAudioContext();
  if (deckNodes[deckId]) {
    deckNodes[deckId].gain.gain.setTargetAtTime(volume, ctx.currentTime, 0.05);
  }
};

const playSynthLoop = (deckId: "A" | "B", bpm: number, volume: number) => {
  const ctx = getAudioContext();
  const deck = deckNodes[deckId];
  deck.isPlaying = true;

  const sr = ctx.sampleRate;
  const beatLen = 60 / bpm;
  const barLen = beatLen * 4;
  const frameCount = Math.floor(sr * barLen);
  const buffer = ctx.createBuffer(2, frameCount, sr);

  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < frameCount; i++) {
      const t = i / sr;
      const beatTime = t % beatLen;
      if (beatTime < 0.1) {
        data[i] =
          Math.sin(2 * Math.PI * 100 * beatTime) * Math.exp(-10 * beatTime);
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

// -----------------------------
// PRO VOCAL CHAIN (kept)
// -----------------------------
export const setupLiveVocalChain = async (
  stream: MediaStream,
  thresholdDB: number = -40,
  aiEnhance: boolean = true
) => {
  const ctx = getAudioContext();
  if (ctx.state === "suspended") await ctx.resume();

  if (microphoneStreamSource) {
    try {
      microphoneStreamSource.disconnect();
    } catch {}
  }

  adaptiveGateThreshold = thresholdDB;

  microphoneStreamSource = ctx.createMediaStreamSource(stream);
  vocalAnalyser = ctx.createAnalyser();
  vocalAnalyser.fftSize = 2048;
  vocalAnalyser.smoothingTimeConstant = 0.3;

  // 1. INPUT STAGE
  vocalChainInput = ctx.createGain();

  // 2. VOICE ISOLATION (BANDPASS)
  const lowCut = ctx.createBiquadFilter();
  lowCut.type = "highpass";
  lowCut.frequency.value = 85;

  const highCut = ctx.createBiquadFilter();
  highCut.type = "lowpass";
  highCut.frequency.value = 10000;

  const presence = ctx.createBiquadFilter();
  presence.type = "peaking";
  presence.frequency.value = 2500;
  presence.gain.value = 3;
  presence.Q.value = 0.5;

  // 3. THE HYPERGATE
  vocalGateNode = ctx.createGain();
  vocalGateNode.gain.value = 0;

  // 4. COMPRESSION
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -30;
  compressor.ratio.value = 4;
  compressor.attack.value = 0.002;
  compressor.release.value = 0.15;

  microphoneStreamSource.connect(vocalChainInput);
  vocalChainInput.connect(lowCut);
  lowCut.connect(highCut);
  highCut.connect(presence);

  presence.connect(vocalAnalyser);
  presence.connect(vocalGateNode);

  vocalProcessChain = ctx.createGain();
  vocalBypassNode = ctx.createGain();

  vocalGateNode.connect(compressor);
  compressor.connect(vocalProcessChain);

  vocalGateNode.connect(vocalBypassNode);

  if (masterPreGain) {
    vocalProcessChain.connect(masterPreGain);
    vocalBypassNode.connect(masterPreGain);
  }

  setVocalEnhance(aiEnhance);

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

// Adaptive Gate Logic (kept)
const processAdaptiveGate = (userThresholdDB: number) => {
  if (!vocalAnalyser || !vocalGateNode) return;
  const dataArray = new Uint8Array(vocalAnalyser.frequencyBinCount);

  const checkGate = () => {
    if (!vocalAnalyser || !vocalGateNode) return;
    vocalAnalyser.getByteFrequencyData(dataArray);

    let sum = 0;
    const startBin = Math.floor(100 / (44100 / 2048));
    const endBin = Math.floor(8000 / (44100 / 2048));

    for (let i = startBin; i < endBin; i++) {
      sum += (dataArray[i] / 255) * (dataArray[i] / 255);
    }
    const rms = Math.sqrt(sum / (endBin - startBin));

    let levelDB = 20 * Math.log10(rms || 0.001);
    levelDB = Math.max(-100, levelDB * 100 + 40);

    currentVocalLevel = levelDB;
    adaptiveGateThreshold = userThresholdDB;

    if (levelDB > userThresholdDB) {
      vocalGateNode.gain.setTargetAtTime(1, getAudioContext().currentTime, 0.01);
      isGateOpen = true;
    } else {
      vocalGateNode.gain.setTargetAtTime(
        0,
        getAudioContext().currentTime + 0.1,
        0.3
      );
      isGateOpen = false;
    }
    requestAnimationFrame(checkGate);
  };
  checkGate();
};

export const decodeAudioData = async (
  arrayBuffer: ArrayBuffer
): Promise<AudioBuffer> => {
  const ctx = getAudioContext();
  return await ctx.decodeAudioData(arrayBuffer);
};

// -----------------------------
// Playback Engine (existing export)
// -----------------------------
export const playSound = (
  type: InstrumentType,
  volume: number,
  pan: number,
  customBuffer?: AudioBuffer | null,
  when?: number // NEW (optional): schedule time
) => {
  const ctx = getAudioContext();
  if (ctx.state === "suspended") ctx.resume();

  const t = (when ?? ctx.currentTime) + 0.01;

  const trackGain = ctx.createGain();
  trackGain.gain.setValueAtTime(volume, t);

  const panner = ctx.createStereoPanner();
  panner.pan.setValueAtTime(pan, t);

  trackGain.connect(panner);
  panner.connect(masterPreGain!);

  if (customBuffer) {
    playSample(ctx, customBuffer, trackGain, t);
    return;
  }

  switch (type) {
    case InstrumentType.DRUMS:
      playProKick(ctx, trackGain, t);
      break;
    case InstrumentType.BASS:
      playProBass(ctx, trackGain, t);
      break;
    case InstrumentType.SYNTH:
      playProSynth(ctx, trackGain, t);
      break;
    case InstrumentType.VOCAL:
      playVocalSynth(ctx, trackGain, t);
      break;
    case InstrumentType.PIANO:
      playPiano(ctx, trackGain, t);
      break;
    case InstrumentType.GUITAR:
      playGuitar(ctx, trackGain, t);
      break;
    case InstrumentType.STRINGS:
      playStrings(ctx, trackGain, t);
      break;
    case InstrumentType.EIGHT_OH_EIGHT:
      play808(ctx, trackGain, t);
      break;
  }
};

const playSample = (
  ctx: AudioContext,
  buffer: AudioBuffer,
  output: AudioNode,
  t: number
) => {
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(output);

  activeSourceNodes.add(source);
  source.onended = () => activeSourceNodes.delete(source);

  source.start(t);
};

// -----------------------------
// NEW: Sample “instrument layer” registry (optional)
// -----------------------------
type JazzLayerKey = "RHODES" | "PIANO" | "HORNS" | "UPRIGHT_BASS";
const jazzLayers: Partial<Record<JazzLayerKey, AudioBuffer>> = {};

// Provide buffers from your UI uploader / library, then call playJazzLayer(...)
export const setJazzLayerBuffer = (key: JazzLayerKey, buffer: AudioBuffer) => {
  jazzLayers[key] = buffer;
};

export const clearJazzLayerBuffer = (key: JazzLayerKey) => {
  delete jazzLayers[key];
};

// simple trigger (can be scheduled)
export const playJazzLayer = (
  key: JazzLayerKey,
  volume = 0.6,
  pan = 0,
  when?: number
) => {
  const buf = jazzLayers[key];
  if (!buf) return;
  playSound(InstrumentType.SYNTH, 0, 0, null); // no-op safety (keeps engine warm)
  const ctx = getAudioContext();
  const t = (when ?? ctx.currentTime) + 0.01;

  const g = ctx.createGain();
  g.gain.setValueAtTime(volume, t);

  const p = ctx.createStereoPanner();
  p.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), t);

  g.connect(p);
  p.connect(masterPreGain!);

  playSample(ctx, buf, g, t);
};

// -----------------------------
// Existing synth voices (kept)
// -----------------------------
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
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(55, t);
  filter.type = "lowpass";
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
  osc1.type = "square";
  osc1.frequency.setValueAtTime(440, t);
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
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
  osc.type = "triangle";
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
  osc.type = "sine";
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
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(329.63, t);
  filter.type = "lowpass";
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
  osc.type = "sawtooth";
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
