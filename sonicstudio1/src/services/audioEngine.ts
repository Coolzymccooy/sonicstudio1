




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
const _vocalChainOutput: GainNode | null = null;
let vocalBypassNode: GainNode | null = null;
let vocalProcessChain: GainNode | null = null;

// Analysis State for UI
let currentVocalLevel = -100;
const _currentNoiseFloor = -60;
let isGateOpen = false;
let adaptiveGateThreshold = -40;

// -----------------------------
// Helpers
// -----------------------------
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
// Aliases used by the Genre Layer Stack (keep names stable)
const clamp01local = clamp01;
const randLocal = (min: number, max: number) => min + Math.random() * (max - min);
const chanceLocal = (p: number) => Math.random() < clamp01(p);



const _safeDisconnect = (node: AudioNode | null) => {
  if (!node) return;
  try {
    node.disconnect();
  } catch { /* ignored */ }
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
      window.AudioContext || (window as unknown as Record<string, typeof AudioContext>).webkitAudioContext;

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

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));

export const setMasterBassBoostDb = (db: number) => {
  getAudioContext();
  if (!masterBassShelf) return;
  // safe: 0..9 dB
  masterBassShelf.gain.value = clamp(db, 0, 9);
};

export const setSubEnhancerAmount = (amount: number) => {
  getAudioContext();
  if (!masterSubEnhancer) return;
  // 0..0.35 is safe; more can fuzz/blur
  const a = clamp(amount, 0, 0.35);
  masterSubEnhancer.curve = makeSubEnhancerCurve(a);
};

// Keeps boom big but limiter-safe
export const setMasterOutputTrim = (gain: number) => {
  getAudioContext();
  if (!masterGain) return;
  masterGain.gain.value = clamp(gain, 0.6, 1.0);
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
      } catch { /* ignored */ }
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
      } catch { /* ignored */ }
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
      } catch { /* ignored */ }
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

const playSynthLoop = (deckId: "A" | "B", bpm: number, _volume: number) => {
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
    } catch { /* ignored */ }
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
  when?: number
) => {
  const ctx = getAudioContext();
  if (ctx.state === "suspended") void ctx.resume();

  const t = (when ?? ctx.currentTime) + 0.01;

  // This is the ONE input node every source must connect into
  const input = ctx.createGain();
  input.gain.setValueAtTime(volume, t);

  const pannerNode = ctx.createStereoPanner();
  pannerNode.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), t);

  // Route: input -> panner -> (optional filters) -> masterPreGain
  input.connect(pannerNode);

  const isMusic =
    type !== InstrumentType.DRUMS &&
    type !== InstrumentType.BASS &&
    type !== InstrumentType.EIGHT_OH_EIGHT;

  if (isMusic) {
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.setValueAtTime(130, t); // remove low mud

    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(12000, t); // tame harsh fizz

    pannerNode.connect(hp);
    hp.connect(lp);
    lp.connect(masterPreGain!);
  } else {
    pannerNode.connect(masterPreGain!);
  }

  // --- PLAY SOURCE INTO `input` (not into trackGain/panner) ---
  if (customBuffer) {
    playSample(ctx, customBuffer, input, t);
    return;
  }

  switch (type) {
    case InstrumentType.DRUMS:
      playProKick(ctx, input, t);
      break;
    case InstrumentType.BASS:
      playProBass(ctx, input, t);
      break;
    case InstrumentType.SYNTH:
      playProSynth(ctx, input, t);
      break;
    case InstrumentType.VOCAL:
      playVocalSynth(ctx, input, t);
      break;
    case InstrumentType.PIANO:
      playPiano(ctx, input, t);
      break;
    case InstrumentType.GUITAR:
      playGuitar(ctx, input, t);
      break;
    case InstrumentType.STRINGS:
      playStrings(ctx, input, t);
      break;
    case InstrumentType.EIGHT_OH_EIGHT:
      play808(ctx, input, t);
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

  const ctx = getAudioContext();
  if (ctx.state === "suspended") void ctx.resume();

  const t = (when ?? ctx.currentTime) + 0.01;

  const g = ctx.createGain();
  g.gain.setValueAtTime(volume, t);

  const p = ctx.createStereoPanner();
  p.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), t);

  g.connect(p);
  p.connect(masterPreGain!);

  playSample(ctx, buf, g, t);
};

