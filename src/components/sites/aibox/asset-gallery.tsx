/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type BackendTask, type BackendUser } from "@/lib/backend";

export type Asset = { id: string; url: string; content_type?: string; created_at: string };
type Kind = "image" | "video";

export function AssetGallery({ user, authLoading, authError, selectKind, onSelect, onAuthRequired }: { user: BackendUser | null; authLoading: boolean; authError: string; selectKind?: Kind; onSelect?: (asset: Asset) => void; onAuthRequired?: () => void }) {
  const [kind, setKind] = useState<Kind>(selectKind || "image");
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [more, setMore] = useState(false);
  const [pageCount, setPageCount] = useState(1);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!user) return;
    let active = true;
    Promise.all(Array.from({ length: pageCount }, (_, i) => api<Asset[]>(`/uploads?kind=${kind}&limit=30&offset=${i * 30}`)))
      .then(pages => { if (active) { setAssets([...new Map(pages.flat().map(asset => [asset.id, asset])).values()]); setMore(pages[pages.length - 1].length === 30); setError(""); } })
      .catch(() => { if (active) setError("素材加载失败，请检查网络或后端服务。"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user, kind, pageCount, revision]);
  const upload = async (file: File) => {
    setBusy(true); setError("");
    try {
      const form = new FormData(); form.append("file", file);
      await api(kind === "video" ? "/uploads/video" : "/uploads", { method: "POST", body: form });
      setRevision(value => value + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "上传失败，请重试。"); }
    finally { setBusy(false); }
  };
  const remove = async (asset: Asset) => {
    if (!window.confirm("确定删除这个素材吗？")) return;
    setBusy(true); setError("");
    try { await api(`/uploads/${encodeURIComponent(asset.id)}`, { method: "DELETE" }); setRevision(value => value + 1); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "删除失败，请重试。"); }
    finally { setBusy(false); }
  };
  if (authLoading) return <div className="task-gallery-empty" role="status">正在检查登录状态…</div>;
  if (authError) return <div className="task-gallery-empty" role="alert">{authError}</div>;
  if (!user) return <div className="task-gallery-empty"><p>登录后即可查看元素库</p>{onAuthRequired ? <button className="ws-gradient backend-start" onClick={onAuthRequired}>登录 / 注册</button> : <Link href="/login" className="ws-gradient backend-start">登录</Link>}</div>;
  return <div className="task-gallery">
    {!selectKind && <div className="asset-toolbar"><div className="asset-filters">{(["image", "video"] as const).map(value => <button key={value} className={kind === value ? "selected" : ""} onClick={() => { setKind(value); setAssets([]); setLoading(true); setPageCount(1); }}>{value === "image" ? "图片" : "视频"}</button>)}</div><label className="asset-upload-button">{busy ? "处理中…" : "上传新素材"}<input type="file" disabled={busy} accept={kind === "image" ? "image/jpeg,image/png,image/webp" : "video/mp4,video/quicktime,video/webm"} onChange={event => { const file = event.target.files?.[0]; if (file) void upload(file); event.currentTarget.value = ""; }}/></label></div>}
    {error && <p className="task-gallery-error" role="alert">{error}</p>}
    {loading && !assets.length ? <div className="task-gallery-empty" role="status">正在加载素材…</div> : !assets.length ? <div className="task-gallery-empty">暂无{kind === "image" ? "图片" : "视频"}素材</div> : <div className="asset-grid">{assets.map(asset => <article className="asset-card" key={asset.id}>
      {onSelect ? <button className="asset-media" type="button" onClick={() => onSelect(asset)} aria-label="选择素材">{kind === "image" ? <img src={asset.url} alt="图片素材" loading="lazy"/> : <video src={`${asset.url}#t=0.1`} muted playsInline preload="metadata" />}</button> : <a className="asset-media" href={asset.url} target="_blank" rel="noreferrer">{kind === "image" ? <img src={asset.url} alt="图片素材" loading="lazy"/> : <video src={`${asset.url}#t=0.1`} muted playsInline preload="metadata" />}</a>}
      {!onSelect && <button type="button" disabled={busy} onClick={() => void remove(asset)}>删除</button>}
    </article>)}</div>}
    {more && <button className="task-gallery-more" onClick={() => setPageCount(count => count + 1)}>加载更多</button>}
  </div>;
}

export function WorkPicker({ user, authLoading, authError, kind, onSelect }: { user: BackendUser | null; authLoading: boolean; authError: string; kind: Kind; onSelect: (asset: Asset) => void }) {
  const [tasks, setTasks] = useState<BackendTask[]>([]);
  const [pageCount, setPageCount] = useState(1);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!user) return;
    let active = true;
    Promise.all(Array.from({ length: pageCount }, (_, i) => api<BackendTask[]>(`/tasks?kind=${kind}&limit=30&offset=${i * 30}`)))
      .then(pages => { if (active) { setTasks([...new Map(pages.flat().map(task => [task.id, task])).values()]); setMore(pages[pages.length - 1].length === 30); setError(""); } })
      .catch(() => { if (active) setError("作品加载失败，请检查网络或后端服务。"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user, kind, pageCount]);
  if (authLoading) return <div className="task-gallery-empty" role="status">正在检查登录状态…</div>;
  if (authError) return <div className="task-gallery-empty" role="alert">{authError}</div>;
  if (!user) return <div className="task-gallery-empty"><p>登录后即可查看作品</p><Link href="/login" className="ws-gradient backend-start">登录</Link></div>;
  const outputs = tasks.filter(task => task.status === "completed").flatMap(task => task.outputs.map(output => ({ id: `${task.id}:${output.url}`, url: output.url, created_at: task.created_at })));
  return <div className="task-gallery">
    {error && <p className="task-gallery-error" role="alert">{error}</p>}
    {loading && !tasks.length ? <div className="task-gallery-empty" role="status">正在加载作品…</div> : !outputs.length ? <div className="task-gallery-empty">暂无可导入的{kind === "image" ? "图片" : "视频"}作品</div> : <div className="asset-grid">{outputs.map(output => <article className="asset-card" key={output.id}><button className="asset-media" type="button" onClick={() => onSelect(output)} aria-label="选择作品">{kind === "image" ? <img src={output.url} alt="图片作品" loading="lazy"/> : <video src={`${output.url}#t=0.1`} muted playsInline preload="metadata" />}</button></article>)}</div>}
    {more && <button className="task-gallery-more" onClick={() => setPageCount(count => count + 1)}>加载更多</button>}
  </div>;
}
