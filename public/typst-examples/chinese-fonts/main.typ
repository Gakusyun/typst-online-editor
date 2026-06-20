#set page(width: auto, height: auto, margin: 1.5cm)
#set text(size: 14pt, lang: "zh")

= 中文字体示例

== 默认字体（系统回退）
这是使用编辑器默认字体的中文文本。当前默认使用 IBM Plex Sans，中文部分会回退到系统字体。

== 思源宋体（Source Han Serif）
#text(font: "Source Han Serif SC")[
  汉体秦权量、莽量、汉尺、新莽嘉量等诸多古器物的文字，
  波磔撇捺皆成妙趣，方圆奇正各见姿态。其书法之精妙，
  足以代表中国书法之古典风格，亦足以考见中国文字演变之迹。
]

== 思源黑体（Source Han Sans SC）
#text(font: "Source Han Sans SC")[
  现代中文排版常使用无衬线字体（黑体）来呈现标题或需要
  突出显示的文本段落。思源黑体是 Adobe 与 Google 联合开
  发的开源泛 CJK 字体，支持简体中文、繁体中文、日文和韩文。
]

== 混合排版
#text(font: "Source Han Serif SC")[
  正文使用思源宋体，阅读舒适。标题使用 #text(font: "Source Han Sans SC")[思源黑体] 突出重点。
]

== 字体加载说明
字体文件从 Adobe 官方 GitHub 仓库通过 CDN 加载，首次编译可能需要等待字体下载完成。
如需添加其他字体，请在文件浏览器的「使用中文字体」目录下上传 `.ttf` 或 `.otf` 字体文件。