export const playJazzHarmony = (
  keys: JazzLayerKey[],        // e.g. ["vox_ah", "vox_ah_hi", "vox_ah_low"]
  baseVolume = 0.55,
  when?: number
) => {
  const ctx = getAudioContext();
  const t = (when ?? ctx.currentTime) + 0.01;

  const pans = [-0.18, 0, 0.18];
  const vols = [baseVolume * 0.85, baseVolume, baseVolume * 0.8];

  keys.slice(0, 3).forEach((k, i) => {
    playJazzLayer(k, vols[i] ?? baseVolume, pans[i] ?? 0, t);
  });
};

export const playGenreLayerStack = (
  genreId: string | undefined,
  stepIndex: number,
  when: number,
  intensity = 1 // 0..1
) => {
  if (!genreId) return;

  const id = genreId as GenreId;
  const recipe = GENRE_LAYER_RECIPES[id];
  if (!recipe) return;

  const steps = stepGroup(recipe.triggerSteps);
  if (!steps.includes(stepIndex)) return;

  const prob = clamp01local(recipe.probability * clamp01local(intensity));
  if (!chanceLocal(prob)) return;

  recipe.events.forEach((ev) => {
    const offsets = ev.offsets?.length ? ev.offsets : [0, 0.01, 0.02];
    const baseVol = ev.volume * (0.7 + 0.6 * clamp01local(intensity));
    const panJitter = randLocal(-0.06, 0.06);

    ev.keys.slice(0, 3).forEach((k, i) => {
      const off = offsets[i] ?? offsets[offsets.length - 1] ?? 0;
      playJazzLayer(
        k,
        baseVol * (i === 1 ? 1 : 0.85),
        (ev.pan ?? 0) + panJitter + (i - 1) * 0.12,
        when + off
      );
    });
  });
};

