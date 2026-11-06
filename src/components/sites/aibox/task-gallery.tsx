/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, Download, LoaderCircle, Pencil, Trash2, X } from "lucide-react";
import { api, ApiError, type BackendTask, type BackendUser } from "@/lib/backend";
import "./task-gallery.css";

const pageSize = 30;
const statusLabels: Record<string, string> = {
  queued: "排队中",
  submitting: "提交中",
  running: "生成中",
  completed: "已完成",
  failed: "生成失败",
  unknown: "待确认",
};
const activeStatuses = new Set(["queued", "submitting", "running"]);

type Props = { user: BackendUser | null; authLoading: boolean; authError: string; kind?: "image" | "video" };

export function TaskGallery({ user, authLoading, authError, kind }: Props) {
  const [tasks, setTasks] = useState<BackendTask[]>([]);
  const [pageCount, setPageCount] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submittedNotice, setSubmittedNotice] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const hiddenTasks = useRef(new Set<string>());

  const deleteTask = async (task: BackendTask) => {
    if (!window.confirm("确定删除这个作品吗？删除后将无法在作品列表中查看。")) return;
    setDeleting(task.id);
    hiddenTasks.current.add(task.id);
    setTasks(current => current.filter(item => item.id !== task.id));
    try {
      await api(`/tasks/${encodeURIComponent(task.id)}`, { method: "DELETE" });
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 404) return;
      hiddenTasks.current.delete(task.id);
      setTasks(current => current.some(item => item.id === task.id) ? current : [task, ...current]);
      setError(cause instanceof Error ? cause.message : "删除失败，请重试。");
    } finally { setDeleting(null); }
  };

  useEffect(() => {
    if (window.sessionStorage.getItem("aibox:task-submitted") !== "1") return;
    window.sessionStorage.removeItem("aibox:task-submitted");
    setSubmittedNotice(true);
  }, []);

  useEffect(() => {
    if (!submittedNotice) return;
    const timer = window.setTimeout(() => setSubmittedNotice(false), 1500);
    return () => window.clearTimeout(timer);
  }, [submittedNotice]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    let fetching = false;
    const refresh = async () => {
      if (fetching) return;
      fetching = true;
      try {
        const pages = await Promise.all(Array.from({ length: pageCount }, (_, index) => {
          const params = new URLSearchParams({ limit: String(pageSize), offset: String(index * pageSize) });
          if (kind) params.set("kind", kind);
          return api<BackendTask[]>(`/tasks?${params}`);
        }));
        if (!active) return;
        const unique = new Map(pages.flat().map(task => [task.id, task]));
        setTasks([...unique.values()].filter(task => !hiddenTasks.current.has(task.id)));
        setHasMore(pages[pages.length - 1].length === pageSize);
        setError("");
      } catch (cause) {
        if (!active) return;
        setError(cause instanceof ApiError && cause.status === 401 ? "登录已过期，请重新登录。" : "作品加载失败，请检查网络或后端服务。");
      } finally {
        fetching = false;
        if (active) setLoading(false);
      }
    };
    void refresh();
    const timer = window.setInterval(refresh, 3000);
    return () => { active = false; window.clearInterval(timer); };
  }, [user, kind, pageCount]);

  let content: React.ReactNode;
  if (authLoading) {
    content = <div className="task-gallery-empty" role="status">正在检查登录状态…</div>;
  } else if (authError) {
    content = <div className="task-gallery-empty" role="alert">{authError}</div>;
  } else if (!user) {
    content = <div className="task-gallery-empty"><p>登录后即可查看我的作品</p><Link className="ws-gradient backend-start" href="/login">登录</Link></div>;
  } else if (loading && tasks.length === 0) {
    content = <div className="task-gallery-empty" role="status">正在加载作品…</div>;
  } else if (error && tasks.length === 0) {
    content = <div className="task-gallery-empty" role="alert"><p>{error}</p><button onClick={() => window.location.reload()}>重新加载</button></div>;
  } else if (tasks.length === 0) {
    content = <div className="task-gallery-empty"><p>{kind === "video" ? "暂无视频作品" : kind === "image" ? "暂无图片作品" : "暂无作品，开始你的第一次创作吧"}</p><Link href="/create" className="ws-gradient backend-start">开始创作</Link></div>;
  } else {
    content = <div className="task-gallery">
      <div className="backend-task-list">
        {tasks.map(task => {
          const isActive = activeStatuses.has(task.status);
          const progress = Math.max(0, Math.min(100, task.progress ?? (task.status === "completed" ? 100 : 0)));
          const createdAt = task.created_at ? task.created_at.replace("T", " ").replace(/Z$/, "").slice(0, 16) : "";
          return <article className={`task-card task-card-${task.kind} task-card-${task.status}`} key={task.id}>
            <header className="task-card-header">
              <div className="task-card-heading"><b title={task.model}>{task.model}</b><time dateTime={task.created_at}>{createdAt}</time></div>
              <span className={`task-status task-status-${task.status}`}>{statusLabels[task.status] || task.status}</span>
            </header>
            {task.prompt && <p className="task-card-prompt" title={task.prompt}><span>提示词</span>{task.prompt}</p>}
            <div className={`task-card-preview${isActive ? " is-generating" : ""}`}>
            {isActive ? <div className="task-card-progress" role="status" aria-label={`${statusLabels[task.status] || task.status} ${progress}%`}>
              <LoaderCircle className="task-progress-spinner" size={22} aria-hidden="true" />
              <div className="task-progress-label"><span>{statusLabels[task.status] || task.status}</span><b>{progress}%</b></div>
              <div className="task-progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
                <span style={{ width: `${progress}%` }} />
              </div>
            </div> : task.outputs.length === 0 ? <div className="task-card-placeholder"><span>{task.kind === "image" ? "图片任务" : "视频任务"}</span></div> : null}
            {task.error && <p className="task-card-error" role="alert">{task.error}</p>}
            {task.outputs.map((output, index) => task.kind === "image"
              ? <a className="task-card-media task-card-image" href={output.url} target="_blank" rel="noreferrer" key={output.url}><img src={output.url} alt={`生成结果 ${index + 1}`} loading="lazy"  decoding="async"/></a>
              : <video className="task-card-media task-card-video" key={output.url} src={output.url} controls preload="metadata" />)}
            </div>
            {task.status === "completed" && <div className="task-card-actions">
              <a href={`/${task.kind === "video" ? (task.model === "Wan SCAIL2 角色替换" ? "character-replacement" : task.model === "Wan Animate2 动作迁移" ? "motion-transfer" : task.options?.mode === "text-to-video" ? "text-to-video" : "image-to-video") : task.upload_id ? "image-edit" : "text-to-image"}?edit=${encodeURIComponent(task.id)}`} aria-label="编辑并重新使用任务"><Pencil size={16} />编辑</a>
              {task.outputs.map((output, index) => <a href={`${output.url}?download=true`} download key={output.url} aria-label={`下载作品 ${index + 1}`}><Download size={16} />下载{task.outputs.length > 1 ? ` ${index + 1}` : ""}</a>)}
              <button type="button" onClick={() => void deleteTask(task)} disabled={deleting === task.id}><Trash2 size={16} />{deleting === task.id ? "删除中" : "删除"}</button>
            </div>}
          </article>;
        })}
      </div>
      {error && <p className="task-gallery-error" role="alert">{error}</p>}
      {hasMore && <button className="task-gallery-more" onClick={() => setPageCount(count => count + 1)}>加载更多</button>}
    </div>;
  }

  return <>
    {submittedNotice && <div className="task-submission-toast-backdrop"><div className="task-submission-toast" role="status"><Check size={20} aria-hidden="true"/><b>任务提交成功</b><button onClick={() => setSubmittedNotice(false)} aria-label="关闭通知"><X size={16}/></button></div></div>}
    {content}
  </>;
}
