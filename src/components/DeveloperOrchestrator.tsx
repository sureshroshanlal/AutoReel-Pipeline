import React, { useState } from "react";
import { Terminal, Code, Cpu, Layers, Copy, Check } from "lucide-react";
import { Clip, VideoProject, Settings } from "../types";

interface DeveloperOrchestratorProps {
  selectedProject: VideoProject;
  activeClip: Clip | null;
  globalSettings: Settings;
}

export default function DeveloperOrchestrator({
  selectedProject,
  activeClip,
  globalSettings
}: DeveloperOrchestratorProps) {
  const [activeTab, setActiveTab] = useState<"ffmpeg" | "prefect">("ffmpeg");
  const [copied, setCopied] = useState(false);

  // Compute dynamic FFmpeg command mirroring active clip parameters
  const getDynamicFFmpegCommand = () => {
    if (!activeClip) return "Select or create an active clip segment to map FFmpeg variables...";

    const { startTime, endTime, verticalCrop, backgroundMusic, overlayText } = activeClip;
    
    // Parse times
    const startStr = startTime || "00:00:00";
    const endStr = endTime || "00:00:15";

    // Crop calculation: Standard video is 1920x1080.
    // Vertical 9:16 inside a 16:9 box has maximum height 1080, width 1080 * (9/16) = 607.5.
    // The width center can drift between x=0 and x=100.
    const cropWidth = 608;
    const cropHeight = 1080;
    // Calculate slider-based crop offset
    const xOffset = Math.floor((verticalCrop.x / 100) * (1920 - cropWidth));
    const yOffset = 0; // vertical center is stationary

    // Audio command
    const audioInput = backgroundMusic && backgroundMusic !== "None" 
      ? `-i "trending_soundtrack.mp3" -map 0:v:0 -map 1:a:0 -shortest` 
      : `-c:a aac`;

    // Filterchains
    const filterchain = [
      `crop=${cropWidth}:${cropHeight}:${xOffset}:${yOffset}`,
      `scale=1080:1920`,
      `eq=brightness=${(verticalCrop.colorCorrection.brightness / 100).toFixed(2)}:contrast=${(1 + verticalCrop.colorCorrection.contrast / 100).toFixed(2)}:saturation=${(1 + verticalCrop.colorCorrection.saturation / 100).toFixed(2)}`
    ];

    if (overlayText) {
      filterchain.push(`drawtext=text='${overlayText}':fontcolor=yellow:fontsize=48:box=1:boxcolor=black@0.6:boxborderw=10:x=(w-text_w)/2:y=h-200`);
    }

    if (activeClip.watermarkEnabled) {
      filterchain.push(`drawtext=text='${globalSettings.watermarkText}':fontcolor=white:fontsize=32:x=w-text_w-40:y=40`);
    }

    return `ffmpeg -y -ss ${startStr} -to ${endStr} -i "input_youtube_stream.mp4" \\
  ${backgroundMusic && backgroundMusic !== "None" ? `-i "reels_trending_music.wav" ` : ""}\\
  -filter_complex "[0:v]${filterchain.join(",")}[styled];[${backgroundMusic && backgroundMusic !== "None" ? "1:a" : "0:a"}]volume=1.0[audio]" \\
  -map "[styled]" -map "[audio]" \\
  -c:v libx264 -preset fast -b:v ${globalSettings.bitrate}M -maxrate ${globalSettings.bitrate}M -bufsize 12M \\
  -pix_fmt yuv420p -r 30 "ready_vertical_reels_instagram.mp4"`;
  };

  const getPythonPrefectScript = () => {
    return `# -*- coding: utf-8 -*-
import os
import sqlite3
from datetime import datetime
from prefect import task, flow, get_run_logger
import requests

# SQLite Metadata DB Connection Setup
DB_PATH = "reels_metadata.db"

def init_provenance_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS publications (
        id TEXT PRIMARY KEY,
        project_title TEXT,
        clip_name TEXT,
        youtube_url TEXT,
        watermark_text TEXT,
        scheduled_time TEXT,
        status TEXT,
        instagram_post_id TEXT,
        takedown_received INTEGER DEFAULT 0
    )
    """)
    conn.commit()
    conn.close()

@task(retries=3, retry_delay_seconds=60)
def pull_youtube_stream(youtube_url: str):
    logger = get_run_logger()
    logger.info(f"Downloading stream from target: {youtube_url}")
    # In production, invokes yt-dlp to pipeline stream
    # os.system(f"yt-dlp -f 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/mp4' {youtube_url} -o raw_source.mp4")
    return "raw_source.mp4"

@task
def execute_ffmpeg_vertical_reframe(input_file: str, x_percentage: int, start_time: str, end_time: str):
    logger = get_run_logger()
    logger.info("Executing FFmpeg frame coordinates shift & 9:16 scale ratio")
    
    # Calculate crop center offsets
    crop_width = 608
    crop_height = 1080
    x_offset = int((x_percentage / 100.0) * (1920 - crop_width))
    
    # Run absolute terminal binary
    cmd = (
        f"ffmpeg -y -ss {start_time} -to {end_time} -i '{input_file}' "
        f"-vf 'crop={crop_width}:{crop_height}:{x_offset}:0,scale=1080:1920' "
        f"-c:v libx264 -b:v {globalSettings.bitrate}M output_vertical_short.mp4"
    )
    # os.system(cmd)
    return "output_vertical_short.mp4"

@task(log_prints=True)
def publish_to_instagram_reels(video_path: str, caption: str):
    logger = get_run_logger()
    access_token = os.getenv("INSTAGRAM_ACCESS_TOKEN")
    ig_user_id = os.getenv("INSTAGRAM_USER_ID")
    
    if not access_token or not ig_user_id:
        logger.warning("No Instagram access token setup, saving mock publish profile payload")
        return "mock_post_id_success_9981"
        
    # Standard Reels Publishing sequence:
    # 1. POST container creation
    url = f"https://graph.facebook.com/v17.0/{ig_user_id}/media"
    payload = {
        "media_type": "REELS",
        "video_url": "YOUR_PUBLIC_S3_LINK", # hosted edit artifact
        "caption": caption,
        "access_token": access_token
    }
    r = requests.post(url, data=payload).json()
    creation_id = r.get("id")
    
    # 2. Monitor upload status before committing
    # 3. Publish container
    publish_url = f"https://graph.facebook.com/v17.0/{ig_user_id}/media_publish"
    pub_res = requests.post(publish_url, data={"creation_id": creation_id, "access_token": access_token}).json()
    return pub_res.get("id")

@flow(name="YouTube-To-Reels-Pipeline")
def run_clipper_pipeline(youtube_url: str, clip_name: str, start: str, end: str, crop_x: int, caption: str):
    init_provenance_db()
    video_source = pull_youtube_stream(youtube_url)
    reels_artifact = execute_ffmpeg_vertical_reframe(video_source, crop_x, start, end)
    post_id = publish_to_instagram_reels(reels_artifact, caption)
    
    # Write metadata history log
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute(
        "INSERT OR REPLACE INTO publications VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)",
        (f"post_{datetime.now().strftime('%s')}", "YT Project", clip_name, youtube_url, "${globalSettings.watermarkText}", datetime.now().isoformat(), "published", post_id)
    )
    conn.commit()
    conn.close()

if __name__ == '__main__':
    # Run modular orchestrator pipeline
    run_clipper_pipeline(
        youtube_url="${selectedProject.youtubeUrl}",
        clip_name="${activeClip?.name || "TargetClip"}",
        start="${activeClip?.startTime || "00:00:20"}",
        end="${activeClip?.endTime || "00:00:35"}",
        crop_x=${activeClip?.verticalCrop.x || 50},
        caption="${activeClip?.name || "Super exciting clip"} #reels"
    )
`;
  };

  const currentCode = activeTab === "ffmpeg" ? getDynamicFFmpegCommand() : getPythonPrefectScript();

  const handleCopy = () => {
    navigator.clipboard.writeText(currentCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div id="dev-orchestrator-widget" className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-xl text-slate-100 h-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5 border-b border-white/10 pb-4">
        <div className="flex items-center gap-2.5">
          <Terminal className="w-5 h-5 text-indigo-400 animate-pulse" />
          <div>
            <h2 className="text-sm font-bold tracking-wide uppercase text-white font-display">Dev Orchestration & Scripts</h2>
            <p className="text-[11px] text-slate-400">Export workflows, SQLite schemas, & FFmpeg filter matrices</p>
          </div>
        </div>

        {/* Tab Selectors */}
        <div className="flex gap-1.5 bg-black/40 p-1 rounded-xl border border-white/10">
          <button
            id="tab-ffmpeg-cmd"
            onClick={() => setActiveTab("ffmpeg")}
            className={`text-[10px] uppercase font-bold tracking-wider px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
              activeTab === "ffmpeg" ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20" : "text-slate-400 hover:text-white"
            }`}
          >
            FFmpeg Command
          </button>
          <button
            id="tab-prefect-python"
            onClick={() => setActiveTab("prefect")}
            className={`text-[10px] uppercase font-bold tracking-wider px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
              activeTab === "prefect" ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20" : "text-slate-400 hover:text-white"
            }`}
          >
            Python Orchestrator
          </button>
        </div>
      </div>

      <div className="relative">
        {/* Copy trigger */}
        <button
          id="btn-copy-code"
          onClick={handleCopy}
          className="absolute top-2.5 right-2.5 bg-white/10 text-slate-300 hover:text-white p-2.5 rounded-lg hover:bg-white/20 transition-all cursor-pointer border border-white/10"
          title="Copy to Clipboard"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
        </button>

        {/* Code View Block */}
        <div className="bg-black/50 border border-white/10 p-4 rounded-xl overflow-x-auto text-[11px] font-mono leading-relaxed text-indigo-300 max-h-72">
          <pre className="whitespace-pre-wrap">{currentCode}</pre>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3 text-[10px] text-slate-400 pt-3 border-t border-white/10">
        <div className="flex gap-2">
          <Cpu className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
          <span><b>Media engine:</b> Real-time FFmpeg filters map brightness and contrast.</span>
        </div>
        <div className="flex gap-2">
          <Layers className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span><b>Orchestration:</b> Includes local database provenance tracking schemas.</span>
        </div>
        <div className="flex gap-2">
          <Terminal className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span><b>Settings:</b> Outputs H.264 vertical video at {globalSettings.resolution} and ~{globalSettings.bitrate} Mbps.</span>
        </div>
      </div>
    </div>
  );
}
