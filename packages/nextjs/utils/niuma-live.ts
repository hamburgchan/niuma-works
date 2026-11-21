import { unstable_cache } from "next/cache";
import "server-only";
import { type Hash, decodeEventLog } from "viem";
import batches from "~~/contracts/botResults.json";
import humanTimings from "~~/contracts/humanTimings.json";
import seed from "~~/contracts/liveSeed.json";
import { cachedServerBatch, serverRobotAddresses } from "~~/utils/demo-bank-server";
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
for (const [hash, elapsedMs] of Object.entries(humanTimings))
  if ([...events.values()].some(event => event.hash.toLowerCase() === hash.toLowerCase()))
    latency.set(hash.toLowerCase(), elapsedMs);
for (const batch of currentBatches.filter(b => b.contract.toLowerCase() === deployment.address.toLowerCase()))
  for (const row of batch.rows)
    if (row.hash && row.state === "CONFIRMED" && row.elapsedMs) latency.set(row.hash.toLowerCase(), row.elapsedMs);
async function readRange(start: number, end: number): Promise<LiveEvent[]> {
  const logs = await client.getLogs({ address: deployment.address, fromBlock: BigInt(start), toBlock: BigInt(end) });
  const decoded: LiveEvent[] = [];
  for (const log of logs) {
    try {
      const d = decodeEventLog({ abi: deployment.abi, data: log.data, topics: log.topics });
      if (d.eventName !== "Paid" && d.eventName !== "RunFinished") continue;
      const id = `${log.transactionHash}:${log.logIndex}`;
      decoded.push({
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
  return decoded;
}
// Next Data Cache persists closed block ranges across serverless instances; no Blob SDK/store.
const closedRange = unstable_cache(readRange, ["niuma-v2-event-ranges", deployment.address], { revalidate: 3600 });
async function refresh() {
  const latestBlock = Number(await client.getBlockNumber({ cacheTime: 2000 }));
  const first =
    seed.contract.toLowerCase() === deployment.address.toLowerCase()
      ? Math.max(seed.cursor, deployment.deployedOnBlock)
      : deployment.deployedOnBlock;
  const ranges = Array.from({ length: Math.max(0, Math.ceil((latestBlock - first + 1) / 100)) }, (_, i) => ({
    start: first + i * 100,
    end: Math.min(first + i * 100 + 99, latestBlock),
  }));
  const chunks = await Promise.all(
    ranges.map(r => (r.end < latestBlock - 100 ? closedRange(r.start, r.end) : readRange(r.start, r.end))),
  );
  for (const chunk of chunks) for (const event of chunk) events.set(event.id, event);
  cursor = latestBlock + 1;
  const characters = await Promise.all(
    DEMO_CHARACTERS.map(id =>
      client.readContract({
        ...deployment,
        functionName: "characters",
        args: [BigInt(id)],
        blockNumber: BigInt(latestBlock),
      }),
    ),
  );
  const onChainRuns = characters.reduce((sum, c) => sum + Number(c[6]), 0);
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
  const [serverRobots, serverBatch] = await Promise.all([serverRobotAddresses(latestBlock), cachedServerBatch()]);
  for (const row of serverBatch?.rows || [])
    if (row.hash && row.elapsedMs && row.state === "CONFIRMED") latency.set(row.hash.toLowerCase(), row.elapsedMs);
  const recentEvents = all
    .slice(-100)
    .reverse()
    .map(e => ({
      ...e,
      robotEmployer: robots.has(e.hash.toLowerCase()) || serverRobots.has(String(e.args.player).toLowerCase()),
    }));
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
      shifts: Number(characters[DEMO_CHARACTERS.indexOf(id)][6]),
      fullAttendance: own.filter(e => Number(e.args.stars) === 6).length,
      ownerWagesWei: own.reduce((sum, e) => sum + BigInt(String(e.args.ownerShare)), 0n).toString(),
    };
  });
  return {
    events: recentEvents,
    rankings: [],
    runCount: onChainRuns,
    settlementCount: onChainRuns + all.filter(event => event.event === "Paid").length,
    latency: timings,
    latencySamples: samples.length,
    averageMs: samples.length ? Math.round(samples.reduce((a, b) => a + b, 0) / samples.length) : null,
    laborLeaders,
    indexedThrough: cursor - 1,
    latestBlock,
    catchingUp: runs.length !== onChainRuns,
    updatedAt: new Date().toISOString(),
    source: "on-chain events; immutable receipt seed, persistent closed block ranges, 3/15-second refresh",
    timingPersistence: "Browser samples are process-local; robot samples are published evidence",
  };
}
export async function liveData(fast = false) {
  if (cached && Date.now() < expires && (!fast || expires - Date.now() > 12000)) return cached;
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
