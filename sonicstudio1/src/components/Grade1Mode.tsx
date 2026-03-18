import React, { useState, useEffect, useMemo, useCallback } from "react";
import { InstrumentType } from "../types";
import type { Track } from "../types";
import {
  Play,
  Square,
  Wand2,
  Mic,
  ChevronDown,
  Power,
  Layers,
  Minimize2,
  Maximize2,
  Music2,
  X,
  Plus,
  Save,
  Sparkles,
  Shuffle,
  Database,
} from "lucide-react";

// import { generateBeatPattern } from "../services/geminiService";
import { setMasterBassBoost, setMasterDrive, setGrooveFeel } from "../services/audioEngine";


// ✅ Genres system
import type { GenreDefinition } from "../genres/genreTypes";
import { GENRES } from "../genres/definitions";
import { applyGenre } from "../genres/applyGenre";

interface Grade1ModeProps {
  tracks: Track[];
  bpm: number;
  onSetBpm: (newBpm: number) => void;
  isPlaying: boolean;
  currentStep: number;
  onTogglePlay: () => void;
  onUpdateStep: (trackId: string, stepIndex: number) => void;
  onUpdateTracks: (tracks: Track[]) => void;
  onRecordMic: (trackId: string) => void;
  isRecording: boolean;
  onAddTrack: (type: InstrumentType, name: string) => void;
  onPlayNote?: (midi: number) => void;
  onSaveProject?: () => void;
}

const _VOCAL_KEYBOARD_BASE_MIDI = 60; // C4
const VOCAL_KEYBOARD_KEYS = 12; // one octave

const NEW_INSTRUMENTS = [
  { type: InstrumentType.PIANO, name: "Piano", icon: "🎹" },
  { type: InstrumentType.GUITAR, name: "Guitar", icon: "🎸" },
  { type: InstrumentType.STRINGS, name: "Strings", icon: "🎻" },
  { type: InstrumentType.EIGHT_OH_EIGHT, name: "808 Bass", icon: "💣" },
  { type: InstrumentType.VOCAL, name: "New Vocal", icon: "🎤" },
];



// Optional: small colour mapping for genre cards (safe Tailwind classes)
const GENRE_COLOR: Record<string, string> = {
  gospel: "text-emerald-500",
  afrobeat: "text-orange-500",
  "trap-soul": "text-purple-500",
  lofi: "text-green-500",
  house: "text-blue-500",
  amapiano: "text-yellow-500",
  synthwave: "text-pink-500",
};

// ===============================
// BOOM BAP HELPER (HUMAN FEEL)
// ===============================

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function chance(p: number) {
  return Math.random() < clamp01(p);
}

type StepLike = { active: boolean; velocity?: number };

function makeBoomBap16(opts?: {
  swing?: number;
  humanize?: number;
  density?: number;
  ghost?: number;
}) {
  const swing = opts?.swing ?? 0.7;
  const humanize = opts?.humanize ?? 0.3;
  const density = opts?.density ?? 0.6;
  const ghost = opts?.ghost ?? 0.45;

  const kick = new Array(16).fill(0);
  const snare = new Array(16).fill(0);
  const hat = new Array(16).fill(0);

  // BOOM (kick)
  kick[0] = 0.95;
  kick[8] = 0.75;
  if (chance(density)) kick[6] = 0.55;
  if (chance(density * 0.6)) kick[15] = 0.4;

  // BAP (snare)
  snare[4] = 0.9;
  snare[12] = 0.9;
  if (chance(ghost)) snare[3] = 0.18;
  if (chance(ghost * 0.8)) snare[11] = 0.16;

  // Hats (swung, loose)
  for (let i = 0; i < 16; i++) {
    const offbeat = i % 4 === 2;
    const base = i % 2 === 0 ? 0.35 : 0.22;
    const swingBoost = offbeat ? swing * 0.35 : 0;

    if (chance(0.6 + density * 0.3)) {
      hat[i] = clamp01(base + swingBoost + rand(-0.06, 0.08));
    }
  }

  const toSteps = (lane: number[]): StepLike[] =>
    lane.map((v, _i) => {
      if (v <= 0.01) return { active: false, velocity: 0 };
      const drift = rand(-humanize, humanize) * 0.15;
      return { active: true, velocity: clamp01(v + drift) };
    });

  return {
    kick: toSteps(kick),
    snare: toSteps(snare),
    hat: toSteps(hat),
  };
}




