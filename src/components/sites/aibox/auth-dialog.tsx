"use client";

import { useEffect, useState } from "react";
import { api, type BackendUser } from "@/lib/backend";

export function AuthDialog({ onClose, onSuccess }: { onClose: () => void; onSuccess: (user: BackendUser) => void }) {
  const [register, setRegister] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return <div className="auth-dialog-backdrop" onClick={onClose}>
    <section className="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-dialog-title" onClick={event => event.stopPropagation()}>
      <button type="button" className="auth-dialog-close" onClick={onClose} aria-label="关闭">×</button>
      <h2 id="auth-dialog-title">{register ? "创建 AIBox 账户" : "登录 AIBox"}</h2>
      <p>登录后即可生成作品和管理素材</p>
      <form onSubmit={async event => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        setPending(true); setMessage("");
        try {
          const account = await api<BackendUser>(`/auth/${register ? "register" : "login"}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: form.get("email"), password: form.get("password") }) });
          onSuccess(account);
        } catch (error) { setMessage(error instanceof Error ? error.message : "请求失败，请重试。"); }
        finally { setPending(false); }
      }}>
        <label>邮箱<input name="email" type="email" autoComplete="email" required autoFocus /></label>
        <label>密码<input name="password" type="password" autoComplete={register ? "new-password" : "current-password"} minLength={register ? 8 : undefined} required /></label>
        {message && <p className="auth-dialog-error" role="alert">{message}</p>}
        <button className="auth-dialog-submit" disabled={pending}>{pending ? "请稍候…" : register ? "注册" : "登录"}</button>
      </form>
      <p className="auth-dialog-switch">{register ? "已有账户？" : "还没有账户？"}<button type="button" onClick={() => { setRegister(!register); setMessage(""); }}>{register ? "立即登录" : "免费注册"}</button></p>
    </section>
  </div>;
}
