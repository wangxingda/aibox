/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type BackendUser } from "@/lib/backend";

type Asset = { id: string; url: string; created_at: string };
export function AssetGallery({ user, authLoading, authError }: { user: BackendUser | null; authLoading: boolean; authError: string }) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [more, setMore] = useState(false);
  const [pageCount, setPageCount] = useState(1);
  useEffect(() => {
    if (!user) return;
    let active = true;
    Promise.all(Array.from({ length: pageCount }, (_, i) => api<Asset[]>(`/uploads?limit=30&offset=${i * 30}`)))
      .then(pages => { if (active) { setAssets([...new Map(pages.flat().map(asset => [asset.id, asset])).values()]); setMore(pages[pages.length - 1].length === 30); setError(""); } })
      .catch(() => { if (active) setError("素材加载失败，请检查网络或后端服务。"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user, pageCount]);
  if (authLoading) return <div className="task-gallery-empty" role="status">正在检查登录状态…</div>;
  if (authError) return <div className="task-gallery-empty" role="alert">{authError}</div>;
  if (!user) return <div className="task-gallery-empty"><p>登录后即可查看元素库</p><Link href="/login" className="ws-gradient backend-start">登录</Link></div>;
  if (loading && !assets.length) return <div className="task-gallery-empty" role="status">正在加载素材…</div>;
  if (error && !assets.length) return <div className="task-gallery-empty" role="alert">{error}</div>;
  if (!assets.length) return <div className="task-gallery-empty"><p>暂无素材，上传参考图片后可在这里查看</p><Link href="/create" className="ws-gradient backend-start">开始创作</Link></div>;
  return <div className="task-gallery"><div className="asset-grid">{assets.map(asset => <a key={asset.id} href={asset.url} target="_blank" rel="noreferrer"><img src={asset.url} alt="已上传的图片" loading="lazy" decoding="async"/></a>)}</div>{error && <p className="task-gallery-error" role="alert">{error}</p>}{more && <button className="task-gallery-more" onClick={() => setPageCount(count => count + 1)}>加载更多</button>}</div>;
}
