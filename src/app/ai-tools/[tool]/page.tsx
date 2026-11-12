import { notFound } from "next/navigation";
import { Workspace } from "@/components/sites/aibox/workspace";
import { findStudioTool, studios, studioTools } from "@/components/sites/aibox/studio-data";

export function generateStaticParams() {
  return [...studios, ...studioTools].map(item => ({ tool: item.slug }));
}
export default async function Page({ params }: { params: Promise<{ tool: string }> }) {
  const { tool: slug } = await params;
  const studio = studios.find(item => item.slug === slug);
  if (studio) return <Workspace section="studio-detail" studio={slug} />;
  const tool = findStudioTool(slug);
  if (!tool) notFound();
  return <Workspace section={tool.mode || "studio-detail"} tool={tool} />;
}
