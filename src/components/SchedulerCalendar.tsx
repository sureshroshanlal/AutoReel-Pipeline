import React, { useState, useEffect, useCallback } from "react";
import {
  CalendarRange, ClipboardList, CheckCircle2, AlertOctagon,
  RefreshCw, Sparkles, Send, Trash2, Zap, Clock, Info, ExternalLink
} from "lucide-react";
import { Clip, VideoProject, PostLog } from "../types";

interface SchedulerCalendarProps {
  selectedProject: VideoProject;
  activeClip: Clip | null;
  posts: PostLog[];
  suggestedCaption: string;
  suggestedTags: string[];
  onAddPost:          (postData: Partial<PostLog>) => void;
  onUpdatePostStatus: (postId: string, status: "scheduled" | "published" | "failed" | "takedown", reason?: string) => void;
  onDeletePost:       (postId: string) => void;
  onRefreshPosts:     () => void;
}

// ── Countdown helper ────────────────────────────────────────────────────────
function useCountdown(targetIso: string) {
  const calc = () => {
    const diff = new Date(targetIso).getTime() - Date.now();
    if (diff <= 0) return null;
    const h = Math.floor(diff / 3_600_000);
    const m = Math.floor((diff % 3_600_000) / 60_000);
    const s = Math.floor((diff % 60_000) / 1_000);
    return { h, m, s };
  };
  const [remaining, setRemaining] = useState(calc());
  useEffect(() => {
    const id = setInterval(() => setRemaining(calc()), 1000);
    return () => clearInterval(id);
  }, [targetIso]);
  return remaining;
}

