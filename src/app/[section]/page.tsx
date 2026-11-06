import { notFound, redirect } from "next/navigation";
import { Workspace } from "@/components/sites/aibox/workspace";
import { InfoPage } from "@/components/sites/aibox/info-page";
const workspaceSections = ["explore", "create", "image-to-video", "text-to-video", "image-edit", "image-to-image", "text-to-image", "refer-to-video", "video-to-video", "frame-to-video", "character-replacement", "motion-transfer", "ai-tools", "effects", "my", "assets"];
const information: Record<string, { title: string; description: string }> = {
  pricing: { title: "选择适合你的创作方案", description: "浏览创作工作台并探索视频与图片生成工具。套餐和支付服务尚未接入。" },
  about: { title: "关于 AIBox", description: "AIBox 提供图片与视频创作工作台，帮助你从文字和图片出发探索创意。" },
  "privacy-policy": { title: "隐私政策", description: "本地服务会处理注册邮箱、密码哈希、上传素材与生成任务。正式服务的隐私政策尚未配置。" },
  "terms-conditions": { title: "使用条款", description: "本地演示的正式使用条款尚未配置。" },
  "refund-policy": { title: "退款政策", description: "本地演示尚未接入支付服务，退款政策尚未配置。" },
};
export function generateStaticParams() { return [...workspaceSections, ...Object.keys(information)].map(section => ({ section })); }
export default async function Page({ params }: { params: Promise<{ section: string }> }) { const { section } = await params; const legacyVideoRoutes: Record<string, string> = { "text-to-video": "image-to-video", "refer-to-video": "image-to-video", "video-to-video": "character-replacement", "frame-to-video": "motion-transfer" }; if (legacyVideoRoutes[section]) redirect(`/${legacyVideoRoutes[section]}`); if (workspaceSections.includes(section)) return <Workspace section={section} />; if (information[section]) return <InfoPage {...information[section]} />; notFound(); }
