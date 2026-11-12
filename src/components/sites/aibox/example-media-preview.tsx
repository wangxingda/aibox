/* eslint-disable @next/next/no-img-element */
"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Play } from "lucide-react";
import "./example-media-preview.css";

type Props = { src: string; label: string; video?: boolean };

export function ExampleMediaPreview({ src, label, video = false }: Props) {
  const [hover, setHover] = useState<{ src: string; left: number; top: number } | null>(null);
  const open = (element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    const width = Math.min(360, window.innerWidth - 24);
    const height = Math.min(300, window.innerHeight - 24);
    const right = rect.right + 12;
    const left = right + width <= window.innerWidth - 12 ? right : Math.max(12, rect.left - width - 12);
    setHover({ src, left, top: Math.max(12, Math.min(window.innerHeight - height - 12, rect.top)) });
  };
  return <div className="example-media-reference">
    <div className="example-media-thumb" tabIndex={0} aria-label={`${label}，悬停或聚焦预览`} onMouseEnter={event => open(event.currentTarget)} onMouseLeave={() => setHover(null)} onFocus={event => open(event.currentTarget)} onBlur={() => setHover(null)}>
      {video ? <><video key={src} src={`${src}#t=0.1`} muted playsInline preload="metadata" aria-hidden="true"/><span className="example-media-play"><Play size={14} fill="currentColor"/></span></> : <img src={src} alt="" loading="lazy" decoding="async"/>}
    </div>
    <span>{label}</span>
    {hover?.src === src && createPortal(<div className="media-hover-preview" style={{ left: hover.left, top: hover.top }}>{video ? <video src={src} autoPlay muted loop playsInline/> : <img src={src} alt=""/>}</div>, document.body)}
  </div>;
}
