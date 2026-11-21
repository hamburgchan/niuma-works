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
        <PaperPreview url={data[2]} sha256={data[1]} name={employee.name} />
      ) : (
        <div className="paper-image" aria-busy="true">
          读取链上交付…
        </div>
      )}
      <h3>{employee.name}</h3>
      <p className="small-note">
        来源：{employee.generationSource}
        <br />
        {employee.source}
      </p>
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
          <h1>牛马人才市场</h1>
          <p className="market-tagline">三头老牛马，培养下一代牛马。</p>
          <p>
            驴造身体，马教走路，牛发工牌。
            <br />
            雇新牛马上工，六张工单，一笔工资。
          </p>
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
        <div className="station-wall" aria-label="三头老牛马工位墙">
          {[
            { pet: "donkey", name: "驴", role: "造身体", line: "身体造好了，精神没造好。" },
            { pet: "horse", name: "马", role: "教走路", line: "会摇摆，会蹦，不想动。" },
            { pet: "cow", name: "牛", role: "发工牌", line: "工牌一挂，正式上班。" },
          ].map((pet, i) => (
            <article className={`old-employee old-employee-${i}`} key={pet.pet}>
              <span>
                工位 0{i + 1} / {pet.role}
              </span>
              <Image
                src={`/pets/${pet.pet}.png`}
                alt={`${pet.name}同事，挂工牌、眼神失焦`}
                width={400}
                height={450}
                priority
              />
              <h2>
                {pet.name} · {pet.role}
              </h2>
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
        <h2>一班工作，给老板发工资。</h2>
        <p>
          每班游玩费 0.001 测试 MON；90% 记入角色老板的可提余额，10% 在 sweep
          时统一记入平台。移动与领工单不上链，下班只结算一笔。
        </p>
        <p>每班约 0.0096 MON（含 gas），领取一次测试币可以上约 3 班，以实际估算为准。</p>
        <p>
          立绘为 chatgpt 手动生成、四边 flood fill 去背景的透明 PNG；动作是预制程序化动作。文件 SHA-256
          可由浏览器与链上记录核对。
        </p>
      </section>
      <footer className="work-footer">
        <span>牛马人才市场 · Monad Blitz 广州 · 2026</span>
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
