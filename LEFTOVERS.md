# 遗留事项（交由新 session 处理）

> **本文件是交接件：下面的「待办」全部完成（或明确判定不做并记录理由）后，请删除本文件。**
> 仓库当前状态：`pnpm exec tsc --noEmit` 0 error、`pnpm lint` 0 warning、`pnpm build` 通过；全部改动已按主题分批提交。架构与既有约定见 `AGENTS.md`（英文），用户文档见 `README.md`（简体中文）。改代码前先读 `AGENTS.md`。

## 背景

上一轮修复覆盖了全部审查发现（P0 正确性 / P1 稳定性与凭据 / P2 性能内存 / P3 无障碍与清理），并在真实浏览器里逐项实测。下面是**仍然存在、但不属于那批修复范围**的事项：一部分是被第三方 API 限制住的，一部分是可选增强，一部分是明确决策后保留的取舍。

约束（与仓库一致）：**优先使用第三方 CDN 依赖**（编译 wasm / 字体 / Tinymist / pdf.js worker 均从 CDN 加载，不打进包里）；不新增测试框架；保持现有代码风格（Tab、无分号、单引号、英文注释、`import type`）。

---

## 待办

### 1. 换字体时重建编译器，旧实例只能等 GC
- **现状**：`src/lib/typst/typst.worker.ts` 里字体集一变（首现 emoji / CJK、新增或删除项目 `.ttf/.otf`）就 `createCompilerWithFonts(...)` 重建整个编译器；typst.ts 的 `TypstCompilerDriver` 只有 `reset()`，没有 `free()`/`dispose()`，被替换的实例只能靠回收，wasm 线性内存不主动释放。
- **要做什么**：研究 typst.ts 的 `createTypstFontBuilder()` + `TypstCompiler.setFonts(resolver)` 路线，把「换字体 = 重建编译器」改成「热更新字体解析器」；若上游不支持（`build(cb)` 会释放 resolver，需要确认能否常驻），就给 typst.ts 提 issue / PR，或在 worker 内用 `reset()` + 重新加载的方式显式降内存。
- **验收**：切到含 emoji / CJK 的文档、增删项目字体时，不再产生新的 wasm 实例；旧实例被显式释放（可用 `performance.memory` 或 DevTools 内存快照对比）。

### 2. 语言服务启动失败后没有重试入口
- **现状**：`loadTinymistModule()` 的 memo 已不再缓存拒绝（可以重试），但 `tinymistClient` 一收到 `status: 'error'` 就 terminate 掉 worker，而 `CodeEditor` 只在挂载时建一次客户端——结果仍是「刷新页面才恢复」。请求不会再挂 60 秒（transport 会抛），但体验是死的。
- **要做什么**：在 `editor.lspUnavailable` 旁加一个「重试」动作（重建 `TinymistLspClient` + worker，或抽一个可重启的 LSP 宿主），失败原因（`statusDetail`）也要显示出来。
- **验收**：断网 → 右上角显示不可用 + 原因 → 恢复网络 → 点重试 → 诊断、补全、跳转恢复，无需刷新。

### 3. 页码跳转是瞬时的（平滑滚动被刻意去掉）
- **现状**：`src/components/PDFViewer/hooks/usePdfRenderer.ts` 里按钮跳页用 `scrollIntoView({block:'start'})` 立即到位。原因：平滑动画会让页码观察器逐页报告，把页码与「可见页 ±1」渲染窗口拉回去，产生竞态。
- **要做什么**（可选）：想要平滑滚动的话，用 `scrollend` 事件（或按动画时长）在跳转期间静默观察器，结束后再恢复；同时保持 `pendingScrollRef` 的单一归属。
- **验收**：点「上一页 / 下一页」平滑滚动到位，页码只在落定后变一次，渲染窗口不来回抖。

