# Typst Online Editor

> 本项目Fork自[Mapaor/typst-online-editor](https://github.com/Mapaor/typst-online-editor/)
> 上游项目 [README](README.upstream.md)。

一个轻量的网页版 Typst 编辑器，通过 WebAssembly 在浏览器中直接编译文档。无需服务器，全部在客户端完成。

上游演示地址：[https://typst-online-editor.vercel.app](https://typst-online-editor.vercel.app)。

## 技术栈

基于 Preact + Vite 构建（包管理使用 pnpm），编辑器为 [CodeMirror 6](https://codemirror.net/)，语言智能来自 [Tinymist](https://github.com/Myriad-Dreamin/tinymist) 的 WASM 语言服务（LSP），编译与预览使用 [Typst.ts](https://github.com/Myriad-Dreamin/typst.ts)（[@myriaddreamin](https://github.com/Myriad-Dreamin) 开发的 Typst JavaScript 实现）与 PDF.js。

## 主要特性

- 借助 Typst.ts 实现全客户端编译（wasm 与编译字体随 [@myriaddreamin/typst-ts-web-compiler](https://www.npmjs.com/package/@myriaddreamin/typst-ts-web-compiler) 等包发布，运行时从 CDN 加载，`public/` 不再存放副本，编译需要联网）。
- CodeMirror 6 编辑器，语法高亮来自 `codemirror-lang-typst`（Lezer，无 WASM）；Tinymist WASM 语言服务（后台 Web Worker 运行，运行时从 CDN 加载）提供诊断、补全、悬停、定义跳转、重命名、格式化等能力，支持跨文件 `#import` 分析与 Typst Universe 包。
- 已知限制：Tinymist 语言服务的分析环境无法加载字体（wasm 构建内嵌了正文字体但没有数学字体），因此含公式的文档会报一条误报 “no font could be found”，编辑器会将其过滤；PDF 编译管线使用真实字体，不受影响。语言服务同样无法使用系统字体——其 wasm 完全不暴露字体接口（既不调用 `queryLocalFonts`，JS 胶水层也没有相关 API），所以文档引用系统字体时它会报 `unknown font family: …`；编辑器会按编译管线实际载入的字体名过滤掉这条误报，只保留真正缺失的字体告警。
- 已知限制：语言服务首次使用需从 CDN 下载约 12.8 MB 的 wasm；若下载失败，右上角显示「语言服务不可用」且不会自动重试——刷新页面即可恢复。语言服务与编译彼此独立，前者不可用时仍能正常编译并预览 PDF。
- 文件浏览器、自定义 PDF 预览、防抖编译（输入即编译）。编译失败时保留上一次成功的 PDF 并提示错误，只有新产物编译成功才会替换旧产物。
- 项目名可在侧栏直接修改；项目可导出为 zip（以项目名命名）、从 zip 导入；设置中可查看支持的 font family。
- 字体全部通过 Local Font Access API（`navigator.queryLocalFonts()`）读取系统已装字体（仅 Chromium 支持、需授权；其它浏览器可直接手写字体名）：界面字体与编辑器字体可在「设置」中指定（编辑器字体同时用于编译报错信息）；文档里 `#set text(font: "…")` 引用的系统字体也会被自动读入编译器，**只在编译期间驻留内存，编译一结束立即释放**。详见[字体设置](#字体设置)。
- 界面多语言（简体中文 / English / Deutsch），默认跟随浏览器语言，可手动切换并记忆。
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

设置分两类：应用自身的**界面 / 编辑器字体**（只影响 UI），以及**文档字体**（影响编译出的 PDF）。两类都通过 [Local Font Access API](https://developer.chrome.com/docs/capabilities/web-apis/local-fonts)（`navigator.queryLocalFonts()`）读取系统字体。该 API **仅 Chromium 系浏览器支持**且需要授权：首次调用必须由用户手势触发（因此做成按钮 / 复选框，不做自动加载）；拒绝授权或浏览器不支持时会给出提示，此时仍可手写字体名。`tsc` 所需的类型声明在 `src/types/local-fonts.d.ts`（TypeScript 7 的 `lib.dom` 尚未内置）。

### 界面字体与编辑器字体

「设置」→「字体」一节的两个输入框。留空即用默认字体栈；输入框可手写字体族名，也可先点「读取系统字体」枚举已装字体，再从候选（`<datalist>`）中选择。

- 选中的字体会额外用 `FontFace` + `document.fonts.add()` 注册一次：位于用户字体目录中的字体单靠 `font-family` 未必可见。注册失败（未授权、字体不存在）不算错误，直接回落到默认栈。
- 选择记入 `localStorage`（`typst-ui-font` / `typst-editor-font`），并写入 `<html>` 上的 CSS 变量 `--app-ui-font` / `--app-editor-font`；默认字体栈与 Tailwind 的 `font-editor` 工具类在 `src/styles/globals.css`，CodeMirror 主题（`src/components/CodeEditor/theme.ts`）读取同一变量。**编辑器字体同时用于编译报错信息**（`PdfPlaceholder.tsx` 的 `font-editor`）。
- 持久化发生在设置变更时，而不是组件挂载时：否则另一个标签页会用陈旧的空值覆盖已保存的选择。

### 文档字体（系统字体）

勾选「自动载入文档引用的系统字体」后，文档里 `#set text(font: "…")` 引用的字体族若在本机已安装，就会在该次编译时被读入编译器——**写什么就用什么，不需要先上传字体文件**。

- 内存策略：字体数据**只在编译期间存在**。主线程在每次编译前重新读取（不缓存字节），worker 用这些字节重建编译器，编译一结束就把只持有它们的编译器丢弃（`compilerPromise = null`）并清空引用，因此系统字体不会在会话里越积越多。每次编译都会重新读取一次；代价是需要引用系统字体时每次编译都要重建编译器。
- 字体以**原始字节**（`Uint8Array`）交给 `typst.ts` 的 `loadFonts()`，不经 base64 data URL，也不依赖扩展名或 MIME：`.ttf` / `.otf` / `.ttc`（字体集合，如 Windows 的 `msyh.ttc`）都能直接用，已实测。
- 识别方式是「`font:` 之后到右括号之间的字符串字面量 ∩ 已装字体族名」，不做完整 Typst 解析；因此文档里其它位置恰好等于某个字体名的字符串会被多载入一个字体，无副作用。族名需与该字体的内部族名一致（从枚举列表里选就不会错）。
- **语言服务（LSP）无法使用系统字体**：tinymist 的 wasm 不暴露任何字体接口（不调用 `queryLocalFonts`，JS 胶水层也没有相关 API），所以它仍会把文档里的系统字体报成 `unknown font family: …`。编辑器会按编译管线本次实际载入的字体名把这些误报过滤掉，只保留真正缺失的字体告警——也就是说，编辑器显示与你编译出的 PDF 保持一致。
- 未勾选该选项、或本机没有该字体时，文档照旧回落到 CDN / 上传字体，编译不受影响。

支持的 CDN 字体族名可在「设置」→「查看支持的 Font Family」中查看，同一处也会列出本机可用的系统字体族名。

### 读不到系统字体？

设置弹窗会直接说明**为什么**读不到（不再是一句笼统的「不支持」）：先在控制台执行 `typeof navigator.queryLocalFonts`，返回 `"undefined"` 就说明浏览器没有提供这个 API，再对照下表。

| 设置里的提示 | 原因 | 处理 |
|---|---|---|
| 浏览器没有提供 Local Font Access API | 只有桌面版 Chromium 实现：Chrome / Edge 103+；Firefox、Safari、手机浏览器（含 Chrome for Android）、应用内浏览器与 WebView 都没有 | 换桌面版 Chrome / Edge；不换浏览器的话，文档字体只能靠上传字体文件或 CDN 字体 |
| 不是安全上下文 | 页面用 `http://` 加非 localhost（例如局域网 IP）打开，浏览器根本不会暴露该 API | 用 `https://` 或 `http://localhost` 打开 |
| 来源是不透明 origin | 直接 `file://` 双击打开 HTML | `http://localhost`（`pnpm preview`）或 https |
| 被嵌入在 iframe 中 | 外层页面没允许 `local-fonts`（默认只允许同源） | 外层 iframe 加 `allow="local-fonts"` |
| 浏览器阻止了字体读取（SecurityError） | 权限策略、来源不被信任，或该调用不是由用户操作触发 | 用按钮 / 复选框触发（本就是用户手势）；检查站点的权限策略 |
| 系统字体访问被拒绝 | 在权限弹窗里点了「拒绝」 | 在地址栏站点设置里重新允许「字体」权限后重试 |

## 致谢

感谢 Myriad-Dreamin 创建 [typst.ts](https://github.com/Myriad-Dreamin/typst.ts)，感谢 [@cosformula](https://github.com/cosformula) 创建 [mdxport](https://github.com/cosformula/mdxport)（本演示的灵感来源），以及 Martin Haug 和 Laurenz Mädje 创建 [Typst](https://github.com/typst/typst)。

## 许可证

MIT 许可证。

本仓库代码采用 MIT 许可证，但所使用的库：

- @myriaddreamin/typst-ts-renderer
- @myriaddreamin/typst-ts-web-compiler
- @myriaddreamin/typst.ts
- pdfjs-dist

均采用 Apache-2.0 许可证。Typst.ts 使用的 Typst 编译器同样采用 Apache-2.0 许可证。

所用 Lucide 图标采用 MIT 许可证。
