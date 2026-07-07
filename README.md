<div align="center">

# AutoReel-Pipeline (ReelGenie)

**Automated YouTube-to-Shorts pipeline with real AI transcription, multi-language localization, and auto-publishing.**

Built for the [AMD Developer Hackathon: ACT II](https://lablab.ai/ai-hackathons/amd-developer-hackathon-act-ii) — Video Captioning Track

</div>

---

## What this does

AutoReel-Pipeline takes a long-form YouTube video, lets you pick out highlight moments, and turns each one into a fully-produced vertical short — cropped, captioned, watermarked, and ready to publish to Instagram Reels, TikTok, and YouTube Shorts — with almost no manual editing.

1. **Import** a YouTube video by URL.
2. **Select clips** — mark start/end times, set vertical crop/zoom/color correction.
3. **Auto-Transcribe** — real speech-to-text on the clip's actual audio (not a guess from the title).
4. **Localize** — one click to translate the real captions into another language for a global audience.
5. **Render** — FFmpeg crops to 9:16, burns in captions/overlay text/watermark, mixes audio.
6. **Publish / Schedule** — push straight to Instagram via the Graph API, or queue for later.

## AMD Hackathon: what's powered by Fireworks AI

This project's **Video Captioning** track submission centers on replacing a fake captioning shortcut with a real one:

- **Before:** subtitles were invented by an LLM guessing plausible lines from the video's title — never touching the actual audio.
- **Now:** clip audio is extracted and sent to **Fireworks AI's `whisper-v3-turbo`** model (served on AMD Instinct GPUs) for genuine, timestamped transcription.
- **New feature:** a **localization** endpoint translates the real transcript into any target language via a Fireworks-hosted LLM, with timing preserved exactly — so one recorded clip can ship as captioned content in multiple languages with one extra click.

See [`fireworksCaptioning.ts`](./fireworksCaptioning.ts) for the integration, and the `/transcribe` and `/localize` routes in [`server.ts`](./server.ts).

## Features

- YouTube video import and clip management (multiple clips per video)
- Vertical (9:16) auto-crop with adjustable zoom, position, and color correction
- Real AI transcription via Fireworks Whisper (`whisper-v3-turbo`)
- Multi-language caption localization via Fireworks LLM
- Optional TTS voice-over generation from captions (mute original audio)
- AI-suggested captions, hashtags, and trending audio pairing (Gemini)
- Transcript summarization
- FFmpeg rendering pipeline: crop, drawtext overlays, watermark, audio mixing
- Instagram Reels publishing (Graph API) with a background scheduler/cron
- Simple JSON-file project database — no external DB required

## Tech stack

Node.js, Express, TypeScript, Vite + React (frontend), FFmpeg, yt-dlp, Fireworks AI (Whisper transcription + LLM translation, AMD Instinct GPUs), Google Gemini (copywriting/summaries).

## Prerequisites

- Node.js 18+
- `ffmpeg` installed and on your PATH (or set `FFMPEG_PATH` in `.env` to point at it)
- `yt-dlp` installed (or set `YTDLP_PATH` in `.env` to point at it — defaults to `yt-dlp.exe` in the project root for backward compatibility)
- A [Fireworks AI](https://fireworks.ai) API key
- A [Google Gemini](https://ai.google.dev) API key (for copywriting/summary features)
- (Optional) Instagram Graph API access token, for auto-publishing

## Setup

1. Install dependencies:
   ```
   npm install
   ```
2. Copy the example env file and fill in your keys:
   ```
   cp .env.example .env
   ```
   Required:
   - `GEMINI_API_KEY` — for copywriting/summary features
   - `FIREWORKS_API_KEY` — for real transcription and localization
   
   Optional:
   - `INSTAGRAM_ACCESS_TOKEN` — for auto-publishing
   - `YOUTUBE_API_KEY` — for pulling structured video metadata
   - `FFMPEG_PATH` / `YTDLP_PATH` — only needed if those binaries aren't already resolvable on your PATH

3. Run the app:
   ```
   npm run dev
   ```
   The app runs at `http://localhost:3000`.

## Building for production

```
npm run build
npm start
```

## License

MIT — see [LICENSE](./LICENSE).