# Typst Online Editor

> 本项目Fork自[Mapaor/typst-online-editor](https://github.com/Mapaor/typst-online-editor/)
> 上游项目 [README](README.upstream.md)。

一个轻量的网页版 Typst 编辑器，通过 WebAssembly 在浏览器中直接编译文档。无需服务器，全部在客户端完成。

上游演示地址：[https://typst-online-editor.vercel.app](https://typst-online-editor.vercel.app)。

## 技术栈

基于 Preact + Vite 构建（包管理使用 pnpm），编辑器为 [CodeMirror 6](https://codemirror.net/)，语言智能来自 [Tinymist](https://github.com/Myriad-Dreamin/tinymist) 的 WASM 语言服务（LSP），编译与预览使用 [Typst.ts](https://github.com/Myriad-Dreamin/typst.ts)（[@myriaddreamin](https://github.com/Myriad-Dreamin) 开发的 Typst JavaScript 实现）与 PDF.js。

## 主要特性

- 借助 Typst.ts 实现全客户端编译（wasm 与编译字体随 [@myriaddreamin/typst-ts-web-compiler](https://www.npmjs.com/package/@myriaddreamin/typst-ts-web-compiler) 等包发布，运行时从 CDN 加载，`public/` 不再存放副本，编译需要联网）。编译器 wasm 每个 Worker 只下载一次，之后切换字体集不再重新下载；连续输入时，被后续请求取代的编译任务会被直接跳过，不再重复编译。
- 预览使用 PDF.js，其 worker 从 CDN 镜像加载（`registry.npmmirror.com`，与安装的 `pdfjs-dist` 版本一致）；编译 wasm、字体与语言服务同样来自 CDN——**优先使用第三方 CDN 依赖**，不把它们打进包里。
- CodeMirror 6 编辑器，语法高亮来自 `codemirror-lang-typst`（Lezer，无 WASM）；Tinymist WASM 语言服务（后台 Web Worker 运行，运行时从 CDN 加载）提供诊断、补全、悬停、定义跳转、重命名、格式化等能力，支持跨文件 `#import` 分析与 Typst Universe 包。语言服务按增量方式同步文档，项目文件的新增 / 删除 / 改名会触发重新分析（不会被误当成整篇替换）。
- 已知限制：Tinymist 语言服务的分析环境无法加载字体（wasm 构建内嵌了正文字体但没有数学字体），因此含公式的文档会报一条误报 “no font could be found”，编辑器会将其过滤；PDF 编译管线使用真实字体，不受影响。
- 已知限制：语言服务首次使用需从 CDN 下载约 12.8 MB 的 wasm；若下载失败，右上角显示「语言服务不可用」且不会自动重试——刷新页面即可恢复。语言服务与编译彼此独立，前者不可用时仍能正常编译并预览 PDF。
- 文件浏览器、自定义 PDF 预览、防抖编译（输入即编译）。编译失败时保留上一次成功的 PDF 并提示错误，只有新产物编译成功才会替换旧产物。预览按需渲染（只画可见页 ±1），缩放下限 50%。
- 编辑内容按 400ms 节流写入 `localStorage`，并在页面隐藏 / 关闭前补写；浏览器拒绝写入（配额满、被策略禁用）时顶栏下方会出现黄色提示条，而不是静默丢失。项目记录读取前会校验结构，损坏的记录会被跳过（不会被静默覆盖）；渲染出错时显示可重载的兜底页面，而不是白屏。
- 项目名可在侧栏直接修改；项目可导出为 zip（以项目名命名）、从 zip 导入（压缩包超过 64 MB，或解压后超过 256 MB 会被拒绝；压缩 / 解压在后台线程进行，不会卡住界面）；设置中可查看支持的 font family。文件与文件夹名会校验：不能含 `/`、不能是 `.` / `..`、不能以点或空格开头 / 结尾。
- 界面字体与编辑器字体可在「设置」中指定（编辑器字体同时用于编译报错信息），候选字体通过 Local Font Access API（`window.queryLocalFonts()`）枚举系统已装字体（仅 Chromium 支持、需授权；其它浏览器可直接手写字体名）。**编译不读取本机字体**，文档字体请用随项目上传的字体文件或 CDN 字体。详见[字体设置](#字体设置)。
- 界面多语言（简体中文 / English / Deutsch），默认跟随浏览器语言，可手动切换并记忆。
- 可选 AI 助手（顶栏 ✨ 按钮）：用自然语言改写当前文件或选中片段，直连任意 OpenAI 兼容接口（URL / API Key 由用户自填、只存本地），内置一份精简版中文 Typst 提示词。接口地址必须是完整的 `http(s)://` 绝对地址（缺协议头会被拒绝，避免把 API Key 发到本站自己的源）；「停止」中断后已收到的部分回复仍可复制 / 应用；打开的是图片 / 字体等二进制文件时发送按钮会禁用并说明原因。详见 [AI 助手](#ai-助手)。
- 设置分页（通用 / 字体 / AI / 关于），内容区独立滚动：桌面端是居中卡片，移动端是整页。
- 桌面端布局默认对半分：文件栏最窄、编辑器占左半，预览与 AI 助手共用右半的同一块槽位（AI 助手只在点击时接管，宽度与预览完全一致）；移动端只有编辑器，文件 / 预览 / AI 各占一整页盖在其上，设置也是整页。拖出的栏宽与折叠状态会被记住；「设置 → 通用」可开启编辑器自动换行；全站滚动条统一样式。详见[界面布局](#界面布局)。
- 可移植。UI 未必与框架无关，但编译逻辑是通用的。更精简的版本见 [simple-typst-editor](https://github.com/Mapaor4/simple-typst-editor)，另有 Vite 精简版 [typst-online-vite](https://github.com/Mapaor/typst-online-vite)。

## 使用与部署

本地开发先安装依赖（仅使用 pnpm）：

```
pnpm install
```

然后启动开发服务器：

```
pnpm dev
```

打开终端输出的 localhost 地址即可。

生产构建：

```
pnpm build
```

产物在 `dist` 文件夹，本地预览用 `pnpm preview`。部署到 Vercel 时选择 Vite 预设（会自动识别本仓库），构建命令 `pnpm build`、输出目录 `dist`。

<details>

<summary>部署为静态站点（如 GitHub Pages）</summary>

Vite 的构建产物本身就是纯静态的 HTML+CSS+JS，无需修改任何配置文件：

1. 运行 `pnpm build`，生成的 `dist` 文件夹即为完整站点
2. 若部署到子路径（例如 GitHub Pages 的项目页），构建时指定 base：

  ```
  pnpm build -- --base=/typst-online-editor-static/ # 换成你的静态仓库名
  ```

3. 发布 `dist` 文件夹内容（不是文件夹本身）到目标站点
4. 在发布目录添加一个空的 `.nojekyll` 文件
5. 访问站点确认可用

静态站点示例：

[https://mapaor.github.io/typst-online-editor-static/](https://mapaor.github.io/typst-online-editor-static/)

</details>

## 界面布局

桌面端（窗口宽度 > 768px）从左到右：文件栏 → 编辑器 → 预览 / AI 助手。

- **默认对半**：文件栏（默认 200px，即最窄宽度，可拖到 600px）与编辑器占据窗口左半；右半是一块固定的槽位，默认属于预览。
- **预览与 AI 助手共用同一槽位**：顶栏 ✨ 打开 AI 助手时，它占据预览的那块区域、宽度与预览完全相同（预览不销毁、只是隐藏，页码与缩放都保留），关闭后预览原样回来。
- **窗口窄于 768px：只有编辑器**。文件、预览、AI 助手不再是编辑器旁边的栏，而是各自成为一整页：从顶栏右侧的按钮进入，页面覆盖整个屏幕（含顶栏），每页自带标题栏与关闭按钮，同一时刻只开一页，默认全部关闭，选择文件后自动回到编辑器。「设置」同样是整页，而不是居中的卡片。
- **上下不留白**：整页 `fixed inset-0` 能盖住手机的安全区，普通流的编辑器页盖不到，于是 `html` / `body` 也铺上同一深色（`--app-bg`）+ `color-scheme: dark`，`index.html` 另加 `theme-color`，安全区与回弹时露出的都是深色画布而不是白底。
- **窄于 1280px 但宽于 768px**：AI 助手改为覆盖整个工作区（文件栏与编辑器仍并排）。
- **记住你的调整**：拖动栏宽、折叠文件栏 / 预览、开关 AI 助手都会写入 `localStorage`（键 `typst-layout`，一条 JSON 记录），刷新或下次打开时按上次的样子恢复；清除站点数据即回到上述预设。移动端那些页面是临时的，不写入存储（记住的是桌面端的排布）。拖动不会越过下限：编辑器 300px、预览 440px、AI 助手停靠时 320px。
- **分隔条也能用键盘调整**：Tab 到两条分隔条（`role="separator"`，会读出当前宽度），← / → 每次 16px，Home / End 到底。拖动使用 pointer capture，指针在窗口外松开也不会再出现「卡住」的遮罩。

编辑器可在「设置 → 通用」开启**自动换行**（长行按编辑器宽度折行；默认关闭，与 CodeMirror 默认的横向滚动一致），选择记入 `localStorage`（键 `typst-editor-word-wrap`）。全站滚动条统一为细圆角深色样式，编辑器、文件树、预览与设置弹窗外观一致。

## 界面语言（i18n）

界面文案已国际化，首批支持简体中文、英语、德语。语言在「设置」弹窗（右上角齿轮）中切换，可选「跟随系统」或指定语言，选择记入 `localStorage`（键 `typst-lang`），默认「跟随系统」。弹窗的「关于」一节显示版本号（取自 `package.json` 的 `version`）。

- 消息目录在 `src/lib/i18n/messages.ts`：`en` 为基础目录，它的键即 `MessageKey`，其它语言的目录类型为 `Messages`，缺少或拼错任何键都会让 `tsc` 失败。
- 接口在 `src/lib/i18n/i18n.ts`（`I18n`：`lang` / `langSetting` / `t()` / `setLangSetting()`）。`t('files.count', { count })` 会填充 `{placeholder}` 占位符；当 `vars.count` 是数字时，按 `Intl.PluralRules` 选取 `<key>_<plural category>` 变体（如 `files.count_one`），该语言没有变体则回落到基础键。
- 组件里用 `useI18n()` 取用，必须位于 `I18nProvider` 之下（`src/main.tsx` 已挂载）。

新增语言的步骤：

1. 在 `src/lib/i18n/messages.ts` 新增一个目录（照 `en` 逐键翻译，`tsc` 会校验完整性）。
2. 在 `src/lib/i18n/i18n.ts` 的 `LANGS` 中加入语言码，并在 `LANG_LABELS` 中加入该语言的自称（如 `fr: 'Français'`，切换器里刻意不翻译）。
3. 该语言有复数之分就补 `<key>_one` 等变体键；无复数变化的语言（如中文）与基础键保持一致即可。

## 字体设置

「设置」→「字体」设置的是应用自身的**界面 / 编辑器字体**（只影响 UI，不影响编译出的 PDF）。候选字体通过 [Local Font Access API](https://developer.chrome.com/docs/capabilities/web-apis/local-fonts)（`window.queryLocalFonts()`）枚举系统已装字体。该 API **仅 Chromium 系浏览器支持**且需要授权：首次授权要由用户手势触发（设置里的「读取系统字体」按钮负责这一点）。拒绝授权或浏览器不支持时仍可手写字体名。`tsc` 所需的类型声明在 `src/types/local-fonts.d.ts`（TypeScript 7 的 `lib.dom` 尚未内置）。**编译不读取本机字体**：文档里 `#set text(font: "…")` 只能用 CDN 字体或随项目上传的字体文件。

### 界面字体与编辑器字体

「设置」→「字体」一节的两个输入框。留空即用默认字体栈；输入框可手写字体族名，也可先点「读取系统字体」枚举已装字体，再从候选（`<datalist>`）中选择。

- 选中的字体会额外用 `FontFace` + `document.fonts.add()` 注册一次：位于用户字体目录中的字体单靠 `font-family` 未必可见。注册失败（未授权、字体不存在）不算错误，直接回落到默认栈。
- 界面 / 编辑器字体不会为了渲染而重读字体文件：如果 CSS 本来就能用该字体（装在系统里的都算），只设置 `font-family`，不注册 `FontFace`；只有用户字体目录里 CSS 看不到的才注册，并且**替换掉旧的注册**（一个字体文件动辄几十 MB，切换字体不能无限累积）。字体加载有 5 秒超时，读不出的字体（损坏 / 空文件 / 超时）会在输入框下方给出明确提示并回落到默认字体。
- 选择记入 `localStorage`（`typst-ui-font` / `typst-editor-font`），并写入 `<html>` 上的 CSS 变量 `--app-ui-font` / `--app-editor-font`；默认字体栈与 Tailwind 的 `font-editor` 工具类在 `src/styles/globals.css`，CodeMirror 主题（`src/components/CodeEditor/theme.ts`）读取同一变量。**编辑器字体同时用于编译报错信息**（`PdfPlaceholder.tsx` 的 `font-editor`）。
- 持久化发生在设置变更时，而不是组件挂载时：否则另一个标签页会用陈旧的空值覆盖已保存的选择。

支持的 CDN 字体族名可在「设置」→「查看支持的 Font Family」中查看。

### 读不到系统字体？

设置弹窗会直接说明**为什么**读不到（不再是一句笼统的「不支持」）：先在控制台执行 `typeof window.queryLocalFonts`，返回 `"undefined"` 就说明浏览器没有提供这个 API，再对照下表。

| 设置里的提示 | 原因 | 处理 |
|---|---|---|
| 浏览器没有提供 Local Font Access API | 桌面版 Chromium 之外都没有实现：Firefox、Safari 均无；Chrome / Edge 103+ 桌面版才有 | 换桌面版 Chrome / Edge；不换浏览器的话可直接手写字体名（回落默认字体栈） |
| 手机 / 平板浏览器没有实现 | 移动端从未实现（Chrome for Android、Edge for Android、三星浏览器都无） | 在电脑上用桌面版 Chrome / Edge |
| iOS / iPadOS 上都是 WebKit | iPhone / iPad 上的 Chrome、Edge、Firefox 都是 WebKit 内核 | 在电脑上用桌面版 Chrome / Edge |
| 运行在应用内浏览器 / WebView | 微信、飞书、钉钉、QQ 等内置浏览器，Electron 应用，IDE 内置预览 | 用独立的桌面版 Chrome / Edge 打开 |
| 检测到桌面版 Chromium 但没有该 API | 版本低于 103、启动参数 / 企业策略禁用，或 Brave、Vivaldi、360、QQ 浏览器等派生浏览器移除 / 改写了 API（UA 与 Chrome 几乎一致） | 看 `chrome://version` 的版本与「命令行」里是否有 `--disable-features`；用官方 Chrome / Edge 打开同一地址对比 |
| 不是安全上下文 | 页面用 `http://` 加非 localhost（例如局域网 IP）打开，浏览器根本不会暴露该 API | 用 `https://` 或 `http://localhost` 打开 |
| 来源是不透明 origin | 直接 `file://` 双击打开 HTML | `http://localhost`（`pnpm preview`）或 https |
| 被嵌入在 iframe 中 | 外层页面没允许 `local-fonts`（默认只允许同源） | 外层 iframe 加 `allow="local-fonts"` |
| 浏览器阻止了字体读取（SecurityError） | 权限策略、来源不被信任，或该调用不是由用户操作触发 | 用「读取系统字体」按钮触发（本就是用户手势）；检查站点的权限策略 |
| 系统字体访问被拒绝 | 在权限弹窗里点了「拒绝」 | 在地址栏站点设置里重新允许「字体」权限后重试 |

如果提示与你的情况对不上，把控制台里这段的输出发出来即可定位：

```js
({ api: typeof window.queryLocalFonts, ua: navigator.userAgent,
   mobile: navigator.userAgentData?.mobile, secure: window.isSecureContext,
   origin: location.origin, iframe: window.self !== window.top })
```

## AI 助手

编辑器内置一个可选的 AI 助手（顶栏的 ✨ 按钮），按自然语言要求改写当前文件或选中的片段。不配置就不启用，不影响任何其它功能。

- **只支持 OpenAI 格式**：请求 `POST {你填的地址}/chat/completions`，头 `Authorization: Bearer <API Key>`，体 `{ model, messages, stream: true }`。OpenAI、DeepSeek、Moonshot、Ollama、LM Studio、vLLM 等兼容端点都能用；**不支持 Anthropic 等其它格式**。
- **浏览器直连、无后端**：本项目没有服务器，请求由浏览器直接发往你配置的地址，因此该地址必须允许跨域（CORS）——本地服务（Ollama / LM Studio 等）需要显式开启 CORS。
- **配置只存在本地**：接口地址、API Key、模型名、系统提示词都存在 `localStorage`（键 `typst-ai-settings`），API Key 只在请求你填写的那个接口时作为 `Authorization` 头发送，不会上传到本项目或任何第三方。「设置 → AI」的 🔑 输入框右侧有「清除密钥」按钮（一键忘掉已保存的 Key）。
- **地址必须带协议头**：填写 `api.openai.com/v1` 这类缺少 `http://` / `https://` 的值会被直接拒绝（浏览器会把相对地址解析到本站，那等于把 API Key 交给托管本应用的服务器）；`http://` 明文地址可用，但请只在本地服务上使用。
- **先看后写**：回复流式显示在面板里，点「应用」才写入文档（也可以只复制）。改写范围可选「选中片段」或「整个文件」，应用时按**发送时**的范围精确替换；若期间切换了文件，应用按钮会禁用并提示，避免改错文件；若选中的文字在等待回复期间被改动，应用会被拒绝并提示（不会把回复糊到无关位置）。点「停止」中断后，已经收到的部分回复仍然保留、可复制 / 可应用。当前文件是图片 / 字体等二进制资源时，发送按钮会禁用并说明原因（避免把整份 base64 当提示词发出去）。
- **内置精简版中文 Typst 提示词**：默认系统提示词精简自 [Gakusyun/typst-author-chinese](https://github.com/Gakusyun/typst-author-chinese)（面向中文排版的 Typst skill），并按本编辑器的环境改写：
  - 只用随编辑器加载的字体（`Noto Sans CJK SC`、`Libertinus Serif`、`New Computer Modern`、`New Computer Modern Math`、`DejaVu Sans Mono`、`IBM Plex Sans`、`Noto Color Emoji`）与项目里上传的字体文件；**禁止写 SimSun / 黑体 / 楷体 / 仿宋 / Times New Roman 等本机字体名**（浏览器内的编译器没有它们）。
  - 中文排版要点：`lang: "zh"`、`first-line-indent: (amount: 2em, all: true)`、两端对齐、按中文字号取磅值、A4 边距建议等。
  - 环境限制：没有 `typst` 命令行，不要输出 CLI 命令；可用 Typst Universe 包（需联网）。
  - 提示词可在「设置 → AI」里直接编辑；改回默认内容即继续跟随内置版本（内置版更新后自动生效）。
- 交互：`Ctrl/Cmd + Enter` 发送、「停止」中断流式输出、🗑 清空对话。

### 配置

「设置 → AI」共四项：

| 字段 | 说明 |
|---|---|
| 接口地址（Base URL） | 基址（如 `https://api.openai.com/v1`，会自动补 `/chat/completions`）或完整的 `…/chat/completions` 地址；裸主机名会补 `/v1/chat/completions`。必须是绝对地址（含 `http://` / `https://`），否则请求会被拒绝 |
| API Key | 仅本地保存；不需要鉴权的本地服务可留空 |
| 模型 | 该接口接受的模型名，如 `gpt-4o-mini`、`deepseek-chat` |
| 系统提示词 | 默认即内置的精简版中文 Typst 提示词，可编辑或一键恢复默认 |

## 设置弹窗

「设置」（右上角齿轮）分四页，左侧页签切换，右侧内容区独立滚动：

| 页签 | 内容 |
|---|---|
| 通用 | 界面语言（跟随系统 / 简体中文 / English / Deutsch） |
| 字体 | 界面字体、编辑器字体、读取系统字体、查看编译支持的 Font Family |
| AI | AI 助手的接口地址、API Key、模型、系统提示词 |
| 关于 | 版本号 |

## 致谢

感谢 Myriad-Dreamin 创建 [typst.ts](https://github.com/Myriad-Dreamin/typst.ts)，感谢 [@cosformula](https://github.com/cosformula) 创建 [mdxport](https://github.com/cosformula/mdxport)（本演示的灵感来源），以及 Martin Haug 和 Laurenz Mädje 创建 [Typst](https://github.com/typst/typst)。

## 许可证

MIT 许可证。

本仓库代码采用 MIT 许可证，但所使用的库：

- @myriaddreamin/typst.ts
- @myriaddreamin/typst-ts-web-compiler
- pdfjs-dist

均采用 Apache-2.0 许可证。Typst.ts 使用的 Typst 编译器同样采用 Apache-2.0 许可证。

所用 Lucide 图标采用 MIT 许可证。
