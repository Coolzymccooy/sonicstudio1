export enum AppMode {
  GRADE_1 = 'GRADE_1',
  PRO = 'PRO',
  DJ = 'DJ',
  SAMPLER = 'SAMPLER',
  BROADCAST = 'BROADCAST'
}

export enum InstrumentType {
  DRUMS = 'DRUMS',
  BASS = 'BASS',
  SYNTH = 'SYNTH',
  VOCAL = 'VOCAL',
  PIANO = 'PIANO',
  GUITAR = 'GUITAR',
  STRINGS = 'STRINGS',
  EIGHT_OH_EIGHT = '808'
}

export interface User {
  id: string;
  username: string;
  email: string;
  isPro: boolean;
  joinedAt: number;
}

export interface Step {
  active: boolean;
  velocity: number; // 0-1
}

export interface Track {
  id: string;
  name: string;
  type: InstrumentType;
  color: string; // Tailwind color class base (e.g., 'blue')
  steps: Step[]; // 16 steps for simple sequencer
  volume: number; // 0-1
  pan: number; // -1 to 1
  muted: boolean;
  solo: boolean;
  effects: string[]; // List of active AI effects
  clips: string[]; // Placeholder for clip names in Pro mode
  audioBuffer?: AudioBuffer | null; // For recorded audio
}

export interface Song {
  id: string;
  title: string;
  artist: string;
  bpm: number;
  key: string;
  coverColor: string;
  duration: string;
  buffer?: AudioBuffer | null; // Real audio data
}

export interface AudioRecording {
  id: string;
  name: string;
  date: Date;
  blob: Blob;
  url: string;
  duration: string;
}

export interface ProjectData {
  id: string;
  name: string;
  date: number;
  tracks: Track[];
  bpm: number;
}

export interface SampleClip {
  id: string;
  name: string;
  buffer: AudioBuffer;
  startTime: number; // In seconds
  duration: number; // In seconds
  volume: number;
  isLooping: boolean;
}

export interface AudioEngineState {
  isPlaying: boolean;
  bpm: number;
  currentStep: number; // 0-15
  startTime: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  isProcessing?: boolean;
}

export interface AudioDeviceSettings {
  inputDeviceId: string;
  videoInputDeviceId: string; // Added Video Input
  outputDeviceId: string;
  inputMode: 'studio' | 'standard'; 
  virtualOutputEnabled: boolean;
  hyperGateThreshold: number; // -60 to 0 dB
  aiEnhanceEnabled: boolean; // New AI Voice Treat Bypass
  latencyCompensation: number; // ms
}