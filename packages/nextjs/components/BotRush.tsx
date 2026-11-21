"use client";
import { useEffect, useRef, useState } from "react";
import { formatEther } from "viem";
import { EXPLORER } from "~~/utils/niuma";
import type { BatchProgress, BotBatch, PreparedBatch } from "~~/utils/niuma-bots";

export function BotRush() {
  const [code, setCode] = useState("");
  const busyRef = useRef(false);
  const [prepared, setPrepared] = useState<PreparedBatch | null>(null),
    [progress, setProgress] = useState<BatchProgress | null>(null),
    [progressError, setProgressError] = useState("");
  const [batch, setBatch] = useState<BotBatch | null>(null),
    [comparisons, setComparisons] = useState<BotBatch[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const refresh = async () => {
      try {
        const r = await fetch("/api/bots", { cache: "no-store" });
        if (r.ok) {
          const d = await r.json();
          if (!busyRef.current) {
            setBatch(d.batch);
            setProgress(previous => (previous?.batchId === d.batch?.batchId ? previous : null));
            if (d.batch?.fundingHash)
              setPrepared({
                batchId: d.batch.batchId,
                count: d.batch.count,
                fundingHash: d.batch.fundingHash,
                fundingBlock: 0,
              });
          }
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
  useEffect(() => {
    if (!prepared || (!busy && batch?.phase === "COMPLETE")) return;
    const abort = new AbortController();
    let inflight = false;
    async function refreshProgress() {
      if (inflight || abort.signal.aborted) return;
      inflight = true;
      try {
        const response = await fetch(`/api/bots/progress?fundingHash=${prepared!.fundingHash}`, {
          cache: "no-store",
          signal: abort.signal,
        });
        const value = await response.json();
        if (!response.ok) throw new Error(value.error || "暂未收到新回执");
        if (abort.signal.aborted) return;
        setProgress(value);
        setProgressError("");
        window.dispatchEvent(new CustomEvent("niuma-bot-receipts", { detail: value }));
      } catch (error) {
        if (!abort.signal.aborted) setProgressError(error instanceof Error ? error.message : "等待真实回执");
      } finally {
        inflight = false;
      }
    }
    void refreshProgress();
    const timer = busy || batch?.phase === "UNRESOLVED" ? setInterval(refreshProgress, 500) : undefined;
    return () => {
      abort.abort();
      if (timer) clearInterval(timer);
    };
  }, [prepared, busy, batch?.phase]);
  async function release() {
    busyRef.current = true;
    setBusy(true);
    setError("");
    setPrepared(null);
    setProgress(null);
    setBatch(null);
    try {
      const preparation = await fetch("/api/bots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: 100, code, action: "prepare" }),
      });
      const plan = await preparation.json();
      if (!preparation.ok) throw new Error(plan.error || "充值未确认，请核对原批次");
      setPrepared(plan.prepared);
      const response = await fetch("/api/bots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          count: plan.prepared.count,
          code,
          action: "run",
          batchId: plan.prepared.batchId,
          fundingHash: plan.prepared.fundingHash,
        }),
      });
      const d = await response.json();
      if (d.batch) setBatch(d.batch);
      if (!response.ok) throw new Error(d.error || "批次暂未确认，请恢复原批次");
      setBatch(d.batch);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "服务端暂未返回，请恢复原批次");
    } finally {
      setBusy(false);
      busyRef.current = false;
    }
  }
  const timedRows = batch?.rows.filter(row => row.sentAt !== undefined && row.elapsedMs !== undefined) || [];
  const broadcastSpanMs =
    batch && timedRows.length === batch.count
      ? Math.max(...timedRows.map(row => row.sentAt! + row.elapsedMs!)) - Math.min(...timedRows.map(row => row.sentAt!))
      : null;
  const shown =
    progress ||
    (batch?.blocks
      ? {
          confirmed: batch.successful + batch.failed,
          successful: batch.successful,
          failed: batch.failed,
          blockCount: batch.blockCount,
          chainSpanSeconds: batch.chainSpanSeconds,
          blocks: batch.blocks,
        }
      : null);
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
      <div className="batch-chain-summary" aria-live="polite">
        <strong>
          {shown
            ? `${shown.confirmed} 笔落在 ${shown.blockCount} 个区块，链上用时 ${shown.chainSpanSeconds} 秒`
            : "链上区块统计等待本批真实回执"}
        </strong>
        <p>
          {prepared
            ? shown
              ? `已确认 ${shown.confirmed}/${prepared.count}`
              : `正在核对原批次 / ${prepared.count}`
            : "输入口令后开始本批次"}
          {shown ? ` · 成功 ${shown.successful} · 失败 ${shown.failed}` : ""}
        </p>
        <small>链上用时 = 本批首末入块的时间戳差；一个区块可为 0 秒，不代表零延迟或最终性。</small>
      </div>
      <div className="block-wall" aria-label="真实区块墙">
        {(shown?.blocks || batch?.blocks || []).map(block => (
          <div className="block-cell" key={block.number}>
            <strong>#{block.number}</strong>
            <span>
              {block.count} 笔 · {block.timestamp}
            </span>
            <div>
              {block.hashes.map(hash => (
                <a
                  key={hash}
                  href={`${EXPLORER}/tx/${hash}`}
                  target="_blank"
                  rel="noreferrer"
                  title={hash}
                  aria-label={`交易 ${hash}`}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      {progressError && (
        <p className="small-note" role="status">
          {progressError} · 保留已确认计数，继续核对原回执
        </p>
      )}
      <details>
        <summary>历史 hot / spread 对照</summary>
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
      </details>
      <p className="small-note">
        峰值按成功交易的区块时间秒分组；到账计时含公共 RPC 与轮询延迟。此处不是 Monad
        吞吐上限或最终性证明。最近批次与区块墙均由真实链上回执核对。
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
            RPC 平均（含网络往返） <strong>{batch.averageMs ?? "—"} ms</strong>
          </span>
          <span>
            RPC P95（含网络往返） <strong>{batch.p95Ms ?? "—"} ms</strong>
          </span>
          <span>
            广播总耗时（含网络往返）{" "}
            <strong>{broadcastSpanMs === null ? "—" : (broadcastSpanMs / 1000).toFixed(3)} s</strong>
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
            本批交易明细：{batch.successful}/{batch.count} 成功 · 批次处理 {(batch.totalMs / 1000).toFixed(1)}s
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
