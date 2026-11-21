import { client, deployment, json, orderId } from "~~/utils/niuma-server";

export async function GET(_request: Request, context: { params: Promise<{ characterId: string }> }) {
  try {
    const id = orderId((await context.params).characterId);
    const c = await client.readContract({ ...deployment, functionName: "characters", args: [id] });
    const expected = `https://niuma-works.vercel.app/chars/${c[1].slice(2)}.png`;
    if (c[2] !== expected) return json({ error: "Unsupported asset URI" }, 400);
    return Response.redirect(expected, 302);
  } catch {
    return json({ error: "Asset unavailable" }, 503);
  }
}
