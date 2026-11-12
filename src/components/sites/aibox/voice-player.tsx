"use client";

import { useState } from "react";
import AudioPlayer from "react-h5-audio-player";
import { Play, Pause, Volume2, VolumeX } from "lucide-react";
import "react-h5-audio-player/lib/styles.css";
import "./voice-player.css";

export function VoicePlayer({ src, label = "声音试听" }: { src: string; label?: string }) {
  return <Player key={src} src={src} label={label}/>;
}

function Player({ src, label }: { src: string; label: string }) {
  const [error, setError] = useState(false);
  return <div className="voice-player" role="group" aria-label={label}>
    <AudioPlayer src={src} preload="none" autoPlayAfterSrcChange={false} layout="horizontal-reverse" showJumpControls={false} customAdditionalControls={[]} customVolumeControls={[]} customIcons={{play: <Play size={18} fill="currentColor"/>, pause: <Pause size={18} fill="currentColor"/>, volume: <Volume2 size={17}/>, volumeMute: <VolumeX size={17}/>}} defaultCurrentTime="00:00" defaultDuration="--:--" i18nAriaLabels={{player: label, play: "播放", pause: "暂停", progressControl: "播放进度", volumeControl: "音量", volume: "静音", volumeMute: "取消静音"}} onPlay={event => { setError(false); document.querySelectorAll<HTMLAudioElement>(".voice-player audio").forEach(audio => { if (audio !== event.target) audio.pause(); }); }} onError={() => setError(true)} onPlayError={() => setError(true)}/>
    {error && <small role="alert">音频暂时无法播放，请稍后重试。</small>}
  </div>;
}
