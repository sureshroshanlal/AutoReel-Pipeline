// fireworksCaptioning.ts
// Real ASR + multi-language localization for AutoReel-Pipeline, powered by
// Fireworks AI (running on AMD Instinct GPUs) — AMD Developer Hackathon: ACT II

import path from "path";
import fs from "fs";
import { exec } from "child_process";
import { GoogleGenAI } from "@google/genai";

// Fireworks deprecated the old api.fireworks.ai audio route in June 2026.
// Current serverless endpoints (per Fireworks docs, July 2026):
//   whisper-v3        -> https://audio-prod.api.fireworks.ai
//   whisper-v3-turbo  -> https://audio-turbo.api.fireworks.ai
const FIREWORKS_AUDIO_BASE = "https://api.fireworks.ai/inference/v1/audio/transcriptions";
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
  const parts = t.trim().split(/[^0-9]/).filter(p => p !== "");
  if (parts.length === 0) return 0;

  if (parts.length === 4) {
    const hh = Number(parts[0]);
    const mm = Number(parts[1]);
    const ss = Number(parts[2]);
    const ms = Number(parts[3]);
    return hh * 3600 + mm * 60 + ss + ms / 1000;
  }

  if (parts.length === 3) {
    const lastPart = parts[2];
    if (lastPart.length === 3 || Number(lastPart) > 59) {
      const mm = Number(parts[0]);
      const ss = Number(parts[1]);
      const ms = Number(parts[2]);
      return mm * 60 + ss + ms / 1000;
    } else {
      const hh = Number(parts[0]);
      const mm = Number(parts[1]);
      const ss = Number(parts[2]);
      return hh * 3600 + mm * 60 + ss;
    }
  }

  if (parts.length === 2) {
    const lastPart = parts[1];
    if (lastPart.length === 3) {
      const ss = Number(parts[0]);
      const ms = Number(parts[1]);
      return ss + ms / 1000;
    } else {
      const mm = Number(parts[0]);
      const ss = Number(parts[1]);
      return mm * 60 + ss;
    }
  }

  return Number(parts[0]) || 0;
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
  // Configurable via .env — see the render endpoint in server.ts for the
  // same convention. Falls back to PATH-resolved binaries if unset.
  const YTDLP_PATH = `"${process.env.YTDLP_PATH || path.join(process.cwd(), "yt-dlp.exe")}"`;
  const FFMPEG_PATH = `"${process.env.FFMPEG_PATH || "ffmpeg"}"`;
  // Only pass --ffmpeg-location when the user explicitly set FFMPEG_PATH.
  // yt-dlp does its own PATH auto-detection when this flag is omitted, but
  // given a bare command name it does a literal file-existence check and fails.
  const ffmpegLocationFlag = process.env.FFMPEG_PATH ? `--ffmpeg-location ${FFMPEG_PATH}` : "";

  const rawAudioPath = path.join(tempDir, `raw_audio_${clipId}.m4a`);
  const wavPath = path.join(tempDir, `asr_${clipId}.wav`);

  if (fs.existsSync(rawAudioPath)) fs.unlinkSync(rawAudioPath);
  if (fs.existsSync(wavPath)) fs.unlinkSync(wavPath);

  // 1. Pull the entire audio track for the video
  const ytdlCmd = `${YTDLP_PATH} --js-runtimes node -f "bestaudio[ext=m4a]/bestaudio" ${ffmpegLocationFlag} "${youtubeUrl}" -o "${rawAudioPath}"`;
  await runCmd(ytdlCmd);

  if (!fs.existsSync(rawAudioPath)) {
    throw new Error("yt-dlp failed to extract clip audio for transcription.");
  }

  // 2. Crop and convert to 16kHz mono 16-bit PCM WAV using FFmpeg
  const convertCmd = `${FFMPEG_PATH} -y -ss ${startTime} -to ${endTime} -i "${rawAudioPath}" -ar 16000 -ac 1 -c:a pcm_s16le "${wavPath}"`;
  await runCmd(convertCmd);

  if (!fs.existsSync(wavPath)) {
    throw new Error("FFmpeg failed to convert clip audio to 16kHz mono WAV.");
  }

  try { fs.unlinkSync(rawAudioPath); } catch { }

  return wavPath;
}

let currentKeyIndex = 0;

