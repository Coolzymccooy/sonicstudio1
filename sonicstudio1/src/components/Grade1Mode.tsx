import React, { useMemo, useState } from "react";
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
} from "lucide-react";

import { generateBeatPattern } from "../services/geminiService";

// ✅ Genres system
import type { GenreDefinition } from "../genres/genreTypes";
import { GENRES } from "../genres/definitions";
import { applyGenre } from "../genres/applyGenre";

interface Grade1ModeProps {
  tracks: Track[];
  isPlaying: boolean;
  currentStep: number;
  onTogglePlay: () => void;
  onUpdateStep: (trackId: string, stepIndex: number) => void;
  onUpdateTracks: (tracks: Track[]) => void;
  onRecordMic: (trackId: string) => void;
  isRecording: boolean;
  onAddTrack: (type: InstrumentType, name: string) => void;
  onSaveProject?: () => void;
}

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

// Creates a 16-step boom bap drumline with human feel
function makeBoomBap16(opts?: {
  swing?: number;        // 0..1
  humanize?: number;     // 0..1
  density?: number;      // 0..1
  ghost?: number;        // 0..1
}) {
  const swing = opts?.swing ?? 0.65;     // strong boom-bap shuffle feel
  const humanize = opts?.humanize ?? 0.25;
  const density = opts?.density ?? 0.55;
  const ghost = opts?.ghost ?? 0.35;

  // per-instrument lanes (0..1 intensity)
  const kick = new Array(16).fill(0);
  const snare = new Array(16).fill(0);
  const hat = new Array(16).fill(0);

  // --- anchors (classic head-nod) ---
  kick[0] = 0.95;
  kick[8] = 0.75;

  snare[4] = 0.9;
  snare[12] = 0.9;

  // --- kick variations ---
  if (chance(density * 0.8)) kick[6] = Math.max(kick[6], 0.55);   // push
  if (chance(density * 0.6)) kick[10] = Math.max(kick[10], 0.45); // late
  if (chance(density * 0.5)) kick[15] = Math.max(kick[15], 0.35); // pickup

  // --- snare ghosts (very soft) ---
  if (chance(ghost)) snare[3] = Math.max(snare[3], 0.18);
  if (chance(ghost * 0.8)) snare[11] = Math.max(snare[11], 0.16);

  // --- hats: swung 8ths-ish with human drift ---
  for (let i = 0; i < 16; i++) {
    const is8th = i % 2 === 0; // 0,2,4,6...
    const base = is8th ? 0.35 : 0.22;

    // swing: make offbeats “lighter” but present
    const offbeat = i % 4 === 2; // 2,6,10,14
    const swingBias = offbeat ? (0.15 + swing * 0.35) : 0;

    const p = (is8th ? 0.9 : 0.55) * (0.55 + density * 0.45);
    if (chance(p)) {
      hat[i] = clamp01(base + swingBias + rand(-0.06, 0.08));
    }
  }

  // convert intensity lanes to steps (velocity included)
  const mkSteps = (lane: number[]): StepLike[] =>
    lane.map((v, i) => {
      const active = v > 0.01;
      if (!active) return { active: false, velocity: 0 };

      // Humanize velocity more on offbeats
      const off = i % 4 === 2;
      const drift = rand(-humanize, humanize) * (off ? 0.18 : 0.12);
      const vel = clamp01(v + drift);

      return { active: true, velocity: vel };
    });

  return {
    kick: mkSteps(kick),
    snare: mkSteps(snare),
    hat: mkSteps(hat),
  };
}


export const Grade1Mode: React.FC<Grade1ModeProps> = ({
  tracks,
  isPlaying,
  currentStep,
  onTogglePlay,
  onUpdateStep,
  onUpdateTracks,
  onRecordMic,
  isRecording,
  onAddTrack,
  onSaveProject,
}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [expandedTracks, setExpandedTracks] = useState<Set<string>>(
    () => new Set(tracks.map((t) => t.id))
  );

  // ✅ Genre selection state (replaces selectedInstrumental)
  const [selectedGenre, setSelectedGenre] = useState<GenreDefinition | null>(null);
  const [selectedVariations, setSelectedVariations] = useState<number[]>([]); // 1..10

  const [showAddMenu, setShowAddMenu] = useState(false);

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

  // ✅ Magic Beat: uses either chosen genre+variations, or fallback vibe
 const handleMagicButton = async () => {
  setIsGenerating(true);

  try {
    // 🎧 BOOM-BAP HUMAN ENGINE (no clearing, no randomness wipe)
    const boom = makeBoomBap16({
      swing: 0.7,       // vintage MPC swing
      humanize: 0.35,   // loose timing feel
      density: 0.55,    // head-nod, not busy
      ghost: 0.45,      // ghost snares
    });

    const newTracks = tracks.map((t) => {
      if (t.type === "DRUMS") {
        // Merge kick + snare + hat into DRUMS lane
        const steps = t.steps.map((s, i) => {
          const k = boom.kick[i];
          const sn = boom.snare[i];
          const h = boom.hat[i];

          const active = k.active || sn.active || h.active;
          const velocity = Math.max(
            k.velocity ?? 0,
            sn.velocity ?? 0,
            h.velocity ?? 0
          );

          return {
            ...s,
            active,
            velocity,
          };
        });

        return { ...t, steps };
      }

      // 🎹 Jazzy instruments: sparse + human
      if (
        t.type === "PIANO" ||
        t.type === "SYNTH" ||
        t.type === "STRINGS"
      ) {
        const steps = t.steps.map((s, i) => {
          const play =
            i % 4 === 0 && Math.random() < 0.45; // chord stabs
          return {
            ...s,
            active: play,
            velocity: play ? 0.35 + Math.random() * 0.25 : 0,
          };
        });

        return { ...t, steps };
      }

      // 🎸 Bass (upright-style bounce)
      if (t.type === "BASS" || t.type === "808") {
        const steps = t.steps.map((s, i) => {
          const play =
            i === 0 ||
            i === 8 ||
            (Math.random() < 0.25 && i % 2 === 1);
          return {
            ...s,
            active: play,
            velocity: play ? 0.45 + Math.random() * 0.3 : 0,
          };
        });

        return { ...t, steps };
      }

      return t;
    });

    onUpdateTracks(newTracks);
  } finally {
    setIsGenerating(false);
  }
};


  return (
    <div className="h-full flex flex-col bg-slate-50 font-grade1 text-slate-800 overflow-hidden relative selection:bg-indigo-200">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-center p-4 bg-gray-900 border-b border-gray-800 z-20 gap-4 shadow-xl text-white">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl text-white shadow-lg shadow-indigo-500/30">
            <Layers size={24} />
          </div>
          <div>
            <h1 className="text-xl font-black text-white tracking-tight drop-shadow-sm">
              Beat Playground
            </h1>
            <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">
              Grade 1 Studio
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={onSaveProject}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-gray-800 border border-gray-700 text-gray-200 hover:bg-gray-700 transition-all"
            title="Save Project & Recordings"
          >
            <Save size={16} className="text-indigo-400" />
            <span className="hidden sm:inline">Save</span>
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
                      <span
                        className={`text-2xl font-black tracking-tight transition-colors ${
                          isEnabled ? "text-slate-800" : "text-slate-400"
                        }`}
                      >
                        {track.name}
                      </span>
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

                {/* Sequencer Grid */}
                <div className={`transition-all duration-500 ease-in-out overflow-hidden ${isExpanded ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"}`}>
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
