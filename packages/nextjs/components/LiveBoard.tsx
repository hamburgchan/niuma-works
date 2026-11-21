"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { formatEther } from "viem";
import { useScaffoldWatchContractEvent } from "~~/hooks/scaffold-eth";
import { CHARACTER_NAMES, DEMO_CHARACTERS, EXPLORER, shortAddress } from "~~/utils/niuma";
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
  const [data, setData] = useState<Feed | null>(null),
    [error, setError] = useState(""),
    [origin, setOrigin] = useState("");
  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/live", { cache: "no-store" });
      if (!response.ok) throw new Error();
      setData(await response.json());
      setError("");
    } catch {
      setError("暂时无法更新，保留上次已确认的结果。");
    }
  }, []);
  useEffect(() => {
    setOrigin(window.location.origin);
    void refresh();
    const timer = setInterval(refresh, 3000);
    return () => clearInterval(timer);
  }, [refresh]);
  useScaffoldWatchContractEvent({
    contractName: "NiumaWorks",
    eventName: "RunFinished",
    onLogs: () => {
      void refresh();
    },
  });
  useScaffoldWatchContractEvent({
    contractName: "NiumaWorks",
    eventName: "Paid",
    onLogs: () => {
      void refresh();
    },
  });
  return (
    <div className="live-page">
      <div className="play-heading">
        <div>
          <p className="eyebrow">NIUMA WORKS / LIVE</p>
          <h1>老板，工资到账了。</h1>
        </div>
        <span className="live-indicator">● {error ? "重连中" : data?.catchingUp ? "正在同步历史" : "每 3 秒更新"}</span>
      </div>
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
          <small>平均到账耗时</small>
          <strong>
            {data?.averageMs ?? "—"}
            <em> ms</em>
          </strong>
          <small>{data?.latencySamples ?? "—"} 个客户端计时样本</small>
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
          <ol className="event-feed">
            {data?.events.map(event => (
              <li key={event.id} className={event.event === "Paid" ? "event-paid" : "event-run"}>
                <span className="event-icon" aria-hidden="true">
                  {event.event === "Paid" ? "✓" : "▤"}
                </span>
                <div>
                  {event.event === "RunFinished" ? (
                    <>
                      <strong>
                        {CHARACTER_NAMES[Number(event.args.characterId)] || `工号 #${event.args.characterId}`} 完成{" "}
                        {event.args.stars} 单
                      </strong>
                      <p>
                        {(Number(event.args.timeMs) / 1000).toFixed(1)}s · 老板 +
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
                      <strong>招聘单 #{event.args.orderId} 已验收</strong>
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
        <p className="small-note">全勤 = 一班完成六张工单；工资为已记入老板可提余额的累计金额。</p>
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
                        <dt>老板累计工资</dt>
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
        工单数由客户端上报，不防作弊。到账计时为浏览器提交请求到成功回执，非链最终性指标。工资进入合约可提余额；未采集值保留为空。
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
