/**
 * UI message catalogs.
 *
 * `en` is the base catalog: its keys define `MessageKey`, and every other locale
 * is typed as `Messages`, so `tsc` fails on a missing or misspelled key.
 *
 * A message is a template with `{placeholder}` slots. Plural forms are optional
 * variants named `<key>_<plural category>` (e.g. `files.count_one`); `translate()`
 * in `./i18n` picks one via `Intl.PluralRules` when `vars.count` is a number and
 * falls back to the base key otherwise.
 */

export const en = {
	// Compile status — shown in the header badge and the preview placeholder.
	'status.compiling': 'Compiling...',
	'status.initializing': 'Initializing compiler...',
	'status.compiled': 'Compiled',
	'status.error': 'Error',
	'status.ready': 'Ready',
	'status.readyToCompile': 'Ready to compile',

	// Header
	'header.compileNow': 'Compile Now',
	'header.downloadPdf': 'Download PDF',
	'header.viewOnGithub': 'View on GitHub',

	// Settings dialog
	'settings.title': 'Settings',
	'settings.language': 'Language',
	'settings.followSystem': 'Follow system',
	'settings.about': 'About',
	'settings.version': 'Version {version}',
	'settings.fontFamilies': 'View supported font families',
	'settings.fontFamiliesHint': 'Reference them in documents with #set text(font: "..."). Uploaded fonts are also available under their own family names.',
	'settings.fonts': 'Fonts',
	'settings.uiFont': 'Interface font',
	'settings.editorFont': 'Editor font',
	'settings.fontDefault': 'Default',
	'settings.loadSystemFonts': 'Load system fonts',
	'settings.fontsLoading': 'Loading system fonts…',
	'settings.fontsLoaded': '{count} font families loaded',
	'settings.fontsLoaded_one': '{count} font family loaded',
	'settings.fontsDenied': 'Access to system fonts was denied',
	'settings.fontsFailed': 'Could not read the system fonts',
	'settings.fontFamilyHint': 'Must match an installed font (e.g. "JetBrains Mono"). Empty = default. The editor font also covers compile errors.',
	'settings.fontNotFound': 'No installed font family goes by that name — check the spelling (or press "Load system fonts" first).',
	'settings.fontDenied': 'The browser has not granted font access, so the default font is used instead.',
	'settings.fontUnreadable': 'That font file could not be read (corrupt, too large, or loading timed out) — the default font is used instead.',
	'settings.fontsUnsupported': 'This looks like desktop Chromium, yet it does not provide the Local Font Access API: Chrome / Edge may predate 103, a launch flag or enterprise policy may disable it, or this may not be official Chrome / Edge — Brave, Vivaldi, 360, QQ Browser and other forks strip or patch the API behind a Chrome-identical user agent. Check chrome://version, then open the same URL in official Chrome or Edge to compare.',
	'settings.fontsMobileBrowser': 'This API was never implemented for phones and tablets (Chrome for Android, Edge for Android and Samsung Internet included): use desktop Chrome / Edge on a computer.',
	'settings.fontsIosBrowser': 'Every browser on iOS / iPadOS runs WebKit (Chrome, Edge and Firefox included), which does not provide this API: use desktop Chrome / Edge.',
	'settings.fontsWebViewBrowser': 'This page runs inside an in-app browser or WebView (the built-in browsers of WeChat, Feishu, DingTalk, QQ, an Electron app, or an IDE preview pane): such environments do not provide the API — open the app in standalone desktop Chrome / Edge.',
	'settings.fontsInsecureContext': 'This page is not a secure context, so the browser never exposes font access: open the app over https:// or http://localhost (http:// on a LAN IP does not qualify).',
	'settings.fontsOpaqueOrigin': 'This page has an opaque origin (for example opening the file directly via file://), which the browser refuses to grant font access to: serve it over https:// or http://localhost.',
	'settings.fontsEmbedded': 'This page is embedded in an iframe that does not allow local-fonts: the outer iframe needs allow="local-fonts".',
	'settings.fontsBlocked': 'The browser blocked font access (SecurityError): a permissions policy, an untrusted origin, or a call that no user action triggered.',
	'settings.documentFontsAuto': 'Load installed fonts the document uses',
	'settings.documentFontsHint': 'A family the source sets with #set text(font: "…") is read from this machine for that compile and released as soon as it finishes. Uses the same permission as "Load system fonts".',
	'settings.systemFontFamilies': 'System fonts available: {count}',
	'settings.systemFontFamilies_one': 'System font available: {count}',
	'settings.systemFontFamiliesHint': 'Load the system fonts to list the families this document can use.',
	'common.close': 'Close',

	// PDF preview
	'preview.title': 'PDF Preview',
	'preview.show': 'Show Preview',
	'preview.close': 'Close Preview',
	'preview.openInNewTab': 'Open in New Tab',
	'preview.prevPage': 'Previous Page',
	'preview.nextPage': 'Next Page',
	'preview.zoomIn': 'Zoom In',
	'preview.zoomOut': 'Zoom Out',
	'preview.zoomToFit': 'Zoom to Fit',
	'preview.idleHint': 'Type to edit and compile',
	'preview.idleStart': 'Click "Compile Now" or start typing to generate PDF',
	'preview.done': 'Compilation complete',

	// Code editor
	'editor.typeHere': 'Type here...',
	'editor.lspLoading': 'Starting language service…',
	'editor.lspUnavailable': 'Language service unavailable',
	'editor.imageContent': 'This is an image (binary data). Content too large to show here.',
	'editor.fontContent': 'This is a font file (binary data). Content too large to show here.',

	// File explorer
	'files.count': '{count} files',
	'files.count_one': '{count} file',
	'files.show': 'Show Files',
	'files.hide': 'Close Files',
	'files.newFile': 'New File',
	'files.newFolder': 'New Folder',
	'files.fileName': 'File name',
	'files.folderName': 'Folder name',
	'files.create': 'Create',
	'files.cancel': 'Cancel',
	'files.rename': 'Rename',
	'files.renameFile': 'Rename file',
	'files.deleteFile': 'Delete file',
	'files.renameFolder': 'Rename folder',
	'files.deleteFolder': 'Delete folder',
	'files.dropToUpload': 'Drop files to upload',
	'files.supported': 'Supported: {extensions}',
	'files.renameProject': 'Rename project',
	'files.importProject': 'Import Project',
	'files.exportProject': 'Export Project',

	// Modal dialogs (alert / confirm)
	'dialog.fileExists': 'A file with this name already exists!',
	'dialog.folderExists': 'A folder with this name already exists!',
	'dialog.fileExistsAtDestination': 'A file with this name already exists at the destination!',
	'dialog.overwriteFile': 'File "{name}" already exists. Do you want to overwrite it?',
	'dialog.importFailed': 'Failed to import project: {error}',
	'dialog.exportFailed': 'Failed to export project: {error}',

	// Layout
	'layout.dragToResize': 'Drag to resize',
} as const

