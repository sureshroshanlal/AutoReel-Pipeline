import React, { useState, useEffect } from "react";
import { Music, Award, ShieldAlert, BadgeCheck, Compass, Sparkles, RefreshCw, Volume2, VolumeX, Mic } from "lucide-react";
import { Clip, Settings, VideoProject } from "../types";

interface AudioBrandPanelProps {
  activeClip: Clip | null;
  globalSettings: Settings;
  onUpdateClip: (fields: Partial<Clip>) => void;
  onUpdateSettings: (settings: Partial<Settings>) => void;
  selectedProject?: VideoProject | null;
}

export default function AudioBrandPanel({
  activeClip,
  globalSettings,
  onUpdateClip,
  onUpdateSettings,
  selectedProject
}: AudioBrandPanelProps) {
  const [trendingTracks, setTrendingTracks] = useState<any[]>([
    { 
      name: "Trending Instagram Lofi Chillbeat", 
      mood: "Relaxing / Minimal", 
      suitability: "Ambient loops, perfect for subtle background presence without overshadowing voice overlays.",
      aspectMatch: "Fits gentle 9:16 zoom transitions",
      durationMatch: true 
    },
    { 
      name: "High-Energy Phonk Bass (TikTok Viral)", 
      mood: "Sports / Action", 
      suitability: "Heavy bass hits and high-tempo, supreme for gaming edits and action segments.",
      aspectMatch: "Matches fast 9:16 center-focus crop camera shakes",
      durationMatch: true 
    },
    { 
      name: "Sunny Upbeat Acoustic Rake", 
      mood: "ASMR / Woodwork / Cooking", 
      suitability: "Natural rhythms, perfect for tactile tutorials and calming hands-on previews.",
      aspectMatch: "Keeps pacing high for vertical detail pans",
      durationMatch: true 
    },
    { 
      name: "Ethereal Cinematic Synthwave Loop", 
      mood: "Gaming / Tech", 
      suitability: "Futuristic ambient chords, excellent for dramatic build-ups and technical showcase reels.",
      aspectMatch: "Aids 9:16 center focus flow-through feel",
      durationMatch: true 
    },
    { 
      name: "None - Retain Original Audio", 
      mood: "Original Vocal Dialogue", 
      suitability: "Keep original source recording voice and gameplay noise intact.",
      aspectMatch: "Retains original 9:16 voice synchronization",
      durationMatch: true 
    }
  ]);
  const [loadingAudio, setLoadingAudio] = useState(false);

  // Helper to compute clip's duration in seconds
  const getClipDuration = (): number => {
    if (!activeClip) return 15;
    const parse = (t: string) => {
      const parts = (t || "00:00:00").split(":").map(Number);
      if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
      if (parts.length === 2) return parts[0] * 60 + parts[1];
      return Number(t) || 0;
    };
    const start = parse(activeClip.startTime);
    const end = parse(activeClip.endTime);
    return Math.max(1, end - start);
  };

  const clipDuration = getClipDuration();

  // Load active trending audio recommendations suited for this specific clip and aspect matching
  const fetchTrendingTracks = async () => {
    if (!activeClip) return;
    setLoadingAudio(true);
    try {
      const res = await fetch("/api/trending-audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: selectedProject?.title || "",
          clipName: activeClip.name,
          duration: clipDuration
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.tracks && Array.isArray(data.tracks)) {
          // Ensure we append "None - Retain Original Audio" tracking choice
          const withNone = [
            ...data.tracks,
            { 
              name: "None - Retain Original Audio", 
              mood: "Original Vocal Dialogue", 
              suitability: "Keep original source recording voice and gameplay noise intact.",
              aspectMatch: "Retains original 9:16 vocoder alignment",
              durationMatch: true 
            }
          ];
          setTrendingTracks(withNone);
        }
      }
    } catch (e) {
      console.error("Failed to load trending audio", e);
    } finally {
      setLoadingAudio(false);
    }
  };

  useEffect(() => {
    if (activeClip && selectedProject) {
      fetchTrendingTracks();
    }
  }, [activeClip?.id, selectedProject?.id, clipDuration]);

  // Handle Automatic Select
  const handleAutoSelectAudio = () => {
    // Find first track which is not "None" choice
    const bestTrack = trendingTracks.find(t => t.name && !t.name.startsWith("None"));
    if (bestTrack) {
      onUpdateClip({ backgroundMusic: bestTrack.name });
    }
  };

  if (!activeClip) {
    return (
      <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-xl flex items-center justify-center text-center h-48">
        <p className="text-xs text-slate-400">Select a timing clip to configure sound and branding overlays.</p>
      </div>
    );
  }

  // Active track info
  const activeTrackObj = trendingTracks.find(t => t.name === activeClip.backgroundMusic) || 
                         trendingTracks.find(t => !activeClip.backgroundMusic && t.name.startsWith("None"));

  return (
    <div id="audio-brand-widget" className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-xl h-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 border-b border-white/5 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-pink-500/10 flex items-center justify-center text-pink-400 shrink-0">
            <Music className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white font-display">Audio & Branding Engine</h2>
            <p className="text-xs text-slate-400">Mute noise, add music, and anchor watermarks</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            id="btn-auto-select-audio"
            onClick={handleAutoSelectAudio}
            className="flex items-center gap-1 bg-gradient-to-r from-pink-500 to-indigo-500 text-white font-black text-[9px] uppercase tracking-wider px-3 py-1.5 rounded-lg hover:opacity-90 active:scale-95 transition-all shadow-md cursor-pointer"
            title="Automatically select the top suggested suitable audio"
          >
            <Sparkles className="w-3 h-3" />
            <span>Auto-Select Best</span>
          </button>
          
          <button
            id="btn-refresh-audio"
            onClick={fetchTrendingTracks}
            disabled={loadingAudio}
            className="p-1.5 text-slate-400 hover:text-white bg-white/5 rounded-lg border border-white/10 hover:bg-white/10 transition-colors disabled:opacity-40"
            title="Refresh AI audio recommendations"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingAudio ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      <div className="space-y-5">

        {/* ── MUTE ORIGINAL AUDIO TOGGLE ─────────────────────── */}
        <div
          className={`flex items-center justify-between p-3.5 rounded-xl border transition-all cursor-pointer ${
            activeClip.muteOriginalAudio
              ? "bg-red-500/15 border-red-500/40 shadow-[0_0_12px_rgba(239,68,68,0.15)]"
              : "bg-white/5 border-white/10 hover:bg-white/8"
          }`}
          onClick={() => onUpdateClip({ muteOriginalAudio: !activeClip.muteOriginalAudio })}
          id="mute-original-audio-toggle"
        >
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
              activeClip.muteOriginalAudio ? "bg-red-500/20 text-red-400" : "bg-white/5 text-slate-400"
            }`}>
              {activeClip.muteOriginalAudio ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </div>
            <div>
              <p className={`text-xs font-bold ${ activeClip.muteOriginalAudio ? "text-red-300" : "text-white" }`}>
                {activeClip.muteOriginalAudio ? "Original Audio MUTED" : "Mute Original Audio"}
              </p>
              <p className="text-[10px] text-slate-400 leading-tight mt-0.5">
                {activeClip.muteOriginalAudio
                  ? "✅ TTS voice-over will be generated from your subtitles at render time"
                  : "Strip source audio → auto-generate voice-over from subtitles (free, no API)"}
              </p>
            </div>
          </div>
          {/* Toggle pill */}
          <div className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${
            activeClip.muteOriginalAudio ? "bg-red-500" : "bg-white/20"
          }`}>
            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
              activeClip.muteOriginalAudio ? "translate-x-5" : "translate-x-0.5"
            }`} />
          </div>
        </div>

        {/* Subtitle requirement note when mute is on */}
        {activeClip.muteOriginalAudio && (
          <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/25 rounded-xl p-3 text-[10px] text-amber-200">
            <Mic className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
            <span>
              <b>Requires subtitles</b> — Go to Tab 3 "Speech &amp; Social Copy" and click <b>⚡ Whisper Auto-Transcribe</b> first. Each subtitle line will be spoken aloud at its timestamp.
            </span>
          </div>
        )}

        <hr className="border-white/5" />
        <div>
          <div className="flex justify-between items-center mb-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 font-display">
              <Compass className="w-3.5 h-3.5 text-pink-400" />
              <span>Select popular Reels Soundtrack</span>
            </label>
            <span className="text-[10px] bg-indigo-500/10 text-indigo-300 font-bold px-2 py-0.5 rounded-full border border-indigo-500/25">
              Clip: {clipDuration}s (9:16 Mode)
            </span>
          </div>

          {/* Copyright awareness alert box */}
          <div className="mb-3.5 bg-indigo-500/10 border border-indigo-500/20 text-[11px] text-slate-300 p-3.5 rounded-xl space-y-1.5">
            <div className="flex items-center gap-1.5 font-bold text-indigo-300">
              <ShieldAlert className="w-4 h-4 text-pink-400 shrink-0" />
              <span>How Content ID & Soundtracks work in short-form apps:</span>
            </div>
            <p className="text-[10px] leading-relaxed text-slate-350">
              🎵 **Trending Tracks (like Tommy Richman, Sabrina Carpenter)** are viral hits. **Do not** baked-in embed them directly inside your downloaded MP4 file, or platforms may trigger Content ID flags. Instead, download the video with **None - Retain Original Audio**, and select the official song inside the Instagram/YouTube app player during upload, riding the viral algorithm 100% safely!
            </p>
            <p className="text-[10px] leading-relaxed text-slate-350 pt-1">
              🔒 For **safe direct exports** directly mixed into your downloaded MP4 without choosing anything in-app, select one of the royalty-free beats or **None - Retain Original Audio**.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-52 overflow-y-auto pr-1">
            {trendingTracks.map((track) => {
              const isSelected = activeClip.backgroundMusic === track.name || 
                                 (!activeClip.backgroundMusic && track.name?.startsWith("None"));
              return (
                <div
                  key={track.name}
                  id={`soundtrack-${track.name ? track.name.replace(/\s+/g, "-") : "None"}`}
                  onClick={() => onUpdateClip({ backgroundMusic: track.name })}
                  className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                    isSelected
                      ? "bg-gradient-to-br from-pink-500/20 to-indigo-500/10 border-pink-500/50 text-pink-300 shadow-md scale-[1.01]"
                      : "bg-black/30 border-white/10 hover:bg-white/5 text-slate-300 hover:border-white/20"
                  }`}
                >
                  <p className="text-xs font-bold truncate flex items-center gap-1.5">
                    {isSelected && <Volume2 className="w-3 h-3 text-pink-400 shrink-0 animate-bounce" />}
                    <span className="truncate">{track.name}</span>
                  </p>
                  <p className="text-[9px] text-slate-400 mt-0.5 font-semibold">{track.mood}</p>
                </div>
              );
            })}
          </div>

          {/* Detailed analysis breakdown for selected track to ensure suitability */}
          {activeTrackObj && (
            <div className="mt-3 p-3 bg-black/40 border border-white/5 rounded-xl space-y-1.5 text-[11px]">
              <div className="flex items-center gap-1 text-pink-300 font-bold">
                <Sparkles className="w-3.5 h-3.5 text-pink-400 shrink-0" />
                <span>9:16 Playback Suitability Analysis</span>
              </div>
              <p className="text-slate-300 leading-relaxed">
                <b>Recommender context:</b> {activeTrackObj.suitability}
              </p>
              <div className="flex flex-wrap gap-2 pt-1 font-semibold">
                <span className="text-[10px] bg-pink-500/10 border border-pink-500/20 px-2 py-0.5 rounded text-pink-300">
                  ⚡ Aspect Matching: {activeTrackObj.aspectMatch}
                </span>
                <span className={`text-[10px] px-2 py-0.5 rounded border ${
                    activeTrackObj.durationMatch 
                      ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
                      : "bg-amber-500/10 border-amber-500/20 text-amber-300"
                  }`}
                >
                  ⏱ Duration suitable for {clipDuration}s clip
                </span>
              </div>
            </div>
          )}
        </div>

        <hr className="border-white/5" />

        {/* Brand & Overlays */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="block text-[10px] font-bold text-slate-350 uppercase flex items-center gap-1 font-display">
                <BadgeCheck className="w-3.5 h-3.5 text-indigo-400" />
                <span>Brand Watermark/Handle</span>
              </label>
              <input
                id="watermark-enabled-toggle"
                type="checkbox"
                checked={activeClip.watermarkEnabled ?? true}
                onChange={(e) => onUpdateClip({ watermarkEnabled: e.target.checked })}
                className="w-3.5 h-3.5 accent-indigo-500 rounded"
              />
            </div>
            
            <input
              id="watermark-text-input"
              type="text"
              value={globalSettings.watermarkText}
              onChange={(e) => onUpdateSettings({ watermarkText: e.target.value })}
              placeholder="@MyCreatorHandle"
              className="w-full text-xs px-3 py-1.5 bg-black/40 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:outline-hidden focus:bg-black/60"
            />

            <div>
              <label className="block text-[10px] text-slate-400 mb-1">Watermark Placement</label>
              <select
                id="watermark-alignment"
                value={globalSettings.watermarkPos}
                onChange={(e) => onUpdateSettings({ watermarkPos: e.target.value })}
                className="w-full text-xs bg-black/40 border border-white/10 rounded-lg p-1 text-white focus:outline-hidden"
              >
                <option value="top-right" className="bg-slate-900">Top Right (Recommended)</option>
                <option value="top-left" className="bg-slate-900">Top Left</option>
                <option value="bottom-right" className="bg-slate-900">Bottom Right</option>
              </select>
            </div>
          </div>

          <div className="space-y-3">
            <label className="block text-[10px] font-bold text-slate-350 uppercase flex items-center gap-1 font-display">
              <Award className="w-3.5 h-3.5 text-amber-400" />
              <span>Intro / Outro Stinger</span>
            </label>
            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="text-slate-300">Intro Hook Length</span>
                <span className="font-mono font-bold text-amber-400">{globalSettings.stingerLength}s</span>
              </div>
              <input
                id="stinger-length-slider"
                type="range"
                min="0"
                max="3"
                step="0.5"
                value={globalSettings.stingerLength}
                onChange={(e) => onUpdateSettings({ stingerLength: Number(e.target.value) })}
                className="w-full accent-amber-500 cursor-pointer"
              />
            </div>

            <div>
              <label className="block text-[10px] text-slate-400 mb-1">Overlay Scoreboard / Banner text</label>
              <input
                id="overlay-banner-text"
                type="text"
                value={activeClip.overlayText || ""}
                onChange={(e) => onUpdateClip({ overlayText: e.target.value })}
                placeholder="PRO MOVE! 💯 / SCORE: 1-0"
                className="w-full text-xs px-3 py-1.5 bg-black/40 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:outline-hidden focus:bg-black/60"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

