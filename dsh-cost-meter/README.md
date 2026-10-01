# @local/dsh-cost-meter

> [DSH Bundle 工具集](../README.md) 成员之一。

DSH Web 客户端的**余额 / 费用计量**：一个 bundle、一个 Loader 行、零依赖、无构建。

## 两个半边

| 半边 | 文件 | 职责 |
|---|---|---|
| Host | `index.js` | 注册 `codexCost` 会话投影：折叠 `assistant/message` 的 provider usage → token 分桶 + 按价目表/时段计价；Host 侧读账户余额并通过同一投影下发 |
| Client | `client.js` | 在 `conversation.composer.dock` 注册状态条，经 slot 自带的 `useProjection('codexCost')` 取值；注入自己的样式表（条布局 + 红绿黄色阶） |

**客户端不接触凭据、不折叠日志**；余额是全局值但**不进入折叠 state**，因此不会被写进持久化投影检查点。

## 余额来源

1. 首选账户服务 `ctx.deepseekAccount.getBalance(...)`；
2. 回退 API Key 路由的公开接口 `GET https://api.deepseek.com/user/balance`（Key 由 Host 从凭据服务读取）。

四种非成功结果**分别上报**且都会显示原因：`absent`（服务返回 null＝无凭据/被拒）、`failed`（查询失败）、
`empty`（无可识别钱包）、`error`（抛错），reason 里同时写明「账户腿 | api-key 腿」，所以不会只剩一个无信息的 `—`。

## 颜色

只给余额（**总额 = 余额 + 赠送**）与本对话（**不含本轮**）上色；`赠送/本轮/tokens/cache` 保持中性。
边界值归更严重档：`>50 绿 / ≤50且>15 橙 / ≤15 红`，本对话 `<10 绿 / 10~20 橙 / >20 红`。阈值可在 config 覆盖。

色阶是本包私有的 `--dsh-codex-sev-ok/warn/bad`（浅色 `#0f7b3f/#b45309/#c0362c`，深色 `#3fb950/#d29922/#f85149`），
不改宿主 `--dsw-alias-state-*` 语义令牌。

## 配置

全部在 `cordis.patch.yml` 的 `config`（价格表、节假日表、阈值、余额读取开关与频率）；用自己 profile 的同 `id: codex-cost`
覆盖即可，省略的字段回落到代码默认值。详见文件内注释。
