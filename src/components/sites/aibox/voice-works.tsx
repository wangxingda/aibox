"use client";

import { useEffect, useState } from "react";
import { AudioLines, Download, Trash2 } from "lucide-react";
import { api, type BackendUser } from "@/lib/backend";
import { VoicePlayer } from "./voice-player";
import "./task-gallery.css";

type Work = { id: string; text: string; voice_name?: string | null; created_at: string; url: string };
export function VoiceWorks({ user, revision = 0 }: { user: BackendUser | null; revision?: number }) {
  const [works, setWorks] = useState<Work[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => { if (!user) return; let active = true; api<Work[]>("/voice/works").then(data => { if (active) { setWorks(data); setError(""); } }).catch(() => { if (active) setError("声音作品加载失败，请稍后重试。"); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [user, revision]);
  async function remove(id: string) { if (!window.confirm("确定删除这个声音作品吗？")) return; try { await api(`/voice/works/${encodeURIComponent(id)}`, { method: "DELETE" }); setWorks(items => items.filter(item => item.id !== id)); } catch { setError("删除失败，请稍后重试。"); } }
  if (!user) return <div className="task-gallery-empty">登录后即可查看声音作品</div>;
  if (loading) return <div className="task-gallery-empty">正在加载作品…</div>;
  return <div className="task-gallery">{error && <p className="task-gallery-error" role="alert">{error}</p>}{!works.length && !error ? <div className="task-gallery-empty">暂无声音作品</div> : <div className="backend-task-list">{works.map(work => <article className="task-card task-card-audio task-card-completed" key={work.id}><header className="task-card-header"><div className="task-card-heading"><b>声音克隆</b><time dateTime={work.created_at}>{new Date(work.created_at).toLocaleString()}</time></div><span className="task-status task-status-completed">已完成</span></header><p className="task-card-prompt"><span>朗读文字</span>{work.text}</p><div className="task-card-preview voice-work-preview"><div className="voice-work-identity"><span><AudioLines size={23} aria-hidden="true"/></span><div><small>使用音色</small><b title={work.voice_name || "未知音色"}>{work.voice_name || "未知音色"}</b></div></div><VoicePlayer src={work.url} label="声音作品"/></div><div className="task-card-actions"><a href={work.url} download="声音作品.wav"><Download size={16}/>下载</a><button onClick={() => void remove(work.id)}><Trash2 size={16}/>删除</button></div></article>)}</div>}</div>;
}
