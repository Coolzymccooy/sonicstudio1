
export type GenreFeel = {
  bpmRange: [number, number]; // e.g. [70, 110]
  swing: number;             // 0..1
  humanizeMs: number;        // timing looseness in ms
};

export type GenreVariation = {
  label: string;       // e.g. "Slow Worship"
  drumDensity: number; // 0..1
  bassMovement: number; // 0..1
  syncopation: number; // 0..1
};

export type GenreDefinition = {
  id: string;          // e.g. "gospel"
  label: string;       // e.g. "Gospel"  ✅ use this in UI
  description: string;
  feel: GenreFeel;
  variations: GenreVariation[];
};
