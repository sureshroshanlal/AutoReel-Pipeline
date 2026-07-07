import React, { useState, useEffect } from "react";
import { Maximize2, Zap, Palette, Move, Sparkles, Wand2 } from "lucide-react";
import { Clip } from "../types";

interface VisualReframeProps {
  activeClip: Clip | null;
  youtubeId: string;
  thumbnailUrl?: string;
  onUpdateClip: (updatedParams: Partial<Clip>) => void;
}

export default function VisualReframe({ activeClip, youtubeId, thumbnailUrl, onUpdateClip }: VisualReframeProps) {
  if (!activeClip) {
    return (
      <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-xl flex flex-col items-center justify-center text-center py-24">
        <Maximize2 className="w-12 h-12 text-slate-500 mb-3" />
        <p className="text-sm font-bold text-white">No clip chosen for reframing.</p>
        <p className="text-xs text-slate-400 mt-1">Select or cut a timing clip first on the timeline panel.</p>
      </div>
    );
  }

  const { verticalCrop, overlayText } = activeClip;
  const [speedTemplate, setSpeedTemplate] = useState("normal");
  const [stabilizePreset, setStabilizePreset] = useState("medium");

  const updateCropField = (field: string, val: any) => {
    onUpdateClip({
      verticalCrop: {
        ...verticalCrop,
        [field]: val
      }
    });
  };

  const updateColorCorrection = (field: string, val: number) => {
    onUpdateClip({
      verticalCrop: {
        ...verticalCrop,
        colorCorrection: {
          ...verticalCrop.colorCorrection,
          [field]: val
        }
      }
    });
  };

  // Generate simulated CSS filters based on color correction states
  const filterStyle = `
    brightness(${100 + verticalCrop.colorCorrection.brightness}%)
    contrast(${100 + verticalCrop.colorCorrection.contrast}%)
    saturate(${100 + verticalCrop.colorCorrection.saturation}%)
  `;

  // Calculate left offset to shift a 16:9 widescreen video behind a 9:16 vertical view mask
  // Base widescreen width = zoom * 100%, vertical viewport width is 56.25% of that
  // Let the user shift crop.x (0 to 100)
  const videoTranslateX = -((verticalCrop.x / 100) * (300 * verticalCrop.zoom - 168.75));

  return (
    <div id="visual-reframe-widget" className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-xl h-full">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-sm font-bold text-white font-display">Crop, Reframe & Stylize</h2>
          <p className="text-xs text-slate-400">Repurpose 16:9 landscape video into vertical 9:16</p>
        </div>
        <Move className="w-5 h-5 text-slate-400" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Device Mask / 9:16 Canvas Simulation */}
        <div className="lg:col-span-5 flex flex-col items-center">
          <div className="relative w-[180px] h-[320px] rounded-[24px] border-[5px] border-slate-800 bg-black overflow-hidden shadow-2xl flex items-center justify-center">
            {/* Horizontal translate window matching vertical viewport */}
            <div className="absolute inset-0 overflow-hidden flex items-center justify-center">
              <div
                className="absolute h-full aspect-video bg-cover bg-center transition-all duration-150"
                style={{
                  transform: `scale(${verticalCrop.zoom}) translateX(${videoTranslateX}px)`,
                  backgroundImage: `url('${thumbnailUrl || "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800&auto=format&fit=crop"}')`,
                  filter: filterStyle,
                  width: `calc(100% * 1.777)`
                }}
              />
              
              {/* Dynamic Subtitle overlay projection inside the crop preview */}
              <div className="absolute bottom-10 left-2 right-2 text-center pointer-events-none px-2">
                <span className="bg-black/90 text-yellow-300 font-black text-[9px] tracking-wide uppercase px-2 py-1 rounded shadow-md border border-yellow-500/40 block">
                  {overlayText ? overlayText : "🔥 LIVE SUBTITLES ACTIVE 🔥"}
                </span>
              </div>

              {/* Watermark preview icon inside mockup top-right */}
              {activeClip.watermarkEnabled && (
                <div className="absolute top-2 right-2 px-1 rounded bg-black/40 backdrop-blur-xs border border-white/20 text-[8px] font-bold text-white uppercase pointer-events-none">
                  @CREATOR
                </div>
              )}

              {/* Composition Guidelines grid overlay toggleable */}
              <div className="absolute inset-0 pointer-events-none border border-white/10 grid grid-cols-3 grid-rows-3">
                <div className="border-r border-b border-white/5" />
                <div className="border-r border-b border-white/5" />
                <div className="border-b border-white/5" />
                <div className="border-r border-b border-white/5" />
                <div className="border-r border-b border-white/5" />
                <div className="border-b border-white/5" />
              </div>
            </div>
          </div>
          <span className="text-[10px] text-slate-400 mt-2 font-bold font-display">Instagram Reels Preview (9:16)</span>
        </div>

        {/* Reframing/Zoom Coordinates & Color Correction Sliders */}
        <div className="lg:col-span-7 space-y-4">
          <div className="space-y-3">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1.5 tracking-wider font-display">
              <Wand2 className="w-3.5 h-3.5 text-indigo-400" />
              <span>Composition controls</span>
            </h3>

            {/* Horizontal center Shift */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-300">Reframe Center (Pan horizontal)</span>
                <span className="font-mono text-indigo-400 font-bold">{verticalCrop.x}%</span>
              </div>
              <input
                id="crop-x-slider"
                type="range"
                min="0"
                max="100"
                value={verticalCrop.x}
                onChange={(e) => updateCropField("x", Number(e.target.value))}
                className="w-full accent-indigo-500 cursor-pointer"
              />
            </div>

            {/* Visual Zoom multiplier */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-300">Focal Zoom & Crop</span>
                <span className="font-mono text-indigo-400 font-bold">{verticalCrop.zoom.toFixed(1)}x</span>
              </div>
              <input
                id="crop-zoom-slider"
                type="range"
                min="1.0"
                max="2.0"
                step="0.1"
                value={verticalCrop.zoom}
                onChange={(e) => updateCropField("zoom", Number(e.target.value))}
                className="w-full accent-indigo-500 cursor-pointer"
              />
            </div>
          </div>

          <hr className="border-white/10" />

          <div className="space-y-3">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1.5 tracking-wider font-display">
              <Palette className="w-3.5 h-3.5 text-indigo-400" />
              <span>Color Correction Filters</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-slate-400">Brightness</span>
                  <span className="text-indigo-400 font-bold font-mono">{verticalCrop.colorCorrection.brightness > 0 ? "+" : ""}{verticalCrop.colorCorrection.brightness}</span>
                </div>
                <input
                  id="cc-brightness"
                  type="range"
                  min="-50"
                  max="50"
                  value={verticalCrop.colorCorrection.brightness}
                  onChange={(e) => updateColorCorrection("brightness", Number(e.target.value))}
                  className="w-full accent-indigo-500"
                />
              </div>

              <div>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-slate-400">Contrast</span>
                  <span className="text-indigo-400 font-bold font-mono">{verticalCrop.colorCorrection.contrast > 0 ? "+" : ""}{verticalCrop.colorCorrection.contrast}</span>
                </div>
                <input
                  id="cc-contrast"
                  type="range"
                  min="-50"
                  max="50"
                  value={verticalCrop.colorCorrection.contrast}
                  onChange={(e) => updateColorCorrection("contrast", Number(e.target.value))}
                  className="w-full accent-indigo-500"
                />
              </div>

              <div>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-slate-400">Saturation</span>
                  <span className="text-indigo-400 font-bold font-mono">{verticalCrop.colorCorrection.saturation > 0 ? "+" : ""}{verticalCrop.colorCorrection.saturation}</span>
                </div>
                <input
                  id="cc-sat"
                  type="range"
                  min="-50"
                  max="50"
                  value={verticalCrop.colorCorrection.saturation}
                  onChange={(e) => updateColorCorrection("saturation", Number(e.target.value))}
                  className="w-full accent-indigo-500"
                />
              </div>
            </div>
          </div>

          <hr className="border-white/10" />

          {/* Speed Ramping Template, stabilization, etc */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1.5 mb-1.5 tracking-wider font-display">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span>Speed Ramp</span>
              </label>
              <select
                id="speed-template-select"
                value={speedTemplate}
                onChange={(e) => setSpeedTemplate(e.target.value)}
                className="w-full text-xs bg-black/40 border border-white/10 text-white rounded-lg px-2.5 py-1.5 focus:outline-hidden"
              >
                <option value="normal" className="bg-slate-900 text-white">Normal (1.0x)</option>
                <option value="ramp-in" className="bg-slate-900 text-white">Hook Jump (1.3x Hook -&gt; 1.0x)</option>
                <option value="boost" className="bg-slate-900 text-white">Viral Velocity (1.15x throughout)</option>
                <option value="cinematic" className="bg-slate-900 text-white">Cinematic Ramp (0.8x -&gt; 1.3x)</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1.5 mb-1.5 tracking-wider font-display">
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                <span>Stabilization</span>
              </label>
              <select
                id="stabilize-select"
                value={stabilizePreset}
                onChange={(e) => setStabilizePreset(e.target.value)}
                className="w-full text-xs bg-black/40 border border-white/10 text-white rounded-lg px-2.5 py-1.5 focus:outline-hidden"
              >
                <option value="none" className="bg-slate-900 text-white">None (Raw camera)</option>
                <option value="low" className="bg-slate-900 text-white">Subtle (FFmpeg deshk)</option>
                <option value="medium" className="bg-slate-900 text-white">Medium (Motion Compensated)</option>
                <option value="ultra" className="bg-slate-900 text-white">Ultra Steady (Re-centered lock)</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
