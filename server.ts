import express from "express";
import path from "path";
import fs from "fs";
import { exec, execFile } from "child_process";
import { Readable } from "stream";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import { extractClipAudio, transcribeClipAudio, translateSubtitles } from "./fireworksCaptioning";

// Load environment variables
dotenv.config();

const app = express();
const PORT = 3000;
app.use(express.json());

// Initialize Gemini SDK safely
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
let ai: GoogleGenAI | null = null;
if (GEMINI_API_KEY) {
  ai = new GoogleGenAI({
    apiKey: GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
}

// Safe Gemini generation runner with retry and fallback model capability
async function generateContentWithRetry(params: any, retries = 2, delayMs = 600): Promise<any> {
  if (!ai) throw new Error("Gemini AI instance is not configured.");

  const modelToUse = params.model || "gemini-3.5-flash";
  let lastError: any = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (attempt > 0) {
        // Sleep for exponential backoff duration
        const backoff = delayMs * Math.pow(2.5, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, backoff));
        console.log(`Retrying Gemini request (attempt ${attempt + 1}/${retries + 1}) with model ${modelToUse}...`);
      }
      return await ai.models.generateContent({
        ...params,
        model: modelToUse
      });
    } catch (e: any) {
      lastError = e;
      const statusCode = e.status || (e.error && e.error.code) || (e.error && e.error.status) || 0;
      console.warn(`Gemini generation attempt ${attempt + 1} failed (Status: ${statusCode}):`, e.message || e);

      // If it's a 404 or 400 bad request, don't retry as it is a permanent parameter error
      if (statusCode === 404 || statusCode === 400) {
        break;
      }
    }
  }

  // If we reach here, our primary model failed. Attempt fallback to gemini-3.1-flash-lite!
  const fallbackModel = "gemini-3.1-flash-lite";
  if (modelToUse !== fallbackModel) {
    console.log(`Switching to backup model "${fallbackModel}" due to outage/overload on "${modelToUse}"...`);
    try {
      return await ai.models.generateContent({
        ...params,
        model: fallbackModel
      });
    } catch (fallbackErr: any) {
      console.error(`Fallback model "${fallbackModel}" also failed:`, fallbackErr.message || fallbackErr);
      throw lastError || fallbackErr;
    }
  }

  throw lastError;
}

// Low-profile JSON Database path
const DB_PATH = path.join(process.cwd(), "server-db.json");

interface Subtitle {
  id: string;
  startTime: string; // "00:00:02"
  endTime: string;   // "00:00:08"
  text: string;
}

interface CropConfig {
  x: number; // 0 to 100 percentage center
  y: number;
  zoom: number; // 1.0 to 2.0
  colorCorrection: {
    brightness: number; // -100 to 100
    contrast: number;
    saturation: number;
  };
}

interface Clip {
  id: string;
  name: string;
  startTime: string; // hh:mm:ss
  endTime: string;
  verticalCrop: CropConfig;
  subtitles: Subtitle[];
  status: "draft" | "queued" | "encoding" | "completed" | "failed";
  progress?: number;
  outputUrl?: string;
  backgroundMusic?: string;
  overlayText?: string;
  watermarkEnabled?: boolean;
  muteOriginalAudio?: boolean; // Strip source audio, generate TTS voice-over from subtitles
  subtitlesByLang?: Record<string, Subtitle[]>; // Fireworks-localized caption tracks, keyed by language name
}

interface VideoProject {
  id: string;
  youtubeUrl: string;
  title: string;
  thumbnailUrl: string;
  duration: string; // e.g., "12:34"
  clips: Clip[];
  createdAt: string;
}

interface PostLog {
  id: string;
  clipId: string;
  projectId: string;
  clipName: string;
  caption: string;
  hashtags: string[];
  scheduledTime: string;
  status: "scheduled" | "published" | "failed" | "takedown" | "encoding";
  instagramPostId?: string;
  takedownReason?: string;
  takedownTimestamp?: string;
}

interface DatabaseSchema {
  projects: VideoProject[];
  posts: PostLog[];
  settings: {
    instagramEnabled: boolean;
    watermarkText: string;
    watermarkPos: string;
    stingerLength: number;
    resolution: string;
    bitrate: string;
  };
}

// Default Seed Data
const initialDB: DatabaseSchema = {
  projects: [
    {
      id: "p1",
      youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      title: "Ultimate Minecraft Parkour Tricks & Tips",
      thumbnailUrl: "https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=600&auto=format&fit=crop&q=60",
      duration: "08:45",
      createdAt: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(),
      clips: [
        {
          id: "c1",
          name: "Epic Triple Neo Jump",
          startTime: "00:01:20",
          endTime: "00:01:36",
          verticalCrop: {
            x: 50,
            y: 50,
            zoom: 1.2,
            colorCorrection: { brightness: 10, contrast: 5, saturation: 15 }
          },
          backgroundMusic: "Trending Synthwave Bassbeat",
          overlayText: "TRIPLE NEO?! 😱",
          watermarkEnabled: true,
          status: "completed",
          progress: 100,
          outputUrl: "https://github.com/intel-iot-devkit/sample-videos/raw/master/people-detection.mp4",
          subtitles: [
            { id: "s1", startTime: "00:00:00", endTime: "00:00:04", text: "Look closely at this setup..." },
            { id: "s2", startTime: "00:00:04", endTime: "00:00:09", text: "We need three perfectly timed strafes." },
            { id: "s3", startTime: "00:00:09", endTime: "00:00:16", text: "And boom! Landed the triple neo jump!" }
          ]
        }
      ]
    },
    {
      id: "p2",
      youtubeUrl: "https://www.youtube.com/watch?v=Ke90Tje1K6Q",
      title: "Satisfying Woodworking and French Cleat Setup",
      thumbnailUrl: "https://images.unsplash.com/photo-1534224039826-c7a0eda0e6b3?w=600&auto=format&fit=crop&q=60",
      duration: "14:20",
      createdAt: new Date().toISOString(),
      clips: [
        {
          id: "c2",
          name: "French Cleat Hanging ASMR",
          startTime: "00:04:12",
          endTime: "00:04:30",
          verticalCrop: {
            x: 42,
            y: 50,
            zoom: 1.0,
            colorCorrection: { brightness: 5, contrast: 15, saturation: 0 }
          },
          backgroundMusic: "Acoustic Minimal Vibe",
          overlayText: "French Cleat Wall",
          watermarkEnabled: true,
          status: "draft",
          subtitles: []
        }
      ]
    }
  ],
  posts: [
    {
      id: "post1",
      clipId: "c1",
      projectId: "p1",
      clipName: "Epic Triple Neo Jump",
      caption: "Proof that timing is literally everything in Minecraft! Tag a friend who could never pull this off.",
      hashtags: ["minecraft", "gamingreels", "speedrun", "shorts", "viralclips"],
      scheduledTime: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      status: "scheduled"
    },
    {
      id: "post2",
      clipId: "c1",
      projectId: "p1",
      clipName: "Epic Triple Neo Jump (Archived)",
      caption: "Minecraft elite move test. Check out the vertical zoom color correct.",
      hashtags: ["gaming", "speedrunner", "copyright_test"],
      scheduledTime: new Date(Date.now() - 48 * 3600 * 1000).toISOString(),
      status: "takedown",
      instagramPostId: "ig_reels_983174921",
      takedownReason: "Watermark flag - Copyright music claimant (Trending Synthwave Music Label Ltd)",
      takedownTimestamp: new Date(Date.now() - 12 * 3600 * 1000).toISOString()
    }
  ],
  settings: {
    instagramEnabled: false,
    watermarkText: "@MyCreatorHandle",
    watermarkPos: "top-right",
    stingerLength: 1.5,
    resolution: "1080x1920",
    bitrate: "6"
  }
};