/** Retrieves a Gemini client using key rotation. */
export function getGeminiClient(attemptOffset = 0): { client: GoogleGenAI; keyIndex: number; apiKey: string } {
  const keysStr = process.env.GEMINI_API_KEY || "";
  const keys = keysStr.split(",").map(k => k.trim()).filter(Boolean);
  if (keys.length === 0) {
    throw new Error("GEMINI_API_KEY is not set in .env");
  }
  const index = (currentKeyIndex + attemptOffset) % keys.length;
  const apiKey = keys[index];
  const client = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
  return { client, keyIndex: index, apiKey };
}

/** Moves the starting key index forward by one. */
export function rotateGeminiKey(): void {
  const keysStr = process.env.GEMINI_API_KEY || "";
  const keys = keysStr.split(",").map(k => k.trim()).filter(Boolean);
  if (keys.length > 0) {
    currentKeyIndex = (currentKeyIndex + 1) % keys.length;
  }
}

/**
 * Send a WAV file to Google Gemini for transcription (with key rotation and fallbacks)
 * and get back real, timestamped subtitles as SRT, parsed into our Subtitle[] shape.
 */
export async function transcribeClipAudio(
  audioPath: string,
  opts: { language?: string } = {}
): Promise<Subtitle[]> {
  const keysStr = process.env.GEMINI_API_KEY || "";
  const keys = keysStr.split(",").map(k => k.trim()).filter(Boolean);
  if (keys.length === 0) {
    throw new Error("GEMINI_API_KEY is not set in .env");
  }

  const retries = 3;
  const delayMs = 1000;
  let lastError: any = null;

  for (let attempt = 0; attempt < retries; attempt++) {
    let clientInfo;
    try {
      clientInfo = getGeminiClient(attempt);
    } catch (err: any) {
      throw new Error("Gemini ASR client configuration failed: " + err.message);
    }

    const { client: ai, keyIndex, apiKey } = clientInfo;
    const maskedKey = apiKey ? `${apiKey.substring(0, 6)}...` : 'none';
    let uploadResult: any = null;

    try {
      if (attempt > 0) {
        const backoff = delayMs * Math.pow(2.5, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, backoff));
        console.log(`[Gemini ASR] Retrying transcription (attempt ${attempt + 1}/${retries}) using key index ${keyIndex}...`);
      }

      console.log(`[Gemini ASR] Uploading audio file for transcription using key index ${keyIndex}: ${audioPath}`);
      uploadResult = await ai.files.upload({
        file: audioPath,
        config: {
          mimeType: "audio/wav",
        }
      });

      console.log(`[Gemini ASR] Generating SRT subtitles using gemini-3.1-flash-lite on key index ${keyIndex}...`);
      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-lite",
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `Please transcribe the audio and generate SRT formatted subtitles. 
Ensure each subtitle block has:
1. An index number (starting from 1)
2. Start and end times in SRT format (HH:MM:SS,mmm)
3. The transcribed text
Ensure output is ONLY the raw SRT subtitle content. Do not include markdown code block formatting (e.g. \`\`\`srt) or any introductory/concluding text.`
              },
              {
                fileData: {
                  fileUri: uploadResult.uri,
                  mimeType: uploadResult.mimeType,
                }
              }
            ]
          }
        ]
      });

      let srtText = response.text || "";
      srtText = srtText.trim();
      if (srtText.startsWith("```")) {
        srtText = srtText.replace(/^```[a-zA-Z]*\n/, "");
        srtText = srtText.replace(/\n```$/, "");
      }

      console.log(`[Gemini ASR] ✅ Transcription generated successfully.`);

      // Rotate keys permanently to the successful one
      if (attempt > 0) {
        for (let k = 0; k < attempt; k++) {
          rotateGeminiKey();
        }
      }

      // Cleanup uploaded file asynchronously
      ai.files.delete({ name: uploadResult.name }).catch((err) => {
        console.warn("[Gemini ASR] Failed to clean up file from Gemini workspace:", err.message || err);
      });

      return parseSrt(srtText);
    } catch (err: any) {
      lastError = err;
      console.warn(`[Gemini ASR] Attempt ${attempt + 1} failed with key ${maskedKey}:`, err.message || err);

      // Clean up file if uploaded on this key
      if (uploadResult && uploadResult.name) {
        ai.files.delete({ name: uploadResult.name }).catch(() => {});
      }
    }
  }

  // If primary model transcription failed entirely, we attempt fallback model: gemini-3.5-flash!
  console.warn(`[Gemini ASR] Primary model transcription failed with all keys/retries. Attempting fallback model gemini-3.5-flash...`);
  rotateGeminiKey();
  let fallbackClientInfo;
  try {
    fallbackClientInfo = getGeminiClient(0);
  } catch (e) {
    throw lastError;
  }
  const { client: ai, keyIndex, apiKey } = fallbackClientInfo;
  const maskedKey = apiKey ? `${apiKey.substring(0, 6)}...` : 'none';
  let uploadResult: any = null;

  try {
    console.log(`[Gemini ASR Fallback] Uploading audio using fallback client (key index ${keyIndex}): ${audioPath}`);
    uploadResult = await ai.files.upload({
      file: audioPath,
      config: {
        mimeType: "audio/wav",
      }
    });

    console.log(`[Gemini ASR Fallback] Generating SRT using gemini-3.5-flash on key index ${keyIndex}...`);
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `Please transcribe the audio and generate SRT formatted subtitles. 
Ensure each subtitle block has:
1. An index number (starting from 1)
2. Start and end times in SRT format (HH:MM:SS,mmm)
3. The transcribed text
Ensure output is ONLY the raw SRT subtitle content. Do not include markdown code block formatting (e.g. \`\`\`srt) or any introductory/concluding text.`
            },
            {
              fileData: {
                fileUri: uploadResult.uri,
                mimeType: uploadResult.mimeType,
              }
            }
          ]
        }
      ]
    });

    let srtText = response.text || "";
    srtText = srtText.trim();
    if (srtText.startsWith("```")) {
      srtText = srtText.replace(/^```[a-zA-Z]*\n/, "");
      srtText = srtText.replace(/\n```$/, "");
    }

    console.log(`[Gemini ASR Fallback] ✅ Fallback transcription generated successfully.`);

    ai.files.delete({ name: uploadResult.name }).catch((err) => {
      console.warn("[Gemini ASR Fallback] Failed to clean up file from Gemini workspace:", err.message || err);
    });

    return parseSrt(srtText);
  } catch (err: any) {
    if (uploadResult && uploadResult.name) {
      ai.files.delete({ name: uploadResult.name }).catch(() => {});
    }
    console.error(`[Gemini ASR Fallback] Fallback model also failed with key ${maskedKey}:`, err.message || err);
    throw lastError || err;
  }
}

