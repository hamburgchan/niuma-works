# NIUMA WORKS · 牛马人才市场

说一句话招一名新牛马，三头老牛马负责培养，新牛马上工后每班给老板记入可提工资。培养费由 Monad 测试网合约托管，验收后按工位分账。

公网：[人才市场](https://niuma-works.vercel.app)、[上工](https://niuma-works.vercel.app/play/5)、[工资大屏](https://niuma-works.vercel.app/live)。本地 worker 负责生成与 operator 交付。

Created after the organizer's start announcement for Monad Blitz Guangzhou, 2026-11-21, using create-eth 2.0.23 (Scaffold-ETH 2, Foundry).

## 比赛合规

主办方已于 10:47 前宣布开赛（参赛者确认）。仓库首次提交时间为 2026-11-21 10:47（北京时间），精确时间 10:47:30+08:00，提交 `541e967db7d9e9a61d2a53f702c5ebbe86d06be6`。产品代码和演示角色均在开赛后制作；赛前临时核实脚本、图片和 sample.glb 未复制进仓库。

## Current status

合约已部署在 Monad 测试网（10143），原有三个角色完成了真实订单、交付和验收。删除样板合约后 `forge test -vv` 为 16 passed、0 failed（含 256 次 fuzz）；见 `evidence/foundry-test-stage3-cleanup.txt`。交易与文件指纹见 [evidence/orders.md](evidence/orders.md)。

**纸片人演示已替换：**首页、/play、/live 只展示骡子新员工 #5（订单 6）、羊驼实习生 #6（订单 7）、加班程序员 #7（订单 8）。来源均为 **chatgpt 手动生成**，描述为 NIUMA WORKS 团队自拟。四边保守 flood fill 保留羊驼内部米白卷毛，程序员保留贴纸边；最近邻缩放到高 512px，分别 124910、139644、130691 字节。透明 PNG 公开 Blob 均经无鉴权下载、SHA-256 比对和链上 Paid 状态回读；详情见 `evidence/orders/6.json` 至 `8.json`、`evidence/paper-background-processing.json`。

旧角色 1–4 背景未去除，已替换并退出演示。订单 5 在 HF ZeroGPU 额度耗尽后取消，0.01 MON 记入买家可提退款余额；它没有新角色。订单 1–5 均不用于演示，历史证据保留。失败证据见 `evidence/orders/5-generation-failed.json`。

- Contract: [`0x8ecf351db2ea99aa32bef4ba2686fd0bfeff8abb`](https://testnet.monadexplorer.com/address/0x8ecf351db2ea99aa32bef4ba2686fd0bfeff8abb)
- Deployment: [`0xd70b1d03a9cb0d7adc979a085c0fce451ca89d2390a0082baa5477fbf439208a`](https://testnet.monadexplorer.com/tx/0xd70b1d03a9cb0d7adc979a085c0fce451ca89d2390a0082baa5477fbf439208a)
- Verification API: 2/2 succeeded; Monadscan verified, MonadVision partial match. Exact response: `evidence/verification-response.json`.

当前交付物是透明 PNG：演示使用手动立绘上传，现场招聘采用 Pollinations，失败时退到标注“程序化生成”的抽象像素角色。FLUX → TRELLIS 管线曾用订单 1–3 验证；演示日因 HF 免费额度耗尽改为现在的纸片人方案。3D 生成和 GLB 上传路线已停用。Pre-start verification code and assets are excluded.

历史模型：[FLUX.1-schnell](https://huggingface.co/black-forest-labs/FLUX.1-schnell) (Apache-2.0)、[TRELLIS-image-large](https://huggingface.co/microsoft/TRELLIS-image-large) (MIT)。当前游戏为开赛后从零实现的 three.js 工坊；角色和 NPC 都是透明 PNG、白色描边、薄层厚度及脚底椭圆影子的 billboard。摇摆、蹦跳、压扁回弹是预制程序化动作，不是骨骼动画。

## Development

Use Node >=20.18.3, Yarn via Corepack, and Foundry. Run `corepack yarn install`, `forge test` from `packages/foundry`, then `corepack yarn start`.

Copy `.env.example` to a private `.env` and fill the required values locally. Never publish a key or token.

On this workstation the environment file is `D:\monad\.env`, outside this repository. `scripts/deploy.ps1` loads it, checks chain ID 10143, and refuses to broadcast again if an earlier deployment attempt needs reconciliation. Run `pwsh -File scripts/deploy.ps1`; `-VerifyOnly` retries source verification without deploying again.

Order payments snapshot the price, recipients and split when funded. Acceptance credits withdrawable balances at 50/20/20/10; integer remainder goes to the platform. Cancellation or an eligible timeout refund credits the buyer's full original payment, then the buyer calls `withdraw()`.

## Generation service

Setup: `python -m venv .venv`, then `.venv\Scripts\python -m pip install -r scripts/requirements.txt`. It loads `D:\monad\.env` here; another location can be selected with `NIUMA_ENV_FILE`. HF_TOKEN also supports the Windows user environment. The current Blob store is public; its token remains server-side.

Start the API locally: `pwsh -File scripts/start-local.ps1`. Run the worker separately: `.venv\Scripts\python scripts/worker.py --watch`. POST `/api/orders/{orderId}/start` validates chain Funded state, the exact UTF-8 prompt's keccak256, and the buyer's signature before creating an immutable Blob queue entry. Repeated requests return the existing job. GET `/api/orders/{orderId}` reads progress and actual chain state. See [docs/generation.md](docs/generation.md) for the signing message and worker details.

The demo uses a **local worker for generation and operator delivery**. Vercel handles read/queue APIs; generation does not run inside the Vercel request. GET is read-only. The website and live feed are publicly deployed.

演示立绘处理：`.venv\Scripts\python scripts/paper_assets.py`。`scripts/import-paper-demos.py` 仅导入已授权的三张立绘，通过本地持久化原交易记录核对下单、交付、验收，不能删除记录来重复执行。输出清单为 `packages/nextjs/contracts/demoCharacters.json`。旧 `generate.py` / `demo.py` 仅保留历史代码，不运行。

Definite model errors cancel the Funded order and credit a full withdrawable refund. Unknown/connection failures hold for reconciliation, without resubmitting a GPU job or transaction. GPU claims are create-only Blob objects; local task and original transaction hashes are persisted. Do not clear those records to retry an uncertain operation.

Measured order gas costs at 102 gwei: order 0.024372492–0.026294988 MON, deliver 0.030021150–0.031945074 MON, approve 0.007858080–0.009773130 MON. These are fees in addition to the 0.01 MON commission. They use each submitted gas limit, as Monad charges on the limit.

## Demo limitations

## 机器人雇主实测

`pwsh -File scripts/bot-rush.ps1 -N 30`；网页备选入口为 `/live` 的“放出 30 个机器人雇主”，仅 owner 签名可启动。模拟成绩明确标记“🤖 机器人雇主”，不冒充真人游戏。

N=5：5 笔 finishRun 全部成功，平均 1255ms，总耗时 45.186s。N=30：30 笔充值成功，但广播前 RPC 准备均报 `HTTP request failed.`，finishRun 发出 0、成功 0、失败 30，总耗时 219.416s，**未重试**。HTTP 合批修正后只有只读 30 次预估通过，不能声称 30 笔真实结算通过。原始逐笔记录和资金回执保留在 `evidence/bots/`，详见 [机器人运行说明](docs/bot-rush.md)。

Run scores are reported by the client and are not cheat resistant. Procedural motions are presets, not generated skeletal animation. Only Monad testnet is in scope.

旧订单 1：链上登记的地址为私有，已用订单 4 替代。订单 4 曾登记同一份开赛后生成的土豆工人 GLB 的 public URL。两者现在均已被纸片人方案替换，不在演示中出现。
