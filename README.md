# DSH Bundle 工具集

一组**实用**的 DSH（DeepSeek Harness）客户端 bundle：给 DSH Web 客户端换外观、补信息、加流程的小扩展，一个包解决一件事。

每个 bundle 都是**出树（out-of-tree）**的 —— 不修改 DSH 源码、不需要构建、不下载任何 npm 依赖，
装进 profile 就生效，不想用了删掉即可，宿主本身不变。

> **一个 bundle 是什么**：一个 npm 包 + 一行 Loader 行（`cordis.patch.yml` 里的 `insert`）。
> 同一个包可以同时带两个半边 —— Host 半边 `index.js` 跑在 DSH 进程里，浏览器半边 `client.js`
> 以 `window.__ModuleLoader__.load({ id, factory })` 注册到 Web 客户端；两个半边共用这一行。

## 包含哪些 bundle

| bundle | 包名 | 做什么 | 依赖 |
|---|---|---|---|
| [`dsh-codex-skin/`](dsh-codex-skin/) | `@local/dsh-codex-skin` | **外观层**：Codex 风格的中性配色、淡蓝用户气泡、带光晕的白色输入框、无描边的行内代码 chip；浅色 / 深色两套 | 无 |
| [`dsh-cost-meter/`](dsh-cost-meter/) | `@local/dsh-cost-meter` | **费用计量**：Host 侧折叠真实用量并按官方价目表计价、读取账户余额；输入框下方一条红绿黄状态条 | 无 |

两个 bundle **互不依赖**：装任意一个都能单独用，两个一起装是推荐组合。

---

### 1. `dsh-codex-skin` —— 只管外观

把 DSH Web 客户端的观感拉向 Codex：更中性的灰阶、明确的层次和更收敛的圆角。

- **用户气泡**：浅色 `#e9f1ff` 淡蓝，深色 `#2563eb` 实心蓝
- **输入框**：浅色纯白 / 深色 `#1a1a1a`，靠 `--dsw-elevation-soft` 的**光晕**与背景分层（卡片层仍只留 0.5px 描边）
- **圆角**：`4 / 8 / 10 / 14 / 18 / 20`，关闭 superellipse
- **代码**：fenced 卡带略深表头；行内代码是**无描边**的填充 chip
- **其它**：底层色阶 `--dsw-static-neutral-bluish-*`、不透明菜单（去毛玻璃）、滚动条、文本选区、字体族与代码字体

实现上只用**宿主自己的 CSS 变量**，声明在 `html body` / `html body *`，靠优先级压过主题声明而**不使用 `!important`**。
唯一一条元素级规则是去掉行内代码的描边 —— 那条描边是 DSH 渲染器自己画的，权重需要加在 markdown 容器上（`(0,1,4) > (0,1,2)`）。
Host 半边刻意留空（`apply` 什么也不做），所以这个包只有样式，没有任何运行逻辑。

详见 [`dsh-codex-skin/README.md`](dsh-codex-skin/README.md)。

### 2. `dsh-cost-meter` —— 余额与费用

在输入框下方常驻一条状态条：

```
余额 ¥xx.xx   赠送 ¥x.xx   本对话 ¥0.0123   本轮 ¥0.0041   tokens 12.4k   cache 68%
```

- **数据从哪来**：Host 半边注册一条 `codexCost` 会话投影，折叠 provider 上报的 token 分桶（cache 命中 / 未命中 / 写出 / 输出）
  再按价目表和**高峰/空闲时段**计价；余额同样由 Host 读取，附在同一条投影上。客户端不碰凭据、不读日志。
- **余额**：优先账户服务 `deepseekAccount`，回退 API Key 路由 `GET https://api.deepseek.com/user/balance`；
  四种失败（`absent` / `failed` / `empty` / `error`）分别上报并写明原因，不会只剩一个无信息的 `—`。
- **颜色**：只给两个数字上色，边界值归**更严重**的一档。

  | 数字 | 取值 | 绿 | 橙 | 红 |
  |---|---|---|---|---|
  | 余额 | 总额度 = 余额 + 赠送 | > 50 | ≤ 50 且 > 15 | ≤ 15 |
  | 本对话 | 本会话累计（不含本轮） | < 10 | 10 ~ 20 | > 20 |

