"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { showPageNotice, showFormValidation } from "./page-notice";
import { DiandianLogin } from "./diandian-login";
import { api } from "@/lib/backend";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import "./auth.css";

export function Auth({ register = false }: { register?: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [visible, setVisible] = useState(false);
  return <main className="auth-page">
    <Link href="/" className="auth-logo" aria-label="AIBox 首页">▣ AI<span>Box</span></Link>
    <section className="auth-card">
      <Link className="auth-back" href="/create">← 返回创作</Link>
      <div className="auth-mark">✦</div>
      <h1>{register ? "创建 AIBox 账户" : "欢迎回来"}</h1>
      <p className="auth-subtitle">{register ? "注册后开始你的 AI 创作之旅" : "登录以继续创作和查看你的作品"}</p>
      <form method="post" onInvalid={showFormValidation} onSubmit={async event => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        setPending(true);
        try {
          await api(`/auth/${register ? "register" : "login"}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: form.get("email"), password: form.get("password") }) });
          router.push("/create"); router.refresh();
        } catch (error) { showPageNotice(error instanceof Error ? error.message : "请求失败"); }
        finally { setPending(false); }
      }}>
        <label htmlFor="email">邮箱</label>
        <input id="email" name="email" type="email" autoComplete="email" placeholder="请输入邮箱地址" required />
        <label htmlFor="password">密码</label>
        <div className="auth-password"><input id="password" name="password" type={visible ? "text" : "password"} autoComplete={register ? "new-password" : "current-password"} placeholder={register ? "请输入至少 8 位密码" : "请输入密码"} minLength={register ? 8 : undefined} required /><button type="button" onClick={() => setVisible(!visible)} aria-label={visible ? "隐藏密码" : "显示密码"}>{visible ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div>
        <button className="auth-submit" type="submit" disabled={pending}>{pending ? "请稍候…" : register ? "注册" : "登录"}</button>
      </form>
      <DiandianLogin />
      <p className="auth-switch">{register ? "已有账户？" : "还没有账户？"} <Link href={register ? "/login" : "/register"}>{register ? "立即登录" : "免费注册"}</Link></p>
      <Link className="auth-external" href="/create">返回创作首页</Link>
    </section>
  </main>;
}
