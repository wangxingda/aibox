import { Sparkles } from "lucide-react";

export function GenerateLabel({ label, cost }: { label: string; cost?: number | null }) {
  return <><span>{label}</span>{cost != null && <span className="generate-credit" aria-label={`消耗 ${cost} 积分`}><Sparkles size={15} fill="currentColor" aria-hidden="true"/>{cost}</span>}</>;
}
