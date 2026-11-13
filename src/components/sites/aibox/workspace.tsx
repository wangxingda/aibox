/* eslint-disable @next/next/no-html-link-for-pages, @next/next/no-img-element */
"use client";
import { CreationGuide } from "./creation-guide";
import { VoiceWorks } from "./voice-works";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api, ApiError, type BackendModel, type BackendTask, type BackendUser } from "@/lib/backend";
import { useRouter } from "next/navigation";
import { Home, Video, Image as ImageIcon, Gift, Images, FolderOpen, Upload, Search, Menu, WandSparkles, ImagePlus, Clapperboard, UserRound, Move, Text, SlidersHorizontal, ChevronDown, Sparkles, AudioLines, Mic } from "lucide-react";
import "./workspace.css";
import homeEditExample from "./home-edit-example.json";
import imageExamples from "./image-examples-data.json";
import videoExamples from "./video-examples-data.json";
import { ImageExamples } from "./image-examples";
import { VideoExamples, TextVideoExamples, type VideoExample } from "./video-examples";
import { TaskGallery } from "./task-gallery";
import { AssetGallery, WorkPicker, type Asset } from "./asset-gallery";
import { GenerationSettings } from "./generation-settings";
import { GenerateLabel } from "./generate-label";
import { DigitalHuman } from "./digital-human";
import { VoiceClone } from "./voice-clone";
import { AuthDialog } from "./auth-dialog";
import { showPageNotice } from "./page-notice";
import { studioTools, studios, type StudioTool } from "./studio-data";

// Set to true when users can choose between multiple models.
const showModelSelector = false;

type EffectTemplate = {id:string; title:string; category:string; mode:string; prompt:string; image:string; inputImage:string|null; inputVideo?:string; ratio?:string; duration?:string; width:number; height:number; source:string};
const categories = ["全部", "文生图", "图片编辑", "文生视频", "图生视频", "数字人", "动作迁移", "参考视频"];

