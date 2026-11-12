/* eslint-disable @next/next/no-html-link-for-pages, @next/next/no-img-element */
"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api, ApiError, type BackendModel, type BackendTask, type BackendUser } from "@/lib/backend";
import { useRouter } from "next/navigation";
import { Home, Video, Image as ImageIcon, Gift, Images, FolderOpen, Lightbulb, Upload, Search, Menu, WandSparkles, ImagePlus, Clapperboard, UserRound, Move, Text, SlidersHorizontal, ChevronDown, Sparkles, CircleAlert, X } from "lucide-react";
import "./workspace.css";
import { Inspiration } from "./inspiration";
import { ImageExamples } from "./image-examples";
import { VideoExamples, TextVideoExamples, type VideoExample } from "./video-examples";
import { TaskGallery } from "./task-gallery";
import { AssetGallery, WorkPicker, type Asset } from "./asset-gallery";
import { GenerationSettings } from "./generation-settings";
import { AuthDialog } from "./auth-dialog";
import { studioTools, studios, type StudioTool } from "./studio-data";

// Set to true when users can choose between multiple models.
const showModelSelector = false;

const ids = ["a1df404f5ed5", "40aed63c08a1", "16c20dac2be1", "ed780e17669d", "4bf2b8e050a8", "28f715287fe8", "ab6f36c40470", "1ea41ea468aa", "a49f110c9b9b", "8d0725f1dc8b", "edf0f92dc05e", "4de4c7d4c7ce", "5092d7cbbe66", "431c3d9efc85", "21afac7bba71", "2e24a7ba448a", "89ae9b1d2def", "50b2d010c35e", "0516cd6537d9", "49fbce36e39d"];
const names = ["形影不离", "老城路", "上路吧，老兄", "24K魔力", "资金灵活周转", "德雷克《烧毁桥梁》", "Migos的酒店大堂", "罗克斯伯里小伙子", "Bulin 47 自由式", "BbY WOW", "小镇男孩", "惊悚片", "训练季", "比莉·珍", "厄齐尔进球 AI 趋势", "惊悚风格切换", "暮光之城", "舞台破坏者", "百鬼演奏家", "宠物归来"];
type EffectTemplate = {id:string; title:string; category:string; mode:string; prompt:string; image:string; inputImage:string|null; inputVideo?:string; ratio?:string; duration?:string; width:number; height:number; source:string};
const categories = ["全部", "文生图", "图片编辑", "文生视频", "图生视频", "数字人", "动作迁移", "参考视频"];

