"use client";
import { useEffect, useRef, useState } from "react";
import { type Hash, formatEther } from "viem";
import { useAccount, usePublicClient } from "wagmi";
import { useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { EXPLORER, NIUMA } from "~~/utils/niuma";
import { getParsedError } from "~~/utils/scaffold-eth";

export function EarningsPanel() {
  const { address, chainId } = useAccount();
  const client = usePublicClient({ chainId: 10143 });
  const { data: balance, refetch } = useScaffoldReadContract({
    contractName: "NiumaWorks",
    functionName: "claimable",
    args: [address],
    watch: false,
  });
  const { writeContractAsync } = useScaffoldWriteContract({ contractName: "NiumaWorks", disableSimulate: true });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [hash, setHash] = useState<Hash | null>(null),
    [confirmed, setConfirmed] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const original = useRef<{ address: string; nonce: number; hash?: Hash; status: string } | null>(null);
  const persist = (record: NonNullable<typeof original.current>) => {
    original.current = record;
    setHash(record.hash || null);
    setConfirmed(record.status === "confirmed");
    setBlocked(record.status !== "confirmed" && record.status !== "reverted");
    localStorage.setItem(
      `niuma-withdraw-${NIUMA.address.toLowerCase()}-${record.address.toLowerCase()}`,
      JSON.stringify(record),
    );
  };
  useEffect(() => {
    original.current = null;
    setHash(null);
    setConfirmed(false);
    setBlocked(false);
    if (!address) return;
    try {
      const saved = localStorage.getItem(`niuma-withdraw-${NIUMA.address.toLowerCase()}-${address.toLowerCase()}`);
      if (saved) {
        const record = JSON.parse(saved);
        original.current = record;
        setHash(record.hash || null);
        setConfirmed(record.status === "confirmed");
        setBlocked(!["confirmed", "reverted"].includes(record.status));
      }
    } catch {
      setBlocked(true);
      setError("提现记录无法读取，请先核对原交易。");
    }
  }, [address]);
  async function withdraw() {
    if (!address || !client || busy || blocked) return;
    setBusy(true);
    setError("");
    try {
      if (chainId !== 10143) throw new Error("请连接 Monad 测试网");
      const gas =
        ((await client.estimateContractGas({ ...NIUMA, functionName: "withdraw", account: address })) * 110n) / 100n +
        1n;
      persist({
        address,
        nonce: await client.getTransactionCount({ address, blockTag: "pending" }),
        status: "submitting",
      });
      await writeContractAsync(
        { functionName: "withdraw", gas },
        {
          onTransactionSubmitted: hash => persist({ ...original.current!, hash, status: "pending" }),
          onBlockConfirmation: () => {
            persist({ ...original.current!, status: "confirmed" });
            void refetch();
          },
        },
      );
    } catch (error) {
      if (original.current && original.current.status !== "confirmed")
        persist({ ...original.current, status: "unknown" });
      setError(getParsedError(error));
    } finally {
      setBusy(false);
    }
  }
  async function check() {
    if (!client) return;
    if (!hash) {
      setError(
        `请核对原钱包 ${original.current?.address || ""} 的 nonce ${original.current?.nonce ?? "—"}；当前不会重新提交。`,
      );
      return;
    }
    try {
      const receipt = await client.getTransactionReceipt({ hash });
      if (original.current)
        persist({ ...original.current, status: receipt.status === "success" ? "confirmed" : "reverted" });
      await refetch();
    } catch {
      setError("原提现交易尚待确认，不会再次提交。");
    }
  }
  return (
    <section className="earnings-panel">
      <p className="eyebrow">OWNER PAYSLIP</p>
      <h1>包工头的账本</h1>
      <p>培养费分账和各角色工资先记入合约，提现后才进入当前钱包。</p>
      <p className="earnings-amount">
        {address && balance !== undefined ? formatEther(balance) : "—"}
        <small> MON 可提现</small>
      </p>
      {!address && <p>请在右上角连接要查工资的钱包。</p>}
      <button
        className="btn btn-primary"
        onClick={withdraw}
        disabled={!address || balance === undefined || balance === 0n || busy || blocked}
      >
        {busy ? "提现处理中…" : "提现到当前钱包"}
      </button>
      {blocked && !hash && (
        <button className="btn btn-outline" onClick={check}>
          核对原提现请求
        </button>
      )}
      {hash && (
        <div className="run-receipt">
          <p>{confirmed ? "✓ 提现回执成功" : "提现已提交，按原交易查询"}</p>
          <a className="link receipt-hash" href={`${EXPLORER}/tx/${hash}`} target="_blank" rel="noreferrer">
            {hash}
          </a>
          {!confirmed && (
            <button className="btn btn-outline" onClick={check}>
              查询原提现交易
            </button>
          )}
        </div>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
