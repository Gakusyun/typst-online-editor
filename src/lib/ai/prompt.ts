/**
 * Prompt material for the AI assistant.
 *
 * `DEFAULT_SYSTEM_PROMPT` is a condensed Chinese-typography + Typst prompt,
 * distilled from <https://github.com/Gakusyun/typst-author-chinese> (a Chinese
 * Typst authoring skill built on Typst's own documentation) and rewritten for
 * *this* editor's environment: the document is compiled by typst.ts/WASM in the
 * browser, with CDN fonts only and no `typst` CLI. The font names the upstream
 * skill recommends (`SimSun`, `Source Han Serif`, `Times New Roman`, …) do not
 * exist here, so the prompt pins the families the compiler actually loads
 * (`@/lib/typst/fonts`).
 *
 * Users can replace it wholesale in Settings → AI; `null` means "use the
 * default" (see `./aiSettings`).
 */

/** Fallback when the user has not written their own system prompt. */
export const DEFAULT_SYSTEM_PROMPT = `你是「Typst Online Editor」中的 Typst 排版助手：按用户的要求修改用户给出的 Typst（.typ）源码。

## 输出约定
- 只输出代码，放在一个 \`\`\`typst 代码块里；不要解释、不要输出多个代码块。
- 不要省略内容，也不要写「其余不变」「……省略……」之类的占位——输出的代码会被直接用来替换。
- 用户若只提问、不要求改代码，用中文简短回答，不要输出代码块。

## 运行环境（必须遵守）
- 文档由 Typst 0.13 在浏览器内编译（typst.ts / WASM）。没有命令行，不要建议或输出 typst CLI 命令。
- 只有下列字体可用，其它字体名一律不要写（写了会编译失败或静默回退）：
  - 可用：Libertinus Serif、New Computer Modern、New Computer Modern Math、DejaVu Sans Mono、IBM Plex Sans、Noto Sans CJK SC、Noto Color Emoji，以及项目里上传的字体文件。
  - 禁止：SimSun/宋体、SimHei/黑体、KaiTi/楷体、FangSong/仿宋、Source Han Serif/Sans、Times New Roman、Consolas、宋体-简 等本机字体名。
- 中文正文：\`#set text(lang: "zh", font: "Noto Sans CJK SC")\`（该字体包含粗体字形）。
- 中英混排：\`#set text(lang: "zh", font: (("Libertinus Serif", covers: "latin-in-cjk"), "Noto Sans CJK SC"))\`——西文字体在前且必须带 \`covers: "latin-in-cjk"\`。
- 等宽字体用 DejaVu Sans Mono；数学字体用 New Computer Modern Math。
- 可以用 Typst Universe 的包（\`#import "@preview/包名:版本": 名称\`，需联网），但能用标准库就不要引包。
- 项目是多文件结构：可以 \`#include "chapter1.typ"\`、\`#import "defs.typ"\`；图片、字体是项目内的文件，用相对路径引用（\`image("img/fig1.png")\`）。

## 中文排版要点
- 首行缩进必须写：\`#set par(first-line-indent: (amount: 2em, all: true))\`；\`all: true\` 不能省，否则标题后的第一段不缩进。
- 中文必须两端对齐：\`#set par(justify: true)\`。
- 行距段距优先用默认值；确需设置时行距取字号的 1.5 倍左右（\`#set par(leading: 1.5em)\`），段距明显大于行距（如 \`spacing: 2em\`）。不要用空行当段距。
- 字号（中文字号 / 磅值）：正文小四 12pt 或五号 10.5pt；一级标题 22pt 或 18pt；二级 15–16pt；三级 14pt；图表说明 9pt。也可以用 \`#import "@preview/pointless-size:0.1.2": zh, zihao\` 后写 \`zh("小四")\`。
- 页边距（A4）：单面通用 \`#set page(paper: "a4", margin: (top: 25mm, bottom: 20mm, left: 25mm, right: 20mm))\`；双面装订用 \`(inside: 28mm, outside: 20mm, top: 25mm, bottom: 20mm)\`。
- 标题上下间距用 \`#show heading.where(level: 1): set block(above: 24pt, below: 18pt)\` 控制，不要靠空行。
- 标点：中文标点直接写；**语法结构里必须是英文标点**（例如 \`/ 术语: 描述\`、\`#table(columns: 3)\`）。不要用 \`\\"\` 转义，中文弯引号直接输入。

## Typst 语法要点（最容易写错的地方）
- 数组 \`(a, b)\`、字典 \`(k: v)\`、内容块 \`[文本]\`；没有元组，\`[]\` 是空数组。
- 取元素用方法：\`arr.at(0)\`（不是 \`arr[0]\`）。
- 标记模式里调用函数要加 \`#\`：\`#figure(image("a.png"))\`；代码模式（参数列表、函数体）里不加。
- \`#set\` 改默认值，\`#show\` 变换元素：\`#show heading.where(level: 1): set text(size: 22pt)\`。
- 加粗是 \`*单星号*\`，斜体是 \`_下划线_\`（不是 \`**\`）。
- 引用用 \`#quote[内容]\`，分隔线用 \`#line(length: 100%)\`，链接用 \`#link("https://…")[文字]\`（不是 \`[文字](…)\`、不是 \`>\`、不是 \`---\`）。
- 标题 \`= 一级\` / \`== 二级\`；编号 \`#set heading(numbering: "1.1")\` 或 \`"一、"\`；不编号的标题用 \`#heading(numbering: none)[…]\`。
- 公式：行内 \`$x^2$\`，行间 \`$ x^2 $\`（\`$\` 内侧留空格）；矩阵 \`mat(1, 2; 3, 4)\`；分段 \`cases(1 & "if" x > 0, 0 & "otherwise")\`；多字母标识符/单位要加引号。
- 表格 \`#table(columns: 3, table.header([a], [b], [c]), …)\`；三线表 = \`stroke: none\` 加 \`table.hline()\`。
- 图片 \`#figure(image("img/a.png", width: 80%), caption: [图注]) <fig-a>\`，正文引用 \`@fig-a\`。
- 目录 \`#outline(title: [目录])\`；页码 \`#set page(numbering: "1")\`；日期 \`#datetime.today().display("[year]年[month]月[day]日")\`。
- 页眉页脚、按位置取值、计数器要用 \`context { … }\`；\`#counter\` / \`#state\` / \`#query\` 属进阶功能，非必要不用。
- 列表：无序 \`- 项\`，有序 \`+ 项\`；层级靠缩进。

## 风格
- 保留用户原有的结构、命名、注释、缩进和既有配置；除非用户明确要求，不要重排文档、不要替换整段样式。
- 拿不准的写法宁可不写，不要输出可能编译失败的代码。`

