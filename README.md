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
- 已知限制：Tinymist 语言服务的分析环境无法加载字体（wasm 构建内嵌了正文字体但没有数学字体），因此含公式的文档会报一条误报 “no font could be found”，编辑器会将其过滤；PDF 编译管线使用真实字体，不受影响。
- 已知限制：语言服务首次使用需从 CDN 下载约 12.8 MB 的 wasm；若下载失败，右上角显示「语言服务不可用」且不会自动重试——刷新页面即可恢复。语言服务与编译彼此独立，前者不可用时仍能正常编译并预览 PDF。
- 文件浏览器、自定义 PDF 预览、防抖编译（输入即编译）。编译失败时保留上一次成功的 PDF 并提示错误，只有新产物编译成功才会替换旧产物。
- 项目名可在侧栏直接修改；项目可导出为 zip（以项目名命名）、从 zip 导入；设置中可查看支持的 font family。
- 界面字体与编辑器字体可在「设置」中指定，字体列表通过 Local Font Access API（`navigator.queryLocalFonts()`）直接读取系统已安装字体（仅 Chromium 支持，需授权；其它浏览器可直接手写字体名）。编辑器字体同时用于编译报错信息；该设置只影响应用自身的界面与编辑器，不影响编译 PDF 所用字体。详见[字体设置](#字体设置界面--编辑器)。
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

## 字体设置（界面 / 编辑器）

「设置」弹窗的「字体」一节有两个输入框：**界面字体**（应用自身的 UI）与**编辑器字体**（代码、补全弹窗，以及编译报错信息）。留空即使用默认字体栈，输入框内可直接手写字体族名，也可以点「读取系统字体」枚举系统已安装字体后从候选列表中选择。

- **读取系统字体**走 [Local Font Access API](https://developer.chrome.com/docs/capabilities/web-apis/local-fonts)（`navigator.queryLocalFonts()`）。该 API 目前**仅 Chromium 系浏览器支持**，且需要用户授权：首次调用必须由用户手势触发（因此做成按钮而不是自动加载），拒绝授权或浏览器不支持时会给出相应提示，此时仍可手写字体名。`tsc` 所需的类型声明在 `src/types/local-fonts.d.ts`（TypeScript 7 的 `lib.dom` 尚未内置）。
- 选中的字体会额外用 `FontFace` + `document.fonts.add()` 注册一次：位于用户字体目录中的字体单靠 `font-family` 未必可见。注册失败（未授权、字体不存在）不算错误，直接回落到默认栈。
- 选择记入 `localStorage`（`typst-ui-font` / `typst-editor-font`），并写入 `<html>` 上的 CSS 变量 `--app-ui-font` / `--app-editor-font`；默认字体栈与 Tailwind 的 `font-editor` 工具类定义在 `src/styles/globals.css`，CodeMirror 主题（`src/components/CodeEditor/theme.ts`）读取同一变量。持久化发生在设置项变更时，而不是组件挂载时，避免另一个标签页用陈旧的空值覆盖已保存的选择。
- 该设置**不影响编译**：Typst 编译器使用的字体仍来自 CDN 与用户上传的字体文件，浏览器也无法把系统字体交给 WASM 编译器。想在文档里使用某个系统字体，请上传该字体文件，或使用[支持的 font family](#主要特性)（`#set text(font: "…")`）。

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
