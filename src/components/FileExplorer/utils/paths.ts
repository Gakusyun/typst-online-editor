import type { Project } from '@/lib/storage/ProjectStorage'

/**
 * Name and path rules shared by every file operation in the explorer.
 *
 * Folders are virtual — a folder exists exactly as long as some file lives
 * under its `path/` prefix — so a name that smuggles a separator silently
 * materialises a folder, and `.`/`..` segments make path lookups reach outside
 * the project. Everything here is the single place those rules live: creation,
 * rename, move and foreign-file drops all go through these helpers.
 */

/**
 * Longest accepted name. Zip entries and the storage keys handle far more, but
 * no legitimate file name in this editor comes close, and a bounded name keeps
 * the tree rows and the persisted keys sane. Counted in UTF-16 code units, so a
 * name of non-BMP characters may hold fewer than this many visible characters.
 */
export const MAX_NAME_LENGTH = 100

/**
 * Returns why `name` cannot be a file or folder name, or `null` when it can.
 *
 * `name` is a single path segment (what the user typed, or the name of a
 * dropped file), never a full path: the reason the result is the *reason* is
 * that callers log it — the UI message itself is localized.
 */
export function validateName(name: string): string | null {
	if (!name.trim()) return 'the name is empty'
	if (name.length > MAX_NAME_LENGTH) return `the name is longer than ${MAX_NAME_LENGTH} characters`
	if (name.includes('/') || name.includes('\\')) return 'the name contains a path separator'
	if (name === '.' || name === '..') return 'the name refers to a directory'
	if (name.startsWith('.') || name.endsWith('.')) return 'the name must not start or end with a dot'
	if (name !== name.trim()) return 'the name must not start or end with a space'
	// Control characters reach the tree rows and the compile log as invisible
	// garbage, so they are refused rather than escaped.
	if ([...name].some(char => char.charCodeAt(0) < 0x20 || char.charCodeAt(0) === 0x7f)) {
		return 'the name contains control characters'
	}
	return null
}

/**
 * True for the paths the explorer never lets the user drag, move or delete
 * through the tree: `main.typ` is the compile entry point, and a `.gitkeep`
 * placeholder is what keeps a virtual folder alive in `buildFileTree`.
 */
export function isProtectedPath(path: string): boolean {
	return path === 'main.typ' || path.endsWith('.gitkeep')
}

/**
 * Folder test: a folder holds no file of its own but has something under it.
 * (The old heuristics called any extension-less file a folder, and only after
 * a child showed up.)
 */
export function isFolderPath(project: Project, path: string): boolean {
	if (!path) return false
	return !project.files.some(file => file.path === path) && project.files.some(file => file.path.startsWith(`${path}/`))
}

/** Appends a segment to a folder path; `''` is the project root. */
export function joinPath(parentPath: string, name: string): string {
	return parentPath ? `${parentPath}/${name}` : name
}

/** The folder a path lives in (`''` at the project root). */
export function parentPathOf(path: string): string {
	const separator = path.lastIndexOf('/')
	return separator < 0 ? '' : path.slice(0, separator)
}

/** The last segment of a path — its file or folder name. */
export function fileNameOf(path: string): string {
	return path.slice(path.lastIndexOf('/') + 1)
}

/** True when `path` is `ancestor` itself or lives below it. */
export function isDescendantPath(path: string, ancestor: string): boolean {
	if (path === ancestor) return true
	return ancestor !== '' && path.startsWith(`${ancestor}/`)
}