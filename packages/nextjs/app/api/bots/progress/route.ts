import type { Hash } from "viem";
import { observeBatch } from "~~/utils/bot-observer";
import { safeReason } from "~~/utils/demo-bank-server";
import { json } from "~~/utils/niuma-server";

export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(request: Request) {
  const hash = new URL(request.url).searchParams.get("fundingHash");
  if (!hash || !/^0x[0-9a-fA-F]{64}$/.test(hash)) return json({ error: "Funding hash required" }, 400);
  try {
    return json(await observeBatch(hash as Hash));
  } catch (error) {
    return json({ error: safeReason(error), message: "保留已确认计数，等待真实回执" }, 503);
  }
}
