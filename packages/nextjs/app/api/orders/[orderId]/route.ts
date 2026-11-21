import demos from "~~/contracts/demoCharacters.json";
import { client, deployment, json, orderId, readOrder } from "~~/utils/niuma-server";

export async function GET(_request: Request, context: { params: Promise<{ orderId: string }> }) {
  try {
    const id = orderId((await context.params).orderId),
      o = await readOrder(id);
    const d = demos.find(d => d.orderId === Number(id));
    const c = o[4] > 0n ? await client.readContract({ ...deployment, functionName: "characters", args: [o[4]] }) : null;
    return json({
      ...d,
      orderId: id.toString(),
      buyer: o[0],
      promptHash: o[1],
      deadline: o[2].toString(),
      chainStatus: ["Funded", "Delivered", "Paid", "Refunded"][o[3]],
      characterId: o[4].toString(),
      sha256: c?.[1],
      characterUri: c?.[2],
      assetUrl: c?.[2],
      recruitmentPaused: true,
    });
  } catch {
    return json({ error: "Order unavailable" }, 503);
  }
}
