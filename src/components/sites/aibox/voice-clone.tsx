"use client";

import { VoiceWorks } from "./voice-works";
import "./image-examples.css";
import { VoicePlayer } from "./voice-player";
import { AssetGallery } from "./asset-gallery";
import { api, type BackendUser } from "@/lib/backend";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { AudioLines, Check, Mic, Sparkles, Layers, RotateCcw, Square, Save, Volume2, X } from "lucide-react";
import { useVoiceRecorder } from "./voice-recorder";
import "./voice-clone.css";
import examples from "../../../../public/sites/aibox/voices/examples/catalog.json";
import catalog from "../../../../public/sites/aibox/voices/catalog.json";

export function VoiceClone({ requireAccount, user, authLoading, authError }: { requireAccount: () => boolean; user: BackendUser | null; authLoading: boolean; authError: string }) {
  const [picker, setPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [recordPage, setRecordPage] = useState(false);
  const recordDialog = useRef<HTMLDivElement>(null);
  useEffect(() => { if (recordPage) recordDialog.current?.focus(); }, [recordPage]);
  const [recordName, setRecordName] = useState("");
  const [recordDraft, setRecordDraft] = useState<Blob | null>(null);
  const [draftUrl, setDraftUrl] = useState("");
  const [showSave, setShowSave] = useState(false);
  const [showInlineSave, setShowInlineSave] = useState(false);
  async function saveSample() {
    if (!sample || !recordName.trim() || !requireAccount()) return;
    setSaving(true); setError("");
    try { const form = new FormData(); form.append("file", sample, recordName.trim() || "voice-sample"); await api("/uploads/audio", {method: "POST", body: form}); setSaved(true); setVoiceName(recordName.trim()); setShowInlineSave(false); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "保存失败"); }
    finally { setSaving(false); }
  }
  const [selectedExample, setSelectedExample] = useState(0);
  const [revision, setRevision] = useState(0);
  const [panel, setPanel] = useState<"examples" | "works">("examples");
  const [category, setCategory] = useState(catalog[0].title);
  const [voice, setVoice] = useState("");
  const [voiceName, setVoiceName] = useState("");
  const [sample, setSample] = useState<Blob | null>(null);
  const [sampleUrl, setSampleUrl] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const recorder = useVoiceRecorder(blob => { setRecordDraft(blob); setError(""); });
  useEffect(() => { if (!recordDraft) { setDraftUrl(""); return; } const url = URL.createObjectURL(recordDraft); setDraftUrl(url); return () => URL.revokeObjectURL(url); }, [recordDraft]);
  function useRecording() { if (!recordDraft) return; setVoice(""); setSample(recordDraft); setVoiceName("录制声音"); setShowInlineSave(false); setSaved(false); setError(""); setRecordPage(false); }
  async function saveRecording() {
    if (!recordDraft || !recordName.trim() || !requireAccount()) return;
    setSaving(true); setError("");
    try { const form = new FormData(); form.append("file", recordDraft, recordName.trim()); await api("/uploads/audio", {method: "POST", body: form}); setVoice(""); setSample(recordDraft); setVoiceName(recordName.trim()); setSaved(true); setRecordPage(false); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "保存失败，请重试。"); }
    finally { setSaving(false); }
  }
  useEffect(() => { if (!sample) { setSampleUrl(""); return; } const url = URL.createObjectURL(sample); setSampleUrl(url); return () => URL.revokeObjectURL(url); }, [sample]);
  async function generate() {
    if (!requireAccount()) return;
    if ((!sample && !voice) || !text.trim()) { setError("请先添加声音样本并输入要朗读的文字。"); return; }
    if (busy) return;
    setBusy(true); setError("");
    try {
      const form = new FormData(); form.append("text", text.trim()); form.append("voice_name", voiceName.slice(0, 100));
      if (voice) {
        const response = await fetch(voice);
        if (!response.ok) throw new Error("音色素材加载失败");
        form.append("audio", await response.blob(), "sample");
      } else if (sample) form.append("audio", sample, "sample");
      const response = await fetch("/api/voice/clone", { method: "POST", body: form });
      if (!response.ok) { const data = await response.json().catch(() => null); throw new Error(data?.detail || "生成失败，请稍后重试。"); }
      setRevision(value => value + 1);
      setPanel("works");
    } catch (err) { setError(err instanceof Error ? err.message : "生成失败，请稍后重试。"); }
    finally { setBusy(false); }
  }
  const recordModal = recordPage && <div className="record-overlay"><div ref={recordDialog} className="record-dialog" role="dialog" aria-modal="true" aria-labelledby="record-dialog-title" tabIndex={-1} onKeyDown={event => { if (event.key === "Escape" && !recorder.recording && !recorder.openingMic && !saving) { event.stopPropagation(); setRecordPage(false); } if (event.key === "Tab") { const items = event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), audio[controls]"); const first = items[0], last = items[items.length - 1]; if (first && last && event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (first && last && !event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); } } }}><div className="record-studio">
    <div className="record-studio-inner">
      <div className="record-dialog-header"><div className="record-dialog-title"><span><Mic size={17}/></span><h1 id="record-dialog-title">录下你的声音</h1></div><button type="button" className="record-dialog-close" aria-label="关闭录音窗口" disabled={recorder.recording || recorder.openingMic || saving} onClick={() => setRecordPage(false)}><X size={19}/></button></div>
      <div className="record-layout"><section className="record-main" aria-label="录音">
        <div className="record-main-head"><div><small>RECORDING STUDIO</small><h2>{recorder.recording ? "正在录音" : recorder.recorded ? "录音已完成" : "准备好开始录音"}</h2><p>{recorder.recording ? "保持自然语速，读完下方参考文字。" : recorder.recorded ? "先听听效果，再选择如何使用。" : "点击麦克风按钮，允许浏览器使用麦克风。"}</p></div><span className={`record-status ${recorder.recording ? "active" : ""}`}><i/>{recorder.recording ? "录制中" : recorder.recorded ? "已完成" : "未开始"}</span></div>
        <div className={`record-stage ${recorder.recording ? "is-live" : ""} ${recorder.recorded ? "is-complete" : ""}`}><button type="button" className="record-mic-button" disabled={saving || recorder.openingMic} onClick={() => { setShowSave(false); setError(""); void recorder.record(); }} aria-label={recorder.recording ? "停止录音" : recorder.recorded ? "重新录制" : "开始录音"}>{recorder.recording ? <Square size={26} fill="currentColor"/> : recorder.recorded ? <RotateCcw size={28}/> : <Mic size={30}/>}</button><strong>{recorder.openingMic ? "正在打开麦克风…" : recorder.recording ? "点击停止录音" : recorder.recorded ? "重新录制" : "点击开始录音"}</strong><div className="record-time"><b>{String(Math.floor(recorder.elapsed)).padStart(2, "0")}</b><span> / 10 秒</span></div><div className="record-timeline" role="progressbar" aria-label="录音时长" aria-valuemin={0} aria-valuemax={10} aria-valuenow={Math.min(10, Math.floor(recorder.elapsed))}><i style={{width: `${recorder.elapsed * 10}%`}}/></div><small>最长录制 10 秒，时间到后自动停止</small></div>
        {recorder.recorded && draftUrl && <div className="record-review"><div className="record-review-title"><Volume2 size={17}/><div><b>试听录音</b><span>确认声音清晰后继续</span></div></div><VoicePlayer src={draftUrl} label="录音试听"/><div className="record-decision"><button type="button" className="record-use" disabled={saving} onClick={useRecording}>使用此声音 <span>→</span></button><button type="button" className="record-save-toggle" disabled={saving} onClick={() => setShowSave(value => !value)}><Save size={16}/>保存到资产库</button></div><p className="record-use-note">直接使用仅用于本次创作；保存到资产库后可再次使用。</p>{showSave && <form className="record-save-form" onSubmit={event => { event.preventDefault(); void saveRecording(); }}><label htmlFor="record-name">声音名称</label><div><input id="record-name" value={recordName} maxLength={100} onChange={event => setRecordName(event.target.value)} placeholder="例如：我的声音"/><button disabled={saving || !recordName.trim()}>{saving ? "保存中…" : "保存并使用"}</button></div></form>}</div>}
        {(error || recorder.error) && <p className="voice-error record-error" role="alert">{error || recorder.error}</p>}
      </section><aside className="record-aside"><div className="record-script"><span>朗读参考</span><h2>用平常说话的语气</h2><p>你好，很高兴在这里与你相遇。今天的阳光很温暖，让我们用声音，记录生活中的美好。</p></div><div className="record-tips"><h3>录音小贴士</h3><p><span>01</span>选择安静的环境，避免背景音乐。</p><p><span>02</span>靠近麦克风，保持音量和语速平稳。</p><p><span>03</span>请使用你拥有使用权或已获授权的声音。</p></div></aside></div>
    </div></div></div></div>;
  return <div className="voice-page voice-editor">{recordModal}{picker && <div className="asset-picker-overlay" onClick={() => setPicker(false)}><div className="asset-picker-dialog" role="dialog" aria-modal="true" aria-label="导入声音资产" onClick={event => event.stopPropagation()}><div className="voice-import-heading"><b>从资产导入音色</b><button onClick={() => setPicker(false)}>关闭</button></div><AssetGallery user={user} authLoading={authLoading} authError={authError} selectKind="audio" onSelect={asset => { setVoice(asset.url); setVoiceName(asset.name || "声音素材"); setSample(null); setPicker(false); setError(""); }}/></div></div>}<div className="voice-heading"><span><AudioLines size={18}/> 声音创作</span><h1>让每一种声音，都有新的表达<span className="voice-heading-badge"><Sparkles size={13}/> 声音克隆</span></h1><p>上传或录制一段声音，让文字用熟悉的音色表达。</p></div><div className="voice-layout editor-layout"><section className="voice-card editor-left"><div className="editor-tabs"><span className="voice-current-tab"><AudioLines size={17}/> 声音克隆</span></div><div className="voice-card-title"><span>01</span><div><h2>添加声音样本</h2><p>选择清晰、无背景音乐的人声，建议录制 10 秒。</p></div></div><div className="voice-library"><h2 className="voice-library-heading"><Layers size={17}/> 系统音色 <small>精选音色库</small></h2><select aria-label="音色分类" value={category} onChange={event => setCategory(event.target.value)}>{catalog.map(item => <option key={item.title}>{item.title}</option>)}</select><div className="voice-options">{catalog.find(item => item.title === category)?.characters.map(character => { const url = character.audio; return <button type="button" key={character.name} disabled={!url || busy} aria-pressed={voice === url} onClick={() => { setVoice(url); setVoiceName(character.name); setSample(null); }} ><span className="voice-avatar"><Image src={character.avatar || "/sites/aibox/voices/default-avatar.svg"} alt="" width={42} height={42}/></span><span className="voice-character"><b>{character.name}</b><small>{url ? character.actor || "精选音色" : "素材暂缺"}</small></span>{voice === url && <Check size={16} className="voice-selected-icon"/>}</button>; })}</div>{voice && <VoicePlayer src={voice}/>}</div><div className="voice-actions"><label className="voice-upload">上传音频<input type="file" disabled={busy} accept=".wav,.mp3,audio/wav,audio/mpeg" onChange={event => { const file = event.target.files?.[0]; if (file) { if (file.size > 3 * 1024 * 1024) setError("音频不能超过 3 MB。"); else { setVoice(""); setVoiceName(file.name.slice(0, 100)); setSample(file); setSaved(false); setError(""); } } event.target.value = ""; }}/></label><button type="button" className="voice-import" onClick={() => { if (requireAccount()) setPicker(true); }}>从资产导入</button></div><button type="button" className={`voice-record${recorder.recording ? " recording" : ""}`} disabled={busy} onClick={() => { setRecordName(""); setRecordDraft(null); setShowSave(false); setError(""); recorder.reset(); setRecordPage(true); }}><Mic size={16}/>录制声音</button><p className="voice-hint">支持 WAV、MP3，最大 3 MB；录音最长 10 秒。</p>{sampleUrl && <div className="voice-sample-row"><VoicePlayer src={sampleUrl} label="声音样本预览"/>{sample === recordDraft && !saved && <button className="voice-sample-save" type="button" onClick={() => setShowInlineSave(value => !value)} aria-expanded={showInlineSave}>保存</button>}</div>}{sample && sample === recordDraft && !saved && showInlineSave && <form className="record-save-form voice-inline-save" onSubmit={event => { event.preventDefault(); void saveSample(); }}><label htmlFor="inline-record-name">声音名称</label><div><input id="inline-record-name" value={recordName} maxLength={100} onChange={event => setRecordName(event.target.value)} placeholder="例如：我的声音"/><button disabled={saving || !recordName.trim()}>{saving ? "保存中…" : "保存"}</button></div></form>}{(voice || sample) && <div className="voice-current-selection" role="status"><span className="voice-current-selection-icon"><AudioLines size={18}/></span><span className="voice-current-selection-copy"><small>当前使用的音色</small><strong title={voiceName || "自定义声音"}>{voiceName || "自定义声音"}</strong></span><span className="voice-current-selection-badge"><Check size={14}/> 已选择</span></div>}<div className="voice-card-title voice-text-title"><span>02</span><div><h2>输入朗读文字</h2><p>写下你希望这个声音说出的话。</p></div></div><textarea value={text} onChange={event => setText(event.target.value)} maxLength={2000} placeholder="输入要生成的语音内容…"/><div className="voice-count">{text.length}/2000</div><p className="voice-hint">请仅使用你拥有使用权或已获授权的声音。</p>{error && <p className="voice-error" role="alert">{error}</p>}<button className="voice-generate" disabled={busy} onClick={generate}>{busy ? "正在生成，请稍候…" : <><Sparkles size={17}/> 生成声音</>}</button></section><section className="editor-right voice-output"><div className="result-tabs"><button className={panel === "examples" ? "selected" : ""} onClick={() => setPanel("examples")}>参考示例</button><button className={panel === "works" ? "selected" : ""} onClick={() => { if (requireAccount()) setPanel("works"); }}>我的作品</button></div>{panel === "examples" ? <div className="image-examples"><div className="image-examples-heading"><div><h2>参考示例</h2><p>选择灵感，快速开始创作</p></div><Sparkles size={20}/></div>{(() => { const example = examples[selectedExample]; return <><div className="image-example-feature"><div className="image-example-picture voice-example-picture"><Image src={example.avatar || "/sites/aibox/voices/default-avatar.svg"} alt="" width={150} height={150}/><VoicePlayer src={example.audio} label={`${example.name}${"previewLabel" in example ? example.previewLabel : "示例试听"}`}/></div><div className="image-example-info"><span className="image-example-type">{example.category}</span><h3>{example.name}</h3><span className="image-example-label">{"previewLabel" in example ? "参考文案（试听为音色样本）" : "朗读文字"}</span><p>{example.text}</p><button type="button" className="image-example-apply" disabled={busy} onClick={() => { setCategory(example.category); setVoice(example.sample); setVoiceName(example.name); setSample(null); setText(example.text); setError(""); }}><Sparkles size={16}/>一键同款</button></div></div><div className="image-example-list" aria-label="选择参考示例">{examples.map((item, index) => <button type="button" key={`${item.category}-${item.name}`} className={index === selectedExample ? "selected" : ""} onClick={() => setSelectedExample(index)} aria-pressed={index === selectedExample}><Image src={item.avatar || "/sites/aibox/voices/default-avatar.svg"} alt="" width={112} height={92}/><span>{item.name}</span></button>)}</div></>; })()}</div> : <VoiceWorks user={user} revision={revision}/>}</section></div></div>;
}