### 4. `Promise.withResolvers` 的浏览器下限
- **现状**：`typstClient.ts`、`projectWorkspace.ts`、`projectZip.ts` 共 4 处用 `Promise.withResolvers`（Chrome 119+ / Safari 17.4+ / Firefox 121+）。`vite.config.ts` 的 `build.target: 'baseline-widely-available'` 与此大体一致，但没有显式验证过。
- **要做什么**：确认目标浏览器矩阵；若要更宽的兼容，替换成 `new Promise` 工厂（或极小的 polyfill），并在 `AGENTS.md` 记录下限。
- **验收**：在目标浏览器里「编译、导入项目、定义跳转」三条路径都不抛 `TypeError`。

### 5. 缺失文件诊断的路径回溯仍是启发式
- **现状**：`src/lib/lsp/tinymist.worker.ts` 的 `referencedPath()` 从诊断 range 切出源码、取第一个引号字面量，再与项目文件列表比对来决定是否屏蔽 `failed to load file (...)`。range 覆盖多个字面量时可能取错；镜像文本已修好（增量同步），这条链的准确性仍依赖它。
- **要做什么**：改用诊断自带的 `relatedInformation` / `data`（若 tinymist 提供），或用 Typst 源码结构定位 `#include`/`#import` 的字面量参数；至少在切片为空/越界时保持「不屏蔽」的方向。
- **验收**：`#include("a.typ", "b.typ")` 这类多字面量调用里，只有真实存在项目中的路径会被屏蔽；伪造的失败不会被误吞。

### 6. 项目管理 UI 缺口（可选增强）
- **现状**：`ProjectStorage` 只有 `save`/`load`/`list`/`createNew`（`delete()`、`getStorageSize()` 已作为死代码删除）。没有项目列表 / 切换 / 删除 UI；多个项目会在 `typst-projects-list` 里累积，只有最新那个会被打开。配额告警也只在写失败后提示。
- **要做什么**：做一个最小项目菜单（列出 `list()`、切换、删除、导入）；若要提前预警配额，重新实现按**字节**计量的占用统计（原来的 `getStorageSize` 数的是 UTF-16 code unit，阈值是错的）。
- **验收**：用户能看到并删掉旧项目，`localStorage` 占用可见；删除后列表与 payload 都消失。

### 7. 构建：codemirror vendor chunk 仍 >500 KB
- **现状**：`vite.config.ts` 把 `chunkSizeWarningLimit` 固定在 500 KB（有意保留「变大要看得见」），codemirror 供应商块 800 KB（gzip 262 KB）因此每次构建都打印提示。入口已拆（app 149 KB / vendor 43 KB / pdfjs 432 KB / codemirror 800 KB），都有 sourcemap。
- **要做什么**（可选）：进一步拆 codemirror（按包分组）或把它延后到首帧之后（注意 `CodeEditor` 首屏就需要它，只能拆「补全/搜索/语言」这类可延后部分）；或者把阈值调到「codemirror 的自然体积 + 余量」，但要保住告警意图。
- **验收**：`pnpm build` 无 chunk 告警，或告警只在真的膨胀时出现；首屏 JS 体积不增加。

### 8. pdf.js worker 走 CDN 的取舍（已决策，仅在需要硬化时再动）
- **现状**：按「优先 CDN」的决策，worker 从 `registry.npmmirror.com` 加载（`src/lib/pdf/pdfjs.ts`）。已知取舍写在该文件注释里：pdf.js 会把跨域 `workerSrc` 包成 blob 模块 worker（`await import(<cdn url>)`），而 blob worker **以本页 origin 运行**，因此镜像的代码可读 `localStorage`（含 AI bearer token）。AI 接口地址已强制绝对 http(s) URL，AI key 有「清除密钥」按钮，这已削掉一部分暴露面。
- **要做什么**（可选）：若要彻底消除，自托管 worker（`new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url)`，`pdfjs-dist` 已是依赖），并把这条决策同步回 `AGENTS.md`/`README.md`（两处描述都要改）。
- **验收**：worker 与页面同源；`dist` 里出现该资产；文档描述一致。

### 9. AI key 的存储位置（可选加固）
- **现状**：API Key 存 `localStorage`（键 `typst-ai-settings`），明文；「设置 → AI」有清除按钮。
- **要做什么**（可选）：改为内存 + 每次会话输入，或用 Web Crypto 以口令派生密钥加密后落盘；无论哪种都要保留「忘记密钥」，并更新 `README.md` 的 AI 章节。
- **验收**：刷新后不会把明文 key 暴露给任何脚本（或明确告知用户取舍）。

