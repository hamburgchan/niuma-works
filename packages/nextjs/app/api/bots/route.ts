import batches from "~~/contracts/botResults.json";
import { deployment, json } from "~~/utils/niuma-server";

export async function GET() {
  const current = batches.filter(batch => batch.contract.toLowerCase() === deployment.address.toLowerCase());
  return Response.json(
    {
      batch: current.at(-1) || null,
      comparisons: ["hot", "spread"].map(mode => current.filter(batch => batch.mode === mode).at(-1)).filter(Boolean),
      storageAvailable: false,
      localWorker: true,
    },
    { headers: { "Cache-Control": "public, s-maxage=15, stale-while-revalidate=30" } },
  );
}
export async function POST() {
  return json({ error: "机器人由本地 worker 执行，请运行 scripts/bot-rush.ps1；服务端不保存私钥或支付队列。" }, 503);
}
