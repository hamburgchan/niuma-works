"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { DEMO_CHARACTERS } from "~~/utils/niuma";

export function NiumaHeader() {
  const pathname = usePathname();
  return (
    <header className="work-header">
      <a className="skip-link" href="#main">
        跳到主要内容
      </a>
      <Link className="work-brand" href="/" aria-label="牛马人才市场首页">
        <span className="brand-pixels" aria-hidden="true">
          N
        </span>
        <span>
          牛马人才市场<small>NIUMA WORKS</small>
        </span>
      </Link>
      <nav aria-label="主导航">
        <Link href="/live" aria-current={pathname === "/live" ? "page" : undefined}>
          大屏
        </Link>
        <Link href={`/play/${DEMO_CHARACTERS[0]}`} aria-current={pathname.startsWith("/play") ? "page" : undefined}>
          试玩
        </Link>
      </nav>
      <div className="header-wallet">
        <ConnectButton showBalance={false} accountStatus="address" chainStatus="none" label="连接钱包" />
      </div>
    </header>
  );
}
