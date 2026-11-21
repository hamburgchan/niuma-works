"use client";
import { useEffect, useRef, useState } from "react";
import { type Address, type Hash, formatEther, isAddress } from "viem";
import { useAccount, usePublicClient } from "wagmi";
import { useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { EXPLORER, NIUMA } from "~~/utils/niuma";
import { getParsedError } from "~~/utils/scaffold-eth";

export function EarningsPanel() {
  const { address, chainId } = useAccount();
  const client = usePublicClient({ chainId: 10143 });
  const [lookup, setLookup] = useState("");
  const [viewOwner, setViewOwner] = useState(false);
  const { data: first } = useScaffoldReadContract({
    contractName: "NiumaWorks",
    functionName: "characters",
    args: [1n],
    watch: false,
  });
  const { data: second } = useScaffoldReadContract({
    contractName: "NiumaWorks",
    functionName: "characters",
    args: [2n],
    watch: false,
  });
  const { data: third } = useScaffoldReadContract({
    contractName: "NiumaWorks",
    functionName: "characters",
    args: [3n],
    watch: false,
  });
  const defaultOwner = first?.[0];
  const viewingSelf = Boolean(address && !viewOwner);
  const requested = (viewingSelf ? address : undefined) || lookup || defaultOwner;
  const viewedAddress = requested && isAddress(requested) ? (requested as Address) : undefined;
  const [wages, setWages] = useState<{ characterId: number; ownerWagesWei: string }[] | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    let inflight = false;
    const refresh = async () => {
      if (inflight || abort.signal.aborted) return;
      inflight = true;
      try {
        const response = await fetch("/api/live", { signal: abort.signal });
        if (response.ok) {
          const data = await response.json();
          if (!data.catchingUp && !abort.signal.aborted) setWages(data.laborLeaders);
        }
      } catch {
        /* Retain the last verified amount and retry later. */
      } finally {
        inflight = false;
      }
    };
    void refresh();
    const timer = setInterval(refresh, 15000);
    return () => {
      abort.abort();
      clearInterval(timer);
    };
  }, []);
  const owners = [first, second, third];
  const totalWages =
    viewedAddress && owners.every(Boolean) && wages && wages.length === 3
      ? wages.reduce(
          (sum, item) =>
            sum +
            (owners[item.characterId - 1]?.[0].toLowerCase() === viewedAddress.toLowerCase()
              ? BigInt(item.ownerWagesWei)
              : 0n),
          0n,
        )
      : null;
  const { data: balance, refetch } = useScaffoldReadContract({
    contractName: "NiumaWorks",
    functionName: "claimable",
    args: [viewedAddress],
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
    setViewOwner(false);
    setLookup("");
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
    if (!address || viewedAddress?.toLowerCase() !== address.toLowerCase() || !client || busy || blocked) return;
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
      <p>每班工钱实时记入包工头的链上可提余额，提现后进入钱包。</p>
      <label className="block">
        查看包工头地址
        <input
          className="input input-bordered full-width receipt-hash"
          aria-label="查看包工头地址"
          value={requested || ""}
          onChange={event => setLookup(event.target.value)}
          readOnly={viewingSelf}
          placeholder="0x…"
        />
      </label>
      <p className="small-note">
        {viewingSelf
          ? "当前显示已连接的钱包。雇主付费，牛马的包工头收工钱。"
          : "无需连接钱包即可只读查询；默认显示三只牛马的包工头。"}
      </p>
      {address && defaultOwner && address.toLowerCase() !== defaultOwner.toLowerCase() && (
        <button
          className="btn btn-outline"
          onClick={() => {
            setViewOwner(!viewOwner);
            setLookup("");
          }}
        >
          {viewOwner ? "查看我的地址" : "查看三只牛马的包工头"}
        </button>
      )}
      {viewedAddress && (
        <a className="link receipt-hash" href={`${EXPLORER}/address/${viewedAddress}`} target="_blank" rel="noreferrer">
          {viewedAddress}
        </a>
      )}
      {requested && !viewedAddress && <p className="field-error">请输入有效地址。</p>}
      <p className="earnings-amount">
        {viewedAddress && balance !== undefined ? formatEther(balance) : "—"}
        <small> MON 可提现</small>
      </p>
      <p className="earnings-amount">
        {totalWages !== null ? formatEther(totalWages) : "—"}
        <small> MON 累计工钱</small>
      </p>
      {(!address || viewedAddress?.toLowerCase() !== address.toLowerCase()) && (
        <p>连接这个地址的钱包后即可提现；只读查看不会发交易。</p>
      )}
      <button
        className="btn btn-primary"
        onClick={withdraw}
        disabled={
          !address ||
          viewedAddress?.toLowerCase() !== address.toLowerCase() ||
          balance === undefined ||
          balance === 0n ||
          busy ||
          blocked
        }
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
