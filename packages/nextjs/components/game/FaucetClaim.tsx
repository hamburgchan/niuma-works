"use client";
import { useAccount } from "wagmi";

export function FaucetClaim() {
  const { address, connector } = useAccount();
  if (!address || !/burner/i.test(connector?.id || "")) return null;
  return (
    <div className="faucet-claim">
      <p>自动领币暂时暂停。请向当前临时钱包预充测试 MON 后上工。</p>
      <code className="receipt-hash">{address}</code>
      <button className="btn btn-outline full-width" onClick={() => navigator.clipboard.writeText(address)}>
        复制临时钱包地址
      </button>
      <p className="small-note">
        历史参考：每班约 0.0096 MON（含 gas）；V2 首班实测约 0.0122 MON。0.03 MON 约可上 2–3 班，页面开工前会按当前 gas
        重新估算。
      </p>
    </div>
  );
}