export const playHarmonySyllables = (opts: HarmonySyllableOptions) => {
  initAudio();

  const ctx = getAudioContext();
  if (ctx.state === "suspended") void ctx.resume();

  if (!syllableSynth) syllableSynth = makeSyllableSynth(ctx);
  syllableSynth.out.connect(masterPreGain!);

  const bpm = opts.bpm;
  const when = opts.when;
  const bars = opts.bars ?? 1;
  const subdivision = opts.subdivision ?? 8;
  const _stepsPerBeat = subdivision === 8 ? 2 : subdivision === 16 ? 4 : subdivision === 4 ? 1 : 0.5;

  const swing = clamp01(opts.swing ?? (opts.style === "jazzy" ? 0.22 : 0));
  const intensity = clamp01(opts.intensity ?? 0.8);

  const humanizeMs = opts.humanizeMs ?? 14;
  const stepDur = beatDur(bpm) / (subdivision / 4); // 4 = quarter note reference
  const totalSteps = Math.round(bars * 4 * (subdivision / 4)); // 4 beats per bar

  const allowed = opts.syllables?.length ? opts.syllables : (["doo", "dah", "na", "la"] as SyllableKey[]);
  const rootMidi = opts.rootMidi ?? 60;

  // default voicing by style
  const voicings =
    opts.voicings ??
    (opts.style === "gospel" ? [0, 4, 7, 12] :
     opts.style === "jazzy"  ? [0, 3, 7, 10] :
     opts.style === "tight"  ? [0, 4, 7] :
                               [0, 4, 7, 12]);

  for (let i = 0; i < totalSteps; i++) {
    // rhythmic gate: more notes with more intensity
    const density = 0.35 + 0.55 * intensity;
    if (Math.random() > density) continue;

    const human = (Math.random() * 2 - 1) * (humanizeMs / 1000);
    const t = when + i * stepDur + human;

    // swing (only meaningful on 8ths)
    const swingSec = (i % 2 === 1 ? swing * (stepDur * 0.45) : 0);

    const syll = allowed[(Math.random() * allowed.length) | 0];
    const phoneme = SYLLABLE_BANK[syll][(Math.random() * SYLLABLE_BANK[syll].length) | 0];

    // placeholder "sung" chord: stack oscillators
    voicings.forEach((semi, idx) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();

      const detune = (Math.random() * 2 - 1) * 6; // cents
      osc.type = "sine";
      osc.frequency.setValueAtTime(midiToHz(rootMidi + semi), t + swingSec);
      osc.detune.setValueAtTime(detune, t + swingSec);

      // envelope
      const attack = 0.01;
      const hold = 0.06 + 0.08 * intensity;
      const release = 0.08 + 0.10 * intensity;

      const base = 0.10 * intensity * (idx === 0 ? 1.0 : 0.7);
      g.gain.setValueAtTime(0.0001, t + swingSec);
      g.gain.exponentialRampToValueAtTime(base, t + swingSec + attack);
      g.gain.setValueAtTime(base, t + swingSec + attack + hold);
      g.gain.exponentialRampToValueAtTime(0.0001, t + swingSec + attack + hold + release);

      // shape with filter (vowel-ish)
      const f = ctx.createBiquadFilter();
      f.type = "bandpass";
      f.Q.value = 1.0 + 0.5 * Math.random();

      // simple vowel mapping
      const vowel = phoneme.includes("oo") ? 900 : phoneme.includes("ah") ? 1200 : phoneme.includes("mm") ? 700 : 1100;
      f.frequency.setValueAtTime(vowel + (Math.random() * 120 - 60), t + swingSec);

      osc.connect(g);
      g.connect(f);
      f.connect(syllableSynth!.in);

      osc.start(t + swingSec);
      osc.stop(t + swingSec + attack + hold + release + 0.02);
    });
  }
};
export const playNote = (
  midiNote: number,
  volume = 0.8,
  pan = 0,
  when?: number
) => {
  initAudio();
  const ctx = getAudioContext();
  if (ctx.state === "suspended") void ctx.resume();

  const t = (when ?? ctx.currentTime) + 0.005;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const p = ctx.createStereoPanner();

  const freq = 440 * Math.pow(2, (midiNote - 69) / 12);
  osc.frequency.setValueAtTime(freq, t);
  osc.type = "sine";

  p.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), t);

  // quick pluck envelope
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(volume, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);

  osc.connect(gain);
  gain.connect(p);
  p.connect(masterPreGain!);

  osc.start(t);
  osc.stop(t + 0.3);
};


// -----------------------------
// Harmony Syllables Engine
// -----------------------------
export type SyllableKey =
  | "doo"
  | "dah"
  | "ba"
  | "na"
  | "la"
  | "oh"
  | "mm"
  | "yah";

const SYLLABLE_BANK: Record<SyllableKey, string[]> = {
  doo: ["doo", "du", "dú"],
  dah: ["dah", "da"],
  ba: ["ba", "bah"],
  na: ["na", "nah"],
  la: ["la", "lah"],
  oh: ["oh", "ooh"],
  mm: ["mm", "mmm"],
  yah: ["yah", "ya"],
};

export type HarmonySyllableStyle = "tight" | "smooth" | "gospel" | "jazzy";

export type HarmonySyllableOptions = {
  bpm: number;
  when: number;               // start time (AudioContext time)
  bars?: number;              // default 1
  subdivision?: 2 | 4 | 8 | 16; // default 8ths
  swing?: number;             // 0..0.6 (jazzy)
  intensity?: number;         // 0..1
  style?: HarmonySyllableStyle;
  rootMidi?: number;          // fallback if no chord map
  syllables?: SyllableKey[];  // allowed syllables
  voicings?: number[];        // semitone offsets (e.g. [0, 4, 7] for triad)
  humanizeMs?: number;        // default 14ms
};



const beatDur = (bpm: number) => 60 / Math.max(1, bpm);

