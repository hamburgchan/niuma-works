import { blobPath, client, deployment, json, orderId, readOrder, readRecord } from "~~/utils/niuma-server";

export const runtime = "nodejs";
export async function GET(_request: Request, context: { params: Promise<{ orderId: string }> }) {
  try {
    const id = orderId((await context.params).orderId);
    const order = await readOrder(id);
    const progress =
      (await readRecord(blobPath(id, "progress.json"))) || (await readRecord(blobPath(id, "request.json")));
    const character =
      order[4] > 0n ? await client.readContract({ ...deployment, functionName: "characters", args: [order[4]] }) : null;
    return json({
      ...progress,
      orderId: id.toString(),
      buyer: order[0],
      promptHash: order[1],
      deadline: order[2].toString(),
      chainStatus: ["Funded", "Delivered", "Paid", "Refunded"][order[3]],
      characterId: order[4].toString(),
      sha256: character?.[1],
      assetUrl: character ? `/api/characters/${order[4]}/asset` : null,
      worker: "local",
    });
  } catch {
    return json({ error: "Order unavailable" }, 503);
  }
}