- **时段**：高峰 = 北京时间周一至周五 09:00–12:00、14:00–18:00 **且非法定节假日**；周末与法定节假日（含调休）一律空闲价（半价）。
  内置 2026 年节假日表共 33 天。价目表、节假日表、阈值、余额读取开关都在 config 里可覆盖。

详见 [`dsh-cost-meter/README.md`](dsh-cost-meter/README.md)。

---

## 安装

DSH Web 侧栏 → **Plugins → Add plugin**，填入 bundle 目录的绝对路径（也接受包名/版本、Git 地址、tarball）；
或者让 Agent 调 `plugin_manager` 的 `install_bundle`：

```
install_bundle <本仓库绝对路径>/dsh-codex-skin
install_bundle <本仓库绝对路径>/dsh-cost-meter
```

- **零依赖、无构建**：两个包都不 `import` 任何 npm 包，浏览器半边只 `require('react')`（由宿主模块表提供），
  所以安装时 pnpm 不拉任何东西、没有 build script、没有 peer 冲突。
- 装完在 Plugins 列表里显示为 **Codex 外观皮肤 / 用量计费**（`locale/` 提供中英文）。

## 改了代码以后怎么生效

| 改了什么 | 怎么生效 |
|---|---|
| 浏览器半边 `client.js` | **刷新页面**即可（插件自有的 `<style>` 随 fiber 一起增删） |
| Host 半边 `index.js` | **重启 DSH** —— 模块按代际缓存，重装同一个路径或开关插件都不会重新导入 |
| 新增/删除 bundle、改包名或 row id | 重新 `install_bundle`，新的代际会即时生效 |

## 仓库结构

```
.
├── dsh-codex-skin/          # bundle：Codex 风格外观层
│   ├── package.json         #   dsh.bundle.patch + dsh.client，声明两个半边
│   ├── cordis.patch.yml     #   插入 profile 的那一行 Loader 行
│   ├── index.js             #   Host 半边
│   ├── client.js            #   浏览器半边（样式表）
│   ├── locale/{en,zh}.json  #   Plugins 列表里的显示名与描述
│   └── README.md            #   细节说明
├── dsh-cost-meter/          # bundle：余额与费用计量（结构同上，客户端多一条状态条）
└── tests/                   # 离线测试：直接 node 跑，不需要 DSH 在跑
```

## 测试

全部是纯 Node 离线测试，不需要 DSH、不需要网络（114 项断言）：

```
node tests/fold-test.mjs      # 29 项：计价、高峰/节假日判定、钱包归一化、阈值合并
node tests/apply-test.mjs     # 18 项：Host 全链路 —— 余额四条腿、API Key 回退、wire 契约
node tests/client-test.mjs    # 67 项：两个浏览器半边在 Node 假宿主里真跑（渲染、配色分级、去描边权重）
```

`client-test.mjs` 会 stub 出 `window.__ModuleLoader__` / `document` / 最小 React，因此样式与渲染分支的改动能被测试直接抓到，
包括「样式表里不能出现反引号」（会截断模板字符串）和「覆盖规则的权重必须高于渲染器规则」这两类踩过的坑。

## 想再加一个 bundle

在本仓库新建一个目录即可，约定是：

1. `package.json`：`private: true`、`type: "module"`、`exports` 至少给 `.` 与 `./client`，
   并声明 `dsh.bundle.patch` 与 `dsh.client { platform: "web", immediately: true }`；
2. `cordis.patch.yml`：`insert` 一行，`id` 全局唯一，`name` 用包名，config 默认值写在注释里；
3. `index.js` 导出 `{ name, inject, apply }`（纯客户端 bundle 写成空 `apply` + `inject: []`）；
4. `client.js` 用 `__ModuleLoader__.load` 注册，样式表用 `ctx.effect` 挂在插件自己的 fiber 上；
5. `locale/{en,zh}.json` + `README.md`，再到 `tests/` 补一组离线断言。

两包都不引 npm 依赖、不打包，这条约定就是「一个目录 = 一个可安装的 bundle」。

## 已知边界

- **费用是估算不是账单**：DSH 不提供计费数据，费用 = provider 上报的 token 分桶 × 本地价格表。
- **节假日表要跟官方安排更新**：表外年份按「工作日高峰」处理（偏高）。
- **阈值单位是显示货币**（默认 CNY）。
- 余额读取会走 Host 侧凭据；渲染进程永远拿不到 token。

## 许可

内部自用，未发布到 npm（两个包都是 `private: true`）。仓库当前未附开源 License，默认保留所有权利。