export type MessageKey = keyof typeof en

/** A complete locale: every `MessageKey` must be present. */
export type Messages = Record<MessageKey, string>

export const zh: Messages = {
	// Compile status
	'status.compiling': '编译中…',
	'status.initializing': '正在初始化编译器…',
	'status.compiled': '已编译',
	'status.error': '错误',
	'status.ready': '就绪',
	'status.readyToCompile': '准备编译',

	// Header
	'header.compileNow': '立即编译',
	'header.downloadPdf': '下载 PDF',
	'header.viewOnGithub': '在 GitHub 上查看',

	// Settings dialog
	'settings.title': '设置',
	'settings.language': '语言',
	'settings.followSystem': '跟随系统',
	'settings.about': '关于',
	'settings.version': '版本 {version}',
	'settings.fontFamilies': '查看支持的 Font Family',
	'settings.fontFamiliesHint': '在文档中通过 #set text(font: "…") 引用这些字体；上传的字体同样可用，其族名定义在字体文件内部。',
	'settings.fonts': '字体',
	'settings.uiFont': '界面字体',
	'settings.editorFont': '编辑器字体',
	'settings.fontDefault': '默认',
	'settings.loadSystemFonts': '读取系统字体',
	'settings.fontsLoading': '正在读取系统字体…',
	'settings.fontsLoaded': '已读取 {count} 个字体族',
	'settings.fontsLoaded_one': '已读取 {count} 个字体族',
	'settings.fontsDenied': '系统字体访问被拒绝',
	'settings.fontsFailed': '读取系统字体失败',
	'settings.fontFamilyHint': '需与已安装字体的名称一致（例如“JetBrains Mono”）；留空使用默认字体。编辑器字体同时用于编译报错信息。',
	'settings.fontNotFound': '系统里没有叫这个名字的字体族，请检查拼写（或先点「读取系统字体」）。',
	'settings.fontDenied': '浏览器没有授予读取系统字体的权限，已回落到默认字体。',
	'settings.fontUnreadable': '这个字体文件读不出来（可能损坏、过大或加载超时），已回落到默认字体。',
	'settings.fontsUnsupported': '检测到桌面版 Chromium，但它没有提供 Local Font Access API：可能是 Chrome / Edge 版本低于 103，或启动参数 / 企业策略禁用了它，也可能这不是官方 Chrome / Edge——Brave、Vivaldi、360、QQ 浏览器等派生浏览器与精简内核会移除或改写该 API（它们的 UA 与 Chrome 几乎一样）。请先在 chrome://version 确认版本，再用官方 Chrome 或 Edge 打开同一地址对比。',
	'settings.fontsMobileBrowser': '这个 API 只有桌面版实现，手机 / 平板浏览器（包括 Chrome for Android、Edge for Android、三星浏览器）都没有：请在电脑上使用桌面版 Chrome / Edge。',
	'settings.fontsIosBrowser': 'iOS / iPadOS 上所有浏览器都用 WebKit 内核（Chrome、Edge、Firefox 在 iPhone 上也是），系统没有提供这个 API：请在桌面版 Chrome / Edge 上使用。',
	'settings.fontsWebViewBrowser': '当前页面运行在应用内浏览器 / WebView 里（微信、飞书、钉钉、QQ 等的内置浏览器，Electron 应用，或 IDE 的内置预览）：这类环境不提供该 API，请用独立的桌面版 Chrome / Edge 打开。',
	'settings.fontsInsecureContext': '当前页面不是安全上下文（Secure Context），浏览器不会提供字体读取能力：请用 https:// 或 http://localhost 打开（http:// 加局域网 IP 不算）。',
	'settings.fontsOpaqueOrigin': '当前页面的来源（origin）是不透明的（例如直接用 file:// 打开这个页面），浏览器拒绝授予字体读取权限：请通过 https:// 或本地服务器（http://localhost）打开。',
	'settings.fontsEmbedded': '当前页面被嵌入在 iframe 中，外层页面没有允许 local-fonts：需要在外层 iframe 上添加 allow="local-fonts"。',
	'settings.fontsBlocked': '浏览器阻止了字体读取（SecurityError）：可能是权限策略限制、页面来源不被信任，或该调用不是由用户操作触发的。',
	'settings.documentFontsAuto': '自动载入文档引用的系统字体',
	'settings.documentFontsHint': '文档中 #set text(font: "…") 引用的字体，会在该次编译时从本机读入，编译一结束立即释放；与「读取系统字体」使用同一授权。',
	'settings.systemFontFamilies': '可用系统字体：{count} 个',
	'settings.systemFontFamilies_one': '可用系统字体：{count} 个',
	'settings.systemFontFamiliesHint': '点击「读取系统字体」后，这里会列出文档可用的系统字体族名。',
	'common.close': '关闭',

	// PDF preview
	'preview.title': 'PDF 预览',
	'preview.show': '显示预览',
	'preview.close': '关闭预览',
	'preview.openInNewTab': '在新标签页中打开',
	'preview.prevPage': '上一页',
	'preview.nextPage': '下一页',
	'preview.zoomIn': '放大',
	'preview.zoomOut': '缩小',
	'preview.zoomToFit': '适应页面',
	'preview.idleHint': '输入内容即可编辑并编译',
	'preview.idleStart': '点击“立即编译”或开始输入即可生成 PDF',
	'preview.done': '编译完成',

	// Code editor
	'editor.typeHere': '在此输入…',
	'editor.lspLoading': '正在启动语言服务…',
	'editor.lspUnavailable': '语言服务不可用',
	'editor.imageContent': '这是一个图片文件（二进制数据），内容过大，无法在此显示。',
	'editor.fontContent': '这是一个字体文件（二进制数据），内容过大，无法在此显示。',

	// File explorer
	'files.count': '{count} 个文件',
	'files.count_one': '{count} 个文件',
	'files.show': '显示文件列表',
	'files.hide': '隐藏文件列表',
	'files.newFile': '新建文件',
	'files.newFolder': '新建文件夹',
	'files.fileName': '文件名',
	'files.folderName': '文件夹名',
	'files.create': '创建',
	'files.cancel': '取消',
	'files.rename': '重命名',
	'files.renameFile': '重命名文件',
	'files.deleteFile': '删除文件',
	'files.renameFolder': '重命名文件夹',
	'files.deleteFolder': '删除文件夹',
	'files.dropToUpload': '拖放文件以上传',
	'files.supported': '支持：{extensions}',
	'files.renameProject': '重命名项目',
	'files.importProject': '导入项目',
	'files.exportProject': '导出项目',

	// Modal dialogs
	'dialog.fileExists': '同名文件已存在！',
	'dialog.folderExists': '同名文件夹已存在！',
	'dialog.fileExistsAtDestination': '目标位置已存在同名文件！',
	'dialog.overwriteFile': '文件“{name}”已存在，要覆盖它吗？',
	'dialog.importFailed': '导入项目失败：{error}',
	'dialog.exportFailed': '导出项目失败：{error}',

	// Layout
	'layout.dragToResize': '拖动调整大小',
}

