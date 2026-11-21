"use client";
import Image from "next/image";
import Link from "next/link";
import { PaperPreview } from "~~/components/PaperPreview";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { DEMO_CHARACTERS, DEMO_EMPLOYEES, EXPLORER, NIUMA } from "~~/utils/niuma";

function Employee({ employee }: { employee: (typeof DEMO_EMPLOYEES)[number] }) {
  const { data } = useScaffoldReadContract({
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
      <div className="employee-top">
        <span>EMPLOYEE #{employee.id}</span>
        <span>{order ? (order[3] === 2 ? "✓ 已入职" : "待验收") : "读取链上状态…"}</span>
      </div>
      {data ? (
        <PaperPreview url={data[2]} sha256={data[1]} name={employee.name} proofCollapsed />
      ) : (
        <div className="paper-image" aria-busy="true">
          读取链上交付…
        </div>
      )}
      <h3>{employee.name}</h3>
      <div className="card-actions">
        <Link href={`/play/${employee.id}`} className="btn btn-primary">
          雇它上一班 →
        </Link>
        <a className="link" href={`/api/characters/${employee.id}/asset`} target="_blank" rel="noreferrer">
          下载 PNG ↗
        </a>
      </div>
    </article>
  );
}
export function WorkshopHome() {
  return (
    <div className="market-home">
      <section className="market-hero" data-enter>
        <div>
          <p className="eyebrow">NIUMA WORKS / MONAD TESTNET</p>
          <h1>牛马批发部</h1>
          <p className="market-tagline">今天当牛马，明天收分成。</p>
          <p>雇新牛马上工，六张工单，一笔工资。</p>
          <Link className="btn btn-primary" href={`/play/${DEMO_CHARACTERS[0]}`}>
            雇它上一班 ↗
          </Link>
          <Link className="btn btn-outline" href="/live">
            看老板工资流水
          </Link>
          <Link className="link" href="/orders">
            查看新牛马入职档案 →
          </Link>
        </div>
        <div className="station-wall" aria-label="三位领导">
          {[
            { pet: "donkey", name: "驴组长", line: "年轻人多吃点苦。" },
            { pet: "horse", name: "马经理", line: "下季度给你涨薪。" },
            { pet: "cow", name: "牛总", line: "我们是一家人。" },
          ].map((pet, i) => (
            <article className={`old-employee old-employee-${i}`} key={pet.pet} title={pet.name}>
              <span>领导 0{i + 1}</span>
              <Image src={`/pets/${pet.pet}.png`} alt={pet.name} width={400} height={450} priority />
              <p>{pet.line}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="employee-section" id="employees">
        <div className="section-heading">
          <div>
            <p className="eyebrow">READY FOR WORK</p>
            <h2>已入职新牛马</h2>
          </div>
          <span>本日演示 · 3 名员工</span>
        </div>
        <div className="employee-grid">
          {DEMO_EMPLOYEES.map(employee => (
            <Employee key={employee.id} employee={employee} />
          ))}
        </div>
      </section>
      <section className="market-terms">
        <h2>一班工作，给进货老板发工资。</h2>
        <p>每班游玩费 0.001 测试 MON；90% 记入进货老板的可提工资，10% 属于平台。移动与领工单不上链，下班只结算一笔。</p>
        <p>每班约 0.0096 MON（含 gas），领取 0.02 MON 开工费约可上 1–2 班，以实际估算为准。</p>
      </section>
      <footer className="work-footer">
        <span>牛马批发部 · Monad Blitz 广州 · 2026</span>
        <a href={`${EXPLORER}/address/${NIUMA.address}`} target="_blank" rel="noreferrer">
          查看合约 ↗
        </a>
        <a href="https://github.com/hamburgchan/niuma-works" target="_blank" rel="noreferrer">
          GitHub ↗
        </a>
      </footer>
    </div>
  );
}
