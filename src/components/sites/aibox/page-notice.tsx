"use client";
import { useEffect, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { CircleAlert, Check, X } from "lucide-react";
import "./page-notice.css";

export function showPageNotice(message: string, kind: "info" | "success" = "info") {
  if (message) window.dispatchEvent(new CustomEvent("aibox:notice", {detail:{message,kind}}));
}
export function showFormValidation(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || event.currentTarget.querySelector(":invalid") !== input) return;
  const label = input.name === "email" ? "邮箱地址" : input.name === "password" ? "密码" : "内容";
  const message = input.validity.valueMissing ? `请输入${label}。` : input.validity.typeMismatch ? "请输入有效的邮箱地址。" : input.validity.tooShort ? `密码至少需要 ${input.minLength} 位。` : "请检查输入内容。";
  showPageNotice(message); input.focus();
}
export function PageNotice() {
  const [notice, setNotice] = useState<{message:string; kind:"info" | "success"} | null>(null);
  useEffect(() => {
    const receive = (event: Event) => setNotice((event as CustomEvent<{message:string; kind:"info" | "success"}>).detail);
    window.addEventListener("aibox:notice", receive);
    return () => window.removeEventListener("aibox:notice", receive);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 2000);
    return () => window.clearTimeout(timer);
  }, [notice]);
  return notice ? createPortal(<div className="page-notice-backdrop"><div className={`page-notice page-notice-${notice.kind}`} role={notice.kind === "success" ? "status" : "alert"}>{notice.kind === "success" ? <Check size={20} aria-hidden="true"/> : <CircleAlert size={20} aria-hidden="true"/>}<b>{notice.message}</b><button type="button" onClick={()=>setNotice(null)} aria-label="关闭通知"><X size={16}/></button></div></div>, document.body) : null;
}
