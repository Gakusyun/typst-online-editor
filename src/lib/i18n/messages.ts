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
	'editor.initializingHighlighter': 'Initializing highlighter...',
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

	// Modal dialogs (alert / confirm)
	'dialog.fileExists': 'A file with this name already exists!',
	'dialog.folderExists': 'A folder with this name already exists!',
	'dialog.fileExistsAtDestination': 'A file with this name already exists at the destination!',
	'dialog.overwriteFile': 'File "{name}" already exists. Do you want to overwrite it?',

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
	'editor.initializingHighlighter': '正在初始化语法高亮…',
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

	// Modal dialogs
	'dialog.fileExists': '同名文件已存在！',
	'dialog.folderExists': '同名文件夹已存在！',
	'dialog.fileExistsAtDestination': '目标位置已存在同名文件！',
	'dialog.overwriteFile': '文件“{name}”已存在，要覆盖它吗？',

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
	'editor.initializingHighlighter': 'Highlighter wird initialisiert …',
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

	// Modal dialogs
	'dialog.fileExists': 'Eine Datei mit diesem Namen existiert bereits!',
	'dialog.folderExists': 'Ein Ordner mit diesem Namen existiert bereits!',
	'dialog.fileExistsAtDestination': 'Am Ziel existiert bereits eine Datei mit diesem Namen!',
	'dialog.overwriteFile': 'Die Datei „{name}“ existiert bereits. Überschreiben?',

	// Layout
	'layout.dragToResize': 'Zum Ändern der Größe ziehen',
}

/** All catalogs, keyed by language code. */
export const MESSAGES = { en, zh, de }
