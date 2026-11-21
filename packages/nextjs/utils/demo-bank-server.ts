import { unstable_cache } from "next/cache";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { deflateSync, inflateSync } from "node:zlib";
import "server-only";
import {
  type Address,
  type Hash,
  type Hex,
  createWalletClient,
  encodeFunctionData,
  getAddress,
  hexToBytes,
  http,
  keccak256,
  parseAbiItem,
  parseEther,
  toHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";
import bankConfig from "~~/contracts/demoBank.json";
import robotSeed from "~~/contracts/serverRobotSeed.json";
import type { BotBatch, BotRow } from "~~/utils/niuma-bots";
import { client, deployment } from "~~/utils/niuma-server";

export const bank = { address: bankConfig.address as Address, abi: bankConfig.abi };
const zero = `0x${"0".repeat(64)}` as Hash;
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
type RpcMetrics = { rpc: number; retries: number; readRetries: number };
async function readWithBackoff<T>(read: () => Promise<T>, metrics?: RpcMetrics): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await read();
    } catch (error) {
      const retryable = ["RPC_HTTP_429", "RPC_TIMEOUT", "RPC_CONNECTION"].includes(safeReason(error));
      if (metrics && retryable) metrics.rpc++;
      if (attempt >= 3 || !retryable) throw error;
      if (metrics) metrics.readRetries++;
      await delay(750 * 2 ** attempt);
    }
  }
}
type Plan = { count: number; gasPrice: string; gasLimits: string[]; createdAt: number; mode: "spread" };
type ChainBatch = { startedAt: bigint; count: number; plan: Hex; result: Hex };
const pack = (value: unknown) => toHex(deflateSync(Buffer.from(JSON.stringify(value))));
const unpack = <T>(value: Hex): T => JSON.parse(inflateSync(hexToBytes(value)).toString());
function signer() {
  const key = process.env.DEPLOYER_PRIVATE_KEY;
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error("DEPLOYER_PRIVATE_KEY 未配置");
  const account = privateKeyToAccount(key as Hex);
  if (account.address.toLowerCase() !== bankConfig.owner.toLowerCase()) throw new Error("部署钱包与演示账本不一致");
  return {
    account,
    wallet: createWalletClient({
      account,
      chain: monadTestnet,
      transport: http(process.env.MONAD_RPC_URL || "https://testnet-rpc.monad.xyz"),
    }),
  };
}
export function authorize(code: unknown) {
  const expected = process.env.DEMO_CODE;
  if (!expected) throw new Error("DEMO_CODE 未配置");
  const left = Buffer.from(typeof code === "string" ? code : ""),
    right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}
export function safeReason(error: unknown) {
  const e = error as { status?: number; message?: string; shortMessage?: string };
  const message = `${e?.shortMessage || ""} ${e?.message || ""}`;
  if (e?.status === 429 || /429|rate.limit|too many requests/i.test(message)) return "RPC_HTTP_429";
  if (/timeout|timed out/i.test(message)) return "RPC_TIMEOUT";
  if (/fetch failed|connect|socket|network|http request failed/i.test(message)) return "RPC_CONNECTION";
  if (/already known|known transaction|nonce too low/i.test(message)) return "RPC_ALREADY_KNOWN_OR_NONCE";
  if (/revert|cooldown|already claimed|total cap|hour cap|unresolved batch/i.test(message)) return "CONTRACT_REJECTED";
  return "RPC_OR_VALIDATION_ERROR";
}
export async function broadcast(raw: Hex, metrics?: { rpc: number; retries: number }) {
  const hash = keccak256(raw);
  for (let attempt = 0; attempt < 4; ++attempt) {
    try {
      await client.sendRawTransaction({ serializedTransaction: raw });
      return hash;
    } catch (error) {
      const reason = safeReason(error);
      if (reason === "RPC_ALREADY_KNOWN_OR_NONCE") return hash;
      if (metrics) metrics.rpc++;
      if (!["RPC_HTTP_429", "RPC_TIMEOUT", "RPC_CONNECTION"].includes(reason) || attempt === 3) throw new Error(reason);
      if (metrics) metrics.retries++;
      await delay(1000 * 2 ** attempt);
    }
  }
  return hash;
}
async function ownerTransaction(functionName: string, args: readonly unknown[], value = 0n, metrics?: RpcMetrics) {
  const { account, wallet } = signer();
  const data = encodeFunctionData({ abi: bank.abi, functionName, args });
  const estimate = await readWithBackoff(() => client.estimateGas({ account, to: bank.address, data, value }), metrics);
  const gas = (estimate * 110n + 99n) / 100n;
  const request = await readWithBackoff(
    () => wallet.prepareTransactionRequest({ account, to: bank.address, data, value, gas }),
    metrics,
  );
  const raw = await wallet.signTransaction(request);
  const hash = keccak256(raw);
  let receipt: Awaited<ReturnType<typeof client.getTransactionReceipt>>;
  try {
    await broadcast(raw, metrics);
    receipt = await readWithBackoff(
      () => client.waitForTransactionReceipt({ hash, timeout: 12000, pollingInterval: 1200 }),
      metrics,
    );
  } catch (error) {
    throw Object.assign(new Error(safeReason(error)), { hash });
  }
  if (receipt.status !== "success") throw new Error("CHAIN_REVERT");
  return { hash, receipt };
}
export async function faucetStatus(address?: Address) {
  const [distributed, hourRemaining, claimed] = await readWithBackoff(() =>
    Promise.all([
      client.readContract({ ...bank, functionName: "distributed" }),
      client.readContract({ ...bank, functionName: "remainingThisHour" }),
      address ? client.readContract({ ...bank, functionName: "claimed", args: [address] }) : false,
    ]),
  );
  return {
    enabled: true,
    amountWei: parseEther("0.02").toString(),
    capWei: parseEther("1.5").toString(),
    distributedWei: String(distributed),
    hourRemaining: Number(hourRemaining),
    claimed: Boolean(claimed),
    remainingWei: (parseEther("1.5") - BigInt(String(distributed))).toString(),
  };
}
export async function grant(address: Address) {
  const status = await faucetStatus(address);
  if (status.claimed) return { ...status, state: "ALREADY_CLAIMED" };
  if (BigInt(status.remainingWei) < parseEther("0.02") || status.hourRemaining === 0)
    return { ...status, state: "EXHAUSTED" };
  const tx = await ownerTransaction("grant", [address], parseEther("0.02"));
  return {
    enabled: true,
    amountWei: parseEther("0.02").toString(),
    claimed: true,
    state: "CONFIRMED",
    hash: tx.hash,
    blockNumber: Number(tx.receipt.blockNumber),
  };
}

