import { json, orderId, queueOrder } from "~~/utils/niuma-server";

export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ orderId: string }> }) {
  try {
    if (Number(request.headers.get("content-length")) > 4096) return json({ error: "Request too large" }, 413);
    const id = orderId((await context.params).orderId);
    const result = await queueOrder(id, await request.json());
    return json(result, "existing" in result ? 200 : 202);
  } catch (error) {
    // Don't echo transport errors, RPC URLs or SDK internals to browsers.
    const message = error instanceof Error ? error.message : "Request failed";
    const safe =
      /^(Invalid order ID|Unknown order|Prompt must|Exact prompt|Buyer signature|Order is not|Order deadline|Generation is disabled)/.test(
        message,
      );
    return json(
      { error: safe ? message : "Order service unavailable; no new GPU task was submitted" },
      safe ? 400 : 503,
    );
  }
}
