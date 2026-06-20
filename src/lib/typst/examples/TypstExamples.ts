export interface TypstExample {
	id: string
	name: string
	description: string
	filePath: string // Path to .typ file in public folder
	isMultiFile?: boolean
	additionalFiles?: Array<{ path: string; filePath: string }>
}

export const TYPST_EXAMPLES: TypstExample[] = [
	{
		id: 'hello',
		name: '你好世界',
		description: '带标题和文本的简单文档',
		filePath: `${import.meta.env.BASE_URL}typst-examples/hello-world/main.typ`
	},
	{
		id: 'math',
		name: '数学文档',
		description: '数学公式与方程',
		filePath: `${import.meta.env.BASE_URL}typst-examples/math-expressions/main.typ`
	},
	// {
	// 	id: 'report',
	// 	name: 'Academic Report',
	// 	description: 'A structured document with sections and formatting',
	// 	filePath: '/typst-examples/report/main.typ'
	// },
	{
		id: 'using-images',
		name: '使用图片',
		description: '演示如何在 Typst 文档中使用图片',
		filePath: `${import.meta.env.BASE_URL}typst-examples/using-images/main.typ`,
		isMultiFile: true,
		additionalFiles: [
			{ path: 'cat-image.jpg', filePath: `${import.meta.env.BASE_URL}typst-examples/using-images/cat-image.jpg` },
			{ path: 'star-image.png', filePath: `${import.meta.env.BASE_URL}typst-examples/using-images/star-image.png` },
		]
	},
	{
		id: 'multi-file',
		name: '多文件文档',
		description: '包含多文件、导入和引用的文档',
		filePath: `${import.meta.env.BASE_URL}typst-examples/multi-file/main.typ`,
		isMultiFile: true,
		additionalFiles: [
			{ path: 'template.typ', filePath: `${import.meta.env.BASE_URL}typst-examples/multi-file/template.typ` },
			{ path: 'chapters/chapter-1.typ', filePath: `${import.meta.env.BASE_URL}typst-examples/multi-file/chapters/chapter-1.typ` },
			{ path: 'chapters/chapter-2.typ', filePath: `${import.meta.env.BASE_URL}typst-examples/multi-file/chapters/chapter-2.typ` },
		]
	},
	{
		id: 'mitex',
		name: '使用包',
		description: '使用 Typst Universe 中的 Mitex 包',
		filePath: `${import.meta.env.BASE_URL}typst-examples/mitex/main.typ`
	},
	{
		id: 'using-templates',
		name: '使用模板',
		description: '使用 Typst Universe 中的 Graceful-Genetics 模板',
		filePath: `${import.meta.env.BASE_URL}typst-examples/using-templates/main.typ`
	},
	{
		id: 'local-template',
		name: '本地模板',
		description: '带本地模块和布局的简历模板',
		filePath: `${import.meta.env.BASE_URL}typst-examples/local-template/main.typ`,
		isMultiFile: true,
		additionalFiles: [
			{ path: 'cv.typ', filePath: `${import.meta.env.BASE_URL}typst-examples/local-template/cv.typ` },
			{ path: 'utils.typ', filePath: `${import.meta.env.BASE_URL}typst-examples/local-template/utils.typ` },
			{ path: 'example-cv.yml', filePath: `${import.meta.env.BASE_URL}typst-examples/local-template/example-cv.yml` },
			{ path: 'layouts/bullet-list.typ', filePath: `${import.meta.env.BASE_URL}typst-examples/local-template/layouts/bullet-list.typ` },
			{ path: 'layouts/header.typ', filePath: `${import.meta.env.BASE_URL}typst-examples/local-template/layouts/header.typ` },
			{ path: 'layouts/timeline.typ', filePath: `${import.meta.env.BASE_URL}typst-examples/local-template/layouts/timeline.typ` },
			{ path: 'layouts/prose.typ', filePath: `${import.meta.env.BASE_URL}typst-examples/local-template/layouts/prose.typ` },
			{ path: 'layouts/numbered-list.typ', filePath: `${import.meta.env.BASE_URL}typst-examples/local-template/layouts/numbered-list.typ` },
		]
	},
	{
		id: 'using-fonts',
		name: '使用字体',
		description: '演示如何在 Typst 文档中使用自定义字体',
		filePath: `${import.meta.env.BASE_URL}typst-examples/using-fonts/main.typ`,
		isMultiFile: true,
		additionalFiles: [
			{ path: 'RobotoRegular.ttf', filePath: `${import.meta.env.BASE_URL}typst-examples/using-fonts/RobotoRegular.ttf` },
			{ path: 'Andropabe.ttf', filePath: `${import.meta.env.BASE_URL}typst-examples/using-fonts/Andropabe.ttf` },
		]
	},
	{
		id: 'chinese-fonts',
		name: '使用中文字体',
		description: '使用思源宋体和思源黑体进行中文排版',
		filePath: `${import.meta.env.BASE_URL}typst-examples/chinese-fonts/main.typ`,
		isMultiFile: true,
		additionalFiles: [
			{ path: 'SourceHanSerifSC-Regular.otf', filePath: 'https://raw.githubusercontent.com/adobe-fonts/source-han-serif/release/OTF/SimplifiedChinese/SourceHanSerifSC-Regular.otf' },
			{ path: 'SourceHanSansSC-Regular.otf', filePath: 'https://raw.githubusercontent.com/adobe-fonts/source-han-sans/release/OTF/SimplifiedChinese/SourceHanSansSC-Regular.otf' },
		]
	}
]

/**
 * Fetches a Typst example file from the public folder
 */
export async function fetchExample(filePath: string): Promise<string> {
	const response = await fetch(filePath)
	if (!response.ok) {
		throw new Error(`Failed to load example: ${response.statusText}`)
	}
	
	// Check if this is an image file
	const isImage = /\.(png|jpg|jpeg|svg)$/i.test(filePath)
	// Check if this is a font file
	const isFont = /\.(ttf|otf)$/i.test(filePath)
	
	if (isImage || isFont) {
		// For binary files (images and fonts), convert to base64 data URL
		const blob = await response.blob()
		return new Promise((resolve, reject) => {
			const reader = new FileReader()
			reader.onloadend = () => resolve(reader.result as string)
			reader.onerror = reject
			reader.readAsDataURL(blob)
		})
	}
	
	// For text files, return as text
	return await response.text()
}

export function getExampleById(id: string): TypstExample | undefined {
	return TYPST_EXAMPLES.find(example => example.id === id)
}

export function getExampleNames(): { id: string; name: string }[] {
	return TYPST_EXAMPLES.map(({ id, name }) => ({ id, name }))
}
