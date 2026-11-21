import "server-only";
import { createPublicClient, http } from "viem";
import { monadTestnet } from "viem/chains";
import deployedContracts from "~~/contracts/deployedContracts";

export const deployment = deployedContracts[10143].NiumaWorks;
export const client = createPublicClient({
  chain: monadTestnet,
  transport: http(process.env.MONAD_RPC_URL || "https://testnet-rpc.monad.xyz", {
    batch: { wait: 30, batchSize: 100 },
    retryCount: 0,
  }),
});
export function orderId(value: string) {
  if (!/^[1-9][0-9]{0,17}$/.test(value)) throw new Error("Invalid order ID");
  return BigInt(value);
}
export async function readOrder(id: bigint) {
  const count = await client.readContract({ ...deployment, functionName: "orderCount" });
  if (id > count) throw new Error("Unknown order");
  return client.readContract({ ...deployment, functionName: "orders", args: [id] });
}
export function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
}
