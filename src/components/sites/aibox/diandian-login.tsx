import Image from "next/image";
import "./diandian-login.css";

export function DiandianLogin() {
  // OAuth requires a full browser navigation through the backend redirect.
  // eslint-disable-next-line @next/next/no-html-link-for-pages
  return <a className="diandian-login" href="/api/auth/hits/start">
    <span className="diandian-login-icon"><Image src="/sites/aibox/diandian-logo.svg" alt="" width={24} height={21} /></span>
    <span>使用点点网账号登录</span>
  </a>;
}
