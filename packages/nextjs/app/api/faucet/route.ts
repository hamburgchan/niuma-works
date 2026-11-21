import { type Hex, getAddress, verifyMessage } from "viem";
import { faucetStatus, grant, safeReason } from "~~/utils/demo-bank-server";
import { json } from "~~/utils/niuma-server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    const address = new URL(request.url).searchParams.get("address");
    return json(await faucetStatus(address ? getAddress(address) : undefined));
  } catch {
    return json({ error: "暂时无法读取开工费额度" }, 503);
  }
}
export async function POST(request: Request) {
  try {
    const { address, issuedAt, signature } = await request.json();
    const recipient = getAddress(address);
    if (!Number.isInteger(issuedAt) || Math.abs(Date.now() - issuedAt) > 120000)
      return json({ error: "签名已过期，请重试" }, 400);
    const message = `NIUMA WORKS opening grant\nchainId: 10143\naddress: ${recipient}\nissuedAt: ${issuedAt}`;
    if (!(await verifyMessage({ address: recipient, message, signature: signature as Hex })))
      return json({ error: "临时钱包签名不匹配" }, 403);
    return json(await grant(recipient));
  } catch (error) {
    return json({ error: `开工费暂未确认：${safeReason(error)}。请先刷新额度，勿更换地址重复申请。` }, 503);
  }
}
