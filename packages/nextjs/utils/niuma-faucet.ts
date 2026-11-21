import { BlobNotFoundError, BlobPreconditionFailedError, get, put } from "@vercel/blob";
import { createHmac } from "node:crypto";
import "server-only";
import { type Hash, getAddress, isAddress, keccak256, parseEther, verifyMessage } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { access, client, deployment } from "~~/utils/niuma-server";

const AMOUNT = parseEther("0.03");
const CAP = parseEther("0.9");
const PER_IP_HOUR = 6;
const PATH = `niuma/${deployment.address.toLowerCase()}/faucet/ledger-v1.json`;
type Claim = {
  hash: Hash;
  nonce: number;
  state: "PRE_BROADCAST" | "CONFIRMED" | "REVERTED";
  address: `0x${string}`;
  amountWei: string;
  createdAt: number;
};
type Ledger = {
  reservedWei: string;
  nextNonce: number;
  addresses: Record<string, Claim>;
  windows: Record<string, number>;
};

async function readLedger(): Promise<{ state: Ledger; etag: string }> {
  try {
    const result = await get(PATH, { access, useCache: false });
    if (result?.statusCode === 200)
      return { state: JSON.parse(await new Response(result.stream).text()), etag: result.blob.etag };
  } catch (error) {
    if (!(error instanceof BlobNotFoundError)) throw error;
  }
  try {
    await put(PATH, JSON.stringify({ reservedWei: "0", nextNonce: 0, addresses: {}, windows: {} }), {
      access,
      contentType: "application/json",
      allowOverwrite: false,
      cacheControlMaxAge: 60,
    });
  } catch {
    /* Another request may initialize it first. */
  }
  const result = await get(PATH, { access, useCache: false });
  if (!result || result.statusCode !== 200) throw new Error("Faucet ledger unavailable");
  return { state: JSON.parse(await new Response(result.stream).text()), etag: result.blob.etag };
}

export async function faucetStatus() {
  const { state } = await readLedger();
  return {
    amountWei: AMOUNT.toString(),
    capWei: CAP.toString(),
    reservedWei: state.reservedWei,
    remainingClaims: Number((CAP - BigInt(state.reservedWei)) / AMOUNT),
    perIpHour: PER_IP_HOUR,
  };
}

export async function claimFaucet(addressInput: unknown, signature: unknown, request: Request) {
  const key = process.env.FAUCET_PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY;
  if (process.env.FAUCET_ENABLED !== "true" || !key || !/^0x[a-fA-F0-9]{64}$/.test(key))
    throw new Error("Faucet unavailable");
  if (typeof addressInput !== "string" || !isAddress(addressInput)) throw new Error("Invalid wallet address");
  const address = getAddress(addressInput) as `0x${string}`;
  const message = `NIUMA WORKS faucet\nchainId: 10143\naddress: ${address}`;
  if (
    typeof signature !== "string" ||
    !/^0x[a-fA-F0-9]+$/.test(signature) ||
    !(await verifyMessage({ address, message, signature: signature as Hash }))
  )
    throw new Error("Wallet signature required");
  if ((await client.getChainId()) !== 10143) throw new Error("Monad testnet only");
  const code = await client.getCode({ address });
  if (code && code !== "0x") throw new Error("Temporary EOA wallet required");
  const ip = process.env.VERCEL
    ? request.headers.get("x-vercel-forwarded-for") || request.headers.get("x-forwarded-for")
    : "local-development";
  if (!ip) throw new Error("Client IP unavailable");
  const ipHash = createHmac("sha256", key).update(ip.split(",")[0].trim()).digest("hex");
  const window = `${Math.floor(Date.now() / 3600000)}:${ipHash}`;
  const account = privateKeyToAccount(key as Hash);
  const id = address.toLowerCase();
  for (let attempt = 0; attempt < 5; attempt++) {
    const { state, etag } = await readLedger();
    const existing = state.addresses[id];
    if (existing) {
      try {
        const receipt = await client.getTransactionReceipt({ hash: existing.hash });
        return {
          existing: true,
          address,
          hash: existing.hash,
          state: receipt.status === "success" ? "CONFIRMED" : "REVERTED",
          amountWei: existing.amountWei,
        };
      } catch {
        return { existing: true, address, hash: existing.hash, state: "PENDING", amountWei: existing.amountWei };
      }
    }
    if (BigInt(state.reservedWei) + AMOUNT > CAP) throw new Error("演示额度用完");
    if ((state.windows[window] || 0) >= PER_IP_HOUR) throw new Error("当前网络领取过于频繁，请稍后再试");
    const nonce = Math.max(
      state.nextNonce,
      await client.getTransactionCount({ address: account.address, blockTag: "pending" }),
    );
    const block = await client.getBlock({ blockTag: "latest" });
    const priority = 2_000_000_000n,
      maxFee = (block.baseFeePerGas || 100_000_000_000n) * 2n + priority;
    if ((await client.getBalance({ address: account.address })) < AMOUNT + 21000n * maxFee)
      throw new Error("Faucet balance insufficient");
    const raw = await account.signTransaction({
      chainId: 10143,
      type: "eip1559",
      to: address,
      value: AMOUNT,
      gas: 21000n,
      nonce,
      maxFeePerGas: maxFee,
      maxPriorityFeePerGas: priority,
    });
    const hash = keccak256(raw);
    state.addresses[id] = {
      hash,
      nonce,
      state: "PRE_BROADCAST",
      address,
      amountWei: AMOUNT.toString(),
      createdAt: Date.now(),
    };
    state.reservedWei = (BigInt(state.reservedWei) + AMOUNT).toString();
    state.nextNonce = nonce + 1;
    state.windows[window] = (state.windows[window] || 0) + 1;
    // Original hash/nonce and budget reservation become durable BEFORE broadcast.
    try {
      await put(PATH, JSON.stringify(state), {
        access,
        contentType: "application/json",
        allowOverwrite: true,
        ifMatch: etag,
        cacheControlMaxAge: 60,
      });
    } catch (error) {
      if (error instanceof BlobPreconditionFailedError) continue;
      throw error;
    }
    try {
      await client.sendRawTransaction({ serializedTransaction: raw });
      const receipt = await client.waitForTransactionReceipt({ hash, timeout: 20000, pollingInterval: 800 });
      return {
        existing: false,
        address,
        hash,
        state: receipt.status === "success" ? "CONFIRMED" : "REVERTED",
        amountWei: AMOUNT.toString(),
      };
    } catch {
      return { existing: false, address, hash, state: "PENDING", amountWei: AMOUNT.toString() };
    }
  }
  throw new Error("Faucet busy; retry the same address");
}
