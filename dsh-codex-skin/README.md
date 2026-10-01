# @local/dsh-codex-skin

DSH Web 客户端的**外观层**：一个 bundle、一个 Loader 行、零依赖、无构建。

- Host 半边 `index.js`：**空的 `apply`**（纯客户端 bundle 需要一个可被 Row 导入的 Host 模块，仅此而已）。
- 浏览器半边 `client.js`：注入**一张**插件自有样式表（`<style data-plugin="…">`，随插件 fiber 一起移除）。

## 它改了什么

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

## 与计费 bundle 的关系

无依赖。本包不知道 `@local/dsh-cost-meter` 的存在，只改宿主令牌；计费条的颜色是它自己的色阶。
想单独用外观、或单独用计费都可以。
