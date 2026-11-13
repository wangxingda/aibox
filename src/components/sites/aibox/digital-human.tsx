/* eslint-disable @next/next/no-img-element */
"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { VoicePlayer } from "./voice-player";
import { ExampleMediaPreview } from "./example-media-preview";
import { AudioLines, ImagePlus, Sparkles, UserRound, Mic } from "lucide-react";
import { api, type BackendTask, type BackendUser } from "@/lib/backend";
import { CreationGuide } from "./creation-guide";
import { AssetGallery, type Asset } from "./asset-gallery";
import digitalExamples from "./digital-examples-data.json";
import "./video-examples.css";
import { TaskGallery } from "./task-gallery";
import "./digital-human.css";


function MediaPreview({file, url, kind, label}: {file: File|null; url: string; kind: "image"|"audio"; label: string}) {
 const [position,setPosition]=useState<{left:number;top:number}|null>(null);
 const open=(element:HTMLElement)=>{if(!file || !url)return;const rect=element.getBoundingClientRect();const width=Math.min(360,window.innerWidth-24), height=Math.min(300,window.innerHeight-24);setPosition({left:Math.max(12,Math.min(window.innerWidth-width-12,rect.right+12)),top:Math.max(12,Math.min(window.innerHeight-height-12,rect.top))});};
 return <><div className="media-input-preview" tabIndex={file ? 0 : undefined} aria-label={file ? `${label}，悬停或聚焦预览` : label} onMouseEnter={e=>open(e.currentTarget)} onMouseLeave={()=>setPosition(null)} onFocus={e=>open(e.currentTarget)} onBlur={()=>setPosition(null)}>{kind==="image" && file && url ? <img className="upload-thumbnail" src={url} alt="人物图片预览"/> : kind==="image" ? <ImagePlus size={24}/> : <AudioLines size={24}/>}<span className="media-input-name" title={file?.name || "尚未选择素材"}>{file?.name || "尚未选择素材"}</span></div>{position && file && url && createPortal(<div className="media-hover-preview" style={position}>{kind==="image" ? <img src={url} alt=""/> : <div className="digital-audio-hover"><AudioLines size={42}/><strong>{file.name}</strong><span>音频素材 · 可在下方点击试听</span></div>}</div>,document.body)}</>;
}
function useFileUrl(file:File|null) {
 const [preview,setPreview]=useState<{file:File;url:string}|null>(null);
 useEffect(()=>{if(!file)return;const url=URL.createObjectURL(file);const timer=window.setTimeout(()=>setPreview({file,url}),0);return()=>{clearTimeout(timer);URL.revokeObjectURL(url);};},[file]);
 return preview?.file===file ? preview.url : "";
}

