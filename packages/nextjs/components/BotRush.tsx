"use client";
import { useEffect, useState } from "react";
import { formatEther } from "viem";
import { useAccount, useSignMessage } from "wagmi";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { EXPLORER, NIUMA } from "~~/utils/niuma";
import type { BotBatch } from "~~/utils/niuma-bots";

export function BotRush() {
  const { address, chainId } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { data: owner } = useScaffoldReadContract({ contractName: "NiumaWorks", functionName: "owner", watch: false });
  const [batch, setBatch] = useState<BotBatch | null>(null),
    [comparisons, setComparisons] = useState<BotBatch[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const refresh = async () => {
      try {
        const r = await fetch("/api/bots");
        if (r.ok) {
          const d = await r.json();
          setBatch(d.batch);
          setComparisons(d.comparisons);
        }
      } catch {
        /* Keep the last evidence. */
      }
    };
    void refresh();
    const timer = setInterval(refresh, 15000);
    return () => clearInterval(timer);
  }, []);
  async function release() {
    setBusy(true);
    setError("");
    try {
      if (chainId !== 10143 || address?.toLowerCase() !== owner?.toLowerCase())
        throw new Error("请用 owner 钱包连接 Monad 测试网，并先启动本机 worker");
      const count = 30,
        batchId = crypto.randomUUID(),
        issuedAt = Date.now();
      const signature = await signMessageAsync({
        message: `NIUMA WORKS bot rush\nchainId: 10143\ncontract: ${NIUMA.address}\ncount: ${count}\nbatchId: ${batchId}\nissuedAt: ${issuedAt}`,
      });
      const response = await fetch("http://127.0.0.1:8787/bots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count, batchId, issuedAt, signature }),
      });
      const d = await response.json();
      if (!response.ok) throw new Error(d.error || "本机 worker 无法启动");
      setError("本机 worker 已开始。请查看终端；失败不创建新交易。浏览器可能需要允许本地网络访问。");
    } catch (e) {
      setError(e instanceof Error ? e.message : "请检查本机 worker 及浏览器本地网络权限");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="bot-rush">
      <div className="section-heading">
        <div>
          <p className="eyebrow">ROBOT EMPLOYERS / PUBLIC RPC</p>
          <h2>打工高峰</h2>
        </div>
        <button
          className="btn btn-primary"
          disabled={busy || !address || address.toLowerCase() !== owner?.toLowerCase()}
          onClick={release}
        >
          {busy ? "请求本机 worker…" : "放出 30 个机器人雇主"}
        </button>
      </div>
      <p>
        机器人上报随机 3–6 单、15–60 秒，不实际操作游戏。主路径：本机 <code>scripts/bot-rush.ps1 -N 100 -Mode hot</code>
        ；网页按钮需要本机 <code>scripts/bot-worker.py</code> 与 owner 签名。每钱包预充 0.013
        MON；签名相同的交易才可退避重发。
      </p>
      <div className="table-wrapper">
        <table className="table">
          <thead>
            <tr>
              <th>模式 / 数量</th>
              <th>发出 / 成功 / 失败 / 待核</th>
              <th>平均 / P95 ms</th>
              <th>最大同块</th>
              <th>峰值笔/秒</th>
              <th>结算跨度</th>
              <th>实际 gas MON</th>
              <th>RPC / 链上失败 / 重发</th>
            </tr>
          </thead>
          <tbody>
            {comparisons.map(b => (
              <tr key={b.batchId}>
                <td>
                  {b.mode} / {b.count}
                </td>
                <td>
                  {b.sent} / {b.successful} / {b.failed} / {b.unknown}
                </td>
                <td>
                  {b.averageMs ?? "—"} / {b.p95Ms ?? "—"}
                </td>
                <td>{b.maxSameBlock ?? "—"}</td>
                <td>{b.peakTxPerSecond ?? "—"}</td>
                <td>{b.settlementSpanMs ?? "—"} ms</td>
                <td>{b.totalGasWei ? formatEther(BigInt(b.totalGasWei)) : "—"}</td>
                <td>
                  {b.rpcFailureCount ?? "—"} / {b.chainFailureCount ?? "—"} / {b.transactionResubmissions ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small-note">
        峰值按成功交易的区块时间秒分组；到账计时含公共 RPC 与轮询延迟。此处不是 Monad
        吞吐上限或最终性证明。最近结果为本机脚本发布的链上回执证据。
      </p>
      {batch && (
        <details>
          <summary>
            最近批次 {batch.batchId}：{batch.successful}/{batch.count} 成功 · 总耗时 {(batch.totalMs / 1000).toFixed(1)}
            s
          </summary>
          <ol className="bot-results">
            {batch.rows.map(row => (
              <li key={row.index}>
                🤖 #{row.index} · 工号 {row.characterId} · {row.state} {row.blockNumber && `区块 ${row.blockNumber}`}{" "}
                {row.hash && (
                  <a className="link" href={`${EXPLORER}/tx/${row.hash}`} target="_blank" rel="noreferrer">
                    交易 ↗
                  </a>
                )}
                {row.reason && <strong>{row.reason}</strong>}
              </li>
            ))}
          </ol>
        </details>
      )}
      {error && (
        <p className="field-error" role="status">
          {error}
        </p>
      )}
    </section>
  );
}
