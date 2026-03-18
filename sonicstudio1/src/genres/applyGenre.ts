// src/genres/applyGenre.ts

import type { Track } from "../types";
import type { GenreDefinition } from "./genreTypes";


const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

function chance(p: number) {
  return Math.random() < clamp01(p);
}

function applyToDrums(v: number[], density: number, syncopation: number) {
  // Start from a simple backbone then sprinkle syncopation
  // v is length 16 with values 0..1
  for (let i = 0; i < 16; i++) v[i] = 0;

  // Kick-ish anchors (1, 9)
  v[0] = 0.9;
  v[8] = 0.7;

  // Snare-ish anchors (5, 13)
  v[4] = 0.85;
  v[12] = 0.75;

  // Hats: more density = more hats
  const hatBase = 0.25 + density * 0.55;
  for (let i = 0; i < 16; i++) {
    if (i % 2 === 0 && chance(hatBase)) v[i] = Math.max(v[i], 0.35 + Math.random() * 0.35);
    if (chance(hatBase * 0.35)) v[i] = Math.max(v[i], 0.2 + Math.random() * 0.3);
  }

  // Syncopation accents (off-beats)
  const sync = 0.1 + syncopation * 0.35;
  const offbeats = [3, 7, 11, 15];
  offbeats.forEach((idx) => {
    if (chance(sync)) v[idx] = Math.max(v[idx], 0.45 + Math.random() * 0.35);
  });

  // Thin out if density is low
  if (density < 0.45) {
    for (let i = 0; i < 16; i++) {
      if (i !== 0 && i !== 4 && i !== 8 && i !== 12 && chance(0.35)) v[i] *= 0.0;
    }
  }
}

function applyToBass(v: number[], movement: number, syncopation: number) {
  for (let i = 0; i < 16; i++) v[i] = 0;

  // Foundation on downbeats
  v[0] = 0.75;
  v[8] = 0.65;

  // More movement = more notes
  const move = 0.08 + movement * 0.28;
  for (let i = 0; i < 16; i++) {
    if (chance(move)) v[i] = Math.max(v[i], 0.35 + Math.random() * 0.45);
  }

  // Syncopation push
  const sync = 0.05 + syncopation * 0.22;
  [6, 7, 14, 15].forEach((idx) => {
    if (chance(sync)) v[idx] = Math.max(v[idx], 0.35 + Math.random() * 0.45);
  });
}

function applyToSynth(v: number[], density: number, syncopation: number) {
  for (let i = 0; i < 16; i++) v[i] = 0;

  // Chords / stabs
  const base = 0.08 + density * 0.22;
  for (let i = 0; i < 16; i += 4) {
    if (chance(0.6 + density * 0.25)) v[i] = 0.5 + Math.random() * 0.35;
  }

  // Syncopated stabs
  const sync = 0.06 + syncopation * 0.25;
  [2, 6, 10, 14].forEach((idx) => {
    if (chance(sync)) v[idx] = Math.max(v[idx], 0.35 + Math.random() * 0.45);
  });

  // Extra sprinkles
  for (let i = 0; i < 16; i++) {
    if (chance(base * 0.6)) v[i] = Math.max(v[i], 0.25 + Math.random() * 0.35);
  }
}

function applyToVocal(v: number[], density: number) {
  for (let i = 0; i < 16; i++) v[i] = 0;
  // Keep vocals sparse in Grade1 mode
  const p = 0.03 + density * 0.08;
  for (let i = 0; i < 16; i++) {
    if (chance(p)) v[i] = 0.35 + Math.random() * 0.45;
  }
}

export const applyGenre = (
  tracks: Track[],
  genre: GenreDefinition,
  variationIndex: number
): Track[] => {
  const variation = genre.variations[variationIndex] ?? genre.variations[0];

  const density = variation?.drumDensity ?? 0.5;
  const movement = variation?.bassMovement ?? 0.5;
  const syncopation = variation?.syncopation ?? 0.35;

  const velocityDrift = 0.08;

  return tracks.map((t) => {
    const v = new Array(16).fill(0);

    if (t.type === "DRUMS") applyToDrums(v, density, syncopation);
    else if (t.type === "BASS") applyToBass(v, movement, syncopation);
    else if (t.type === "SYNTH" || t.type === "PIANO" || t.type === "GUITAR" || t.type === "STRINGS")
      applyToSynth(v, density, syncopation);
    else if (t.type === "VOCAL") applyToVocal(v, density);
    else if (t.type === "808") applyToBass(v, clamp01(movement + 0.15), clamp01(syncopation + 0.1));

    const steps = t.steps.map((s, i) => {
      const val = v[i] ?? 0;
      const active = val > 0.01;
      const human = (Math.random() * 2 - 1) * velocityDrift;
      const vel = active ? clamp01(val + human) : 0;

      return { ...s, active, velocity: vel };
    });

    return { ...t, steps };
  });
};

