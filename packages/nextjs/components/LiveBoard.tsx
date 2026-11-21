"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { formatEther } from "viem";
import { BotRush } from "~~/components/BotRush";
import { CHARACTER_NAMES, DEMO_CHARACTERS, EXPLORER, shortAddress } from "~~/utils/niuma";
import type { BatchProgress } from "~~/utils/niuma-bots";
import type { LiveEvent } from "~~/utils/niuma-live";

type Feed = {
  events: LiveEvent[];
  rankings: LiveEvent[];
  runCount: number;
  settlementCount: number;
  averageMs: number | null;
  latencySamples: number;
  latency: Record<string, number>;
  catchingUp: boolean;
  indexedThrough: number;
  updatedAt: string;
  laborLeaders: { characterId: number; shifts: number; fullAttendance: number; ownerWagesWei: string }[];
};
export function LiveBoard() {
  const observedReceipts = useRef(new Map<string, LiveEvent>());
  const feedElement = useRef<HTMLOListElement>(null);
  const mergeReceipts = useCallback(
    (events: LiveEvent[]) =>
      [...new Map([...events, ...observedReceipts.current.values()].map(event => [event.id, event])).values()]
        .sort((a, b) => b.blockNumber - a.blockNumber || b.logIndex - a.logIndex)
        .slice(0, 100),
    [],
  );
  const [data, setData] = useState<Feed | null>(null),
    [error, setError] = useState(""),
    [origin, setOrigin] = useState("");
  const [fast, setFast] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/live${window.location.search.includes("fast=1") ? "?fast=1" : ""}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error();
      const next: Feed = await response.json();
      next.events = mergeReceipts(next.events);
      // Only attach local browser timing to an event already verified by the chain feed.
      try {
        const history: { hash?: string; elapsedMs?: number; status?: string }[] = JSON.parse(
          localStorage.getItem("niuma-run-history-v1") || "[]",
        );
        for (const run of history)
          if (
            run.hash &&
            run.status === "confirmed" &&
            typeof run.elapsedMs === "number" &&
            run.elapsedMs > 0 &&
            run.elapsedMs <= 120000 &&
            next.events.some(event => event.hash.toLowerCase() === run.hash!.toLowerCase())
          )
            next.latency[run.hash] = run.elapsedMs;
        const samples = Object.values(next.latency);
        next.latencySamples = samples.length;
        next.averageMs = samples.length ? Math.round(samples.reduce((sum, ms) => sum + ms, 0) / samples.length) : null;
      } catch {
        /* Keep chain events and published timing if local history is unavailable. */
      }
      setData(next);
      setError("");
    } catch {
      setError("暂时无法更新，保留上次已确认的结果。");
    }
  }, [mergeReceipts]);
  useEffect(() => {
    const receive = (event: Event) => {
      const detail = (event as CustomEvent<BatchProgress>).detail;
      let changed = false;
      for (const receipt of detail.receipts) {
        if (receipt.status !== "success" || !receipt.event) continue;
        const { logIndex, ...args } = receipt.event;
        const id = `${receipt.hash}:${logIndex}`;
        if (observedReceipts.current.has(id)) continue;
        observedReceipts.current.set(id, {
          id,
          hash: receipt.hash as `0x${string}`,
          blockNumber: receipt.blockNumber,
          logIndex,
          event: "RunFinished",
          args,
          robotEmployer: true,
        });
        changed = true;
      }
      if (changed) {
        setData(previous => (previous ? { ...previous, events: mergeReceipts(previous.events) } : previous));
        requestAnimationFrame(() => feedElement.current?.scrollTo({ top: 0 }));
      }
    };
    window.addEventListener("niuma-bot-receipts", receive);
    return () => window.removeEventListener("niuma-bot-receipts", receive);
  }, [mergeReceipts]);
  useEffect(() => {
    setOrigin(window.location.origin);
    const accelerated = new URLSearchParams(window.location.search).get("fast") === "1";
    setFast(accelerated);
    void refresh();
    const timer = setInterval(refresh, accelerated ? 3000 : 15000);
    return () => clearInterval(timer);
  }, [refresh]);
  return (
    <div className="live-page">
      <div className="play-heading">
        <div>
          <p className="eyebrow">NIUMA WORKS / LIVE</p>
          <h1>包工头，工资到账了。</h1>
        </div>
        <span className="live-indicator">
          ● {error ? "重连中" : data?.catchingUp ? "正在同步历史" : `每 ${fast ? 3 : 15} 秒更新`}
        </span>
      </div>
      <BotRush />
      <div className="live-stats">
        <div>
          <small>累计班次</small>
          <strong>{data?.runCount ?? "—"}</strong>
        </div>
        <div>
          <small>链上结算交易 / 培养费 + 工资</small>
          <strong>{data?.settlementCount ?? "—"}</strong>
        </div>
        <div>
          <small>RPC 平均（含网络往返）</small>
          <strong>
            {data?.averageMs ?? "—"}
            <em> ms</em>
          </strong>
          <small>{data?.latencySamples ?? "—"} 个提交到回执计时样本</small>
        </div>
      </div>
      <div className="live-grid">
        <aside className="scan-card">
          <p className="eyebrow">轮到你了</p>
          <h2>扫码，雇它上一班。</h2>
          {origin && (
            <QRCodeSVG
              value={`${origin}/play/${DEMO_CHARACTERS[0]}`}
              size={240}
              level="M"
              marginSize={2}
              title="打开新牛马上工页面"
            />
          )}
          <Link className="btn btn-primary" href={`/play/${DEMO_CHARACTERS[0]}`}>
            雇它上一班
          </Link>
          <p>
            本机临时钱包 · 测试 MON
            <br />
            一班 60 秒，六张工单。下班结算一次。
          </p>
        </aside>
        <section className="feed-section">
          <h2>工资流水</h2>
          {!data && <p>正在读取真实链上事件…</p>}
          {data?.events.length === 0 && <p>还没有工资结算，第一班等你来。</p>}
          <ol className="event-feed" ref={feedElement}>
            {data?.events.map(event => (
              <li key={event.id} className={event.event === "Paid" ? "event-paid" : "event-run"}>
                <span className="event-icon" aria-hidden="true">
                  {event.event === "Paid" ? "✓" : "▤"}
                </span>
                <div>
                  {event.event === "RunFinished" ? (
                    <>
                      <strong>
                        {event.robotEmployer && "🤖 机器人雇主 · "}
                        {CHARACTER_NAMES[Number(event.args.characterId)] || `工号 #${event.args.characterId}`} 完成{" "}
                        {event.args.stars} 单
                      </strong>
                      <p>
                        {(Number(event.args.timeMs) / 1000).toFixed(1)}s · 包工头 +
                        {formatEther(BigInt(String(event.args.ownerShare)))} MON
                      </p>
                      <small>
                        {data.latency[event.hash] !== undefined
                          ? `${data.latency[event.hash]} ms 到账`
                          : "到账计时未采集"}{" "}
                        · 雇主 {shortAddress(String(event.args.player))}
                      </small>
                    </>
                  ) : (
                    <>
                      <strong>招一只牛马单 #{event.args.orderId} 已验收</strong>
                      <p>驴、马、牛与平台的培养费已分账记入可提余额</p>
                    </>
                  )}
                  <a className="link" href={`${EXPLORER}/tx/${event.hash}`} target="_blank" rel="noreferrer">
                    查看交易 ↗
                  </a>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>
      <section className="leaderboards">
        <h2>劳模榜</h2>
        <p className="small-note">全勤 = 一班完成六张工单；工资为已记入包工头可提余额的累计金额。</p>
        <div className="rank-grid">
          {DEMO_CHARACTERS.map(id => (
            <article key={id}>
              <h3>{CHARACTER_NAMES[id]}</h3>
              {data ? (
                (() => {
                  const item = data.laborLeaders.find(value => value.characterId === id);
                  return (
                    <dl className="game-facts">
                      <div>
                        <dt>全勤班次</dt>
                        <dd>{item?.fullAttendance ?? 0}</dd>
                      </div>
                      <div>
                        <dt>累计班次</dt>
                        <dd>{item?.shifts ?? 0}</dd>
                      </div>
                      <div>
                        <dt>包工头累计工资</dt>
                        <dd>{formatEther(BigInt(item?.ownerWagesWei || "0"))} MON</dd>
                      </div>
                    </dl>
                  );
                })()
              ) : (
                <p>正在读取已确认工资…</p>
              )}
              <Link href={`/play/${id}`} className="link">
                雇它上一班 →
              </Link>
            </article>
          ))}
        </div>
      </section>
      <p className="small-note">
        工单数由客户端上报，不防作弊。到账计时为浏览器或机器人进程提交请求到成功回执，非链最终性指标。工资进入合约可提余额；未采集值保留为空。
        {data && ` 已同步至区块 ${data.indexedThrough}。`}
      </p>
      {error && (
        <p role="status" className="field-error">
          {error}
        </p>
      )}
    </div>
  );
}
