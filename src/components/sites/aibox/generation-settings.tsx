"use client";

import { LockKeyhole } from "lucide-react";
import "./generation-settings.css";

const ratios = ["16:9", "9:16", "4:3", "3:4", "1:1", "21:9"];
const durations = ["5s", "10s", "15s", "20s", "25s", "30s"];
const resolutions = ["540P", "720P", "1080P"];

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

function slug(value: string) {
  return value.replace(":", "-").toLowerCase();
}

export function GenerationSettings({
  kind,
  quality,
  ratio,
  duration,
  fixedResolution,
  resolutionLabel,
  supportedQualities,
  supportedRatios,
  supportedDurations,
  onQualityChange,
  onRatioChange,
  onDurationChange,
}: GenerationSettingsProps) {
  const qualityOptions = fixedResolution ? ["固定", ...resolutions.slice(1)] : resolutions;

  return (
    <div className="generation-settings" aria-label="生成参数设置">
      <section className="generation-settings-group">
        <h3>分辨率</h3>
        {fixedResolution && <p className="generation-settings-note">{resolutionLabel}</p>}
        <div className="resolution-options">
          {qualityOptions.map((option, index) => {
            const available = fixedResolution ? index === 0 : supportedQualities.includes(option);
            const selected = fixedResolution ? index === 0 : quality === option;
            return (
              <button
                type="button"
                className={`settings-option resolution-option${selected ? " selected" : ""}`}
                key={option}
                disabled={!available}
                aria-pressed={selected}
                onClick={() => {
                  if (!fixedResolution) onQualityChange(option);
                }}
              >
                {option}
                {!available && <LockKeyhole className="settings-lock" size={12} aria-label="当前工作流不支持" />}
              </button>
            );
          })}
        </div>
      </section>

      <section className="generation-settings-group">
        <h3>比例</h3>
        <div className="ratio-options">
          {ratios.map((option) => {
            const available = supportedRatios.includes(option);
            const selected = ratio === option;
            return (
              <button
                type="button"
                className={`settings-option ratio-option${selected ? " selected" : ""}`}
                key={option}
                disabled={!available}
                aria-pressed={selected}
                onClick={() => onRatioChange(option)}
              >
                <span className={`ratio-icon ratio-icon-${slug(option)}`} aria-hidden="true" />
                <span>{option}</span>
                {!available && <LockKeyhole className="settings-lock" size={12} aria-label="当前工作流不支持" />}
              </button>
            );
          })}
        </div>
      </section>

      {kind === "video" && (
        <section className="generation-settings-group">
          <h3>时长</h3>
          <div className="duration-options">
            {durations.map((option) => {
              const available = supportedDurations.includes(option);
              const selected = duration === option;
              return (
                <button
                  type="button"
                  className={`settings-option duration-option${selected ? " selected" : ""}`}
                  key={option}
                  disabled={!available}
                  aria-pressed={selected}
                  onClick={() => onDurationChange(option)}
                >
                  {option}
                  {!available && <LockKeyhole className="settings-lock" size={12} aria-label="当前工作流不支持" />}
                </button>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
