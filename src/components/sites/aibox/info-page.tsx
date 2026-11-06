import Link from "next/link";
import "./info-page.css";

export function InfoPage({ title, description, action = "开始创作", href = "/create" }: { title: string; description: string; action?: string; href?: string }) {
  return <main className="info-page"><div className="info-nav"><Link href="/">▣ AI<span>Box</span></Link><nav><Link href="/create">创作首页</Link><Link href="/ai-tools">工作室</Link><Link href="/effects">玩法模板</Link><Link href="/login">登录</Link></nav></div><section><Link className="info-back" href="/create">← 返回创作首页</Link><div className="info-content"><span className="info-tag">AIBox</span><h1>{title}</h1><p>{description}</p><Link className="info-action" href={href}>{action} →</Link></div></section></main>;
}
