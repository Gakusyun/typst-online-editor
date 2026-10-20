import { ChangeSet, Text } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import { LSPPlugin, Workspace, type LSPClient, type WorkspaceFile } from '@codemirror/lsp-client'
import { pathToUri, uriToPath } from './uri'

export interface ProjectFileSnapshot {
	path: string
	content: string
}

export interface ProjectWorkspaceHost {
	/** Current project files; called on every sync. */
	getFiles(): readonly ProjectFileSnapshot[]
	/** Show the given project file in the editor (cross-file navigation). */
	onNavigate(path: string): void
}

/**
 * Project files that can enter the analysis world; binary project files (images,
 * fonts) never can. Shared with the editor, which must only attach its LSP
 * plugin to files this workspace is willing to open on the server.
 */
export const WORKSPACE_TEXT_FILE = /\.(typ|md|mdx|bib|txt|csv|json|ya?ml|toml)$/i

/**
 * The LSP `languageId` for a project path. The editor's plugin and this
 * workspace both derive it here: the server keys its document handling off it,
 * so a hardcoded `typst` for every file (including the `.md`/`.json` files the
 * workspace opens) would misreport their type.
 */
export function languageIdForPath(path: string): string {
	const ext = path.toLowerCase().split('.').pop() ?? ''
	if (ext === 'typ') return 'typst'
	if (ext === 'md' || ext === 'mdx') return 'markdown'
	if (ext === 'json') return 'json'
	if (ext === 'yaml' || ext === 'yml') return 'yaml'
	if (ext === 'toml') return 'toml'
	if (ext === 'csv') return 'csv'
	if (ext === 'bib') return 'bibtex'
	return 'plaintext'
}

class ProjectWorkspaceFile implements WorkspaceFile {
	version: number
	doc: Text

	constructor(
		readonly uri: string,
		readonly languageId: string,
		version: number,
		doc: Text,
		private readonly viewProvider: () => EditorView | null
	) {
		this.version = version
		this.doc = doc
	}

	getView(): EditorView | null {
		return this.viewProvider()
	}
}

/** A pending `displayFile()` jump: its promise, and how to cancel its timeout. */
interface PendingDisplay {
	resolve: (view: EditorView | null) => void
	timer: number
}

/**
 * How long a definition jump waits for its document to be displayed. The editor
 * switching files is what resolves it; a jump into a file the editor will not
 * open ends as a miss.
 */
const DISPLAY_TIMEOUT_MS = 2000

/**
 * A workspace backed by the in-memory project: every text file of the project
 * is open on the language server (so `#import` analysis works across files, and
 * a definition jump into a project `.md`/`.json` finds a document to open),
 * while only the active file has an editor view.
 */
export class ProjectWorkspace extends Workspace {
	#host: ProjectWorkspaceHost
	#files = new Map<string, ProjectWorkspaceFile>()
	#views = new Map<string, Set<EditorView>>()
	#versions = new Map<string, number>()
	#displayResolvers = new Map<string, PendingDisplay>()
	#connected = false

	constructor(client: LSPClient, host: ProjectWorkspaceHost) {
		super(client)
		this.#host = host
	}

