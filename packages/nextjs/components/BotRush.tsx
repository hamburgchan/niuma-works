"use client";
import { useEffect, useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { EXPLORER, NIUMA } from "~~/utils/niuma";
import type { BotBatch } from "~~/utils/niuma-bots";
import { getParsedError } from "~~/utils/scaffold-eth";

export function BotRush() {
  const { address, chainId } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { data: owner } = useScaffoldReadContract({ contractName: "NiumaWorks", functionName: "owner", watch: false });
  const [batch, setBatch] = useState<BotBatch | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    const update = async () => {
      try {
        const response = await fetch("/api/bots", { cache: "no-store" });
        if (response.ok) setBatch((await response.json()).batch);
      } catch {
        /* Preserve the last observed batch during a disconnect. */
      }
    };
    void update();
    const timer = setInterval(update, 3000);
    return () => clearInterval(timer);
  }, []);
  async function release() {
    setBusy(true);
    setError("");
    try {
      if (chainId !== 10143 || address?.toLowerCase() !== owner?.toLowerCase())
        throw new Error("请使用合约 owner 钱包连接 Monad 测试网");
      const batchId = crypto.randomUUID(),
        issuedAt = Date.now(),
        count = 30;
      const signature = await signMessageAsync({
        message: `NIUMA WORKS bot rush\nchainId: 10143\ncontract: ${NIUMA.address}\ncount: ${count}\nbatchId: ${batchId}\nissuedAt: ${issuedAt}`,
      });
      const response = await fetch("/api/bots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId, issuedAt, count, signature }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "批次未完成，请查询原批次");
      setBatch(result.batch);
    } catch (error) {
      setError(getParsedError(error));
    } finally {
      setBusy(false);
    }
  }
  const running = batch && !["complete", "blocked"].includes(batch.phase);
  return (
    <section className="bot-rush">
      <div className="section-heading">
        <div>
          <p className="eyebrow">ROBOT EMPLOYERS</p>
          <h2>老板们，进场。</h2>
        </div>
        <button
          className="btn btn-primary"
          disabled={busy || !!running || address?.toLowerCase() !== owner?.toLowerCase()}
          onClick={release}
        >
          {busy ? "机器人进场中…" : "放出 30 个机器人雇主"}
        </button>
      </div>
      <p className="small-note">
        机器人直接上报随机 3–6 单、15–60 秒，不实际操作游戏。每钱包充值 0.012 测试 MON，各结算一次。仅 owner
        可启动；失败不重试。演示优先用本地 scripts/bot-rush.ps1。
      </p>
      {batch && (
        <>
          <p>
            批次 {batch.batchId} ·{" "}
            {batch.phase === "complete"
              ? "已结束"
              : batch.phase === "funding"
                ? "正在充值"
                : batch.phase === "settling"
                  ? "并发结算中"
                  : batch.phase}
          </p>
          <div className="bot-stats">
            <span>
              发出 <b>{batch.sent}</b>
            </span>
            <span>
              成功 <b>{batch.successful}</b>
            </span>
            <span>
              失败 <b>{batch.failed}</b>
            </span>
            <span>
              待核实 <b>{batch.unknown}</b>
            </span>
            <span>
              平均 <b>{batch.averageMs ?? "—"} ms</b>
            </span>
            <span>
              总耗时 <b>{(batch.totalMs / 1000).toFixed(1)} s</b>
            </span>
          </div>
          <details>
            <summary>本批次 {batch.count} 笔结果与失败原因</summary>
            <ol className="bot-results">
              {batch.rows.map(row => (
                <li key={row.index}>
                  <span>
                    🤖 #{row.index} · 工号 {row.characterId} · {row.stars} 单 · {row.state}
                  </span>
                  {row.fundingHash && (
                    <a className="link" href={`${EXPLORER}/tx/${row.fundingHash}`} target="_blank" rel="noreferrer">
                      充值交易 ↗
                    </a>
                  )}
                  {row.hash && (
                    <a className="link" href={`${EXPLORER}/tx/${row.hash}`} target="_blank" rel="noreferrer">
                      结算交易 ↗
                    </a>
                  )}
                  {row.reason && <strong>{row.reason}</strong>}
                  {row.elapsedMs !== undefined && <span>{row.elapsedMs} ms</span>}
                </li>
              ))}
            </ol>
          </details>
        </>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
