# Typst Online Editor

> 本项目Fork自[Mapaor/typst-online-editor](https://github.com/Mapaor/typst-online-editor/)
> 上游项目 [README](README.upstream.md)。

一个轻量的网页版 Typst 编辑器，通过 WebAssembly 在浏览器中直接编译文档。无需服务器，全部在客户端完成。

上游演示地址：[https://typst-online-editor.vercel.app](https://typst-online-editor.vercel.app)。

## 技术栈

基于 Next.js（React）构建，使用 [Typst.ts](https://github.com/Myriad-Dreamin/typst.ts)（[@myriaddreamin](https://github.com/Myriad-Dreamin) 开发的 Typst JavaScript 实现）、PDF.js 和 Shiki。

## 主要特性

- 借助 Typst.ts 实现全客户端编译（wasm 文件来自其 CDN）。
- 完整的示例演示：可加载不同示例、文件浏览器、自定义 PDF 预览、防抖编译（输入即编译）。
- 可移植。UI 未必与框架无关，但编译逻辑是通用的。更精简的版本见 [simple-typst-editor](https://github.com/Mapaor4/simple-typst-editor)，另有 Vite 精简版 [typst-online-vite](https://github.com/Mapaor/typst-online-vite)。

## 使用与部署

部署 Next.js 应用的基本步骤如下：

最简单的方式是 fork 本仓库，然后部署到 Vercel。

部署完成后可以克隆到本地开发。先安装依赖：

```
npm install
```

然后启动开发服务器：

```
npm run dev
```

打开终端输出的 localhost 地址即可。

生产模式对应的命令（Vercel 服务器上运行的命令）是 `npm run build` 和 `npm run start`。

也可以将应用导出为静态 HTML+CSS+JS，部署到 GitHub Pages，步骤见下方折叠内容。

<details>

<summary>部署为静态站点</summary>

1. 先取消 `next.config.ts` 中相关行的注释
2. 创建 `.env.production`，内容如下：

  ```
  NEXT_PUBLIC_BASE_PATH="/typst-online-editor-static" # 换成你的静态仓库名
  ```

3. 运行 `npm run build`
4. 生成的 `out` 文件夹内容（不是文件夹本身）即为可发布到 GitHub Pages 的站点
5. 在仓库根目录手动添加一个空的 `.nojekyll` 文件
6. 访问站点确认可用
7. 完成后重新注释 `next.config.ts` 中的行，并删除 `.env.production`（或注释其内容），恢复 Next.js 应用原状

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
- pdf.js
- pdfjs-dist

均采用 Apache-2.0 许可证。Typst.ts 使用的 Typst 编译器同样采用 Apache-2.0 许可证。

所用 Lucide 图标采用 MIT 许可证。
