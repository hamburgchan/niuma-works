import { json } from "~~/utils/niuma-server";

export async function POST() {
  return json({ error: "暂停招聘：现场不生成，不创建队列。请查看三名已入职新牛马的档案。" }, 410);
}
