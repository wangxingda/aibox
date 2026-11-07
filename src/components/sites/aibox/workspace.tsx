/* eslint-disable @next/next/no-html-link-for-pages, @next/next/no-img-element */
"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api, ApiError, type BackendModel, type BackendTask, type BackendUser } from "@/lib/backend";
import { useRouter } from "next/navigation";
import { Home, Video, Image as ImageIcon, Gift, Images, FolderOpen, Lightbulb, Upload, Search, Menu, WandSparkles, ImagePlus, Clapperboard, UserRound, Move, Text, SlidersHorizontal, ChevronDown } from "lucide-react";
import "./workspace.css";
import { Inspiration } from "./inspiration";
import { ImageExamples } from "./image-examples";
import { VideoExamples, TextVideoExamples, type VideoExample } from "./video-examples";
import { TaskGallery } from "./task-gallery";
import { AssetGallery, WorkPicker, type Asset } from "./asset-gallery";
import { GenerationSettings } from "./generation-settings";
import { AuthDialog } from "./auth-dialog";

// Set to true when users can choose between multiple models.
const showModelSelector = false;

const ids = ["a1df404f5ed5", "40aed63c08a1", "16c20dac2be1", "ed780e17669d", "4bf2b8e050a8", "28f715287fe8", "ab6f36c40470", "1ea41ea468aa", "a49f110c9b9b", "8d0725f1dc8b", "edf0f92dc05e", "4de4c7d4c7ce", "5092d7cbbe66", "431c3d9efc85", "21afac7bba71", "2e24a7ba448a", "89ae9b1d2def", "50b2d010c35e", "0516cd6537d9", "49fbce36e39d"];
const names = ["形影不离", "老城路", "上路吧，老兄", "24K魔力", "资金灵活周转", "德雷克《烧毁桥梁》", "Migos的酒店大堂", "罗克斯伯里小伙子", "Bulin 47 自由式", "BbY WOW", "小镇男孩", "惊悚片", "训练季", "比莉·珍", "厄齐尔进球 AI 趋势", "惊悚风格切换", "暮光之城", "舞台破坏者", "百鬼演奏家", "宠物归来"];
const categories = ["热门趋势", "角色扮演🎬", "🎃有趣的万圣节", "Seedance", "互动", "史诗级蜕变", "产品营销", "趣味特效", "女孩潮流", "权威巨制", "ASMR", "逃脱行动", "一起跳舞", "2026 全新外观", "魔法宠物", "时光隧道✨", "Singing Pets", "音乐梗图"];
const toolSlugs = ["ai-genjutsu-video-edit", "ai-ad-generator", "ai-video-clone", "ai-avatar", "ai-product-avatar", "ai-motion-control", "florida-meme", "ai-virtual-try-on", "infinite-camera-angles", "ai-lip-sync", "ai-video-extender", "ai-video-enhancer"];
const tools = [["AI Genjutsu视频魔改", "随心改变视频人物与场景，让创意突破现实。"], ["AI广告生成器", "为您的网店制作吸引人的产品视频和促销海报。"], ["AI 视频广告克隆", "使用您的商品和参考视频，复刻爆款视频风格。"], ["AI数字人", "让任意角色自然开口并动起来，快速生成各类视频。"], ["AI商品数字人", "商品图直接生成出镜展示视频，省去真人拍摄。"], ["AI动作迁移", "用AI捕捉视频的运动信息，让不同角色复用同一套动作。"], ["AI佛罗里达梗", "一键随机生成佛罗里达梗视频。"], ["AI试穿", "在不同人物上虚拟试穿各种服装。"], ["无限机位视角", "普通视频秒变多机位大片。"], ["AI 对口型", "让照片人物跟随音频自然对口型。"], ["AI视频延长", "一键续接视频后续画面。"], ["AI视频画质增强", "在线提升视频清晰度与分辨率。"]];
const nav = [{name:"首页", href:"create", icon:Home}, {name:"灵感", href:"explore", icon:Lightbulb}, {name:"视频", href:"image-to-video", icon:Video}, {name:"图片", href:"text-to-image", icon:ImageIcon}, {name:"工作室", href:"ai-tools", icon:Gift}, {name:"玩法模板", href:"effects", icon:Images}, {name:"资产", href:"my", icon:FolderOpen}];
const videoTabs = [["图生音视频", "image-to-video"], ["文生音视频", "text-to-video"], ["角色替换", "character-replacement"], ["动作迁移", "motion-transfer"]];
const imageTabs = [["文生图", "text-to-image"], ["图片编辑", "image-edit"]];
const tabIcons: Record<string, typeof Video> = { "image-edit": WandSparkles, "text-to-image": ImagePlus, "image-to-video": Clapperboard, "text-to-video": Text, "character-replacement": UserRound, "motion-transfer": Move };
function UploadPreview({ file, size }: { file: File | null; size: number }) {
 const [preview, setPreview] = useState<{ file: File; url: string } | null>(null);
 useEffect(() => {
   if (!file) return;
   const reader = new FileReader();
   reader.onload = () => { if (typeof reader.result === "string") setPreview({ file, url: reader.result }); };
   reader.readAsDataURL(file);
   return () => { reader.onload = null; if (reader.readyState === FileReader.LOADING) reader.abort(); };
 }, [file]);
 return file && preview?.file === file ? <img className="upload-thumbnail" src={preview.url} alt="已上传的参考图片预览"  loading="lazy" decoding="async"/> : <Upload size={size} aria-hidden="true" />;
}
function VideoUploadPreview({ file, size }: { file: File | null; size: number }) {
 const videoRef = useRef<HTMLVideoElement>(null);
 useEffect(() => {
   if (!file || !videoRef.current) return;
   const url = URL.createObjectURL(file);
   videoRef.current.src = `${url}#t=0.1`;
   return () => URL.revokeObjectURL(url);
 }, [file]);
 return file ? <video ref={videoRef} className="upload-thumbnail" muted playsInline preload="metadata" aria-label="已上传的驱动视频预览" /> : <Video size={size} aria-hidden="true" />;
}
function MediaInput({ title, required, file, video = false, onFile, onChoose }: { title: string; required: boolean; file: File | null; video?: boolean; onFile: (file: File | null) => void; onChoose: () => void }) {
 const [hover, setHover] = useState<{ file: File; url: string; left: number; top: number } | null>(null);
 const previewUrl = useRef<string | null>(null);
 const closePreview = () => {
   if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
   previewUrl.current = null;
   setHover(null);
 };
 useEffect(() => () => { if (previewUrl.current) URL.revokeObjectURL(previewUrl.current); previewUrl.current = null; }, [file]);
 const openPreview = (element: HTMLElement) => {
   if (!file || previewUrl.current) return;
   const rect = element.getBoundingClientRect();
   const width = Math.min(360, window.innerWidth - 24);
   const height = Math.min(300, window.innerHeight - 24);
   const left = Math.max(12, Math.min(window.innerWidth - width - 12, rect.right + 12));
   const top = Math.max(12, Math.min(window.innerHeight - height - 12, rect.top));
   const url = URL.createObjectURL(file);
   previewUrl.current = url;
   setHover({ file, url, left, top });
 };
 return <div className="media-input">
   <div className="media-input-heading"><strong>{title}</strong><span className={`media-input-requirement ${required ? "is-required" : "is-optional"}`}>{required ? "必填" : "选填"}</span></div>
   <div className="media-input-preview" tabIndex={file ? 0 : undefined} onMouseEnter={event => openPreview(event.currentTarget)} onMouseLeave={closePreview} onFocus={event => openPreview(event.currentTarget)} onBlur={closePreview} aria-label={file ? `${title}，悬停预览` : title}>
     {video ? <VideoUploadPreview file={file} size={24}/> : <UploadPreview file={file} size={24}/>}
     <span className="media-input-name" title={file?.name || "尚未选择素材"}>{file?.name || "尚未选择素材"}</span>
   </div>
   <div className="media-input-actions">
     <label className="media-input-upload">上传<input type="file" accept={video ? "video/mp4,video/quicktime,video/webm" : "image/jpeg,image/png,image/webp"} onChange={event => { closePreview(); onFile(event.target.files?.[0] || null); }} onClick={event => { event.currentTarget.value = ""; }}/></label>
     <button type="button" className="media-input-import" onClick={onChoose}>从资产导入</button>
   </div>
   {file && <button type="button" className="media-input-remove" onClick={() => { closePreview(); onFile(null); }}>移除</button>}
   {hover && hover.file === file && createPortal(<div className="media-hover-preview" style={{ left: hover.left, top: hover.top }}>{video ? <video src={hover.url} autoPlay muted loop playsInline/> : <img src={hover.url} alt=""/>}</div>, document.body)}
 </div>;
}
export function Workspace({section}:{section:string}) {
 const router = useRouter();
 const submittingRef = useRef(false);
 const submissionRef = useRef<{fingerprint:string; key:string; inputFile:File|null; secondFile:File|null; videoFile:File|null; uploadId?:string; secondUploadId?:string; videoUploadId?:string} | null>(null);
 const [user,setUser]=useState<BackendUser|null>(null), [models,setModels]=useState<BackendModel[]>([]), [authLoading,setAuthLoading]=useState(true), [authError,setAuthError]=useState(""), [backendError,setBackendError]=useState(""), [sending,setSending]=useState(false), [inputFile,setInputFile]=useState<File|null>(null), [secondFile,setSecondFile]=useState<File|null>(null), [videoFile,setVideoFile]=useState<File|null>(null);
 const [authDialog,setAuthDialog]=useState(false);
 useEffect(()=>{ const requireLogin = () => { setUser(null); setAuthError(""); setAuthDialog(true); }; window.addEventListener("aibox:auth-required", requireLogin); return () => window.removeEventListener("aibox:auth-required", requireLogin); },[]);
 const requireAccount = () => { if (authLoading) { setBackendError("正在检查登录状态，请稍候。"); return false; } if (authError) { setBackendError(authError); return false; } if (!user) { setAuthDialog(true); return false; } return true; };
 useEffect(()=>{ api<BackendUser>("/auth/me").then(setUser).catch(error=>{setUser(null);if (!(error instanceof ApiError && error.status===401)) setAuthError("无法验证登录状态，请检查后端服务。");}).finally(()=>setAuthLoading(false)); api<BackendModel[]>("/models").then(setModels).catch(()=>setBackendError("无法获取可用模型，请检查后端服务。")); },[]);
 const [galleryVersion,setGalleryVersion]=useState(0);
 const [workKind,setWorkKind]=useState<"image"|"video">("image");
 const [assetPicker,setAssetPicker]=useState<"first"|"second"|"video"|null>(null);
 const [assetSource,setAssetSource]=useState<"works"|"library">("works");
 const selectAsset = async (asset: Asset) => {
   try {
     const response = await fetch(asset.url, { credentials: "same-origin" });
     if (response.status === 401) { setUser(null); setAssetPicker(null); setAuthDialog(true); return; }
     if (!response.ok) throw new Error("素材读取失败，请重试。");
     const blob = await response.blob();
     const contentType = (asset.content_type || blob.type).split(";", 1)[0].toLowerCase();
     const supported = assetPicker === "video" ? ["video/mp4", "video/quicktime", "video/webm"] : ["image/jpeg", "image/png", "image/webp"];
     if (!supported.includes(contentType)) throw new Error("该作品格式暂不支持作为输入素材，请选择其他作品。");
     const extension = contentType === "video/webm" ? "webm" : contentType === "video/quicktime" ? "mov" : contentType === "video/mp4" ? "mp4" : contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
     const selected = new File([blob], `素材.${extension}`, { type: contentType });
     if (assetPicker === "first") { setInputFile(selected); }
     else if (assetPicker === "second") setSecondFile(selected);
     else if (assetPicker === "video") setVideoFile(selected);
     setAssetPicker(null); setBackendError("");
   } catch (error) { setAssetPicker(null); setBackendError(error instanceof Error ? error.message : "素材读取失败，请重试。"); }
 };
 const [modelOpen,setModelOpen]=useState(false), [quality,setQuality]=useState("540P"), [ratio,setRatio]=useState("16:9"), [duration,setDuration]=useState("5s");
 const [mode,setMode]=useState("视频"), [tab,setTab]=useState(0), [prompt,setPrompt]=useState(""), [model,setModel]=useState(""), [settings,setSettings]=useState(false), [category,setCategory]=useState("热门趋势"), [search,setSearch]=useState("");
 const isImage=["image-edit","image-to-image","text-to-image"].includes(section), isVideo=["image-to-video","text-to-video","refer-to-video","video-to-video","frame-to-video","character-replacement","motion-transfer"].includes(section), tabs=isImage?imageTabs:videoTabs, activeNav=section==="create"?"首页":section==="explore"?"灵感":isVideo?"视频":isImage?"图片":section==="ai-tools"?"工作室":section==="effects"?"玩法模板":"资产";
 const taskKind = (isImage || (section === "create" && mode === "图片")) ? "image" : "video";
 const activeMode = section === "create" ? (mode === "图片" ? imageTabs[tab]?.[1] : videoTabs[tab]?.[1]) : section;
 const isTextVideo = activeMode === "text-to-video";
 const availableModels = models.filter(item => item.kind === taskKind && (!item.modes.length || item.modes.includes(activeMode)));
 const currentModel = availableModels.some(item => item.id === model) ? model : availableModels[0]?.id || "暂无可用模型";
 const selectedModel = availableModels.find(item => item.id === currentModel);
 const requiresFirstImage = activeMode === "image-to-video" || !!selectedModel?.requires_image;
 const settingsSummary = [selectedModel?.fixed_resolution ? "固定分辨率" : quality, selectedModel?.supported_ratios.length ? ratio : "比例随素材", ...(taskKind === "video" ? [selectedModel?.supported_durations.length ? duration : "时长随视频"] : [])].join("  |  ");
 const restoredRatio = useRef<string | null>(null);
 useEffect(()=>{ if (restoredRatio.current) { setRatio(restoredRatio.current); restoredRatio.current = null; } else if (selectedModel?.default_ratio) setRatio(selectedModel.default_ratio); },[selectedModel?.id, selectedModel?.default_ratio]);
 const editLoaded = useRef(false);
 useEffect(()=>{
   if (!user || !models.length || editLoaded.current) return;
   const id = new URLSearchParams(window.location.search).get("edit");
   if (!id) return;
   editLoaded.current = true;
   const load = async () => {
     try {
       const task = await api<BackendTask>(`/tasks/${encodeURIComponent(id)}`);
       const available = models.find(item => item.id === task.model && item.kind === task.kind && (!item.modes.length || item.modes.includes(section)));
       if (!available) throw new Error("原任务使用的模型在当前页面不可用，请重新选择模型。");
       const loadImage = async (uploadId: string | null | undefined, name: string) => {
         if (!uploadId) return null;
         const response = await fetch(`/api/uploads/${encodeURIComponent(uploadId)}/content`, { credentials: "same-origin" });
         if (!response.ok) throw new Error("原任务的参考图片无法读取，请重新上传。");
         const blob = await response.blob();
         return new File([blob], name, { type: blob.type });
       };
       const [first, second, video] = await Promise.all([loadImage(task.upload_id, "参考图片 1"), loadImage(task.options?.second_upload_id, "参考图片 2"), loadImage(task.options?.video_upload_id, "驱动视频.mp4")]);
       if (selectedModel?.id !== task.model && task.options?.ratio) restoredRatio.current = task.options.ratio;
       setModel(task.model); setPrompt(task.prompt); setInputFile(first); setSecondFile(second); setVideoFile(video);
       if (task.options?.quality) setQuality(task.options.quality);
       if (task.options?.ratio) setRatio(task.options.ratio);
       if (task.options?.duration) setDuration(task.options.duration);
       window.history.replaceState(null, "", window.location.pathname);
     } catch (error) { setBackendError(error instanceof Error ? error.message : "无法读取原任务。"); }
   };
   void load();
 },[user, models, section, selectedModel?.id]);
 const submitTask = async () => {
   if (!requireAccount()) return;
   if (!prompt.trim() && (selectedModel?.requires_prompt ?? true)) { setBackendError("请输入提示词。"); return; }
   if (!availableModels.length) { setBackendError("暂无可用模型，请先配置 ComfyUI 工作流。"); return; }
   if (!isTextVideo && requiresFirstImage && !inputFile) { setBackendError("请上传第一张参考图片。"); return; }
   if (selectedModel?.requires_video && !videoFile) { setBackendError("请上传驱动视频。"); return; }
   if (!isTextVideo && selectedModel?.requires_second_image && !secondFile) { setBackendError("请上传第二张参考图片。"); return; }
   if (selectedModel && prompt.trim().length > selectedModel.max_prompt_length) { setBackendError(`提示词不能超过 ${selectedModel.max_prompt_length} 个字符。`); return; }
   if (submittingRef.current) return;
   submittingRef.current = true; setSending(true); setBackendError("");
   try {
     const selectedInput = !isTextVideo && selectedModel?.supports_image ? inputFile : null;
     const selectedSecond = !isTextVideo && selectedModel?.supports_second_image ? secondFile : null;
     const selectedVideo = selectedModel?.supports_video ? videoFile : null;
     const fileKey = (file: File | null) => file && [file.name, file.size, file.lastModified, file.type];
     const fingerprint = JSON.stringify([taskKind, activeMode, currentModel, prompt.trim(), quality, ratio, duration, fileKey(selectedInput), fileKey(selectedSecond), fileKey(selectedVideo)]);
     if (!submissionRef.current || submissionRef.current.fingerprint !== fingerprint || submissionRef.current.inputFile !== selectedInput || submissionRef.current.secondFile !== selectedSecond || submissionRef.current.videoFile !== selectedVideo) {
       const bytes = new Uint8Array(16); crypto.getRandomValues(bytes);
       submissionRef.current = { fingerprint, inputFile:selectedInput, secondFile:selectedSecond, videoFile:selectedVideo, key: Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("") };
     }
     const submission = submissionRef.current;
     if (selectedInput && !submission.uploadId) { const form = new FormData(); form.append("file", selectedInput); const upload = await api<{id:string}>("/uploads", {method:"POST", body:form}); submission.uploadId = upload.id; }
     if (selectedSecond && !submission.secondUploadId) { const form = new FormData(); form.append("file", selectedSecond); const upload = await api<{id:string}>("/uploads", {method:"POST", body:form}); submission.secondUploadId = upload.id; }
     if (selectedVideo && !submission.videoUploadId) { const form = new FormData(); form.append("file", selectedVideo); const upload = await api<{id:string}>("/uploads/video", {method:"POST", body:form}); submission.videoUploadId = upload.id; }
     await api("/tasks", {method:"POST", headers:{"Content-Type":"application/json", "Idempotency-Key":submission.key}, body:JSON.stringify({kind:taskKind, model:currentModel, mode:activeMode, prompt, upload_id:submission.uploadId, second_upload_id:submission.secondUploadId, video_upload_id:submission.videoUploadId, quality, ratio, duration})});
     submissionRef.current = null; window.sessionStorage.setItem("aibox:task-submitted", "1"); setGalleryVersion(version=>version+1); if (isVideo || isImage) setTab(1);
   } catch (error) { setBackendError(error instanceof Error ? error.message : "提交失败"); }
   finally { submittingRef.current = false; setSending(false); }
 };
 const applyImageExample = async (example: { prompt: string; inputImage?: string }) => {
   setPrompt(example.prompt);
   if (!example.inputImage) return;
   try {
     const response = await fetch(example.inputImage);
     if (!response.ok) throw new Error("示例参考图片加载失败，请重试或上传自己的图片。");
     const blob = await response.blob();
     const reference = new File([blob], "示例参考图片.jpg", {type: blob.type || "image/jpeg"});
     setInputFile(reference); setSecondFile(null); setBackendError("");
   } catch (error) { setBackendError(error instanceof Error ? error.message : "示例参考图片加载失败，请重试。"); }
 };
 const applyVideoExample = async (example: VideoExample) => {
   try {
     const load = async (url: string | undefined, name: string) => {
       if (!url) return null;
       const response = await fetch(url);
       if (!response.ok) throw new Error("示例素材加载失败，请重试。");
       const blob = await response.blob();
       return new File([blob], name, { type: blob.type });
     };
     const extension = example.inputImage?.split(".").pop() || "png";
     const [image, video] = await Promise.all([load(example.inputImage, `示例参考图.${extension}`), load(example.inputVideo, "示例驱动视频.mp4")]);
     setPrompt(example.prompt); setInputFile(image); setSecondFile(null); setVideoFile(video); setBackendError("");
   } catch (error) { setBackendError(error instanceof Error ? error.message : "示例素材加载失败，请重试。"); }
 };
 const loginButton=()=>setAuthDialog(true);
 return <div className="workspace"><div className="ws-top"><a className="ws-logo" href="/">▣ <b>AI<span>Box</span></b></a><div>{user ? <><a href="/my">{user.email}</a><button onClick={async()=>{await api("/auth/logout",{method:"POST"});setUser(null);router.push("/create")}}>退出</button></> : <button onClick={loginButton}>登录</button>}</div></div><aside className="ws-side">{nav.map(({name,href,icon:Icon})=><a href={`/${href}`} onClick={event=>{if(href==="my"&&!requireAccount()) event.preventDefault()}} className={activeNav===name?"active":""} key={name}><Icon size={20}/><span>{name}</span></a>)}</aside><div className="ws-mobile-nav"><Menu size={20}/>{nav.map(n=><a key={n.name} href={`/${n.href}`} onClick={event=>{if(n.href==="my"&&!requireAccount()) event.preventDefault()}}>{n.name}</a>)}</div>

 <main className={`ws-main ${section==="create"?"ws-create":""}`}>{backendError && <div className="backend-error" role="alert">{backendError}<button onClick={()=>setBackendError("")} aria-label="关闭提示">×</button></div>}
 {section==="explore"&&<Inspiration/>}
 {section==="create"&&<><h1>一句话生成 AI 视频和图片</h1><div className="ws-mode">{["视频","图片"].map(m=><button className={mode===m?"selected":""} onClick={()=>{setMode(m);setTab(0)}} key={m}>{m==="视频"?<Video size={20}/>:<ImageIcon size={20}/>} {m}</button>)}</div><div className="create-box"><div className="create-tabs">{(mode==="视频"?videoTabs:imageTabs).map(([label,href],i)=>{const Icon=tabIcons[href]; return <button className={tab===i?"selected":""} onClick={()=>setTab(i)} key={label}>{Icon ? <Icon size={17}/> : "♧"} {label}</button>})}</div><div className="create-input">{!isTextVideo&&selectedModel?.supports_image&&<MediaInput title={"\u53c2\u8003\u56fe\u7247 1"} required={requiresFirstImage} file={inputFile} onFile={setInputFile} onChoose={()=>{if(requireAccount()) setAssetPicker("first");}}/>}
{!isTextVideo&&selectedModel?.supports_second_image&&<MediaInput title={"\u53c2\u8003\u56fe\u7247 2"} required={selectedModel.requires_second_image} file={secondFile} onFile={setSecondFile} onChoose={()=>{if(requireAccount()) setAssetPicker("second");}}/>}
{selectedModel?.supports_video&&<MediaInput title={"\u9a71\u52a8\u89c6\u9891\uff08\u6700\u5927 100 MB\uff09"} required={selectedModel.requires_video} video file={videoFile} onFile={setVideoFile} onChoose={()=>{if(requireAccount()) setAssetPicker("video");}}/>}<textarea value={prompt} onChange={e=>setPrompt(e.target.value)} placeholder={taskKind === "image" ? "描述你想要生成的图片。" : isTextVideo ? "描述你想要生成的视频画面、动作和镜头。" : "让这张图片自然地动起来。"} maxLength={selectedModel?.max_prompt_length || 8000}/></div><div className="create-bottom">{showModelSelector&&<button onClick={()=>setModelOpen(!modelOpen)}>▣ {currentModel} ⌄</button>}<div className="generation-settings-anchor generation-anchor-create"><button type="button" className="generation-settings-trigger" aria-expanded={settings} onClick={()=>setSettings(!settings)}><SlidersHorizontal size={16} aria-hidden="true"/><span>{settingsSummary}</span><ChevronDown size={16} className={settings?"is-open":""} aria-hidden="true"/></button>{settings&&<div className="generation-settings-popover generation-settings-create"><GenerationSettings kind={taskKind} quality={quality} ratio={ratio} duration={duration} fixedResolution={selectedModel?.fixed_resolution ?? true} resolutionLabel={selectedModel?.resolution_label || "选择模型后显示"} supportedQualities={selectedModel?.supported_qualities || []} supportedRatios={selectedModel?.supported_ratios || []} supportedDurations={selectedModel?.supported_durations || []} onQualityChange={setQuality} onRatioChange={setRatio} onDurationChange={setDuration} /></div>}</div><button className="create-generate" onClick={submitTask} disabled={sending}>{sending?"正在提交…":"立即生成"}</button></div>{showModelSelector&&modelOpen&&<div className="ws-popover model-list">{availableModels.length ? availableModels.map(m=><button key={m.id} onClick={()=>{setModel(m.id);setModelOpen(false)}}>{m.id}</button>) : <span>暂无可用模型，请先配置工作流</span>}</div>}</div><div className="try-templates"><p>试试这些模板</p><div>{ids.slice(0,4).map((id,i)=><a href="/effects" key={id}><img src={`/sites/aibox/${id}.webp`} alt={names[i]} loading="lazy" decoding="async"/><span>{["非洲裔特工的夜生活","清爽康普茶","闪耀自拍趣转","赛道女王"][i]}</span></a>)}</div></div></>}
 {section==="create" && galleryVersion>0 && <div className="create-recent-tasks"><h2>我的作品</h2><TaskGallery onAuthRequired={()=>setAuthDialog(true)} key={galleryVersion} user={user} authLoading={authLoading} authError={authError} kind={taskKind}/></div>}
 {(isVideo||isImage)&&<div className="editor-layout"><div className="editor-left"><div className="editor-tabs">{tabs.map(([label,href])=>{const Icon=tabIcons[href]; return <a className={section===href?"selected":""} href={`/${href}`} key={href}>{Icon && <Icon size={17}/>} {label}</a>})}</div>{showModelSelector&&<button className="model-select" onClick={()=>setModelOpen(!modelOpen)}><small>模型</small><b>✦　{currentModel}</b><span>›</span></button>}{showModelSelector&&modelOpen&&<div className="editor-models">{availableModels.length ? availableModels.map(m=><button key={m.id} onClick={()=>{setModel(m.id);setModelOpen(false)}}>{m.id}</button>) : <span>暂无可用模型，请先配置工作流</span>}</div>}{!isTextVideo&&selectedModel?.supports_image&&<MediaInput title={"\u53c2\u8003\u56fe\u7247 1"} required={requiresFirstImage} file={inputFile} onFile={setInputFile} onChoose={()=>{if(requireAccount()) setAssetPicker("first");}}/>}
{!isTextVideo&&selectedModel?.supports_second_image&&<MediaInput title={"\u53c2\u8003\u56fe\u7247 2"} required={selectedModel.requires_second_image} file={secondFile} onFile={setSecondFile} onChoose={()=>{if(requireAccount()) setAssetPicker("second");}}/>}
{selectedModel?.supports_video&&<MediaInput title={"\u9a71\u52a8\u89c6\u9891\uff08\u6700\u5927 100 MB\uff09"} required={selectedModel.requires_video} video file={videoFile} onFile={setVideoFile} onChoose={()=>{if(requireAccount()) setAssetPicker("video");}}/>}<div className="editor-prompt"><label>{isImage?"输入照片提示词":selectedModel?.requires_prompt === false?"提示词（选填）":"提示词"}</label><textarea value={prompt} onChange={e=>setPrompt(e.target.value)} maxLength={selectedModel?.max_prompt_length || 8000} placeholder={section==="text-to-image"?"描述你想要生成的图片。":isImage?"移除桌上的物体并清理画面。":section==="text-to-video"?"描述你想要生成的视频画面、动作和镜头。":"在保持图像风格不变的前提下，添加电影感运镜和柔和光效。"}/><small>{prompt.length}/{selectedModel?.max_prompt_length || (isImage?3000:8000)}</small></div><div className="generation-settings-anchor generation-anchor-editor"><button type="button" className="generation-settings-trigger" aria-expanded={settings} onClick={()=>setSettings(!settings)}><SlidersHorizontal size={16} aria-hidden="true"/><span>{settingsSummary}</span><ChevronDown size={16} className={settings?"is-open":""} aria-hidden="true"/></button>{settings&&<div className="generation-settings-popover generation-settings-editor"><GenerationSettings kind={taskKind} quality={quality} ratio={ratio} duration={duration} fixedResolution={selectedModel?.fixed_resolution ?? true} resolutionLabel={selectedModel?.resolution_label || "选择模型后显示"} supportedQualities={selectedModel?.supported_qualities || []} supportedRatios={selectedModel?.supported_ratios || []} supportedDurations={selectedModel?.supported_durations || []} onQualityChange={setQuality} onRatioChange={setRatio} onDurationChange={setDuration} /></div>}</div><button className="editor-generate" onClick={submitTask} disabled={sending}>{sending?"正在提交…":"立即生成"}</button></div><div className="editor-right"><div className="result-tabs"><button className={tab===0?"selected":""} onClick={()=>setTab(0)}>参考示例</button><button className={tab===1?"selected":""} onClick={()=>{if(requireAccount()) setTab(1)}}>我的作品</button></div>{tab===0?(isImage?<ImageExamples key={section} edit={section!=="text-to-image"} onApply={example=>void applyImageExample(example)}/>:isTextVideo?<TextVideoExamples onApply={setPrompt}/>:<VideoExamples key={section} mode={section==="character-replacement"?"replacement":section==="motion-transfer"?"motion":"reference"} onApply={applyVideoExample}/>):<TaskGallery onAuthRequired={()=>setAuthDialog(true)} key={galleryVersion} user={user} authLoading={authLoading} authError={authError} kind={isImage?"image":"video"}/>}</div></div>}
 {section==="ai-tools"&&<div className="tools-page"><h2>AI <span>工具</span></h2><p>探索智能工具箱，一键简化复杂的视频处理</p><h3>工作室</h3><div className="studio-cards">{["营销工作室","Avatar Studio"].map((x,i)=><a href={`/ai-tools/${i?"ai-avatar-studio":"marketing-studio"}`} key={x}><img src={`/sites/aibox/${ids[i+3]}.webp`} alt="" loading="lazy" decoding="async"/><div><b>{x}</b><p>{i?"创建富有表现力的 AI 虚拟形象，让它们开口说话、灵活动作、精准对口型，并展示您的产品。":"创建能带来销售并可规模化的 AI 视觉内容"}</p><small>探索更多</small></div></a>)}</div><h3>所有工具</h3><div className="tools-grid">{tools.map(([title,desc],i)=><a href={`/ai-tools/${toolSlugs[i]}`} key={title}><img src={`/sites/aibox/${ids[i]}.webp`} alt="" loading="lazy" decoding="async"/><b>{title}</b><p>{desc}</p></a>)}</div></div>}
 {section==="effects"&&<div className="effects-page"><div className="effects-heading"><h2>AI<span>玩法</span></h2><label><Search size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="搜索模板..."/></label></div><div className="categories">{categories.map(c=><button className={c===category?"active":""} onClick={()=>setCategory(c)} key={c}>{c}</button>)}</div><div className="effects-grid">{ids.map((id,i)=>({id,name:names[i]})).filter(x=>x.name.toLowerCase().includes(search.toLowerCase())).map(({id,name})=><button key={id} onClick={loginButton}><img src={`/sites/aibox/${id}.webp`} alt={name} loading="lazy" decoding="async"/><span>{name}</span><em>一键同款</em></button>)}</div></div>}
 {(section==="my"||section==="assets")&&<div className="assets-page"><div className="assets-tabs"><a className={section==="my"?"active":""} href="/my" onClick={event=>{if(!requireAccount()) event.preventDefault()}}>我的作品</a><a className={section==="assets"?"active":""} href="/assets" onClick={event=>{if(!requireAccount()) event.preventDefault()}}>元素库</a></div>{section==="my" ? <> <div className="asset-filters">{(["image","video"] as const).map(value=><button key={value} className={workKind===value?"selected":""} onClick={()=>{if(requireAccount()) setWorkKind(value)}}>{value==="image"?"\u56fe\u7247":"\u89c6\u9891"}</button>)}</div><TaskGallery onAuthRequired={()=>setAuthDialog(true)} key={workKind} kind={workKind} user={user} authLoading={authLoading} authError={authError}/></> : <AssetGallery onAuthRequired={()=>setAuthDialog(true)} user={user} authLoading={authLoading} authError={authError}/>}</div>}
 {assetPicker&&<div className="asset-picker-overlay" onClick={()=>setAssetPicker(null)}><div className="asset-picker-dialog" role="dialog" aria-modal="true" aria-label="从资产导入" onClick={event=>event.stopPropagation()}><header><b>从资产导入</b><button type="button" onClick={()=>setAssetPicker(null)} aria-label="关闭">×</button></header><div className="asset-filters">{(["works","library"] as const).map(source=><button type="button" key={source} className={assetSource===source?"selected":""} aria-pressed={assetSource===source} onClick={()=>setAssetSource(source)}>{source==="works"?"我的作品":"元素库"}</button>)}</div>{assetSource==="works"?<WorkPicker key={assetPicker} user={user} authLoading={authLoading} authError={authError} kind={assetPicker==="video"?"video":"image"} onSelect={asset=>void selectAsset(asset)}/>:<AssetGallery key={assetPicker} user={user} authLoading={authLoading} authError={authError} selectKind={assetPicker==="video"?"video":"image"} onSelect={asset=>void selectAsset(asset)}/>}</div></div>}
 {authDialog&&<AuthDialog onClose={()=>setAuthDialog(false)} onSuccess={account=>{setUser(account);setAuthError("");setBackendError("");setAuthDialog(false)}}/>}
 </main></div>
}
