/* eslint-disable @next/next/no-img-element */
"use client";

import { useState } from "react";
import { Film, Play, Sparkles } from "lucide-react";
import examples from "./video-examples-data.json";
import "./video-examples.css";

export type VideoExample = { title: string; prompt: string; video: string; poster: string; inputImage?: string; inputVideo?: string };
type Mode = "reference" | "replacement" | "motion";

export function VideoExamples({ mode, onApply }: { mode: Mode; onApply: (example: VideoExample) => Promise<void> }) {
  const [selected, setSelected] = useState(0);
  const [applying, setApplying] = useState(false);
  const items: VideoExample[] = examples[mode];
  const example = items[selected];
  const modeName = { reference: "参考图生视频", replacement: "角色替换", motion: "动作迁移" }[mode];
  const apply = async () => {
    setApplying(true);
    try { await onApply(example); } finally { setApplying(false); }
  };
  return <section className="video-examples">
    <div className="video-examples-heading"><div><h2>参考示例</h2><p>选择{modeName}灵感，一键填入素材与提示词</p></div><Sparkles size={20} aria-hidden="true" /></div>
    <div className="video-example-feature">
      <div className="video-example-player"><video key={example.video} src={example.video} poster={example.poster} controls playsInline preload="none" aria-label={`${example.title}示例视频`} /></div>
      <div className="video-example-info"><span className="video-example-type">{modeName}</span><h3>{example.title}</h3><span className="video-example-label">提示词</span><p title={example.prompt}>{example.prompt || "使用工作流默认提示词"}</p><div className="video-example-inputs">{example.inputImage && <div><img src={example.inputImage} alt="示例参考图"  loading="lazy" decoding="async"/><span>参考图</span></div>}{example.inputVideo && <div><span className="video-example-input-icon"><Film size={18}/></span><span>驱动视频</span></div>}</div><p className="video-example-note">示例使用源站模型及参数，生成效果以当前工作流为准。</p><button type="button" className="video-example-apply" disabled={applying} onClick={() => void apply()}><Sparkles size={16}/>{applying ? "正在加载素材…" : "一键同款"}</button></div>
    </div>
    <div className="video-example-list" aria-label={`选择${modeName}参考示例`}>{items.map((item, index) => <button type="button" key={item.video} disabled={applying} className={index === selected ? "selected" : ""} onClick={() => setSelected(index)} aria-label={`查看${item.title}`} aria-pressed={index === selected}><img src={item.poster} alt="" loading="lazy" decoding="async"/><span className="video-example-play"><Play size={14} fill="currentColor"/></span><span className="video-example-title">{item.title}</span></button>)}</div>
  </section>;
}

const textVideoPrompts = [
  { title: "海边日落", prompt: "夕阳洒在海面上，镜头缓缓掠过金色海岸，海浪轻轻拍打沙滩，远处的海鸥掠过天空，电影感自然光。" },
  { title: "雨夜街道", prompt: "雨后的城市街道倒映着霓虹灯，一位行人撑伞缓步走过，镜头平稳跟随，细雨和车辆灯光营造电影氛围。" },
  { title: "山间清晨", prompt: "清晨的山谷被薄雾环绕，阳光穿过松树林，镜头从溪流上方缓缓升起，展现远处的群山和流动的云海。" },
];

export function TextVideoExamples({ onApply }: { onApply: (prompt: string) => void }) {
  return <section className="video-examples text-video-examples">
    <div className="video-examples-heading"><div><h2>文字灵感</h2><p>选择一段提示词，开始文生视频</p></div><Sparkles size={20} aria-hidden="true" /></div>
    <div className="text-video-prompt-list">{textVideoPrompts.map(item => <article key={item.title}><h3>{item.title}</h3><p>{item.prompt}</p><button type="button" onClick={() => onApply(item.prompt)}><Sparkles size={15}/>使用提示词</button></article>)}</div>
  </section>;
}