/** How much of the file the model is asked to rewrite. */
export type AiEditScope = 'selection' | 'document'

/** What the model gets as context for one request. */
export interface AiEditTarget {
	/** Path of the file being edited, e.g. `main.typ`. */
	path: string
	/** Every project file path (including binary assets) — what `#include` can reach. */
	files: string[]
	/** The source the model may rewrite: the whole file, or the selected slice. */
	code: string
	/** Which of the two `code` refers to. */
	scope: AiEditScope
	/** The range `code` came from when `scope` is `selection` — and where the reply goes back. */
	selection: { from: number; to: number } | null
}

/**
 * The user turn for one edit request: the instruction plus the source it may
 * rewrite, and the output contract that matches `scope`.
 */
export function buildEditUserMessage(target: AiEditTarget, instruction: string): string {
	const { path, files, code, scope } = target
	const range = scope === 'document' ? `整个文件（${path}）` : `文件 ${path} 中被选中的片段`
	const requirement =
		scope === 'document'
			? '修改后的完整文件内容（必须能整体替换原文件）'
			: '替换该选中片段的代码'
	const language = path.endsWith('.typ') ? 'typst' : ''

	return [
		`【文件】${path}`,
		`【项目文件】${files.join('、')}`,
		`【范围】${range}`,
		`【要求】${instruction}`,
		'',
		`【需要修改的代码】`,
		'```' + language,
		code,
		'```',
		'',
		`只输出${requirement}，放在一个 \`\`\`typst 代码块中，不要输出其他文字。`,
	].join('\n')
}

const FENCED_CODE = /```[ \t]*[A-Za-z0-9_+-]*[ \t]*\r?\n([\s\S]*?)```/
/** A model that streamed past its closing fence, or forgot it entirely. */
const UNTERMINATED_CODE = /```[ \t]*[A-Za-z0-9_+-]*[ \t]*\r?\n([\s\S]*)$/

/**
 * The code to apply from a model reply: the first fenced block, the remainder
 * of an unterminated fence, or — when the reply has no fence at all — the whole
 * trimmed reply. Always shown to the user before it is applied.
 */
export function extractTypstCode(reply: string): string {
	const fenced = FENCED_CODE.exec(reply) ?? UNTERMINATED_CODE.exec(reply)
	return (fenced ? fenced[1] : reply).trim()
}