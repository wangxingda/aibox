/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, Search, Sparkles, X } from "lucide-react";
import "./inspiration.css";

const asset = (name: string) => `/sites/light-explore/${name}`;
const categories = ["全部", "数字人", "图生音视频", "文生音视频", "全能参考生视频", "角色替换 / 动作迁移", "图生视频（无声）", "首尾帧生视频（无声）", "视频画质修复", "文生图", "图生图", "图片画质修复"];
const showcases = [
  { image: "asset-12.jpg", category: "数字人" }, { image: "asset-13.jpg", category: "图生音视频" }, { image: "asset-14.png", category: "文生图" },
  { image: "asset-15.jpg", category: "角色替换 / 动作迁移" }, { image: "asset-16.png", category: "文生图" }, { image: "asset-17.jpg", category: "数字人" },
  { image: "asset-18.jpg", category: "图生音视频", title: "竹林幻影：萌娃与白狗的对决" }, { image: "asset-19.jpg", category: "数字人" }, { image: "asset-20.jpg", category: "数字人" },
  { image: "asset-21.jpg", category: "文生音视频" }, { image: "asset-22.jpg", category: "角色替换 / 动作迁移" }, { image: "asset-23.jpg", category: "图生音视频" },
  { image: "asset-24.jpg", category: "文生音视频" }, { image: "asset-25.png", category: "文生图" }, { image: "asset-26.jpg", category: "图生音视频" },
];
type Showcase = (typeof showcases)[number];
const slides = [
  { image: "asset-0.jpg", eyebrow: "全新模型", title: "MiniMax H3 正式上线", description: "原生声画同步，更自然的镜头、动作与声音。", href: "/image-to-video" },
  { image: "asset-1.jpg", eyebrow: "最近更新", title: "在对话中进行创作", description: "从一个想法开始，探索图片与视频创作。", href: "/create" },
  { image: "asset-2.jpg", eyebrow: "创作灵感", title: "探索数字人创作", description: "发现角色口播与视频创作的更多可能。", href: "/ai-tools/ai-avatar" },
  { image: "asset-3.jpg", eyebrow: "创作灵感", title: "让角色生动起来", description: "用创意和画面讲述属于你的故事。", href: "/image-to-video" },
  { image: "asset-4.jpg", eyebrow: "创作推荐", title: "编排你的创作流程", description: "从灵感出发，探索更多创作方式。", href: "/ai-tools" },
];
const shortcuts = [
  { title: "创作首页", description: "用创意开启新的创作", image: "asset-6.png", href: "/create" },
  { title: "数字人", description: "角色口播与数字人", image: "asset-7.png", href: "/ai-tools/ai-avatar" },
  { title: "视频生成", description: "从文字或图片生成视频", image: "asset-8.png", href: "/image-to-video" },
  { title: "图像生成", description: "文字与参考图生成", image: "asset-9.png", href: "/text-to-image" },
  { title: "动作控制", description: "角色替换与动作迁移", image: "asset-10.png", href: "/ai-tools/ai-motion-control" },
  { title: "工作室", description: "探索更多创作工具", image: "asset-11.png", href: "/ai-tools" },
];
function destination(item: Showcase) {
  if (item.category === "文生图") return "/text-to-image";
  if (item.category === "数字人") return "/ai-tools/ai-avatar";
  if (item.category === "角色替换 / 动作迁移") return "/ai-tools/ai-motion-control";
  return item.category === "文生音视频" ? "/text-to-video" : "/image-to-video";
}

export function Inspiration() {
  const [slide, setSlide] = useState(0);
  const [category, setCategory] = useState("全部");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Showcase | null>(null);
  useEffect(() => {
    const timer = window.setInterval(() => setSlide(current => (current + 1) % slides.length), 7000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!selected) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setSelected(null); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [selected]);
  const visible = showcases.filter(item => (category === "全部" || item.category === category) && `${item.title || ""} ${item.category}`.toLowerCase().includes(query.trim().toLowerCase()));
  const current = slides[slide];
  return <div className="inspiration">
    <div className="inspiration-banners">
      <div className="inspiration-banner" style={{ backgroundImage: `url(${asset(current.image)})` }}>
        <Link href={current.href} className="banner-copy"><small>{current.eyebrow}</small><strong>{current.title}</strong><span>{current.description}</span><b>▶　立即体验</b></Link>
        <div className="banner-controls"><button aria-label="上一张" onClick={() => setSlide((slide + slides.length - 1) % slides.length)}><ChevronLeft size={16}/></button><div>{slides.map((item, index) => <button key={item.title} className={slide === index ? "active" : ""} onClick={() => setSlide(index)} aria-label={`切换到第 ${index + 1} 张`}/>)}</div><button aria-label="下一张" onClick={() => setSlide((slide + 1) % slides.length)}><ChevronRight size={16}/></button></div>
      </div>
      <Link href="/effects" className="inspiration-banner secondary" style={{ backgroundImage: `url(${asset("asset-5.jpg")})` }}><div className="banner-copy"><small>发现精彩</small><strong>寻找你的创作灵感</strong><span>探索更多创意作品，让新的想法从这里开始。</span><b>探索玩法　›</b></div></Link>
    </div>
    <div className="inspiration-shortcuts">{shortcuts.map(item => <Link href={item.href} key={item.title}><img src={asset(item.image)} alt="" loading="lazy" decoding="async"/><span><b>{item.title}</b><small>{item.description}</small></span><ArrowRight size={16}/></Link>)}</div>
    <div className="inspiration-filters"><div className="inspiration-categories" aria-label="作品分类">{categories.map(item => <button key={item} className={category === item ? "active" : ""} aria-pressed={category === item} onClick={() => setCategory(item)}>{item}</button>)}</div><label className="inspiration-search"><Search size={17}/><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索灵感..." aria-label="搜索灵感"/></label></div>
    {visible.length ? <div className="inspiration-grid">{visible.map(item => <button className="inspiration-card" key={item.image} onClick={() => setSelected(item)} aria-label={item.title || item.category}><img src={asset(item.image)} alt="" loading="lazy" decoding="async"/><span><b>{item.title || item.category}</b><small>查看灵感　↗</small></span></button>)}</div> : <div className="inspiration-empty"><Sparkles size={26}/><p>没有找到相关灵感</p><button onClick={() => { setCategory("全部"); setQuery(""); }}>查看全部作品</button></div>}
    {selected && <div className="inspiration-overlay" onClick={() => setSelected(null)}><div className="inspiration-dialog" role="dialog" aria-modal="true" aria-labelledby="inspiration-detail-title" onClick={event => event.stopPropagation()}><button className="inspiration-close" onClick={() => setSelected(null)} aria-label="关闭详情"><X size={20}/></button><div className="inspiration-dialog-image"><img src={asset(selected.image)} alt={selected.title || selected.category} loading="lazy" decoding="async"/></div><div className="inspiration-dialog-content"><span className="detail-kicker"><ArrowLeft size={15}/> 灵感详情</span><h2 id="inspiration-detail-title">{selected.title || selected.category}</h2><p className="detail-tag">{selected.category}</p><p>探索这个创意方向，前往创作页面尝试属于你的作品。</p><Link href={destination(selected)} className="detail-action">开始创作 <ArrowRight size={17}/></Link></div></div></div>}
  </div>;
}
