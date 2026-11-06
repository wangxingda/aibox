import { notFound } from "next/navigation";
import { InfoPage } from "@/components/sites/aibox/info-page";
const models: Record<string, string> = { "grok-imagine": "Grok Imagine", "hailuo-ai": "Hailuo AI", "kling-4-0": "Kling 4.0", "pixverse-ai": "Pixverse AI", "seedance-2-0": "Seedance 2.0", "sora-2": "Sora 2", "veo-3-1": "Veo 3.1", "wan-3-0": "Wan 3.0", "vidu-q3": "Vidu Q3", "runway-ai": "Runway", "happyhorse-ai": "HappyHorse" };
export function generateStaticParams() { return Object.keys(models).map(model => ({ model })); }
export default async function Page({ params }: { params: Promise<{ model: string }> }) { const { model } = await params; const name = models[model]; if (!name) notFound(); return <InfoPage title={name} description={`探索 ${name} 的视频创作方式。输入文字或上传图片，在创作工作台中选择模型和生成设置。`} action="前往视频创作" href="/image-to-video" />; }
