"use client";
import { useEffect, useState } from "react";
import { getAddress } from "viem";
import { useAccount, useSignMessage } from "wagmi";

export function FaucetClaim({ onFunded }: { onFunded?: () => void }) {
  const { address, connector } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [claimed, setClaimed] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [exhausted, setExhausted] = useState(false),
    [unconfirmed, setUnconfirmed] = useState(false);
  useEffect(() => {
    setClaimed(false);
    setMessage("");
    setExhausted(false);
    setUnconfirmed(false);
    if (!address) return;
    const abort = new AbortController();
    void fetch(`/api/faucet?address=${address}`, { signal: abort.signal })
      .then(r => r.json())
      .then(d => {
        if (!abort.signal.aborted) {
          setClaimed(!!d.claimed);
          setExhausted(
            d.remainingWei !== undefined && (BigInt(d.remainingWei) < 20000000000000000n || d.hourRemaining === 0),
          );
        }
      })
      .catch(() => {});
    return () => abort.abort();
  }, [address]);
  async function reconcile() {
    if (!address) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/faucet?address=${address}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error("RPC 暂不可用，请稍后核对原领取结果");
      if (data.claimed) {
        setClaimed(true);
        setUnconfirmed(false);
        setMessage("✓ 本地址的 0.02 MON 开工费已到账");
        onFunded?.();
      } else setMessage("链上暂未发现领取记录；如刚提交，请稍后再次核对。不会自动重新付款。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "暂未确认，请稍后核对");
    } finally {
      setBusy(false);
    }
  }
  async function claim() {
    if (!address) return;
    setBusy(true);
    setMessage("");
    let outcomeUnknown = false;
    try {
      const recipient = getAddress(address),
        issuedAt = Date.now();
      const signature = await signMessageAsync({
        message: `NIUMA WORKS opening grant\nchainId: 10143\naddress: ${recipient}\nissuedAt: ${issuedAt}`,
      });
      outcomeUnknown = true;
      const response = await fetch("/api/faucet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: recipient, issuedAt, signature }),
      });
      const data = await response.json();
      if (!response.ok) {
        outcomeUnknown = !!data.hash;
        throw new Error(data.error || "领币暂未确认，请刷新额度");
      }
      setClaimed(!!data.claimed);
      setUnconfirmed(false);
      if (data.claimed) onFunded?.();
      setExhausted(data.state === "EXHAUSTED");
      setMessage(
        data.state === "CONFIRMED"
          ? "✓ 0.02 MON 开工费已到账"
          : data.state === "ALREADY_CLAIMED"
            ? "这个地址已经领过开工费"
            : "本时段额度用完了，请使用官方水龙头",
      );
    } catch (error) {
      setUnconfirmed(outcomeUnknown);
      setMessage(error instanceof Error ? error.message : "领币暂未确认");
    } finally {
      setBusy(false);
    }
  }
  if (!address || !/burner/i.test(connector?.id || "")) return null;
  return (
    <div className="faucet-claim">
      <button
        className="btn btn-primary full-width"
        onClick={unconfirmed ? reconcile : claim}
        disabled={busy || claimed || exhausted}
      >
        {busy ? "核对领取中…" : claimed ? "本地址已领取开工费" : unconfirmed ? "核对原领取结果" : "领 0.02 MON 开工费"}
      </button>
      {message && <p role="status">{message}</p>}
      <code className="receipt-hash">{address}</code>
      <button className="btn btn-outline full-width" onClick={() => navigator.clipboard.writeText(address)}>
        复制临时钱包地址
      </button>
      <a className="link" href="https://testnet.monad.xyz" target="_blank" rel="noreferrer">
        {exhausted ? "额度用完，前往官方水龙头 ↗" : "还需要测试币？官方水龙头 ↗"}
      </a>
      <p className="small-note">
        每地址一次，每小时共 60 次，总额度 1.5 MON。每班约 0.0096 MON（含 gas），0.02 MON 约可上 1–2 班；开工前按当前
        gas 估算。
      </p>
    </div>
  );
}
