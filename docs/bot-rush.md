# Local robot and stress engine

| N | 模式 | 发出/成功/失败/待核 | 平均/P95 ms | 最大同块 | 峰值笔/秒 | 结算跨度 ms | 全流程 ms | 上工 gas MON | 充值 gas MON | 重发 |
|---:|---|---|---|---:|---:|---:|---:|---:|---:|---:|
| 20 | hot | 20/20/0/0 | 1515/1515 | 20 | 20 | 1515 | 40102 | 0.222823080000 | 0.04284000 | 0 |
| 20 | spread | 20/20/0/0 | 1522/1522 | 20 | 20 | 1522 | 45561 | 0.196023090000 | 0.04284000 | 0 |
| 100 | hot | 100/100/0/0 | 3067/3067 | 40 | 40 | 3067 | 152408 | 0.731592654000 | 0.21420000 | 0 |
| 100 | spread | 100/100/0/0 | 3239/3239 | 40 | 40 | 3239 | 160812 | 0.732086946000 | 0.21420000 | 0 |

See the root README for exact commands, key lifecycle, RPC retry rules, definitions and preserved V1 failures. All four complete raw JSON records are in evidence/.
