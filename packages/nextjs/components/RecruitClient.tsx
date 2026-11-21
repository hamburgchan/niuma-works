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
        <p className="eyebrow">
          EMPLOYEE #{employee.id} · {order?.[3] === 2 ? "✓ 已入职" : "核对链上状态中"}
        </p>

        <p className={verified ? "hash-pass" : "small-note"}>
          {verified ? "✓ 浏览器 SHA-256 与链上交付一致" : "正在核对 SHA-256…"}
        </p>
        <ol>
          {[
            ["下单", employee.orderHash],
            ["交付", employee.deliverHash],
            ["验收", employee.approveHash],
          ].map(([label, hash]) => (
            <li key={label}>
              <a className="link" href={`${EXPLORER}/tx/${hash}`} target="_blank" rel="noreferrer">
                {label}交易 ↗
              </a>
            </li>
          ))}
        </ol>
        <h3>培养费四方分账</h3>
        <dl>
          {["驴 · 50%", "马 · 20%", "牛 · 20%", "平台 · 10%"].map((label, i) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>
                {formatEther(BigInt(employee.splitAmountsWei[i]))} MON ·{" "}
                <a
                  className="link"
                  href={`${EXPLORER}/address/${employee.recipients[i]}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {employee.recipients[i].slice(0, 8)}… ↗
                </a>
              </dd>
            </div>
          ))}
        </dl>
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
