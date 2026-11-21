import { unstable_cache } from "next/cache";
import { inflateSync } from "node:zlib";
import "server-only";
import { type Hash, type Hex, decodeEventLog, decodeFunctionData, hexToBytes, parseAbiItem } from "viem";
import bankConfig from "~~/contracts/demoBank.json";
import type { BatchProgress, PreparedBatch } from "~~/utils/niuma-bots";
import { client, deployment } from "~~/utils/niuma-server";

async function readFunding(hash: Hash) {
  const [receipt, transaction] = await Promise.all([
    client.getTransactionReceipt({ hash }),
    client.getTransaction({ hash }),
  ]);
  if (
    receipt.status !== "success" ||
    receipt.to?.toLowerCase() !== bankConfig.address.toLowerCase() ||
    receipt.from.toLowerCase() !== bankConfig.owner.toLowerCase()
  )
    throw new Error("Invalid funding receipt");
  const decoded = decodeFunctionData({ abi: bankConfig.abi, data: transaction.input });
  if (decoded.functionName !== "startBatch") throw new Error("Not a batch funding transaction");
  const args = decoded.args as readonly unknown[];
  const batchId = args[0] as Hash,
    wallets = args[1] as string[],
    plan = JSON.parse(inflateSync(hexToBytes(args[2] as Hex)).toString()) as { count: number };
  if (
    plan.count !== wallets.length ||
    !receipt.logs.some(log => {
      try {
        const event = decodeEventLog({ abi: bankConfig.abi, topics: log.topics, data: log.data });
        return event.eventName === "BatchStarted" && (event.args as { id?: string }).id === batchId;
      } catch {
        return false;
      }
    })
  )
    throw new Error("Funding event mismatch");
  return {
    batchId,
    count: plan.count,
    fundingHash: hash,
    fundingBlock: Number(receipt.blockNumber),
    wallets: wallets.map(a => a.toLowerCase()),
  };
}
export const fundingData = unstable_cache(readFunding, ["bot-funding-receipt", bankConfig.address], {
  revalidate: 86400,
});

export async function findFunding(batchId: Hash): Promise<PreparedBatch> {
  const latest = Number(await client.getBlockNumber({ cacheTime: 250 }));
  const event = parseAbiItem("event BatchStarted(bytes32 indexed id, address[] wallets)");
  for (let end = latest; end >= bankConfig.deployedOnBlock; end -= 100) {
    const logs = await client.getLogs({
      address: bankConfig.address as Hex,
      event,
      args: { id: batchId },
      fromBlock: BigInt(Math.max(bankConfig.deployedOnBlock, end - 99)),
      toBlock: BigInt(end),
    });
    if (logs[0]) return fundingData(logs[0].transactionHash);
  }
  throw new Error("Funding receipt not found");
}
async function readBatchBlock(fundingHash: Hash, number: number) {
  const funding = await fundingData(fundingHash);
  const [header, receipts] = await Promise.all([
    client.getBlock({ blockNumber: BigInt(number) }),
    client.getBlockReceipts({ blockNumber: BigInt(number) }),
  ]);
  // Monad consensus can run ahead of execution. Do not advance past a block
  // until ALL its receipts exist, even when none belongs to this batch.
  if (receipts.length !== header.transactions.length || receipts.some(r => r.blockHash !== header.hash))
    throw new Error("BLOCK_EXECUTION_PENDING");
  const wallets = new Set(funding.wallets),
    observedAt = Date.now();
  const matches: BatchProgress["receipts"] = [];
  for (const receipt of receipts) {
    if (!wallets.has(receipt.from.toLowerCase()) || receipt.to?.toLowerCase() !== deployment.address.toLowerCase())
      continue;
    let event: BatchProgress["receipts"][number]["event"];
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== deployment.address.toLowerCase()) continue;
      try {
        const decoded = decodeEventLog({ abi: deployment.abi, topics: log.topics, data: log.data });
        if (decoded.eventName === "RunFinished")
          event = {
            characterId: String(decoded.args.characterId),
            player: decoded.args.player,
            stars: String(decoded.args.stars),
            timeMs: String(decoded.args.timeMs),
            ownerShare: String(decoded.args.ownerShare),
            logIndex: log.logIndex,
          };
      } catch {
        /* Other contract events are not game receipts. */
      }
    }
    matches.push({
      hash: receipt.transactionHash,
      blockNumber: number,
      status: receipt.status,
      observedAt,
      effectiveGasPrice: receipt.effectiveGasPrice.toString(),
      ...(event ? { event } : {}),
    });
  }
  return { number, timestamp: Number(header.timestamp), receipts: matches };
}
const batchBlock = unstable_cache(readBatchBlock, ["executed-bot-blocks", deployment.address], { revalidate: 3600 });
type Observation = {
  cursor: number;
  receipts: Map<string, BatchProgress["receipts"][number]>;
  blocks: Map<number, NonNullable<BatchProgress["blocks"]>[number]>;
  checkedAt: number;
  pending?: Promise<BatchProgress>;
  value?: BatchProgress;
};
const observations = new Map<string, Observation>();
export async function observeBatch(fundingHash: Hash): Promise<BatchProgress> {
  const funding = await fundingData(fundingHash);
  let state = observations.get(fundingHash);
  if (!state) {
    state = { cursor: funding.fundingBlock + 1, receipts: new Map(), blocks: new Map(), checkedAt: 0 };
    observations.set(fundingHash, state);
  }
  if (state.value && (state.value.confirmed >= funding.count || Date.now() - state.checkedAt < 300)) return state.value;
  if (state.pending) return state.pending;
  const current = state;
  current.pending = (async () => {
    const latest = Number(await client.getBlockNumber({ cacheTime: 250 }));
    const numbers = Array.from(
      { length: Math.max(0, Math.min(12, latest - current.cursor + 1)) },
      (_, i) => current.cursor + i,
    );
    const values = await Promise.allSettled(numbers.map(n => batchBlock(fundingHash, n)));
    for (const result of values) {
      if (result.status === "rejected") {
        if (String(result.reason).includes("BLOCK_EXECUTION_PENDING")) break;
        throw result.reason;
      }
      const block = result.value;
      for (const receipt of block.receipts) current.receipts.set(receipt.hash, receipt);
      if (block.receipts.length)
        current.blocks.set(block.number, {
          number: block.number,
          timestamp: block.timestamp,
          count: block.receipts.length,
          hashes: block.receipts.map(r => r.hash),
        });
      current.cursor = block.number + 1;
      if (current.receipts.size >= funding.count) break;
    }
    const receipts = [...current.receipts.values()],
      blocks = [...current.blocks.values()].sort((a, b) => a.number - b.number);
    const value: BatchProgress = {
      batchId: funding.batchId,
      count: funding.count,
      confirmed: receipts.length,
      successful: receipts.filter(r => r.status === "success").length,
      failed: receipts.filter(r => r.status === "reverted").length,
      blockCount: blocks.length,
      chainSpanSeconds: blocks.length ? blocks.at(-1)!.timestamp - blocks[0].timestamp : 0,
      blocks,
      receipts,
    };
    current.checkedAt = Date.now();
    current.value = value;
    return value;
  })().finally(() => {
    current.pending = undefined;
  });
  return current.pending;
}
