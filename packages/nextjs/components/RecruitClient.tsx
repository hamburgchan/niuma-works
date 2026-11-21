"use client";
import Link from "next/link";
import { formatEther } from "viem";
import { PaperPreview } from "~~/components/PaperPreview";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { DEMO_EMPLOYEES, EXPLORER } from "~~/utils/niuma";

function Archive({ employee }: { employee: (typeof DEMO_EMPLOYEES)[number] }) {
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
      <p className="eyebrow">
        EMPLOYEE #{employee.id} · {order?.[3] === 2 ? "✓ 已入职" : "核对链上状态中"}
      </p>
      <h2>{employee.name}</h2>
      <p>{employee.prompt}</p>
      <p className="small-note">
        来源：{employee.generationSource} · {employee.source}
      </p>
      {character ? (
        <PaperPreview url={character[2]} sha256={character[1]} name={employee.name} />
      ) : (
        <p>读取链上交付…</p>
      )}
      <p>驴造身体 → 马教走路 → 牛发工牌</p>
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
      <Link className="btn btn-primary" href={`/play/${employee.id}`}>
        雇它上一班
      </Link>
      <a className="link" href={employee.url}>
        下载透明 PNG
      </a>
    </article>
  );
}
export function RecruitClient() {
  return (
    <section className="recruit-page">
      <p className="eyebrow">EMPLOYEE ARCHIVES / V2</p>
      <h1>新牛马入职档案</h1>
      <p>生成管线今天已验证。现场使用三名已入职员工，暂停现场生成。</p>
      <label>
        招聘新牛马
        <input className="input input-bordered full-width" disabled value="暂停招聘" readOnly />
      </label>
      <div className="employee-grid">
        {DEMO_EMPLOYEES.map(employee => (
          <Archive key={employee.id} employee={employee} />
        ))}
      </div>
    </section>
  );
}
