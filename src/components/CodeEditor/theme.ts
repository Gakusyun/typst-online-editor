import { EditorView } from '@codemirror/view'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import { typstTags } from 'codemirror-lang-typst/lezer'

// Colors follow the GitHub Dark palette the old Shiki editor used.
export const editorTheme = EditorView.theme({
	'&': {
		color: '#f0f0f0',
		backgroundColor: 'transparent',
		fontSize: '14px',
		height: '100%',
	},
	'.cm-scroller': {
		fontFamily:
			"ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
		lineHeight: '1.625',
		overflow: 'auto',
		padding: '1rem 0',
	},
	'.cm-content': {
		caretColor: '#ffffff',
		padding: '0 12px 0 6px',
	},
	'.cm-cursor, .cm-dropCursor': {
		borderLeftColor: '#ffffff',
	},
	'&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
		backgroundColor: 'rgba(88, 166, 255, 0.35)',
	},
	'.cm-activeLine': {
		backgroundColor: 'rgba(255, 255, 255, 0.05)',
	},
	'.cm-gutters': {
		backgroundColor: 'transparent',
		color: '#6e7681',
		border: 'none',
		padding: '0',
	},
	'.cm-lineNumbers .cm-gutterElement': {
		padding: '0 2px 0 6px',
	},
	'.cm-foldGutter .cm-gutterElement': {
		width: '12px',
		padding: '0 1px',
	},
	'.cm-activeLineGutter': {
		backgroundColor: 'transparent',
		color: '#f0f0f0',
	},
	'.cm-foldGutter span': {
		color: '#6e7681',
	},
	'.cm-tooltip': {
		backgroundColor: '#161b22',
		border: '1px solid #30363d',
		color: '#f0f0f0',
	},
	'.cm-tooltip-autocomplete > ul > li[aria-selected]': {
		backgroundColor: '#1f6feb',
		color: '#ffffff',
	},
	'.cm-panels': {
		backgroundColor: '#161b22',
		color: '#f0f0f0',
	},
	'.cm-searchMatch': {
		backgroundColor: 'rgba(187, 128, 9, 0.4)',
	},
	'.cm-searchMatch-selected': {
		backgroundColor: 'rgba(187, 128, 9, 0.7)',
	},
})

export const editorHighlightStyle = HighlightStyle.define([
	{ tag: tags.comment, color: '#8b949e', fontStyle: 'italic' },
	{ tag: [tags.string, tags.special(tags.string)], color: '#a5d6ff' },
	{ tag: [tags.number, tags.bool, tags.null, tags.atom], color: '#79c0ff' },
	{ tag: [tags.keyword, tags.operatorKeyword, tags.modifier], color: '#ff7b72' },
	{ tag: [tags.operator, tags.punctuation, tags.separator], color: '#ff7b72' },
	{ tag: [tags.function(tags.variableName), tags.definition(tags.function(tags.variableName))], color: '#d2a8ff' },
	{ tag: [tags.typeName, tags.className, tags.namespace], color: '#ffa657' },
	{ tag: [tags.propertyName, tags.attributeName], color: '#79c0ff' },
	{ tag: [tags.variableName, tags.labelName], color: '#79c0ff' },
	{ tag: [tags.definition(tags.variableName)], color: '#ffa657' },
	{ tag: [tags.tagName, tags.angleBracket], color: '#7ee787' },
	{ tag: [tags.link, tags.url], color: '#a5d6ff', textDecoration: 'underline' },
	{ tag: [tags.heading, tags.heading1, tags.heading2, tags.heading3, tags.heading4], color: '#79c0ff', fontWeight: 'bold' },
	{ tag: [tags.emphasis], fontStyle: 'italic' },
	{ tag: [tags.strong], fontWeight: 'bold' },
	{ tag: [tags.strikethrough], textDecoration: 'line-through' },
	{ tag: [tags.escape, tags.character], color: '#79c0ff' },
	{ tag: [tags.meta, tags.processingInstruction], color: '#8b949e' },
	{ tag: typstTags.mathDelimiter, color: '#ff7b72' },
	{ tag: typstTags.listMarker, color: '#ff7b72' },
	{ tag: typstTags.interpolated, color: '#d2a8ff' },
])

export const editorHighlighting = syntaxHighlighting(editorHighlightStyle)
