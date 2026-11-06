import { notFound } from "next/navigation";
import { InfoPage } from "@/components/sites/aibox/info-page";
const tools: Record<string, string> = { "marketing-studio":"营销工作室", "ai-avatar-studio":"Avatar Studio", "ai-genjutsu-video-edit":"AI Genjutsu视频魔改", "ai-ad-generator":"AI广告生成器", "ai-video-clone":"AI视频广告克隆", "ai-avatar":"AI数字人", "ai-product-avatar":"AI商品数字人", "ai-motion-control":"AI动作迁移", "florida-meme":"AI佛罗里达梗", "ai-virtual-try-on":"AI试穿", "infinite-camera-angles":"无限机位视角", "ai-lip-sync":"AI对口型", "ai-video-extender":"AI视频延长", "ai-video-enhancer":"AI视频画质增强" };
export function generateStaticParams() { return Object.keys(tools).map(tool => ({ tool })); }
export default async function Page({ params }: { params: Promise<{ tool: string }> }) { const { tool } = await params; const title = tools[tool]; if (!title) notFound(); return <InfoPage title={title} description="在创作工作台中上传素材、描述你的创意，并选择适合的生成设置。此工具的生成服务尚未接入。" action="打开创作工作台" />; }
