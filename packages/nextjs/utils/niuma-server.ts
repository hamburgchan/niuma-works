import { BlobNotFoundError, get, put } from "@vercel/blob";
import "server-only";
import { createPublicClient, http, keccak256, stringToHex, verifyMessage } from "viem";
import { monadTestnet } from "viem/chains";
import deployedContracts from "~~/contracts/deployedContracts";

export const deployment = deployedContracts[10143].NiumaWorks;
export const access = process.env.BLOB_ACCESS === "private" ? "private" : "public";
export const client = createPublicClient({
  chain: monadTestnet,
  transport: http(process.env.MONAD_RPC_URL || "https://testnet-rpc.monad.xyz"),
});

export function orderId(value: string) {
  if (!/^[1-9][0-9]{0,17}$/.test(value)) throw new Error("Invalid order ID");
  return BigInt(value);
}

export function blobPath(id: bigint, name: string) {
  return `niuma/${deployment.address.toLowerCase()}/orders/${id}/${name}`;
}

export async function readOrder(id: bigint) {
  if ((await client.getChainId()) !== 10143) throw new Error("Monad testnet only");
  const count = await client.readContract({ ...deployment, functionName: "orderCount" });
  if (id > count) throw new Error("Unknown order");
  return client.readContract({ ...deployment, functionName: "orders", args: [id] });
}

export async function readRecord(path: string): Promise<Record<string, unknown> | null> {
  try {
    const result = await get(path, { access, useCache: false });
    if (!result || result.statusCode !== 200) return null;
    return JSON.parse(await new Response(result.stream).text());
  } catch (error) {
    if (error instanceof BlobNotFoundError) return null;
    throw error;
  }
}

export async function queueOrder(id: bigint, body: { prompt?: unknown; signature?: unknown }) {
  const order = await readOrder(id);
  if (typeof body.prompt !== "string" || body.prompt.length < 1 || body.prompt.length > 500)
    throw new Error("Prompt must contain 1–500 characters");
  const hash = keccak256(stringToHex(body.prompt));
  if (hash !== order[1]) throw new Error("Exact prompt does not match on-chain promptHash");
  const message = `NIUMA WORKS start\nchainId: 10143\ncontract: ${deployment.address}\norderId: ${id}\npromptHash: ${hash}`;
  if (
    typeof body.signature !== "string" ||
    !/^0x[0-9a-fA-F]+$/.test(body.signature) ||
    !(await verifyMessage({ address: order[0], message, signature: body.signature as `0x${string}` }))
  )
    throw new Error("Buyer signature required");
  const existing =
    (await readRecord(blobPath(id, "progress.json"))) || (await readRecord(blobPath(id, "request.json")));
  if (existing) return { existing: true, ...existing };
  if (order[3] !== 0) throw new Error("Order is not Funded");
  if (order[2] <= BigInt(Math.floor(Date.now() / 1000))) throw new Error("Order deadline passed");
  if (process.env.GENERATION_ENABLED !== "true") throw new Error("Generation is disabled");
  const request = {
    orderId: id.toString(),
    prompt: body.prompt,
    source: "用户委托",
    status: "queued",
    mode: "generated",
    createdAt: new Date().toISOString(),
    worker: "local",
  };
  try {
    await put(blobPath(id, "request.json"), JSON.stringify(request), {
      access,
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: false,
      cacheControlMaxAge: 60,
    });
  } catch (error) {
    // A concurrent request may have created the same immutable queue entry.
    const winner = await readRecord(blobPath(id, "request.json"));
    if (winner) return { existing: true, ...winner };
    throw error;
  }
  return request;
}

export function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
}
