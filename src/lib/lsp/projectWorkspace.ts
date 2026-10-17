import { ChangeSet, Text } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import { LSPPlugin, Workspace, type LSPClient, type WorkspaceFile } from '@codemirror/lsp-client'

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

const TYPST_FILE = /\.typ$/i

export function pathToUri(path: string): string {
	const encoded = path
		.split('/')
		.filter(Boolean)
		.map(encodeURIComponent)
		.join('/')
	return `file:///${encoded}`
}

export function uriToPath(uri: string): string {
	const pathname = new URL(uri).pathname
	return decodeURIComponent(pathname).replace(/^\//, '')
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

/**
 * A workspace backed by the in-memory project: every `*.typ` file of the
 * project is open on the language server (so `#import` analysis works across
 * files), while only the active file has an editor view.
 */
export class ProjectWorkspace extends Workspace {
	#host: ProjectWorkspaceHost
	#files = new Map<string, ProjectWorkspaceFile>()
	#views = new Map<string, Set<EditorView>>()
	#versions = new Map<string, number>()
	#displayResolvers = new Map<string, (view: EditorView | null) => void>()
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
		for (const snapshot of files) {
			if (!TYPST_FILE.test(snapshot.path)) continue
			const uri = pathToUri(snapshot.path)
			seen.add(uri)
			if (this.#files.has(uri)) continue
			const file = this.#makeFile(uri, 'typst', Text.of(snapshot.content.split('\n')))
			this.#files.set(uri, file)
			if (this.#connected) this.client.didOpen(file)
		}
		for (const uri of this.#files.keys()) {
			if (seen.has(uri)) continue
			this.#files.delete(uri)
			this.#views.delete(uri)
			this.#versions.delete(uri)
			if (this.#connected) this.client.didClose(uri)
		}
	}

	connected(): void {
		this.#connected = true
		super.connected()
	}

	disconnected(): void {
		this.#connected = false
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
		} else if (!file.doc.eq(view.state.doc)) {
			// The plugin assumes the server holds the view's document. When the
			// project snapshot is stale (e.g. edits between render and mount),
			// reopen the file with the view's text.
			if (this.#connected) this.client.didClose(uri)
			const reopened = this.#makeFile(uri, file.languageId, view.state.doc)
			this.#files.set(uri, reopened)
			if (this.#connected) this.client.didOpen(reopened)
		}

		const resolve = this.#displayResolvers.get(uri)
		if (resolve) {
			this.#displayResolvers.delete(uri)
			resolve(view)
		}
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
		const previous = this.#displayResolvers.get(uri)
		if (previous) previous(null)
		const { promise, resolve } = Promise.withResolvers<EditorView | null>()
		const timer = self.setTimeout(() => {
			this.#displayResolvers.delete(uri)
			resolve(null)
		}, 2000)
		this.#displayResolvers.set(uri, (next) => {
			clearTimeout(timer)
			resolve(next)
		})
		this.#host.onNavigate(uriToPath(uri))
		return promise
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
