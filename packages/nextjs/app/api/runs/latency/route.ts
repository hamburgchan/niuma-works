import { recordLatency } from "~~/utils/niuma-live";
import { json } from "~~/utils/niuma-server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    return json(await recordLatency(body.hash, body.elapsedMs));
  } catch {
    return json({ error: "Timing sample was not recorded" }, 400);
  }
}
