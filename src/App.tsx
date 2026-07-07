import React, { useState, useEffect } from "react";
import { 
  Film, 
  Settings as SettingsIcon, 
  RefreshCw, 
  Play, 
  CheckCircle2, 
  Trash2, 
  Sparkles, 
  Plus, 
  Wand2, 
  Tv, 
  Grid, 
  ExternalLink, 
  Scissors, 
  Database,
  FolderOpen,
  Volume2,
  Video,
  Download,
  AlertTriangle
} from "lucide-react";

import ImportForm from "./components/ImportForm";
import ClipTimeline from "./components/ClipTimeline";
import VisualReframe from "./components/VisualReframe";
import AudioBrandPanel from "./components/AudioBrandPanel";
import CaptionTranscriber from "./components/CaptionTranscriber";
import SchedulerCalendar from "./components/SchedulerCalendar";
import DeveloperOrchestrator from "./components/DeveloperOrchestrator";

import { Clip, VideoProject, PostLog, Settings } from "./types";

export default function App() {
  const [projects, setProjects] = useState<VideoProject[]>([]);
  const [selectedProject, setSelectedProject] = useState<VideoProject | null>(null);
  const [activeClip, setActiveClip] = useState<Clip | null>(null);
  const [posts, setPosts] = useState<PostLog[]>([]);
  const [globalSettings, setGlobalSettings] = useState<Settings>({
    instagramEnabled: false,
    watermarkText: "@MyCreatorHandle",
    watermarkPos: "top-right",
    stingerLength: 1.5,
    resolution: "1080x1920",
    bitrate: "6"
  });

  const [activeTab, setActiveTab] = useState<"visual" | "audio" | "captions" | "schedule" | "dev">("visual");
  const [loadingDB, setLoadingDB] = useState(true);
  const [rendering, setRendering] = useState(false);

  // Suggested captions and tags generated from the transcript helper
  const [suggestedCaption, setSuggestedCaption] = useState("");
  const [suggestedTags, setSuggestedTags] = useState<string[]>([]);

  // 1. Fetch DB on mount
  const fetchDB = async () => {
    try {
      const res = await fetch("/api/db");
      if (res.ok) {
        const data = await res.json();
        setProjects(data.projects || []);
        setPosts(data.posts || []);
        if (data.settings) {
          setGlobalSettings(data.settings);
        }
        
        // Auto-select first project if none is active
        if (data.projects && data.projects.length > 0) {
          // If we had a selected project before, find it in the fresh data to retain selections
          const currentProjId = selectedProject?.id;
          const foundProj = currentProjId 
            ? data.projects.find((p: any) => p.id === currentProjId)
            : data.projects[0];
          
          setSelectedProject(foundProj || data.projects[0]);

          // Auto-select clip if possible
          if (foundProj && foundProj.clips && foundProj.clips.length > 0) {
            const currentClipId = activeClip?.id;
            const foundClip = currentClipId
              ? foundProj.clips.find((c: any) => c.id === currentClipId)
              : foundProj.clips[0];
            setActiveClip(foundClip || foundProj.clips[0]);
          } else if (data.projects[0].clips && data.projects[0].clips.length > 0) {
            setActiveClip(data.projects[0].clips[0]);
          }
        }
      }
    } catch (e) {
      console.error("Failed to load database:", e);
    } finally {
      setLoadingDB(false);
    }
  };

  useEffect(() => {
    fetchDB();
  }, []);

  // 2. Poll DB status when any clip is rendering or queued (every 1.5s)
  useEffect(() => {
    let intervalId: any = null;
    const hasActiveRenders = projects.some(p => 
      p.clips.some(c => c.status === "queued" || c.status === "encoding")
    );

    if (hasActiveRenders) {
      intervalId = setInterval(() => {
        fetchDB();
      }, 1500);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [projects]);

  // 3. Reset Database to seed data
  const handleResetDatabase = async () => {
    if (!window.confirm("Are you sure you want to reset the database to factory seed data?")) return;
    try {
      const res = await fetch("/api/db/reset", { method: "POST" });
      if (res.ok) {
        await fetchDB();
        alert("Database successfully reset!");
      }
    } catch (e) {
      console.error(e);
    }
  };

  // 4. Delete Project
  const handleDeleteProject = async (id: string) => {
    if (!window.confirm("Delete this video project and all associated clips?")) return;
    try {
      const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
      if (res.ok) {
        const remaining = projects.filter(p => p.id !== id);
        setProjects(remaining);
        if (selectedProject?.id === id) {
          const nextProj = remaining[0] || null;
          setSelectedProject(nextProj);
          setActiveClip(nextProj?.clips[0] || null);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  // 5. Ingest YouTube callback
  const handleImportSuccess = (newProj: VideoProject) => {
    setProjects(prev => [newProj, ...prev]);
    setSelectedProject(newProj);
    setActiveClip(newProj.clips[0] || null);
    setActiveTab("visual");
  };

  // 6. Project Selector changed
  const handleSelectProject = (proj: VideoProject) => {
    setSelectedProject(proj);
    setActiveClip(proj.clips[0] || null);
  };

  // 7. Clip Operations
  const handleSelectClip = (clip: Clip) => {
    setActiveClip(clip);
  };

  const handleAddClip = async (name: string, startTime: string, endTime: string) => {
    if (!selectedProject) return;
    try {
      const res = await fetch(`/api/projects/${selectedProject.id}/clips`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, startTime, endTime })
      });
      if (res.ok) {
        const data = await res.json();
        const newClip = data.clip;

        // Update local project clips list
        const updatedClips = [...selectedProject.clips, newClip];
        const updatedProj = { ...selectedProject, clips: updatedClips };

        setProjects(prev => prev.map(p => p.id === selectedProject.id ? updatedProj : p));
        setSelectedProject(updatedProj);
        setActiveClip(newClip);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteClip = async (clipId: string) => {
    if (!selectedProject) return;
    if (!window.confirm("Are you sure you want to delete this clip segment?")) return;
    try {
      const res = await fetch(`/api/projects/${selectedProject.id}/clips/${clipId}`, {
        method: "DELETE"
      });
      if (res.ok) {
        const updatedClips = selectedProject.clips.filter(c => c.id !== clipId);
        const updatedProj = { ...selectedProject, clips: updatedClips };

        setProjects(prev => prev.map(p => p.id === selectedProject.id ? updatedProj : p));
        setSelectedProject(updatedProj);

        if (activeClip?.id === clipId) {
          setActiveClip(updatedClips[0] || null);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateClip = async (updatedFields: Partial<Clip>) => {
    if (!selectedProject || !activeClip) return;

    // Optimistic UI updates
    const updatedClip = { ...activeClip, ...updatedFields } as Clip;
    setActiveClip(updatedClip);

    const updatedClips = selectedProject.clips.map(c => c.id === activeClip.id ? updatedClip : c);
    const updatedProj = { ...selectedProject, clips: updatedClips };
    setProjects(prev => prev.map(p => p.id === selectedProject.id ? updatedProj : p));

    try {
      await fetch(`/api/projects/${selectedProject.id}/clips/${activeClip.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedFields)
      });
    } catch (e) {
      console.error("Failed to sync clip update to server:", e);
    }
  };

  // 8. Global Settings Operations
  const handleUpdateSettings = async (updatedSettings: Partial<Settings>) => {
    const nextSettings = { ...globalSettings, ...updatedSettings } as Settings;
    setGlobalSettings(nextSettings);

    try {
      await fetch(`/api/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedSettings)
      });
    } catch (e) {
      console.error("Failed to sync settings:", e);
    }
  };

  // 9. Trigger FFmpeg Compilation & Render Queue
  const handleCompileAndRender = async () => {
    if (!selectedProject || !activeClip) return;
    setRendering(true);
    try {
      const res = await fetch(`/api/projects/${selectedProject.id}/clips/${activeClip.id}/render`, {
        method: "POST"
      });
      if (res.ok) {
        // Optimistically update clip status to queued
        handleUpdateClip({ status: "queued", progress: 0 });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setRendering(false);
    }
  };

  // 10. Post/Scheduling Logs callbacks
  const handleAddPost = (newPost: any) => {
    setPosts(prev => [newPost, ...prev]);
  };

  const handleUpdatePostStatus = async (postId: string, status: any, reason?: string) => {
    try {
      const res = await fetch(`/api/posts/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, takedownReason: reason })
      });
      if (res.ok) {
        const data = await res.json();
        setPosts(prev => prev.map(p => p.id === postId ? data.post : p));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeletePost = (postId: string) => {
    setPosts(prev => prev.filter(p => p.id !== postId));
  };

  const handleRefreshPosts = async () => {
    try {
      const res = await fetch("/api/db");
      if (res.ok) {
        const data = await res.json();
        setPosts(data.posts || []);
      }
    } catch (e) {
      console.error("Failed to refresh posts:", e);
    }
  };

  return (
    <div className="relative min-h-screen pb-12 font-sans overflow-hidden">
      {/* Dynamic colorful space-dark background gradients */}
      <div className="glow-bg" />

      {/* Main Top Header Navigation */}
      <header className="border-b border-white/10 bg-black/60 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-[1600px] mx-auto px-6 py-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-pink-500 via-purple-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Film className="w-5.5 h-5.5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-black tracking-wider text-white uppercase font-display bg-gradient-to-r from-white via-indigo-200 to-pink-200 bg-clip-text text-transparent">
                ReelGenie AI Studio
              </h1>
              <p className="text-[10px] text-indigo-400 font-bold uppercase tracking-widest">
                Automated 9:16 Vertical Video Reframing & Marketing Engine
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              id="btn-global-reset-db"
              onClick={handleResetDatabase}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-900/80 border border-slate-720 hover:border-slate-600 text-slate-300 rounded-xl text-xs font-semibold transition-all cursor-pointer hover:bg-slate-800"
              title="Restores SQLite Database context back to original seed data"
            >
              <Database className="w-3.5 h-3.5 text-slate-400" />
              <span>Reset database</span>
            </button>
            <span className="h-6 w-px bg-white/10 hidden md:block" />
            <div className="text-[11px] text-slate-400 font-medium bg-white/5 border border-white/10 px-3 py-1.5 rounded-xl">
              Model: <span className="font-bold text-white">Gemini 3.5 Flash</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Work Surface Container */}
      <main className="max-w-[1600px] mx-auto px-6 mt-8">
        {loadingDB ? (
          <div className="flex flex-col items-center justify-center py-48 gap-4">
            <RefreshCw className="w-10 h-10 text-indigo-500 animate-spin" />
            <p className="text-sm text-slate-400 font-medium">Booting ReelGenie workspace...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left Dashboard Panel: Media Ingestion & Project Navigation (Col span 4) */}
            <div className="lg:col-span-4 space-y-6">
              {/* Ingest YouTube Section */}
              <ImportForm onImportSuccess={handleImportSuccess} />

              {/* Project & Clips Navigator card */}
              <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-xl space-y-4">
                <div className="flex items-center gap-3 mb-1.5">
                  <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400">
                    <FolderOpen className="w-4.5 h-4.5" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-white font-display">Active Projects</h2>
                    <p className="text-[11px] text-slate-400">Manage source videos and clips library</p>
                  </div>
                </div>

                {/* Project Selector dropdown */}
                {projects.length === 0 ? (
                  <p className="text-xs text-slate-400">No project source files loaded yet.</p>
                ) : (
                  <div className="space-y-3">
                    <div className="relative">
                      <select
                        id="project-selector-dropdown"
                        value={selectedProject?.id || ""}
                        onChange={(e) => {
                          const p = projects.find(proj => proj.id === e.target.value);
                          if (p) handleSelectProject(p);
                        }}
                        className="w-full text-xs font-bold bg-black/60 border border-white/10 rounded-xl px-3 py-2.5 text-white focus:outline-hidden cursor-pointer"
                      >
                        {projects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.title} ({p.duration})
                          </option>
                        ))}
                      </select>
                    </div>

                    {selectedProject && (
                      <div className="flex items-center gap-3 bg-black/30 border border-white/10 p-3 rounded-xl">
                        <img
                          src={selectedProject.thumbnailUrl}
                          alt="video thumb"
                          className="w-14 h-10 object-cover rounded-lg shrink-0 border border-white/10"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-black text-white truncate leading-snug">
                            {selectedProject.title}
                          </p>
                          <a
                            href={selectedProject.youtubeUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[9px] text-indigo-400 font-bold hover:underline flex items-center gap-1.5 mt-0.5"
                          >
                            <span>Watch original</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        </div>
                        <button
                          id={`btn-del-project-${selectedProject.id}`}
                          onClick={() => handleDeleteProject(selectedProject.id)}
                          className="p-2 text-slate-400 hover:text-red-400 rounded-lg hover:bg-white/5 transition-colors shrink-0"
                          title="Delete Project"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Clips List Panel (Timeline Segment) */}
              {selectedProject && (
                <ClipTimeline
                  selectedProject={selectedProject}
                  activeClip={activeClip}
                  onSelectClip={handleSelectClip}
                  onAddClip={handleAddClip}
                  onDeleteClip={handleDeleteClip}
                />
              )}
            </div>

            {/* Right Dashboard Panel: Tabbed Interactive controls (Col span 8) */}
            <div className="lg:col-span-8 space-y-6">
              {/* Tab Selector buttons */}
              <div className="flex gap-2.5 border-b border-white/10 pb-4 overflow-x-auto">
                <button
                  id="nav-tab-visual"
                  onClick={() => setActiveTab("visual")}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold tracking-wide uppercase transition-all cursor-pointer border ${
                    activeTab === "visual"
                      ? "bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/10"
                      : "bg-white/5 border-white/10 text-slate-400 hover:text-white"
                  }`}
                >
                  <Wand2 className="w-4 h-4" />
                  <span>1. Visual Reframe</span>
                </button>

                <button
                  id="nav-tab-audio"
                  onClick={() => setActiveTab("audio")}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold tracking-wide uppercase transition-all cursor-pointer border ${
                    activeTab === "audio"
                      ? "bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/10"
                      : "bg-white/5 border-white/10 text-slate-400 hover:text-white"
                  }`}
                >
                  <Volume2 className="w-4 h-4" />
                  <span>2. Audio & Brand</span>
                </button>

                <button
                  id="nav-tab-captions"
                  onClick={() => setActiveTab("captions")}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold tracking-wide uppercase transition-all cursor-pointer border ${
                    activeTab === "captions"
                      ? "bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/10"
                      : "bg-white/5 border-white/10 text-slate-400 hover:text-white"
                  }`}
                >
                  <Scissors className="w-4 h-4" />
                  <span>3. Speech & Social Copy</span>
                </button>

                <button
                  id="nav-tab-schedule"
                  onClick={() => setActiveTab("schedule")}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold tracking-wide uppercase transition-all cursor-pointer border ${
                    activeTab === "schedule"
                      ? "bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/10"
                      : "bg-white/5 border-white/10 text-slate-400 hover:text-white"
                  }`}
                >
                  <Grid className="w-4 h-4" />
                  <span>4. Publishing Grid</span>
                </button>

                <button
                  id="nav-tab-dev"
                  onClick={() => setActiveTab("dev")}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold tracking-wide uppercase transition-all cursor-pointer border ${
                    activeTab === "dev"
                      ? "bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/10"
                      : "bg-white/5 border-white/10 text-slate-400 hover:text-white"
                  }`}
                >
                  <SettingsIcon className="w-4 h-4" />
                  <span>FFmpeg / Dev Export</span>
                </button>
              </div>

              {/* Rendering Panel (FFmpeg compiler status banner) */}
              {activeClip && (
                <div className="bg-gradient-to-br from-indigo-950/40 to-slate-900/60 border border-indigo-500/20 rounded-2xl p-5 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-5">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                        {activeClip.status === "completed" ? "Render completed" : activeClip.status === "encoding" ? "Encoding in progress" : activeClip.status === "queued" ? "Queued in queue" : "Ready for Compile"}
                      </span>
                      <span className="text-xs font-bold text-slate-200">Segment: "{activeClip.name}"</span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Compile coordinates matrix [{activeClip.verticalCrop.zoom}x zoom, Pan x={activeClip.verticalCrop.x}%] using Node.js FFmpeg pipeline.
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row items-center gap-4.5">
                    {/* Render status controller */}
                    {(activeClip.status === "encoding" || activeClip.status === "queued") && (
                      <div className="w-full sm:w-44 space-y-1.5 shrink-0">
                        <div className="flex justify-between text-[10px] text-slate-300 font-bold font-mono">
                          <span>Rendering short video...</span>
                          <span>{activeClip.progress || 0}%</span>
                        </div>
                        <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden border border-white/5">
                          <div 
                            className="bg-gradient-to-r from-pink-500 to-indigo-500 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${activeClip.progress || 0}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {activeClip.status === "completed" && activeClip.outputUrl && (
                      <a
                        id="btn-download-clip"
                        href={`/api/download?url=${encodeURIComponent(activeClip.outputUrl)}`}
                        className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs py-2.5 px-4.5 rounded-xl transition-all shadow-md shadow-emerald-600/20 cursor-pointer"
                        download
                      >
                        <Download className="w-4 h-4" />
                        <span>Download 9:16 Rendered MP4</span>
                      </a>
                    )}

                    <button
                      id="btn-trigger-render"
                      onClick={handleCompileAndRender}
                      disabled={rendering || activeClip.status === "encoding" || activeClip.status === "queued"}
                      className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-550 disabled:bg-slate-800 disabled:text-slate-500 text-white font-black text-xs py-2.5 px-4.5 rounded-xl transition-all shadow-md shadow-indigo-600/10 cursor-pointer disabled:cursor-not-allowed shrink-0"
                    >
                      {rendering ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Initiating pipeline...</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-3.5 h-3.5 text-indigo-200 fill-indigo-200" />
                          <span>Compile & Render (FFmpeg)</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Dynamic Sub-tab contents */}
              <div className="transition-all duration-200">
                {activeTab === "visual" && selectedProject && (
                  <div className="space-y-6">
                    <VisualReframe
                      activeClip={activeClip}
                      youtubeId={selectedProject.youtubeUrl.split("v=")[1] || "dQw4w9WgXcQ"}
                      thumbnailUrl={selectedProject.thumbnailUrl}
                      onUpdateClip={handleUpdateClip}
                    />

                    {/* Integrated HTML5 vertical video player for previewing compiled renders */}
                    {activeClip && activeClip.status === "completed" && activeClip.outputUrl && (
                      <div className="bg-white/5 border border-white/10 rounded-2xl p-6 shadow-xl flex flex-col items-center">
                        <div className="flex items-center gap-2 mb-4 self-start">
                          <Video className="w-4.5 h-4.5 text-indigo-400 animate-pulse" />
                          <h3 className="text-xs font-bold text-white font-display">Watch Rendered Short Preview</h3>
                        </div>
                        <div className="relative w-[180px] h-[320px] rounded-[24px] border-[5px] border-slate-800 bg-black overflow-hidden shadow-2xl">
                          <video 
                            src={activeClip.outputUrl} 
                            controls 
                            className="w-full h-full object-cover" 
                            poster={selectedProject.thumbnailUrl}
                          />
                        </div>
                        <p className="text-[10px] text-slate-400 mt-2">Compiled MP4 stream. Ready to upload to Instagram Reels / YouTube Shorts.</p>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === "audio" && (
                  <AudioBrandPanel
                    activeClip={activeClip}
                    globalSettings={globalSettings}
                    onUpdateClip={handleUpdateClip}
                    onUpdateSettings={handleUpdateSettings}
                    selectedProject={selectedProject}
                  />
                )}

                {activeTab === "captions" && selectedProject && (
                  <CaptionTranscriber
                    selectedProject={selectedProject}
                    activeClip={activeClip}
                    onUpdateClip={handleUpdateClip}
                    onPostSuggestedDetails={(cap, tags) => {
                      setSuggestedCaption(cap);
                      setSuggestedTags(tags);
                      alert("AI hooks suggested! Transferred directly to Scheduling Grid tab.");
                      setActiveTab("schedule");
                    }}
                  />
                )}

                {activeTab === "schedule" && selectedProject && (
                  <SchedulerCalendar
                    selectedProject={selectedProject}
                    activeClip={activeClip}
                    posts={posts}
                    suggestedCaption={suggestedCaption}
                    suggestedTags={suggestedTags}
                    onAddPost={handleAddPost}
                    onUpdatePostStatus={handleUpdatePostStatus}
                    onDeletePost={handleDeletePost}
                    onRefreshPosts={handleRefreshPosts}
                  />
                )}

                {activeTab === "dev" && selectedProject && (
                  <DeveloperOrchestrator
                    selectedProject={selectedProject}
                    activeClip={activeClip}
                    globalSettings={globalSettings}
                  />
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
