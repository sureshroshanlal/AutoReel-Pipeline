import React, { useState } from "react";
import { Link2, Youtube, ArrowRight, Sparkles } from "lucide-react";
import { VideoProject } from "../types";

interface ImportFormProps {
  onImportSuccess: (project: VideoProject) => void;
}

export default function ImportForm({ onImportSuccess }: ImportFormProps) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/youtube/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url })
      });

      if (!res.ok) {
        throw new Error("Failed to process YouTube URL. Please verify format.");
      }

      const data = await res.json();
      onImportSuccess(data.project);
      setUrl("");
    } catch (err: any) {
      setError(err?.message || "Something went wrong importing the video.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="yt-import-widget" className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-xl h-full">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-400">
          <Youtube className="w-5 h-5 animate-pulse" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-white font-display">Ingest YouTube Video</h2>
          <p className="text-xs text-slate-400">Source high-fidelity video streams via YouTube URL</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
            <Link2 className="w-4 h-4" />
          </div>
          <input
            id="youtube-url-input"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="e.g. https://www.youtube.com/watch?v=dQw4w9WgXcQ"
            className="w-full pl-10 pr-4 py-2.5 text-xs bg-black/40 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-hidden focus:border-indigo-505 transition-all font-medium"
            required
          />
        </div>

        {error && (
          <p className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/20 px-3 py-2 rounded-xl">
            {error}
          </p>
        )}

        <button
          id="btn-submit-yt"
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2.5 px-4 rounded-xl text-xs transition-all tracking-wide disabled:bg-slate-800 disabled:text-slate-400 disabled:cursor-not-allowed shadow-lg shadow-indigo-600/20"
        >
          {loading ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>Analyzing with Gemini AI...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              <span>Import & Auto-Profile</span>
              <ArrowRight className="w-4 h-4 ml-auto" />
            </>
          )}
        </button>
      </form>
    </div>
  );
}