export const de: Messages = {
	// Compile status
	'status.compiling': 'Wird kompiliert …',
	'status.initializing': 'Compiler wird initialisiert …',
	'status.compiled': 'Kompiliert',
	'status.error': 'Fehler',
	'status.ready': 'Bereit',
	'status.readyToCompile': 'Bereit zum Kompilieren',

	// Header
	'header.compileNow': 'Jetzt kompilieren',
	'header.downloadPdf': 'PDF herunterladen',
	'header.viewOnGithub': 'Auf GitHub ansehen',

	// Settings dialog
	'settings.title': 'Einstellungen',
	'settings.language': 'Sprache',
	'settings.followSystem': 'Systemsprache',
	'settings.about': 'Über',
	'settings.version': 'Version {version}',
	'settings.fontFamilies': 'Unterstützte Schriftfamilien anzeigen',
	'settings.fontFamiliesHint': 'Referenzieren Sie sie in Dokumenten mit #set text(font: "…"). Hochgeladene Schriften stehen unter ihrem eigenen Familiennamen zur Verfügung.',
	'settings.fonts': 'Schriften',
	'settings.uiFont': 'Oberflächenschrift',
	'settings.editorFont': 'Editor-Schrift',
	'settings.fontDefault': 'Standard',
	'settings.loadSystemFonts': 'Systemschriften laden',
	'settings.fontsLoading': 'Systemschriften werden geladen …',
	'settings.fontsLoaded': '{count} Schriftfamilien geladen',
	'settings.fontsLoaded_one': '{count} Schriftfamilie geladen',
	'settings.fontsDenied': 'Zugriff auf Systemschriften wurde verweigert',
	'settings.fontsFailed': 'Systemschriften konnten nicht gelesen werden',
	'settings.fontFamilyHint': 'Muss einer installierten Schrift entsprechen (z. B. „JetBrains Mono“). Leer = Standard. Die Editor-Schrift gilt auch für Kompilierfehler.',
	'settings.fontNotFound': 'Keine installierte Schriftfamilie heißt so — Schreibweise prüfen (oder zuerst „Systemschriften laden“).',
	'settings.fontDenied': 'Der Browser hat keinen Schriftenzugriff erlaubt, deshalb wird die Standardschrift verwendet.',
	'settings.fontUnreadable': 'Diese Schriftdatei ließ sich nicht lesen (beschädigt, zu groß oder Zeitüberschreitung) — es wird die Standardschrift verwendet.',
	'settings.fontsUnsupported': 'Das sieht nach Desktop-Chromium aus, doch die Local Font Access API fehlt: Chrome / Edge könnte älter als 103 sein, ein Startparameter oder eine Enterprise-Richtlinie sie deaktivieren, oder dies ist kein offizielles Chrome / Edge — Brave, Vivaldi, 360, QQ Browser und andere Forks entfernen oder verändern die API hinter einer Chrome-identischen Kennung. chrome://version prüfen und dieselbe URL in offiziellem Chrome oder Edge zum Vergleich öffnen.',
	'settings.fontsMobileBrowser': 'Diese API wurde für Telefone und Tablets nie implementiert (auch Chrome für Android, Edge für Android und Samsung Internet nicht): Desktop-Chrome / -Edge am Computer verwenden.',
	'settings.fontsIosBrowser': 'Jeder Browser unter iOS / iPadOS nutzt WebKit (auch Chrome, Edge und Firefox), das diese API nicht anbietet: Desktop-Chrome / -Edge verwenden.',
	'settings.fontsWebViewBrowser': 'Diese Seite läuft in einem In-App-Browser oder WebView (integrierte Browser von WeChat, Feishu, DingTalk, QQ, eine Electron-App oder eine IDE-Vorschau): solche Umgebungen bieten die API nicht — die App in eigenständigem Desktop-Chrome / -Edge öffnen.',
	'settings.fontsInsecureContext': 'Diese Seite ist kein Secure Context, deshalb stellt der Browser den Schriftenzugriff nicht bereit: über https:// oder http://localhost öffnen (http:// mit LAN-IP genügt nicht).',
	'settings.fontsOpaqueOrigin': 'Diese Seite hat einen opaque origin (z. B. direkt per file:// geöffnet), dem der Browser den Schriftenzugriff verweigert: über https:// oder http://localhost bereitstellen.',
	'settings.fontsEmbedded': 'Diese Seite ist in einem iframe eingebettet, das local-fonts nicht erlaubt: das äußere iframe braucht allow="local-fonts".',
	'settings.fontsBlocked': 'Der Browser hat den Schriftenzugriff blockiert (SecurityError): eine Permissions Policy, ein nicht vertrauenswürdiger Origin oder ein Aufruf ohne Nutzeraktion.',
	'settings.documentFontsAuto': 'Installierte Schriften laden, die das Dokument nutzt',
	'settings.documentFontsHint': 'Eine Familie aus #set text(font: "…") wird für diese Kompilierung von diesem Rechner gelesen und danach sofort freigegeben. Nutzt dieselbe Freigabe wie „Systemschriften laden“.',
	'settings.systemFontFamilies': 'Verfügbare Systemschriften: {count}',
	'settings.systemFontFamilies_one': 'Verfügbare Systemschrift: {count}',
	'settings.systemFontFamiliesHint': 'Nach „Systemschriften laden“ werden hier die nutzbaren Familien aufgelistet.',
	'common.close': 'Schließen',

	// PDF preview
	'preview.title': 'PDF-Vorschau',
	'preview.show': 'Vorschau anzeigen',
	'preview.close': 'Vorschau schließen',
	'preview.openInNewTab': 'In neuem Tab öffnen',
	'preview.prevPage': 'Vorherige Seite',
	'preview.nextPage': 'Nächste Seite',
	'preview.zoomIn': 'Vergrößern',
	'preview.zoomOut': 'Verkleinern',
	'preview.zoomToFit': 'An Fenster anpassen',
	'preview.idleHint': 'Zum Bearbeiten und Kompilieren tippen',
	'preview.idleStart': 'Zum Erzeugen einer PDF „Jetzt kompilieren“ anklicken oder direkt tippen',
	'preview.done': 'Kompilierung abgeschlossen',

	// Code editor
	'editor.typeHere': 'Hier tippen …',
	'editor.lspLoading': 'Sprachdienst wird gestartet …',
	'editor.lspUnavailable': 'Sprachdienst nicht verfügbar',
	'editor.imageContent': 'Dies ist eine Bilddatei (Binärdaten). Der Inhalt ist zu groß für die Anzeige.',
	'editor.fontContent': 'Dies ist eine Schriftdatei (Binärdaten). Der Inhalt ist zu groß für die Anzeige.',

	// File explorer
	'files.count': '{count} Dateien',
	'files.count_one': '{count} Datei',
	'files.show': 'Dateien anzeigen',
	'files.hide': 'Dateien ausblenden',
	'files.newFile': 'Neue Datei',
	'files.newFolder': 'Neuer Ordner',
	'files.fileName': 'Dateiname',
	'files.folderName': 'Ordnername',
	'files.create': 'Erstellen',
	'files.cancel': 'Abbrechen',
	'files.rename': 'Umbenennen',
	'files.renameFile': 'Datei umbenennen',
	'files.deleteFile': 'Datei löschen',
	'files.renameFolder': 'Ordner umbenennen',
	'files.deleteFolder': 'Ordner löschen',
	'files.dropToUpload': 'Dateien zum Hochladen ablegen',
	'files.supported': 'Unterstützt: {extensions}',
	'files.renameProject': 'Projekt umbenennen',
	'files.importProject': 'Projekt importieren',
	'files.exportProject': 'Projekt exportieren',

	// Modal dialogs
	'dialog.fileExists': 'Eine Datei mit diesem Namen existiert bereits!',
	'dialog.folderExists': 'Ein Ordner mit diesem Namen existiert bereits!',
	'dialog.fileExistsAtDestination': 'Am Ziel existiert bereits eine Datei mit diesem Namen!',
	'dialog.overwriteFile': 'Die Datei „{name}“ existiert bereits. Überschreiben?',
	'dialog.importFailed': 'Projektimport fehlgeschlagen: {error}',
	'dialog.exportFailed': 'Projektexport fehlgeschlagen: {error}',

	// Layout
	'layout.dragToResize': 'Zum Ändern der Größe ziehen',
}

/** All catalogs, keyed by language code. */
export const MESSAGES = { en, zh, de }
