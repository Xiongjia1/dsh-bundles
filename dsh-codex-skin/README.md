# @local/dsh-codex-skin

> [DSH Bundle 工具集](../README.md) 成员之一。

把 DSH Web 客户端的观感拉向 Codex，并顺手补上两处 Codex 式的交互：**轮次小横条在任何窗口宽度都显示**，以及**选中回复可以附加到下次对话**。

一个 bundle、一个 Loader 行、零依赖、无构建。

- Host 半边 `index.js`：**空的 `apply`**（纯客户端 bundle 需要一个可被 Row 导入的 Host 模块，仅此而已）。
- 浏览器半边 `client.js`：三张插件自有样式表 + 一个 composer 插槽条目；全部挂在插件自己的 fiber 上，
  禁用插件即整体撤下。**没有 Host 逻辑**，所以改动只需刷新页面，不必重启 DSH。

## 一、外观

全部只写宿主自己的 CSS 变量，声明在 `html body` / `html body *`（用**优先级**压过主题的 `body` / `body *`，
不使用 `!important`）。浅色在 `html body`，深色在 `html body[data-ds-dark-theme]`：

- 底层色阶 `--dsw-static-neutral-bluish-*`（去蓝调、两端加深，别名令牌自动跟随）
- 用户气泡：浅色 `#e9f1ff` 淡蓝 / 深色 `#2563eb` 实心蓝
- 输入框：浅色纯白 / 深色 `#1a1a1a`，靠 `--dsw-elevation-soft` 的**光晕**分层（卡片层仍只留 0.5px 描边）
- 圆角 `4/8/10/14/18/20`，关闭 superellipse
- 代码：fenced 卡 + 略深表头；行内代码是**无描边**的填充 chip
- 菜单不透明（去掉毛玻璃）、滚动条、文本选区、字体族与代码字体

唯一一条元素级规则是去掉行内代码的描边——因为那条描边是 **DSH 渲染器自己画的**
（`dsh-web-frontend` 里的 `._markdown_* :not(pre) > code`），其 class 在 markdown **容器**上而不在 `code` 上，
所以覆盖规则把权重加在祖先上：`html body [class] :not(pre) > code { border: 0 }`，权重 `(0,1,4) > (0,1,2)`。

## 二、轮次小横条：半屏下也要在

DSH 自带一条轮次轨道（`dsh-client-ui-chat` 的 `TurnNavigator`）：28px 宽、每个 mark 固定 10px 间距、
悬停弹出该轮的 prompt / response 摘要卡、点击跳转、跟随滚动。**但它被自己的容器查询藏了**：

```css
@container (width<=900px){ .xpvNua_frame{display:none} }
```

于是半屏窗口下整条轨道消失。本包在**同一个容器条件**里用更高权重把它放回来，并把横条调成 Codex 的几何
（默认短、悬停变长、当前轮最长最深；摘要卡收窄以免在窄栏里压住正文）：

```css
@container (width<=900px){ html body .xpvNua_frame{display:block;right:6px} }
```

两个实现细节：

- **类名不能硬编码**。`xpvNua` 是构建时生成的哈希，升级就会变。运行时从**宿主自己的样式表文本**里
  解析出前缀（`style[data-plugin-css*="TurnNavigator.module.css"]` → `\.([A-Za-z0-9_-]+)_frame`），
  再据此生成覆盖规则；宿主样式表还没进 head 时有界重试，取不到就**跳过**而不是瞎猜。
- **权重靠选择器而不是 `!important`**：`html body .xpvNua_frame` = `(0,1,2)` > 宿主的 `.xpvNua_frame` = `(0,1,0)`，
  所以不依赖样式表先后顺序。

## 三、选中回复 → 附加到下次对话

在回复里划选一段文字，会浮出一个小工具条（只有**在对话阅读区内**的选区才出现，输入框里的选区不会），
点「添加到对话」即把这段文字作为引用附加到下一条消息；输入框上方出现「1 条注释」气泡，
鼠标悬停（或键盘聚焦）展开显示**全文**，可单条移除。

**为什么是写进草稿而不是偷偷注入**：引用以 `> …` 引用块的形式**前置写入输入框草稿**，所以

- 气泡广告的就是真正会发出去的内容，不存在"显示 1 条、实际没带上"的错位；
- 气泡本身只是**草稿的只读视图**（`> ` 开头的前导块），所以撤销、刷新、手改草稿三者都不会与气泡不同步；
- 整个特性留在浏览器半边 —— 没有 Host 半边，改它不用重启 DSH。

要"引用不显示在输入框里"，就得上 Host 侧注入（`agent/pre-step` 或 `systemPrompt/assemble`），
那会让这个包带上 Host 逻辑并需要重启才生效；当前选择不做，保持这个包"刷新即生效"。

## 与计费 bundle 的关系

无依赖。本包不知道 `@local/dsh-cost-meter` 的存在，只改宿主令牌与自己的两个部件；计费条的颜色是它自己的色阶。
想单独用外观、或单独用计费都可以。

## 离线测试覆盖了什么

`tests/client-test.mjs` 在 Node 假宿主里真跑这个半边，其中与本包直接相关的钉子：

- 内嵌**真实的** `TurnNavigator.module.css` 文本作为 fixture：断言"藏轨道的确实是这条 `@container`"、
  前缀能被解析出来、覆盖规则落在同一个条件里且权重更高；
- 样式表里不能出现反引号（会截断模板字符串——踩过的坑）；
- 引用块的拼装 / 解析 / 移除是纯函数，逐例断言（多行、块内空行、非前导引用、越界移除）；
- 假 DOM 上驱动选区工具条：对话内选区抬起、输入框选区与单字选区不抬起、点击后草稿被正确前置。
