import batches from "~~/contracts/botResults.json";
import { authorize, latestServerBatch, safeReason, serverRush } from "~~/utils/demo-bank-server";
import { deployment, json } from "~~/utils/niuma-server";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET() {
  const current = batches.filter(batch => batch.contract.toLowerCase() === deployment.address.toLowerCase());
  const latest = await latestServerBatch().catch(() => null);
  return Response.json(
    {
      batch: latest || current.at(-1) || null,
      comparisons: ["hot", "spread"].map(mode => current.filter(batch => batch.mode === mode).at(-1)).filter(Boolean),
      storageAvailable: true,
      serverSide: true,
    },
    { headers: { "Cache-Control": "public, s-maxage=15, stale-while-revalidate=30" } },
  );
}
export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!authorize(body.code)) return json({ error: "演示口令不正确" }, 403);
    return json({ batch: await serverRush(body.count ?? 100) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const expected = /^(每 10 分钟|单批只能|部署钱包余额不足|0.013 MON 不足|DEMO_CODE 未配置)/.test(message);
    if (expected) return json({ error: message }, 503);
    const hash = (error as { hash?: string })?.hash;
    const latest = await latestServerBatch().catch(() => null);
    const fundingState = latest?.phase === "UNRESOLVED" ? "FUNDED" : hash || !latest ? "UNKNOWN" : "NOT_FUNDED";
    return json(
      {
        error: `${safeReason(error)}。${fundingState === "NOT_FUNDED" ? "未建立新的充值批次；请稍后重试。" : fundingState === "FUNDED" ? "原批次已充值，请恢复原批次；不会再次充值。" : "正在核对原批次；请刷新批次状态后再操作。"}`,
        fundingState,
        ...(hash ? { hash } : {}),
        ...(latest?.phase === "UNRESOLVED" ? { batch: latest } : {}),
      },
      503,
    );
  }
}
