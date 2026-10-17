# Typst Online Editor

> 本项目Fork自[Mapaor/typst-online-editor](https://github.com/Mapaor/typst-online-editor/)
> 上游项目 [README](README.upstream.md)。

一个轻量的网页版 Typst 编辑器，通过 WebAssembly 在浏览器中直接编译文档。无需服务器，全部在客户端完成。

上游演示地址：[https://typst-online-editor.vercel.app](https://typst-online-editor.vercel.app)。

## 技术栈

基于 Preact + Vite 构建（包管理使用 pnpm），使用 [Typst.ts](https://github.com/Myriad-Dreamin/typst.ts)（[@myriaddreamin](https://github.com/Myriad-Dreamin) 开发的 Typst JavaScript 实现）、PDF.js 和 Shiki。

## 主要特性

- 借助 Typst.ts 实现全客户端编译（wasm 文件随 [@myriaddreamin/typst-ts-web-compiler](https://www.npmjs.com/package/@myriaddreamin/typst-ts-web-compiler) 包发布，同步到本地 `public/wasm/` 使用）。
- 文件浏览器、自定义 PDF 预览、防抖编译（输入即编译）。
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