type DigitalExample = {id:string;title:string;image:string;inputImage:string;inputAudio:string;video?:string;prompt:string};
const examples: DigitalExample[] = digitalExamples;
function ExampleAudio({src}: {src:string}) {
 const [url,setUrl]=useState("");
 useEffect(()=>{let active=true, objectUrl="";fetch(src).then(response=>{if(!response.ok)throw new Error();return response.blob();}).then(blob=>{if(!active)return;objectUrl=URL.createObjectURL(new Blob([blob],{type:"audio/wav"}));setUrl(objectUrl);}).catch(()=>{if(active)setUrl("");});return()=>{active=false;if(objectUrl)URL.revokeObjectURL(objectUrl);};},[src]);
 return <div className="digital-example-audio"><span><AudioLines size={16}/>驱动音频</span>{url ? <VoicePlayer src={url} label="示例驱动音频试听"/> : <small>音频加载中或不可用</small>}</div>;
}
export function DigitalHuman({user, authLoading, authError, requireAccount, compact=false, mediaInput: CompactMedia}: {user:BackendUser|null; authLoading:boolean; authError:string; requireAccount:()=>boolean; compact?:boolean; mediaInput?: React.ComponentType<{title:string;required:boolean;file:File|null;audio?:boolean;onFile:(file:File|null)=>void;onChoose:()=>void}>}) {
 const [image,setImage]=useState<File|null>(null), [audio,setAudio]=useState<File|null>(null), [prompt,setPrompt]=useState("");
 const [submitted,setSubmitted]=useState(false);
 const [audioId,setAudioId]=useState(""), [cost,setCost]=useState<number|null>(null), [error,setError]=useState(""), [busy,setBusy]=useState(false), [panel,setPanel]=useState<"examples"|"guide"|"works">("examples"), [revision,setRevision]=useState(0);
 const [picker,setPicker]=useState<"image"|"audio"|null>(null), [selectedExample,setSelectedExample]=useState(0), [applying,setApplying]=useState(false);
 const requestKey=useRef<string|null>(null), pending=useRef(false), editLoaded=useRef(false);
 useEffect(()=>{
  if(!user || editLoaded.current)return;
  const id=new URLSearchParams(window.location.search).get("edit");
  if(!id)return;
  editLoaded.current=true;
  let active=true;
  async function restore(){
   setBusy(true);setError("");
   try{
    const task=await api<BackendTask>(`/tasks/${encodeURIComponent(id!)}`);
    if(task.options?.mode!=="digital-human-audio")throw new Error("该任务不是数字人音频驱动作品。 ");
    const loadFile=async (uploadId:string|null|undefined, fallback:string)=>{
     if(!uploadId)throw new Error("原素材不存在");
     const asset=await api<{id:string;content_type:string;url:string}>(`/uploads/${encodeURIComponent(uploadId)}`);
     const response=await fetch(asset.url,{credentials:"same-origin"});
     if(!response.ok)throw new Error("素材文件不可用");
     return new File([await response.blob()],fallback,{type:asset.content_type});
    };
    const audioUploadId=task.options.audio_upload_id;
    const [imageResult,audioResult]=await Promise.allSettled([loadFile(task.upload_id,"人物参考图片"),loadFile(audioUploadId,"驱动音频")]);
    let quote:number|null=null;
    if(audioResult.status==="fulfilled" && audioUploadId){
     try{quote=(await api<{cost:number}>(`/credits/quote?${new URLSearchParams({model:"InfiniTalk 音频驱动",kind:"video",audio_upload_id:audioUploadId})}`)).cost;}catch{/* The selected audio stays available for audition and replacement. */}
    }
    if(!active)return;
    setPrompt(task.prompt);requestKey.current=null;
    setImage(imageResult.status==="fulfilled"?imageResult.value:null);
    setAudio(audioResult.status==="fulfilled"?audioResult.value:null);
    setAudioId(audioResult.status==="fulfilled" && quote!==null && audioUploadId?audioUploadId:"");setCost(quote);
    const missing=[imageResult.status==="rejected"?"人物图片":"",audioResult.status==="rejected"?"驱动音频":""].filter(Boolean);
    if(missing.length)setError(`原${missing.join("和")}无法读取，请重新选择素材。`);
    else if(quote===null)setError("无法计算原音频的积分，请重新选择音频后再试。");
    window.history.replaceState(null,"",window.location.pathname);
   }catch(cause){if(active)setError(cause instanceof Error?cause.message:"无法读取原任务。");}
   finally{if(active)setBusy(false);}
  }
  void restore();return()=>{active=false;editLoaded.current=false;};
 },[user]);
 const imageUrl=useFileUrl(image), audioUrl=useFileUrl(audio);
 async function upload(file:File, path:string){const form=new FormData();form.append("file",file);return api<{id:string}>(path,{method:"POST",body:form});}
 async function selectAudio(file:File|null){requestKey.current=null;setAudio(file);setAudioId("");setCost(null);setError("");if(!file)return;if(!requireAccount())return;setBusy(true);try{const asset=await upload(file,"/uploads/audio");const quote=await api<{cost:number}>(`/credits/quote?${new URLSearchParams({model:"InfiniTalk 音频驱动",kind:"video",audio_upload_id:asset.id})}`);setAudioId(asset.id);setCost(quote.cost);}catch(err){setError(err instanceof Error?err.message:"音频检查失败");}finally{setBusy(false);}}
 async function selectAsset(asset:Asset){
  const target=picker;setPicker(null);if(!target)return;setBusy(true);setError("");
  try{const response=await fetch(asset.url);if(!response.ok)throw new Error("素材读取失败，请重试。");const blob=await response.blob();const name=asset.name || (target==="image"?"参考图片":"声音素材");const file=new File([blob],name,{type:blob.type});if(target==="image"){requestKey.current=null;setImage(file);}else{setBusy(false);await selectAudio(file);return;}}catch(err){setError(err instanceof Error?err.message:"素材读取失败，请重试。");}finally{setBusy(false);}
 }
 async function applyExample(){if(!requireAccount())return;const item=examples[selectedExample];setApplying(true);setError("");try{const response=await fetch(item.inputImage);if(!response.ok)throw new Error("示例图片加载失败，请重试。");const blob=await response.blob();const audioResponse=await fetch(item.inputAudio);if(!audioResponse.ok)throw new Error("示例音频加载失败，请重试。");const audioBlob=await audioResponse.blob();setImage(new File([blob],item.inputImage.split("/").pop()||"参考图片.jpg",{type:blob.type}));setPrompt(item.prompt);requestKey.current=null;await selectAudio(new File([audioBlob],"示例驱动音频.wav",{type:"audio/wav"}));}catch(err){setError(err instanceof Error?err.message:"示例加载失败");}finally{setApplying(false);}}
 async function submit(){if(!requireAccount()||pending.current)return;if(!image||!audioId||cost===null){setError("请先选择人物图片和有效的驱动音频。");return;}pending.current=true;setBusy(true);setError("");try{const imageAsset=await upload(image,"/uploads");if(!requestKey.current)requestKey.current=crypto.randomUUID();await api("/tasks",{method:"POST",headers:{"Content-Type":"application/json","Idempotency-Key":requestKey.current},body:JSON.stringify({kind:"video",model:"InfiniTalk 音频驱动",mode:"digital-human-audio",prompt,upload_id:imageAsset.id,audio_upload_id:audioId})});requestKey.current=null;setRevision(x=>x+1);setPanel("works");setSubmitted(true);window.dispatchEvent(new Event("aibox:credits-changed"));}catch(err){setError(err instanceof Error?err.message:"提交失败，请稍后重试。");}finally{pending.current=false;setBusy(false);}}
 if(compact)return <div className="home-voice-form">{picker && <div className="asset-picker-overlay" onClick={()=>setPicker(null)}><div className="asset-picker-dialog" role="dialog" aria-modal="true" aria-label="从资产导入素材" onClick={e=>e.stopPropagation()}><header><b>从资产导入</b><button type="button" onClick={()=>setPicker(null)} aria-label="关闭">×</button></header><AssetGallery user={user} authLoading={authLoading} authError={authError} selectKind={picker==="image"?"image":"audio"} onSelect={asset=>void selectAsset(asset)}/></div></div>}<div className="create-input">{CompactMedia && <><CompactMedia title="人物图片" required file={image} onFile={file=>{requestKey.current=null;setImage(file);}} onChoose={()=>{if(requireAccount())setPicker("image");}}/><CompactMedia title="驱动音频" required audio file={audio} onFile={file=>void selectAudio(file)} onChoose={()=>{if(requireAccount())setPicker("audio");}}/></>}<textarea value={prompt} maxLength={3000} disabled={busy} onChange={e=>{requestKey.current=null;setPrompt(e.target.value);}} placeholder="描述人物的表情、动作或画面效果（选填）"/></div><div className="create-bottom"><Link href="/voice-audio-drive">更多素材与示例 →</Link><button className="create-generate" disabled={busy||!image||!audioId||cost===null} onClick={()=>void submit()}>{busy?"正在处理…":cost===null?"生成视频":`生成视频 · ${cost} 积分`}</button></div>{error && <p className="home-voice-message" role="alert">{error}</p>}{submitted && <p className="home-voice-message" role="status">任务已提交，可在<Link href="/my">我的作品</Link>中查看。</p>}</div>;
 return <div className="digital-human editor-layout">{picker && <div className="asset-picker-overlay" onClick={()=>setPicker(null)}><div className="asset-picker-dialog" role="dialog" aria-modal="true" aria-label="从资产导入素材" onClick={e=>e.stopPropagation()}><header><b>从资产导入</b><button type="button" onClick={()=>setPicker(null)} aria-label="关闭">×</button></header><AssetGallery user={user} authLoading={authLoading} authError={authError} selectKind={picker==="image"?"image":"audio"} onSelect={asset=>void selectAsset(asset)}/></div></div>}<section className="digital-form editor-left"><nav className="editor-tabs voice-feature-tabs" aria-label="声音创作模式"><Link className="selected" href="/voice-audio-drive" aria-current="page"><UserRound size={16}/>音频驱动</Link><Link href="/voice-clone"><Mic size={16}/>声音克隆</Link></nav><div className="media-input"><div className="media-input-heading"><strong>人物参考图片</strong><span className="media-input-requirement is-required">必填</span></div><MediaPreview file={image} url={imageUrl} kind="image" label="人物参考图片"/><div className="media-input-actions"><label className="media-input-upload">上传<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e=>{requestKey.current=null;setImage(e.target.files?.[0]||null);e.currentTarget.value="";}}/></label><button type="button" className="media-input-import" disabled={busy} onClick={()=>{if(requireAccount())setPicker("image");}}>从资产导入</button></div>{image && <button type="button" className="media-input-remove" disabled={busy} onClick={()=>{requestKey.current=null;setImage(null);}}>移除</button>}</div><div className="media-input"><div className="media-input-heading"><strong>驱动音频</strong><span className="media-input-requirement is-required">必填</span></div><MediaPreview file={audio} url={audioUrl} kind="audio" label="驱动音频"/>{audioUrl && <VoicePlayer src={audioUrl} label="驱动音频试听"/>}<p className="digital-media-hint">WAV、MP3 或 WebM，最大 3 MB，最长 150 秒</p><div className="media-input-actions"><label className="media-input-upload">上传<input type="file" accept=".wav,.mp3,.webm,audio/wav,audio/mpeg,audio/webm" disabled={busy} onChange={e=>{void selectAudio(e.target.files?.[0]||null);e.currentTarget.value="";}}/></label><button type="button" className="media-input-import" disabled={busy} onClick={()=>{if(requireAccount())setPicker("audio");}}>从资产导入</button></div>{audio && <button type="button" className="media-input-remove" disabled={busy} onClick={()=>void selectAudio(null)}>移除</button>}</div><label className="digital-label" htmlFor="digital-prompt">画面描述 <small>选填</small></label><textarea id="digital-prompt" value={prompt} maxLength={3000} disabled={busy} onChange={e=>{requestKey.current=null;setPrompt(e.target.value);}} placeholder="描述人物的表情、动作或画面效果；留空使用默认设置。"/><p className="digital-note">请仅使用你拥有使用权或已获授权的人物和声音素材。</p>{error && <p className="digital-error" role="alert">{error}</p>}<button className="editor-generate digital-submit" disabled={busy||!image||!audioId||cost===null} onClick={()=>void submit()}><Sparkles size={16}/>{busy?"正在处理…":cost===null?"生成数字人":"生成数字人 · " + cost + " 积分"}</button></section><section className="editor-right"><div className="result-tabs"><button className={panel==="examples"?"selected":""} onClick={()=>setPanel("examples")}>参考示例</button><button className={panel==="guide"?"selected":""} onClick={()=>setPanel("guide")}>创作指南</button><button className={panel==="works"?"selected":""} onClick={()=>{if(requireAccount())setPanel("works");}}>我的作品</button></div>{panel==="guide"?<CreationGuide kind="digital-audio"/>:panel==="works"?<TaskGallery key={revision} user={user} authLoading={authLoading} authError={authError} kind="video"/>:<section className="video-examples digital-examples"><div className="video-examples-heading"><div><h2>参考示例</h2><p>观看音频驱动视频示例</p></div><Sparkles size={20}/></div><div className="video-example-feature"><div className="digital-example-image">{examples[selectedExample].video ? <video key={examples[selectedExample].id} src={examples[selectedExample].video} poster={examples[selectedExample].image} controls playsInline preload="metadata" aria-label={`${examples[selectedExample].title}视频示例`}/> : <img src={examples[selectedExample].image} alt={`${examples[selectedExample].title}参考画面`}/>}</div><div className="video-example-info"><span className="video-example-type">数字人参考</span><h3>{examples[selectedExample].title}</h3><span className="video-example-label">画面描述</span><p title={examples[selectedExample].prompt}>{examples[selectedExample].prompt}</p><div className="video-example-inputs"><ExampleMediaPreview src={examples[selectedExample].inputImage} label="人物参考图"/><ExampleMediaPreview src={examples[selectedExample].inputAudio} label="驱动音频" audio/></div><ExampleAudio key={examples[selectedExample].id} src={examples[selectedExample].inputAudio}/><p className="video-example-note">可填入人物图片、驱动音频和画面描述；实际效果以当前工作流为准。</p><button type="button" className="video-example-apply" disabled={busy||applying} onClick={()=>void applyExample()}><Sparkles size={16}/>{applying ? "正在加载素材…" : "使用此参考"}</button></div></div><div className="video-example-list" aria-label="选择参考示例">{examples.map((item,index)=><button key={item.id} type="button" className={selectedExample===index?"selected":""} aria-pressed={selectedExample===index} onClick={()=>setSelectedExample(index)}><img src={item.image} alt=""/><span className="video-example-title">{item.title}</span></button>)}</div></section>}</section></div>;
}
