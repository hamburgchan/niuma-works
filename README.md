# NIUMA WORKS · 牛马批发部

今天当牛马，明天当包工头。三名纸片新牛马在 three.js 工坊里打一班工，六张工单、一笔链上工资。培养费托管，交付 PNG 指纹登记，验收后按 50/20/20/10 分给驴、马、牛和平台；每局给包工头记入 90% 工资。

公网：[牛马批发部](https://niuma-works.vercel.app) · [上工](https://niuma-works.vercel.app/play/1) · [工资大屏](https://niuma-works.vercel.app/live) · [入职档案](https://niuma-works.vercel.app/orders) · [包工头工资条](https://niuma-works.vercel.app/earnings)

## 比赛合规

主办方已于 10:47 前宣布开赛（参赛者确认）。仓库首次提交时间为 2026-11-21 10:47（北京时间），精确时间 10:47:30+08:00，提交 `541e967db7d9e9a61d2a53f702c5ebbe86d06be6`。产品代码与演示素材均开赛后制作；赛前核实脚本、图片和 sample.glb 未复制进仓库。基于 Scaffold-ETH 2 / create-eth 2.0.23 的 Foundry 样板，工坊游戏开赛后从零写，未修改任何现成游戏。

## 当前演示：V2、静态 PNG、暂停招一只牛马

演示只使用 [NiumaWorksV2](https://testnet.monadexplorer.com/address/0xcE94FDE4016D7b930b61bEF1474Df1458D1355cC)，源码验证成功，证据 `evidence/deployment-v2.json`、`evidence/verification-v2.json`。

骡丝钉 #1、驼延症 #2、码喽 #3，均为 NIUMA WORKS 团队自拟描述，来源 **chatgpt 手动生成**。三张立绘经四边保守 flood fill 去背景、最近邻缩放，高 512px，分别 124910、139644、130691 字节。羊驼内部米白卷毛与程序员贴纸边保留。原文件字节与 SHA-256 不变，存于 `/chars/<sha256>.png`，V2 链上 URI 直接登记公开静态地址。每名员工重新 order → deliver → approve，三笔交易、四方金额与无鉴权下载校验见 `evidence/v2/orders/1.json` 至 `3.json`。浏览器独立重算 SHA-256 并与链上核对。

**项目运行不依赖 Vercel Blob；现场不做生成。** Hobby 存储用量超限，用户确认到 2026-12-21 才恢复。“招一只牛马”页现为“新牛马入职档案”，不提供新的现场招一只牛马；旧的生成 API 返回 410，不调用 Pollinations。生成 worker 已停用。页面、动态大屏与订单 API 均不读取 Blob。`/live` 使用真实链上事件，附只读链上扫描生成的种子、按闭合区块段保存的 Next Data Cache、15 秒进程缓存与 CDN 缓存；浏览器默认每 15 秒更新，`/live?fast=1` 每 3 秒刷新，实时区块缓存同步缩短；无额外事件 watcher。

临时钱包可领取 **0.02 MON 开工费**：每地址一次、滚动一小时最多 60 次、累计上限 1.5 MON。由部署钱包出资，经独立的 `NiumaDemoBank` 账本转拨；它不修改业务 V2，地址 `0xf89Eb0B40E3C243Fc27a76cB9d9e65170aEF97cD`。额度与防重在链上保存，不依赖 Blob 或 serverless 内存。额度耗尽后显示官方水龙头与复制地址按钮。每班历史约 0.0096 MON，V2 首局可能约 0.0122 MON；0.02 MON 约 1–2 班，开工前按当前 gas 估算。

## V2 结算设计与验证

V1 源码与链上记录保留。V2 的订单、托管、验收四方分账、取消、退款逻辑不变。`finishRun` 只修改该角色的工资与成绩/局数，不写共享 `balances[treasury]`。角色工资分别累积；`withdrawCharacter(id)` 单角色提现，`withdraw()` 合并本人的工资与培养费/退款余额。页面读 `claimable(address)`。

平台费在 `sweepTreasury()` 按未结算局数记入平台可提余额；更新费率或收款人前先按旧配置 sweep，保留整数舍入的精确金额。sweep 是记账，平台再提现才进入钱包。当前 sweep 和合并提现需遍历角色，仅验证本次三角色规模，未证明生产规模可扩展性。

Foundry：V1 16 项、V2 18 项，原业务合约共 **34 passed / 0 failed**，含 fuzz、平台精确 sweep、费率/收款人切换、工资精确提现与重复提现拦截。见 `evidence/foundry-v2-test.txt`。没有安全审计或防作弊声明。

## 打工高峰压力测试

同一 `scripts/bot-rush.ps1` 支持普通机器人与 hot/spread。hot 全部雇 #1；spread 轮换 #1/#2/#3。每机器人预充 0.013 MON，随机 3–6 单、15–60 秒，gas 使用 estimate +10%。相同广播配置：每 HTTP 批 20 笔、最多 2 请求并发。先完成 N=20 两批（同时作为机器人验收），再 N=100 两批，没有为了制造差异调整参数。

| N | 模式 | 发出/成功/失败/待核 | 平均/P95 ms | 最大同块 | 峰值笔/秒 | 结算跨度 ms | 全流程 ms | 上工 gas MON | 充值 gas MON | 重发 |
|---:|---|---|---|---:|---:|---:|---:|---:|---:|---:|
| 20 | hot | 20/20/0/0 | 1515/1515 | 20 | 20 | 1515 | 40102 | 0.222823080000 | 0.04284000 | 0 |
| 20 | spread | 20/20/0/0 | 1522/1522 | 20 | 20 | 1522 | 45561 | 0.196023090000 | 0.04284000 | 0 |
| 100 | hot | 100/100/0/0 | 3067/3067 | 40 | 40 | 3067 | 152408 | 0.731592654000 | 0.21420000 | 0 |
| 100 | spread | 100/100/0/0 | 3239/3239 | 40 | 40 | 3239 | 160812 | 0.732086946000 | 0.21420000 | 0 |

四组 RPC 失败、链上 revert、待核实、重发均为 0，无需 N=50 降级。hot 与 spread 的最大同块和峰值相同，spread 未更快。本次受控客户端和公共 RPC 结果**不代表 Monad 吞吐上限或最终性**。峰值按成功交易区块时间秒分组；确认耗时从客户端提交屏障到批量回执观察，包含排队、RPC 与轮询延迟，因此同一批内计时相同是观测方法导致，并非每笔真实执行耗时完全一致。全流程含逐笔充值；结算跨度不含充值。

原始完整四组结果与每笔哈希/区块号在 `evidence/stress-20261121-*.json`。额外预检失败 `9b453831...` 发现 0.012 MON 不足，**0 充值 / 0 广播**，原样保留；随后四组统一 0.013 MON。`evidence/v2/stress-event-audit.json` 用原哈希、玩家、角色和工单数逐笔对照真实链上事件，240 笔全部一致。大屏机器人标签来自这些公开批次记录，模拟成绩不冒充真人游戏。

HTTP 429、连接失败/超时：有限退避，只可重发完全相同的已签名原交易；记录 HTTP 与逐交易重发次数，不创建新 nonce。RPC 层错误与链上 status=0 分开；未知结果只查原哈希。临时私钥在 **仓库外** `D:/monad/.bot-runtime/` 保存，所有交易成功或明确失败后删除；未知状态保留。四个完成批次的密钥文件均已删除。

### 网页批发上工（服务端）

`/live` 的“批发 100 只牛马上工”使用服务端 `DEMO_CODE` 校验，口令只由演示负责人输入，不需要连接 owner 钱包或启动本机 worker。单批最多 100 个，每 10 分钟最多一批，冷却及未决批次锁由独立账本执行。服务端一次原子转拨，每钱包 0.013 MON；随机上报 3–6 单、15–60 秒，轮换三名员工，gas 估算 +10%。并发广播控制为 2，只对 HTTP 429/连接/超时退避重发相同原签名，链上失败与 RPC 错误分开报告。

本地临时口令端到端验收：**100 发出 / 100 成功 / 0 失败 / 0 待核，平均 22138 ms，全流程 25850 ms，RPC 错误及重发均 0**。计时包含此服务端实现的广播排队和回执轮询，与前述 CLI 的分批 RPC 方法不同，不能据此推断链性能变差。错误口令 403、数量 101 拦截、0.02 MON 领币、重复地址拦截、十分钟冷却、持久结果回读均通过，见 `evidence/server-demo-acceptance.json`。生产真实口令由用户本人复验，不宣称本地口令测试替代该步骤。

钱包密钥只在服务端内存中以域隔离 HMAC 推导，不保存或返回密钥；原始签名所需参数在充值时写入链上批次计划。服务中断后可用同一部署密钥重建完全相同的交易，未知状态只恢复原批次，不创建新钱包。完成结果压缩后保存链上；大屏通过资金账本事件识别机器人。**批次未解决前不要轮换部署密钥或升级推导规则**。全新进程已重建 100 个地址和原交易哈希，全部匹配，见 `evidence/server-batch-recovery-audit.json`。这是恢复能力核对，不是新的压力批次。

独立账本 6 项测试，加原业务合约 34 项，总计 **40 passed / 0 failed**，见 `evidence/demo-bank-tests.txt`。本地旧 worker 保留历史用途，公网按钮已不再依赖它。

## 运行

Node >=20.18.3、Corepack Yarn、Foundry、Python venv。本机凭证文件 `D:/monad/.env` 在仓库之外。Web 浏览不需要 HF、Blob 或钱包密钥；服务端领币与批发上工需要 `DEPLOYER_PRIVATE_KEY`，批发接口额外需要 `DEMO_CODE`，可选 `MONAD_RPC_URL`。全部为服务端变量，不能加 `NEXT_PUBLIC_`。本地交易脚本另读取买家/operator 密钥，绝不输出。仅 Monad 测试网 10143。

```powershell
corepack yarn install
forge test --root packages/foundry
corepack yarn next:build
pwsh -File scripts/start-local.ps1 -Production
# 在已确认预算后，运行一批；每次调用会创建新批次，勿把它当作失败批次恢复命令
pwsh -File scripts/bot-rush.ps1 -N 20 -Mode hot
pwsh -File scripts/bot-rush.ps1 -N 20 -Mode spread
# 公网网页批发在 /live 输入 DEMO_CODE；无需本地 worker
```

`scripts/deploy-v2.py`、`verify-v2.py`、`import-v2-demos.py` 为已执行的版本化步骤，原交易标记保留，不清空标记重复部署/下单。`publish-chain-feed.py` 只读生成事件种子，不发交易。`export-contract.mjs` 从 V2 的实际部署证据导出 ABI，Scaffold hook 名称仍为 NiumaWorks。

## 历史生成与失败证据

今天 FLUX → TRELLIS 已用 V1 订单 1–3 跑通，HF 免费额度耗尽后停用。土豆工人、宇航柴犬、小包子与其他旧 GLB/PNG 角色均已替换，不出现在当前首页、/play、/live。三张当前手动立绘不冒充自动生成。

Pollinations → 去背景 → PNG 曾实际执行：`evidence/pollinations-probe.json` 为接口实测；V1 订单 9 的模型输出质量不合格，虽 Delivered 但未验收，不用于演示；订单 10 在 Pollinations 返回 503 后使用诚实标注的程序化像素回退，完成交付和验收，证据 `evidence/orders/10.json`（链上状态回读另见相关记录）。自动管线历史代码留存，当前 worker/API 均不执行它。

V1 订单 1–6 属于历史记录，其中已交付的 Blob 地址因额度超限暂时无法访问；订单 5 在 HF 失败后取消，没有交付 URI，0.01 MON 已记入买家可提退款。V1 后续 Blob 订单同样不再作为演示入口。订单 1 原为私有地址，曾被订单 4 替代；现均退役。V1 合约 [0x8ecf351db2ea99aa32bef4ba2686fd0bfeff8abb](https://testnet.monadexplorer.com/address/0x8ecf351db2ea99aa32bef4ba2686fd0bfeff8abb)，原记录 `evidence/deployment.json` 不覆盖。

原 V1 N=5 为 5/5 成功；原 N=30 已充 0.36 MON，30 个钱包 nonce 均为 0、没有签名/广播哈希；签名前出现 HTTP 传输错误。精确失败方法及 HTTP 状态未保留，不能声称已证明 429。私钥当时仅在请求内存中，现已丢失，0.36 MON 无法收回。原失败批次不改写、不重试，记账与修复说明见 `evidence/bots/failed-30-postmortem.json`。本次新 N=20 hot/spread 同时完成机器人验收，不再单独新跑 N=30。

游戏成绩由客户端上报，不防作弊；waddle/hop/squash 是预制纸片动作，不是 AI 骨骼动画。现场不做生成，所有资金都是测试 MON。所有未收集到的计时显示为未知，浏览器计时在当前设备保留并可附到同设备大屏的已确认事件；已采集的公测计时随证据发布。其他设备未采集的计时仍显示未知，机器人计时随原始证据发布。

公网 V2 浏览器操控验收（由编码代理操作）：`0xa107465989098092c287591d8c2f021290b75cca411454ae9f64c1f9bf276cde`，1 单、35222ms、提交到成功回执 2389ms、包工头 +0.0009 MON；原回执见 `evidence/v2/public-play-acceptance.json`。这是桌面浏览器，不冒充真实手机验收。四组压力结果仍为 240 笔，该历史快照使当时 V2 累计 241 班；后续服务端测试另新增 100 班，实时总数以链上为准。全部压力交易链接见 `evidence/stress-transactions.md`。

冷启动漏读回归通过：使用修复前243事件种子（不含该局浏览器交易），目标区块同时位于旧1600块窗口与最近100块之外，新API仍补齐到241班/244笔，见 `evidence/v2/cold-start-gap-regression.json`。累计班次另与链上角色局数核对，不以部分事件数冒充完整总数。

重发分支另有4项离线测试通过（提取实际广播函数，模拟429/连接错误/400/already-known，不签名不联网），见 `evidence/v2/broadcast-retry-tests.txt`；四组真实网络测试重发均为0，不能把离线测试当作真实限流复现。


## 最终体验与提交材料

品牌为牛马批发部，员工展示名为骡丝钉、驼延症、码喽，领导为驴组长、马经理、牛总。仅修改展示名，不修改角色 ID、原始提示词、交付字节或链上记录。领导慢速巡逻，接触时随机画饼并让员工停住一秒。档案默认只展示形象、描述、累计班次和包工头工资；交易、SHA-256 与四方分账位于默认折叠的链上凭证区，来源只在 README 说明。

`submission/` 包含 512×512 LOGO、首页和大屏截图、200 字以内介绍及交接检查表。材料仅准备，**没有向 MOJO 提交**；由 Claude 先向用户展示并确认后提交。新功能截止 17:15，材料目标 18:00，活动截止 18:30（北京时间）。
