# DSH 插件 bundle：Codex 外观 + 用量计费

两个**互相独立**的 DSH Web 客户端插件 bundle。装任意一个都能用，装两个是推荐组合。

| bundle | 包名 | 作用 | 依赖 |
|---|---|---|---|
| [`dsh-codex-skin/`](dsh-codex-skin/) | `@local/dsh-codex-skin` | **只管外观**：中性配色、蓝色用户气泡、输入框光晕、行内代码 chip、圆角/阴影/菜单/字体；黑白两套 | 无（Host 半边是空的） |
| [`dsh-cost-meter/`](dsh-cost-meter/) | `@local/dsh-cost-meter` | **费用计量**：Host 侧折叠用量并按官方价目计价、读余额；输入框下方状态条（含红绿黄分级配色） | 无（不依赖皮肤，用默认主题也正常） |

两者之间**没有任何代码依赖**：皮肤只写宿主 CSS 变量，计费条只读自己那条会话投影 + 自己的样式表。计费条的颜色是它**自己的**色阶（`--dsh-codex-sev-*`），不会改宿主语义令牌，也不受皮肤影响。

## 安装

DSH Web 侧栏 → **Plugins → Add plugin**，依次填两个目录的绝对路径（也接受包名/版本、Git 地址、tarball）；
或者让 Agent 调 `plugin_manager` 的 `install_bundle`：

```
install_bundle D:\works\work\deepseek\bundle\dsh-codex-skin
install_bundle D:\works\work\deepseek\bundle\dsh-cost-meter
```

- **零依赖、无构建**：两个包都不 `import` 任何 npm 包，浏览器半边只 `require('react')`（宿主模块表提供），
  所以安装时 pnpm 不拉任何东西、没有 build script、没有 peer 冲突。
- 浏览器半边是**手写**的 `window.__ModuleLoader__.load({ id, factory })` 格式，改完刷新页面即可生效；
  Host 半边（`index.js`）的改动需要重启 DSH —— Loader 按代际缓存 JS 模块。

## 计费条显示什么

```
余额 ¥xx.xx   赠送 ¥x.xx   本对话 ¥0.0123   本轮 ¥0.0041   tokens 12.4k   cache 68%
```

颜色只给**两个数字**上色：

| 数字 | 取哪个值 | 绿 | 橙 | 红 |
|---|---|---|---|---|
| 余额 | 总额度 = 余额 + 赠送 | > 50 | ≤ 50 且 > 15 | ≤ 15 |
| 本对话 | 本会话累计（不含本轮） | < 10 | 10 ~ 20 | > 20 |

边界值归入**更严重**的一档（50 → 橙、15 → 红、10/20 → 橙）。阈值与价格表都在 `dsh-cost-meter/cordis.patch.yml`
的 `config` 里，可用自己 profile 的同 id 覆盖改写。

## 价格与时段

按 DeepSeek 官方口径（<https://api-docs.deepseek.com/zh-cn/quick_start/pricing/>）：高峰 = 北京时间周一至周五
09:00–12:00、14:00–18:00 **且非法定节假日**；其余时段（含周末、法定节假日、调休上班的周末）一律空闲价（半价）。
内置 2026 年节假日表共 33 天（国务院办公厅 2025-11-04 通知）。

## 测试

```
node tests/fold-test.mjs      # 计价、时段/节假日、钱包归一化、阈值合并
node tests/apply-test.mjs     # Host apply 全链路：余额四条腿、API Key 回退、契约
node tests/client-test.mjs    # 两个浏览器半边在 Node 假宿主里真跑（含渲染与配色分级）
```

## 已知边界

- **是估算不是账单**：DSH 没有计费数据，费用 = provider 上报的 token 分桶 × 本地价格表。
- **节假日表要跟官方安排更新**：表外年份按「工作日高峰」处理（偏高）。
- **阈值单位是显示货币**（默认 CNY）。

## 许可

内部自用，未发布到 npm（两个包都是 `private: true`）。