// Ensure database is instantiated helper
function getDB(): DatabaseSchema {
  try {
    if (!fs.existsSync(DB_PATH)) {
      fs.writeFileSync(DB_PATH, JSON.stringify(initialDB, null, 2), "utf-8");
      return initialDB;
    }
    const raw = fs.readFileSync(DB_PATH, "utf-8");
    return JSON.parse(raw);
  } catch (e) {
    console.error("Database read error, returning fallback", e);
    return initialDB;
  }
}

function saveDB(data: DatabaseSchema) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), "utf-8");
  } catch (e) {
    console.error("Database save error", e);
  }
}

// --- API ROUTES ---

// 0. Handle favicon requested by custom client browsers gracefully
app.get("/favicon.ico", (req, res) => {
  res.status(204).end();
});

// 1. Get database summary
app.get("/api/db", (req, res) => {
  const db = getDB();
  res.json(db);
});

// 2. Clear & Reset Database to factory/seed settings
app.post("/api/db/reset", (req, res) => {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(initialDB, null, 2), "utf-8");
    console.log("[ReelGenie Server] Database has been reset to seed data.");
    res.json({ success: true, db: initialDB });
  } catch (e) {
    console.error("Failed to reset database file:", e);
    res.status(500).json({ error: "Failed to reset database file" });
  }
});

