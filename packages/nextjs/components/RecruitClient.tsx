"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { formatEther } from "viem";
import { PaperPreview } from "~~/components/PaperPreview";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { DEMO_EMPLOYEES, EXPLORER } from "~~/utils/niuma";

type Stats = { characterId: number; shifts: number; ownerWagesWei: string };
function Archive({ employee, stats }: { employee: (typeof DEMO_EMPLOYEES)[number]; stats?: Stats }) {
  const [verified, setVerified] = useState(false);
  const { data: character } = useScaffoldReadContract({
    contractName: "NiumaWorks",
    functionName: "characters",
    args: [BigInt(employee.id)],
    watch: false,
  });
  const { data: order } = useScaffoldReadContract({
    contractName: "NiumaWorks",
    functionName: "orders",
    args: [BigInt(employee.orderId)],
    watch: false,
  });
  return (
    <article className="employee-card">
      <h2>{employee.name}</h2>
      <p>{employee.prompt}</p>
      {character ? (
        <PaperPreview
          url={character[2]}
          sha256={character[1]}
          name={employee.name}
          proofCollapsed
          onVerified={setVerified}
        />
      ) : (
        <p>读取链上交付…</p>
      )}
      <dl>
        <div>
          <dt>累计上工</dt>
          <dd>{stats?.shifts ?? "—"} 班</dd>
        </div>
        <div>
          <dt>给包工头挣的工资</dt>
          <dd>{stats ? formatEther(BigInt(stats.ownerWagesWei)) : "—"} MON</dd>
        </div>
      </dl>
      <details>
        <summary>链上凭证</summary>
        <h3>链上身份证</h3>
        <p className="eyebrow">
          EMPLOYEE #{employee.id} · {order?.[3] === 2 ? "✓ 已入职" : "核对链上状态中"}
        </p>
        <p>
          包工头：
          {character ? (
            <a
              className="link receipt-hash"
              href={`${EXPLORER}/address/${character[0]}`}
              target="_blank"
              rel="noreferrer"
            >
              {character[0]}
            </a>
          ) : (
            "读取中…"
          )}
        </p>
        <p className={verified ? "hash-pass" : "small-note"}>
          {verified ? "形象指纹 ✓ · 浏览器 SHA-256 与链上一致" : "正在核对形象指纹…"}
        </p>
        {character && <code className="receipt-hash">{character[1]}</code>}
        <details>
          <summary>招聘记录</summary>
          <ol>
            {[
              ["下单", employee.orderHash],
              ["交付", employee.deliverHash],
              ["入职确认", employee.approveHash],
            ].map(([label, hash]) => (
              <li key={label}>
                <a className="link" href={`${EXPLORER}/tx/${hash}`} target="_blank" rel="noreferrer">
                  {label}记录 ↗
                </a>
              </li>
            ))}
          </ol>
        </details>
      </details>
      <Link className="btn btn-primary" href={`/play/${employee.id}`}>
        雇它上一班
      </Link>
    </article>
  );
}
export function RecruitClient() {
  const [stats, setStats] = useState<Stats[]>([]);
  useEffect(() => {
    const abort = new AbortController();
    void fetch("/api/live", { signal: abort.signal })
      .then(r => (r.ok ? r.json() : null))
      .then(d => d && setStats(d.laborLeaders))
      .catch(() => {});
    return () => abort.abort();
  }, []);
  return (
    <section className="recruit-page">
      <p className="eyebrow">EMPLOYEE ARCHIVES</p>
      <h1>招一只牛马</h1>
      <div className="employee-grid">
        {DEMO_EMPLOYEES.map(employee => (
          <Archive key={employee.id} employee={employee} stats={stats.find(s => s.characterId === employee.id)} />
        ))}
      </div>
    </section>
  );
}
