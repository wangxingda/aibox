export type BackendUser = { id: string; email: string };
export type BackendModel = { id: string; kind: "image" | "video"; requires_image: boolean; supports_image: boolean; requires_second_image: boolean; supports_second_image: boolean; requires_video: boolean; supports_video: boolean; requires_prompt: boolean; max_prompt_length: number; fixed_resolution: boolean; resolution_label: string; supported_qualities: string[]; supported_ratios: string[]; supported_durations: string[]; modes: string[]; default_ratio: string };
export type BackendTask = { id: string; status: string; progress: number | null; kind: string; prompt: string; model: string; upload_id: string | null; options: { quality?: string; ratio?: string; duration?: string; second_upload_id?: string | null; video_upload_id?: string | null }; error: string | null; created_at: string; updated_at: string; outputs: { url: string }[] };

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try { response = await fetch(`/api${path}`, { credentials: "same-origin", ...init }); }
  catch { throw new Error("无法连接后端服务，请稍后重试。"); }
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { detail?: string } | null;
    throw new ApiError(typeof body?.detail === "string" ? body.detail : `请求失败 (${response.status})`, response.status);
  }
  return response.json() as Promise<T>;
}
