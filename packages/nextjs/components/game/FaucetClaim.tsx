"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { getAddress } from "viem";
import { useAccount, useBalance, useSignMessage } from "wagmi";
import { EXPLORER } from "~~/utils/niuma";
import { getParsedError } from "~~/utils/scaffold-eth";

export function FaucetClaim() {
  const { address, connector } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const balance = useBalance({ address, chainId: 10143, query: { refetchInterval: 4000 } });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [hash, setHash] = useState(""),
    [state, setState] = useState("");
  const attempted = useRef(new Set<string>());
  const refreshBalance = balance.refetch;
  const claim = useCallback(async () => {
    if (!address) return;
    setBusy(true);
    setError("");
    attempted.current.add(address);
    try {
      const signature = await signMessageAsync({
        message: `NIUMA WORKS faucet\nchainId: 10143\naddress: ${getAddress(address)}`,
      });
      const response = await fetch("/api/faucet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, signature }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setHash(result.hash);
      setState(
        result.state === "CONFIRMED"
          ? "已到账 0.03 MON"
          : result.state === "REVERTED"
            ? "转账失败，请核对原交易"
            : "已发出，请查询原交易",
      );
      void refreshBalance();
    } catch (error) {
      setError(getParsedError(error));
    } finally {
      setBusy(false);
    }
  }, [address, signMessageAsync, refreshBalance]);
  useEffect(() => {
    if (
      address &&
      /burner/i.test(connector?.id || "") &&
      balance.data?.value === 0n &&
      !attempted.current.has(address)
    ) {
      attempted.current.add(address);
      void claim();
    }
  }, [address, balance.data?.value, connector?.id, claim]);
  if (!address || !/burner/i.test(connector?.id || "")) return null;
  return (
    <div className="faucet-claim">
      <button className="btn btn-outline full-width" onClick={claim} disabled={busy}>
        {busy ? "正在领取测试 MON…" : hash ? "查询这次领取" : "领取 0.03 测试 MON"}
      </button>
      {state && (
        <p className="small-note" role="status">
          {state}
          {hash && (
            <>
              {" "}
              ·{" "}
              <a className="link" target="_blank" rel="noreferrer" href={`${EXPLORER}/tx/${hash}`}>
                转账记录
              </a>
            </>
          )}
        </p>
      )}
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
      <p className="small-note">每地址一次；每网络每小时最多 6 次。总额度 0.9 MON。</p>
    </div>
  );
}
