"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Address } from "@scaffold-ui/components";
import { type Hash, formatEther, parseEventLogs } from "viem";
import { monadTestnet } from "viem/chains";
import { useAccount, useBalance, useConnect, usePublicClient, useSwitchChain } from "wagmi";
import { FaucetClaim } from "~~/components/game/FaucetClaim";
import { useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { CHARACTER_NAMES, DEMO_CHARACTERS, EXPLORER, NIUMA, type RunResult } from "~~/utils/niuma";
import { getParsedError } from "~~/utils/scaffold-eth";

const Arena = dynamic(() => import("./Arena").then(module => module.Arena), { ssr: false });
type RunRecord = RunResult & {
  runId: string;
  characterId: number;
  address: string;
  status: "submitting" | "pending" | "confirmed" | "unknown" | "reverted";
  hash?: Hash;
  startedAt: number;
  submittedAt?: number;
  confirmedAt?: number;
  elapsedMs?: number;
  gasLimit?: string;
  feeWei?: string;
  ownerShareWei?: string;
  nonce: number;
  blockNumber: string;
};
const STORAGE = `niuma-current-run-${NIUMA.address.toLowerCase()}`;

export function PlayClient({
  characterId,
  employeeName,
}: {
  characterId: number;
  employeeName?: string;
  generationSource?: string;
}) {
  const name = employeeName || CHARACTER_NAMES[characterId] || `新牛马 #${characterId}`;
  const { address, chainId, connector } = useAccount();
  const { connectors, connectAsync } = useConnect();
  const { switchChainAsync } = useSwitchChain();
  const publicClient = usePublicClient({ chainId: 10143 });
  const balance = useBalance({ address, chainId: 10143, query: { refetchInterval: 15000 } });
  const character = useScaffoldReadContract({
    contractName: "NiumaWorks",
    functionName: "characters",
    args: [BigInt(characterId)],
    watch: false,
  });
  const fee = useScaffoldReadContract({ contractName: "NiumaWorks", functionName: "playFee", watch: false });
  const ownerBps = useScaffoldReadContract({
    contractName: "NiumaWorks",
    functionName: "characterOwnerBps",
    watch: false,
  });
  const { writeContractAsync } = useScaffoldWriteContract({ contractName: "NiumaWorks", disableSimulate: true });
  const [ready, setReady] = useState(false),
    [playing, setPlaying] = useState(false),
    [runKey, setRunKey] = useState(0),
    [finishSignal, setFinishSignal] = useState(0);
  const [motion, setMotion] = useState<"waddle" | "hop" | "squash">("waddle"),
    [record, setRecord] = useState<RunRecord | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [cost, setCost] = useState<string | null>(null);
  const current = useRef<RunRecord | null>(null);
  const settling = useRef(false);

  function persist(value: RunRecord) {
    current.current = value;
    setRecord(value);
    localStorage.setItem(STORAGE, JSON.stringify(value));
  }
  useEffect(() => {
    try {
      const value = localStorage.getItem(STORAGE);
      if (value) {
        const parsed = JSON.parse(value) as RunRecord;
        current.current = parsed;
        setRecord(parsed);
      }
    } catch {
      setError("本机结算记录无法读取，请勿重复提交上一局。");
    }
  }, []);

  async function connectBurner() {
    setError("");
    setBusy(true);
    try {
      const burner = connectors.find(item => /burner/i.test(item.id + item.name));
      if (!burner) throw new Error("临时钱包连接器尚未加载，请稍后再试");
      await connectAsync({ connector: burner, chainId: 10143 });
    } catch (error) {
      setError(getParsedError(error));
    } finally {
      setBusy(false);
    }
  }
  async function start() {
    if (!address || !publicClient || !fee.data) return;
    setError("");
    setBusy(true);
    try {
      if (current.current && ["submitting", "pending", "unknown"].includes(current.current.status))
        throw new Error("上一局尚未核实，请先查询原交易");
      if (chainId !== 10143) await switchChainAsync({ chainId: 10143 });
      const estimate = await publicClient.estimateContractGas({
        ...NIUMA,
        account: address,
        functionName: "finishRun",
        args: [BigInt(characterId), 6, 60000n],
        value: fee.data,
      });
      const gas = (estimate * 110n + 99n) / 100n;
      const expected = fee.data + gas * (await publicClient.getGasPrice());
      setCost(formatEther(expected));
      const available = await publicClient.getBalance({ address });
      if (available < expected)
        throw new Error(`临时钱包余额不足，本局预计需要约 ${Number(formatEther(expected)).toFixed(5)} MON（含 gas）`);
      current.current = null;
      setRecord(null);
      localStorage.removeItem(STORAGE);
      settling.current = false;
      setRunKey(value => value + 1);
      setPlaying(true);
    } catch (error) {
      setError(getParsedError(error));
    } finally {
      setBusy(false);
    }
  }
  async function finish(result: RunResult) {
    if (settling.current) return;
    settling.current = true;
    setBusy(true);
    setPlaying(false);
    setError("");
    if (!publicClient || !address || fee.data === undefined) {
      setError("钱包不可用，本局未提交");
      setBusy(false);
      return;
    }
    let submitted = false;
    try {
      const estimate = await publicClient.estimateContractGas({
        ...NIUMA,
        account: address,
        functionName: "finishRun",
        args: [BigInt(characterId), result.stars, BigInt(result.timeMs)],
        value: fee.data,
      });
      const gas = (estimate * 110n + 99n) / 100n;
      const nonce = await publicClient.getTransactionCount({ address, blockTag: "pending" });
      const blockNumber = await publicClient.getBlockNumber();
      const pending: RunRecord = {
        ...result,
        runId: crypto.randomUUID(),
        characterId,
        address,
        status: "submitting",
        startedAt: Date.now(),
        gasLimit: gas.toString(),
        nonce,
        blockNumber: blockNumber.toString(),
      };
      persist(pending);
      submitted = true;
      await writeContractAsync(
        {
          functionName: "finishRun",
          args: [BigInt(characterId), result.stars, BigInt(result.timeMs)],
          value: fee.data,
          gas,
        },
        {
          onTransactionSubmitted: hash =>
            persist({ ...current.current!, hash, status: "pending", submittedAt: Date.now() }),
          onBlockConfirmation: receipt => {
            const saved = current.current!;
            const completed = {
              ...saved,
              hash: receipt.transactionHash,
              status: "confirmed" as const,
              confirmedAt: Date.now(),
              elapsedMs: Date.now() - saved.startedAt,
              feeWei: (gas * receipt.effectiveGasPrice).toString(),
              ownerShareWei: parseEventLogs({
                abi: NIUMA.abi,
                logs: receipt.logs,
                eventName: "RunFinished",
              })[0]?.args.ownerShare.toString(),
            };
            persist(completed);
            const history = JSON.parse(localStorage.getItem("niuma-run-history-v1") || "[]");
            localStorage.setItem("niuma-run-history-v1", JSON.stringify([completed, ...history].slice(0, 30)));
            void fetch("/api/runs/latency", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ hash: receipt.transactionHash, elapsedMs: completed.elapsedMs }),
            }).catch(() => {});
            void balance.refetch();
            void character.refetch();
          },
        },
      );
    } catch (error) {
      if (submitted && current.current && current.current.status !== "confirmed")
        persist({ ...current.current, status: "unknown" });
      setError(getParsedError(error));
    } finally {
      setBusy(false);
    }
  }
  async function recover() {
    const saved = current.current;
    if (!saved || !publicClient) return;
    setBusy(true);
    setError("");
    try {
      if (!saved.hash)
        throw new Error(
          `提交结果未知。原钱包 ${saved.address}，nonce ${saved.nonce}；请核对原交易，当前不会重新发送。`,
        );
      const receipt = await publicClient.getTransactionReceipt({ hash: saved.hash });
      persist({ ...saved, status: receipt.status === "success" ? "confirmed" : "reverted", confirmedAt: Date.now() });
      void balance.refetch();
      void character.refetch();
    } catch {
      setError("原交易尚无可确认的成功回执，请稍后再次查询。不会重复发送。");
    } finally {
      setBusy(false);
    }
  }
  const blocked = !!record && ["submitting", "pending", "unknown"].includes(record.status);
  const isBurner = !!connector && /burner/i.test(connector.id + connector.name);
  const data = character.data;
  return (
    <div className="play-page">
      <div className="play-heading">
        <div>
          <p className="eyebrow">一班 60 秒 · 六张工单 · 一笔工资结算</p>
          <h1>{name}，该上工了。</h1>
        </div>
        <div className="character-switch" aria-label="切换角色">
          {DEMO_CHARACTERS.map(id => (
            <Link
              key={id}
              className={`btn btn-sm ${id === characterId ? "btn-primary" : "btn-outline"}`}
              href={`/play/${id}`}
            >
              {CHARACTER_NAMES[id]}
            </Link>
          ))}
        </div>
      </div>
      <div className="play-layout">
        <section className="game-section" aria-label="打工一班">
          {data && data[2] ? (
            <Arena
              url={data[2]}
              employeeName={name}
              characterId={characterId}
              sha256={data[1]}
              playing={playing}
              runKey={runKey}
              motion={motion}
              finishSignal={finishSignal}
              onReady={() => setReady(true)}
              onFinish={finish}
            />
          ) : (
            <div className="arena-wrap arena-loading">
              {character.isError ? "角色记录读取失败" : "正在读取链上角色…"}
            </div>
          )}
          <div className="game-toolbar">
            <div className="motion-choice" aria-label="预制动作">
              <button
                className={`btn btn-sm ${motion === "waddle" ? "btn-primary" : "btn-outline"}`}
                onClick={() => setMotion("waddle")}
                aria-pressed={motion === "waddle"}
              >
                摇摆走
              </button>
              <button
                className={`btn btn-sm ${motion === "hop" ? "btn-primary" : "btn-outline"}`}
                onClick={() => setMotion("hop")}
                aria-pressed={motion === "hop"}
              >
                蹦跳
              </button>
            </div>
            <button
              className={`btn btn-sm ${motion === "squash" ? "btn-primary" : "btn-outline"}`}
              onClick={() => setMotion("squash")}
              aria-pressed={motion === "squash"}
            >
              压扁回弹
            </button>
            <span>领完六张工单或 60 秒下班</span>
          </div>
        </section>
        <aside className="play-panel">
          <div className="panel-label">本机临时钱包</div>

          {!address || !isBurner ? (
            <>
              <p>创建一个留在本机浏览器的测试钱包，用它结算每一局。</p>
              <button className="btn btn-primary full-width" onClick={connectBurner} disabled={busy}>
                启用临时钱包
              </button>
            </>
          ) : (
            <>
              <Address address={address} chain={monadTestnet} />
              <p className="wallet-balance">
                {balance.data ? Number(formatEther(balance.data.value)).toFixed(5) : "…"}
                <small> MON</small>
              </p>
            </>
          )}
          <FaucetClaim onFunded={() => void balance.refetch()} />
          <dl className="game-facts">
            <div>
              <dt>每班工资支出</dt>
              <dd>{fee.data !== undefined ? formatEther(fee.data) : "…"} MON + gas</dd>
            </div>
            <div>
              <dt>老板收到</dt>
              <dd>{ownerBps.data !== undefined ? `${Number(ownerBps.data) / 100}%` : "…"}</dd>
            </div>
            <div>
              <dt>累计班次</dt>
              <dd>{data ? data[6].toString() : "…"} 班</dd>
            </div>
          </dl>
          {playing ? (
            <button className="btn btn-primary full-width" onClick={() => setFinishSignal(value => value + 1)}>
              下班并发工资
            </button>
          ) : (
            <button
              className="btn btn-primary full-width"
              disabled={!ready || !isBurner || busy || blocked}
              onClick={start}
            >
              {busy ? "正在处理…" : blocked ? "等待上一班工资确认" : "上工"}
            </button>
          )}
          {cost && !playing && (
            <p className="small-note">本局预计总额约 {Number(cost).toFixed(5)} MON，以实际 gas 为准。</p>
          )}
          {record && (record.characterId === characterId || blocked) && (
            <div className="run-receipt" role="status">
              <strong>
                本班完成 {record.stars} 单 · {(record.timeMs / 1000).toFixed(1)} 秒
              </strong>
              <p>
                {
                  {
                    submitting: "正在提交本局…",
                    pending: "交易已发出，等待回执…",
                    confirmed: `工资 +${record.ownerShareWei ? formatEther(BigInt(record.ownerShareWei)) : "—"} MON 已发给进货老板`,
                    unknown: "提交状态待核实",
                    reverted: "交易执行失败",
                  }[record.status]
                }
              </p>
              {record.hash && (
                <a
                  className="link receipt-hash"
                  target="_blank"
                  rel="noreferrer"
                  href={`${EXPLORER}/tx/${record.hash}`}
                >
                  {record.hash}
                </a>
              )}
              {record.elapsedMs !== undefined && (
                <p>
                  到账 {record.elapsedMs} ms<small>提交请求 → 成功回执；工资记入老板可提余额</small>
                </p>
              )}
              {blocked && (
                <button className="btn btn-outline full-width" onClick={recover} disabled={busy}>
                  查询原交易
                </button>
              )}
            </div>
          )}
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
          <p className="small-note">Monad 测试网。工单数由客户端上报，不防作弊。移动与领工单不发交易。</p>
        </aside>
      </div>
    </div>
  );
}
