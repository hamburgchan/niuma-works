import { BOT_ROOT, runBotBatch } from "~~/utils/niuma-bots";
import { json, readRecord } from "~~/utils/niuma-server";

export const runtime = "nodejs";
export const maxDuration = 300;
export async function GET(request: Request) {
  try {
    const requested = new URL(request.url).searchParams.get("id");
    const id = requested || (await readRecord(`${BOT_ROOT}/latest.json`))?.batchId;
    if (typeof id !== "string" || !/^[0-9a-f-]{36}$/.test(id)) return json({ batch: null });
    return json({ batch: await readRecord(`${BOT_ROOT}/batches/${id}.json`) });
  } catch {
    return json({ error: "Bot batch unavailable" }, 503);
  }
}
export async function POST(request: Request) {
  try {
    return json({ batch: await runBotBatch(await request.json()) });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message.slice(0, 240) : "Bot batch failed" }, 400);
  }
}
