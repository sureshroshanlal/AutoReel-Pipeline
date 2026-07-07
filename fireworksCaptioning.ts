// fireworksCaptioning.ts
// Real ASR + multi-language localization for AutoReel-Pipeline, powered by
// Fireworks AI (running on AMD Instinct GPUs) — AMD Developer Hackathon: ACT II
//
// Replaces the old "Gemini simulates plausible subtitles from the title" flow
// with genuine Whisper transcription of the actual clip audio, plus optional
// translation into other languages using a Fireworks-hosted LLM.

import path from "path";
import fs from "fs";
import { exec } from "child_process";

const FIREWORKS_API_KEY = process.env.FIREWORKS_API_KEY || "";

// Fireworks deprecated the old api.fireworks.ai audio route in June 2026.
// Current serverless endpoints (per Fireworks docs, July 2026):
//   whisper-v3        -> https://audio-prod.api.fireworks.ai
//   whisper-v3-turbo  -> https://audio-turbo.api.fireworks.ai
const FIREWORKS_AUDIO_BASE = "https://audio-turbo.api.fireworks.ai/v1/audio/transcriptions";
const FIREWORKS_CHAT_URL = "https://api.fireworks.ai/inference/v1/chat/completions";
const FIREWORKS_TRANSLATE_MODEL = "accounts/fireworks/models/llama-v3p1-8b-instruct";

export interface Subtitle {
  id: string;
  startTime: string; // "00:00:02"
  endTime: string;   // "00:00:08"
  text: string;
}

function runCmd(cmd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(cmd, (error, stdout, stderr) => {
      if (error) reject(new Error(stderr || stdout || error.message));
      else resolve(stdout);
    });
  });
}

function secToClock(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds);
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = Math.floor(s % 60);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(hh)}:${pad(mm)}:${pad(ss)}`;
}

// SRT timestamps look like 00:01:02,500 — convert to seconds
function srtTimeToSeconds(t: string): number {
  const [hms, ms] = t.trim().split(",");
  const [hh, mm, ss] = hms.split(":").map(Number);
  return hh * 3600 + mm * 60 + ss + (Number(ms || 0) / 1000);
}

/**
 * Extract a mono 16kHz WAV of just the clip's time range directly from the
 * source YouTube URL. Reuses yt-dlp + ffmpeg already present in this project,
 * but pulls audio only (much faster than a full video download).
 */
export async function extractClipAudio(
  youtubeUrl: string,
  startTime: string,
  endTime: string,
  tempDir: string,
  clipId: string
): Promise<string> {
  const YTDLP_PATH = `"${path.join(process.cwd(), "yt-dlp.exe")}"`;
  const FFMPEG_PATH = `"C:\\ffmpeg\\bin\\ffmpeg.exe"`;

  const rawAudioPath = path.join(tempDir, `raw_audio_${clipId}.m4a`);
  const wavPath = path.join(tempDir, `asr_${clipId}.wav`);

  if (fs.existsSync(rawAudioPath)) fs.unlinkSync(rawAudioPath);
  if (fs.existsSync(wavPath)) fs.unlinkSync(wavPath);

  // 1. Pull just the audio for the clip's time range
  const ytdlCmd = `${YTDLP_PATH} --js-runtimes node -f "bestaudio[ext=m4a]/bestaudio" --download-sections "*${startTime}-${endTime}" --ffmpeg-location ${FFMPEG_PATH} "${youtubeUrl}" -o "${rawAudioPath}"`;
  await runCmd(ytdlCmd);

  if (!fs.existsSync(rawAudioPath)) {
    throw new Error("yt-dlp failed to extract clip audio for transcription.");
  }

  // 2. Fireworks recommends pre-converting to 16kHz mono 16-bit PCM for best
  //    performance — do that conversion ourselves rather than relying on
  //    their server-side resample step.
  const convertCmd = `${FFMPEG_PATH} -y -i "${rawAudioPath}" -ar 16000 -ac 1 -c:a pcm_s16le "${wavPath}"`;
  await runCmd(convertCmd);

  if (!fs.existsSync(wavPath)) {
    throw new Error("FFmpeg failed to convert clip audio to 16kHz mono WAV.");
  }

  try { fs.unlinkSync(rawAudioPath); } catch {}

  return wavPath;
}

/**
 * Send a WAV file to Fireworks Whisper (whisper-v3-turbo, on AMD Instinct
 * GPUs) and get back real, timestamped subtitles as SRT, parsed into our
 * Subtitle[] shape.
 */
export async function transcribeClipAudio(
  audioPath: string,
  opts: { language?: string } = {}
): Promise<Subtitle[]> {
  if (!FIREWORKS_API_KEY) {
    throw new Error("FIREWORKS_API_KEY is not set in .env");
  }

  const fileBuffer = fs.readFileSync(audioPath);
  const form = new FormData();
  form.append(
    "file",
    new Blob([fileBuffer], { type: "audio/wav" }),
    path.basename(audioPath)
  );
  form.append("model", "whisper-v3-turbo");
  form.append("response_format", "srt");
  form.append("vad_model", "silero");
  if (opts.language) form.append("language", opts.language);

  const res = await fetch(FIREWORKS_AUDIO_BASE, {
    method: "POST",
    headers: { Authorization: FIREWORKS_API_KEY },
    body: form,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Fireworks transcription failed (${res.status}): ${errText}`);
  }

  const srtText = await res.text();
  return parseSrt(srtText);
}

