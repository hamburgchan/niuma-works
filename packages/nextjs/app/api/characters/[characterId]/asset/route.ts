import { get } from "@vercel/blob";
import { access, blobPath, client, deployment, json, orderId, readRecord } from "~~/utils/niuma-server";

export const runtime = "nodejs";
export async function GET(_request: Request, context: { params: Promise<{ characterId: string }> }) {
  try {
    const id = orderId((await context.params).characterId);
    if ((await client.getChainId()) !== 10143) return json({ error: "Wrong chain" }, 503);
    const count = await client.readContract({ ...deployment, functionName: "characterCount" });
    if (id > count) return json({ error: "Unknown character" }, 404);
    const character = await client.readContract({ ...deployment, functionName: "characters", args: [id] });
    // Only operator-registered objects inside this application's prefix are served.
    const progress = await readRecord(blobPath(character[3], "progress.json"));
    const uri =
      typeof progress?.publicUrl === "string" && progress?.sha256 === character[1].slice(2)
        ? progress.publicUrl
        : character[2];
    const url = new URL(uri);
    if (
      !url.hostname.endsWith(`.${access}.blob.vercel-storage.com`) ||
      !url.pathname.startsWith(`/niuma/${deployment.address.toLowerCase()}/orders/`)
    )
      return json({ error: "Unsupported asset storage" }, 400);
    const result = await get(uri, { access, useCache: false });
    if (!result || result.statusCode !== 200) return json({ error: "Asset unavailable" }, 404);
    return new Response(result.stream, {
      headers: {
        "Content-Type": uri.endsWith(".png") ? "image/png" : "application/octet-stream",
        "Cache-Control": "public, max-age=3600, immutable",
        "X-Content-SHA256": character[1],
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return json({ error: "Asset unavailable" }, 503);
  }
}
