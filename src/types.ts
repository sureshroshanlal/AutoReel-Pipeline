export interface Subtitle {
  id: string;
  startTime: string;
  endTime: string;
  text: string;
}

export interface CropConfig {
  x: number; // 0 to 100 percentage layout center
  y: number;
  zoom: number; // 1.0 to 2.0
  colorCorrection: {
    brightness: number;
    contrast: number;
    saturation: number;
  };
}

export interface Clip {
  id: string;
  name: string;
  startTime: string;
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
}

export interface VideoProject {
  id: string;
  youtubeUrl: string;
  title: string;
  thumbnailUrl: string;
  duration: string;
  clips: Clip[];
  createdAt: string;
}

export interface PostLog {
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

export interface Settings {
  instagramEnabled: boolean;
  watermarkText: string;
  watermarkPos: string;
  stingerLength: number;
  resolution: string;
  bitrate: string;
}
