import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Camera,
  Mic,
  Maximize,
  Activity,
  Cast,
  WifiOff,
  RefreshCcw,
  Video,
  Disc,
  StopCircle,
} from 'lucide-react';
import {
  setupLiveVocalChain,
  getAudioContext,
  getMasterRecordingStream,
} from '../services/audioEngine';
import type { AudioDeviceSettings } from '../types';

type BroadcastMeter = {
  db: number;
  peakDb: number;
  rms: number;
  clipping: boolean;
};

interface BroadcastModeProps {
  settings?: AudioDeviceSettings; // Optional for old calls
  meter?: BroadcastMeter;         // Optional (new)
  onResetClip?: () => void;       // Optional (new)
}

export const BroadcastMode: React.FC<BroadcastModeProps> = ({
  settings,
  meter,
  onResetClip,
}) => {
  const [isLive, setIsLive] = useState(false);
  const [videoFilter, setVideoFilter] = useState<'NONE' | 'CINEMATIC' | 'STUDIO' | 'NOIR'>('NONE');
  const [cleanFeedMode, setCleanFeedMode] = useState(false);

  // Legacy local visualiser (kept)
  const [audioLevel, setAudioLevel] = useState(0);

  // Network / errors
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Local Recording State
  const [isRecordingLocal, setIsRecordingLocal] = useState(false);
  const localRecorderRef = useRef<MediaRecorder | null>(null);
  const localChunksRef = useRef<Blob[]>([]);

  // Audio Control
  const [inputGain, setInputGain] = useState(-40); // Initial Gate Threshold

  const videoRef = useRef<HTMLVideoElement>(null);

  // Visualiser cleanup refs
  const visRafRef = useRef<number | null>(null);
  const visSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const visAnalyserRef = useRef<AnalyserNode | null>(null);

  // Network Status Listener
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Initialize Camera & Audio safely
  useEffect(() => {
    startStream();
    return () => {
      stopStream();
      stopVisualizer();
    };
    // Only restart when threshold or selected video device changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputGain, settings?.videoInputDeviceId]);

  const stopStream = () => {
    try {
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((t) => t.stop());
        videoRef.current.srcObject = null;
      }
    } catch { /* ignored */ }
  };

  const stopVisualizer = () => {
    try {
      if (visRafRef.current) cancelAnimationFrame(visRafRef.current);
      visRafRef.current = null;

      if (visSourceRef.current) {
        visSourceRef.current.disconnect();
        visSourceRef.current = null;
      }
      if (visAnalyserRef.current) {
        visAnalyserRef.current.disconnect();
        visAnalyserRef.current = null;
      }
    } catch { /* ignored */ }
  };

  const startVisualizer = (stream: MediaStream) => {
    try {
      stopVisualizer();

      const ctx = getAudioContext();
      if (!ctx || ctx.state === 'closed') return;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.85;

      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);

      visSourceRef.current = source;
      visAnalyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const updateLevel = () => {
        try {
          analyser.getByteFrequencyData(dataArray);
          let sum = 0;
          // keep your original "every 10th bin" approach
          for (let i = 0; i < dataArray.length; i += 10) sum += dataArray[i];
          setAudioLevel(sum / (dataArray.length / 10));
        } catch { /* ignored */ }

        visRafRef.current = requestAnimationFrame(updateLevel);
      };

      updateLevel();
    } catch (e) {
      console.warn('Visualizer warning:', e);
    }
  };

  const startStream = async () => {
    try {
      setCameraError(null);

      // Use specific video device if selected in settings
      const videoConstraint =
        settings?.videoInputDeviceId && settings.videoInputDeviceId !== 'default'
          ? {
              deviceId: { exact: settings.videoInputDeviceId },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
            }
          : { width: { ideal: 1920 }, height: { ideal: 1080 } };

      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraint,
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      try {
        // Apply the threshold from our state
        await setupLiveVocalChain(stream, inputGain, true);
      } catch (audioErr) {
        console.warn('Audio Engine Warning:', audioErr);
      }

      // Visualizer (legacy local meter)
      startVisualizer(stream);
    } catch (e) {
      console.error('Camera/Mic access denied', e);
      setCameraError(
        'Camera/Mic access denied. Go to Settings > Camera Source to select your device (Camo/EpocCam) explicitly.',
      );
    }
  };

  const toggleGoLive = () => {
    // Simulation of a "Live" state for the user's peace of mind
    setIsLive((v) => !v);
  };

  const handleToggleLocalRecord = () => {
    if (isRecordingLocal) {
      // STOP RECORDING
      if (localRecorderRef.current && localRecorderRef.current.state === 'recording') {
        localRecorderRef.current.stop();
        setIsRecordingLocal(false);
      }
      return;
    }

    // START RECORDING
    if (!videoRef.current || !videoRef.current.srcObject) return;

    // 1. Get Video Track (from camera)
    const cameraStream = videoRef.current.srcObject as MediaStream;
    const videoTrack = cameraStream.getVideoTracks()[0];

    // 2. Get Processed Audio Track (HyperGate + AI Polish from AudioEngine)
    // We assume the user wants the processed audio since they are in "Broadcast" mode
    let audioTrack: MediaStreamTrack | undefined;
    try {
      const audioStream = getMasterRecordingStream();
      audioTrack = audioStream.getAudioTracks()[0];
    } catch (e) {
      console.warn('Could not get processed audio, falling back to camera audio', e);
      audioTrack = cameraStream.getAudioTracks()[0];
    }

    if (!videoTrack || !audioTrack) {
      alert('Cannot start recording: Missing video or audio track.');
      return;
    }

    // 3. Combine
    const combinedStream = new MediaStream([videoTrack, audioTrack]);

    // 4. Record
    try {
      const recorder = new MediaRecorder(combinedStream, { mimeType: 'video/webm' });
      localRecorderRef.current = recorder;
      localChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) localChunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(localChunksRef.current, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);

        // Auto Download
        const a = document.createElement('a');
        a.href = url;
        a.download = `flowstate_broadcast_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.webm`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        localChunksRef.current = [];
      };

      recorder.start();
      setIsRecordingLocal(true);
    } catch (e) {
      console.error('MediaRecorder error', e);
      alert('Recording failed to start. Browser may not support this format.');
    }
  };

  const getFilterStyle = () => {
    switch (videoFilter) {
      case 'CINEMATIC':
        return 'contrast-125 saturate-125 brightness-90 sepia-[0.2]';
      case 'STUDIO':
        return 'contrast-110 brightness-110 saturate-105';
      case 'NOIR':
        return 'grayscale contrast-125 brightness-90';
      default:
        return '';
    }
  };

  // Meter panel numbers:
  // - If App passes a meter, use it.
  // - Otherwise fall back to your local analyser "audioLevel" (converted to a rough %).
  const meterView = useMemo(() => {
    if (meter) return meter;
    // fallback “rough meter” so BroadcastMode never feels empty
    const rmsRough = Math.min(1, Math.max(0, (audioLevel * 2) / 100)); // mimic your bar scaling
    const dbRough = rmsRough > 0 ? 20 * Math.log10(rmsRough) : -120;
    return { db: dbRough, peakDb: dbRough, rms: rmsRough, clipping: false };
  }, [meter, audioLevel]);

  // Clean Feed View (For OBS Capture)
  if (cleanFeedMode) {
    return (
      <div
        className="fixed inset-0 bg-black z-[200] flex items-center justify-center overflow-hidden cursor-none"
        onClick={() => setCleanFeedMode(false)}
      >
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className={`w-full h-full object-cover ${getFilterStyle()}`}
        />
        <div className="absolute top-10 right-10 opacity-50 pointer-events-none">
          <div className="w-12 h-12 bg-yellow-500 rounded-lg flex items-center justify-center font-brand font-bold text-2xl text-black">
            T
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-gray-950 text-white flex flex-col font-sans relative overflow-hidden">
      {/* Top Control Bar */}
      <div className="h-16 bg-black border-b border-gray-800 flex items-center justify-between px-6 z-20 shrink-0">
        <div className="flex items-center gap-3">
          <div
            className={`flex items-center gap-2 px-3 py-1 rounded border transition-colors ${
              isLive
                ? 'bg-red-900/30 border-red-500 text-red-500'
                : isOnline
                  ? 'bg-gray-900 border-gray-700 text-gray-500'
                  : 'bg-gray-800 border-gray-600 text-gray-400'
            }`}
          >
            <div
              className={`w-3 h-3 rounded-full ${
                isLive ? 'bg-red-500 animate-pulse' : isOnline ? 'bg-green-500' : 'bg-gray-500'
              }`}
            />
            <span className="font-bold tracking-widest text-xs">
              {isLive ? 'ON AIR' : isOnline ? 'ONLINE' : 'OFFLINE'}
            </span>
          </div>

          {!isOnline && <WifiOff size={16} className="text-gray-500" />}

          <div className="h-6 w-px bg-gray-800 mx-2" />

          <div className="flex items-center gap-2 text-sm font-bold text-gray-300">
            <Video size={18} className="text-blue-500" />
            <span className="hidden sm:inline">Stream Studio</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-2 text-xs text-gray-500 bg-gray-900 px-3 py-1.5 rounded-lg border border-gray-800">
            <Cast size={12} />
            <span>Ready for OBS Capture</span>
          </div>

          <button
            onClick={handleToggleLocalRecord}
            className={`px-4 py-2 rounded-full font-bold text-sm transition-all flex items-center gap-2 border ${
              isRecordingLocal
                ? 'bg-red-900/80 border-red-500 text-red-100 animate-pulse'
                : 'bg-gray-800 hover:bg-gray-700 text-gray-300 border-gray-600'
            }`}
            title="Record video locally to your computer"
          >
            {isRecordingLocal ? <StopCircle size={16} /> : <Disc size={16} />}
            {isRecordingLocal ? 'STOP REC' : 'REC DISK'}
          </button>

          <button
            onClick={toggleGoLive}
            className={`px-6 py-2 rounded-full font-bold text-sm transition-all shadow-lg ${
              isLive
                ? 'bg-red-600 hover:bg-red-700 text-white animate-pulse'
                : 'bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-600'
            }`}
          >
            {isLive ? 'STOP STREAM' : 'START SESSION'}
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Main Viewport */}
        <div className="flex-1 relative bg-[#050505] flex items-center justify-center p-4">
          {/* The Monitor */}
          <div className="relative aspect-video w-full max-w-5xl bg-black rounded-xl overflow-hidden shadow-2xl border border-gray-800 group">
            {cameraError ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900 text-gray-500 gap-4">
                <WifiOff size={48} className="mb-4 opacity-50" />
                <p className="font-bold text-center px-4 max-w-md">{cameraError}</p>
                <button
                  onClick={() => {
                    setCameraError(null);
                    startStream();
                  }}
                  className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-full font-bold text-sm flex items-center gap-2"
                >
                  <RefreshCcw size={16} /> Retry Permissions
                </button>
              </div>
            ) : (
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className={`w-full h-full object-cover transition-all duration-500 ${getFilterStyle()}`}
              />
            )}

            {/* Overlay UI (Hidden in Clean Feed) */}
            <div className="absolute bottom-4 left-4 flex gap-2">
              <div className="bg-black/60 backdrop-blur px-3 py-1 rounded text-xs font-bold text-green-400 border border-green-500/30 flex items-center gap-2">
                <Mic size={12} /> HYPERGATE ACTIVE
              </div>

              {videoFilter !== 'NONE' && (
                <div className="bg-black/60 backdrop-blur px-3 py-1 rounded text-xs font-bold text-blue-400 border border-blue-500/30 flex items-center gap-2">
                  <Camera size={12} /> {videoFilter} LOOK
                </div>
              )}

              {isRecordingLocal && (
                <div className="bg-red-600 px-3 py-1 rounded text-xs font-bold text-white flex items-center gap-2 animate-pulse">
                  <Disc size={12} /> REC
                </div>
              )}
            </div>

            {/* Clean Feed Prompt */}
            <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => setCleanFeedMode(true)}
                className="bg-black/80 hover:bg-black text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 border border-gray-700 backdrop-blur shadow-xl"
              >
                <Maximize size={14} /> CLEAN FEED (OBS)
              </button>
            </div>
          </div>
        </div>

        {/* Sidebar Controls */}
        <div className="w-80 bg-gray-900 border-l border-gray-800 p-6 pb-24 flex flex-col gap-8 z-10 shadow-2xl overflow-y-auto">
          {/* NEW: Broadcast Output Meter (App meter preferred, fallback to local) */}
          <div className="bg-black/40 border border-gray-800 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-gray-400 uppercase tracking-widest">Broadcast Output</div>
                <div className="text-[10px] text-gray-500">What your stream/recording hears</div>
              </div>

              <div className="flex items-center gap-2">
                <div className="font-mono text-xs text-gray-300">{meterView.db.toFixed(1)} dB</div>

                {meterView.clipping && (
                  <button
                    onClick={() => onResetClip?.()}
                    className="px-2 py-1 rounded bg-red-600 hover:bg-red-500 text-white text-[10px] font-bold"
                    title="Clear clip indicator"
                    type="button"
                  >
                    CLIP
                  </button>
                )}
              </div>
            </div>

            <div className="mt-3 relative h-3 rounded bg-black/30 overflow-hidden">
              {/* RMS fill */}
              <div
                className="h-full"
                style={{
                  width: `${Math.min(100, Math.max(0, meterView.rms * 140))}%`,
                  background:
                    meterView.db > -6 ? '#ef4444' : meterView.db > -18 ? '#f59e0b' : '#22c55e',
                }}
              />
              {/* Peak marker */}
              <div
                className="absolute top-0 bottom-0 w-[2px] bg-white/80"
                style={{
                  left: `${Math.min(100, Math.max(0, Math.pow(10, meterView.peakDb / 20) * 140))}%`,
                }}
              />
            </div>

            <div className="mt-2 text-[11px] text-gray-500 flex justify-between font-mono">
              <span>-60</span>
              <span>-24</span>
              <span>-12</span>
              <span>-6</span>
              <span>0</span>
            </div>
          </div>

          {/* Audio Section (existing) */}
          <div>
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4 flex items-center gap-2">
              <Mic size={14} /> Audio Processing
            </h3>

            <div className="bg-black/40 p-4 rounded-xl border border-gray-800 space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm font-bold text-gray-300">Input Level</span>
                <span
                  className={`text-xs font-mono font-bold ${
                    audioLevel > 10 ? 'text-green-500' : 'text-gray-600'
                  }`}
                >
                  {audioLevel.toFixed(0)}%
                </span>
              </div>

              {/* Meter */}
              <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-green-500 to-red-500 transition-all duration-75"
                  style={{ width: `${Math.min(100, audioLevel * 2)}%` }}
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-gray-500 uppercase flex justify-between">
                  <span>Gate Threshold</span>
                  <span>{inputGain}dB</span>
                </label>

                <input
                  type="range"
                  min="-60"
                  max="0"
                  value={inputGain}
                  onChange={(e) => setInputGain(parseInt(e.target.value))}
                  className="w-full h-1 bg-gray-700 rounded appearance-none cursor-pointer"
                />
              </div>

              <div className="flex items-center gap-2 text-xs text-blue-300 bg-blue-900/20 p-2 rounded border border-blue-900/50">
                <Activity size={14} />
                AI DeNoise &amp; Polish Enabled
              </div>
            </div>
          </div>

          {/* Video FX Section (existing) */}
          <div>
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4 flex items-center gap-2">
              <Camera size={14} /> Video Grading
            </h3>

            <div className="grid grid-cols-2 gap-2">
              {['NONE', 'CINEMATIC', 'STUDIO', 'NOIR'].map((filter) => (
                <button
                  key={filter}
                  onClick={() => setVideoFilter(filter as typeof videoFilter)}
                  className={`py-3 rounded-lg text-xs font-bold border transition-all ${
                    videoFilter === filter
                      ? 'bg-yellow-600 border-yellow-500 text-black'
                      : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700'
                  }`}
                  type="button"
                >
                  {filter}
                </button>
              ))}
            </div>
          </div>

          {/* OBS Guide (existing) */}
          <div className="mt-auto bg-gray-800/50 p-4 rounded-xl border border-gray-700">
            <h3 className="text-xs font-bold text-white mb-2 flex items-center gap-2">
              <Cast size={14} className="text-purple-400" /> Connecting to OBS
            </h3>

            <p className="text-[10px] text-gray-400 leading-relaxed mb-3">
              This app creates a high-quality studio feed. To stream to YouTube/Twitch:
            </p>

            <ol className="text-[10px] text-gray-400 list-decimal ml-4 space-y-1">
              <li>
                Click <strong>CLEAN FEED (OBS)</strong> on the video.
              </li>
              <li>
                In OBS Studio, add <strong>Window Capture</strong>.
              </li>
              <li>Select this window to capture the processed feed.</li>
              <li>
                Enter your Stream Key <strong>in OBS Settings</strong>.
              </li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
};