export const Grade1Mode: React.FC<Grade1ModeProps> = ({
  tracks,
  bpm,
  onSetBpm,
  isPlaying,
  currentStep,
  onTogglePlay,
  onUpdateStep,
  onUpdateTracks,
  onRecordMic,
  isRecording,
  onAddTrack,
  onPlayNote,
  onSaveProject,
}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [expandedTracks, setExpandedTracks] = useState<Set<string>>(
    () => new Set(tracks.map((t) => t.id))
  );

  // ✅ Genre selection state (replaces selectedInstrumental)
  type SectionName = "Intro" | "Verse" | "Chorus" | "Bridge";
  interface SectionSlot {
    name: SectionName;
    tracks: Track[];
    savedAt: string;
  }

  const SECTION_NAMES: SectionName[] = ["Intro", "Verse", "Chorus", "Bridge"];

  const [selectedGenre, setSelectedGenre] = useState<GenreDefinition | null>(null);
  const [selectedVariations, setSelectedVariations] = useState<number[]>([]); // 1..10
  const [showPatternLibrary, setShowPatternLibrary] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [quickLoop, setQuickLoop] = useState(true);
  const [liveSwing, setLiveSwing] = useState(0.35);
  const [liveHumanize, setLiveHumanize] = useState(18);
  const [selectedSection, setSelectedSection] = useState<SectionName>("Intro");
  const [sections, setSections] = useState<Record<SectionName, SectionSlot | null>>({
    Intro: null,
    Verse: null,
    Chorus: null,
    Bridge: null,
  });
  const [arranger, setArranger] = useState<Array<{id: string; name: string; section: SectionName; tracks: Track[]; savedAt: string;}>>([]);
  const [vocalBaseMidi, setVocalBaseMidi] = useState(48); // C3 base (Oct buttons adjust)
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const midiChannelByInstrument: Record<InstrumentType, number> = {
    [InstrumentType.DRUMS]: 10,
    [InstrumentType.BASS]: 2,
    [InstrumentType.SYNTH]: 3,
    [InstrumentType.VOCAL]: 4,
    [InstrumentType.PIANO]: 1,
    [InstrumentType.GUITAR]: 5,
    [InstrumentType.STRINGS]: 6,
    [InstrumentType.EIGHT_OH_EIGHT]: 11,
  };

  // One-time “studio feel” defaults for Grade 1 mode
  useEffect(() => {
    // Massive low end + safe loudness (still protected by limiter)
    setMasterBassBoost(0.9); // 0..1
    setMasterDrive(0.35); // 0..1

    // Vintage head-nod feel (timing swing/humanize)
    setGrooveFeel({ swing: 0.35, humanizeMs: 18 });
  }, []);


  const allExpanded = useMemo(
    () => tracks.every((t) => expandedTracks.has(t.id)),
    [tracks, expandedTracks]
  );

  const genreList = useMemo(() => Object.values(GENRES), []);

  const toggleExpand = (id: string) => {
    setExpandedTracks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllExpand = () => {
    setExpandedTracks((prev) => {
      if (tracks.every((t) => prev.has(t.id))) return new Set();
      return new Set(tracks.map((t) => t.id));
    });
  };

  const toggleTrackEnabled = (trackId: string, currentMuted: boolean, e: React.MouseEvent) => {
    e.stopPropagation();
    onUpdateTracks(tracks.map((t) => (t.id === trackId ? { ...t, muted: !currentMuted } : t)));
  };

  // ✅ Variation toggle (highlight only)
  const toggleVariation = (num: number) => {
    setSelectedVariations((prev) =>
      prev.includes(num) ? prev.filter((v) => v !== num) : [...prev, num]
    );
  };

  // ✅ Apply the genre based on last selected variation (or default 1)
  const applySelectedGenre = () => {
    if (!selectedGenre) return;

    const last = selectedVariations[selectedVariations.length - 1] ?? 1;
    const idx = Math.max(0, Math.min(9, last - 1)); // 0..9

    onUpdateTracks(applyGenre(tracks, selectedGenre, idx));
    setSelectedGenre(null);
  };

  const fillCurrentPattern = useCallback(() => {
    const filled = tracks.map((t) => {
      if (t.type === "DRUMS") {
        return {
          ...t,
          steps: t.steps.map((s, i) => ({
            ...s,
            active: i % 2 === 0 ? true : s.active,
            velocity: i % 2 === 0 ? 0.7 : s.velocity,
          })),
        };
      }
      return {
        ...t,
        steps: t.steps.map((s, i) => ({
          ...s,
          active: i % 4 === 0 ? true : s.active,
          velocity: i % 4 === 0 ? 0.6 : s.velocity,
        })),
      };
    });
    onUpdateTracks(filled);
  }, [tracks, onUpdateTracks]);

  const applyGroove = useCallback(() => {
    setGrooveFeel({ swing: liveSwing, humanizeMs: liveHumanize });
  }, [liveSwing, liveHumanize]);

  const showStatus = (text: string) => {
    setStatusMessage(text);
    window.setTimeout(() => setStatusMessage((prev) => (prev === text ? null : prev)), 2000);
  };

  const saveSectionPattern = (name: SectionName) => {
    setSections((prev) => ({
      ...prev,
      [name]: {
        name,
        tracks: JSON.parse(JSON.stringify(tracks)),
        savedAt: new Date().toLocaleTimeString(),
      },
    }));
    showStatus(`${name} saved`);
  };

  const loadSectionPattern = (name: SectionName) => {
    const section = sections[name];
    if (!section) {
      showStatus(`${name} is empty, save first`);
      return;
    }
    onUpdateTracks(JSON.parse(JSON.stringify(section.tracks)));
    showStatus(`${name} loaded`);
  };

  const clearSectionPattern = (name: SectionName) => {
    setSections((prev) => ({ ...prev, [name]: null }));
    showStatus(`${name} cleared`);
  };

  const addSectionToArranger = (name: SectionName) => {
    const section = sections[name];
    if (!section) {
      showStatus(`No ${name} section to add`);
      return;
    }
    setArranger((prev) => [
      ...prev,
      {
        id: `${name}-${Date.now()}`,
        name: `${name} (${prev.length + 1})`,
        section: name,
        tracks: JSON.parse(JSON.stringify(section.tracks)),
        savedAt: new Date().toLocaleTimeString(),
      },
    ]);
    showStatus(`${name} added to arranger`);
  };

  const quickArrange = () => {
    const sectionsToMake: SectionName[] = ['Intro', 'Verse', 'Chorus', 'Bridge'];
    sectionsToMake.forEach((sectionName, index) => {
      const newPattern = tracks.map((t) => ({ ...t, steps: t.steps.map((s, i) => ({ ...s, active: i % (4 - Math.min(3, index)) === 0 || Math.random() < 0.2, velocity: s.velocity || 0.65 })) }));
      setSections((prev) => ({
        ...prev,
        [sectionName]: { name: sectionName, tracks: JSON.parse(JSON.stringify(newPattern)), savedAt: new Date().toLocaleTimeString() },
      }));
    });
    setArranger((prev) => {
      const next = [...prev];
      ['Intro', 'Verse', 'Chorus', 'Bridge'].forEach((name, i) => {
        next.push({ id: `${name}-${Date.now()}-${i}`, name: `${name} (${i + 1})`, section: name as SectionName, tracks: JSON.parse(JSON.stringify(tracks)), savedAt: new Date().toLocaleTimeString() });
      });
      return next;
    });
    showStatus('Quick arrange created for Intro/Verse/Chorus/Bridge');
  };

  const moveArrangerItem = (id: string, direction: 'up' | 'down') => {
    setArranger((prev) => {
      const index = prev.findIndex((item) => item.id === id);
      if (index < 0) return prev;
      const next = [...prev];
      const swapIndex = direction === 'up' ? index - 1 : index + 1;
      if (swapIndex < 0 || swapIndex >= next.length) return prev;
      [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
      return next;
    });
  };

  const removeArrangerItem = (id: string) => {
    setArranger((prev) => prev.filter((item) => item.id !== id));
  };

  useEffect(() => {
    const saved = localStorage.getItem("grade1-sections");
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Record<SectionName, SectionSlot | null>;
        setSections(parsed);
      } catch {
        // ignore parse errors
      }
    }
    const arrangerSaved = localStorage.getItem("grade1-arranger");
    if (arrangerSaved) {
      try {
        const parsed = JSON.parse(arrangerSaved) as Array<{id: string; name: string; section: SectionName; tracks: Track[]; savedAt: string}>;
        setArranger(parsed);
      } catch {
        // ignore parse errors
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("grade1-sections", JSON.stringify(sections));
  }, [sections]);
  useEffect(() => {
    localStorage.setItem("grade1-arranger", JSON.stringify(arranger));
  }, [arranger]);

  const midiNoteForInstrument = (type: InstrumentType): number => {
    switch (type) {
      case InstrumentType.DRUMS:
      case InstrumentType.EIGHT_OH_EIGHT:
        return 36;
      case InstrumentType.BASS:
        return 40;
      case InstrumentType.SYNTH:
      case InstrumentType.PIANO:
      case InstrumentType.STRINGS:
        return 60;
      case InstrumentType.GUITAR:
        return 50;
      case InstrumentType.VOCAL:
        return 64;
      default:
        return 60;
    }
  };

  const exportMidi = () => {
    const ppq = 96;
    const stepLength = ppq / 4;
    const events: number[] = [];

    const writeVarLen = (value: number): number[] => {
      let buffer = value & 0x7f;
      const bytes: number[] = [];
      while (true) {
        if (value > 0x7f) {
          bytes.unshift((buffer & 0x7f) | 0x80);
        } else {
          bytes.unshift(buffer & 0x7f);
          break;
        }
        value >>= 7;
        buffer = value & 0x7f;
      }
      return bytes;
    };

    const append = (...vals: number[]) => events.push(...vals);

    append(0x00, 0xff, 0x51, 0x03, 0x07, 0xa1, 0x20);
    append(0x00, 0xff, 0x58, 0x04, 0x04, 0x02, 0x18, 0x08);

    tracks.forEach((track) => {
      if (track.muted) return;
      const channel = midiChannelByInstrument[track.type] ?? 1;
      const note = midiNoteForInstrument(track.type);
      track.steps.forEach((step, idx) => {
        if (!step.active) return;
        const velocity = Math.max(1, Math.round((step.velocity ?? 0.7) * 100));
        append(...writeVarLen(idx * stepLength), 0x90 | (channel - 1), note, velocity);
        append(...writeVarLen(stepLength), 0x80 | (channel - 1), note, 0);
      });
    });

    append(0x00, 0xff, 0x2f, 0x00);

    const trackLength = events.length;
    const header = [
      0x4d, 0x54, 0x68, 0x64,
      0x00, 0x00, 0x00, 0x06,
      0x00, 0x00,
      0x00, 0x01,
      0x00, ppq,
    ];
    const trackHeader = [
      0x4d, 0x54, 0x72, 0x6b,
      (trackLength >> 24) & 0xff,
      (trackLength >> 16) & 0xff,
      (trackLength >> 8) & 0xff,
      trackLength & 0xff,
      ...events,
    ];

    const bytes = new Uint8Array([...header, ...trackHeader]);
    const blob = new Blob([bytes], { type: "audio/midi" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `grade1-session-${new Date().toISOString().replace(/[:.]/g, "-")}.mid`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ✅ Magic Beat: uses chosen genre variations when available, else livens patterns with phrase-level overrides
  const handleMagicButton = async () => {
    setIsGenerating(true);
    try {
      const variationLast = selectedVariations[selectedVariations.length - 1] ?? 1;
      const selectedVariation = Math.max(1, variationLast);
      const variationIdx = selectedGenre
        ? Math.max(0, Math.min((selectedGenre.variations?.length ?? 1) - 1, selectedVariation - 1))
        : 0;

      const baseTracks = selectedGenre
        ? applyGenre(tracks, selectedGenre, variationIdx)
        : tracks;

      const boom = makeBoomBap16({
        swing: Math.max(0.2, Math.min(0.9, liveSwing)),
        humanize: Math.max(0, Math.min(0.5, liveHumanize / 100)),
        density: 0.6,
        ghost: 0.45,
      });

      const craftMelody = (steps: typeof tracks[number]['steps']) => {
        return steps.map((s, i) => {
          const active = (i % 4 === 0 && Math.random() > 0.35) || (Math.random() < 0.12);
          return {
            ...s,
            active,
            velocity: active ? 0.45 + Math.random() * 0.45 : 0,
          };
        });
      };

      const generated = baseTracks.map((t) => {
        if (t.type === InstrumentType.DRUMS) {
          const steps = t.steps.map((s, i) => {
            const drumHit = boom.kick[i].active || boom.snare[i].active || boom.hat[i].active;
            const velocity = drumHit
              ? 0.55 + Math.random() * 0.35
              : s.active
              ? Math.max(0.2, (s.velocity ?? 0.5) * 0.95)
              : 0;
            return {
              ...s,
              active: drumHit || s.active,
              velocity,
            };
          });
          return { ...t, steps };
        }

        if (t.type === InstrumentType.BASS || t.type === InstrumentType.EIGHT_OH_EIGHT) {
          const steps = t.steps.map((s, i) => {
            const strongPulse = i === 0 || i === 8 || i === 12;
            const active = strongPulse || (i % 4 === 2 && Math.random() < 0.35);
            return {
              ...s,
              active,
              velocity: active ? 0.58 + Math.random() * 0.32 : 0,
            };
          });
          return { ...t, steps };
        }

        if (
          t.type === InstrumentType.PIANO ||
          t.type === InstrumentType.SYNTH ||
          t.type === InstrumentType.STRINGS ||
          t.type === InstrumentType.GUITAR
        ) {
          const steps = t.steps.map((s, i) => {
            const stab = i % 4 === 0 ? Math.random() > 0.35 : Math.random() > 0.85;
            return {
              ...s,
              active: s.active || stab,
              velocity: stab ? 0.4 + Math.random() * 0.45 : s.velocity,
            };
          });
          return { ...t, steps };
        }

        if (t.type === InstrumentType.VOCAL) {
          return { ...t, steps: craftMelody(t.steps) };
        }

        return t;
      });

      onUpdateTracks(generated);
    } catch (error) {
      console.error('Magic Beat failed', error);
    } finally {
      setIsGenerating(false);
    }
  };




  return (
    <div className="h-full flex flex-col bg-[#0b0f1a] font-grade1 text-slate-200 overflow-hidden relative selection:bg-indigo-200">
      {/* Sonic Studio Top Bar */}
      <div className="flex flex-col gap-3 p-3 border-b border-slate-800 bg-[#0a0d15]/90 backdrop-blur-md z-30">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center shadow-lg shadow-indigo-700/40">
              <Layers size={20} className="text-white" />
            </div>
            <div>
              <div className="text-xs uppercase text-slate-400 tracking-[0.16em]">Sonic Studio</div>
              <div className="text-base md:text-xl font-black tracking-wide text-white">Beat Mode</div>
            </div>
          </div>

          <div className="flex items-center gap-2 text-[11px] rounded-full bg-slate-800/60 px-3 py-2 border border-slate-700">
            <button onClick={onTogglePlay} className="px-2 py-1 rounded-md bg-gradient-to-r from-green-500 to-emerald-500 font-bold text-xs shadow-sm">
              {isPlaying ? 'STOP' : 'PLAY'}
            </button>
            <div className="font-bold">{bpm} BPM</div>
            <div className="font-semibold text-slate-200">C Major</div>
            <div className="text-indigo-300">●</div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs text-slate-300">
            <button className="rounded-full px-3 py-1 bg-slate-700/70 hover:bg-slate-600 transition">Beat</button>
            <button className="rounded-full px-3 py-1 bg-slate-700/40 hover:bg-slate-600 transition">Clip</button>
            <button className="rounded-full px-3 py-1 bg-slate-700/40 hover:bg-slate-600 transition">Arrange</button>
            <button className="rounded-full px-3 py-1 bg-slate-700/40 hover:bg-slate-600 transition">Perform</button>
          </div>
          <div className="flex items-center gap-2 w-full md:w-[480px] md:max-w-[48rem]">
            <input
              type="text"
              placeholder="Ask Sonic AI..."
              className="w-full rounded-xl border border-slate-600 bg-[#0f1323] px-3 py-2 text-xs outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
            />
            <button className="px-3 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 text-white text-xs font-bold">Generate</button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <aside className="w-[220px] bg-[#10152a] border-r border-slate-800 p-3 flex flex-col gap-3">
          <div className="text-[11px] uppercase font-bold tracking-[0.18em] text-slate-400">Browser</div>
          <button className="text-left rounded-xl bg-slate-800/50 px-3 py-2 text-xs hover:bg-slate-700 transition">Instruments</button>
          <button className="text-left rounded-xl bg-slate-800/50 px-3 py-2 text-xs hover:bg-slate-700 transition">Drum Kits</button>
          <button className="text-left rounded-xl bg-slate-800/50 px-3 py-2 text-xs hover:bg-slate-700 transition">MIDI Packs</button>
          <button className="text-left rounded-xl bg-slate-800/50 px-3 py-2 text-xs hover:bg-slate-700 transition">Samples</button>
          <button className="text-left rounded-xl bg-slate-800/50 px-3 py-2 text-xs hover:bg-slate-700 transition">Favorites</button>
          <div className="mt-auto text-[11px] text-slate-400">Live: {isPlaying ? 'ON' : 'OFF'}</div>
        </aside>

        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto bg-[#0c111f] p-3">
            <div className="grid grid-cols-1 gap-3">
              <div className="flex items-center justify-between gap-2 bg-[#161b32] rounded-2xl border border-slate-700 p-3">
                <div className="text-xs uppercase tracking-[0.16em] text-slate-400">Live Beat Workspace</div>
                <div className="text-xs text-emerald-400">Realtime | 16-step sequencer</div>
              </div>

              <div className="space-y-3">
                {tracks.map((track) => (
                  <div key={track.id} className="rounded-2xl bg-[#111a2e] border border-slate-700 p-2">
                    <div className="flex items-center justify-between gap-2 pb-2">
                      <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                        <span className="text-lg">{track.type === 'DRUMS' ? '🥁' : track.type === 'BASS' ? '🎸' : track.type === 'SYNTH' ? '🎹' : '🎤'}</span>
                        {track.name}
                      </div>
                      <div className="flex items-center gap-1 text-[11px]">
                        <button className="rounded px-2 py-1 bg-slate-700 text-slate-200">M</button>
                        <button className="rounded px-2 py-1 bg-slate-700 text-slate-200">S</button>
                        <button className="rounded px-2 py-1 bg-lime-500 text-black">On</button>
                      </div>
                    </div>
                    <div className="grid grid-cols-16 gap-1">
                      {track.steps.map((step, i) => (
                        <button
                          key={i}
                          onClick={() => onUpdateStep(track.id, i)}
                          className={`h-8 rounded-md transition ${step.active ? 'bg-gradient-to-br from-cyan-400 to-indigo-500 shadow-lg shadow-indigo-500/40' : 'bg-slate-700 hover:bg-slate-600'}`}
                        >
                          <span className="text-[10px]">{i + 1}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="border-t border-slate-800 bg-[#0e1325] p-3">
            <div className="flex items-center justify-between">
              <div className="text-xs uppercase tracking-[0.14em] text-slate-300 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> Mixer Preview</div>
              <div className="flex items-center gap-2 text-[11px] text-slate-300">
                <span>Master</span>
                <span className="rounded-full bg-indigo-600 px-2 py-0.5">-12 dB</span>
              </div>
            </div>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {tracks.slice(0, 4).map((track) => (
                <div key={track.id} className="bg-[#1a203d] rounded-xl p-2 text-[11px] border border-slate-700">
                  <div className="font-bold text-slate-200">{track.name}</div>
                  <div className="h-2 mt-2 w-full rounded-full bg-slate-600"><div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-400" style={{ width: `${Math.round(track.volume * 100)}%` }} /></div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <aside className="w-[260px] bg-[#111b35] border-l border-slate-800 p-3">
          <div className="text-[11px] uppercase tracking-[0.14em] text-slate-400 mb-2">AI Co-Producer</div>
          <div className="space-y-2 bg-[#0b1327] border border-slate-700 rounded-2xl p-3">
            <div className="text-[11px] text-emerald-300">Sonic AI</div>
            <div className="text-xs text-slate-200 font-semibold">Generate Afrobeat drums</div>
            <div className="text-xs text-slate-200 font-semibold">Humanize groove</div>
            <div className="text-xs text-slate-200 font-semibold">Add gospel chords</div>
            <button className="mt-2 w-full rounded-xl bg-indigo-600 text-white text-xs py-2">Ask AI</button>
          </div>
        </aside>
      </div>
      
      <div className="absolute bottom-3 right-3 text-[10px] text-slate-400">Sonic Studio · Beat Mode · v1</div>
      
      {/* Main controls continue after this section in existing UI. */}
      <div className="hidden">

          <button
            onClick={onSaveProject}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-gray-800 border border-gray-700 text-gray-200 hover:bg-gray-700 transition-all"
            title="Save Project & Recordings"
          >
            <Save size={16} className="text-indigo-400" />
            <span className="hidden sm:inline">Save</span>
          </button>

          <button
            onClick={exportMidi}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-slate-700 border border-slate-600 text-white hover:bg-slate-600 transition-all"
            title="Export current arrangement as MIDI"
          >
            <span>Export MIDI</span>
          </button>

          <button
            onClick={handleMagicButton}
            disabled={isGenerating}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold transition-all border ${
              isGenerating
                ? "bg-gray-800 border-gray-700 text-gray-500"
                : "bg-indigo-600 border-indigo-500 text-white hover:brightness-110 shadow-lg shadow-indigo-500/20"
            }`}
          >
            <Wand2 size={16} className={isGenerating ? "animate-spin" : ""} />
            {isGenerating ? "Dreaming..." : "Magic Beat"}
          </button>

          <button
            onClick={fillCurrentPattern}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-800 text-white hover:bg-slate-700 transition-all"
            title="Quick fill pattern"
          >
            <Sparkles size={14} /> Fill Pattern
          </button>

          <button
            onClick={() => {
              setQuickLoop((v) => !v);
              applyGroove();
            }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
              quickLoop
                ? "bg-lime-600 text-white hover:bg-lime-500"
                : "bg-slate-700 text-white hover:bg-slate-600"
            }`}
          >
            <Shuffle size={14} /> {quickLoop ? "Live Groove ON" : "Live Groove OFF"}
          </button>

          <button
            onClick={toggleAllExpand}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-gray-800 border border-gray-700 text-gray-200 hover:bg-gray-700 transition-all"
          >
            {allExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            <span className="hidden sm:inline">{allExpanded ? "Collapse All" : "Expand All"}</span>
          </button>

          <button
            onClick={onTogglePlay}
            className={`flex items-center gap-2 px-8 py-2.5 rounded-xl text-xs font-bold transition-all shadow-lg ${
              isPlaying
                ? "bg-red-600 text-white shadow-red-900/40 animate-pulse"
                : "bg-green-600 text-white hover:brightness-110 shadow-green-900/40"
            }`}
          >
            {isPlaying ? <Square size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
            {isPlaying ? "STOP" : "PLAY"}
          </button>
      </div>

      {/* Session Control Bar */}
      <div className="flex flex-wrap items-center gap-3 p-3 bg-slate-900 text-white border-b border-slate-800 z-10">
        <div className="flex items-center gap-2 rounded-xl bg-slate-800/60 px-3 py-2 text-xs font-bold">
          <Database size={14} /> Session: Grade1 Beat Lab
        </div>
        {statusMessage && (
          <div className="ml-auto rounded-full border border-indigo-400 bg-indigo-600/85 px-3 py-1 text-[11px] font-semibold text-white">
            {statusMessage}
          </div>
        )}
        <div className="flex items-center gap-2 text-xs">
          <div className="px-2 py-1 rounded-md bg-indigo-500/20 text-indigo-200">Swing: {(liveSwing * 100).toFixed(0)}%</div>
          <div className="px-2 py-1 rounded-md bg-indigo-500/20 text-indigo-200">Humanize: {liveHumanize}ms</div>
        </div>
        <div className="w-full md:w-auto">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
            <span>Groove Control:</span>
            <input className="w-24 accent-indigo-400" type="range" min="0" max="1" step="0.05" value={liveSwing} onChange={(e) => setLiveSwing(Number(e.target.value))} />
            <span>{(liveSwing * 100).toFixed(0)}%</span>
          </div>
        </div>
        <div className="w-full md:w-auto">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
            <span>Tempo:</span>
            <input className="w-32 accent-indigo-400" type="range" min="60" max="220" step="1" value={bpm} onChange={(e) => onSetBpm(Number(e.target.value))} />
            <span className="font-black">{bpm} BPM</span>
          </div>
        </div>
        <div className="w-full md:w-auto">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
            <span>Humanize:</span>
            <input className="w-28 accent-indigo-400" type="range" min="0" max="40" step="1" value={liveHumanize} onChange={(e) => setLiveHumanize(Number(e.target.value))} />
            <span>{liveHumanize}ms</span>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <label className="font-bold">Section:</label>
          <select value={selectedSection} onChange={(e) => setSelectedSection(e.target.value as SectionName)} className="rounded-lg px-2 py-1 bg-slate-800 text-white text-xs">
            {SECTION_NAMES.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>
        <button onClick={() => saveSectionPattern(selectedSection)} className="px-2 py-1.5 bg-indigo-500 hover:bg-indigo-400 rounded-xl text-xs font-bold">Save Section</button>
        <button onClick={() => loadSectionPattern(selectedSection)} className="px-2 py-1.5 bg-emerald-500 hover:bg-emerald-400 rounded-xl text-xs font-bold">Load Section</button>
        <button onClick={() => clearSectionPattern(selectedSection)} className="px-2 py-1.5 bg-rose-500 hover:bg-rose-400 rounded-xl text-xs font-bold">Clear Section</button>
        <button onClick={() => quickArrange()} className="px-2 py-1.5 bg-purple-500 hover:bg-purple-400 rounded-xl text-xs font-bold">Quick Arrange</button>
        <button onClick={applyGroove} className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 rounded-xl text-xs font-bold">Apply Groove</button>
        <button onClick={() => setShowPatternLibrary((v) => !v)} className="px-3 py-1.5 bg-indigo-500 hover:bg-indigo-400 rounded-xl text-xs font-bold">Pattern Library</button>
      </div>

      {/* Main Scroll */}
      <div className="flex-1 overflow-y-auto bg-slate-100/50">
        <div className="p-4 md:p-8 space-y-6">
          {tracks.map((track) => {
            const isExpanded = expandedTracks.has(track.id);
            const isEnabled = !track.muted;

            const colorMap: Record<string, string> = {
              blue: "from-blue-400 to-blue-600",
              orange: "from-orange-400 to-orange-600",
              pink: "from-pink-400 to-pink-600",
              purple: "from-purple-400 to-purple-600",
              red: "from-red-400 to-red-600",
              green: "from-green-400 to-green-600",
              yellow: "from-yellow-400 to-yellow-600",
              teal: "from-teal-400 to-teal-600",
              cyan: "from-cyan-400 to-cyan-600",
            };
            const gradient = colorMap[track.color] || "from-gray-400 to-gray-600";

            return (
              <div
                key={track.id}
                className={`rounded-[2rem] transition-all duration-300 relative group ${
                  isExpanded
                    ? "bg-white shadow-2xl ring-1 ring-black/5"
                    : "bg-white/80 shadow-md hover:shadow-xl hover:-translate-y-1"
                }`}
              >
                {/* Track Header */}
                <div
                  className="flex items-center justify-between p-4 cursor-pointer select-none"
                  onClick={() => toggleExpand(track.id)}
                >
                  <div className="flex items-center gap-5">
                    <div
                      className={`w-16 h-16 rounded-2xl flex items-center justify-center text-3xl text-white shadow-lg transition-all bg-gradient-to-br ${
                        isEnabled ? gradient : "from-gray-300 to-gray-400"
                      } ${isExpanded ? "scale-110 rotate-3" : "group-hover:scale-105"}`}
                    >
                      {track.type === "DRUMS" && "🥁"}
                      {track.type === "BASS" && "🎸"}
                      {track.type === "SYNTH" && "🎹"}
                      {track.type === "VOCAL" && "🎤"}
                      {track.type === "PIANO" && "🎹"}
                      {track.type === "GUITAR" && "🎸"}
                      {track.type === "STRINGS" && "🎻"}
                      {track.type === "808" && "💣"}
                    </div>

                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-2xl font-black tracking-tight transition-colors ${
                            isEnabled ? "text-slate-800" : "text-slate-400"
                          }`}
                        >
                          {track.name}
                        </span>
                        <span className="text-[10px] font-bold uppercase px-2 py-1 rounded-full bg-slate-100 text-slate-600">
                          Ch {midiChannelByInstrument[track.type] ?? 1}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            isEnabled ? "bg-slate-100 text-slate-500" : "bg-slate-100 text-slate-300"
                          }`}
                        >
                          {track.type}
                        </span>
                        {isExpanded && <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {track.type === "VOCAL" && isEnabled && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onRecordMic(track.id);
                        }}
                        className={`px-4 py-2 rounded-xl transition-all shadow-md flex items-center gap-2 font-bold text-xs ${
                          isRecording
                            ? "bg-red-500 text-white animate-pulse shadow-red-500/50"
                            : "bg-red-50 text-red-500 hover:bg-red-100 border border-red-100"
                        }`}
                      >
                        <Mic size={16} />
                        {isRecording ? "REC ON" : "REC VOCAL"}
                      </button>
                    )}

                    <button
                      onClick={(e) => toggleTrackEnabled(track.id, track.muted, e)}
                      className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs transition-all shadow-sm ${
                        isEnabled
                          ? "bg-slate-800 text-white shadow-slate-500/30 hover:bg-slate-700"
                          : "bg-slate-200 text-slate-400"
                      }`}
                    >
                      <Power size={14} />
                      <span>{isEnabled ? "ACTIVE" : "MUTED"}</span>
                    </button>

                    <div className={`p-2 rounded-full transition-transform duration-300 ${isExpanded ? "rotate-180 bg-slate-100" : "bg-transparent"}`}>
                      <ChevronDown size={20} className="text-slate-400" />
                    </div>
                  </div>
                </div>

                
                {/* Vocal Keyboard */}
                {track.type === "VOCAL" && onPlayNote && (
                  <div className={`px-4 pb-4 ${!isEnabled ? "opacity-40 grayscale pointer-events-none" : ""}`}>
                    <div
                      className="mt-3 p-4 rounded-2xl bg-indigo-50 border border-indigo-200"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-between gap-3 mb-3">
                        <div className="text-xs font-black text-indigo-700">
                          VOCAL KEYBOARD (Target Notes)
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setVocalBaseMidi((m) => Math.max(24, m - 12))}
                            className="px-3 py-1 rounded-lg bg-white border border-indigo-200 text-indigo-700 text-[11px] font-black hover:bg-indigo-100"
                            title="Octave down"
                          >
                            − Oct
                          </button>
                          <button
                            type="button"
                            onClick={() => setVocalBaseMidi((m) => Math.min(84, m + 12))}
                            className="px-3 py-1 rounded-lg bg-white border border-indigo-200 text-indigo-700 text-[11px] font-black hover:bg-indigo-100"
                            title="Octave up"
                          >
                            + Oct
                          </button>
                        </div>
                      </div>

                      <div className="flex gap-1 overflow-x-auto no-scrollbar pb-1">
                        {Array.from({ length: VOCAL_KEYBOARD_KEYS * 2 }).map((_, i) => {
                          const midi = vocalBaseMidi + i; // 2 octaves
                          const isBlack = [1, 3, 6, 8, 10].includes(midi % 12);
                          const label = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"][midi % 12];

                          return (
                            <button
                              key={midi}
                              type="button"
                              onClick={() => onPlayNote(midi)}
                              className={`h-20 w-9 rounded-xl font-black text-[10px] transition-all active:scale-95
                                ${isBlack ? "bg-slate-900 text-white" : "bg-white text-slate-900 border border-slate-200"}
                                hover:-translate-y-0.5 hover:shadow-md`}
                              title={`MIDI ${midi}`}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>

                      <div className="mt-2 text-[10px] text-indigo-600/80 font-bold">
                        Tip: Use Oct buttons for full range. Next step: snap mic pitch to these notes (autotune).
                      </div>
                    </div>
                  </div>
                )}
{/* Sequencer Grid */}
                <div className={`transition-all duration-500 ease-in-out overflow-hidden ${isExpanded ? "max-h-[900px] opacity-100" : "max-h-0 opacity-0"}`}>
                  <div className={`p-4 md:p-6 bg-slate-50/50 border-t border-slate-100 rounded-b-[2rem] ${!isEnabled ? "opacity-40 grayscale pointer-events-none" : ""}`}>
                    <div className="grid grid-cols-8 md:grid-cols-16 gap-2 md:gap-3">
                      {track.steps.map((step, idx) => (
                        <button
                          key={idx}
                          disabled={!isEnabled}
                          onClick={() => onUpdateStep(track.id, idx)}
                          className={`relative aspect-square rounded-xl transition-all duration-200 group flex items-center justify-center font-bold text-xs shadow-[0_4px_0_0_rgba(0,0,0,0.05)]
                            ${
                              step.active
                                ? `bg-gradient-to-br ${gradient} text-white active:translate-y-[4px] active:shadow-none`
                                : "bg-white text-slate-300 hover:bg-slate-50 hover:-translate-y-1 hover:shadow-md"
                            }
                            ${currentStep === idx ? "ring-4 ring-indigo-400/30 z-10 scale-110" : ""}`}
                        >
                          <span className={step.active ? "opacity-100" : "opacity-50"}>{idx + 1}</span>
                          {step.active && <div className="absolute inset-0 bg-white/20 rounded-xl animate-pulse" />}
                        </button>
                      ))}
                    </div>
                    




                  </div>
                </div>
              </div>
            );
          })}

          {/* Add Track */}
          <div className="relative pt-4">
            <button
              onClick={() => setShowAddMenu((v) => !v)}
              className="w-full py-6 border-4 border-dashed border-slate-300 rounded-[2rem] flex flex-col items-center justify-center gap-3 text-slate-400 hover:bg-white hover:border-indigo-400 hover:text-indigo-500 hover:shadow-xl transition-all font-black text-lg group"
            >
              <div className="p-3 bg-slate-200 rounded-full group-hover:bg-indigo-100 transition-colors">
                <Plus size={32} />
              </div>
              <span>ADD NEW INSTRUMENT</span>
            </button>

            {showAddMenu && (
              <div className="mt-4 bg-white/90 backdrop-blur rounded-[2rem] p-6 shadow-2xl border border-white/50 grid grid-cols-2 md:grid-cols-4 gap-4">
                {NEW_INSTRUMENTS.map((inst) => (
                  <button
                    key={inst.name}
                    onClick={() => {
                      onAddTrack(inst.type, inst.name);
                      setShowAddMenu(false);
                    }}
                    className="flex flex-col items-center justify-center p-6 bg-slate-50 hover:bg-gradient-to-br hover:from-indigo-50 hover:to-purple-50 rounded-2xl transition-all gap-3 group border border-transparent hover:border-indigo-200 hover:shadow-lg"
                  >
                    <span className="text-4xl group-hover:scale-110 transition-transform drop-shadow-sm">
                      {inst.icon}
                    </span>
                    <span className="font-bold text-slate-700">{inst.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {showPatternLibrary && (
          <div className="bg-slate-900/95 p-4 rounded-2xl text-white border border-slate-700 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-xs uppercase tracking-[0.16em] text-indigo-300 font-black">Pattern Library</div>
                <div className="text-sm font-bold">Fast templates for instant jams</div>
              </div>
              <button onClick={() => setShowPatternLibrary(false)} className="text-slate-300 hover:text-white text-xs font-bold">Close</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              {[
                { title: "Boom Bap", desc: "Punchy drums + tight hat grooves", action: () => handleMagicButton() },
                { title: "Ambient Chord", desc: "Soft pad progression + arpeggio", action: () => applySelectedGenre() },
                { title: "Amapiano Pulse", desc: "Swingy keys and 808 bounce", action: () => fillCurrentPattern() },
              ].map((p) => (
                <button key={p.title} onClick={p.action} className="bg-slate-800/80 border border-slate-600 rounded-xl p-3 text-left hover:border-indigo-400 hover:bg-indigo-700/40 transition-all">
                  <div className="text-xs uppercase text-indigo-300 font-black">Template</div>
                  <div className="text-sm font-bold mt-1">{p.title}</div>
                  <div className="text-slate-300 mt-1">{p.desc}</div>
                </button>
              ))}
            </div>
            <div className="mt-4 border-t border-slate-700 pt-3">
              <div className="text-xs uppercase tracking-[0.16em] text-indigo-300 font-black mb-2">Arranger Sections</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
                {SECTION_NAMES.map((name) => {
                  const section = sections[name];
                  return (
                    <div key={name} className="rounded-xl border border-slate-600 p-2 bg-slate-800/60">
                      <div className="font-bold text-slate-100">{name}</div>
                      <div className="text-slate-300 mt-1 text-[10px]">
                        {section ? `Saved ${section.savedAt}` : "Empty"}
                      </div>
                      <div className="mt-2 flex gap-1">
                        <button onClick={() => saveSectionPattern(name as SectionName)} className="flex-1 bg-indigo-500 hover:bg-indigo-400 rounded-md py-1 text-[10px]">Save</button>
                        <button onClick={() => loadSectionPattern(name as SectionName)} className="flex-1 bg-emerald-500 hover:bg-emerald-400 rounded-md py-1 text-[10px]">Load</button>
                      </div>
                      <button onClick={() => addSectionToArranger(name as SectionName)} className="mt-1 w-full text-[10px] font-bold bg-blue-600 hover:bg-blue-500 rounded-md py-1">Add to Arranger</button>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="mt-3 rounded-xl border border-slate-700 bg-slate-800 p-3">
              <div className="flex items-center justify-between text-xs font-black uppercase tracking-[0.14em] text-indigo-200 mb-2">Arrangement Timeline</div>
              {arranger.length === 0 ? (
                <div className="text-[11px] text-slate-300">Save a section and add to arranger to build your song structure.</div>
              ) : (
                <div className="space-y-2 text-[11px]">
                  {arranger.map((item, index) => (
                    <div key={item.id} className="rounded-xl border border-slate-600 bg-slate-900/70 p-2 flex items-center justify-between gap-2">
                      <div>
                        <div className="font-bold text-slate-100">{index + 1}. {item.name}</div>
                        <div className="text-slate-300">{item.section} • {item.savedAt}</div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => moveArrangerItem(item.id, 'up')} className="px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-[11px]">↑</button>
                        <button onClick={() => moveArrangerItem(item.id, 'down')} className="px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-[11px]">↓</button>
                        <button onClick={() => removeArrangerItem(item.id)} className="px-2 py-1 rounded bg-rose-600 hover:bg-rose-500 text-[11px]">X</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Known Instrumentals (Genres) */}
        <div className="p-6 bg-white border-t border-slate-200 shadow-[0_-10px_40px_rgba(0,0,0,0.05)] z-10 relative">
          <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
            <Music2 size={16} /> Known Instrumentals
          </h3>

          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {genreList.map((g) => {
              const colorClass = GENRE_COLOR[g.id] ?? "text-indigo-500";
              return (
                <button
                  key={g.id}
                  onClick={() => {
                    setSelectedGenre(g);
                    setSelectedVariations([]);
                    (window as unknown as Record<string, string>).__ACTIVE_GENRE_ID__ = g.id;
                  }}
                  className="group relative h-24 rounded-2xl bg-slate-50 hover:bg-white border-2 border-transparent hover:border-indigo-500 shadow-sm hover:shadow-xl transition-all cursor-pointer overflow-hidden flex flex-col items-center justify-center gap-2"
                >
                  <Music2 size={24} className={`${colorClass} group-hover:scale-110 transition-transform`} />
                  <div className="font-bold text-sm text-slate-700">{g.label}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="h-32" />
      </div>

      {/* Genre Variation Modal */}
      {selectedGenre && (
        <div className="absolute inset-0 z-50 bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] shadow-2xl p-8 w-full max-w-lg animate-in fade-in zoom-in duration-200 border border-white/50">
            <div className="flex justify-between items-start mb-8">
              <div>
                <h3 className="text-3xl font-black text-slate-800 mb-1">{selectedGenre.label}</h3>
                <p className="text-sm text-slate-500 font-bold">Select Variations (Multiselect)</p>
              </div>

              <button
                onClick={() => setSelectedGenre(null)}
                className="p-3 bg-slate-100 hover:bg-red-100 hover:text-red-500 rounded-full transition-colors"
                aria-label="Close"
              >
                <X size={24} />
              </button>
            </div>

            <div className="grid grid-cols-5 gap-3">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => {
                const isSelected = selectedVariations.includes(num);
                return (
                  <button
                    key={num}
                    onClick={() => {
                      toggleVariation(num);

                      // Optional: apply instantly on click (comment out if you want apply only on Done)
                      const idx = num - 1;
                      onUpdateTracks(applyGenre(tracks, selectedGenre, idx));
                    }}
                    className={`aspect-square rounded-2xl font-black text-xl transition-all shadow-[0_4px_0_0_rgba(0,0,0,0.1)] active:translate-y-[4px] active:shadow-none border-b-4
                      ${
                        isSelected
                          ? "bg-indigo-500 text-white border-indigo-700"
                          : "bg-slate-50 border-slate-200 text-slate-400 hover:bg-white"
                      }`}
                  >
                    {num}
                  </button>
                );
              })}
            </div>

            <div className="mt-8 flex justify-end">
              <button
                onClick={applySelectedGenre}
                className="px-8 py-3 bg-slate-800 text-white font-bold rounded-2xl hover:bg-slate-700 shadow-xl"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
