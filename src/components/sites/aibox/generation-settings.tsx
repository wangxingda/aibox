"use client";

import { Clock3, Monitor, RectangleHorizontal } from "lucide-react";
import "./generation-settings.css";

type GenerationSettingsProps = {
  kind: "image" | "video";
  quality: string;
  ratio: string;
  duration: string;
  fixedResolution: boolean;
  resolutionLabel: string;
  supportedQualities: string[];
  supportedRatios: string[];
  supportedDurations: string[];
  onQualityChange: (quality: string) => void;
  onRatioChange: (ratio: string) => void;
  onDurationChange: (duration: string) => void;
};

export function GenerationSettings({ kind, quality, ratio, duration, fixedResolution, resolutionLabel, supportedQualities, supportedRatios, supportedDurations, onQualityChange, onRatioChange, onDurationChange }: GenerationSettingsProps) {
  return <div className="generation-settings" aria-label="生成参数设置">
    <section className="generation-settings-group">
      <h3><Monitor size={15} aria-hidden="true"/>分辨率</h3>
      {fixedResolution ? <div className="fixed-resolution"><span>工作流固定</span><p className="generation-settings-note">{resolutionLabel}</p></div> : <div className="resolution-options">{supportedQualities.map(option => <button type="button" key={option} className={`settings-option resolution-option${quality === option ? " selected" : ""}`} aria-pressed={quality === option} onClick={() => onQualityChange(option)}>{option}</button>)}</div>}
    </section>
    <section className="generation-settings-group">
      <h3><RectangleHorizontal size={15} aria-hidden="true"/>比例</h3>
      {!supportedRatios.length && <p className="generation-settings-note">由工作流或输入素材决定</p>}
      <div className="ratio-options">{supportedRatios.map(option => <button type="button" key={option} className={`settings-option ratio-option${ratio === option ? " selected" : ""}`} aria-pressed={ratio === option} onClick={() => onRatioChange(option)}><span className={`ratio-icon ratio-icon-${option.replace(":", "-").toLowerCase()}`} aria-hidden="true"/><span>{option}</span></button>)}</div>
    </section>
    {kind === "video" && <section className="generation-settings-group">
      <h3><Clock3 size={15} aria-hidden="true"/>时长</h3>
      <p className="generation-settings-note">{supportedDurations.length ? "标称时长，实际时长受工作流帧数取整影响" : "按驱动视频帧数生成，最多 3805 帧"}</p>
      <div className="duration-options">{supportedDurations.map(option => <button type="button" key={option} className={`settings-option duration-option${duration === option ? " selected" : ""}`} aria-pressed={duration === option} onClick={() => onDurationChange(option)}>{option}</button>)}</div>
    </section>}
  </div>;
}