const _swingOffset = (stepIndex: number, stepsPerBeat: number, swing = 0) => {
  // offset every 2nd 8th note (classic swing feel)
  if (stepsPerBeat !== 2) return 0;
  return stepIndex % 2 === 1 ? swing * (0.5 * beatDur(120)) : 0; // scaled later
};


// -----------------------------
// Genre → Jazz Layer Stack Mapping (plug-and-play)
// -----------------------------

type GenreId = "gospel" | "afrobeat" | "lofi" | "house" | "amapiano" | "trap-soul" | "synthwave";

type LayerEvent = {
  keys: JazzLayerKey[];   // stacked layers
  volume: number;         // base volume for stack
  pan?: number;           // overall pan offset
  // timing offsets in seconds relative to `when`
  offsets?: number[];     // e.g. [0, 0.01, 0.02] to “spread” layers
};

type GenreLayerRecipe = {
  // which steps to trigger on (0..15)
  triggerSteps: number[] | "offbeats" | "downbeats" | "syncopated";
  // stack behavior
  events: LayerEvent[];
  // simple density control
  probability: number; // 0..1 chance per trigger
};

// Helper to compute step groups
function stepGroup(group: GenreLayerRecipe["triggerSteps"]): number[] {
  if (Array.isArray(group)) return group;

  switch (group) {
    case "downbeats":
      return [0, 4, 8, 12];
    case "offbeats":
      return [2, 6, 10, 14];
    case "syncopated":
      return [3, 7, 11, 15];
    default:
      return [0, 4, 8, 12];
  }
}

// Main recipes (tweak volumes to taste)
const GENRE_LAYER_RECIPES: Record<GenreId, GenreLayerRecipe> = {
  gospel: {
    triggerSteps: "downbeats",
    probability: 0.75,
    events: [
      // Warm worship bed
      { keys: ["RHODES", "PIANO"], volume: 0.42, offsets: [0, 0.012] },
      // Optional horn lift (rare)
      { keys: ["HORNS"], volume: 0.22, offsets: [0.02] },
    ],
  },

  afrobeat: {
    triggerSteps: "offbeats",
    probability: 0.7,
    events: [
      // Rhodes + horns stabs on offbeats
      { keys: ["RHODES", "HORNS"], volume: 0.38, offsets: [0, 0.008] },
      // Upright bounce under it
      { keys: ["UPRIGHT_BASS"], volume: 0.30, offsets: [0] },
    ],
  },

  lofi: {
    triggerSteps: "syncopated",
    probability: 0.65,
    events: [
      // Lofi = Rhodes bed + soft piano
      { keys: ["RHODES", "PIANO"], volume: 0.32, offsets: [0, 0.015] },
      // Upright bass taps (very soft)
      { keys: ["UPRIGHT_BASS"], volume: 0.22, offsets: [0.01] },
    ],
  },

  // defaults for others (can refine later)
  house: {
    triggerSteps: "downbeats",
    probability: 0.55,
    events: [{ keys: ["PIANO"], volume: 0.28, offsets: [0] }],
  },
  amapiano: {
    triggerSteps: "offbeats",
    probability: 0.6,
    events: [{ keys: ["PIANO", "UPRIGHT_BASS"], volume: 0.30, offsets: [0, 0.01] }],
  },
  "trap-soul": {
    triggerSteps: [0, 8, 12],
    probability: 0.45,
    events: [{ keys: ["RHODES"], volume: 0.26, offsets: [0] }],
  },
  synthwave: {
    triggerSteps: "downbeats",
    probability: 0.5,
    events: [{ keys: ["HORNS"], volume: 0.22, offsets: [0] }],
  },
};

const midiToHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

const makeSyllableSynth = (ctx: AudioContext) => {
  const out = ctx.createGain();
  out.gain.value = 0.9;

  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 1200;
  filter.Q.value = 1.2;

  filter.connect(out);

  return { in: filter, out };
};

let syllableSynth: ReturnType<typeof makeSyllableSynth> | null = null;



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



 

