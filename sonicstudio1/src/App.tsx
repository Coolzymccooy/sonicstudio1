import { useState, useEffect, useRef } from 'react';

import { AppMode, InstrumentType } from './types';
import type {
  Track,
  AudioDeviceSettings,
  AudioRecording,
  ProjectData,
  User,
} from './types';

import { LandingPage } from './components/LandingPage';
import { Grade1Mode } from './components/Grade1Mode';
import { ProMode } from './components/ProMode';
import { DJMode } from './components/DJMode';
import { SamplerMode } from './components/SamplerMode';
import { BroadcastMode } from './components/BroadcastMode';
import { SettingsModal } from './components/SettingsModal';
import { LibraryModal } from './components/LibraryModal';
import { AIAssistant } from './components/AIAssistant';
import { AuthModal } from './components/AuthModal';
import { HelpModal } from './components/HelpModal';

import {
  Headphones,
  Baby,
  PlayCircle,
  StopCircle,
  Disc,
  Loader2,
  Settings,
  Library,
  Scissors,
  User as UserIcon,
  LogOut,
  Radio,
  HelpCircle,
} from 'lucide-react';

import {
  initAudio,
  playSound,
  decodeAudioData,
  setupLiveVocalChain,
  unlockAudioContext,
  getMasterRecordingStream,
  getAudioContext,
  suspendAudio,
  playJazzHarmony,
  playGenreLayerStack,
  playHarmonySyllables,
  playNote,
} from "./services/audioEngine";



// Default Tracks with a basic pattern
const INITIAL_TRACKS: Track[] = [
  {
    id: '1',
    name: 'Drums',
    type: InstrumentType.DRUMS,
    color: 'blue',
    steps: Array(16)
      .fill(null)
      .map((_, i) => ({ active: i % 4 === 0, velocity: 0.8 })),
    volume: 0.8,
    pan: 0,
    muted: false,
    solo: false,
    effects: [],
    clips: [],
  },
  {
    id: '2',
    name: 'Bass',
    type: InstrumentType.BASS,
    color: 'orange',
    steps: Array(16)
      .fill(null)
      .map((_, i) => ({ active: i % 4 === 2, velocity: 0.8 })),
    volume: 0.7,
    pan: 0,
    muted: false,
    solo: false,
    effects: [],
    clips: [],
  },
  {
    id: '3',
    name: 'Synth',
    type: InstrumentType.SYNTH,
    color: 'pink',
    steps: Array(16).fill({ active: false, velocity: 0.8 }),
    volume: 0.6,
    pan: 0,
    muted: false,
    solo: false,
    effects: [],
    clips: [],
  },
  {
    id: '4',
    name: 'Vocal',
    type: InstrumentType.VOCAL,
    color: 'purple',
    steps: Array(16).fill({ active: false, velocity: 0.8 }),
    volume: 0.9,
    pan: 0,
    muted: false,
    solo: false,
    effects: ['AutoTune', 'DeNoise'],
    clips: [],
  },
];

const DEFAULT_SETTINGS: AudioDeviceSettings = {
  inputDeviceId: 'default',
  videoInputDeviceId: 'default',
  outputDeviceId: 'default',
  inputMode: 'standard', // Default to safe mode for bluetooth
  virtualOutputEnabled: false,
  hyperGateThreshold: -40,
  aiEnhanceEnabled: true,
  latencyCompensation: 0, // Will auto-adjust for bluetooth
};