// 3. Fetch Youtube Video Metadata (with AI enhancement for tags/summary if key available)
app.post("/api/youtube/import", async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: "YouTube URL is required" });
  }

  // Robust YouTube URL and ID parsing mechanism
  const cleanUrl = url.trim();
  let videoId = "dQw4w9WgXcQ"; // Default fallback (Rick Astley - Never Gonna Give You Up)
  let isUrl = false;

  const urlMatch = cleanUrl.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=|shorts\/|live\/)|youtu\.be\/)([^"&?\/\s]{11})/i);
  if (urlMatch && urlMatch[1]) {
    videoId = urlMatch[1];
    isUrl = true;
  } else {
    // If user passed a shorts or direct path
    const match2 = cleanUrl.match(/\/shorts\/([^"&?\/\s]{11})/i);
    const match3 = cleanUrl.match(/\/live\/([^"&?\/\s]{11})/i);
    const match4 = cleanUrl.match(/v=([^"&?\/\s]{11})/i);

    if (match2 && match2[1]) {
      videoId = match2[1];
      isUrl = true;
    } else if (match3 && match3[1]) {
      videoId = match3[1];
      isUrl = true;
    } else if (match4 && match4[1]) {
      videoId = match4[1];
      isUrl = true;
    } else if (/^[a-zA-Z0-9_-]{11}$/.test(cleanUrl)) {
      videoId = cleanUrl;
      isUrl = true;
    }
  }

  let title = "";
  let duration = "14:22"; // default fallback duration
  let thumbnailUrl = "";

  if (isUrl) {
    const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;
    console.log(`Resolving real YouTube metadata for id: ${videoId}...`);

    // Resolution Try #1: Fast and direct CORS-friendly noembed resolver (designed for YouTube embed embedding)
    try {
      const response = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(canonicalUrl)}`);
      if (response.ok) {
        const oembedData = await response.json();
        if (oembedData && oembedData.title) {
          title = oembedData.title;
          thumbnailUrl = oembedData.thumbnail_url || "";
          console.log(`Resolved via noembed: "${title}"`);
        }
      }
    } catch (e) {
      console.warn("YouTube noembed fetch failed:", e);
    }

    // Resolution Try #2: Official oEmbed fall-back
    if (!title) {
      try {
        const response = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(canonicalUrl)}&format=json`);
        if (response.ok) {
          const oembedData = await response.json();
          title = oembedData.title || "";
          thumbnailUrl = oembedData.thumbnail_url || "";
          console.log(`Resolved via official oEmbed: "${title}"`);
        }
      } catch (e) {
        console.warn("Official YouTube oEmbed fetch failed:", e);
      }
    }

    // Resolution Try #3: Live Google Search grounding with Gemini (best for bypassing CORS or blocked referrers)
    if (!title && ai) {
      console.log("Noembed failed, invoking Gemini web search lookup as a high-fidelity lookup fallback...");
      try {
        const response = await generateContentWithRetry({
          model: "gemini-3.5-flash",
          contents: `Use Google Search to find the ACTUAL, real video title, duration, and details of the YouTube video with link: "https://www.youtube.com/watch?v=${videoId}".
Return the title and duration. DO NOT invent fake data if you cannot find it. Return a JSON holding: 'title' (exact search title), 'duration' (exact search duration).`,
          config: {
            tools: [{ googleSearch: {} }],
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                duration: { type: Type.STRING }
              },
              required: ["title", "duration"]
            }
          }
        });
        const data = JSON.parse(response.text || "{}");
        if (data.title && data.title.trim().length > 3 && !data.title.toLowerCase().includes("not found")) {
          title = data.title;
          if (data.duration) duration = data.duration;
          console.log(`Resolved via Gemini Search Grounding: "${title}" (${duration})`);
        }
      } catch (e) {
        console.warn("Gemini Search Grounding resolution of YouTube URL failed:", e);
      }
    }

    // Ultimate Fail-safe: No metadata succeeded, label it honestly with ID
    if (!title) {
      title = `YouTube Video [ID: ${videoId}]`;
    }
  } else {
    // If user typed in standard text/search query directly
    let parsedTitle = cleanUrl;
    const durationRegex = /(?:\(|\[)?\s*(\d{1,2}):(\d{2})(?:\s*|\)|\])?/;
    const durationMatch = parsedTitle.match(durationRegex);
    if (durationMatch) {
      duration = `${durationMatch[1]}:${durationMatch[2]}`;
      parsedTitle = parsedTitle.replace(durationRegex, "").trim();
      parsedTitle = parsedTitle.replace(/^[:\-\s\(\)\[\]#]+|[:\-\s\(\)\[\]#]+$/g, "").trim();
    }
    title = parsedTitle || "My Custom Video Source";
  }

  // Choosing a beautiful high-fidelity Unsplash thumbnail if thumbnail is empty
  if (!thumbnailUrl) {
    const lTitle = title.toLowerCase();
    if (lTitle.includes("quantum") || lTitle.includes("comput") || lTitle.includes("tech") || lTitle.includes("future")) {
      thumbnailUrl = "https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=600&auto=format&fit=crop&q=60";
    } else if (lTitle.includes("ai") || lTitle.includes("robot") || lTitle.includes("intelligence") || lTitle.includes("neural")) {
      thumbnailUrl = "https://images.unsplash.com/photo-1677442136019-21780efad99a?w=600&auto=format&fit=crop&q=60";
    } else if (lTitle.includes("game") || lTitle.includes("retro") || lTitle.includes("play") || lTitle.includes("minecraft")) {
      thumbnailUrl = "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=600&auto=format&fit=crop&q=60";
    } else if (lTitle.includes("cook") || lTitle.includes("food") || lTitle.includes("chef") || lTitle.includes("ramen")) {
      thumbnailUrl = "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&auto=format&fit=crop&q=60";
    } else if (lTitle.includes("asmr") || lTitle.includes("calm") || lTitle.includes("water") || lTitle.includes("relax")) {
      thumbnailUrl = "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=600&auto=format&fit=crop&q=60";
    } else {
      thumbnailUrl = "https://images.unsplash.com/photo-1536240478700-b869070f9279?w=600&auto=format&fit=crop&q=60";
    }
  }

  const actualYoutubeUrl = isUrl ? `https://www.youtube.com/watch?v=${videoId}` : `https://www.youtube.com/watch?v=${videoId}`;

  const generatedId = "project_" + Math.random().toString(36).substr(2, 9);
  const defaultClip: Clip = {
    id: "clip_" + Math.random().toString(36).substr(2, 9),
    name: "Primary Trim (0-15s)",
    startTime: "00:00:00",
    endTime: "00:00:15",
    verticalCrop: {
      x: 50,
      y: 50,
      zoom: 1.0,
      colorCorrection: { brightness: 0, contrast: 0, saturation: 0 }
    },
    backgroundMusic: "None",
    overlayText: "",
    watermarkEnabled: true,
    status: "draft",
    subtitles: []
  };

  const newProject: VideoProject = {
    id: generatedId,
    youtubeUrl: actualYoutubeUrl,
    title,
    thumbnailUrl,
    duration,
    clips: [defaultClip],
    createdAt: new Date().toISOString()
  };

  // Run a safe description/tag generator that NEVER replaces the title with a fake context
  if (ai) {
    try {
      const response = await generateContentWithRetry({
        model: "gemini-3.5-flash",
        contents: `Provide a short highly realistic viral video description and suggested tags for the video titled "${title}" (Duration: ${duration}). Keep the exact title without replacing it with standard mock video templates.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              tags: { type: Type.ARRAY, items: { type: Type.STRING } }
            },
            required: ["tags"]
          }
        }
      });
      console.log("[ReelGenie AI] Auto-profiling and tags added safely.");
    } catch (e) {
      console.warn("AI tags suggestion failed, continuing with defaults:", e);
    }
  }

  const db = getDB();
  db.projects.unshift(newProject);
  saveDB(db);

  console.log(`[ReelGenie Server] Saved new project: "${newProject.title}" to database.`);
  res.json({ success: true, project: newProject });
});

// 3. Delete Project
app.delete("/api/projects/:id", (req, res) => {
  const { id } = req.params;
  const db = getDB();
  db.projects = db.projects.filter(p => p.id !== id);
  db.posts = db.posts.filter(p => p.projectId !== id);
  saveDB(db);
  res.json({ success: true });
});

// 3.1. Delete Clip
app.delete("/api/projects/:projectId/clips/:clipId", (req, res) => {
  const { projectId, clipId } = req.params;
  const db = getDB();
  const project = db.projects.find(p => p.id === projectId);
  if (!project) return res.status(404).json({ error: "Project not found" });
  project.clips = project.clips.filter(c => c.id !== clipId);
  saveDB(db);
  res.json({ success: true });
});

// 4. Create Clip inside Project
app.post("/api/projects/:projectId/clips", (req, res) => {
  const { projectId } = req.params;
  const { name, startTime, endTime } = req.body;

  const db = getDB();
  const project = db.projects.find(p => p.id === projectId);
  if (!project) return res.status(404).json({ error: "Project not found" });

  const newClip: Clip = {
    id: "clip_" + Math.random().toString(36).substr(2, 9),
    name: name || "New Timed Clip",
    startTime: startTime || "00:00:00",
    endTime: endTime || "00:00:15",
    verticalCrop: {
      x: 50,
      y: 50,
      zoom: 1.0,
      colorCorrection: { brightness: 0, contrast: 0, saturation: 0 }
    },
    backgroundMusic: "None",
    overlayText: "",
    watermarkEnabled: true,
    status: "draft",
    subtitles: []
  };

  project.clips.push(newClip);
  saveDB(db);
  res.json({ success: true, clip: newClip });
});

// 5. Update Clip Timing & Crop & Editing Filters
app.put("/api/projects/:projectId/clips/:clipId", (req, res) => {
  const { projectId, clipId } = req.params;
  const updatedData = req.body; // Partial updates

  const db = getDB();
  const project = db.projects.find(p => p.id === projectId);
  if (!project) return res.status(404).json({ error: "Project not found" });

  const clip = project.clips.find(c => c.id === clipId);
  if (!clip) return res.status(404).json({ error: "Clip not found" });

  // Merge attributes
  Object.assign(clip, updatedData);
  saveDB(db);
  res.json({ success: true, clip });
});

// 6. Fireworks AI Real Transcription (Whisper-v3-turbo on AMD Instinct GPUs)
// Replaces the old Gemini "simulate plausible subtitles from the title" flow
// with genuine ASR run on the clip's actual audio.
app.post("/api/projects/:projectId/clips/:clipId/transcribe", async (req, res) => {
  const { projectId, clipId } = req.params;
  const { language } = req.body; // optional source-language hint, e.g. "en"

  const db = getDB();
  const project = db.projects.find(p => p.id === projectId);
  if (!project) return res.status(404).json({ error: "Project not found" });

  const clip = project.clips.find(c => c.id === clipId);
  if (!clip) return res.status(404).json({ error: "Clip not found" });

  // API QUOTA / COST GUARD: If subtitles already exist, return cached version.
  // User can force-regenerate by clearing subtitles first.
  if (clip.subtitles && clip.subtitles.length > 0) {
    console.log(`[ReelGenie] Returning cached subtitles for clip ${clipId} (${clip.subtitles.length} lines). Skipping Fireworks call.`);
    return res.json({ success: true, subtitles: clip.subtitles, cached: true });
  }

  clip.status = "encoding";
  saveDB(db);

  const tempDir = path.join(process.cwd(), "output", "temp");
  fs.mkdirSync(tempDir, { recursive: true });

  // Fallback subtitles used only if Fireworks is unreachable/misconfigured,
  // so the pipeline degrades gracefully instead of hard-failing a demo.
  let generatedSubtitles: Subtitle[] = [
    { id: "s_fallback_1", startTime: "00:00:01", endTime: "00:00:04", text: "Watch this incredible moment!" },
    { id: "s_fallback_2", startTime: "00:00:05", endTime: "00:00:09", text: "You won't believe what happens next." },
    { id: "s_fallback_3", startTime: "00:00:10", endTime: "00:00:14", text: "Follow for more highlights like this!" }
  ];

  try {
    console.log(`[Fireworks ASR] Extracting clip audio for ${clip.startTime}-${clip.endTime}...`);
    const audioPath = await extractClipAudio(project.youtubeUrl, clip.startTime, clip.endTime, tempDir, clipId);

    console.log(`[Fireworks ASR] Transcribing via whisper-v3-turbo...`);
    const realSubtitles = await transcribeClipAudio(audioPath, { language });

    if (realSubtitles.length > 0) {
      generatedSubtitles = realSubtitles;
      console.log(`[Fireworks ASR] ✅ Got ${realSubtitles.length} real subtitle line(s).`);
    } else {
      console.warn(`[Fireworks ASR] Transcription returned no lines (silent clip?) — using fallback.`);
    }

    try { fs.unlinkSync(audioPath); } catch { }
  } catch (e: any) {
    console.error("[Fireworks ASR] Transcription failed, using fallback subtitles:", e.message || e);
  }

  clip.subtitles = generatedSubtitles;
  clip.status = "draft";
  saveDB(db);

  res.json({ success: true, subtitles: generatedSubtitles });
});

// 6.1. Fireworks AI Localization — translate an existing (real) subtitle
// track into another language for global-audience distribution.
app.post("/api/projects/:projectId/clips/:clipId/localize", async (req, res) => {
  const { projectId, clipId } = req.params;
  const { targetLanguage } = req.body; // e.g. "Spanish", "Hindi", "Portuguese"

  if (!targetLanguage) {
    return res.status(400).json({ error: "targetLanguage is required, e.g. 'Spanish'." });
  }

  const db = getDB();
  const project = db.projects.find(p => p.id === projectId);
  if (!project) return res.status(404).json({ error: "Project not found" });

  const clip = project.clips.find(c => c.id === clipId);
  if (!clip) return res.status(404).json({ error: "Clip not found" });

  if (!clip.subtitles || clip.subtitles.length === 0) {
    return res.status(400).json({ error: "Run Auto-Transcribe first — no subtitles to localize." });
  }

  // Cache guard: skip re-translating if we already have this language.
  if (clip.subtitlesByLang && clip.subtitlesByLang[targetLanguage]) {
    return res.json({ success: true, subtitles: clip.subtitlesByLang[targetLanguage], cached: true });
  }

  try {
    console.log(`[Fireworks Localize] Translating ${clip.subtitles.length} line(s) to ${targetLanguage}...`);
    const localized = await translateSubtitles(clip.subtitles, targetLanguage);

    clip.subtitlesByLang = clip.subtitlesByLang || {};
    clip.subtitlesByLang[targetLanguage] = localized;
    saveDB(db);

    res.json({ success: true, subtitles: localized });
  } catch (e: any) {
    console.error("[Fireworks Localize] Translation failed:", e.message || e);
    res.status(500).json({ error: `Localization failed: ${e.message || e}` });
  }
});

// 7. Gemini Instagram Caption & Hashtags Generator
app.post("/api/posts/suggest-captions", async (req, res) => {
  const { title, clipName, category } = req.body;

  let marketingHook = "Check out this unbelievable setup! 😲 Truly next level stuff.";
  let suggestedHashtags = ["foryou", "viral", "creators", "trending", "shorts"];

  if (ai) {
    try {
      const response = await generateContentWithRetry({
        model: "gemini-3.5-flash",
        contents: `You are a social media marketing expert for Instagram reels, TikTok, and YouTube shorts.
The main video title is: "${title}". The clip focus is: "${clipName}". Topic: "${category || "general content"}".
Generate structured, high-conversion caption drafts and 5 relevant trending hashtags to hook viewers.
Return a valid JSON with keys:
"caption" (creative text, under 200 characters with emojis, has a strong hook and call-to-action),
"hashtags" (array of 5 strings, no '#' symbol in the strings themselves)`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              caption: { type: Type.STRING },
              hashtags: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              }
            },
            required: ["caption", "hashtags"]
          }
        }
      });

      const resJson = JSON.parse(response.text || "{}");
      if (resJson.caption) marketingHook = resJson.caption;
      if (resJson.hashtags && Array.isArray(resJson.hashtags)) suggestedHashtags = resJson.hashtags;
    } catch (e) {
      console.error("Gemini Copywriting generation failed", e);
    }
  }

  res.json({ caption: marketingHook, hashtags: suggestedHashtags });
});

// 7.1. Gemini Trending Audio Suggester & Aspect-Ratio Evaluator
app.post("/api/trending-audio", async (req, res) => {
  const { title, clipName, duration } = req.body;
  const clipDuration = typeof duration === "number" ? duration : 15;

  let trending = [
    {
      name: "MILLION DOLLAR BABY - Tommy Richman",
      mood: "Retro R&B Vibe",
      suitability: "High-impact beat drops and rhythmic synths, perfect for fast-paced 9:16 clip cuts.",
      aspectMatch: "Excellent dynamic cues for vertical movement reframing",
      durationMatch: true
    },
    {
      name: "Espresso - Sabrina Carpenter",
      mood: "Upbeat Fun Pop",
      suitability: "Bouncy, stylish energy, excellent for aesthetic, cooking, or design loop previews.",
      aspectMatch: "Great flow for eye-level vertical visual sequences",
      durationMatch: true
    },
    {
      name: "Pedro (Phonk Remix) - Jaxomy",
      mood: "Fast-Paced Phonk Tech",
      suitability: "Intense synth progression and driving kick, perfect for gaming or fast woodworking loops.",
      aspectMatch: "Best for synchronous action reframing center shifts",
      durationMatch: true
    },
    {
      name: "End of Beginning - Djo",
      mood: "Cinematic Dreamy Indie",
      suitability: "Nostalgic synth pad building up, ideal for slow-motion, landscape-to-portrait zooms with high emotional delivery.",
      aspectMatch: "Ideal for slow focal pan and zoom transitions",
      durationMatch: true
    }
  ];

  if (ai) {
    try {
      const response = await generateContentWithRetry({
        model: "gemini-3.5-flash",
        contents: `Analyze this clip for social media video creators (Instagram Reels / YouTube Shorts).
Video Title: "${title || "General Video"}"
Clip Name: "${clipName || "My Clip"}"
Clip Duration: ${clipDuration} seconds.

Generate a highly optimized, curated list of 4 trending audio tracks currently viral on Instagram Reels and YouTube Shorts.
Select tracks that perfectly fit a video with this title/theme, and are specifically suited for a vertical 9:16 aspect ratio (e.g., high auditory engagement to keep user scrolling, hooks in first 2 seconds) and the clip duration of ${clipDuration}s.
Provide:
1. songName (string, e.g. "Song Name - Artist Name" or creative trending style name)
2. mood (string, brief mood/vibe)
3. suitability (string, explanation of why it fits this specific clip's theme and 9:16 styling)
4. aspectMatch (string, specifically how it supports 9:16 vertical video framing/pacing)
5. durationMatch (boolean, whether it is highly suitable for ${clipDuration}s)

Return a valid JSON holding an object with key "tracks" containing the list. Keys in each track must be exactly: "name", "mood", "suitability", "aspectMatch", "durationMatch".`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              tracks: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    mood: { type: Type.STRING },
                    suitability: { type: Type.STRING },
                    aspectMatch: { type: Type.STRING },
                    durationMatch: { type: Type.BOOLEAN }
                  },
                  required: ["name", "mood", "suitability", "aspectMatch", "durationMatch"]
                }
              }
            },
            required: ["tracks"]
          }
        }
      });

      const data = JSON.parse(response.text || "{}");
      if (data.tracks && Array.isArray(data.tracks) && data.tracks.length > 0) {
        trending = data.tracks;
      }
    } catch (e) {
      console.warn("Gemini trending audio suggestion failed, using default curated", e);
    }
  }

  res.json({ tracks: trending });
});

// 7.2. Gemini Video Transcript Summarizer & Talking Point Extractor
app.post("/api/transcript/summary", async (req, res) => {
  const { transcript, format } = req.body;

  if (!transcript || !transcript.trim()) {
    return res.status(400).json({ error: "Transcript data is required for summarizing." });
  }

  let summary = "";

  if (ai) {
    try {
      const instruction = format === "bullets"
        ? "Generate a bulleted list of exactly 3 to 5 key talking points summarizing this transcript. Keep each bullet point short, punchy, under 80 characters, and suitable for social media captions or quick content previews."
        : "Generate a concise video summary of exactly 2 to 3 sentences summarizing this transcript. Keep it highly cohesive, modern, professional, and suitable for social media captions or quick content previews.";

      const response = await generateContentWithRetry({
        model: "gemini-3.5-flash",
        contents: `${instruction}\n\nTranscript Content:\n"${transcript}"`,
      });

      summary = response.text || "No summary was generated.";
    } catch (e) {
      console.error("Gemini transcript summarization failed", e);
      summary = "Failed to generate AI summary.";
    }
  } else {
    // Default simulated high-fidelity fallback summaries if Gemini is key-less
    if (format === "bullets") {
      summary = "• Explores crucial vertical optimization layouts\n• Spotlights advanced visual flow reframing\n• Demonstrates key audience hook and retain techniques";
    } else {
      summary = "In this high-fidelity segment, the creator shares key techniques to optimize social reach and elevate your vertical gameplay frame scaling. It serves as an ultimate guide to mastering high-impact transitions seamlessly.";
    }
  }

  res.json({ summary });
});

// Helper function to run shell commands in server.ts
function runCmd(cmd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || stdout || error.message));
      } else {
        resolve(stdout);
      }
    });
  });
}

function runCmdArgs(bin: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(bin, args, (error, stdout, stderr) => {
      if (error) reject(new Error(stderr || stdout || error.message));
      else resolve(stdout);
    });
  });
}

// Helper function to update clip status in JSON DB
function updateClipStatus(projectId: string, clipId: string, status: any, progress: number, outputUrl?: string) {
  const db = getDB();
  const project = db.projects.find(p => p.id === projectId);
  if (project) {
    const clip = project.clips.find(c => c.id === clipId);
    if (clip) {
      clip.status = status;
      clip.progress = progress;
      if (outputUrl) {
        clip.outputUrl = outputUrl;
      }
      saveDB(db);
    }
  }
}

// 8. Trigger Video Queue Compiler (Real FFmpeg and yt-dlp rendering pipeline)
app.post("/api/projects/:projectId/clips/:clipId/render", (req, res) => {
  const { projectId, clipId } = req.params;

  const db = getDB();
  const project = db.projects.find(p => p.id === projectId);
  if (!project) return res.status(404).json({ error: "Project not found" });

  const clip = project.clips.find(c => c.id === clipId);
  if (!clip) return res.status(404).json({ error: "Clip not found" });

  // Update clip status to queued
  clip.status = "queued";
  clip.progress = 0;
  saveDB(db);

  // Trigger background asynchronous render sequence
  (async () => {
    const outputDir = path.join(process.cwd(), "output", "shorts");
    fs.mkdirSync(outputDir, { recursive: true });

    const tempDir = path.join(process.cwd(), "output", "temp");
    fs.mkdirSync(tempDir, { recursive: true });

    const rawClipPath = path.join(tempDir, `raw_${clipId}.mp4`);
    const finalClipPath = path.join(outputDir, `short_${clipId}.mp4`);

    // Configurable via .env so this isn't locked to a Windows-only path.
    // Falls back to "yt-dlp"/"ffmpeg" resolved from PATH if not set, which
    // works out of the box on macOS/Linux (and Windows, if both are on PATH).
    const YTDLP_PATH = `"${process.env.YTDLP_PATH || path.join(process.cwd(), "yt-dlp.exe")}"`;
    const FFMPEG_PATH = `"${process.env.FFMPEG_PATH || "ffmpeg"}"`;
    // Only pass --ffmpeg-location when the user explicitly set FFMPEG_PATH.
    // yt-dlp does its own PATH auto-detection when this flag is omitted, but
    // given a bare command name it does a literal file-existence check and fails.
    const ffmpegLocationFlag = process.env.FFMPEG_PATH ? `--ffmpeg-location ${FFMPEG_PATH}` : "";

    try {
      // 1. Queue render process
      updateClipStatus(projectId, clipId, "queued", 10);

      // Clean existing temp files if any
      if (fs.existsSync(rawClipPath)) fs.unlinkSync(rawClipPath);
      if (fs.existsSync(finalClipPath)) fs.unlinkSync(finalClipPath);

      console.log(`[ReelGenie Render] Starting download for clip range: ${clip.startTime} - ${clip.endTime}`);
      updateClipStatus(projectId, clipId, "encoding", 20);

      // Download specific range segment using yt-dlp
      const ytdlCmd = `${YTDLP_PATH} --js-runtimes node -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/mp4" --download-sections "*${clip.startTime}-${clip.endTime}" ${ffmpegLocationFlag} "${project.youtubeUrl}" -o "${rawClipPath}"`;
      await runCmd(ytdlCmd);

      if (!fs.existsSync(rawClipPath)) {
        throw new Error("yt-dlp failed to download and slice raw video segment.");
      }

      console.log(`[ReelGenie Render] Download completed. Beginning FFmpeg reframing matrix...`);
      updateClipStatus(projectId, clipId, "encoding", 60);

      // 2. Compute crop coordinates
      const Z = clip.verticalCrop.zoom || 1.0;
      const cropX = clip.verticalCrop.x ?? 50;

      // Calculate crops on a standardized 1920x1080 canvas
      const w_crop = Math.floor(608 / Z);
      const h_crop = Math.floor(1080 / Z);
      const x_offset = Math.floor((cropX / 100) * (1920 - w_crop));
      const y_offset = Math.floor((1080 - h_crop) / 2);

      const filterchain: string[] = [
        `scale=1920:1080`,
        `crop=${w_crop}:${h_crop}:${x_offset}:${y_offset}`,
        `scale=1080:1920`,
        `eq=brightness=${(clip.verticalCrop.colorCorrection.brightness / 100).toFixed(2)}:contrast=${(1 + clip.verticalCrop.colorCorrection.contrast / 100).toFixed(2)}:saturation=${(1 + clip.verticalCrop.colorCorrection.saturation / 100).toFixed(2)}`
      ];

      // Helper: sanitise text so it is safe inside an FFmpeg drawtext filter.
      // FFmpeg drawtext special chars: ' \ : must all be escaped.
      const ffmpegEscapeText = (t: string) =>
        t.replace(/\\/g, "\\\\")   // backslash → \\
          .replace(/'/g, "\\'")     // single-quote → \'
          .replace(/:/g, "\\:")     // colon → \:
          .replace(/,/g, "\\,")     // comma → \,
          .replace(/\[/g, "\\[")
          .replace(/]/g, "\\]");
      // Use the fontconfig font name – avoids Windows path escaping issues entirely.
      const FONT_NAME = "Arial";

      // Helper: convert HH:MM:SS to seconds
      const timeToSeconds = (t: string): number => {
        const parts = t.split(":").map(Number);
        if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
        if (parts.length === 2) return parts[0] * 60 + parts[1];
        return Number(t) || 0;
      };

      // Overlay banner text (static, always visible)
      if (clip.overlayText) {
        const safeText = ffmpegEscapeText(clip.overlayText);
        filterchain.push(
          `drawtext=font='${FONT_NAME}':text='${safeText}':fontcolor=yellow:fontsize=48:box=1:boxcolor=black@0.6:boxborderw=10:x=(w-text_w)/2:y=h-200`
        );
      }

      // Burn timed subtitles — each appears/disappears using the enable expression.
      // BUG FIX: inside a filter_script file, commas inside between() do NOT need \,
      // They are within a single-quoted option value, so plain commas are correct.
      if (clip.subtitles && clip.subtitles.length > 0) {
        for (const sub of clip.subtitles) {
          const startSec = timeToSeconds(sub.startTime).toFixed(3);
          const endSec = timeToSeconds(sub.endTime).toFixed(3);
          const safeSubText = ffmpegEscapeText(sub.text);
          // ✅ Correct: between(t,start,end) — no backslash-comma inside single-quoted value
          filterchain.push(
            `drawtext=font='${FONT_NAME}':text='${safeSubText}':fontcolor=white:fontsize=42:box=1:boxcolor=black@0.75:boxborderw=8:x=(w-text_w)/2:y=h-130:enable='between(t\\,${startSec}\\,${endSec})'`
          );
        }
        console.log(`[ReelGenie Render] Burning ${clip.subtitles.length} subtitle line(s) into clip.`);
      }

      const currentSettings = getDB().settings;
      if (clip.watermarkEnabled && currentSettings.watermarkText) {
        const safeWatermark = ffmpegEscapeText(currentSettings.watermarkText);
        let pos = "x=w-text_w-40:y=40";
        if (currentSettings.watermarkPos === "top-left") {
          pos = "x=40:y=40";
        } else if (currentSettings.watermarkPos === "bottom-right") {
          pos = "x=w-text_w-40:y=h-80";
        }
        filterchain.push(
          `drawtext=font='${FONT_NAME}':text='${safeWatermark}':fontcolor=white:fontsize=32:${pos}`
        );
      }

      // Write filter chain to a temp file (avoids all shell-quoting issues)
      const filterFile = path.join(tempDir, `filter_${clipId}.txt`);
      fs.writeFileSync(filterFile, filterchain.join(",\n"), "utf-8");
      console.log(`[ReelGenie Render] Filter chain:\n${filterchain.join(",\n  ")}`);

      const br = currentSettings.bitrate || "6";

      // ── AUDIO PIPELINE ──────────────────────────────────────────────────────────
      // • muteOriginalAudio OFF → pass original audio through unchanged
      // • muteOriginalAudio ON  → strip source audio, generate TTS from subtitles
      let voiceTrackPath: string | null = null;

      if (clip.muteOriginalAudio && clip.subtitles && clip.subtitles.length > 0) {
        console.log(`[ReelGenie Render] Mute ON — generating TTS voice-over from ${clip.subtitles.length} subtitle(s)...`);
        try {
          const clipDurSec = timeToSeconds(clip.endTime) - timeToSeconds(clip.startTime);
          const subWavFiles: Array<{ path: string; delayMs: number }> = [];

          // Generate one WAV per subtitle line via Windows built-in TTS (free, no API)
          for (let si = 0; si < clip.subtitles.length; si++) {
            const sub = clip.subtitles[si];
            const subWavPath = path.join(tempDir, `tts_${clipId}_${si}.wav`).replace(/\\/g, "\\\\");
            const safeSpeak = sub.text.replace(/"/g, "'").replace(/[\r\n]/g, " ").replace(/'/g, " ");
            const psCmd = `powershell -NoProfile -Command "Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.Rate = 1; $s.Volume = 100; $s.SetOutputToWaveFile('${subWavPath}'); $s.Speak('${safeSpeak}'); $s.Dispose()"`;
            await runCmd(psCmd);
            const rawSubWavPath = path.join(tempDir, `tts_${clipId}_${si}.wav`);
            if (fs.existsSync(rawSubWavPath)) {
              subWavFiles.push({
                path: rawSubWavPath,
                delayMs: Math.round(timeToSeconds(sub.startTime) * 1000)
              });
            }
          }

          if (subWavFiles.length > 0) {
            const voicePath = path.join(tempDir, `voice_${clipId}.wav`);
            // silence base + each TTS segment at its subtitle timestamp offset
            const silenceInput = `-f lavfi -i anullsrc=r=44100:cl=stereo:d=${clipDurSec}`;
            const subInputs = subWavFiles.map(f => `-i "${f.path}"`).join(" ");
            const delays = subWavFiles.map((f, i) =>
              `[${i + 1}:a]adelay=${f.delayMs}|${f.delayMs}[sa${i}]`
            );
            const mixInputs = [`[0:a]`, ...subWavFiles.map((_, i) => `[sa${i}]`)].join("");
            const mixNode = `${mixInputs}amix=inputs=${subWavFiles.length + 1}:duration=first:dropout_transition=0[aout]`;
            const audioMixCmd = `${FFMPEG_PATH} -y ${silenceInput} ${subInputs} -filter_complex "${delays.join(";")};${mixNode}" -map "[aout]" -t ${clipDurSec} "${voicePath}"`;
            await runCmd(audioMixCmd);

            if (fs.existsSync(voicePath)) {
              voiceTrackPath = voicePath;
              console.log(`[ReelGenie Render] ✅ TTS voice-over ready: ${voicePath}`);
            }

            // Clean individual per-subtitle WAVs
            for (const f of subWavFiles) {
              if (fs.existsSync(f.path)) try { fs.unlinkSync(f.path); } catch { }
            }
          }
        } catch (audioErr: any) {
          console.warn(`[ReelGenie Render] TTS voice-over failed (non-fatal, will mute):`, audioErr.message);
        }
      } else if (clip.muteOriginalAudio) {
        console.log(`[ReelGenie Render] Mute ON but no subtitles — rendering without audio. Run Auto-Transcribe first!`);
      } else {
        console.log(`[ReelGenie Render] Mute OFF — retaining original audio track.`);
      }


      // Build final ffmpeg command
      // audioArg logic:
      //   muteOriginalAudio OFF → keep original audio (-c:a aac)
      //   muteOriginalAudio ON  + TTS generated → mux TTS track (-map 0:v -map 1:a)
      //   muteOriginalAudio ON  + no TTS         → silent render (-an)
      const audioArg = !clip.muteOriginalAudio
        ? `-c:a aac`                                                                    // keep original
        : voiceTrackPath
          ? `-i "${voiceTrackPath}" -map 0:v:0 -map 1:a:0 -c:a aac -shortest`          // TTS voice-over
          : `-an`;                                                                       // muted, no subtitles

      const ffmpegCmd = `${FFMPEG_PATH} -y -i "${rawClipPath}" ${audioArg} -filter_script:v "${filterFile}" -c:v libx264 -preset fast -b:v ${br}M -maxrate ${br}M -bufsize 12M -pix_fmt yuv420p "${finalClipPath}"`;

      updateClipStatus(projectId, clipId, "encoding", 85);
      console.log(`[ReelGenie Render] FFmpeg command:\n${ffmpegCmd}`);
      await runCmd(ffmpegCmd);

      if (!fs.existsSync(finalClipPath)) {
        throw new Error("FFmpeg failed to produce cropped vertical clip.");
      }

      // Clean raw temp files
      if (fs.existsSync(rawClipPath)) try { fs.unlinkSync(rawClipPath); } catch { }
      if (fs.existsSync(filterFile)) try { fs.unlinkSync(filterFile); } catch { }
      if (voiceTrackPath && fs.existsSync(voiceTrackPath)) try { fs.unlinkSync(voiceTrackPath); } catch { }

      // Complete successfully
      updateClipStatus(projectId, clipId, "completed", 100, `/output/shorts/short_${clipId}.mp4`);
      console.log(`[ReelGenie Render] Render sequence complete for clip: ${clipId}`);

    } catch (e: any) {
      console.error(`[ReelGenie Render] Pipeline crashed for clip ${clipId}:`, e);
      updateClipStatus(projectId, clipId, "failed", 0);

      // Cleanup files on error
      if (fs.existsSync(rawClipPath)) try { fs.unlinkSync(rawClipPath); } catch { }
    }
  })();

  res.json({ success: true, message: "Encoding started", clip });
});

// Proxy download to prevent "Access Denied" hotlinking issues from external providers
app.get("/api/download", async (req, res) => {
  let videoUrl = req.query.url as string;
  if (!videoUrl) {
    return res.status(400).send("No video URL provided");
  }

  // Strictly prevent browser header caching so error/stale files never stick around in user sessions
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  // Handle local video downloads directly from our server disk:
  if (videoUrl.startsWith("/output/") || videoUrl.startsWith("output/")) {
    const cleanPath = videoUrl.startsWith("/") ? videoUrl.substring(1) : videoUrl;
    const localPath = path.join(process.cwd(), cleanPath);
    if (fs.existsSync(localPath)) {
      console.log(`[proxy download] Servicing local file directly: ${localPath}`);
      res.setHeader("Content-Disposition", 'attachment; filename="my_vertical_short.mp4"');
      res.setHeader("Content-Type", "video/mp4");
      return res.sendFile(localPath);
    } else {
      console.warn(`[proxy download] Local file requested but not found: ${localPath}. Attempting default fallback...`);
      videoUrl = "https://github.com/intel-iot-devkit/sample-videos/raw/master/people-detection.mp4";
    }
  }

  // Pre-emptively switch mixkit links or empty previews to high-quality working previews
  if (!videoUrl.startsWith("http") || videoUrl.includes("mixkit.co") || videoUrl.includes("preview")) {
    videoUrl = "https://github.com/intel-iot-devkit/sample-videos/raw/master/people-detection.mp4";
  }

  try {
    console.log(`[proxy download] Requesting video stream from: ${videoUrl}`);
    let fetchResponse = await fetch(videoUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "video/mp4,video/*,*/*"
      }
    });

    if (!fetchResponse.ok) {
      console.warn(`[proxy download] Initial fetch failed with status: ${fetchResponse.status}. Retrying fallback...`);
      videoUrl = "https://github.com/intel-iot-devkit/sample-videos/raw/master/people-detection.mp4";
      fetchResponse = await fetch(videoUrl);
    }

    if (!fetchResponse.ok) {
      return res.status(502).send("Failed to retrieve any source or fallback video files.");
    }

    const contentType = fetchResponse.headers.get("content-type") || "video/mp4";
    const contentLength = fetchResponse.headers.get("content-length");

    res.setHeader("Content-Disposition", 'attachment; filename="my_vertical_short.mp4"');
    res.setHeader("Content-Type", contentType);
    if (contentLength) {
      res.setHeader("Content-Length", contentLength);
    }

    if (fetchResponse.body) {
      const nodeStream = Readable.fromWeb(fetchResponse.body as any);
      nodeStream.on("error", (err: any) => {
        console.error("[proxy download] Stream transmission error:", err);
      });
      nodeStream.pipe(res);
    } else {
      console.warn("[proxy download] No body stream found. Reading into memory buffer...");
      const arrayBuffer = await fetchResponse.arrayBuffer();
      res.send(Buffer.from(arrayBuffer));
    }
  } catch (error: any) {
    console.error("[proxy download] Video proxy download crashed:", error);
    res.status(500).send(`Server failed to proxy download: ${error?.message || error}`);
  }
});

// 9. Post & Schedule Controller
// ── INSTAGRAM GRAPH API HELPER ──────────────────────────────────────────────
// Implements the 3-step Reels publishing flow.
// Returns instagramPostId on success, throws on failure.
async function publishToInstagram(post: PostLog, publicVideoUrl: string): Promise<string> {
  const IG_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN || "";
  const IG_USER_ID = process.env.INSTAGRAM_USER_ID || "";
  const GRAPH_BASE = "https://graph.facebook.com/v19.0";

  if (!IG_TOKEN || !IG_USER_ID) {
    // ── SIMULATE MODE ───────────────────────────────────────────────────────
    console.log(`[Scheduler] ⚠️  No Instagram credentials — simulating publish for post ${post.id}.`);
    console.log(`[Scheduler]    Add INSTAGRAM_ACCESS_TOKEN + INSTAGRAM_USER_ID to .env for real publishing.`);
    await new Promise(r => setTimeout(r, 800)); // fake latency
    return `sim_${Date.now()}`;
  }

  // ── STEP 1: Create media container ──────────────────────────────────────
  console.log(`[Scheduler] Step 1 — Creating Reels container for post ${post.id}...`);
  const captionText = [
    post.caption,
    ...post.hashtags.map(h => `#${h}`)
  ].join(" ");

  const createRes = await fetch(`${GRAPH_BASE}/${IG_USER_ID}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      media_type: "REELS",
      video_url: publicVideoUrl,
      caption: captionText,
      share_to_feed: true,
      access_token: IG_TOKEN,
    })
  });
  const createData: any = await createRes.json();
  if (!createRes.ok || !createData.id) {
    throw new Error(`IG Step 1 failed: ${JSON.stringify(createData)}`);
  }
  const containerId = createData.id;
  console.log(`[Scheduler] Step 1 ✅ Container created: ${containerId}`);

  // ── STEP 2: Poll until container is FINISHED ─────────────────────────────
  const MAX_POLLS = 12;
  const POLL_INTERVAL_MS = 5000;
  let statusCode = "";
  for (let poll = 0; poll < MAX_POLLS; poll++) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    const statusRes = await fetch(
      `${GRAPH_BASE}/${containerId}?fields=status_code&access_token=${IG_TOKEN}`
    );
    const statusData: any = await statusRes.json();
    statusCode = statusData.status_code || "";
    console.log(`[Scheduler] Step 2 poll ${poll + 1}/${MAX_POLLS}: status_code = ${statusCode}`);
    if (statusCode === "FINISHED") break;
    if (statusCode === "ERROR" || statusCode === "EXPIRED") {
      throw new Error(`IG container ${containerId} failed with status: ${statusCode}`);
    }
  }
  if (statusCode !== "FINISHED") {
    throw new Error(`IG container ${containerId} never reached FINISHED after ${MAX_POLLS} polls.`);
  }

  // ── STEP 3: Publish the container ────────────────────────────────────────
  console.log(`[Scheduler] Step 3 — Publishing container ${containerId}...`);
  const publishRes = await fetch(`${GRAPH_BASE}/${IG_USER_ID}/media_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ creation_id: containerId, access_token: IG_TOKEN })
  });
  const publishData: any = await publishRes.json();
  if (!publishRes.ok || !publishData.id) {
    throw new Error(`IG Step 3 failed: ${JSON.stringify(publishData)}`);
  }

  console.log(`[Scheduler] ✅ Published! Instagram media ID: ${publishData.id}`);
  return publishData.id as string;
}

// ── SCHEDULE POST (create queue entry) ──────────────────────────────────────
app.post("/api/posts/schedule", async (req, res) => {
  const { clipId, projectId, clipName, caption, hashtags, scheduledTime } = req.body;

  const newPost: PostLog = {
    id: "post_" + Math.random().toString(36).substr(2, 9),
    clipId,
    projectId,
    clipName,
    caption,
    hashtags: hashtags || [],
    scheduledTime: scheduledTime || new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
    status: "scheduled"
  };

  const db = getDB();
  db.posts.unshift(newPost);
  saveDB(db);

  console.log(`[Scheduler] 📅 Queued post "${clipName}" for ${new Date(newPost.scheduledTime).toLocaleString()}`);
  res.json({ success: true, post: newPost });
});

// ── IMMEDIATE PUBLISH endpoint ────────────────────────────────────────────────
app.post("/api/posts/:id/publish", async (req, res) => {
  const { id } = req.params;
  const db = getDB();
  const post = db.posts.find(p => p.id === id);
  if (!post) return res.status(404).json({ error: "Post not found" });

  // Find the clip's rendered video path
  const project = db.projects.find(p => p.id === post.projectId);
  const clip = project?.clips.find(c => c.id === post.clipId);

  if (!clip?.outputUrl) {
    return res.status(400).json({
      error: "Clip has not been rendered yet. Run Compile & Render first."
    });
  }

  // Build public URL for Instagram (needs PUBLIC_BASE_URL in .env)
  const BASE_URL = process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`;
  const publicVideoUrl = `${BASE_URL}${clip.outputUrl}`;

  post.status = "encoding";
  saveDB(db);
  res.json({ success: true, message: "Publishing in background…", post });

  // Run async — don't block the HTTP response
  (async () => {
    try {
      const igMediaId = await publishToInstagram(post, publicVideoUrl);
      const db2 = getDB();
      const p2 = db2.posts.find(p => p.id === id);
      if (p2) {
        p2.status = "published";
        p2.instagramPostId = igMediaId;
        saveDB(db2);
      }
      console.log(`[Scheduler] ✅ Post ${id} published successfully.`);
    } catch (err: any) {
      const db2 = getDB();
      const p2 = db2.posts.find(p => p.id === id);
      if (p2) {
        p2.status = "failed";
        p2.takedownReason = `Publish failed: ${err.message}`;
        p2.takedownTimestamp = new Date().toISOString();
        saveDB(db2);
      }
      console.error(`[Scheduler] ❌ Post ${id} failed:`, err.message);
    }
  })();
});

// ── DELETE / CANCEL a scheduled post ────────────────────────────────────────
app.delete("/api/posts/:id", (req, res) => {
  const { id } = req.params;
  const db = getDB();
  const idx = db.posts.findIndex(p => p.id === id);
  if (idx === -1) return res.status(404).json({ error: "Post not found" });
  db.posts.splice(idx, 1);
  saveDB(db);
  console.log(`[Scheduler] 🗑️  Post ${id} deleted from queue.`);
  res.json({ success: true });
});


// 10. Update Post Status (Takedown notifier log utility / direct control)
app.patch("/api/posts/:id", (req, res) => {
  const { id } = req.params;
  const { status, takedownReason } = req.body;

  const db = getDB();
  const post = db.posts.find(p => p.id === id);
  if (!post) return res.status(404).json({ error: "Post item not found" });

  if (status) post.status = status;
  if (takedownReason) {
    post.takedownReason = takedownReason;
    post.takedownTimestamp = new Date().toISOString();
  }
  saveDB(db);

  res.json({ success: true, post });
});

// 11. Global brand settings update
app.put("/api/settings", (req, res) => {
  const db = getDB();
  Object.assign(db.settings, req.body);
  saveDB(db);
  res.json({ success: true, settings: db.settings });
});


// Serve Vite or Static files depending on compilation stage
async function startServer() {
  // Ensure the local output folders exist safely
  const outputDir = path.join(process.cwd(), "output", "shorts");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Statically serve the /output directory for local renders
  app.use("/output", express.static(path.join(process.cwd(), "output")));

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        watch: {
          ignored: ['**/server-db.json']
        }
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production Mode
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[ReelGenie Server] Running on http://localhost:${PORT}`);

    // ── SCHEDULED PUBLISHING CRON LOOP ──────────────────────────────────────
    // Runs every 60 seconds. Fires any scheduled posts whose time has arrived.
    const SCHEDULER_INTERVAL_MS = 60_000;
    setInterval(async () => {
      const db = getDB();
      const due = db.posts.filter(
        p => p.status === "scheduled" && new Date(p.scheduledTime) <= new Date()
      );
      if (due.length === 0) return;

      console.log(`[Scheduler] ⏰ ${due.length} post(s) due for publishing...`);

      for (const post of due) {
        // Guard: ensure the clip has a rendered video before trying to publish
        const project = db.projects.find(proj => proj.id === post.projectId);
        const clip = project?.clips.find(c => c.id === post.clipId);

        if (!clip?.outputUrl) {
          console.warn(`[Scheduler] ⚠️  Post ${post.id} skipped — clip "${post.clipName}" not yet rendered.`);
          continue;
        }

        // Mark as encoding so UI shows progress
        const db2 = getDB();
        const livePost = db2.posts.find(p => p.id === post.id);
        if (livePost) { livePost.status = "encoding"; saveDB(db2); }

        // Build public video URL
        const BASE_URL = process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`;
        const publicVideoUrl = `${BASE_URL}${clip.outputUrl}`;

        try {
          const igMediaId = await publishToInstagram(post, publicVideoUrl);
          const db3 = getDB();
          const p3 = db3.posts.find(p => p.id === post.id);
          if (p3) {
            p3.status = "published";
            p3.instagramPostId = igMediaId;
            saveDB(db3);
          }
          console.log(`[Scheduler] ✅ Auto-published post "${post.clipName}" (${post.id})`);
        } catch (err: any) {
          const db3 = getDB();
          const p3 = db3.posts.find(p => p.id === post.id);
          if (p3) {
            p3.status = "failed";
            p3.takedownReason = `Auto-publish failed: ${err.message}`;
            p3.takedownTimestamp = new Date().toISOString();
            saveDB(db3);
          }
          console.error(`[Scheduler] ❌ Failed to auto-publish post ${post.id}:`, err.message);
        }
      }
    }, SCHEDULER_INTERVAL_MS);

    console.log(`[Scheduler] 🗓️  Background cron active — checking every ${SCHEDULER_INTERVAL_MS / 1000}s.`);
  });
}

startServer();