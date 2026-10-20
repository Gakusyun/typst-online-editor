import { safeGet, safeSet } from './safeStorage'

// ============================================================================
// Types
// ============================================================================

export interface ProjectFile {
	path: string // e.g., 'template.typ', 'document.typ'
	content: string
	lastModified: number
}

export interface Project {
	id: string
	name: string
	files: ProjectFile[]
	mainFile: string // which file to compile (e.g., 'document.typ')
	createdAt: number
	lastModified: number
}

/** What a save did: the stamped project, and whether it reached storage. */
export interface SaveResult {
	project: Project
	persisted: boolean
}

// ============================================================================
// Storage Implementation
// ============================================================================

const STORAGE_KEY_PREFIX = 'typst-project-'
const PROJECTS_LIST_KEY = 'typst-projects-list'

/** A stored record, or `null` when it is not shaped like a project. */
function asProject(value: unknown): Project | null {
	if (typeof value !== 'object' || value === null) return null
	const record = value as Record<string, unknown>
	if (typeof record.id !== 'string' || typeof record.name !== 'string') return null
	if (!Array.isArray(record.files)) return null
	const files: ProjectFile[] = []
	for (const entry of record.files) {
		if (typeof entry !== 'object' || entry === null) return null
		const file = entry as Record<string, unknown>
		if (typeof file.path !== 'string' || typeof file.content !== 'string') return null
		files.push({
			path: file.path,
			content: file.content,
			lastModified: typeof file.lastModified === 'number' ? file.lastModified : 0,
		})
	}
	if (typeof record.mainFile !== 'string' || !files.some((file) => file.path === record.mainFile)) {
		return null
	}
	const time = (field: unknown): number => (typeof field === 'number' ? field : 0)
	return {
		id: record.id,
		name: record.name,
		files,
		mainFile: record.mainFile,
		createdAt: time(record.createdAt),
		lastModified: time(record.lastModified),
	}
}

/** The metadata of one project, as the picker list shows it. */
function asProjectSummary(value: unknown): { id: string; name: string; lastModified: number } | null {
	if (typeof value !== 'object' || value === null) return null
	const record = value as Record<string, unknown>
	if (typeof record.id !== 'string' || typeof record.name !== 'string') return null
	return {
		id: record.id,
		name: record.name,
		lastModified: typeof record.lastModified === 'number' ? record.lastModified : 0,
	}
}

export class ProjectStorage {
	/**
	 * Save a project to localStorage.
	 *
	 * The caller's object is never touched: the timestamps go onto a copy, which
	 * is what gets persisted *and* returned, so state and storage cannot drift.
	 * `persisted` is `false` when the browser refused the write (quota, blocked
	 * storage) — the caller decides how to tell the user.
	 */
	save(project: Project): SaveResult {
		const now = Date.now()
		const stamped: Project = {
			...project,
			createdAt: project.createdAt || now,
			lastModified: now,
			files: project.files.map((file) => ({
				...file,
				lastModified: file.lastModified || now,
			})),
		}

		const persisted = safeSet(STORAGE_KEY_PREFIX + stamped.id, JSON.stringify(stamped))
		const list = this.list().filter((entry) => entry.id !== stamped.id)
		list.push({ id: stamped.id, name: stamped.name, lastModified: stamped.lastModified })
		safeSet(PROJECTS_LIST_KEY, JSON.stringify(list))

		return { project: stamped, persisted }
	}

	/**
	 * Load a project from localStorage. A record that does not match the shape
	 * is reported as missing rather than returned half-parsed — the caller keeps
	 * the record on disk and can fall back to another project.
	 */
	load(id: string): Project | null {
		const data = safeGet(STORAGE_KEY_PREFIX + id)
		if (!data) return null
		try {
			const project = asProject(JSON.parse(data))
			if (!project) console.error(`[storage] project "${id}" has an unexpected shape`)
			return project
		} catch (error) {
			console.error('[storage] failed to parse project:', error)
			return null
		}
	}

	/**
	 * List all projects (metadata only). Entries whose payload is gone are
	 * dropped here rather than offered to the user as unopenable projects.
	 */
	list(): Array<{ id: string; name: string; lastModified: number }> {
		const data = safeGet(PROJECTS_LIST_KEY)
		if (!data) return []

		let parsed: unknown
		try {
			parsed = JSON.parse(data)
		} catch (error) {
			console.error('[storage] failed to parse projects list:', error)
			return []
		}
		if (!Array.isArray(parsed)) return []

		const entries = parsed
			.map(asProjectSummary)
			.filter((entry): entry is { id: string; name: string; lastModified: number } => entry !== null)
		const existing = entries.filter((entry) => safeGet(STORAGE_KEY_PREFIX + entry.id) !== null)
		if (existing.length !== entries.length) {
			safeSet(PROJECTS_LIST_KEY, JSON.stringify(existing))
		}
		return existing
	}

	/** Create a new empty project (already persisted). */
	createNew(name: string): Project {
		const project: Project = {
			id: crypto.randomUUID(),
			name,
			files: [
				{
					path: 'main.typ',
					content: `= ${name}\n\nStart writing your document here.`,
					lastModified: Date.now(),
				},
			],
			mainFile: 'main.typ',
			createdAt: Date.now(),
			lastModified: Date.now(),
		}
		return this.save(project).project
	}
}

// Singleton instance
export const projectStorage = new ProjectStorage()