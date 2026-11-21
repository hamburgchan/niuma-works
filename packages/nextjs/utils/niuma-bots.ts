import { put } from "@vercel/blob";
import { randomInt } from "node:crypto";
import "server-only";
import { type Hash, encodeFunctionData, keccak256, parseEther, verifyMessage } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { DEMO_CHARACTERS } from "~~/utils/niuma";
import { fundBot } from "~~/utils/niuma-faucet";
import { access, client, deployment, freshBlob, putState, readRecord } from "~~/utils/niuma-server";

export const BOT_ROOT = `niuma/${deployment.address.toLowerCase()}/bots`;
export type BotRow = {
  index: number;
  address: `0x${string}`;
  characterId: number;
  stars: number;
  timeMs: number;
  state: "CREATED" | "FUNDED" | "PRE_BROADCAST" | "PENDING" | "CONFIRMED" | "FAILED" | "UNKNOWN";
  fundingHash?: Hash;
  hash?: Hash;
  gasLimit?: string;
  submittedAt?: number;
  elapsedMs?: number;
  reason?: string;
};
export type BotBatch = {
  batchId: string;
  count: number;
  startedAt: number;
  finishedAt?: number;
  phase: string;
  rows: BotRow[];
  sent: number;
  successful: number;
  failed: number;
  unknown: number;
  averageMs: number | null;
  totalMs: number;
};
export function botMessage(id: string, count: number, issuedAt: number) {
  return `NIUMA WORKS bot rush\nchainId: 10143\ncontract: ${deployment.address}\ncount: ${count}\nbatchId: ${id}\nissuedAt: ${issuedAt}`;
}
function summarize(batch: BotBatch) {
  batch.sent = batch.rows.filter(row => row.submittedAt !== undefined).length;
  batch.successful = batch.rows.filter(row => row.state === "CONFIRMED").length;
  batch.failed = batch.rows.filter(row => row.state === "FAILED").length;
  batch.unknown = batch.rows.filter(row => row.state === "UNKNOWN").length;
  const times = batch.rows
    .filter(row => row.state === "CONFIRMED" && row.elapsedMs !== undefined)
    .map(row => row.elapsedMs!);
  batch.averageMs = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null;
  batch.totalMs = (batch.finishedAt || Date.now()) - batch.startedAt;
}
export async function runBotBatch(body: {
  batchId?: unknown;
  count?: unknown;
  issuedAt?: unknown;
  signature?: unknown;
}) {
  const { batchId, count, issuedAt, signature } = body;
  if (
    typeof batchId !== "string" ||
    !/^[0-9a-f-]{36}$/.test(batchId) ||
    typeof count !== "number" ||
    !Number.isInteger(count) ||
    count < 1 ||
    count > 30 ||
    typeof issuedAt !== "number" ||
    Math.abs(Date.now() - issuedAt) > 120000 ||
    typeof signature !== "string"
  )
    throw new Error("Invalid or expired bot request");
  const owner = await client.readContract({ ...deployment, functionName: "owner" });
  if (
    !(await verifyMessage({
      address: owner,
      message: botMessage(batchId, count, issuedAt),
      signature: signature as Hash,
    }))
  )
    throw new Error("Only the contract owner can release robot employers");
  if ((await client.getChainId()) !== 10143) throw new Error("Monad testnet only");
  const path = `${BOT_ROOT}/batches/${batchId}.json`;
  const existing = await readRecord(path);
  if (existing) return existing;
  const accounts = Array.from({ length: count }, () => privateKeyToAccount(generatePrivateKey()));
  // Accounts (and their private keys) stay only in this invocation's memory.
  const batch: BotBatch = {
    batchId,
    count,
    startedAt: Date.now(),
    phase: "funding",
    rows: accounts.map((account, i) => ({
      index: i + 1,
      address: account.address as `0x${string}`,
      characterId: DEMO_CHARACTERS[i % DEMO_CHARACTERS.length],
      stars: randomInt(3, 7),
      timeMs: randomInt(15000, 60001),
      state: "CREATED",
    })),
    sent: 0,
    successful: 0,
    failed: 0,
    unknown: 0,
    averageMs: null,
    totalMs: 0,
  };
  const first = await putState(path, JSON.stringify(batch));
  let etag = first.etag;
  let writing = Promise.resolve();
  const persist = () => {
    writing = writing.then(async () => {
      summarize(batch);
      const result = await putState(path, JSON.stringify(batch), etag);
      etag = result.etag;
    });
    return writing;
  };
  // Immutable claim makes replay of a valid signature return the original batch.
  // A global control record also prevents two owner-approved batches overlapping.
  const controlPath = `${BOT_ROOT}/control.json`;
  const controlSnapshot = await freshBlob(controlPath).catch(error => {
    if (error?.name === "BlobNotFoundError") return null;
    throw error;
  });
  const previous =
    controlSnapshot?.statusCode === 200 ? JSON.parse(await new Response(controlSnapshot.stream).text()) : null;
  if (previous && previous.phase !== "complete") {
    batch.phase = "blocked";
    batch.finishedAt = Date.now();
    batch.rows.forEach(row => {
      row.state = "FAILED";
      row.reason = "Previous batch needs original-ID reconciliation";
    });
    await persist();
    return batch;
  }
  const controlEtag = controlSnapshot?.blob.etag;
  const control = await putState(
    controlPath,
    JSON.stringify({ batchId, phase: "running", startedAt: batch.startedAt }),
    controlEtag,
  );
  await putState(
    `${BOT_ROOT}/latest.json`,
    JSON.stringify({ batchId }),
    (await freshBlob(`${BOT_ROOT}/latest.json`).catch(() => null))?.blob.etag,
  );
  for (const row of batch.rows) {
    try {
      const funding = await fundBot(row.address, batchId, row.index);
      row.fundingHash = funding.hash;
      row.state = funding.state === "CONFIRMED" ? "FUNDED" : funding.state === "UNKNOWN" ? "UNKNOWN" : "FAILED";
      if (row.state !== "FUNDED") row.reason = `Funding ${funding.state}; original transaction only, no retry`;
    } catch (error) {
      row.state = "FAILED";
      row.reason = error instanceof Error ? error.message.slice(0, 240) : "Funding failed";
    }
    await persist();
    // An unknown deployer nonce must be reconciled before funding more wallets.
    if (row.state === "UNKNOWN") {
      batch.rows
        .filter(r => r.state === "CREATED")
        .forEach(r => {
          r.state = "FAILED";
          r.reason = "Stopped after unknown original funding transaction";
        });
      break;
    }
  }
  batch.phase = "settling";
  await persist();
  await Promise.all(
    batch.rows.map(async (row, i) => {
      if (row.state !== "FUNDED") return;
      try {
        const account = accounts[i];
        const fee = await client.readContract({ ...deployment, functionName: "playFee" });
        const args = [BigInt(row.characterId), row.stars, BigInt(row.timeMs)] as const;
        const estimate = await client.estimateContractGas({
          ...deployment,
          functionName: "finishRun",
          args,
          value: fee,
          account: account.address,
        });
        const gas = (estimate * 110n + 99n) / 100n;
        const price = await client.getGasPrice();
        if (fee + gas * price > parseEther("0.012"))
          throw new Error(`0.012 MON insufficient for estimated fee + gas (${fee + gas * price} wei); no retry`);
        const raw = await account.signTransaction({
          chainId: 10143,
          type: "eip1559",
          to: deployment.address,
          data: encodeFunctionData({ abi: deployment.abi, functionName: "finishRun", args }),
          value: fee,
          gas,
          nonce: 0,
          maxFeePerGas: price,
          maxPriorityFeePerGas: 2_000_000_000n,
        });
        row.hash = keccak256(raw);
        row.gasLimit = gas.toString();
        row.state = "PRE_BROADCAST";
        await put(
          `${BOT_ROOT}/runs/${row.hash}.json`,
          JSON.stringify({ batchId, address: row.address, kind: "robot-employer" }),
          { access, contentType: "application/json", allowOverwrite: false },
        );
        await persist(); // Original hash becomes durable BEFORE this one broadcast.
        row.submittedAt = Date.now();
        row.state = "PENDING";
        await client.sendRawTransaction({ serializedTransaction: raw });
        const receipt = await client.waitForTransactionReceipt({
          hash: row.hash,
          timeout: 25000,
          pollingInterval: 800,
        });
        row.elapsedMs = Date.now() - row.submittedAt;
        row.state = receipt.status === "success" ? "CONFIRMED" : "FAILED";
        if (row.state === "CONFIRMED")
          await put(
            `niuma/${deployment.address.toLowerCase()}/live/latency/${row.hash}.json`,
            JSON.stringify({
              hash: row.hash,
              elapsedMs: row.elapsedMs,
              source: "robot-process",
              recordedAt: new Date().toISOString(),
            }),
            { access, contentType: "application/json", allowOverwrite: false },
          );
        if (row.state === "FAILED") row.reason = "finishRun reverted; no retry";
      } catch (error) {
        if (row.state !== "CONFIRMED") row.state = row.submittedAt ? "UNKNOWN" : "FAILED";
        const detail = error as { shortMessage?: string; message?: string };
        row.reason = (detail.shortMessage || detail.message || "Unknown failure").slice(0, 240);
      }
      await persist();
    }),
  );
  batch.phase = "complete";
  batch.finishedAt = Date.now();
  await persist();
  await putState(
    controlPath,
    JSON.stringify({ batchId, phase: batch.unknown ? "needs-reconciliation" : "complete" }),
    control.etag,
  );
  return batch;
}
