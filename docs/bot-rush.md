# 机器人雇主

在本机启动 Next API（`pwsh -File scripts/start-local.ps1`），再运行：

```powershell
pwsh -File scripts/bot-rush.ps1 -N 30
# 只查原批次，不重新付款
pwsh -File scripts/bot-rush.ps1 -Read b4477613-1a3a-4451-bb44-dd5dbf9f51dd
```

本地脚本是控制器，使用本机部署钱包签署一次性批次请求；批次引擎在所选 API 进程中执行。可用 `-Url https://niuma-works.vercel.app` 指向公网 API。网页 `/live` 的按钮调用同一个引擎，只有合约 owner 的签名才能启动，每批最多 30 个。部署钱包从服务端环境读取。

每个机器人新建内存钱包，部署钱包各充值 0.012 测试 MON（转账 gas 21000），随后并发各调用一次 `finishRun`。工号轮换 5/6/7，工单随机 3–6，用时随机 15–60 秒。这是直接上报模拟成绩，不是自动玩游戏。gas limit 为 estimateGas +10%。剩余余额不回收，私钥不保存、不提交、不上传。

充值与 faucet 共用 Blob CAS nonce 账本，但机器人预算单列，不占用 faucet 的 0.9 MON 额度。签名交易的原始 hash/nonce 在广播前持久化。RPC 重试关闭；同一批次 ID 返回原记录，失败不重发。UNKNOWN 需要只查原交易，阻止新批次越过未核对的部署钱包 nonce。

## 本次实际结果

| 批次 | 充值成功 | finishRun 发出 | 成功 | 失败 | 待核实 | 平均确认 | 总耗时 |
|---|---:|---:|---:|---:|---:|---:|---:|
| N=5 `b3401c8b-12f0-442a-85fc-cc8318798aef` | 5 | 5 | 5 | 0 | 0 | 1255 ms | 45.186 s |
| N=30 `b4477613-1a3a-4451-bb44-dd5dbf9f51dd` | 30 | 0 | 0 | 30 | 0 | 未采集 | 219.416 s |

N=30 的全部失败均发生在广播前的 RPC 准备阶段，原始原因是 `HTTP request failed.`，未取得足以判定 HTTP 状态码或确切限流原因的日志，因此不声称已证实为 429。30 个钱包各保留 0.012 MON，链上 nonce 均为 0，没有 finishRun hash。**没有重试该批钱包。**

后续修正为 JSON-RPC HTTP 合批并关闭 RPC 自动重试。只读诊断：同一 HTTP 请求内 30 次 `eth_estimateGas` 全部成功。此结果不等于 30 笔真实并发结算已通过；修正后没有再次发起金融测试。

首次启动还有两个广播前问题（编译 helper 缺失、空 Blob 控制状态识别错误），均已修复，原批次 `f9bc8523-eb79-4ed2-979e-cf744f41ecb8` 以失败保留。核对五个钱包余额与 nonce 均为 0、无充值预约、无控制记录后才开始正式 N=5 测试。没有隐藏启动失败，也没有重试已发出的交易。

完整逐笔结果及充值/结算链接在 `evidence/bots/<batchId>.json`；独立原回执核对见 `evidence/bots/receipt-verification.json`：35 笔充值、5 笔 finishRun。计时来自机器人进程的提交请求到成功回执，包含网络与轮询耗时，不能作为链最终性或并发容量证明。