const nav = [{name:"首页", href:"create", icon:Home}, {name:"灵感", href:"explore", icon:Lightbulb}, {name:"视频", href:"image-to-video", icon:Video}, {name:"图片", href:"text-to-image", icon:ImageIcon}, {name:"工作室", href:"ai-tools", icon:Gift}, {name:"玩法模板", href:"effects", icon:Images}, {name:"资产", href:"my", icon:FolderOpen}];
const videoTabs = [["文生音视频", "text-to-video"], ["图生音视频", "image-to-video"], ["角色替换", "character-replacement"], ["动作迁移", "motion-transfer"]];
const imageTabs = [["文生图", "text-to-image"], ["图片编辑", "image-edit"]];
const tabIcons: Record<string, typeof Video> = { "image-edit": WandSparkles, "text-to-image": ImagePlus, "image-to-video": Clapperboard, "text-to-video": Text, "character-replacement": UserRound, "motion-transfer": Move };
const systemExampleFiles = new WeakMap<File, string>();
async function uploadMedia(file: File, video = false): Promise<{id:string}> {
 const source = systemExampleFiles.get(file);
 if (source) return api<{id:string}>("/example-assets", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({filename:source.split("/").pop(), collection:source.includes("/templates/") ? "templates" : "examples"})});
 const form = new FormData(); form.append("file", file);
 return api<{id:string}>(video ? "/uploads/video" : "/uploads", {method:"POST", body:form});
}
function UploadPreview({ file, size }: { file: File | null; size: number }) {
 const [preview, setPreview] = useState<{ file: File; url: string } | null>(null);
 useEffect(() => {
   if (!file) return;
   if (systemExampleFiles.has(file)) return;
   const reader = new FileReader();
   reader.onload = () => { if (typeof reader.result === "string") setPreview({ file, url: reader.result }); };
   reader.readAsDataURL(file);
   return () => { reader.onload = null; if (reader.readyState === FileReader.LOADING) reader.abort(); };
 }, [file]);
 const imageUrl = file ? systemExampleFiles.get(file) || (preview?.file === file ? preview.url : null) : null;
 return imageUrl ? <img className="upload-thumbnail" src={imageUrl} alt="已上传的参考图片预览"  loading="lazy" decoding="async"/> : <Upload size={size} aria-hidden="true" />;
}
function VideoUploadPreview({ file, size }: { file: File | null; size: number }) {
 const videoRef = useRef<HTMLVideoElement>(null);
 useEffect(() => {
   if (!file || !videoRef.current) return;
   const url = systemExampleFiles.get(file) || URL.createObjectURL(file);
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
   const url = systemExampleFiles.get(file) || URL.createObjectURL(file);
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
export function Workspace({section, tool, studio}:{section:string; tool?:StudioTool; studio?:string}) {
 const router = useRouter();
 const submittingRef = useRef(false);
 const mediaRequest = useRef(0);
 const submissionRef = useRef<{fingerprint:string; key:string; inputFile:File|null; secondFile:File|null; videoFile:File|null; uploadId?:string; secondUploadId?:string; videoUploadId?:string} | null>(null);
 const [user,setUser]=useState<BackendUser|null>(null), [models,setModels]=useState<BackendModel[]>([]), [authLoading,setAuthLoading]=useState(true), [authError,setAuthError]=useState(""), [backendError,setBackendError]=useState(""), [sending,setSending]=useState(false), [inputFile,setInputFile]=useState<File|null>(null), [secondFile,setSecondFile]=useState<File|null>(null), [videoFile,setVideoFile]=useState<File|null>(null);
 const [authDialog,setAuthDialog]=useState(false);
 const [creditNotice, setCreditNotice] = useState("");
 useEffect(() => { if (!creditNotice) return; const timer = window.setTimeout(() => setCreditNotice(""), 2000); return () => window.clearTimeout(timer); }, [creditNotice]);
 useEffect(()=>{ const requireLogin = () => { setUser(null); setAuthError(""); setAuthDialog(true); }; window.addEventListener("aibox:auth-required", requireLogin); return () => window.removeEventListener("aibox:auth-required", requireLogin); },[]);
 const requireAccount = () => { if (authLoading) { setBackendError("正在检查登录状态，请稍候。"); return false; } if (authError) { setBackendError(authError); return false; } if (!user) { setAuthDialog(true); return false; } return true; };
 useEffect(()=>{ api<BackendUser>("/auth/me").then(setUser).catch(error=>{setUser(null);if (!(error instanceof ApiError && error.status===401)) setAuthError("无法验证登录状态，请检查后端服务。");}).finally(()=>setAuthLoading(false)); api<BackendModel[]>("/models").then(setModels).catch(()=>setBackendError("无法获取可用模型，请检查后端服务。")); },[]);
 const [effectTemplates, setEffectTemplates] = useState<EffectTemplate[] | null>(null);
 const [effectsError, setEffectsError] = useState("");
 const [effectsCount, setEffectsCount] = useState(24);
 const effectsSentinel = useRef<HTMLDivElement>(null);
 useEffect(() => {
   if (section !== "effects") return;
   const controller = new AbortController();
   fetch("/sites/aibox/effects-catalog.json", {signal:controller.signal})
     .then(response => { if (!response.ok) throw new Error("模板加载失败，请刷新重试。"); return response.json() as Promise<EffectTemplate[]>; })
     .then(items => setEffectTemplates(items))
     .catch(error => { if (!controller.signal.aborted) setEffectsError(error instanceof Error ? error.message : "模板加载失败，请刷新重试。"); });
   return () => controller.abort();
 }, [section]);
 const [galleryVersion,setGalleryVersion]=useState(0);
 const [workKind,setWorkKind]=useState<"all"|"video"|"image">("all");
 const [assetPicker,setAssetPicker]=useState<"first"|"second"|"video"|null>(null);
 const [assetSource,setAssetSource]=useState<"works"|"library">("works");
 const selectAsset = async (asset: Asset) => {
   const request = ++mediaRequest.current;
   try {
     const response = await fetch(asset.url, { credentials: "same-origin" });
     if (response.status === 401) { setUser(null); setAssetPicker(null); setAuthDialog(true); return; }
     if (!response.ok) throw new Error("素材读取失败，请重试。");
     const blob = await response.blob();
     if (request !== mediaRequest.current) return;
     const contentType = (asset.content_type || blob.type).split(";", 1)[0].toLowerCase();
     const supported = assetPicker === "video" ? ["video/mp4", "video/quicktime", "video/webm"] : ["image/jpeg", "image/png", "image/webp"];
     if (!supported.includes(contentType)) throw new Error("该作品格式暂不支持作为输入素材，请选择其他作品。");
     const extension = contentType === "video/webm" ? "webm" : contentType === "video/quicktime" ? "mov" : contentType === "video/mp4" ? "mp4" : contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
     const selected = new File([blob], `素材.${extension}`, { type: contentType });
     if (assetPicker === "first") { setInputFile(selected); }
     else if (assetPicker === "second") setSecondFile(selected);
     else if (assetPicker === "video") setVideoFile(selected);
     setAssetPicker(null); setBackendError("");
   } catch (error) { if (request === mediaRequest.current) { setAssetPicker(null); setBackendError(error instanceof Error ? error.message : "素材读取失败，请重试。"); } }
 };
 const [modelOpen,setModelOpen]=useState(false), [quality,setQuality]=useState("540P"), [ratio,setRatio]=useState("16:9"), [duration,setDuration]=useState("5s");
 const [mode,setMode]=useState("视频"), [tab,setTab]=useState(0), [prompt,setPrompt]=useState(tool?.prompt || ""), [model,setModel]=useState(""), [settings,setSettings]=useState(false), [category,setCategory]=useState("全部"), [search,setSearch]=useState("");
 const isImage=["image-edit","image-to-image","text-to-image"].includes(section), isVideo=["image-to-video","text-to-video","refer-to-video","video-to-video","frame-to-video","character-replacement","motion-transfer"].includes(section), tabs=isImage?imageTabs:videoTabs, activeNav=tool||studio?"工作室":section==="create"?"首页":section==="explore"?"灵感":isVideo?"视频":isImage?"图片":section==="ai-tools"?"工作室":section==="effects"?"玩法模板":"资产";
 const filteredEffects = effectTemplates?.filter(item => (category === "全部" || item.category === category) && `${item.title} ${item.prompt}`.toLowerCase().includes(search.toLowerCase())) || [];
 useEffect(() => {
   const target = effectsSentinel.current;
   if (section !== "effects" || !target || effectsCount >= filteredEffects.length) return;
   const observer = new IntersectionObserver(entries => {
     if (entries.some(entry => entry.isIntersecting)) setEffectsCount(count => Math.min(count + 24, filteredEffects.length));
   }, {rootMargin:"400px"});
   observer.observe(target);
   return () => observer.disconnect();
 }, [section, effectTemplates, effectsCount, filteredEffects.length, category, search]);
 const taskKind = (isImage || (section === "create" && mode === "图片")) ? "image" : "video";
 const activeMode = section === "create" ? (mode === "图片" ? imageTabs[tab]?.[1] : videoTabs[tab]?.[1]) : section;
 const isTextVideo = activeMode === "text-to-video";
 const availableModels = models.filter(item => item.kind === taskKind && (!item.modes.length || item.modes.includes(activeMode)));
 const currentModel = availableModels.some(item => item.id === model) ? model : availableModels[0]?.id || "暂无可用模型";
 const selectedModel = availableModels.find(item => item.id === currentModel);
 const [credits, setCredits] = useState<{balance:number; claimed:boolean} | null>(null);
 const [creditCost, setCreditCost] = useState<number | null>(null);
 const [quoteError, setQuoteError] = useState("");
 useEffect(() => { if (!user) { setCredits(null); return; } const refresh = () => api<{balance:number; claimed:boolean}>("/credits").then(setCredits).catch(() => setCredits(null)); void refresh(); const timer = window.setInterval(refresh, 10000); return () => window.clearInterval(timer); }, [user, galleryVersion]);
 useEffect(() => {
   if (!user || !selectedModel) { setCreditCost(null); return; }
   let active = true; setCreditCost(null); setQuoteError("");
   const quote = async () => {
     try {
       const params = new URLSearchParams({model: currentModel, kind: taskKind, duration});
       if (selectedModel.requires_video) {
         if (!videoFile) return;
         const upload = await uploadMedia(videoFile, true);
         params.set("video_upload_id", upload.id);
       }
       const result = await api<{cost:number}>(`/credits/quote?${params}`);
       if (active) setCreditCost(result.cost);
     } catch (error) { if (active) setQuoteError(error instanceof Error ? error.message : "无法计算积分"); }
   };
   void quote(); return () => { active = false; };
 }, [user, currentModel, taskKind, duration, videoFile, selectedModel]);
 const claimCredits = async () => { try { setCredits(await api<{balance:number; claimed:boolean}>("/credits/claim", {method:"POST"})); } catch (error) { setBackendError(error instanceof Error ? error.message : "领取失败"); } };
 const generateLabel = <><span>{sending ? "正在提交…" : "立即生成"}</span>{!sending && <span className="generate-credit" aria-label={creditCost === null ? "积分计算中" : `消耗 ${creditCost} 积分`}><Sparkles size={15} fill="currentColor" aria-hidden="true" />{creditCost === null ? "…" : creditCost}</span>}</>;
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
   const request = ++mediaRequest.current;
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
       if (request !== mediaRequest.current) return;
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
   if (!isTextVideo && (selectedModel?.requires_second_image || tool?.slug === "ai-virtual-try-on") && !secondFile) { setBackendError("请上传第二张参考图片。"); return; }
   if (selectedModel && prompt.trim().length > selectedModel.max_prompt_length) { setBackendError(`提示词不能超过 ${selectedModel.max_prompt_length} 个字符。`); return; }
   if (creditCost === null) { setBackendError(quoteError || "请等待积分计算完成。"); return; }
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
     if (selectedInput && !submission.uploadId) { const upload = await uploadMedia(selectedInput); submission.uploadId = upload.id; }
     if (selectedSecond && !submission.secondUploadId) { const upload = await uploadMedia(selectedSecond); submission.secondUploadId = upload.id; }
     if (selectedVideo && !submission.videoUploadId) { const upload = await uploadMedia(selectedVideo, true); submission.videoUploadId = upload.id; }
     await api("/tasks", {method:"POST", headers:{"Content-Type":"application/json", "Idempotency-Key":submission.key}, body:JSON.stringify({kind:taskKind, model:currentModel, mode:activeMode, prompt, upload_id:submission.uploadId, second_upload_id:submission.secondUploadId, video_upload_id:submission.videoUploadId, quality, ratio, duration})});
     submissionRef.current = null; window.sessionStorage.setItem("aibox:task-submitted", "1"); setGalleryVersion(version=>version+1); if (isVideo || isImage) setTab(1);
   } catch (error) { if (error instanceof ApiError && error.status === 402) { setBackendError(""); setCreditNotice(error.message); } else setBackendError(error instanceof Error ? error.message : "提交失败"); }
   finally { submittingRef.current = false; setSending(false); }
 };
 const applyImageExample = async (example: { prompt: string; inputImage?: string }) => {
   const request = ++mediaRequest.current;
   setPrompt(example.prompt);
   setInputFile(null); setSecondFile(null); setBackendError("");
   if (!example.inputImage) return;
   try {
     const response = await fetch(example.inputImage);
     if (!response.ok) throw new Error("示例参考图片加载失败，请重试或上传自己的图片。");
     const blob = await response.blob();
     if (request !== mediaRequest.current) return;
     const filename = example.inputImage.split("/").pop() || "示例参考图片";
     setInputFile(new File([blob], filename, {type: blob.type || "image/jpeg"}));
   } catch (error) {
     if (request === mediaRequest.current) setBackendError(error instanceof Error ? error.message : "示例参考图片加载失败，请重试。");
   }
 };
 const applyVideoExample = async (example: VideoExample) => {
   ++mediaRequest.current;
   const exampleFile = (url: string | undefined, video = false) => {
     if (!url) return null;
     const name = url.split("/").pop() || (video ? "示例视频.mp4" : "示例图片.png");
     const file = new File([], name, {type: video ? "video/mp4" : name.endsWith(".png") ? "image/png" : "image/jpeg"});
     systemExampleFiles.set(file, url);
     return file;
   };
   setPrompt(example.prompt); setInputFile(exampleFile(example.inputImage)); setSecondFile(null); setVideoFile(exampleFile(example.inputVideo, true)); setBackendError("");
 };
 const applyEffectTemplate = (item: EffectTemplate) => {
   if (item.mode === "unavailable") { setBackendError(`“${item.category}”模板已收录，相关生成功能正在准备中。`); return; }
   window.sessionStorage.setItem("aibox:effect-template", JSON.stringify({id:item.id, mode:item.mode, prompt:item.prompt, inputImage:item.inputImage, inputVideo:item.inputVideo, ratio:item.ratio, duration:item.duration}));
   router.push(`/${item.mode}`);
 };
 useEffect(() => {
   const saved = window.sessionStorage.getItem("aibox:effect-template");
   if (!saved) return;
   let item: EffectTemplate;
   try { item = JSON.parse(saved) as EffectTemplate; } catch { window.sessionStorage.removeItem("aibox:effect-template"); return; }
   if (item.mode !== section || typeof item.prompt !== "string") return;
   window.sessionStorage.removeItem("aibox:effect-template");
   const request = ++mediaRequest.current;
   void (async () => {
     setPrompt(item.prompt); setSecondFile(null);
     if (item.ratio) { restoredRatio.current = item.ratio; setRatio(item.ratio); }
     if (item.duration) setDuration(item.duration);
     const templateFile = (url: string | null | undefined, video = false) => {
       if (!url) return null;
       const file = new File([], url.split("/").pop() || "参考素材", {type:video ? "video/mp4" : "image/jpeg"});
       systemExampleFiles.set(file, url);
       return file;
     };
     if (request === mediaRequest.current) { setInputFile(templateFile(item.inputImage)); setVideoFile(templateFile(item.inputVideo, true)); }
     if (item.prompt.length > 3000 && item.mode === "text-to-image") setBackendError("此模板提示词较长，请缩短至 3000 字以内后生成。");
   })();
 }, [section]);
 const loginButton=()=>setAuthDialog(true);
 return <div className="workspace"><div className="ws-top"><a className="ws-logo" href="/">▣ <b>AI<span>Box</span></b></a><div>{user ? <><div className="ws-credit-pill"><span className="ws-credit-balance" aria-label={`剩余积分 ${credits?.balance ?? "读取中"}`}><Sparkles size={17} fill="currentColor" aria-hidden="true"/><strong>{credits?.balance ?? "…"}</strong><span>积分</span></span>{credits && !credits.claimed && <button className="ws-credit-claim" onClick={() => void claimCredits()}><Gift size={15} aria-hidden="true"/>领取 1000</button>}</div><a href="/my">{user.email}</a><button onClick={async()=>{await api("/auth/logout",{method:"POST"});setUser(null);router.push("/create")}}>退出</button></> : <button onClick={loginButton}>登录</button>}</div></div><aside className="ws-side">{nav.map(({name,href,icon:Icon})=><a href={`/${href}`} onClick={event=>{if(href==="my"&&!requireAccount()) event.preventDefault()}} className={activeNav===name?"active":""} key={name}><Icon size={20}/><span>{name}</span></a>)}</aside><div className="ws-mobile-nav"><Menu size={20}/>{nav.map(n=><a key={n.name} href={`/${n.href}`} onClick={event=>{if(n.href==="my"&&!requireAccount()) event.preventDefault()}}>{n.name}</a>)}</div>

 <main className={`ws-main ${section==="create"?"ws-create":""}`}>{creditNotice && <div className="task-submission-toast-backdrop"><div className="task-submission-toast credit-error-toast" role="alert"><CircleAlert size={20} aria-hidden="true"/><b>{creditNotice}</b><button type="button" onClick={() => setCreditNotice("")} aria-label="关闭通知"><X size={16}/></button></div></div>}{backendError && <div className="backend-error" role="alert">{backendError}<button onClick={()=>setBackendError("")} aria-label="关闭提示">×</button></div>}
 {section==="explore"&&<Inspiration/>}
 {section==="create"&&<><h1>一句话生成 AI 视频和图片</h1><div className="ws-mode">{["视频","图片"].map(m=><button className={mode===m?"selected":""} onClick={()=>{setMode(m);setTab(0)}} key={m}>{m==="视频"?<Video size={20}/>:<ImageIcon size={20}/>} {m}</button>)}</div><div className="create-box"><div className="create-tabs">{(mode==="视频"?videoTabs:imageTabs).map(([label,href],i)=>{const Icon=tabIcons[href]; return <button className={tab===i?"selected":""} onClick={()=>setTab(i)} key={label}>{Icon ? <Icon size={17}/> : "♧"} {label}</button>})}</div><div className="create-input">{!isTextVideo&&selectedModel?.supports_image&&<MediaInput title={tool?.slug === "ai-virtual-try-on" ? "人物图片" : "参考图片 1"} required={requiresFirstImage} file={inputFile} onFile={file=>{mediaRequest.current++;setInputFile(file);}} onChoose={()=>{if(requireAccount()) setAssetPicker("first");}}/>}
{!isTextVideo&&selectedModel?.supports_second_image&&<MediaInput title={tool?.slug === "ai-virtual-try-on" ? "服装图片" : "参考图片 2"} required={selectedModel.requires_second_image || tool?.slug === "ai-virtual-try-on"} file={secondFile} onFile={file=>{mediaRequest.current++;setSecondFile(file);}} onChoose={()=>{if(requireAccount()) setAssetPicker("second");}}/>}
{selectedModel?.supports_video&&<MediaInput title={"\u9a71\u52a8\u89c6\u9891\uff08\u6700\u5927 100 MB\uff09"} required={selectedModel.requires_video} video file={videoFile} onFile={file=>{mediaRequest.current++;setVideoFile(file);}} onChoose={()=>{if(requireAccount()) setAssetPicker("video");}}/>}<textarea value={prompt} onChange={e=>setPrompt(e.target.value)} placeholder={taskKind === "image" ? "描述你想要生成的图片。" : isTextVideo ? "描述你想要生成的视频画面、动作和镜头。" : "让这张图片自然地动起来。"} maxLength={selectedModel?.max_prompt_length || 8000}/></div><div className="create-bottom">{showModelSelector&&<button onClick={()=>setModelOpen(!modelOpen)}>▣ {currentModel} ⌄</button>}<div className="generation-settings-anchor generation-anchor-create"><button type="button" className="generation-settings-trigger" aria-expanded={settings} onClick={()=>setSettings(!settings)}><SlidersHorizontal size={16} aria-hidden="true"/><span>{settingsSummary}</span><ChevronDown size={16} className={settings?"is-open":""} aria-hidden="true"/></button>{settings&&<div className="generation-settings-popover generation-settings-create"><GenerationSettings kind={taskKind} quality={quality} ratio={ratio} duration={duration} fixedResolution={selectedModel?.fixed_resolution ?? true} resolutionLabel={selectedModel?.resolution_label || "选择模型后显示"} supportedQualities={selectedModel?.supported_qualities || []} supportedRatios={selectedModel?.supported_ratios || []} supportedDurations={selectedModel?.supported_durations || []} onQualityChange={setQuality} onRatioChange={setRatio} onDurationChange={setDuration} /></div>}</div><button className="create-generate" onClick={submitTask} disabled={sending}>{generateLabel}</button></div>{showModelSelector&&modelOpen&&<div className="ws-popover model-list">{availableModels.length ? availableModels.map(m=><button key={m.id} onClick={()=>{setModel(m.id);setModelOpen(false)}}>{m.id}</button>) : <span>暂无可用模型，请先配置工作流</span>}</div>}</div><div className="try-templates"><p>试试这些模板</p><div>{ids.slice(0,4).map((id,i)=><a href="/effects" key={id}><img src={`/sites/aibox/${id}.webp`} alt={names[i]} loading="lazy" decoding="async"/><span>{["非洲裔特工的夜生活","清爽康普茶","闪耀自拍趣转","赛道女王"][i]}</span></a>)}</div></div></>}
 {section==="create" && galleryVersion>0 && <div className="create-recent-tasks"><h2>我的作品</h2><TaskGallery onAuthRequired={()=>setAuthDialog(true)} key={galleryVersion} user={user} authLoading={authLoading} authError={authError} kind={taskKind}/></div>}
 {(isVideo||isImage)&&<div className="editor-layout"><div className="editor-left">{tool && <div className="studio-tool-heading"><a href="/ai-tools">← 工作室</a><h1>{tool.title}</h1><p>{tool.description}</p>{tool.note && <div className="studio-tool-note">{tool.note}</div>}</div>}{!tool && <div className="editor-tabs">{tabs.map(([label,href])=>{const Icon=tabIcons[href]; return <a className={section===href?"selected":""} href={`/${href}`} key={href}>{Icon && <Icon size={17}/>} {label}</a>})}</div>}{showModelSelector&&<button className="model-select" onClick={()=>setModelOpen(!modelOpen)}><small>模型</small><b>✦　{currentModel}</b><span>›</span></button>}{showModelSelector&&modelOpen&&<div className="editor-models">{availableModels.length ? availableModels.map(m=><button key={m.id} onClick={()=>{setModel(m.id);setModelOpen(false)}}>{m.id}</button>) : <span>暂无可用模型，请先配置工作流</span>}</div>}{!isTextVideo&&selectedModel?.supports_image&&<MediaInput title={tool?.slug === "ai-virtual-try-on" ? "人物图片" : "参考图片 1"} required={requiresFirstImage} file={inputFile} onFile={file=>{mediaRequest.current++;setInputFile(file);}} onChoose={()=>{if(requireAccount()) setAssetPicker("first");}}/>}
{!isTextVideo&&selectedModel?.supports_second_image&&<MediaInput title={tool?.slug === "ai-virtual-try-on" ? "服装图片" : "参考图片 2"} required={selectedModel.requires_second_image || tool?.slug === "ai-virtual-try-on"} file={secondFile} onFile={file=>{mediaRequest.current++;setSecondFile(file);}} onChoose={()=>{if(requireAccount()) setAssetPicker("second");}}/>}
{selectedModel?.supports_video&&<MediaInput title={"\u9a71\u52a8\u89c6\u9891\uff08\u6700\u5927 100 MB\uff09"} required={selectedModel.requires_video} video file={videoFile} onFile={file=>{mediaRequest.current++;setVideoFile(file);}} onChoose={()=>{if(requireAccount()) setAssetPicker("video");}}/>}<div className="editor-prompt"><label>{isImage?"输入照片提示词":selectedModel?.requires_prompt === false?"提示词（选填）":"提示词"}</label><textarea value={prompt} onChange={e=>setPrompt(e.target.value)} maxLength={selectedModel?.max_prompt_length || 8000} placeholder={section==="text-to-image"?"描述你想要生成的图片。":isImage?"移除桌上的物体并清理画面。":section==="text-to-video"?"描述你想要生成的视频画面、动作和镜头。":"在保持图像风格不变的前提下，添加电影感运镜和柔和光效。"}/><small>{prompt.length}/{selectedModel?.max_prompt_length || (isImage?3000:8000)}</small></div><div className="generation-settings-anchor generation-anchor-editor"><button type="button" className="generation-settings-trigger" aria-expanded={settings} onClick={()=>setSettings(!settings)}><SlidersHorizontal size={16} aria-hidden="true"/><span>{settingsSummary}</span><ChevronDown size={16} className={settings?"is-open":""} aria-hidden="true"/></button>{settings&&<div className="generation-settings-popover generation-settings-editor"><GenerationSettings kind={taskKind} quality={quality} ratio={ratio} duration={duration} fixedResolution={selectedModel?.fixed_resolution ?? true} resolutionLabel={selectedModel?.resolution_label || "选择模型后显示"} supportedQualities={selectedModel?.supported_qualities || []} supportedRatios={selectedModel?.supported_ratios || []} supportedDurations={selectedModel?.supported_durations || []} onQualityChange={setQuality} onRatioChange={setRatio} onDurationChange={setDuration} /></div>}</div><button className="editor-generate" onClick={submitTask} disabled={sending}>{generateLabel}</button></div><div className="editor-right"><div className="result-tabs"><button className={tab===0?"selected":""} onClick={()=>setTab(0)}>参考示例</button><button className={tab===1?"selected":""} onClick={()=>{if(requireAccount()) setTab(1)}}>我的作品</button></div>{tab===0?(tool && tool.slug !== "ai-motion-control" ? <div className="studio-tool-overview"><div className="studio-tool-overview-image"><img src={tool.image} alt={`${tool.title}示例`}/></div><div className="studio-tool-overview-copy"><span>创作指南</span><h2>{tool.title}</h2><p>{tool.description}</p><h3>开始创作</h3><ol><li>上传所需的参考素材</li><li>根据需要调整提示词和生成设置</li><li>点击立即生成，在我的作品中查看结果</li></ol>{tool.note && <p className="studio-tool-note">{tool.note}</p>}</div></div> : isImage?<ImageExamples key={section} edit={section!=="text-to-image"} onApply={example=>void applyImageExample(example)}/>:isTextVideo?<TextVideoExamples onApply={setPrompt}/>:<VideoExamples key={section} mode={section==="character-replacement"?"replacement":section==="motion-transfer"?"motion":"reference"} onApply={applyVideoExample}/>):<TaskGallery onAuthRequired={()=>setAuthDialog(true)} key={galleryVersion} user={user} authLoading={authLoading} authError={authError} kind={isImage?"image":"video"}/>}</div></div>}
 {section==="ai-tools"&&<div className="tools-page"><h2>AI <span>工具</span></h2><p>探索智能工具箱，一键简化复杂的视频处理</p><h3>工作室</h3><div className="studio-cards">{studios.map(item=><a href={`/ai-tools/${item.slug}`} key={item.slug}><img src={item.image} alt=""/><div><b>{item.title}</b><p>{item.description}</p><small>探索更多</small></div></a>)}</div><h3>所有工具</h3><div className="tools-grid">{studioTools.map(item=><a href={`/ai-tools/${item.slug}`} key={item.slug} className="studio-card"><div className="studio-card-image"><img src={item.image} alt="" loading="lazy" decoding="async"/>{item.fresh&&<span className="studio-card-new">NEW</span>}</div><div className="studio-card-body"><b>{item.title}</b><p>{item.description}</p><span className="studio-card-cta">立即试用 <span>→</span></span></div></a>)}</div></div>}
 {studio && <div className="studio-detail"><a className="studio-back" href="/ai-tools">← 返回工作室</a>{studios.filter(item=>item.slug===studio).map(item=><div className="studio-detail-hero" key={item.slug}><img src={item.image} alt=""/><div><span>AIBox Studio</span><h1>{item.title}</h1><p>{item.description}</p></div></div>)}<h2>探索工具</h2><div className="tools-grid">{studioTools.filter(item=>studios.some(group=>group.slug===studio && group.group===item.group)).map(item=><a className="studio-card" href={`/ai-tools/${item.slug}`} key={item.slug}><div className="studio-card-image"><img src={item.image} alt=""/></div><div className="studio-card-body"><b>{item.title}</b><p>{item.description}</p><span className="studio-card-cta">立即试用 →</span></div></a>)}</div></div>}
 {tool && !tool.mode && <div className="studio-unavailable"><a className="studio-back" href="/ai-tools">← 返回工作室</a><div className="studio-unavailable-hero"><div><span>AIBox 工具</span><h1>{tool.title}</h1><p>{tool.description}</p><div className="studio-tool-note">{tool.note} 工作流接入后即可使用。</div><a className="studio-alt-button" href="/create">探索现有创作工具 →</a></div><img src={tool.image} alt=""/></div><div className="studio-unavailable-guide"><h2>如何使用</h2><p>接入对应工作流后，可在此工具中上传素材、设置生成参数并查看作品。</p></div></div>}
 {section==="effects"&&<div className="effects-page"><div className="effects-heading"><div><h2>AI<span>玩法模板</span></h2><p className="effects-subtitle">发现灵感，选择模板开始创作</p></div><label><Search size={16}/><input value={search} onChange={e=>{setSearch(e.target.value);setEffectsCount(24)}} placeholder="搜索模板或提示词..."/></label></div><div className="categories">{categories.map(c=><button className={c===category?"active":""} onClick={()=>{setCategory(c);setEffectsCount(24)}} key={c}>{c}</button>)}</div>{effectsError && <p role="alert">{effectsError}</p>}{!effectTemplates && !effectsError && <p role="status">正在加载模板…</p>}<div className="effects-grid">{filteredEffects.slice(0,effectsCount).map(item=><article className="effects-card" key={item.id}><button type="button" className="effects-card-action" onClick={()=>applyEffectTemplate(item)} aria-label={`使用${item.title}模板`}><img src={item.image} alt="" width={item.width} height={item.height} loading="lazy" decoding="async"/><span>{item.title}<small>{item.category}</small></span><em><Sparkles size={16} aria-hidden="true"/>{item.mode === "unavailable" ? "即将支持" : "一键同款"}</em></button><a className="effects-source" href={item.source} target="_blank" rel="noreferrer">查看来源 ↗</a></article>)}</div>{effectTemplates && filteredEffects.length === 0 && <p role="status">没有找到匹配的模板</p>}{effectsCount < filteredEffects.length && <div ref={effectsSentinel} className="effects-loading" role="status">正在加载更多模板…</div>}</div>}
 {(section==="my"||section==="assets")&&<div className="assets-page"><div className="assets-tabs"><a className={section==="my"?"active":""} href="/my" onClick={event=>{if(!requireAccount()) event.preventDefault()}}>我的作品</a><a className={section==="assets"?"active":""} href="/assets" onClick={event=>{if(!requireAccount()) event.preventDefault()}}>元素库</a></div>{section==="my" ? <> <div className="asset-filters">{(["all","video","image"] as const).map(value=><button key={value} className={workKind===value?"selected":""} onClick={()=>{if(requireAccount()) setWorkKind(value)}}>{value==="all"?"\u5168\u90e8":value==="video"?"\u89c6\u9891":"\u56fe\u7247"}</button>)}</div><TaskGallery onAuthRequired={()=>setAuthDialog(true)} key={workKind} kind={workKind === "all" ? undefined : workKind} user={user} authLoading={authLoading} authError={authError}/></> : <AssetGallery onAuthRequired={()=>setAuthDialog(true)} user={user} authLoading={authLoading} authError={authError}/>}</div>}
 {assetPicker&&<div className="asset-picker-overlay" onClick={()=>setAssetPicker(null)}><div className="asset-picker-dialog" role="dialog" aria-modal="true" aria-label="从资产导入" onClick={event=>event.stopPropagation()}><header><b>从资产导入</b><button type="button" onClick={()=>setAssetPicker(null)} aria-label="关闭">×</button></header><div className="asset-filters">{(["works","library"] as const).map(source=><button type="button" key={source} className={assetSource===source?"selected":""} aria-pressed={assetSource===source} onClick={()=>setAssetSource(source)}>{source==="works"?"我的作品":"元素库"}</button>)}</div>{assetSource==="works"?<WorkPicker key={assetPicker} user={user} authLoading={authLoading} authError={authError} kind={assetPicker==="video"?"video":"image"} onSelect={asset=>void selectAsset(asset)}/>:<AssetGallery key={assetPicker} user={user} authLoading={authLoading} authError={authError} selectKind={assetPicker==="video"?"video":"image"} onSelect={asset=>void selectAsset(asset)}/>}</div></div>}
 {authDialog&&<AuthDialog onClose={()=>setAuthDialog(false)} onSuccess={account=>{setUser(account);setAuthError("");setBackendError("");setAuthDialog(false)}}/>}
 </main></div>
}