### 10. pdf.js worker 加载失败时，预览是静默的（已实测）
- **现状**：worker 从 CDN 加载失败（断网、镜像挂了、被拦截）时，pdf.js 退回 fake worker 并再次失败，画布停在未渲染状态（300×150），页面上**没有任何提示**——只在控制台留一句 `Setting up fake worker failed: "Failed to fetch dynamically imported module: https://registry.npmmirror.com/pdfjs-dist/<ver>/files/build/pdf.worker.min.mjs"`。`usePdfRenderer` 的 `loadError` 只覆盖 `getDocument()` 的失败，不覆盖 worker 起不来这一层。
- **要做什么**：把 pdf.js worker 初始化失败也送进现有的错误通道（`PdfPlaceholder` 的 `errorMsg ?? loadError`），文案走 i18n（例如「预览引擎加载失败：请检查网络 / CDN 是否可达」）；`pdfjs.ts` 的 `getPdfjs()` 可以把 worker 创建失败包装成可识别的错误类型。
- **验收**：拦截 `**/*pdf.worker*`（或断网）后刷新，预览区显示可读的错误与重试建议，而不是空白页；恢复网络后重新编译能正常渲染。
- **实测方法**（可复现）：`playwright-cli route "**/*pdf.worker*" --status=404` → 刷新 → 观察预览区与 `document.body.innerText`。

---

## 已决策 / 已知限制（不必改，供新 session 参考）

- **LSP nudge 用 `didClose` + `didOpen`**（`tinymist.worker.ts` 的 `nudgeUserDocsSoon`）：不发 `didChange`，因为 LSP 要求版本严格递增，而镜像刻意存客户端的版本号，自造版本会让双方计数漂移。已在浏览器实测：>1024 字符文档 + 项目文件增删后诊断仍正确。tinymist 对版本的严格程度未在源码层完全确认（[inference]），若未来诊断消失先查这里。
- **被替换的编译器实例无法释放**：见待办 1，属于上游 API 缺口。
- **typst.ts 只在编译失败时给 diagnostics**：成功编译会丢弃警告，因此「成功但有警告」无法在 UI 上呈现（协议里只保留失败分支的 `diagnostics`）。需要上游 API 才能解决。
- **依赖锁定**：`@myriaddreamin/*` 精确锁版本（`package.json`），`typst.worker.ts` 的 wasm URL 手写同一版本——升级必须同时改两处，否则运行期报 `wasm.__wasm_bindgen_func_elem_N is not a function`。CDN 钉版清单见 `AGENTS.md` 的 Known Quirks（含 `noto-cjk@Sans2.004`、`noto-emoji@v2.047`、`shiki-tinymist@0.1.0`）。
- **pdf.js worker 走 CDN**（已决策并已实测）：happy path 渲染正常（canvas 586）；拦截 `**/*pdf.worker*` 后渲染不发生（canvas 停在 300），控制台报 `Failed to fetch dynamically imported module: …registry.npmmirror.com/…pdf.worker.min.mjs` —— 证明 CDN 就是实际代码路径（worker 发起的 fetch 不出现在页面的 resource timeline 里，所以别用 `performance.getEntriesByType('resource')` 判断）。副作用见待办 10：该失败目前在 UI 上是静默的。
- **`FileExplorer` 的 `onFilesCreate` 是可选 prop**：不传时回退到逐个 `onFileCreate`（仍然写 N 次）；`TypstEditor` 两处调用点都已接线。
- **构建告警**：`wasm-pack-shim` 的 deprecated parameters 控制台警告来自 typst.ts 自身，无法在本仓库消除。

## 完成方式

按上面的待办逐条处理（每条都写了「验收」）。全部处理完后：

```bash
pnpm exec tsc --noEmit && pnpm lint && pnpm build
```

保持全绿，然后**删除本文件**（`LEFTOVERS.md`），并在 `AGENTS.md` 里同步任何被改变的事实（尤其是 pdf.js worker 的加载方式、字体/编译器生命周期、浏览器下限）。