import "server-only";
import { type Hash, decodeEventLog } from "viem";
import batches from "~~/contracts/botResults.json";
import seed from "~~/contracts/liveSeed.json";
import { DEMO_CHARACTERS, DEMO_EMPLOYEES } from "~~/utils/niuma";
import { client, deployment } from "~~/utils/niuma-server";

export type LiveEvent = {
  robotEmployer?: boolean;
  id: string;
  hash: Hash;
  blockNumber: number;
  logIndex: number;
  event: "Paid" | "RunFinished";
  args: Record<string, string | string[]>;
};
type Batch = { contract: string; rows: { hash?: string; elapsedMs?: number; state: string }[] };
const currentBatches = batches as Batch[];
const events = new Map<string, LiveEvent>();
// The read-only publisher validates decoded event schemas; JSON imports widen the event discriminant.
for (const event of seed.events as unknown as LiveEvent[])
  if (seed.contract.toLowerCase() === deployment.address.toLowerCase()) events.set(event.id, event);
let cursor =
  seed.contract.toLowerCase() === deployment.address.toLowerCase() ? seed.cursor : deployment.deployedOnBlock;
let cached: Awaited<ReturnType<typeof refresh>> | undefined,
  expires = 0,
  pending: Promise<Awaited<ReturnType<typeof refresh>>> | undefined;
const latency = new Map<string, number>();
for (const batch of currentBatches.filter(b => b.contract.toLowerCase() === deployment.address.toLowerCase()))
  for (const row of batch.rows)
    if (row.hash && row.state === "CONFIRMED" && row.elapsedMs) latency.set(row.hash.toLowerCase(), row.elapsedMs);
async function refresh() {
  const latestBlock = Number(await client.getBlockNumber({ cacheTime: 10000 }));
  const ranges = Array.from(
    { length: Math.min(16, Math.max(0, Math.ceil((latestBlock - cursor + 1) / 100))) },
    (_, i) => ({ start: cursor + i * 100, end: Math.min(cursor + i * 100 + 99, latestBlock) }),
  );
  const recent = { start: Math.max(deployment.deployedOnBlock, latestBlock - 99), end: latestBlock };
  const chunks = await Promise.all(
    [...ranges, recent].map(r =>
      client.getLogs({ address: deployment.address, fromBlock: BigInt(r.start), toBlock: BigInt(r.end) }),
    ),
  );
  for (const logs of chunks)
    for (const log of logs) {
      try {
        const d = decodeEventLog({ abi: deployment.abi, data: log.data, topics: log.topics });
        if (d.eventName !== "Paid" && d.eventName !== "RunFinished") continue;
        const id = `${log.transactionHash}:${log.logIndex}`;
        events.set(id, {
          id,
          hash: log.transactionHash,
          blockNumber: Number(log.blockNumber),
          logIndex: log.logIndex,
          event: d.eventName,
          args: JSON.parse(JSON.stringify(d.args, (_, v) => (typeof v === "bigint" ? v.toString() : v))),
        });
      } catch {
        /* Ignore unrelated contract events. */
      }
    }
  if (ranges.length) cursor = ranges.at(-1)!.end + 1;
  const all = [...events.values()]
    .filter(e =>
      e.event === "RunFinished"
        ? DEMO_CHARACTERS.includes(Number(e.args.characterId))
        : DEMO_EMPLOYEES.some(d => d.orderId === Number(e.args.orderId)),
    )
    .sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex);
  const robots = new Set(
    currentBatches
      .filter(b => b.contract.toLowerCase() === deployment.address.toLowerCase())
      .flatMap(b => b.rows.map(r => r.hash?.toLowerCase()).filter(Boolean)),
  );
  const runs = all.filter(e => e.event === "RunFinished");
  const recentEvents = all
    .slice(-100)
    .reverse()
    .map(e => ({ ...e, robotEmployer: robots.has(e.hash.toLowerCase()) }));
  const timings: Record<string, number> = {};
  for (const e of recentEvents) {
    const ms = latency.get(e.hash.toLowerCase());
    if (ms) timings[e.hash] = ms;
  }
  const samples = Object.values(timings);
  const laborLeaders = DEMO_CHARACTERS.map(id => {
    const own = runs.filter(e => Number(e.args.characterId) === id);
    return {
      characterId: id,
      shifts: own.length,
      fullAttendance: own.filter(e => Number(e.args.stars) === 6).length,
      ownerWagesWei: own.reduce((sum, e) => sum + BigInt(String(e.args.ownerShare)), 0n).toString(),
    };
  });
  return {
    events: recentEvents,
    rankings: [],
    runCount: runs.length,
    settlementCount: all.length,
    latency: timings,
    latencySamples: samples.length,
    averageMs: samples.length ? Math.round(samples.reduce((a, b) => a + b, 0) / samples.length) : null,
    laborLeaders,
    indexedThrough: cursor - 1,
    latestBlock,
    catchingUp: cursor <= latestBlock,
    updatedAt: new Date().toISOString(),
    source: "on-chain events; immutable receipt seed plus 15-second process cache",
    timingPersistence: "Browser samples are process-local; robot samples are published evidence",
  };
}
export async function liveData() {
  if (cached && Date.now() < expires) return cached;
  if (!pending)
    pending = refresh()
      .then(value => {
        cached = value;
        expires = Date.now() + 15000;
        return value;
      })
      .finally(() => {
        pending = undefined;
      });
  return pending;
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
    try {
      return (
        log.address.toLowerCase() === deployment.address.toLowerCase() &&
        decodeEventLog({ abi: deployment.abi, topics: log.topics, data: log.data }).eventName === "RunFinished"
      );
    } catch {
      return false;
    }
  });
  if (!game) throw new Error("RunFinished required");
  if (latency.size > 1000) latency.delete(latency.keys().next().value!);
  if (!latency.has(hash.toLowerCase())) latency.set(hash.toLowerCase(), elapsedMs);
  return { recorded: true, durable: false, source: "browser-reported, process cache" };
}