const nav = [{name:"首页", href:"create", icon:Home}, {name:"视频", href:"image-to-video", icon:Video}, {name:"图片", href:"text-to-image", icon:ImageIcon}, {name:"声音", href:"voice-audio-drive", icon:AudioLines}, {name:"工作室", href:"ai-tools", icon:Gift}, {name:"玩法模板", href:"effects", icon:Images}, {name:"资产", href:"my", icon:FolderOpen}];
const videoTabs = [["图生音视频", "image-to-video"], ["文生音视频", "text-to-video"], ["角色替换", "character-replacement"], ["动作迁移", "motion-transfer"]];
const homeExamples = [
 { mode: "image-to-video", label: "图生音视频", image: videoExamples.reference[0].poster, ...videoExamples.reference[0] },
 { mode: "character-replacement", label: "角色替换", image: videoExamples.replacement[0].poster, ...videoExamples.replacement[0] },
 { mode: "text-to-image", label: "文生图", ...imageExamples.text[0] },
 { ...homeEditExample, label: "图片编辑" },
];
const imageTabs = [["文生图", "text-to-image"], ["图片编辑", "image-edit"]];
const promptPlaceholders: Record<string, string> = {
 "character-replacement": "可描述替换后角色的外观、服饰和画面效果，例如：穿白色外套的人物自然融入视频场景，保持原视频的动作和表情。",
 "motion-transfer": "可描述参考图片中角色的动作表现和画面效果，例如：角色跟随驱动视频自然舞动，动作流畅，保持原有外观。",
 "text-to-image": "描述你想要生成的图片。",
 "image-edit": "移除桌上的物体并清理画面。",
 "image-to-image": "移除桌上的物体并清理画面。",
 "text-to-video": "描述你想要生成的视频画面、动作和镜头。",
};
const defaultVideoPlaceholder = "在保持图像风格不变的前提下，添加电影感运镜和柔和光效。";
const tabIcons: Record<string, typeof Video> = { "image-edit": WandSparkles, "text-to-image": ImagePlus, "image-to-video": Clapperboard, "text-to-video": Text, "character-replacement": UserRound, "motion-transfer": Move };
const systemExampleFiles = new WeakMap<File, string>();
const existingUploadFiles = new WeakMap<File, string>();
async function uploadMedia(file: File, video = false): Promise<{id:string}> {
 const existing = existingUploadFiles.get(file);
 if (existing) return {id:existing};
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
function MediaInput({ title, required, file, video = false, audio = false, onFile, onChoose }: { title: string; required: boolean; file: File | null; video?: boolean; audio?: boolean; onFile: (file: File | null) => void; onChoose: () => void }) {
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
     {audio ? <AudioLines size={24}/> : video ? <VideoUploadPreview file={file} size={24}/> : <UploadPreview file={file} size={24}/>}
     <span className="media-input-name" title={file?.name || "尚未选择素材"}>{file?.name || "尚未选择素材"}</span>
   </div>
   <div className="media-input-actions">
     <label className="media-input-upload">上传<input type="file" accept={audio ? ".wav,.mp3,.webm,audio/wav,audio/mpeg,audio/webm" : video ? "video/mp4,video/quicktime,video/webm" : "image/jpeg,image/png,image/webp"} onChange={event => { closePreview(); onFile(event.target.files?.[0] || null); }} onClick={event => { event.currentTarget.value = ""; }}/></label>
     <button type="button" className="media-input-import" onClick={onChoose}>从资产导入</button>
   </div>
   {file && <button type="button" className="media-input-remove" onClick={() => { closePreview(); onFile(null); }}>移除</button>}
   {hover && hover.file === file && createPortal(<div className="media-hover-preview" style={{ left: hover.left, top: hover.top }}>{audio ? <div className="digital-audio-hover"><AudioLines size={42}/><strong>{file?.name}</strong></div> : video ? <video src={hover.url} autoPlay muted loop playsInline/> : <img src={hover.url} alt=""/>}</div>, document.body)}
 </div>;
}
export function Workspace({section, tool, studio}:{section:string; tool?:StudioTool; studio?:string}) {
 const router = useRouter();
 const submittingRef = useRef(false);
 const mediaRequest = useRef(0);
 const submissionRef = useRef<{fingerprint:string; key:string; inputFile:File|null; secondFile:File|null; videoFile:File|null; uploadId?:string; secondUploadId?:string; videoUploadId?:string} | null>(null);
 const [user,setUser]=useState<BackendUser|null>(null), [models,setModels]=useState<BackendModel[]>([]), [authLoading,setAuthLoading]=useState(true), [authError,setAuthError]=useState(""), [sending,setSending]=useState(false), [inputFile,setInputFile]=useState<File|null>(null), [secondFile,setSecondFile]=useState<File|null>(null), [videoFile,setVideoFile]=useState<File|null>(null);
 const [authDialog,setAuthDialog]=useState(false);

 useEffect(()=>{ const requireLogin = () => { setUser(null); setAuthError(""); setAuthDialog(true); }; window.addEventListener("aibox:auth-required", requireLogin); return () => window.removeEventListener("aibox:auth-required", requireLogin); },[]);
 const requireAccount = () => { if (authLoading) { showPageNotice("正在检查登录状态，请稍候。"); return false; } if (authError) { showPageNotice(authError); return false; } if (!user) { setAuthDialog(true); return false; } return true; };
 useEffect(()=>{ api<BackendUser>("/auth/me").then(setUser).catch(error=>{setUser(null);if (!(error instanceof ApiError && error.status===401)) setAuthError("暂时无法验证登录状态，请稍后重试。");}).finally(()=>setAuthLoading(false)); api<BackendModel[]>("/models").then(setModels).catch(()=>showPageNotice("暂时无法加载生成功能，请稍后重试。")); },[]);
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
 const [homeResult,setHomeResult]=useState<"video"|"image"|"audio"|null>(null);
 const [workKind,setWorkKind]=useState<"all"|"video"|"image"|"audio">("all");
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
     setAssetPicker(null); showPageNotice("");
   } catch (error) { if (request === mediaRequest.current) { setAssetPicker(null); showPageNotice(error instanceof Error ? error.message : "素材读取失败，请重试。"); } }
 };
 const [resultPanel,setResultPanel]=useState<"examples"|"guide"|"works">("examples");
 const [modelOpen,setModelOpen]=useState(false), [quality,setQuality]=useState("540P"), [ratio,setRatio]=useState("16:9"), [duration,setDuration]=useState("5s");
 const [mode,setMode]=useState("视频"), [tab,setTab]=useState(0), [prompt,setPrompt]=useState(tool?.prompt || ""), [model,setModel]=useState(""), [settings,setSettings]=useState(false), [category,setCategory]=useState("全部"), [search,setSearch]=useState("");
 const isImage=["image-edit","image-to-image","text-to-image"].includes(section), isVideo=["image-to-video","text-to-video","refer-to-video","video-to-video","frame-to-video","character-replacement","motion-transfer"].includes(section), tabs=isImage?imageTabs:videoTabs, activeNav=tool||studio?"工作室":section==="create"?"首页":isVideo?"视频":isImage?"图片":["voice-clone","voice-audio-drive"].includes(section)?"声音":section==="ai-tools"?"工作室":section==="effects"?"玩法模板":"资产";
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
 useEffect(() => { if (!user) { setCredits(null); return; } const refresh = () => api<{balance:number; claimed:boolean}>("/credits").then(setCredits).catch(() => setCredits(null)); void refresh(); const timer = window.setInterval(refresh, 10000); window.addEventListener("aibox:credits-changed", refresh); return () => { window.clearInterval(timer); window.removeEventListener("aibox:credits-changed", refresh); }; }, [user, galleryVersion]);
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
 const claimCredits = async () => { try { setCredits(await api<{balance:number; claimed:boolean}>("/credits/claim", {method:"POST"})); showPageNotice("今日积分领取成功", "success"); } catch (error) { showPageNotice(error instanceof Error ? error.message : "领取失败"); } };
 const generateLabel = <GenerateLabel label={sending ? "正在提交…" : !user ? "登录后生成" : selectedModel?.requires_video && !videoFile ? "请上传驱动视频" : creditCost === null ? (quoteError ? "暂时无法报价" : "计算积分中…") : credits && !credits.claimed ? "领取积分后生成" : "立即生成"} cost={!sending && user ? creditCost : null}/>;
 const requiresFirstImage = activeMode === "image-to-video" || !!selectedModel?.requires_image;
 const settingsSummary = [selectedModel?.fixed_resolution ? "固定分辨率" : quality, selectedModel?.supported_ratios.length ? ratio : "比例随素材", ...(taskKind === "video" ? [selectedModel?.supported_durations.length ? duration : "时长随视频"] : [])].join("  |  ");
 const restoredRatio = useRef<string | null>(null);
 useEffect(()=>{ if (restoredRatio.current) { setRatio(restoredRatio.current); restoredRatio.current = null; } else if (selectedModel?.default_ratio) setRatio(selectedModel.default_ratio); },[selectedModel?.id, selectedModel?.default_ratio]);
 const editLoaded = useRef(false);
 useEffect(()=>{
   if (["digital-human", "voice-audio-drive"].includes(section) || !user || !models.length || editLoaded.current) return;
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
         const asset = await api<{id:string; content_type:string; url:string}>(`/uploads/${encodeURIComponent(uploadId)}`);
         const file = new File([], name, {type:asset.content_type});
         existingUploadFiles.set(file, asset.id); systemExampleFiles.set(file, asset.url);
         return file;
       };
       const [first, second, video] = await Promise.all([loadImage(task.upload_id, "参考图片 1"), loadImage(task.options?.second_upload_id, "参考图片 2"), loadImage(task.options?.video_upload_id, "驱动视频.mp4")]);
       if (selectedModel?.id !== task.model && task.options?.ratio) restoredRatio.current = task.options.ratio;
       if (request !== mediaRequest.current) return;
       setModel(task.model); setPrompt(task.prompt); setInputFile(first); setSecondFile(second); setVideoFile(video);
       if (task.options?.quality) setQuality(task.options.quality);
       if (task.options?.ratio) setRatio(task.options.ratio);
       if (task.options?.duration) setDuration(task.options.duration);
       window.history.replaceState(null, "", window.location.pathname);
     } catch (error) { showPageNotice(error instanceof Error ? error.message : "无法读取原任务。"); }
   };
   void load();
 },[user, models, section, selectedModel?.id]);
 const submitTask = async () => {
   if (!requireAccount()) return;
   if (credits && !credits.claimed) { await claimCredits(); return; }
   if (!prompt.trim() && (selectedModel?.requires_prompt ?? true)) { showPageNotice("请输入提示词。"); return; }
   if (!availableModels.length) { showPageNotice("此功能暂不可用，请稍后再试。"); return; }
   if (!isTextVideo && requiresFirstImage && !inputFile) { showPageNotice("请上传第一张参考图片。"); return; }
   if (selectedModel?.requires_video && !videoFile) { showPageNotice("请上传驱动视频。"); return; }
   if (!isTextVideo && (selectedModel?.requires_second_image || tool?.slug === "ai-virtual-try-on") && !secondFile) { showPageNotice("请上传第二张参考图片。"); return; }
   if (selectedModel && prompt.trim().length > selectedModel.max_prompt_length) { showPageNotice(`提示词不能超过 ${selectedModel.max_prompt_length} 个字符。`); return; }
   if (creditCost === null) { showPageNotice(quoteError || "请等待积分计算完成。"); return; }
   if (submittingRef.current) return;
   submittingRef.current = true; setSending(true); showPageNotice("");
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
     submissionRef.current = null; window.sessionStorage.setItem("aibox:task-submitted", "1"); setGalleryVersion(version=>version+1); if (section === "create") setHomeResult(taskKind); if (isVideo || isImage) setResultPanel("works");
   } catch (error) { if (error instanceof ApiError && error.status === 402) { showPageNotice(""); showPageNotice(error.message); } else showPageNotice(error instanceof Error ? error.message : "提交失败"); }
   finally { submittingRef.current = false; setSending(false); }
 };
 const applyImageExample = async (example: { prompt: string; inputImage?: string }) => {
   const request = ++mediaRequest.current;
   setPrompt(example.prompt);
   setInputFile(null); setSecondFile(null); showPageNotice("");
   if (!example.inputImage) return;
   try {
     const response = await fetch(example.inputImage);
     if (!response.ok) throw new Error("示例参考图片加载失败，请重试或上传自己的图片。");
     const blob = await response.blob();
     if (request !== mediaRequest.current) return;
     const filename = example.inputImage.split("/").pop() || "示例参考图片";
     setInputFile(new File([blob], filename, {type: blob.type || "image/jpeg"}));
   } catch (error) {
     if (request === mediaRequest.current) showPageNotice(error instanceof Error ? error.message : "示例参考图片加载失败，请重试。");
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
   setPrompt(example.prompt); setInputFile(exampleFile(example.inputImage)); setSecondFile(null); setVideoFile(exampleFile(example.inputVideo, true)); showPageNotice("");
 };
 const applyEffectTemplate = (item: EffectTemplate) => {
   if (item.mode === "unavailable") { showPageNotice(`“${item.category}”模板已收录，相关生成功能正在准备中。`); return; }
   window.sessionStorage.setItem("aibox:effect-template", JSON.stringify({id:item.id, mode:item.mode, prompt:item.prompt, inputImage:item.inputImage, inputVideo:item.inputVideo, ratio:item.ratio, duration:item.duration}));
   router.push(`/${item.mode}`);
 };
 useEffect(() => {
   const saved = window.sessionStorage.getItem("aibox:home-example");
   if (!saved) return;
   let item: { mode: string; prompt: string; inputImage?: string; inputVideo?: string };
   try { item = JSON.parse(saved); } catch { window.sessionStorage.removeItem("aibox:home-example"); return; }
   if (item.mode !== section) return;
   window.sessionStorage.removeItem("aibox:home-example");
   const request = ++mediaRequest.current;
   setPrompt(item.prompt); setInputFile(null); setSecondFile(null); setVideoFile(null);
   void (async () => {
     try {
       const getFile = async (url: string | undefined, video = false) => {
         if (!url) return null;
         if (url.includes("/video-examples/")) {
           const file = new File([], url.split("/").pop() || "示例素材", {type: video ? "video/mp4" : "image/jpeg"});
           systemExampleFiles.set(file, url); return file;
         }
         const response = await fetch(url);
         if (!response.ok) throw new Error("示例素材加载失败，请重试。");
         const blob = await response.blob();
         return new File([blob], url.split("/").pop() || "示例素材", {type: blob.type});
       };
       const [image, video] = await Promise.all([getFile(item.inputImage), getFile(item.inputVideo, true)]);
       if (request === mediaRequest.current) { setInputFile(image); setVideoFile(video); }
     } catch { if (request === mediaRequest.current) showPageNotice("示例素材加载失败，请重试或自行上传。"); }
   })();
 }, [section]);
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
     if (item.prompt.length > 3000 && item.mode === "text-to-image") showPageNotice("此模板提示词较长，请缩短至 3000 字以内后生成。");
   })();
 }, [section]);
 const loginButton=()=>setAuthDialog(true);
 return <div className="workspace"><div className="ws-top"><a className="ws-logo" href="/">▣ <b>AI<span>Box</span></b></a><div>{user ? <><div className="ws-credit-pill"><span className="ws-credit-balance" aria-label={`剩余积分 ${credits?.balance ?? "读取中"}`}><Sparkles size={17} fill="currentColor" aria-hidden="true"/><strong>{credits?.balance ?? "…"}</strong><span>积分</span></span>{credits && !credits.claimed && <button className="ws-credit-claim" onClick={() => void claimCredits()}><Gift size={15} aria-hidden="true"/>领取 1000</button>}</div><a href="/my">{user.email}</a><button onClick={async()=>{await api("/auth/logout",{method:"POST"});setUser(null);router.push("/create")}}>退出</button></> : <button onClick={loginButton}>登录</button>}</div></div><aside className="ws-side">{nav.map(({name,href,icon:Icon})=><a href={`/${href}`} onClick={event=>{if(href==="my"&&!requireAccount()) event.preventDefault()}} className={activeNav===name?"active":""} key={name}><Icon size={20}/><span>{name}</span></a>)}</aside><div className="ws-mobile-nav"><Menu size={20}/>{nav.map(n=><a key={n.name} href={`/${n.href}`} onClick={event=>{if(n.href==="my"&&!requireAccount()) event.preventDefault()}}>{n.name}</a>)}</div>

 <main className={`ws-main ${section==="create"?"ws-create":""}`}>
 {section==="create"&&<><h1>创作 AI 视频、图片和声音</h1><div className="ws-mode">{["视频","图片","声音"].map(m=><button className={mode===m?"selected":""} onClick={()=>{setMode(m);setTab(0)}} key={m}>{m==="视频"?<Video size={20}/>:m==="图片"?<ImageIcon size={20}/>:<AudioLines size={20}/>} {m}</button>)}</div>{mode==="声音" ? <div className="home-voice create-box"><div className="create-tabs"><button type="button" className={tab===0?"selected":""} onClick={()=>setTab(0)}><UserRound size={17}/>音频驱动</button><button type="button" className={tab===1?"selected":""} onClick={()=>setTab(1)}><Mic size={17}/>声音克隆</button></div><div hidden={tab!==0}><DigitalHuman compact mediaInput={MediaInput} user={user} authLoading={authLoading} authError={authError} requireAccount={requireAccount} credits={credits} claimCredits={claimCredits} onHomeSuccess={()=>{setHomeResult("video");setGalleryVersion(version=>version+1);}}/></div><div hidden={tab!==1}><VoiceClone compact mediaInput={MediaInput} requireAccount={requireAccount} user={user} authLoading={authLoading} authError={authError} onHomeSuccess={()=>{setHomeResult("audio");setGalleryVersion(version=>version+1);}}/></div></div> : <><div className="create-box"><div className="create-tabs">{(mode==="视频"?videoTabs:imageTabs).map(([label,href],i)=>{const Icon=tabIcons[href]; return <button className={tab===i?"selected":""} onClick={()=>setTab(i)} key={label}>{Icon ? <Icon size={17}/> : "♧"} {label}</button>})}</div><div className="create-input">{!isTextVideo&&selectedModel?.supports_image&&<MediaInput title={tool?.slug === "ai-virtual-try-on" ? "人物图片" : "参考图片 1"} required={requiresFirstImage} file={inputFile} onFile={file=>{mediaRequest.current++;setInputFile(file);}} onChoose={()=>{if(requireAccount()) setAssetPicker("first");}}/>}
{!isTextVideo&&selectedModel?.supports_second_image&&<MediaInput title={tool?.slug === "ai-virtual-try-on" ? "服装图片" : "参考图片 2"} required={selectedModel.requires_second_image || tool?.slug === "ai-virtual-try-on"} file={secondFile} onFile={file=>{mediaRequest.current++;setSecondFile(file);}} onChoose={()=>{if(requireAccount()) setAssetPicker("second");}}/>}
{selectedModel?.supports_video&&<MediaInput title={"\u9a71\u52a8\u89c6\u9891\uff08\u6700\u5927 100 MB\uff09"} required={selectedModel.requires_video} video file={videoFile} onFile={file=>{mediaRequest.current++;setVideoFile(file);}} onChoose={()=>{if(requireAccount()) setAssetPicker("video");}}/>}<textarea value={prompt} onChange={e=>setPrompt(e.target.value)} placeholder={promptPlaceholders[activeMode] || defaultVideoPlaceholder} maxLength={selectedModel?.max_prompt_length || 8000}/></div><div className="create-bottom">{showModelSelector&&<button onClick={()=>setModelOpen(!modelOpen)}>▣ {currentModel} ⌄</button>}<div className="generation-settings-anchor generation-anchor-create"><button type="button" className="generation-settings-trigger" aria-expanded={settings} onClick={()=>setSettings(!settings)}><SlidersHorizontal size={16} aria-hidden="true"/><span>{settingsSummary}</span><ChevronDown size={16} className={settings?"is-open":""} aria-hidden="true"/></button>{settings&&<div className="generation-settings-popover generation-settings-create"><GenerationSettings kind={taskKind} quality={quality} ratio={ratio} duration={duration} fixedResolution={selectedModel?.fixed_resolution ?? true} resolutionLabel={selectedModel?.resolution_label || "选择模型后显示"} supportedQualities={selectedModel?.supported_qualities || []} supportedRatios={selectedModel?.supported_ratios || []} supportedDurations={selectedModel?.supported_durations || []} onQualityChange={setQuality} onRatioChange={setRatio} onDurationChange={setDuration} /></div>}</div><button className="create-generate" onClick={submitTask} disabled={sending}>{generateLabel}</button></div>{showModelSelector&&modelOpen&&<div className="ws-popover model-list">{availableModels.length ? availableModels.map(m=><button key={m.id} onClick={()=>{setModel(m.id);setModelOpen(false)}}>{m.id}</button>) : <span>暂无可用模型，请先配置工作流</span>}</div>}</div><div className="try-templates"><p>试试这些模板</p><div>{homeExamples.map(item=><a href={`/${item.mode}`} key={item.image} onClick={() => window.sessionStorage.setItem("aibox:home-example", JSON.stringify(item))}><img src={item.image} alt="" loading="lazy" decoding="async"/><span>{item.label} · {item.title}</span></a>)}</div></div></>}</>}
 {section==="voice-audio-drive"&&<DigitalHuman user={user} authLoading={authLoading} authError={authError} requireAccount={requireAccount}/>}
 {section==="voice-clone"&&<VoiceClone requireAccount={requireAccount} user={user} authLoading={authLoading} authError={authError}/>}
 {section==="create" && homeResult && (mode==="声音" ? homeResult===(tab===0?"video":"audio") : homeResult===taskKind) && <div className="create-recent-tasks"><h2>我的作品</h2>{homeResult==="audio"?<VoiceWorks user={user} revision={galleryVersion}/>:<TaskGallery onAuthRequired={()=>setAuthDialog(true)} key={galleryVersion} user={user} authLoading={authLoading} authError={authError} kind={homeResult}/>}</div>}
 {(isVideo||isImage)&&<div className="editor-layout"><div className="editor-left">{tool && <div className="studio-tool-heading"><a href="/ai-tools">← 工作室</a><h1>{tool.title}</h1><p>{tool.description}</p>{tool.note && <div className="studio-tool-note">{tool.note}</div>}</div>}{!tool && <div className="editor-tabs">{tabs.map(([label,href])=>{const Icon=tabIcons[href]; return <a className={section===href?"selected":""} href={`/${href}`} key={href}>{Icon && <Icon size={17}/>} {label}</a>})}</div>}{showModelSelector&&<button className="model-select" onClick={()=>setModelOpen(!modelOpen)}><small>模型</small><b>✦　{currentModel}</b><span>›</span></button>}{showModelSelector&&modelOpen&&<div className="editor-models">{availableModels.length ? availableModels.map(m=><button key={m.id} onClick={()=>{setModel(m.id);setModelOpen(false)}}>{m.id}</button>) : <span>暂无可用模型，请先配置工作流</span>}</div>}{!isTextVideo&&selectedModel?.supports_image&&<MediaInput title={tool?.slug === "ai-virtual-try-on" ? "人物图片" : "参考图片 1"} required={requiresFirstImage} file={inputFile} onFile={file=>{mediaRequest.current++;setInputFile(file);}} onChoose={()=>{if(requireAccount()) setAssetPicker("first");}}/>}
{!isTextVideo&&selectedModel?.supports_second_image&&<MediaInput title={tool?.slug === "ai-virtual-try-on" ? "服装图片" : "参考图片 2"} required={selectedModel.requires_second_image || tool?.slug === "ai-virtual-try-on"} file={secondFile} onFile={file=>{mediaRequest.current++;setSecondFile(file);}} onChoose={()=>{if(requireAccount()) setAssetPicker("second");}}/>}
{selectedModel?.supports_video&&<MediaInput title={"\u9a71\u52a8\u89c6\u9891\uff08\u6700\u5927 100 MB\uff09"} required={selectedModel.requires_video} video file={videoFile} onFile={file=>{mediaRequest.current++;setVideoFile(file);}} onChoose={()=>{if(requireAccount()) setAssetPicker("video");}}/>}<div className="editor-prompt"><label>{isImage?"输入照片提示词":selectedModel?.requires_prompt === false?"提示词（选填）":"提示词"}</label><textarea value={prompt} onChange={e=>setPrompt(e.target.value)} maxLength={selectedModel?.max_prompt_length || 8000} placeholder={promptPlaceholders[activeMode] || (isImage ? promptPlaceholders["image-edit"] : defaultVideoPlaceholder)}/><small>{prompt.length}/{selectedModel?.max_prompt_length || (isImage?3000:8000)}</small></div><div className="generation-settings-anchor generation-anchor-editor"><button type="button" className="generation-settings-trigger" aria-expanded={settings} onClick={()=>setSettings(!settings)}><SlidersHorizontal size={16} aria-hidden="true"/><span>{settingsSummary}</span><ChevronDown size={16} className={settings?"is-open":""} aria-hidden="true"/></button>{settings&&<div className="generation-settings-popover generation-settings-editor"><GenerationSettings kind={taskKind} quality={quality} ratio={ratio} duration={duration} fixedResolution={selectedModel?.fixed_resolution ?? true} resolutionLabel={selectedModel?.resolution_label || "选择模型后显示"} supportedQualities={selectedModel?.supported_qualities || []} supportedRatios={selectedModel?.supported_ratios || []} supportedDurations={selectedModel?.supported_durations || []} onQualityChange={setQuality} onRatioChange={setRatio} onDurationChange={setDuration} /></div>}</div><button className="editor-generate" onClick={submitTask} disabled={sending}>{generateLabel}</button></div><div className="editor-right"><div className="result-tabs"><button className={resultPanel==="examples"?"selected":""} onClick={()=>setResultPanel("examples")}>参考示例</button><button className={resultPanel==="guide"?"selected":""} onClick={()=>setResultPanel("guide")}>创作指南</button><button className={resultPanel==="works"?"selected":""} onClick={()=>{if(requireAccount()) setResultPanel("works")}}>我的作品</button></div>{resultPanel==="guide"?<CreationGuide kind={section}/>:resultPanel==="examples"?(tool && tool.slug !== "ai-motion-control" ? <div className="studio-tool-overview"><div className="studio-tool-overview-image"><img src={tool.image} alt={`${tool.title}示例`}/></div><div className="studio-tool-overview-copy"><span>创作指南</span><h2>{tool.title}</h2><p>{tool.description}</p><h3>开始创作</h3><ol><li>上传所需的参考素材</li><li>根据需要调整提示词和生成设置</li><li>点击立即生成，在我的作品中查看结果</li></ol>{tool.note && <p className="studio-tool-note">{tool.note}</p>}</div></div> : isImage?<ImageExamples key={section} edit={section!=="text-to-image"} onApply={example=>void applyImageExample(example)}/>:isTextVideo?<TextVideoExamples onApply={setPrompt}/>:<VideoExamples key={section} mode={section==="character-replacement"?"replacement":section==="motion-transfer"?"motion":"reference"} onApply={applyVideoExample}/>):<TaskGallery onAuthRequired={()=>setAuthDialog(true)} key={galleryVersion} user={user} authLoading={authLoading} authError={authError} kind={isImage?"image":"video"}/>}</div></div>}
 {section==="ai-tools"&&<div className="tools-page"><h2>AI <span>工具</span></h2><p>探索智能工具箱，一键简化复杂的视频处理</p><h3>工作室</h3><div className="studio-cards">{studios.map(item=><a href={`/ai-tools/${item.slug}`} key={item.slug}><img src={item.image} alt=""/><div><b>{item.title}</b><p>{item.description}</p><small>探索更多</small></div></a>)}</div><h3>所有工具</h3><div className="tools-grid">{studioTools.map(item=><a href={`/ai-tools/${item.slug}`} key={item.slug} className="studio-card"><div className="studio-card-image"><img src={item.image} alt="" loading="lazy" decoding="async"/>{item.fresh&&<span className="studio-card-new">NEW</span>}<span className="studio-card-status">{!item.mode ? "即将上线" : item.slug === "ai-motion-control" ? "可用" : "体验版"}</span></div><div className="studio-card-body"><b>{item.title}</b><p>{item.description}</p><span className="studio-card-cta">立即试用 <span>→</span></span></div></a>)}</div></div>}
 {studio && <div className="studio-detail"><a className="studio-back" href="/ai-tools">← 返回工作室</a>{studios.filter(item=>item.slug===studio).map(item=><div className="studio-detail-hero" key={item.slug}><img src={item.image} alt=""/><div><span>AIBox Studio</span><h1>{item.title}</h1><p>{item.description}</p></div></div>)}<h2>探索工具</h2><div className="tools-grid">{studioTools.filter(item=>studios.some(group=>group.slug===studio && group.group===item.group)).map(item=><a className="studio-card" href={`/ai-tools/${item.slug}`} key={item.slug}><div className="studio-card-image"><img src={item.image} alt=""/></div><div className="studio-card-body"><b>{item.title}</b><p>{item.description}</p><span className="studio-card-cta">立即试用 →</span></div></a>)}</div></div>}
 {tool && !tool.mode && <div className="studio-unavailable"><a className="studio-back" href="/ai-tools">← 返回工作室</a><div className="studio-unavailable-hero"><div><span>AIBox 工具</span><h1>{tool.title}</h1><p>{tool.description}</p><div className="studio-tool-note">{tool.note} 此功能正在准备中。</div><a className="studio-alt-button" href="/create">探索现有创作工具 →</a></div><img src={tool.image} alt=""/></div><div className="studio-unavailable-guide"><h2>如何使用</h2><p>功能上线后，可在此上传素材、调整参数并查看作品。</p></div></div>}
 {section==="effects"&&<div className="effects-page"><div className="effects-heading"><div><h2>AI<span>玩法模板</span></h2><p className="effects-subtitle">发现灵感，选择模板开始创作</p></div><label><Search size={16}/><input value={search} onChange={e=>{setSearch(e.target.value);setEffectsCount(24)}} placeholder="搜索模板或提示词..."/></label></div><div className="categories">{categories.map(c=><button className={c===category?"active":""} onClick={()=>{setCategory(c);setEffectsCount(24)}} key={c}>{c}</button>)}</div>{effectsError && <p role="alert">{effectsError}</p>}{!effectTemplates && !effectsError && <p role="status">正在加载模板…</p>}<div className="effects-grid">{filteredEffects.slice(0,effectsCount).map(item=><article className="effects-card" key={item.id}><button type="button" className="effects-card-action" onClick={()=>applyEffectTemplate(item)} aria-label={`使用${item.title}模板`}><img src={item.image} alt="" width={item.width} height={item.height} loading="lazy" decoding="async"/><span>{item.title}<small>{item.category}</small></span><em><Sparkles size={16} aria-hidden="true"/>{item.mode === "unavailable" ? "即将支持" : "一键同款"}</em></button><a className="effects-source" href={item.source} target="_blank" rel="noreferrer">查看来源 ↗</a></article>)}</div>{effectTemplates && filteredEffects.length === 0 && <p role="status">没有找到匹配的模板</p>}{effectsCount < filteredEffects.length && <div ref={effectsSentinel} className="effects-loading" role="status">正在加载更多模板…</div>}</div>}
 {(section==="my"||section==="assets")&&<div className="assets-page"><div className="assets-tabs"><a className={section==="my"?"active":""} href="/my" onClick={event=>{if(!requireAccount()) event.preventDefault()}}>我的作品</a><a className={section==="assets"?"active":""} href="/assets" onClick={event=>{if(!requireAccount()) event.preventDefault()}}>元素库</a></div>{section==="my" ? <> <div className="asset-filters">{(["all","video","image","audio"] as const).map(value=><button key={value} className={workKind===value?"selected":""} onClick={()=>{if(requireAccount()) setWorkKind(value)}}>{value==="all"?"\u5168\u90e8":value==="video"?"\u89c6\u9891":value==="audio"?"声音":"\u56fe\u7247"}</button>)}</div>{workKind === "audio" ? <VoiceWorks user={user}/> : <><TaskGallery onAuthRequired={()=>setAuthDialog(true)} key={workKind} kind={workKind === "all" ? undefined : workKind} user={user} authLoading={authLoading} authError={authError}/>{workKind === "all" && user && <VoiceWorks user={user}/>}</>}</> : <AssetGallery onAuthRequired={()=>setAuthDialog(true)} user={user} authLoading={authLoading} authError={authError}/>}</div>}
 {assetPicker&&<div className="asset-picker-overlay" onClick={()=>setAssetPicker(null)}><div className="asset-picker-dialog" role="dialog" aria-modal="true" aria-label="从资产导入" onClick={event=>event.stopPropagation()}><header><b>从资产导入</b><button type="button" onClick={()=>setAssetPicker(null)} aria-label="关闭">×</button></header><div className="asset-filters">{(["works","library"] as const).map(source=><button type="button" key={source} className={assetSource===source?"selected":""} aria-pressed={assetSource===source} onClick={()=>setAssetSource(source)}>{source==="works"?"我的作品":"元素库"}</button>)}</div>{assetSource==="works"?<WorkPicker key={assetPicker} user={user} authLoading={authLoading} authError={authError} kind={assetPicker==="video"?"video":"image"} onSelect={asset=>void selectAsset(asset)}/>:<AssetGallery key={assetPicker} user={user} authLoading={authLoading} authError={authError} selectKind={assetPicker==="video"?"video":"image"} onSelect={asset=>void selectAsset(asset)}/>}</div></div>}
 {authDialog&&<AuthDialog onClose={()=>setAuthDialog(false)} onSuccess={account=>{setUser(account);setAuthError("");showPageNotice("");setAuthDialog(false)}}/>}
 </main></div>
}
