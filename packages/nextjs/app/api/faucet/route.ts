import { json } from "~~/utils/niuma-server";

export async function GET() {
  return json(
    {
      enabled: false,
      amountWei: "30000000000000000",
      capWei: "900000000000000000",
      perIpHour: 60,
      message: "自动领币暂停；请给当前临时钱包预充测试 MON。",
    },
    503,
  );
}
export async function POST() {
  return json({ error: "自动领币暂停，避免在无持久账本时重复付款。请给当前临时钱包预充测试 MON。" }, 503);
}
