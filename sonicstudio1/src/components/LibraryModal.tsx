import React, { useState } from 'react';
import { X, Music, FileJson, Download, Play, Trash2, Clock, Disc, FolderOpen } from 'lucide-react';
import type { AudioRecording, Track, ProjectData } from '../types';

interface LibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  recordings: AudioRecording[];
  onDeleteRecording: (id: string) => void;
  tracks: Track[];
  projects?: ProjectData[]; // New prop for Saved Projects
}

export const LibraryModal: React.FC<LibraryModalProps> = ({ 
  isOpen, 
  onClose, 
  recordings, 
  onDeleteRecording,
  tracks,
  projects = []
}) => {
  const [activeTab, setActiveTab] = useState<'RECORDINGS' | 'PROJECTS'>('RECORDINGS');

  const handleDownloadProject = () => {
    const file = new Blob([JSON.stringify(tracks, null, 2)], {type: 'application/json'});
    const element = document.createElement("a");
    element.href = URL.createObjectURL(file);
    element.download = `flowstate_project_${new Date().toISOString().slice(0,10)}.json`; 
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-[#121214] border border-gray-700 w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[80vh]">
        
        {/* Header */}
        <div className="p-6 bg-gray-900 border-b border-gray-800 flex justify-between items-center">
          <div className="flex items-center gap-4">
             <div className="p-3 bg-indigo-600 rounded-xl">
               <Disc className="text-white" size={24} />
             </div>
             <div>
               <h2 className="text-2xl font-bold text-white">Project Library</h2>
               <p className="text-sm text-gray-400">Manage your recordings and saved sessions</p>
             </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-800 rounded-full text-gray-400 hover:text-white">
            <X size={24} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-800 bg-black/20">
           <button 
             onClick={() => setActiveTab('RECORDINGS')}
             className={`flex-1 py-4 font-bold text-sm tracking-widest uppercase transition-colors ${activeTab === 'RECORDINGS' ? 'text-indigo-400 border-b-2 border-indigo-400 bg-gray-900/50' : 'text-gray-500 hover:text-gray-300'}`}
           >
             Audio Bounces ({recordings.length})
           </button>
           <button 
             onClick={() => setActiveTab('PROJECTS')}
             className={`flex-1 py-4 font-bold text-sm tracking-widest uppercase transition-colors ${activeTab === 'PROJECTS' ? 'text-indigo-400 border-b-2 border-indigo-400 bg-gray-900/50' : 'text-gray-500 hover:text-gray-300'}`}
           >
             Saved Projects
           </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-[#0f0f11]">
          
          {activeTab === 'RECORDINGS' && (
            <div className="space-y-4">
              {recordings.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-500 opacity-50">
                   <Music size={64} className="mb-4" />
                   <p>No audio recordings yet.</p>
                   <p className="text-xs">Use the Red Record Button in the header to bounce a mix.</p>
                </div>
              ) : (
                recordings.map(rec => (
                  <div key={rec.id} className="bg-gray-900 border border-gray-800 p-4 rounded-xl flex items-center justify-between group hover:border-gray-600 transition-colors">
                     <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-gray-800 rounded-full flex items-center justify-center border border-gray-700">
                           <Play size={20} className="text-indigo-400 ml-1" />
                        </div>
                        <div>
                           <h3 className="font-bold text-gray-200 text-lg">{rec.name}</h3>
                           <div className="flex items-center gap-3 text-xs text-gray-500 font-mono">
                              <span className="flex items-center gap-1"><Clock size={10} /> {rec.duration}</span>
                              <span>•</span>
                              <span>{rec.date.toLocaleString()}</span>
                           </div>
                        </div>
                     </div>
                     
                     <div className="flex items-center gap-2">
                        <audio src={rec.url} controls className="h-8 w-48 opacity-50 hover:opacity-100 transition-opacity" />
                        <a 
                          href={rec.url} 
                          download={`${rec.name}.webm`}
                          className="p-2 bg-gray-800 hover:bg-indigo-600 hover:text-white rounded-lg text-gray-400 transition-colors"
                          title="Download Audio"
                        >
                           <Download size={20} />
                        </a>
                        <button 
                          onClick={() => onDeleteRecording(rec.id)}
                          className="p-2 bg-gray-800 hover:bg-red-600 hover:text-white rounded-lg text-gray-400 transition-colors"
                        >
                           <Trash2 size={20} />
                        </button>
                     </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'PROJECTS' && (
            <div className="space-y-4">
               {/* Current Project Card */}
               <div className="bg-gradient-to-r from-gray-900 to-indigo-900/20 border border-indigo-500/30 p-6 rounded-xl mb-8">
                  <div className="flex justify-between items-start">
                     <div>
                       <h3 className="text-xl font-bold text-white flex items-center gap-2">
                          <FileJson size={20} className="text-yellow-400" /> Current Session
                       </h3>
                       <p className="text-sm text-gray-400 mt-1">Tracks: {tracks.length} • Active Patterns</p>
                     </div>
                     <button 
                       onClick={handleDownloadProject}
                       className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold text-sm flex items-center gap-2 shadow-lg shadow-indigo-900/50"
                     >
                        <Download size={16} /> Save Project JSON
                     </button>
                  </div>
                  <div className="mt-4 p-3 bg-black/30 rounded text-xs text-gray-500 font-mono">
                     Saving as JSON allows you to restore track settings, steps, and mixer states later.
                     <br/><span className="text-yellow-500">Note: Audio Recordings are not saved in JSON. Download them separately in the Recordings tab.</span>
                  </div>
               </div>

               {/* Saved Projects List */}
               <h3 className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-4">Local Projects ({projects.length})</h3>
               
               {projects.length === 0 ? (
                 <div className="text-center py-8 text-gray-600">No saved projects found.</div>
               ) : (
                 projects.map(proj => (
                    <div key={proj.id} className="bg-gray-900 border border-gray-800 p-4 rounded-xl flex items-center justify-between group hover:border-gray-600 transition-colors">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center text-gray-400">
                                <FolderOpen size={20} />
                            </div>
                            <div>
                                <h3 className="font-bold text-gray-200">{proj.name}</h3>
                                <div className="text-xs text-gray-500">{new Date(proj.date).toLocaleString()} • {proj.bpm} BPM</div>
                            </div>
                        </div>
                        <div className="text-xs text-gray-600">
                            {proj.tracks.length} Tracks
                        </div>
                    </div>
                 ))
               )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
};