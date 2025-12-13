// src/types/audio.ts
export type AudioDeviceSettings = {
  inputId: string;                 // mic/input device id
  outputId: string;                // monitor/headphones device id
  broadcastBus?: string;           // e.g. "Same as monitor" or a virtual output label/id
  // add more fields later if your UI uses them (no breaking change)
};
