"use client";

import { useEffect, useRef, useState } from "react";
import { Mic } from "lucide-react";

export function useVoiceRecorder(onRecorded: (blob: Blob) => void) {
  const [error, setError] = useState("");
  const [openingMic, setOpeningMic] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [recorded, setRecorded] = useState(false);
  const [recording, setRecording] = useState(false);
  const clockTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const mounted = useRef(true);
  const opening = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; if (clockTimer.current) clearInterval(clockTimer.current); if (timer.current) clearTimeout(timer.current); if (recorder.current?.state === "recording") recorder.current.stop(); stream.current?.getTracks().forEach(track => track.stop()); }; }, []);

  async function record() {
    if (recording) { recorder.current?.stop(); return; }
    if (opening.current) return;
    opening.current = true; setOpeningMic(true); setError("");
    try {
      const input = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current) { input.getTracks().forEach(track => track.stop()); return; }
      if (!["audio/webm", "audio/wav"].some(type => MediaRecorder.isTypeSupported(type))) { input.getTracks().forEach(track => track.stop()); throw new Error("unsupported"); }
      stream.current = input;
      const instance = new MediaRecorder(input, { mimeType: ["audio/webm", "audio/wav"].find(type => MediaRecorder.isTypeSupported(type)) });
      recorder.current = instance;
      const chunks: Blob[] = [];
      instance.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      instance.onstop = () => { if (clockTimer.current) clearInterval(clockTimer.current); if (timer.current) clearTimeout(timer.current); input.getTracks().forEach(track => track.stop()); if (!mounted.current) return; setRecording(false); setRecorded(chunks.length > 0); if (chunks.length) onRecorded(new Blob(chunks, { type: instance.mimeType })); else setError("没有录到声音，请检查麦克风后重试。"); };
      instance.start(); setElapsed(0); setRecorded(false); setRecording(true);
      const started = performance.now();
      clockTimer.current = setInterval(() => setElapsed(Math.min(10, (performance.now() - started) / 1000)), 100);
      timer.current = setTimeout(() => { if (instance.state === "recording") instance.stop(); }, 10000);
    } catch { stream.current?.getTracks().forEach(track => track.stop()); if (mounted.current) { setRecorded(false); setError("无法使用麦克风，请检查浏览器权限和设备后重试。"); } }
    finally { opening.current = false; if (mounted.current) setOpeningMic(false); }
  }

  function reset() { setElapsed(0); setRecorded(false); setError(""); }
  return { elapsed, recorded, recording, openingMic, error, record, reset };
}

export function VoiceRecorderGuide({ recording, recorded, elapsed }: { recording: boolean; recorded: boolean; elapsed: number }) {
  return <div className={`voice-record-guide ${recording ? "is-recording" : ""}`}>
    <div className="voice-record-status"><span><i/>{recording ? "正在录音 · 请朗读下方文字" : recorded ? "录音完成 · 可试听或重新录制" : "朗读参考 · 用自然的语气"}</span><b>{recording ? `${Math.max(0, Math.ceil(10 - elapsed))} 秒` : "最长 10 秒"}</b></div>
    {recording && <div className="voice-record-visual" aria-hidden="true"><div className="voice-record-mic"><Mic size={24}/></div><div className="voice-record-bars">{Array.from({length: 28}, (_, index) => <i key={index} style={{animationDelay: `${index * 47}ms`, height: `${12 + Math.abs(Math.sin(index * 1.3)) * 32}px`}}/>)}</div></div>}
    <p className="voice-read-script">你好，很高兴在这里与你相遇。今天的阳光很温暖，让我们用声音，记录生活中的美好。</p>
    {recording ? <><div className="voice-record-progress" role="progressbar" aria-label="录音时长" aria-valuemin={0} aria-valuemax={10} aria-valuenow={Math.floor(elapsed)}><i style={{width: `${elapsed * 10}%`}}/></div><small>请保持自然语速，10 秒后自动停止，也可点击“停止录音”提前结束。</small></> : <small>在安静环境中朗读，靠近麦克风，保持音量平稳。</small>}
  </div>;
}