/** Parse standard SRT text into our Subtitle[] shape. */
function parseSrt(srt: string): Subtitle[] {
  const lines = srt.replace(/\r/g, "").split("\n").map(l => l.trim());
  const subtitles: Subtitle[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.includes("-->")) {
      const timeLine = line;
      const [startRaw, endRaw] = timeLine.split("-->").map(s => s.trim());

      const textLines: string[] = [];
      let j = i + 1;
      while (j < lines.length) {
        const nextLine = lines[j];
        if (!nextLine) {
          break;
        }
        if (nextLine.includes("-->")) {
          if (textLines.length > 0) {
            if (/^\d+$/.test(textLines[textLines.length - 1])) {
              textLines.pop();
            }
          }
          j--;
          break;
        }
        textLines.push(nextLine);
        j++;
      }

      const text = textLines.join(" ").trim();
      if (text) {
        subtitles.push({
          id: `s_fw_${Date.now()}_${subtitles.length}`,
          startTime: secToClock(srtTimeToSeconds(startRaw)),
          endTime: secToClock(srtTimeToSeconds(endRaw)),
          text,
        });
      }
      i = j + 1;
    } else {
      i++;
    }
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
  const FIREWORKS_API_KEY = process.env.FIREWORKS_API_KEY || "";
  if (!FIREWORKS_API_KEY) {
    throw new Error("FIREWORKS_API_KEY is not set in .env");
  }
  if (subtitles.length === 0) return [];

  const prompt = `Translate each of the following short video caption lines into ${targetLanguage}.
Keep translations short, punchy, and natural for social media captions — do not translate literally word-for-word if a more natural phrasing exists.
Return ONLY a JSON object of the form {"translations": ["line1", "line2", ...]}, with exactly ${subtitles.length} strings in the same order as the input. No extra commentary.

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
  const raw = data?.choices?.[0]?.message?.content || "{}";

  let translated: string[];
  try {
    const parsed = JSON.parse(raw);
    // Model may wrap the array in an object; handle both shapes defensively.
    translated = Array.isArray(parsed) ? parsed : parsed.translations || parsed.lines || [];
    if (translated.length === 0) {
      console.warn(`[Fireworks Localize] Parsed response had no usable translations. Raw content: ${raw}`);
    }
  } catch (e) {
    console.error(`[Fireworks Localize] Failed to parse model response as JSON. Raw content: ${raw}`);
    translated = [];
  }

  return subtitles.map((s, i) => ({
    ...s,
    id: `${s.id}_${targetLanguage}`,
    text: translated[i] || s.text,
  }));
}