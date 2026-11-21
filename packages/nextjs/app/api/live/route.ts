import { liveData } from "~~/utils/niuma-live";
import { json } from "~~/utils/niuma-server";

export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET() {
  try {
    return Response.json(await liveData(), {
      headers: { "Cache-Control": "public, s-maxage=15, stale-while-revalidate=30" },
    });
  } catch (error) {
    console.error(
      "Live sync failed",
      error instanceof Error
        ? {
            name: error.name,
            versionRefreshing: error.message.includes("version is refreshing"),
            missing: error.message.includes("not found"),
          }
        : "UnknownError",
    );
    return json({ error: "链上动态暂时无法读取，稍后自动重试" }, 503);
  }
}