function robot(id: Hash, index: number) {
  // Stable domain-separated derivation permits recovery after a function restart.
  // This key exists only in server memory; no wallet key is stored or returned.
  const key = process.env.DEPLOYER_PRIVATE_KEY;
  if (!key) throw new Error("DEPLOYER_PRIVATE_KEY 未配置");
  const digest = createHmac("sha256", Buffer.from(key.replace(/^0x/, ""), "hex"))
    .update(`NIUMA-DEMO-BOT-V1|10143|${bank.address.toLowerCase()}|${id}|${index}`)
    .digest("hex");
  return privateKeyToAccount(`0x${digest}`);
}
function rowFor(id: Hash, index: number): BotRow {
  const bytes = hexToBytes(keccak256(toHex(`${id}:${index}`)));
  return {
    index,
    address: robot(id, index).address,
    characterId: (index % 3) + 1,
    stars: 3 + (bytes[0] % 4),
    timeMs: 15000 + (((bytes[1] << 8) + bytes[2]) % 45001),
    state: "PREPARED",
  };
}
async function signedRun(id: Hash, row: BotRow, plan: Plan) {
  return robot(id, row.index).signTransaction({
    chainId: 10143,
    nonce: 0,
    to: deployment.address,
    value: parseEther("0.001"),
    gas: BigInt(plan.gasLimits[row.index]),
    gasPrice: BigInt(plan.gasPrice),
    type: "legacy",
    data: encodeFunctionData({
      abi: deployment.abi,
      functionName: "finishRun",
      args: [BigInt(row.characterId), row.stars, BigInt(row.timeMs)],
    }),
  });
}
export async function latestServerBatch() {
  const id = (await readWithBackoff(() => client.readContract({ ...bank, functionName: "latestBatch" }))) as Hash;
  if (id === zero) return null;
  const record = (await readWithBackoff(() =>
    client.readContract({ ...bank, functionName: "batch", args: [id] }),
  )) as ChainBatch;
  if (record.result !== "0x") return unpack<BotBatch>(record.result);
  return {
    batchId: id,
    count: Number(record.count),
    phase: "UNRESOLVED",
    startedAt: Number(record.startedAt),
    rows: [],
    sent: 0,
    successful: 0,
    failed: 0,
    unknown: Number(record.count),
    averageMs: null,
    totalMs: 0,
  } as BotBatch;
}
export const cachedServerBatch = unstable_cache(latestServerBatch, ["latest-demo-batch", bank.address], {
  revalidate: 15,
});
export async function serverRush(count: number) {
  const invocationStart = Date.now();
  if (!Number.isInteger(count) || count < 1 || count > 100) throw new Error("单批只能为 1–100 个");
  const { account } = signer();
  const metrics: RpcMetrics = { rpc: 0, retries: 0, readRetries: 0 };
  let id = (await readWithBackoff(
    () => client.readContract({ ...bank, functionName: "latestBatch" }),
    metrics,
  )) as Hash;
  const record =
    id === zero
      ? null
      : ((await readWithBackoff(
          () => client.readContract({ ...bank, functionName: "batch", args: [id] }),
          metrics,
        )) as ChainBatch);
  const resumed = !!record && record.result === "0x";
  let plan: Plan;
  let fundingHash: Hash | undefined;
  if (resumed) {
    plan = unpack<Plan>(record!.plan);
    count = plan.count;
  } else {
    const last = await readWithBackoff(() => client.readContract({ ...bank, functionName: "lastBatchAt" }), metrics);
    if (Date.now() / 1000 < Number(last) + 600) throw new Error("每 10 分钟最多一批，请稍后再试");
    const balance = await readWithBackoff(() => client.getBalance({ address: account.address }), metrics);
    if (balance < parseEther((count * 0.013 + 2).toFixed(3))) throw new Error("部署钱包余额不足，未充值");
    id = toHex(randomBytes(32));
    const gasPrice = await readWithBackoff(() => client.getGasPrice(), metrics);
    const rows = Array.from({ length: count }, (_, i) => rowFor(id, i));
    // One worst-branch estimate per character avoids a burst of 100 identical
    // RPC simulations. V2 has no player storage; 6 stars / 1 ms takes the most
    // expensive possible best-score branch. Each limit still adds only 10%.
    const estimates = await readWithBackoff(
      () =>
        Promise.all(
          [1, 2, 3].map(characterId =>
            client.estimateContractGas({
              ...deployment,
              account,
              functionName: "finishRun",
              args: [BigInt(characterId), 6, 1n],
              value: parseEther("0.001"),
            }),
          ),
        ),
      metrics,
    );
    const gasLimits = rows.map(row => ((estimates[row.characterId - 1] * 110n + 99n) / 100n).toString());
    if (gasLimits.some(gas => BigInt(gas) * gasPrice + parseEther("0.001") > parseEther("0.013")))
      throw new Error("0.013 MON 不足以覆盖本批 gas，未充值");
    plan = { count, mode: "spread", gasPrice: gasPrice.toString(), gasLimits, createdAt: Date.now() };
    // Validate all signatures before atomic funding; the on-chain plan preserves
    // everything needed to reproduce exactly the same raw transactions.
    await Promise.all(rows.map(row => signedRun(id, row, plan)));
    const funding = await ownerTransaction(
      "startBatch",
      [id, rows.map(row => getAddress(row.address)), pack(plan)],
      parseEther((count * 0.013).toFixed(3)),
      metrics,
    );
    fundingHash = funding.hash;
  }
  const rows = Array.from({ length: count }, (_, i) => rowFor(id, i));
  const raw = await Promise.all(rows.map(row => signedRun(id, row, plan)));
  rows.forEach((row, i) => {
    row.hash = keccak256(raw[i]);
    row.fundingHash = fundingHash;
  });
  const started = Date.now();
  const receiptMap = new Map<string, Awaited<ReturnType<typeof client.getTransactionReceipt>>>();
  const attempted = new Set<number>();
  // Limit admission concurrency; all retries send the original signed bytes.
  for (let start = 0; start < rows.length; start += 2) {
    if (Date.now() - invocationStart > 230000) break;
    await Promise.all(
      rows.slice(start, start + 2).map(async row => {
        try {
          if (resumed) {
            const previous = await client.getTransactionReceipt({ hash: row.hash as Hash }).catch(() => null);
            if (previous) {
              attempted.add(row.index);
              receiptMap.set(row.hash!, previous);
              row.state = previous.status === "success" ? "CONFIRMED" : "FAILED";
              row.reason = previous.status === "success" ? undefined : "CHAIN_REVERT";
              row.blockNumber = Number(previous.blockNumber);
              return;
            }
          }
          attempted.add(row.index);
          await broadcast(raw[row.index], metrics);
          row.state = "BROADCAST";
        } catch (error) {
          row.state = "UNKNOWN";
          row.reason = safeReason(error);
        }
      }),
    );
  }
  for (let poll = 0; poll < 35; ++poll) {
    if (Date.now() - invocationStart > 260000) break;
    const unresolved = rows.filter(row => row.state !== "CONFIRMED" && row.state !== "FAILED");
    if (!unresolved.length) break;
    const beforeRpcErrors = metrics.rpc;
    for (let offset = 0; offset < unresolved.length; offset += 10) {
      await Promise.all(
        unresolved.slice(offset, offset + 10).map(async row => {
          try {
            const receipt = await client.getTransactionReceipt({ hash: row.hash as Hash });
            receiptMap.set(row.hash!, receipt);
            row.blockNumber = Number(receipt.blockNumber);
            row.state = receipt.status === "success" ? "CONFIRMED" : "FAILED";
            row.elapsedMs = resumed ? undefined : Date.now() - started;
            row.reason = receipt.status === "success" ? undefined : "CHAIN_REVERT";
          } catch (error) {
            const reason = safeReason(error);
            if (["RPC_HTTP_429", "RPC_TIMEOUT", "RPC_CONNECTION"].includes(reason)) metrics.rpc++;
          }
        }),
      );
      if (offset + 10 < unresolved.length) await delay(150);
    }
    if (rows.some(row => row.state !== "CONFIRMED" && row.state !== "FAILED"))
      await delay(metrics.rpc > beforeRpcErrors ? Math.min(8000, 1000 * 2 ** Math.min(poll, 3)) : 1000);
  }
  for (const row of rows)
    if (!["CONFIRMED", "FAILED"].includes(row.state)) {
      row.state = "UNKNOWN";
      row.reason ||= "原交易回执未找到；保留批次，仅可恢复原签名交易";
    }
  const samples = rows
    .filter(row => row.elapsedMs !== undefined && row.state === "CONFIRMED")
    .map(row => row.elapsedMs!)
    .sort((a, b) => a - b);
  const blocks = new Map<number, number>();
  rows
    .filter(row => row.state === "CONFIRMED")
    .forEach(row => blocks.set(row.blockNumber!, (blocks.get(row.blockNumber!) || 0) + 1));
  const result: BotBatch & {
    contract: string;
    resumed: boolean;
    deployerBalanceBefore?: string;
    fundingHash?: string;
    timingNote: string;
  } = {
    batchId: id,
    contract: deployment.address,
    count,
    mode: "server-spread",
    version: "v2",
    phase: rows.some(row => row.state === "UNKNOWN") ? "UNRESOLVED" : "COMPLETE",
    rows,
    sent: attempted.size,
    successful: rows.filter(row => row.state === "CONFIRMED").length,
    failed: rows.filter(row => row.state === "FAILED").length,
    unknown: rows.filter(row => row.state === "UNKNOWN").length,
    averageMs: samples.length ? Math.round(samples.reduce((a, b) => a + b, 0) / samples.length) : null,
    p95Ms: samples.length ? samples[Math.ceil(samples.length * 0.95) - 1] : null,
    totalMs: Date.now() - plan.createdAt,
    settlementSpanMs: Date.now() - started,
    maxSameBlock: Math.max(0, ...blocks.values()),
    rpcFailureCount: metrics.rpc,
    chainFailureCount: rows.filter(row => row.state === "FAILED").length,
    transactionResubmissions: metrics.retries,
    rpcReadRetries: metrics.readRetries,
    totalGasWei: rows
      .reduce(
        (sum, row) =>
          sum +
          (receiptMap.has(row.hash!)
            ? BigInt(plan.gasLimits[row.index]) * receiptMap.get(row.hash!)!.effectiveGasPrice
            : 0n),
        0n,
      )
      .toString(),
    resumed,
    fundingHash,
    timingNote: "服务端广播屏障至回执观察，含公共 RPC 与轮询延迟；恢复批次不补造历史计时",
  };
  // Unresolved batches remain locked and recoverable. Never label them failed
  // merely because an RPC request or the serverless invocation timed out.
  if (!result.unknown) await ownerTransaction("finishBatch", [id, pack(result)]);
  return result;
}

async function bankWalletRange(start: number, end: number) {
  const logs = await client.getLogs({
    address: bank.address,
    event: parseAbiItem("event BatchStarted(bytes32 indexed id, address[] wallets)"),
    fromBlock: BigInt(start),
    toBlock: BigInt(end),
  });
  return logs.flatMap(log => log.args.wallets || []).map(address => address.toLowerCase());
}
const closedWalletRange = unstable_cache(bankWalletRange, ["demo-bank-wallet-ranges", bank.address], {
  revalidate: 3600,
});
export async function serverRobotAddresses(latestBlock: number) {
  const first = Math.max(bankConfig.deployedOnBlock, robotSeed.cursor);
  const ranges = Array.from({ length: Math.max(0, Math.ceil((latestBlock - first + 1) / 100)) }, (_, i) => ({
    start: first + i * 100,
    end: Math.min(first + i * 100 + 99, latestBlock),
  }));
  const addresses = await Promise.all(
    ranges.map(({ start, end }) =>
      end < latestBlock - 100 ? closedWalletRange(start, end) : bankWalletRange(start, end),
    ),
  );
  return new Set([...robotSeed.wallets, ...addresses.flat()]);
}
