import { claimFaucet, faucetStatus } from "~~/utils/niuma-faucet";
import { json } from "~~/utils/niuma-server";

export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET() {
  try {
    return json(await faucetStatus());
  } catch {
    return json({ error: "Faucet unavailable" }, 503);
  }
}
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await claimFaucet(body.address, body.signature, request);
    return json(result, result.state === "PENDING" ? 202 : 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const safe =
      /^(Invalid wallet|Wallet signature|Temporary EOA|演示额度用完|当前网络|Faucet unavailable|Faucet balance insufficient|Faucet busy)/.test(
        message,
      );
    return json(
      { error: safe ? message : "领取服务暂不可用，请勿更换地址重复领取" },
      /额度|频繁/.test(message) ? 429 : safe ? 400 : 503,
    );
  }
}
