import { BlobNotFoundError, BlobPreconditionFailedError, put } from "@vercel/blob";
import "server-only";
import { type Hash, decodeEventLog } from "viem";
import { DEMO_CHARACTERS, DEMO_EMPLOYEES } from "~~/utils/niuma";
import { access, client, deployment, freshBlob, putState, readRecord } from "~~/utils/niuma-server";

const ROOT = `niuma/${deployment.address.toLowerCase()}/live`;
const PATH = `${ROOT}/events-v1.json`;
export type LiveEvent = {
  robotEmployer?: boolean;
  id: string;
  hash: Hash;
  blockNumber: number;
  logIndex: number;
  event: "Paid" | "RunFinished";
  args: Record<string, string | string[]>;
};
type Cache = { cursor: number; events: LiveEvent[] };
async function cache(): Promise<{ value: Cache; etag?: string }> {
  try {
    const blob = await freshBlob(PATH);
    if (blob?.statusCode === 200)
      return { value: JSON.parse(await new Response(blob.stream).text()), etag: blob.blob.etag };
  } catch (error) {
    if (!(error instanceof BlobNotFoundError)) throw error;
  }
  return { value: { cursor: deployment.deployedOnBlock, events: [] } };
}
let pending: Promise<Cache & { latestBlock: number }> | undefined;
async function refresh() {
  const { value, etag } = await cache();
  const latestBlock = Number(await client.getBlockNumber({ cacheTime: 0 }));
  // Bounded RPC work per request; the durable cursor catches up across requests.
  for (let batch = 0; batch < 16 && value.cursor <= latestBlock; batch++) {
    const end = Math.min(value.cursor + 99, latestBlock);
    const logs = await client.getLogs({
      address: deployment.address,
      fromBlock: BigInt(value.cursor),
      toBlock: BigInt(end),
    });
    for (const log of logs) {
      try {
        const decoded = decodeEventLog({ abi: deployment.abi, data: log.data, topics: log.topics });
        if (decoded.eventName !== "Paid" && decoded.eventName !== "RunFinished") continue;
        const id = `${log.transactionHash}:${log.logIndex}`;
        if (value.events.some(event => event.id === id)) continue;
        value.events.push({
          id,
          hash: log.transactionHash,
          blockNumber: Number(log.blockNumber),
          logIndex: log.logIndex,
          event: decoded.eventName,
          args: JSON.parse(JSON.stringify(decoded.args, (_, v) => (typeof v === "bigint" ? v.toString() : v))),
        });
      } catch {
        /* Other contract events are outside this feed. */
      }
    }
    value.cursor = end + 1;
  }
  try {
    await putState(PATH, JSON.stringify(value), etag);
  } catch (error) {
    if (error instanceof BlobPreconditionFailedError) return { ...(await cache()).value, latestBlock };
    throw error;
  }
  return { ...value, latestBlock };
}
export async function liveData() {
  if (!pending)
    pending = refresh().finally(() => {
      pending = undefined;
    });
  const data = await pending;
  const demoEvents = data.events.filter(event =>
    event.event === "RunFinished"
      ? DEMO_CHARACTERS.includes(Number(event.args.characterId))
      : DEMO_EMPLOYEES.some(employee => employee.orderId === Number(event.args.orderId)),
  );
  const recent = await Promise.all(
    demoEvents
      .slice(-60)
      .reverse()
      .map(async event => ({
        ...event,
        robotEmployer:
          event.event === "RunFinished" &&
          !!(await readRecord(`niuma/${deployment.address.toLowerCase()}/bots/runs/${event.hash}.json`)),
      })),
  );
  const timings = await Promise.all(
    recent.map(async event => ({ hash: event.hash, value: await readRecord(`${ROOT}/latency/${event.hash}.json`) })),
  );
  const latency: Record<string, number> = {};
  timings.forEach(item => {
    if (typeof item.value?.elapsedMs === "number") latency[item.hash] = item.value.elapsedMs;
  });
  const runs = demoEvents.filter(event => event.event === "RunFinished");
  const labor = new Map<
    string,
    { characterId: number; shifts: number; fullAttendance: number; ownerWagesWei: string }
  >();
  for (const event of runs) {
    const id = String(event.args.characterId);
    const value = labor.get(id) || { characterId: Number(id), shifts: 0, fullAttendance: 0, ownerWagesWei: "0" };
    value.shifts++;
    if (Number(event.args.stars) === 6) value.fullAttendance++;
    value.ownerWagesWei = (BigInt(value.ownerWagesWei) + BigInt(String(event.args.ownerShare))).toString();
    labor.set(id, value);
  }
  const best = new Map<string, LiveEvent>();
  for (const event of runs) {
    const key = `${event.args.characterId}:${event.args.player}`;
    const previous = best.get(key);
    if (
      !previous ||
      Number(event.args.stars) > Number(previous.args.stars) ||
      (event.args.stars === previous.args.stars && Number(event.args.timeMs) < Number(previous.args.timeMs))
    )
      best.set(key, event);
  }
  const samples = Object.values(latency);
  return {
    events: recent,
    rankings: [...best.values()].sort(
      (a, b) => Number(b.args.stars) - Number(a.args.stars) || Number(a.args.timeMs) - Number(b.args.timeMs),
    ),
    runCount: runs.length,
    laborLeaders: [...labor.values()].sort((a, b) => b.fullAttendance - a.fullAttendance || b.shifts - a.shifts),
    settlementCount: demoEvents.length,
    latency,
    latencySamples: samples.length,
    averageMs: samples.length ? Math.round(samples.reduce((a, b) => a + b, 0) / samples.length) : null,
    indexedThrough: data.cursor - 1,
    latestBlock: data.latestBlock,
    catchingUp: data.cursor <= data.latestBlock,
    updatedAt: new Date().toISOString(),
  };
}
export async function recordLatency(hash: unknown, elapsedMs: unknown) {
  if (
    typeof hash !== "string" ||
    !/^0x[0-9a-fA-F]{64}$/.test(hash) ||
    typeof elapsedMs !== "number" ||
    !Number.isInteger(elapsedMs) ||
    elapsedMs < 1 ||
    elapsedMs > 120000
  )
    throw new Error("Invalid timing sample");
  const receipt = await client.getTransactionReceipt({ hash: hash as Hash });
  if (receipt.status !== "success" || receipt.to?.toLowerCase() !== deployment.address.toLowerCase())
    throw new Error("Successful game receipt required");
  const game = receipt.logs.some(log => {
    if (log.address.toLowerCase() !== deployment.address.toLowerCase()) return false;
    try {
      return decodeEventLog({ abi: deployment.abi, topics: log.topics, data: log.data }).eventName === "RunFinished";
    } catch {
      return false;
    }
  });
  if (!game) throw new Error("Game receipt required");
  const path = `${ROOT}/latency/${hash.toLowerCase()}.json`;
  if (await readRecord(path)) return { existing: true };
  try {
    await put(
      path,
      JSON.stringify({ hash, elapsedMs, source: "browser-reported", recordedAt: new Date().toISOString() }),
      { access, contentType: "application/json", allowOverwrite: false, cacheControlMaxAge: 60 },
    );
  } catch (error) {
    if (!(await readRecord(path))) throw error;
  }
  return { recorded: true };
}
