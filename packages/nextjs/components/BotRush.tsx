"use client";
import { useEffect, useState } from "react";
import { formatEther } from "viem";
import { EXPLORER } from "~~/utils/niuma";
import type { BotBatch } from "~~/utils/niuma-bots";

export function BotRush() {
  const [code, setCode] = useState("");
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
      const response = await fetch("/api/bots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: 100, code }),
      });
      const d = await response.json();
      if (d.batch) setBatch(d.batch);
      if (!response.ok) throw new Error(d.error || "批次暂未确认，请恢复原批次");
      setBatch(d.batch);
      setError(
        `本批发出 ${d.batch.sent}，成功 ${d.batch.successful}，链上失败 ${d.batch.failed}，待核 ${d.batch.unknown}；平均 ${d.batch.averageMs ?? "—"} ms，总耗时 ${(d.batch.totalMs / 1000).toFixed(1)} 秒`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "服务端暂未返回，请恢复原批次");
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
        <button className="btn btn-primary" disabled={busy || !code} onClick={release}>
          {busy ? "牛马批量上工中…" : batch?.phase === "UNRESOLVED" ? "恢复原批次" : "批发 100 只牛马上工"}
        </button>
      </div>
      <label>
        演示口令{" "}
        <input
          className="input input-bordered"
          type="password"
          autoComplete="off"
          value={code}
          onChange={event => setCode(event.target.value)}
          placeholder="由演示负责人输入"
        />
      </label>
      <p>每 10 分钟最多一批，每批最多 100 个机器人雇主。机器人上报 3–6 单、15–60 秒，不实际操作游戏。</p>
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
        <div className="bot-stats" aria-label="最近批次统计">
          <span>
            发出 <strong>{batch.sent}</strong>
          </span>
          <span>
            成功 <strong>{batch.successful}</strong>
          </span>
          <span>
            链上失败 <strong>{batch.failed}</strong>
          </span>
          <span>
            待核 <strong>{batch.unknown}</strong>
          </span>
          <span>
            平均确认 <strong>{batch.averageMs ?? "—"} ms</strong>
          </span>
          <span>
            总耗时 <strong>{(batch.totalMs / 1000).toFixed(1)} s</strong>
          </span>
          <span>
            RPC 错误 / 重发{" "}
            <strong>
              {batch.rpcFailureCount ?? "—"} / {batch.transactionResubmissions ?? "—"}
            </strong>
          </span>
        </div>
      )}
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
