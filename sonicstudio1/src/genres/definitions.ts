// src/genres/definitions.ts
import type { GenreDefinition } from "./genreTypes";

/**
 * GENRES
 * ------
 * Central musical intelligence.
 * UI selects a genre → modal selects variation →
 * applyGenre() translates this into rhythm + feel.
 */
export const GENRES: Record<string, GenreDefinition> = {
  Gospel: {
    id: "gospel",
    label: "Gospel",
    description: "Soulful, uplifting, church-inspired grooves with live-band feel",
    feel: {
      bpmRange: [70, 110],
      swing: 0.25,
      humanizeMs: 22,
    },
    variations: [
      { label: "Slow Worship", drumDensity: 0.3, bassMovement: 0.2, syncopation: 0.15 },
      { label: "Praise Bounce", drumDensity: 0.6, bassMovement: 0.5, syncopation: 0.35 },
      { label: "Contemporary Gospel", drumDensity: 0.7, bassMovement: 0.6, syncopation: 0.4 },
      { label: "Choir Drive", drumDensity: 0.5, bassMovement: 0.4, syncopation: 0.25 },
    ],
  },

  Afrobeat: {
    id: "afrobeat",
    label: "Afrobeat",
    description: "Groovy West African rhythms with rolling percussion",
    feel: {
      bpmRange: [95, 125],
      swing: 0.3,
      humanizeMs: 18,
    },
    variations: [
      { label: "Classic Groove", drumDensity: 0.6, bassMovement: 0.5, syncopation: 0.45 },
      { label: "Dance Floor", drumDensity: 0.8, bassMovement: 0.7, syncopation: 0.6 },
      { label: "Minimal Bounce", drumDensity: 0.4, bassMovement: 0.3, syncopation: 0.25 },
    ],
  },

  "Trap Soul": {
    id: "trap-soul",
    label: "Trap Soul",
    description: "Moody, sparse, emotional trap-inspired grooves",
    feel: {
      bpmRange: [60, 90],
      swing: 0.1,
      humanizeMs: 14,
    },
    variations: [
      { label: "Late Night", drumDensity: 0.35, bassMovement: 0.4, syncopation: 0.2 },
      { label: "808 Heavy", drumDensity: 0.5, bassMovement: 0.7, syncopation: 0.3 },
    ],
  },

  "Lo-Fi": {
    id: "lofi",
    label: "Lo-Fi",
    description: "Chill, dusty, imperfect grooves",
    feel: {
      bpmRange: [60, 85],
      swing: 0.35,
      humanizeMs: 30,
    },
    variations: [
      { label: "Vinyl Chill", drumDensity: 0.25, bassMovement: 0.2, syncopation: 0.2 },
      { label: "Study Beat", drumDensity: 0.35, bassMovement: 0.3, syncopation: 0.25 },
    ],
  },

  House: {
    id: "house",
    label: "House",
    description: "Four-on-the-floor dance energy",
    feel: {
      bpmRange: [118, 128],
      swing: 0.05,
      humanizeMs: 6,
    },
    variations: [
      { label: "Classic", drumDensity: 0.7, bassMovement: 0.6, syncopation: 0.15 },
      { label: "Deep House", drumDensity: 0.6, bassMovement: 0.5, syncopation: 0.25 },
    ],
  },

  Amapiano: {
    id: "amapiano",
    label: "Amapiano",
    description: "Log drum-led South African grooves",
    feel: {
      bpmRange: [105, 115],
      swing: 0.4,
      humanizeMs: 24,
    },
    variations: [
      { label: "Log Drum Focus", drumDensity: 0.5, bassMovement: 0.8, syncopation: 0.55 },
      { label: "Smooth Piano", drumDensity: 0.4, bassMovement: 0.6, syncopation: 0.35 },
    ],
  },

  Synthwave: {
    id: "synthwave",
    label: "Synthwave",
    description: "Retro 80s pulse, driving arps and neon stabs",
    feel: {
      bpmRange: [90, 120],
      swing: 0.12,
      humanizeMs: 10,
    },
    variations: [
      { label: "Neon Drive", drumDensity: 0.55, bassMovement: 0.55, syncopation: 0.25 },
      { label: "Arcade Pulse", drumDensity: 0.65, bassMovement: 0.65, syncopation: 0.35 },
    ],
  },
};