// ── Single post row ─────────────────────────────────────────────────────────
function PostRow({
  post,
  onUpdatePostStatus,
  onDeletePost,
  onPublishNow,
}: {
  post: PostLog;
  onUpdatePostStatus: SchedulerCalendarProps["onUpdatePostStatus"];
  onDeletePost:       SchedulerCalendarProps["onDeletePost"];
  onPublishNow:       (id: string) => void;
}) {
  const countdown = useCountdown(post.scheduledTime);
  const isTakedown = post.status === "takedown";
  const isScheduled = post.status === "scheduled";
  const isPublished = post.status === "published";
  const isEncoding  = post.status === "encoding";

  return (
    <div
      id={`post-log-row-${post.id}`}
      className={`p-3 rounded-xl border flex flex-col gap-2 transition-all ${
        isTakedown
          ? "bg-rose-500/10 border-rose-500/30"
          : isPublished
          ? "bg-emerald-500/10 border-emerald-500/20"
          : isEncoding
          ? "bg-indigo-500/10 border-indigo-500/20 animate-pulse"
          : "bg-white/5 border-white/10"
      }`}
    >
      {/* Header row */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-white truncate max-w-[160px]">
          {post.clipName}
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={`text-[9px] px-1.5 py-0.5 font-bold uppercase rounded-md tracking-wider ${
            isPublished ? "bg-emerald-500/20 border border-emerald-500/30 text-emerald-300" :
            isScheduled ? "bg-indigo-500/20 border border-indigo-500/30 text-indigo-300" :
            isEncoding  ? "bg-indigo-500/30 border border-indigo-500/40 text-indigo-200 animate-pulse" :
            isTakedown  ? "bg-rose-500/20 border border-rose-500/30 text-rose-300 animate-pulse" :
            "bg-slate-800 border border-slate-700 text-slate-300"
          }`}>
            {isEncoding ? "⏳ publishing…" : post.status}
          </span>
          {/* Delete button */}
          <button
            id={`btn-delete-${post.id}`}
            onClick={() => onDeletePost(post.id)}
            className="p-1 rounded-md text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
            title="Remove from queue"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Caption */}
      <p className="text-[11px] text-slate-400 line-clamp-2 italic leading-relaxed">
        "{post.caption}"
      </p>

      {/* Hashtags */}
      {post.hashtags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {post.hashtags.map((tag, idx) => (
            <span key={idx} className="text-[9px] bg-white/10 text-slate-300 px-1.5 py-0.5 rounded font-mono">
              #{tag}
            </span>
          ))}
        </div>
      )}

      {/* Countdown timer for scheduled posts */}
      {isScheduled && countdown && (
        <div className="flex items-center gap-1.5 text-[10px] text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 rounded-lg px-2.5 py-1.5">
          <Clock className="w-3 h-3 shrink-0" />
          <span className="font-mono font-bold">
            {String(countdown.h).padStart(2, "0")}:{String(countdown.m).padStart(2, "0")}:{String(countdown.s).padStart(2, "0")}
          </span>
          <span className="text-slate-400">until auto-publish</span>
        </div>
      )}
      {isScheduled && !countdown && (
        <div className="text-[10px] text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2.5 py-1 flex items-center gap-1">
          <Clock className="w-3 h-3" />
          <span>Due — will publish on next scheduler tick (within 60s)</span>
        </div>
      )}

      {/* Footer: post ID + scheduled date */}
      <div className="text-[9px] text-slate-500 font-mono pt-1 border-t border-dashed border-white/5 flex justify-between items-center">
        <span>ID: {post.instagramPostId || post.id}</span>
        <span>{new Date(post.scheduledTime).toLocaleString()}</span>
      </div>

      {/* Takedown block */}
      {isTakedown && (
        <div className="mt-1 bg-rose-500/10 border border-rose-500/20 text-[10px] text-rose-300 p-2.5 rounded-lg space-y-1.5">
          <div className="flex items-center gap-1.5 font-bold">
            <AlertOctagon className="w-3.5 h-3.5 text-rose-400" />
            <span>Rights Infringement Complaint</span>
          </div>
          <p className="font-medium">Reason: {post.takedownReason}</p>
          <p className="text-[8px] text-rose-400">
            Takedown: {new Date(post.takedownTimestamp || "").toLocaleString()}
          </p>

          <div className="flex flex-col gap-1 pt-1.5 border-t border-rose-500/20">
            <button
              id={`btn-comply-${post.id}`}
              onClick={() => onUpdatePostStatus(post.id, "failed", "Infringement Acknowledged & Redacted.")}
              className="w-full bg-rose-600 hover:bg-rose-500 text-white font-bold text-[9px] py-1.5 rounded-lg transition-all text-center cursor-pointer"
            >
              Comply with Removal (Redact)
            </button>
          </div>

          <div className="mt-2 pt-2 border-t border-rose-500/25 space-y-1.5">
            <p className="text-[9px] text-slate-400 leading-tight">
              💡 Swap to a royalty-free track and re-queue the post:
            </p>
            <div className="flex gap-1.5">
              <select
                id={`select-safe-audio-${post.id}`}
                className="flex-1 bg-slate-900 border border-white/20 text-white rounded px-2 py-1 text-[10px] focus:outline-none"
                defaultValue="Royalty-Free Calm Lofi"
              >
                <option value="Royalty-Free Calm Lofi">🎵 Lofi Ambient Chill (Royalty-Free)</option>
                <option value="Royalty-Free Acoustic Rake">🎵 Sunny Acoustic (Royalty-Free)</option>
                <option value="Royalty-Free Corporate Ambient">🎵 Cinematic Synth (Royalty-Free)</option>
                <option value="None - Retain Original Audio">🔇 Retain Original Audio</option>
              </select>
              <button
                id={`btn-resolve-swap-${post.id}`}
                onClick={() => {
                  const el = document.getElementById(`select-safe-audio-${post.id}`) as HTMLSelectElement;
                  const audio = el?.value || "None";
                  onUpdatePostStatus(post.id, "scheduled", `Resolved: Swapped audio to "${audio}". Re-queued.`);
                }}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[9px] px-2.5 rounded transition-all flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Repost</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Demo: simulate copyright */}
      {isPublished && (
        <button
          id={`btn-simulate-copyright-${post.id}`}
          onClick={() => onUpdatePostStatus(post.id, "takedown", "AI Content ID scan matched copyrighted soundtrack (Universal Studio Group)")}
          className="w-full mt-1.5 border border-dashed border-amber-500/35 hover:bg-amber-500/10 text-amber-400 font-bold text-[9px] py-1 rounded transition-colors cursor-pointer"
        >
          Simulate Copyright Complaint (Demo)
        </button>
      )}

      {/* Action buttons for scheduled posts */}
      {isScheduled && (
        <div className="flex gap-1.5 mt-0.5">
          <button
            id={`btn-publish-now-${post.id}`}
            onClick={() => onPublishNow(post.id)}
            className="flex-1 flex items-center justify-center gap-1 bg-gradient-to-r from-indigo-600 to-purple-600 hover:opacity-90 text-white font-bold text-[9px] py-1.5 rounded-lg transition-all cursor-pointer shadow-sm"
          >
            <Zap className="w-3 h-3" />
            <span>Publish Now</span>
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export default function SchedulerCalendar({
  selectedProject,
  activeClip,
  posts,
  suggestedCaption,
  suggestedTags,
  onAddPost,
  onUpdatePostStatus,
  onDeletePost,
  onRefreshPosts,
}: SchedulerCalendarProps) {
  const [caption,     setCaption]     = useState("");
  const [tagsInput,   setTagsInput]   = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [scheduling,  setScheduling]  = useState(false);
  const [publishingId, setPublishingId] = useState<string | null>(null);

  const hasInstagramCreds = !!(
    (window as any).__INSTAGRAM_CONFIGURED__ ||
    false // server will expose this flag via /api/db if needed
  );

  // Sync AI-generated suggestions into the form
  useEffect(() => {
    if (suggestedCaption) setCaption(suggestedCaption);
    if (suggestedTags)    setTagsInput(suggestedTags.join(", "));
  }, [suggestedCaption, suggestedTags]);

  // Auto-refresh post statuses every 15s to pick up background scheduler changes
  useEffect(() => {
    const id = setInterval(onRefreshPosts, 15_000);
    return () => clearInterval(id);
  }, [onRefreshPosts]);

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeClip) return;
    setScheduling(true);

    const hashtags = tagsInput
      .split(",")
      .map(t => t.trim().replace(/#/g, ""))
      .filter(t => t.length > 0);

    const postPayload = {
      clipId:        activeClip.id,
      projectId:     selectedProject.id,
      clipName:      activeClip.name,
      caption,
      hashtags,
      scheduledTime: scheduledAt
        ? new Date(scheduledAt).toISOString()
        : new Date(Date.now() + 12 * 3600 * 1000).toISOString(),
    };

    try {
      const res = await fetch("/api/posts/schedule", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(postPayload),
      });
      if (res.ok) {
        const data = await res.json();
        onAddPost(data.post);
        setCaption("");
        setTagsInput("");
        setScheduledAt("");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setScheduling(false);
    }
  };

  const handlePublishNow = useCallback(async (postId: string) => {
    setPublishingId(postId);
    try {
      const res = await fetch(`/api/posts/${postId}/publish`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        alert(`Publish failed: ${data.error}`);
      } else {
        // Poll for status change (background async)
        let polls = 0;
        const poll = setInterval(async () => {
          polls++;
          onRefreshPosts();
          if (polls >= 30) clearInterval(poll); // stop after 30 × 2s = 60s
        }, 2000);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setTimeout(() => setPublishingId(null), 3000);
    }
  }, [onRefreshPosts]);

  const handleDeletePost = useCallback(async (postId: string) => {
    if (!confirm("Remove this post from the queue?")) return;
    try {
      const res = await fetch(`/api/posts/${postId}`, { method: "DELETE" });
      if (res.ok) onDeletePost(postId);
    } catch (e) {
      console.error(e);
    }
  }, [onDeletePost]);

  const scheduledCount = posts.filter(p => p.status === "scheduled").length;
  const publishedCount = posts.filter(p => p.status === "published").length;

  return (
    <div id="scheduler-widget" className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-xl h-full">

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-sm font-bold text-white font-display">Schedule & Post Reels</h2>
          <p className="text-xs text-slate-400">Instagram Graph API scheduler · auto-fires every 60s</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 px-2 py-1 rounded-full font-bold">
            {scheduledCount} queued
          </span>
          <span className="text-[10px] bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 px-2 py-1 rounded-full font-bold">
            {publishedCount} published
          </span>
          <button
            onClick={onRefreshPosts}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
            title="Refresh post statuses"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Instagram setup banner */}
      <div className="mb-5 bg-amber-500/8 border border-amber-500/20 rounded-xl p-3.5 flex items-start gap-3">
        <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <div className="text-[10px] text-amber-200 space-y-1">
          <p className="font-bold text-amber-300">Instagram Setup (required for real publishing)</p>
          <p>Add these to your <code className="bg-black/30 px-1 rounded">.env</code> file:</p>
          <div className="font-mono bg-black/40 border border-white/10 rounded-lg p-2 space-y-0.5 text-[9px] text-slate-300">
            <p>INSTAGRAM_ACCESS_TOKEN=your_long_lived_token</p>
            <p>INSTAGRAM_USER_ID=your_ig_user_id</p>
            <p>PUBLIC_BASE_URL=https://your-ngrok-url.ngrok.io</p>
          </div>
          <p className="text-slate-400">Without these, publishing is <b>simulated</b> (safe for testing). <a href="https://developers.facebook.com/docs/instagram-api/getting-started" target="_blank" rel="noreferrer" className="text-indigo-300 underline inline-flex items-center gap-0.5">Get credentials <ExternalLink className="w-2.5 h-2.5" /></a></p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

        {/* ── Posting Form ─────────────────────────────────────────── */}
        <div>
          <form onSubmit={handleCreatePost} className="space-y-3.5 bg-white/5 p-4 rounded-xl border border-white/10">
            <h3 className="text-[10px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5 font-display">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Configure Reels Post</span>
            </h3>

            {activeClip ? (
              <div className="text-[11px] bg-black/40 px-3 py-1.5 border border-white/10 rounded-lg flex justify-between">
                <span className="text-slate-400 font-medium">Clip:</span>
                <span className="font-bold text-white">{activeClip.name}</span>
              </div>
            ) : (
              <p className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/20 p-2 rounded text-center font-semibold">
                Select a clip first
              </p>
            )}

            {/* Clip render guard */}
            {activeClip && !activeClip.outputUrl && (
              <div className="text-[10px] bg-amber-500/10 border border-amber-500/20 text-amber-200 p-2.5 rounded-xl flex items-start gap-2">
                <AlertOctagon className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                <span>This clip hasn't been rendered yet. Go to Tab 1 → <b>Compile & Render</b> before scheduling.</span>
              </div>
            )}

            <div>
              <label className="block text-[10px] font-semibold text-slate-400 mb-1">Caption</label>
              <textarea
                id="reels-caption-desc"
                rows={3}
                value={caption}
                onChange={e => setCaption(e.target.value)}
                placeholder="Hook your audience! E.g. Check out this triple neo, timing is crazy…"
                className="w-full text-xs p-2.5 bg-black/40 border border-white/10 text-white rounded-lg focus:outline-none focus:border-indigo-500"
                required
              />
            </div>

            <div>
              <label className="block text-[10px] font-semibold text-slate-400 mb-1">Hashtags (comma separated)</label>
              <input
                id="reels-tags-input"
                type="text"
                value={tagsInput}
                onChange={e => setTagsInput(e.target.value)}
                placeholder="minecraft, designreels, lifestyle"
                className="w-full text-xs p-2.5 bg-black/40 border border-white/10 text-white rounded-lg focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[10px] font-semibold text-slate-400 mb-1">Schedule Date & Time</label>
              <input
                id="schedule-datetime-input"
                type="datetime-local"
                value={scheduledAt}
                onChange={e => setScheduledAt(e.target.value)}
                className="w-full text-xs p-2.5 bg-black/40 border border-white/10 rounded-lg focus:outline-none text-white cursor-pointer"
              />
              <p className="text-[9px] text-slate-500 mt-1">Leave blank to schedule 12h from now. The server checks every 60s.</p>
            </div>

            <button
              id="btn-schedule-post"
              type="submit"
              disabled={scheduling || !activeClip}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 px-4 font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-all disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed cursor-pointer shadow-lg shadow-indigo-600/15"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{scheduling ? "Scheduling…" : "Add to Publish Queue"}</span>
            </button>
          </form>
        </div>

        {/* ── Post Log ─────────────────────────────────────────────── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between pb-1">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 font-display">
              <ClipboardList className="w-4 h-4 text-indigo-400" />
              <span>Queue & Infringement Logs</span>
            </h3>
            <span className="text-[10px] bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 font-bold px-2 py-0.5 rounded-full">
              {posts.length} entries
            </span>
          </div>

          <div className="space-y-3 overflow-y-auto max-h-[480px] pr-1">
            {posts.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-10 border border-dashed border-white/10 rounded-xl bg-white/5 font-medium">
                No posts queued. Schedule one above!
              </p>
            ) : (
              posts.map(post => (
                <div key={post.id}>
                  <PostRow
                    post={post}
                    onUpdatePostStatus={onUpdatePostStatus}
                    onDeletePost={handleDeletePost}
                    onPublishNow={handlePublishNow}
                  />
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