	get files(): WorkspaceFile[] {
		return [...this.#files.values()]
	}

	/** Add/remove project files on the server. Call on project changes. */
	applyProject(files: readonly ProjectFileSnapshot[]): void {
		const seen = new Set<string>()
		// Only a change the server can see (a text document opened or closed)
		// disturbs its focus. Adding an image, a font or a `.gitkeep` folder
		// placeholder never reaches it, so the attached views stay untouched.
		let serverChanged = false
		for (const snapshot of files) {
			if (!WORKSPACE_TEXT_FILE.test(snapshot.path)) continue
			const uri = pathToUri(snapshot.path)
			seen.add(uri)
			if (this.#files.has(uri)) continue
			const file = this.#makeFile(uri, languageIdForPath(snapshot.path), Text.of(snapshot.content.split('\n')))
			this.#files.set(uri, file)
			if (this.#connected) this.client.didOpen(file)
			serverChanged = true
		}
		for (const uri of this.#files.keys()) {
			if (seen.has(uri)) continue
			this.#files.delete(uri)
			this.#views.delete(uri)
			this.#versions.delete(uri)
			if (this.#connected) this.client.didClose(uri)
			serverChanged = true
		}
		// Opening another file moves the server's focus, and the analysis only
		// publishes diagnostics for the focused document — hand it back to the
		// documents that have an editor attached.
		if (serverChanged) {
			for (const uri of this.#views.keys()) this.#reopen(uri)
		}
	}

	connected(): void {
		this.#connected = true
		super.connected()
	}

	disconnected(): void {
		this.#connected = false
		// Drop pending jumps: their timers and closures would otherwise outlive
		// the connection (and fire against a dead workspace).
		for (const pending of this.#displayResolvers.values()) {
			clearTimeout(pending.timer)
			pending.resolve(null)
		}
		this.#displayResolvers.clear()
		super.disconnected()
	}

	openFile(uri: string, languageId: string, view: EditorView): void {
		let views = this.#views.get(uri)
		if (!views) {
			views = new Set()
			this.#views.set(uri, views)
		}
		views.add(view)

		const file = this.#files.get(uri)
		if (!file) {
			const created = this.#makeFile(uri, languageId, view.state.doc)
			this.#files.set(uri, created)
			if (this.#connected) this.client.didOpen(created)
		} else {
			// Reopen the file on attach: it (re)focuses the document on the
			// server (its analysis only publishes diagnostics for the focused
			// file) and syncs the view's text when the project snapshot is
			// stale (e.g. edits between render and mount). The plugin assumes
			// the server holds the view's document.
			this.#reopen(uri)
		}

		this.#settleDisplay(uri, view)
	}

	/** Close and re-open a file, taking its text from the attached view. */
	#reopen(uri: string): void {
		const file = this.#files.get(uri)
		if (!file || !this.#connected) return
		this.client.didClose(uri)
		const reopened = this.#makeFile(uri, file.languageId, this.#viewFor(uri)?.state.doc ?? file.doc)
		this.#files.set(uri, reopened)
		this.client.didOpen(reopened)
	}

	closeFile(uri: string, view: EditorView): void {
		this.#views.get(uri)?.delete(view)
		// The file stays open on the server while it belongs to the project;
		// applyProject() closes it when it is removed.
	}

	syncFiles(): { file: WorkspaceFile; prevDoc: Text; changes: ChangeSet }[] {
		const updates: { file: WorkspaceFile; prevDoc: Text; changes: ChangeSet }[] = []
		for (const file of this.#files.values()) {
			const view = this.#viewFor(file.uri)
			if (view) {
				const plugin = LSPPlugin.get(view)
				if (!plugin || plugin.unsyncedChanges.empty) continue
				updates.push({ file, prevDoc: file.doc, changes: plugin.unsyncedChanges })
				file.doc = view.state.doc
				file.version = this.nextVersion(file.uri)
				plugin.clear()
			} else {
				const snapshot = this.#host.getFiles().find((f) => pathToUri(f.path) === file.uri)
				if (!snapshot || snapshot.content === file.doc.toString()) continue
				const prevDoc = file.doc
				const changes = ChangeSet.of(
					[{ from: 0, to: prevDoc.length, insert: snapshot.content }],
					prevDoc.length
				)
				updates.push({ file, prevDoc, changes })
				file.doc = Text.of(snapshot.content.split('\n'))
				file.version = this.nextVersion(file.uri)
			}
		}
		return updates
	}

	async displayFile(uri: string): Promise<EditorView | null> {
		const view = this.#viewFor(uri)
		if (view) return view
		if (!this.#files.has(uri)) return null
		// A second jump to the same file supersedes the first: settle it as a miss
		// now instead of leaving it to time out on its own.
		this.#settleDisplay(uri, null)
		const { promise, resolve } = Promise.withResolvers<EditorView | null>()
		const timer = self.setTimeout(() => {
			this.#displayResolvers.delete(uri)
			resolve(null)
		}, DISPLAY_TIMEOUT_MS)
		this.#displayResolvers.set(uri, { resolve, timer })
		this.#host.onNavigate(uriToPath(uri))
		return promise
	}

	/** Hand a view (or a miss) to the jump that is waiting for this URI. */
	#settleDisplay(uri: string, view: EditorView | null): void {
		const pending = this.#displayResolvers.get(uri)
		if (!pending) return
		this.#displayResolvers.delete(uri)
		clearTimeout(pending.timer)
		pending.resolve(view)
	}

	#viewFor(uri: string): EditorView | null {
		const views = this.#views.get(uri)
		if (!views || views.size === 0) return null
		return views.values().next().value ?? null
	}

	#makeFile(uri: string, languageId: string, doc: Text): ProjectWorkspaceFile {
		return new ProjectWorkspaceFile(uri, languageId, this.nextVersion(uri), doc, () =>
			this.#viewFor(uri)
		)
	}

	nextVersion(uri: string): number {
		const version = (this.#versions.get(uri) ?? -1) + 1
		this.#versions.set(uri, version)
		return version
	}
}
