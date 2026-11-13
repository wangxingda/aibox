import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { AdminDashboard } from "@/components/sites/aibox/admin-dashboard";

export default async function Page() {
  const session = (await cookies()).get("session_token")?.value;
  if (session) {
    let response: Response | undefined;
    try {
      response = await fetch(`${process.env.BACKEND_URL || "http://127.0.0.1:8000"}/api/admin/me`, {
        headers: { cookie: `session_token=${session}` },
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      // Let the dashboard display its normal connection error and retry path.
    }
    if (response?.status === 403) notFound();
  }
  return <AdminDashboard/>;
}
