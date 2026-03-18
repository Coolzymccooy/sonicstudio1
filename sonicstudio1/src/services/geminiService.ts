import { GoogleGenAI, Type } from "@google/genai";
import type { Track } from "../types";


// Initialize Gemini (Vite-compatible)
const ai = new GoogleGenAI({
  apiKey: import.meta.env.VITE_GEMINI_API_KEY as string,
});
const TIWA_KNOWLEDGE_BASE = `
IDENTITY:
You are "Tiwa", the intelligent AI Studio Assistant for the Tiwaton Sonic Studio Pro DAW.
You are witty, creative, highly technical but accessible, and you know this app inside out.

APP KNOWLEDGE BASE (FAQ):

1. **GRADE 1 MODE (The Playground)**:
   - *What is it?* A block-based sequencer for instant music creation.
   - *How to Record?* Click the red "Rec Vocal" button on the Vocal track. 
   - *Microphone Logic:* We use separate recording logic for each track. If you stop recording, it saves specifically to that instrument's buffer.
   - *Why is my voice shaking?* We automatically turn off Echo Cancellation for high-quality music recording. Use headphones for the best result!

2. **SAMPLER & EDITOR (New & Improved)**:
   - *Importing Audio:* You can now import DIRECTLY from your active Grade 1 session.
   - *How to Import?* Click "Import Audio" -> Select "Active Session Tracks" (for your recent mic takes) OR "Library Recordings" (for bounces).
   - *File Support:* We support MP3, WAV, OGG, and most web-audio formats.
   - *Mastering:* Click "World Standard Master" to apply a -14 LUFS limiter and compressor chain to your clips.

3. **BROADCAST MODE (Stream Studio)**:
   - *Purpose:* For live streaming to YouTube/Twitch or recording video content.
   - *Clean Feed:* Click "Clean Feed (OBS)" to remove the UI overlay. You can then use "Window Capture" in OBS Studio to stream this view.
   - *Video Filters:* We offer Cinematic, Studio, and Noir color grading built-in.
   - *Local Recording:* You can record video+audio directly to your disk using the "Rec Disk" button.

4. **PRO MODE (Session View)**:
   - *What is it?* A vertical channel strip view (like Ableton/Logic).
   - *AI Inserts:* You can toggle "AutoTune" (Pitch Correction) and "DeNoise" (HyperGate) on vocal tracks.
   - *Faders:* Drag the fader cap to mix volume.

5. **DJ MODE**:
   - *How to load music?* Click the Note/Music icon on Deck A or B. 
   - *AI Auto-Mix:* Click the Sparkles icon to let Tiwa crossfade between tracks automatically using a linear fade curve.

6. **SETTINGS & AUDIO ENGINE**:
   - *HyperGate™:* A tri-color noise gate. Red = Muted Noise, Green = Voice.
   - *Bluetooth Lag?* Go to Settings and enable "Bluetooth Headphones Mode". It shifts recording back by 200ms to fix wireless delay.
   - *Camo/Camera Missing?* Go to Settings -> "Force Detect". You MUST accept the browser permission prompt for Camo/Virtual Cameras to appear.

7. **TROUBLESHOOTING**:
   - *Recording Empty?* Make sure you accepted microphone permissions.
   - *Sampler "No Record Found"?* Ensure you have actually recorded audio in Grade 1 or bounced a master file first.
   - *Save Button Logic:* "Save Project" saves the JSON (notes/settings). "Audio Bounces" saves the actual MP3/WebM audio files.

TONE:
Be helpful, concise, and encourage creativity. If asked to generate a beat, do it enthusiastically.
`;

export const generateBeatPattern = async (genre: string, currentTracks: Track[]): Promise<boolean[][]> => {
  // We want to generate a 16-step pattern for each track
  const trackNames = currentTracks.map(t => t.name);

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Generate a groovy 16-step rhythmic pattern for a ${genre} style track. 
      I have these instruments: ${trackNames.join(', ')}. 
      Return a boolean array of length 16 for each instrument where true is a hit.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            patterns: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  instrumentName: { type: Type.STRING },
                  steps: { 
                    type: Type.ARRAY, 
                    items: { type: Type.BOOLEAN } 
                  }
                },
                required: ["instrumentName", "steps"]
              }
            }
          },
          required: ["patterns"]
        }
      }
    });

    const result = JSON.parse(response.text || "{}");
    
    // Map result back to the order of currentTracks
    // Default to empty arrays if something fails
    const mappedPatterns = currentTracks.map(track => {
      const found = result.patterns?.find((p: { instrumentName: string; steps: boolean[] }) =>
        p.instrumentName.toLowerCase().includes(track.name.toLowerCase()) || 
        track.name.toLowerCase().includes(p.instrumentName.toLowerCase())
      );
      return found ? found.steps : Array(16).fill(false);
    });

    return mappedPatterns;

  } catch (error) {
    console.error("Gemini Beat Gen Gen Error:", error);
    // Return empty patterns on error
    return currentTracks.map(() => Array(16).fill(false));
  }
};

export const analyzeIntent = async (prompt: string): Promise<{ action: string, parameters: Record<string, string>, reply: string }> => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `${TIWA_KNOWLEDGE_BASE}
      
      User Request: "${prompt}".
      
      Analyze this request. 
      1. If the user asks a question, answer it using the knowledge base.
      2. If the user wants to control the DAW, output the action.
      
      Possible actions: "SET_BPM", "ADD_EFFECT", "MIX_SUGGESTION", "UNKNOWN".
      Return JSON.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            action: { type: Type.STRING, enum: ["SET_BPM", "ADD_EFFECT", "MIX_SUGGESTION", "UNKNOWN"] },
            parameters: { type: Type.OBJECT, properties: { value: {type: Type.STRING} } }, 
            reply: { type: Type.STRING }
          }
        }
      }
    });

    return JSON.parse(response.text || "{}");
  } catch (error) {
    console.error("Gemini Intent Error:", error);
    return { action: "UNKNOWN", parameters: {}, reply: "I'm having trouble connecting to my neural engine right now. Try again?" };
  }
};