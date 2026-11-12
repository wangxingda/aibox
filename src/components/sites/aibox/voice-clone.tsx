"use client";

import { VoicePlayer } from "./voice-player";
import { AssetGallery } from "./asset-gallery";
import { api, type BackendUser } from "@/lib/backend";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { AudioLines, Mic, Upload, Check, Sparkles, Download, Headphones, Layers } from "lucide-react";
import "./voice-clone.css";
import examples from "../../../../public/sites/aibox/voices/examples/catalog.json";
import catalog from "../../../../public/sites/aibox/voices/catalog.json";

export function VoiceClone({ requireAccount, user, authLoading, authError }: { requireAccount: () => boolean; user: BackendUser | null; authLoading: boolean; authError: string }) {
  const [picker, setPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  async function saveSample() {
    if (!requireAccount() || !sample) return;
    setSaving(true); setError("");
    try { const form = new FormData(); form.append("file", sample, "voice-sample"); await api("/uploads/audio", {method: "POST", body: form}); setSaved(true); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "保存失败"); }
    finally { setSaving(false); }
  }
  const [panel, setPanel] = useState<"examples" | "works">("examples");
  const [works, setWorks] = useState<{url: string; text: string; name: string}[]>([]);
  const worksRef = useRef(works);
  useEffect(() => { worksRef.current = works; }, [works]);
  useEffect(() => () => { worksRef.current.forEach(work => URL.revokeObjectURL(work.url)); }, []);
  const [category, setCategory] = useState(catalog[0].title);
  const [voice, setVoice] = useState("");
  const [sample, setSample] = useState<Blob | null>(null);
  const [sampleUrl, setSampleUrl] = useState("");
  const [result, setResult] = useState("");
  const [text, setText] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [recorded, setRecorded] = useState(false);
  const clockTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const mounted = useRef(true);
  const opening = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { if (!sample) { setSampleUrl(""); return; } const url = URL.createObjectURL(sample); setSampleUrl(url); return () => URL.revokeObjectURL(url); }, [sample]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; if (clockTimer.current) clearInterval(clockTimer.current); if (timer.current) clearTimeout(timer.current); if (recorder.current?.state === "recording") recorder.current.stop(); stream.current?.getTracks().forEach(track => track.stop()); }; }, []);

  async function record() {
    if (recording) { recorder.current?.stop(); return; }
    if (opening.current || busy) return;
    opening.current = true;
    try {
      const input = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current) { input.getTracks().forEach(track => track.stop()); return; }
      if (!["audio/webm", "audio/wav"].some(type => MediaRecorder.isTypeSupported(type))) { input.getTracks().forEach(track => track.stop()); throw new Error("unsupported"); }
      stream.current = input;
      const instance = new MediaRecorder(input, { mimeType: ["audio/webm", "audio/wav"].find(type => MediaRecorder.isTypeSupported(type)) });
      recorder.current = instance;
      const chunks: Blob[] = [];
      instance.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      instance.onstop = () => { if (clockTimer.current) clearInterval(clockTimer.current); if (timer.current) clearTimeout(timer.current); input.getTracks().forEach(track => track.stop()); if (!mounted.current) return; setRecording(false); setRecorded(true); setSaved(false); setVoice(""); if (chunks.length) setSample(new Blob(chunks, { type: instance.mimeType })); };
      instance.start(); setElapsed(0); setRecorded(false); setRecording(true); setError("");
      const started = performance.now();
      clockTimer.current = setInterval(() => setElapsed(Math.min(10, (performance.now() - started) / 1000)), 100);
      timer.current = setTimeout(() => { if (instance.state === "recording") instance.stop(); }, 10000);
    } catch { stream.current?.getTracks().forEach(track => track.stop()); if (mounted.current) setError("无法录音，请检查浏览器和麦克风权限。"); }
    finally { opening.current = false; }
  }
  async function generate() {
    if (!requireAccount()) return;
    if ((!sample && !voice) || !text.trim()) { setError("请先添加声音样本并输入要朗读的文字。"); return; }
    if (busy) return;
    setBusy(true); setError("");
    try {
      const form = new FormData(); form.append("text", text.trim());
      if (voice) {
        const response = await fetch(voice);
        if (!response.ok) throw new Error("音色素材加载失败");
        form.append("audio", await response.blob(), "sample");
      } else if (sample) form.append("audio", sample, "sample");
      const response = await fetch("/api/voice/clone", { method: "POST", body: form });
      if (!response.ok) { const data = await response.json().catch(() => null); throw new Error(data?.detail || "生成失败，请稍后重试。"); }
      const url = URL.createObjectURL(await response.blob());
      setResult(url);
      setWorks(items => [{url, text: text.trim(), name: catalog.flatMap(item => item.characters).find(item => item.audio === voice)?.name || "自定义声音"}, ...items]);
      setPanel("works");
    } catch (err) { setError(err instanceof Error ? err.message : "生成失败，请稍后重试。"); }
    finally { setBusy(false); }
  }
  return <div className="voice-page voice-editor">{picker && <div className="asset-picker-overlay" onClick={() => setPicker(false)}><div className="asset-picker-dialog" role="dialog" aria-modal="true" aria-label="导入声音资产" onClick={event => event.stopPropagation()}><div className="voice-import-heading"><b>从资产导入音色</b><button onClick={() => setPicker(false)}>关闭</button></div><AssetGallery user={user} authLoading={authLoading} authError={authError} selectKind="audio" onSelect={asset => { setVoice(asset.url); setSample(null); setPicker(false); setError(""); }}/></div></div>}<div className="voice-heading"><span><AudioLines size={18}/> 声音创作</span><h1>让每一种声音，都有新的表达<span className="voice-heading-badge"><Sparkles size={13}/> 声音克隆</span></h1><p>上传或录制一段声音，让文字用熟悉的音色表达。</p></div><div className="voice-layout editor-layout"><section className="voice-card editor-left"><div className="editor-tabs"><span className="voice-current-tab"><AudioLines size={17}/> 声音克隆</span></div><div className="voice-card-title"><span>01</span><div><h2>添加声音样本</h2><p>选择清晰、无背景音乐的人声，建议录制 10 秒。</p></div></div><div className="voice-library"><h2 className="voice-library-heading"><Layers size={17}/> 系统音色 <small>精选音色库</small></h2><select aria-label="音色分类" value={category} onChange={event => setCategory(event.target.value)}>{catalog.map(item => <option key={item.title}>{item.title}</option>)}</select><div className="voice-options">{catalog.find(item => item.title === category)?.characters.map(character => { const url = character.audio; return <button type="button" key={character.name} disabled={!url || recording || busy} aria-pressed={voice === url} onClick={() => { setVoice(url); setSample(null); }} ><span className="voice-avatar"><Image src={character.avatar || "/sites/aibox/voices/default-avatar.svg"} alt="" width={42} height={42}/></span><span className="voice-character"><b>{character.name}</b><small>{url ? character.actor || "精选音色" : "素材暂缺"}</small></span>{voice === url && <Check size={16} className="voice-selected-icon"/>}</button>; })}</div>{voice && <VoicePlayer src={voice}/>}</div><div className="voice-actions"><label className="voice-upload"><Upload size={20}/> 上传音频<input type="file" disabled={recording || busy} accept=".wav,.mp3,audio/wav,audio/mpeg" onChange={event => { const file = event.target.files?.[0]; if (file) { if (file.size > 3 * 1024 * 1024) setError("音频不能超过 3 MB。"); else { setVoice(""); setSample(file); setSaved(false); setError(""); } } event.target.value = ""; }}/></label><button type="button" className={recording ? "recording" : ""} onClick={record}><Mic size={20}/>{recording ? "停止录音" : "录制声音"}</button></div><div className="voice-asset-actions"><button onClick={() => { if (requireAccount()) setPicker(true); }}>从资产导入音色</button>{sample && <button disabled={saving || saved || recording} onClick={saveSample}>{saving ? "保存中…" : saved ? "已保存到资产" : "保存音色到资产"}</button>}</div><p className="voice-hint">支持 WAV、MP3，最大 3 MB；录音最长 10 秒。</p><div className={`voice-record-guide ${recording ? "is-recording" : ""}`}>
  <div className="voice-record-status"><span><i/>{recording ? "正在录音 · 请朗读下方文字" : recorded ? "录音完成 · 可试听或重新录制" : "朗读参考 · 用自然的语气"}</span><b>{recording ? `${Math.max(0, Math.ceil(10 - elapsed))} 秒` : "最长 10 秒"}</b></div>
  {recording && <div className="voice-record-visual" aria-hidden="true"><div className="voice-record-mic"><Mic size={24}/></div><div className="voice-record-bars">{Array.from({length: 28}, (_, index) => <i key={index} style={{animationDelay: `${index * 47}ms`, height: `${12 + Math.abs(Math.sin(index * 1.3)) * 32}px`}}/>)}</div></div>}
  <p className="voice-read-script">你好，很高兴在这里与你相遇。今天的阳光很温暖，让我们用声音，记录生活中的美好。</p>
  {recording ? <><div className="voice-record-progress" role="progressbar" aria-label="录音时长" aria-valuemin={0} aria-valuemax={10} aria-valuenow={Math.floor(elapsed)}><i style={{width: `${elapsed * 10}%`}}/></div><small>请保持自然语速，10 秒后自动停止，也可点击“停止录音”提前结束。</small></> : <small>在安静环境中朗读，靠近麦克风，保持音量平稳。</small>}
