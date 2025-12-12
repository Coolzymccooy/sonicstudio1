import React from 'react';
import { X, HelpCircle, BookOpen, Lightbulb } from 'lucide-react';
import { AppMode } from '../types';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: AppMode;
}

export const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose, mode }) => {
  if (!isOpen) return null;

  const getContent = () => {
    switch (mode) {
      case 'GRADE_1':
        return {
          title: "Grade 1 Mode: Beat Playground",
          desc: "A simplified, block-based interface for instant music creation.",
          steps: [
            "Tap the numbered blocks (1-16) to create a rhythm.",
            "Click 'Magic Beat' to let AI generate a pattern for you.",
            "Use the 'Rec Vocal' button on the Vocal track to record your voice.",
            "Click instrument icons to expand/collapse their controls."
          ]
        };
      case 'PRO':
        return {
          title: "Pro Mode: Session View",
          desc: "A vertical mixer workflow similar to Ableton Live or Logic Pro.",
          steps: [
            "Use the Faders to balance volume levels.",
            "Toggle 'AI Inserts' (AutoTune, DeNoise) to polish audio in real-time.",
            "The Visualizer shows the master output levels.",
            "Use Mute (M) and Solo (S) to isolate tracks during mixing."
          ]
        };
      case 'DJ':
        return {
          title: "DJ Mode: Dual Decks",
          desc: "Perform live mixes with two audio decks and a crossfader.",
          steps: [
            "Load tracks into Deck A or B from the Library or Upload.",
            "Use the Crossfader at the bottom to blend between decks.",
            "Hit 'SYNC' to match the BPM of the two tracks automatically.",
            "Use 'AI Auto-Mix' to let the system transition for you."
          ]
        };
      case 'SAMPLER':
        return {
          title: "Sampler & Mastering",
          desc: "Drag, drop, and polish audio files.",
          steps: [
            "Drag audio files into the main area to load them.",
            "Import previous recordings from your Library using the 'Disc' icon.",
            "Click 'World Standard Master' to apply AI loudness processing.",
            "Export the final result as MP3."
          ]
        };
      case 'BROADCAST':
        return {
          title: "Broadcast Mode: TV Control Room",
          desc: "Process live audio/video before sending it to streaming software.",
          steps: [
            "Allow Camera/Mic access when prompted.",
            "Select 'Cinematic' or 'Studio' looks to grade your video.",
            "Ensure 'HyperGate' is active to silence background noise.",
            "Click 'Clean Feed (OBS)' to hide controls, then window-capture this tab in OBS Studio."
          ]
        };
      default:
        return { title: "Welcome", desc: "", steps: [] };
    }
  };

  const content = getContent();

  return (
    <div className="fixed inset-0 z-[150] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white text-slate-800 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden relative border border-white/20">
        
        {/* Header */}
        <div className="bg-slate-100 p-6 border-b border-slate-200 flex justify-between items-center">
           <div className="flex items-center gap-3">
              <div className="bg-yellow-500 p-2 rounded-lg text-white shadow-lg">
                 <HelpCircle size={24} />
              </div>
              <h2 className="text-xl font-bold text-slate-800">Help Corner</h2>
           </div>
           <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
              <X size={20} />
           </button>
        </div>

        {/* Body */}
        <div className="p-8">
           <h3 className="text-2xl font-black mb-2 text-indigo-600">{content.title}</h3>
           <p className="text-slate-500 mb-6 font-medium">{content.desc}</p>

           <div className="space-y-4">
              <h4 className="text-xs font-bold uppercase text-slate-400 tracking-widest flex items-center gap-2">
                 <BookOpen size={14} /> Quick Guide
              </h4>
              <ul className="space-y-3">
                 {content.steps.map((step, idx) => (
                    <li key={idx} className="flex gap-3 text-sm text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-100">
                       <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-xs">
                          {idx + 1}
                       </span>
                       {step}
                    </li>
                 ))}
              </ul>
           </div>

           <div className="mt-8 p-4 bg-yellow-50 rounded-xl border border-yellow-100 flex gap-3">
              <Lightbulb className="text-yellow-600 flex-shrink-0" size={20} />
              <p className="text-xs text-yellow-800 font-medium">
                 Tip: Use the AI Assistant (Sparkles icon) at the bottom right if you get stuck or want to generate ideas automatically.
              </p>
           </div>
        </div>

      </div>
    </div>
  );
};