/** Parse standard SRT text into our Subtitle[] shape. */
function parseSrt(srt: string): Subtitle[] {
  const blocks = srt
    .replace(/\r/g, "")
    .split(/\n\n+/)
    .map((b) => b.trim())
    .filter(Boolean);

  const subtitles: Subtitle[] = [];

  for (const block of blocks) {
    const lines = block.split("\n");
    // lines[0] = index, lines[1] = "00:00:01,000 --> 00:00:04,000", rest = text
    const timeLine = lines[1];
    if (!timeLine || !timeLine.includes("-->")) continue;

    const [startRaw, endRaw] = timeLine.split("-->").map((s) => s.trim());
    const text = lines.slice(2).join(" ").trim();
    if (!text) continue;

    subtitles.push({
      id: `s_fw_${Date.now()}_${subtitles.length}`,
      startTime: secToClock(srtTimeToSeconds(startRaw)),
      endTime: secToClock(srtTimeToSeconds(endRaw)),
      text,
    });
  }

  return subtitles;
}

/**
 * Localize an existing subtitle track into another language using a
 * Fireworks-hosted LLM. Timing is preserved exactly; only text changes.
 */
export async function translateSubtitles(
  subtitles: Subtitle[],
  targetLanguage: string
): Promise<Subtitle[]> {
  if (!FIREWORKS_API_KEY) {
    throw new Error("FIREWORKS_API_KEY is not set in .env");
  }
  if (subtitles.length === 0) return [];

  const prompt = `Translate each of the following short video caption lines into ${targetLanguage}.
Keep translations short, punchy, and natural for social media captions — do not translate literally word-for-word if a more natural phrasing exists.
Return ONLY a JSON array of strings, same length and order as the input, no extra commentary.

Input lines:
${JSON.stringify(subtitles.map((s) => s.text))}`;

  const res = await fetch(FIREWORKS_CHAT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${FIREWORKS_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: FIREWORKS_TRANSLATE_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Fireworks translation failed (${res.status}): ${errText}`);
  }

  const data: any = await res.json();
  const raw = data?.choices?.[0]?.message?.content || "[]";

  let translated: string[];
  try {
    const parsed = JSON.parse(raw);
    // Model may wrap the array in an object; handle both shapes defensively.
    translated = Array.isArray(parsed) ? parsed : parsed.translations || parsed.lines || [];
  } catch {
    translated = [];
  }

  return subtitles.map((s, i) => ({
    ...s,
    id: `${s.id}_${targetLanguage}`,
    text: translated[i] || s.text,
  }));
}