</div>{sampleUrl && <VoicePlayer src={sampleUrl} label="声音样本预览"/>}<div className="voice-card-title voice-text-title"><span>02</span><div><h2>输入朗读文字</h2><p>写下你希望这个声音说出的话。</p></div></div><textarea value={text} onChange={event => setText(event.target.value)} maxLength={2000} placeholder="输入要生成的语音内容…"/><div className="voice-count">{text.length}/2000</div><p className="voice-hint">请仅使用你拥有使用权或已获授权的声音。</p>{error && <p className="voice-error" role="alert">{error}</p>}<button className="voice-generate" disabled={busy || recording} onClick={generate}>{busy ? "正在生成，请稍候…" : <><Sparkles size={17}/> 生成声音</>}</button></section><section className="editor-right voice-output"><div className="result-tabs"><button className={panel === "examples" ? "selected" : ""} onClick={() => setPanel("examples")}>参考示例</button><button className={panel === "works" ? "selected" : ""} onClick={() => { if (requireAccount()) setPanel("works"); }}>我的作品</button></div>{panel === "examples" ? <div className="voice-examples"><div className="voice-examples-heading"><h2>从一个声音开始</h2><p>先试听音色，再使用示例填入音色与文案，修改后即可生成。</p></div><div className="voice-example-grid">{examples.map(example => { const character = {name: example.name, avatar: example.avatar, audio: example.sample}; const group = {title: example.category}; const script = example.text; return <article key={group.title}><div className="voice-example-person"><Image src={character.avatar || "/sites/aibox/voices/default-avatar.svg"} alt="" width={52} height={52}/><div><h3>{character.name}</h3><small>{group.title} · 克隆语音示例</small></div></div><p>{script}</p><VoicePlayer src={example.audio} label={`${character.name}示例文案试听`}/><button disabled={busy || recording} onClick={() => { setCategory(group.title); setVoice(character.audio); setSample(null); setText(script); setError(""); }}>使用此示例 <Sparkles size={14}/></button></article>; })}</div></div> : <div className="voice-works"><p className="voice-hint">本次页面会话生成的声音，刷新前请下载保存。</p>{works.map((work, index) => <article className="voice-work" key={work.url}><div className="voice-example-person"><Image src="/sites/aibox/voices/default-avatar.svg" alt="" width={42} height={42}/><div><h3>{work.name}</h3><small>声音作品 {works.length - index}</small></div></div><p>{work.text}</p><VoicePlayer src={work.url} label="声音作品"/><a href={work.url} download={`声音作品-${works.length - index}.wav`}><Download size={15}/> 下载音频</a><button onClick={() => setText(work.text)}>复用文案</button></article>)}{!works.length && <div className="voice-empty"><Headphones size={40}/><h3>还没有声音作品</h3><p>在左侧选择音色、输入文字，生成后在这里试听和下载。</p><button onClick={() => setPanel("examples")}>看看参考示例</button></div>}</div>}<div className="voice-result" hidden={!busy}><div className="voice-result-label"><Headphones size={16}/> 声音预览<span>OUTPUT</span></div><div className="voice-result-inner"><div className="voice-orb"><AudioLines size={42}/></div><div className={`voice-wave ${busy ? "is-active" : ""}`} aria-hidden="true">{Array.from({length: 25}, (_, index) => <i key={index} style={{height: `${12 + Math.abs(Math.sin(index * 1.7)) * 40}px`, animationDelay: `${index * 60}ms`}}/>)}</div><h2>{result ? "声音已生成" : "你的声音作品将在这里呈现"}</h2><p>{result ? "试听满意后，下载保存到本地。" : "添加声音样本并输入文字，开始你的声音创作。"}</p>{result && <><VoicePlayer src={result} label="生成的声音"/><a className="voice-download" href={result} download="声音克隆.wav"><Download size={16}/> 下载音频</a></>}</div></div></section></div></div>;
}
