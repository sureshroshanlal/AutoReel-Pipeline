import React, { useState } from "react";
import { Plus, Scissors, Trash2, Clock, Check } from "lucide-react";
import { VideoProject, Clip } from "../types";

interface ClipTimelineProps {
  selectedProject: VideoProject;
  activeClip: Clip | null;
  onSelectClip: (clip: Clip) => void;
  onAddClip: (clipName: string, start: string, end: string) => void;
  onDeleteClip: (clipId: string) => void;
}

export default function ClipTimeline({
  selectedProject,
  activeClip,
  onSelectClip,
  onAddClip,
  onDeleteClip
}: ClipTimelineProps) {
  const [newClipName, setNewClipName] = useState("");
  const [newStart, setNewStart] = useState("00:00:00");
  const [newEnd, setNewEnd] = useState("00:00:15");

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newClipName.trim() || `Short Clip #${selectedProject.clips.length + 1}`;
    onAddClip(cleanName, newStart, newEnd);
    setNewClipName("");
    setNewStart("00:00:00");
    setNewEnd("00:00:15");
  };

  const getDurationSeconds = (start: string, end: string) => {
    const parseSec = (timeStr: string) => {
      const parts = timeStr.split(":").map(Number);
      if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
      if (parts.length === 2) return parts[0] * 60 + parts[1];
      return 0;
    };
    return parseSec(end) - parseSec(start);
  };

  return (
    <div id="clip-timeline-widget" className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-xl h-full">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-sm font-bold text-white font-display">Segment Timing Clips</h2>
          <p className="text-xs text-slate-400">Trim intervals of {selectedProject.title}</p>
        </div>
        <Clock className="w-5 h-5 text-slate-400" />
      </div>

      {/* Add New Clip Form */}
      <form onSubmit={handleAdd} className="bg-white/5 border border-white/10 p-4 rounded-xl mb-5 space-y-3">
        <h3 className="text-[10px] font-bold uppercase text-slate-400 tracking-wider font-display">Configure New Clip</h3>
        <div>
          <label className="block text-[10px] font-semibold text-slate-400 mb-1">Clip Title / Concept</label>
          <input
            id="new-clip-name"
            type="text"
            value={newClipName}
            onChange={(e) => setNewClipName(e.target.value)}
            placeholder="e.g. Crazy plot turn / Funny moment"
            className="w-full text-xs px-3 py-1.5 bg-black/40 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:outline-hidden focus:border-indigo-500/80 transition-all"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] font-semibold text-slate-400 mb-1">Start (HH:MM:SS)</label>
            <input
              id="new-clip-start"
              type="text"
              value={newStart}
              onChange={(e) => setNewStart(e.target.value)}
              className="w-full text-xs px-3 py-1.5 bg-black/40 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:outline-hidden focus:border-indigo-500/80 text-center font-mono"
            />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-slate-400 mb-1">End (HH:MM:SS)</label>
            <input
              id="new-clip-end"
              type="text"
              value={newEnd}
              onChange={(e) => setNewEnd(e.target.value)}
              className="w-full text-xs px-3 py-1.5 bg-black/40 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:outline-hidden focus:border-indigo-500/80 text-center font-mono"
            />
          </div>
        </div>

        {/* Target duration alert warning */}
        {(() => {
          const duration = getDurationSeconds(newStart, newEnd);
          const isTargetLength = duration >= 15 && duration <= 20;
          return (
            <div className={`p-2 rounded-lg text-[10px] text-center font-bold border ${isTargetLength ? 'bg-emerald-500/10 text-emerald-350 border-emerald-500/20' : 'bg-amber-500/10 text-amber-300 border-amber-500/25'}`}>
              Current selected is {duration}s. Target for Reels: 15–20s.
            </div>
          );
        })()}

        <button
          id="btn-add-clip"
          type="submit"
          className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-md shadow-indigo-600/10 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Cut New Clip</span>
        </button>
      </form>

      {/* Target Clips list */}
      <div className="space-y-2.5">
        <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 font-display">My Target Clips</h3>
        {selectedProject.clips.length === 0 ? (
          <div className="text-center py-8 border border-dashed border-white/10 rounded-xl bg-white/5">
            <Scissors className="w-8 h-8 mx-auto text-slate-500 mb-2" />
            <p className="text-xs text-slate-400">No clips select timing yet.</p>
          </div>
        ) : (
          selectedProject.clips.map((clip) => {
            const clipDur = getDurationSeconds(clip.startTime, clip.endTime);
            const isActive = activeClip?.id === clip.id;
            return (
              <div
                key={clip.id}
                id={`clip-row-${clip.id}`}
                onClick={() => onSelectClip(clip)}
                className={`group flex items-center justify-between p-3 rounded-xl border text-left cursor-pointer transition-all ${
                  isActive
                    ? "bg-indigo-600/15 border-indigo-500/40 shadow-md shadow-indigo-500/5"
                    : "bg-white/5 hover:bg-white/10 border-white/10"
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-indigo-400 animate-pulse' : 'bg-slate-500'}`} />
                    <span className="text-xs font-bold text-white max-w-[150px] truncate">{clip.name}</span>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-slate-400 font-mono">
                    <span>{clip.startTime} - {clip.endTime}</span>
                    <span className="bg-white/10 px-1.5 py-0.5 rounded text-slate-350 font-bold font-mono">{clipDur}s</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                    clip.status === "completed" ? "bg-emerald-550/15 border border-emerald-500/20 text-emerald-350" :
                    clip.status === "encoding" ? "bg-amber-500/15 border border-amber-500/20 text-amber-300 animate-pulse" :
                    clip.status === "queued" ? "bg-blue-500/15 border border-blue-500/20 text-blue-300" :
                    "bg-slate-800 border border-slate-700 text-slate-300"
                  }`}>
                    {clip.status}
                  </span>
                  
                  <button
                    id={`btn-del-clip-${clip.id}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteClip(clip.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 text-slate-405 hover:text-red-400 p-1.5 rounded-lg hover:bg-white/10 transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