function App() {
  const [showLanding, setShowLanding] = useState(true);
  const [mode, setMode] = useState<AppMode>(AppMode.GRADE_1);
  const [tracks, setTracks] = useState<Track[]>(INITIAL_TRACKS);
  const [isPlaying, setIsPlaying] = useState(false);
  const [bpm, setBpm] = useState(120);
  const [currentStep, setCurrentStep] = useState(0);
  const [isRecordingMic, setIsRecordingMic] = useState(false);
  const [, setActiveRecordingTrackId] = useState<string | null>(null);

  const [showSettings, setShowSettings] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [settings, setSettings] = useState<AudioDeviceSettings>(DEFAULT_SETTINGS);

  // Reloading state for Panic Button
  const [isReloading, setIsReloading] = useState(false);

  // User State
  const [user, setUser] = useState<User | null>(null);

  // Persistence State
  const [savedProjects, setSavedProjects] = useState<ProjectData[]>([]);

  // Master Recording State
  const [isRecordingMaster, setIsRecordingMaster] = useState(false);
  const [masterRecTime, setMasterRecTime] = useState(0);
  const [recordings, setRecordings] = useState<AudioRecording[]>([]);
  const masterRecorderRef = useRef<MediaRecorder | null>(null);
  const masterChunksRef = useRef<Blob[]>([]);

  // --- MASTER METER (DAW-style output tap: RMS + Peak-hold + Clip) ---
  const [masterLevelDb, setMasterLevelDb] = useState(-120);
  const [masterLevelRms, setMasterLevelRms] = useState(0);

  const [masterPeakDb, setMasterPeakDb] = useState(-120);
  const [masterIsClipping, setMasterIsClipping] = useState(false);

  const meterCtxRef = useRef<AudioContext | null>(null);
  const meterAnalyserRef = useRef<AnalyserNode | null>(null);
  const meterDataRef = useRef<Float32Array | null>(null);
  const meterRafRef = useRef<number | null>(null);
  const meterSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  const peakDecayTimerRef = useRef<number | null>(null);
  const clipTimerRef = useRef<number | null>(null);
  // --- Swing + scheduler (true micro-timing) ---
const swingAmountRef = useRef(0.18); // 0..0.30 (boom bap sweet spot)
const humanizeMsRef = useRef(10);    // tiny timing drift (0..20ms)
const lookAheadMs = 25;             // scheduler tick rate
const scheduleAheadSec = 0.12;      // how far ahead we schedule

const nextNoteTimeRef = useRef<number>(0);
const schedulerTimerRef = useRef<number | null>(null);
const selectedGenreIdRef = useRef<string | undefined>(undefined);


  // Mic Recording Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const tracksRef = useRef(tracks);
  useEffect(() => {
    tracksRef.current = tracks;
  }, [tracks]);
  
// Keep scheduler-aware genre ref in sync with UI
useEffect(() => {
  // selectedGenre comes from Grade1Mode via state logic
  // If no genre selected, scheduler will safely do nothing
  selectedGenreIdRef.current = (window as Record<string, unknown>).__ACTIVE_GENRE_ID__ as string | undefined;
}, []);



  

  // LOAD PERSISTENCE - SAFEGUARDED
  useEffect(() => {
    // 1. Load Draft
    const saved = localStorage.getItem('flowstate_draft');
    if (saved) {
      try {
        const data: ProjectData = JSON.parse(saved);
        if (data && Array.isArray(data.tracks)) {
          const cleanTracks = data.tracks.map((t) => ({ ...t, audioBuffer: null }));
          setTracks(cleanTracks);
          if (data.bpm) setBpm(data.bpm);
        }
      } catch (e) {
        console.error('Failed to load draft, clearing corrupted data', e);
        localStorage.removeItem('flowstate_draft');
      }
    }

    // 2. Load Saved Projects List
    const projects = localStorage.getItem('flowstate_projects');
    if (projects) {
      try {
        setSavedProjects(JSON.parse(projects));
      } catch { /* ignored */ }
    }

    // 3. Load User
    const savedUser = localStorage.getItem('flowstate_user');
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch {
        localStorage.removeItem('flowstate_user');
      }
    }
  }, []);

  // AUTO SAVE DRAFT (Debounced)
  useEffect(() => {
    const timer = setTimeout(() => {
      autoSaveDraft();
    }, 2000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks, bpm]);

  const autoSaveDraft = () => {
    if (isReloading) return;
    try {
      const strippedTracks = tracks.map((t) => ({ ...t, audioBuffer: null }));
      const projectData: ProjectData = {
        id: 'draft',
        name: 'AutoSaved Draft',
        date: Date.now(),
        tracks: strippedTracks,
        bpm: bpm,
      };
      localStorage.setItem('flowstate_draft', JSON.stringify(projectData));
    } catch (e) {
      console.warn('Auto-save failed', e);
    }
  };

  const handleManualSave = () => {
    const strippedTracks = tracks.map((t) => ({ ...t, audioBuffer: null }));
    const newProject: ProjectData = {
      id: Date.now().toString(),
      name: `Project ${new Date().toLocaleString()}`,
      date: Date.now(),
      tracks: strippedTracks,
      bpm: bpm,
    };

    const updatedProjects = [newProject, ...savedProjects];
    setSavedProjects(updatedProjects);

    try {
      localStorage.setItem('flowstate_projects', JSON.stringify(updatedProjects));
      const shouldView = window.confirm(
        `Project "${newProject.name}" saved successfully!\n\nWould you like to view it in the Library?`,
      );
      if (shouldView) setShowLibrary(true);
    } catch {
      alert('Storage full. Please delete old projects from the Library to save new ones.');
    }
  };

  const _handlePanicRefresh = () => {
    setIsReloading(true);
    setTimeout(() => {
      try {
        suspendAudio().catch((e) => console.warn(e));
        localStorage.clear();
        sessionStorage.clear();
        console.log('System wiped. Rebooting...');
        window.location.reload();
      } catch {
        window.location.reload();
      }
    }, 100);
  };

  const handleLogin = (u: User) => {
    setUser(u);
    localStorage.setItem('flowstate_user', JSON.stringify(u));
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('flowstate_user');
    setShowLanding(true);
  };

  const handleEnterStudio = async () => {
    try {
      await unlockAudioContext();
      setShowLanding(false);
    } catch (e) {
      console.error('Audio init failed:', e);
      setShowLanding(false);
    }
  };

  // Audio Interval
 useEffect(() => {
  if (!isPlaying) {
    if (schedulerTimerRef.current) {
      window.clearInterval(schedulerTimerRef.current);
      schedulerTimerRef.current = null;
    }
    return;
  }

  const ctx = getAudioContext();
  const secondsPer16th = 60 / bpm / 4;

  // Start scheduling from "now"
  nextNoteTimeRef.current = ctx.currentTime + 0.05;

  const scheduleStep = (stepIndex: number, when: number) => {
    const currentTracks = tracksRef.current; // use your existing tracks ref if you have one
    const anySolo = currentTracks.some((t) => t.solo);

    currentTracks.forEach((track) => {
      if (track.muted) return;
      if (anySolo && !track.solo) return;

      const step = track.steps[stepIndex];
      if (!step?.active) return;

      const vel = typeof step.velocity === "number" ? step.velocity : 1;
      const vol = Math.max(0, Math.min(1, track.volume * vel));
      // Jazzy syllable harmony for VOCAL lane (optional magic)
     if (track.type === InstrumentType.VOCAL) {
  // pick your real keys here (must exist in jazzLayers)
  // example placeholders:
  playJazzHarmony(["RHODES", "PIANO", "HORNS"], vol, when);
  return;
}
 playGenreLayerStack(
    selectedGenreIdRef.current,
    stepIndex,
    when,
    0.85
  );

  // 🎤 Jazzy harmony syllables (Pro-style backing vocals)
// Fire once per bar to avoid clutter
if (stepIndex % 4 === 0) {
  playHarmonySyllables({
    bpm,
    when,
    bars: 1,
    subdivision: 8,
    swing: 0.22,
    intensity: 0.85,
    style: "jazzy",
    rootMidi: 60, // C — later we’ll follow real chords
  });
}



// 🎷 Genre layer stack (jazzy magic), scheduled tightly with the beat.
// Use your app state/refs to get the current genre id (example below).

      playSound(track.type, vol, track.pan, track.audioBuffer ?? null, when);
    });
  };

  const computeSwingDelaySec = (stepIndex: number) => {
    // Swing delays the "off" 16ths (odd indices)
    const isOff16th = stepIndex % 2 === 1;
    if (!isOff16th) return 0;

    const swing = Math.max(0, Math.min(0.35, swingAmountRef.current));
    return secondsPer16th * swing;
  };

  const computeHumanizeDelaySec = () => {
    const ms = Math.max(0, Math.min(25, humanizeMsRef.current));
    return ((Math.random() * 2 - 1) * ms) / 1000;
  };

  const scheduler = () => {
    const now = ctx.currentTime;

    while (nextNoteTimeRef.current < now + scheduleAheadSec) {
      // Determine the step we are scheduling next
      setCurrentStep((prev) => {
        const nextStep = (prev + 1) % 16;

        const swingDelay = computeSwingDelaySec(nextStep);
        const humanDelay = computeHumanizeDelaySec();
        const when = nextNoteTimeRef.current + swingDelay + humanDelay;

        scheduleStep(nextStep, when);

        // advance timeline
        nextNoteTimeRef.current += secondsPer16th;

        return nextStep;
      });

      // Important: break the while because setState is async.
      // We'll keep scheduling via the interval ticks.
      break;
    }
  };

  schedulerTimerRef.current = window.setInterval(scheduler, lookAheadMs);

  return () => {
    if (schedulerTimerRef.current) {
      window.clearInterval(schedulerTimerRef.current);
      schedulerTimerRef.current = null;
    }
  };
}, [isPlaying, bpm]);


   // Master Recording Timer
   useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    if (isRecordingMaster) {
      interval = setInterval(() => setMasterRecTime((prev) => prev + 1), 1000);
    } else {
      setMasterRecTime(0);
    }
    return () => clearInterval(interval);
   }, [isRecordingMaster]);

   const togglePlay = async () => {
    if (!isPlaying) {
      try {
        await initAudio();
      } catch (e) {
        console.error('Failed to init audio', e);
      }
    }
    setIsPlaying((v) => !v);
   };

   const handleAddTrack = (type: InstrumentType, name: string) => {
    const colors = ['red', 'green', 'yellow', 'cyan', 'teal'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];

    const newTrack: Track = {
      id: Date.now().toString(),
      name,
      type,
      color: randomColor,
      steps: Array(16).fill({ active: false, velocity: 0.8 }),
      volume: 0.8,
      pan: 0,
      muted: false,
      solo: false,
      effects: [],
      clips: [],
    };

    setTracks((prev) => [...prev, newTrack]);
  };

  // --- MASTER RECORDING (BOUNCE) ---
  const toggleMasterRecording = async () => {
    if (isRecordingMaster) {
      if (masterRecorderRef.current && masterRecorderRef.current.state === 'recording') {
        masterRecorderRef.current.stop();
        setIsRecordingMaster(false);
      }
      return;
    }

    try {
      await initAudio();
      const stream = getMasterRecordingStream();
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });

      masterRecorderRef.current = recorder;
      masterChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) masterChunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(masterChunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);

        const newRecording: AudioRecording = {
          id: Date.now().toString(),
          name: `Bounce ${new Date().toLocaleTimeString()}`,
          date: new Date(),
          blob,
          url,
          duration: formatTime(masterRecTime),
        };

        setRecordings((prev) => [newRecording, ...prev]);
        if (window.confirm('Recording Complete! Open Library to view/download?')) {
          setShowLibrary(true);
        }
      };

      recorder.start();
      setIsRecordingMaster(true);

      if (!isPlaying) togglePlay();
    } catch (e) {
      console.error('Failed to start master recording', e);
      alert('Could not start audio recording. Engine not ready.');
    }
  };

  const deleteRecording = (id: string) => {
    if (window.confirm('Are you sure you want to delete this recording?')) {
      setRecordings((prev) => prev.filter((r) => r.id !== id));
    }
  };

  const updateTrackStep = (trackId: string, stepIndex: number) => {
    initAudio();
    setTracks((prev) =>
      prev.map((t) => {
        if (t.id !== trackId) return t;

        const newSteps = [...t.steps];
        const newActiveState = !newSteps[stepIndex].active;
        newSteps[stepIndex] = { ...newSteps[stepIndex], active: newActiveState };

        if (newActiveState && !t.muted) {
          playSound(t.type, t.volume, t.pan, t.audioBuffer);
        }

        return { ...t, steps: newSteps };
      }),
    );
  };

  const updateTrackVol = (trackId: string, vol: number) => {
    setTracks((prev) => prev.map((t) => (t.id === trackId ? { ...t, volume: vol } : t)));
  };

  const handleMicRecord = async (trackId: string) => {
    if (isRecordingMic) {
      setIsRecordingMic(false);
      setActiveRecordingTrackId(null);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      return;
    }

    const targetTrackId = trackId;

    try {
      await initAudio();

      const constraints = {
        audio: {
          deviceId:
            settings.inputDeviceId !== 'default' ? { exact: settings.inputDeviceId } : undefined,
          echoCancellation: false,
          autoGainControl: false,
          noiseSuppression: false,
        },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setupLiveVocalChain(stream, settings.hyperGateThreshold, settings.aiEnhanceEnabled);

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const arrayBuffer = await blob.arrayBuffer();
        const audioBuffer = await decodeAudioData(arrayBuffer);

        let finalBuffer = audioBuffer;

        if (settings.latencyCompensation > 0) {
          const trimAmount = settings.latencyCompensation / 1000;
          if (audioBuffer.duration > trimAmount) {
            const newLength = (audioBuffer.duration - trimAmount) * audioBuffer.sampleRate;
            const newBuff = new AudioContext().createBuffer(
              audioBuffer.numberOfChannels,
              newLength,
              audioBuffer.sampleRate,
            );

            for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
              const oldData = audioBuffer.getChannelData(i);
              const newData = newBuff.getChannelData(i);
              const startSample = Math.floor(trimAmount * audioBuffer.sampleRate);

              for (let j = 0; j < newLength; j++) {
                newData[j] = oldData[j + startSample];
              }
            }

            finalBuffer = newBuff;
          }
        }

        setTracks((prev) =>
          prev.map((t) =>
            t.id === targetTrackId
              ? {
                  ...t,
                  audioBuffer: finalBuffer,
                  steps: t.steps.map((s, i) => ({ ...s, active: i === 0 })),
                }
              : t,
          ),
        );

        stream.getTracks().forEach((trk) => trk.stop());
      };

      mediaRecorder.start();
      setIsRecordingMic(true);
      setActiveRecordingTrackId(trackId);
    } catch (err) {
      console.error('Mic Error:', err);
      alert('Could not access microphone.');
    }
  };

  const handleAIAction = (action: string, params: Record<string, string>) => {
    switch (action) {
      case 'SET_BPM': {
        const newBpm = parseInt(params.value);
        if (!isNaN(newBpm)) setBpm(newBpm);
        break;
      }
      default:
        break;
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // --- MASTER METER (tap the master stream and analyse it) ---
  const startMasterMeterTap = async () => {
    try {
      await initAudio();

      if (!meterCtxRef.current) {
        meterCtxRef.current = new (window.AudioContext || (window as unknown as Record<string, typeof AudioContext>).webkitAudioContext)();
      }
      const ctx = meterCtxRef.current;

      if (meterAnalyserRef.current && meterSourceRef.current) return;

      const stream = getMasterRecordingStream();

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.85;

      source.connect(analyser);

      meterSourceRef.current = source;
      meterAnalyserRef.current = analyser;
      meterDataRef.current = new Float32Array(analyser.fftSize);

      const tick = () => {
        const a = meterAnalyserRef.current;
        const buf = meterDataRef.current;

        if (a && buf) {
          a.getFloatTimeDomainData(buf as unknown as Float32Array<ArrayBuffer>);

          let sum = 0;
          let peak = 0;

          for (let i = 0; i < buf.length; i++) {
            const v = Math.abs(buf[i]);
            sum += v * v;
            if (v > peak) peak = v;
          }

          const rms = Math.sqrt(sum / buf.length);
          const db = rms > 0 ? 20 * Math.log10(rms) : -120;
          const peakDb = peak > 0 ? 20 * Math.log10(peak) : -120;

          setMasterLevelRms(rms);
          setMasterLevelDb(Number.isFinite(db) ? db : -120);

          setMasterPeakDb((prev) => {
            const next = Number.isFinite(peakDb) ? peakDb : -120;
            return next > prev ? next : prev;
          });

          if (peak >= 0.98) {
            setMasterIsClipping(true);
            if (clipTimerRef.current) window.clearTimeout(clipTimerRef.current);
            clipTimerRef.current = window.setTimeout(() => setMasterIsClipping(false), 1200);
          }
        }

        meterRafRef.current = requestAnimationFrame(tick);
      };

      if (ctx.state === 'suspended') {
        await ctx.resume().catch(() => {});
      }

      meterRafRef.current = requestAnimationFrame(tick);
    } catch (e) {
      console.warn('Master meter tap failed:', e);
    }
  };

  const stopMasterMeterTap = async () => {
    try {
      if (meterRafRef.current) cancelAnimationFrame(meterRafRef.current);
      meterRafRef.current = null;

      if (meterSourceRef.current) {
        meterSourceRef.current.disconnect();
        meterSourceRef.current = null;
      }
      if (meterAnalyserRef.current) {
        meterAnalyserRef.current.disconnect();
        meterAnalyserRef.current = null;
      }

      if (clipTimerRef.current) window.clearTimeout(clipTimerRef.current);
      clipTimerRef.current = null;

      if (peakDecayTimerRef.current) window.clearInterval(peakDecayTimerRef.current);
      peakDecayTimerRef.current = null;

      setMasterLevelRms(0);
      setMasterLevelDb(-120);
      setMasterPeakDb(-120);
      setMasterIsClipping(false);
    } catch { /* ignored */ }
  };

  // Auto-start the meter in studio
  useEffect(() => {
    if (!showLanding && !isReloading) startMasterMeterTap();
    return () => {
      stopMasterMeterTap();
    };
  }, [showLanding, isReloading]);

  // Peak-hold decay (falls slowly)
  useEffect(() => {
    if (peakDecayTimerRef.current) window.clearInterval(peakDecayTimerRef.current);

    peakDecayTimerRef.current = window.setInterval(() => {
      setMasterPeakDb((prev) => {
        const decay = masterLevelDb < -60 ? 6 : 1.5;
        const next = prev - decay;
        return Math.max(next, masterLevelDb);
      });
    }, 120);

    return () => {
      if (peakDecayTimerRef.current) window.clearInterval(peakDecayTimerRef.current);
      peakDecayTimerRef.current = null;
    };
  }, [masterLevelDb]);

  // IF RELOADING, RENDER NOTHING ELSE. This stops all logic immediately.
  if (isReloading) {
    return (
      <div className="absolute inset-0 z-[9999] bg-black text-white flex flex-col items-center justify-center font-sans">
        <Loader2 size={64} className="animate-spin text-red-500 mb-6" />
        <h2 className="text-3xl font-bold tracking-widest text-red-500">SYSTEM REBOOT</h2>
        <p className="text-gray-500 mt-2 font-mono">Cleaning buffers & memory...</p>
      </div>
    );
  }

  return (
    <div
      className={`h-screen flex flex-col ${
        mode === AppMode.GRADE_1 ? 'bg-slate-50 text-slate-800' : 'bg-gray-900 text-white'
      } relative`}
    >
      {showLanding ? (
        <LandingPage onEnter={handleEnterStudio} onOpenAuth={() => setShowAuth(true)} />
      ) : (
        <>
          {/* Universal Header */}
          <header
            className={`flex items-center justify-between px-4 md:px-6 py-3 border-b transition-colors duration-300 z-50 ${
              mode === AppMode.GRADE_1
                ? 'bg-white/80 backdrop-blur border-slate-200'
                : 'bg-black border-gray-800'
            }`}
          >
            <div className="flex items-center gap-4">
              <button
                onClick={() => setShowLanding(true)}
                className="flex items-center gap-2 group"
                title="Back to Home"
              >
                <div className="w-8 h-8 bg-gradient-to-br from-yellow-400 to-yellow-600 rounded-lg flex items-center justify-center font-brand font-bold text-lg text-black shadow-lg shadow-yellow-500/20 group-hover:scale-105 transition-transform">
                  T
                </div>
                <div
                  className={`font-brand font-bold text-xl tracking-wide hidden md:block ${
                    mode === AppMode.GRADE_1 ? 'text-indigo-900' : 'text-yellow-500'
                  }`}
                >
                  TIWATON
                </div>
              </button>

              {mode !== AppMode.DJ && mode !== AppMode.SAMPLER && mode !== AppMode.BROADCAST && (
                <div className="flex items-center gap-3">
                  <button
                    onClick={togglePlay}
                    className="hover:scale-110 transition-transform"
                    title={isPlaying ? 'Stop' : 'Play'}
                  >
                    {isPlaying ? (
                      <StopCircle size={28} className="text-red-500" />
                    ) : (
                      <PlayCircle size={28} className="text-green-500" />
                    )}
                  </button>

                  <div className="relative group">
                    <button
                      onClick={toggleMasterRecording}
                      className={`
                        h-9 px-3 rounded-full flex items-center gap-2 border transition-all
                        ${
                          isRecordingMaster
                            ? 'bg-red-500/10 border-red-500 text-red-500'
                            : 'bg-transparent border-gray-300 text-gray-500 hover:border-red-400 hover:text-red-400'
                        }
                      `}
                      title="Record Master Output (Bounce)"
                    >
                      <div
                        className={`w-3 h-3 rounded-full ${
                          isRecordingMaster ? 'bg-red-500 animate-pulse' : 'bg-current'
                        }`}
                      />
                      {isRecordingMaster && (
                        <span className="font-mono font-bold text-xs">{formatTime(masterRecTime)}</span>
                      )}
                    </button>
                  </div>

                  <div
                    className={`font-mono text-sm px-3 py-1 rounded ${
                      mode === AppMode.GRADE_1
                        ? 'bg-slate-100 text-slate-600'
                        : 'bg-gray-800 text-green-400'
                    }`}
                    title="Current BPM"
                  >
                    {bpm} BPM
                  </div>

                  {/* MASTER OUTPUT METER CHIP (DAW-style) */}
                  <div
                    className={`flex items-center gap-2 px-3 py-1 rounded font-mono text-xs ${
                      mode === AppMode.GRADE_1
                        ? 'bg-slate-100 text-slate-700'
                        : 'bg-gray-800 text-gray-200'
                    }`}
                    title={`Master: ${masterLevelDb.toFixed(1)} dB (Peak: ${masterPeakDb.toFixed(1)} dB)`}
                  >
                    <span className="opacity-70">OUT</span>

                    <div className="relative w-28 h-2 rounded bg-black/20 overflow-hidden">
                      {/* RMS fill */}
                      <div
                        className="h-full rounded"
                        style={{
                          width: `${Math.min(100, Math.max(0, masterLevelRms * 140))}%`,
                          background:
                            masterLevelDb > -6 ? '#ef4444' : masterLevelDb > -18 ? '#f59e0b' : '#22c55e',
                        }}
                      />

                      {/* Peak-hold marker */}
                      <div
                        className="absolute top-0 bottom-0 w-[2px] bg-white/80"
                        style={{
                          left: `${Math.min(
                            100,
                            Math.max(0, Math.pow(10, masterPeakDb / 20) * 140),
                          )}%`,
                        }}
                      />
                    </div>

                    <span className="w-14 text-right">{masterLevelDb.toFixed(0)} dB</span>

                    {masterIsClipping && (
                      <span className="ml-1 px-1.5 py-0.5 rounded bg-red-500 text-white font-bold text-[10px]">
                        CLIP
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 md:gap-4 overflow-x-auto no-scrollbar">
              {/* Navigation Tabs */}
              <div
                className={`flex p-1 rounded-xl gap-1 ${
                  mode === AppMode.GRADE_1 ? 'bg-slate-200' : 'bg-gray-800'
                }`}
              >
                <button
                  onClick={() => setMode(AppMode.GRADE_1)}
                  title="Grade 1 Mode"
                  className={`p-2 px-3 rounded-lg text-xs font-bold flex items-center gap-2 transition-all ${
                    mode === AppMode.GRADE_1
                      ? 'bg-white text-indigo-600 shadow-sm'
                      : 'text-gray-500 hover:text-gray-400'
                  }`}
                >
                  <Baby size={14} />
                  <span className="hidden lg:inline">Grade 1</span>
                </button>

                <button
                  onClick={() => setMode(AppMode.PRO)}
                  title="Pro Mode DAW"
                  className={`p-2 px-3 rounded-lg text-xs font-bold flex items-center gap-2 transition-all ${
                    mode === AppMode.PRO
                      ? 'bg-gray-700 text-white shadow-sm'
                      : 'text-gray-500 hover:text-gray-400'
                  }`}
                >
                  <Headphones size={14} />
                  <span className="hidden lg:inline">Pro</span>
                </button>

                <button
                  onClick={() => setMode(AppMode.DJ)}
                  title="DJ Mode"
                  className={`p-2 px-3 rounded-lg text-xs font-bold flex items-center gap-2 transition-all ${
                    mode === AppMode.DJ
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-gray-500 hover:text-gray-400'
                  }`}
                >
                  <Disc size={14} />
                  <span className="hidden lg:inline">DJ</span>
                </button>

                <button
                  onClick={() => setMode(AppMode.SAMPLER)}
                  title="Sampler & Mastering"
                  className={`p-2 px-3 rounded-lg text-xs font-bold flex items-center gap-2 transition-all ${
                    mode === AppMode.SAMPLER
                      ? 'bg-pink-600 text-white shadow-sm'
                      : 'text-gray-500 hover:text-gray-400'
                  }`}
                >
                  <Scissors size={14} />
                  <span className="hidden lg:inline">Sampler</span>
                </button>

                <button
                  onClick={() => setMode(AppMode.BROADCAST)}
                  title="Broadcast Mode"
                  className={`p-2 px-3 rounded-lg text-xs font-bold flex items-center gap-2 transition-all ${
                    mode === AppMode.BROADCAST
                      ? 'bg-red-600 text-white shadow-sm animate-pulse'
                      : 'text-gray-500 hover:text-gray-400'
                  }`}
                >
                  <Radio size={14} />
                  <span className="hidden lg:inline">Broadcast</span>
                </button>
              </div>

              <div className="h-6 w-px bg-gray-300 mx-1 opacity-50" />

              {/* User Profile / Auth */}
              {user ? (
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold border border-transparent hover:border-gray-600 hover:bg-gray-800 hover:text-red-400 transition-all text-gray-400"
                  title="Logout"
                >
                  <div className="w-5 h-5 bg-yellow-600 rounded-full flex items-center justify-center text-black font-bold text-[10px]">
                    {user.username[0].toUpperCase()}
                  </div>
                  <LogOut size={14} />
                </button>
              ) : (
                <button
                  onClick={() => setShowAuth(true)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold bg-yellow-600 text-black hover:bg-yellow-500 transition-colors"
                >
                  <UserIcon size={14} /> Sign In
                </button>
              )}

              <button
                onClick={() => setShowLibrary(true)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
                  mode === AppMode.GRADE_1
                    ? 'bg-white hover:bg-slate-50 text-slate-700 border-slate-300'
                    : 'bg-gray-800 hover:bg-gray-700 text-white border-gray-700'
                }`}
              >
                <Library size={14} />
                <span className="hidden md:inline">Library</span>
              </button>

              <button
                onClick={() => setShowHelp(true)}
                className={`p-2 rounded-full transition-colors ${
                  mode === AppMode.GRADE_1
                    ? 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                    : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
                }`}
                title="Help Guide"
              >
                <HelpCircle size={18} />
              </button>

              <button
                onClick={() => setShowSettings(true)}
                className={`p-2 rounded-full transition-colors ${
                  mode === AppMode.GRADE_1
                    ? 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                    : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
                }`}
                title="Audio Settings"
              >
                <Settings size={18} />
              </button>
            </div>
          </header>

          <main className="flex-1 overflow-hidden relative">
            {mode === AppMode.GRADE_1 && (
              <Grade1Mode
                tracks={tracks}
                bpm={bpm}
                onSetBpm={(n) => setBpm(Math.max(60, Math.min(220, n)))}
                isPlaying={isPlaying}
                currentStep={currentStep}
                onTogglePlay={togglePlay}
                onUpdateStep={updateTrackStep}
                onUpdateTracks={setTracks}
                onRecordMic={handleMicRecord}
                isRecording={isRecordingMic}
                onAddTrack={handleAddTrack}
                onSaveProject={handleManualSave}
                onPlayNote={(midi: number) => playNote(midi, 0.85, 0)}
              />
            )}

            {mode === AppMode.PRO && (
              <ProMode
                bpm={bpm}
                onSetBpm={(n) => setBpm(Math.max(60, Math.min(220, n)))}
                tracks={tracks}
                isPlaying={isPlaying}
                currentStep={currentStep}
                onUpdateStep={updateTrackStep}
                onUpdateVol={updateTrackVol}
                onUpdateTracks={setTracks}
              />
            )}

            {mode === AppMode.DJ && (
              <DJMode isPlaying={isPlaying} onTogglePlay={togglePlay} onSave={() => setShowLibrary(true)} />
            )}

            {mode === AppMode.SAMPLER && <SamplerMode recordings={recordings} tracks={tracks} />}

            {mode === AppMode.BROADCAST && (
              <BroadcastMode
                settings={settings}
                meter={{
                  db: masterLevelDb,
                  peakDb: masterPeakDb,
                  rms: masterLevelRms,
                  clipping: masterIsClipping,
                }}
                onResetClip={() => setMasterIsClipping(false)}
              />
            )}
          </main>

          <AIAssistant onAction={handleAIAction} />
        </>
      )}

      {/* MODALS */}
      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        settings={settings}
        onUpdateSettings={setSettings}
      />

      <LibraryModal
        isOpen={showLibrary}
        onClose={() => setShowLibrary(false)}
        recordings={recordings}
        onDeleteRecording={deleteRecording}
        tracks={tracks}
        projects={savedProjects}
      />

      <AuthModal isOpen={showAuth} onClose={() => setShowAuth(false)} onLoginSuccess={handleLogin} />

      <HelpModal isOpen={showHelp} onClose={() => setShowHelp(false)} mode={mode} />
    </div>
  );
}

export default App;
