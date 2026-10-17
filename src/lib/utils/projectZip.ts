import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate'
import type { Project, ProjectFile } from '@/lib/storage/ProjectStorage'

/** Extensions the editor treats as binary (mirrors FileExplorer's upload handling). */
const BINARY_FILE_RE = /\.(png|jpg|jpeg|svg|ttf|otf)$/i
const DATA_URL_RE = /^data:[^;]+;base64,(.+)$/
const MIME_TYPES: Record<string, string> = {
	png: 'image/png',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	svg: 'image/svg+xml',
	ttf: 'font/ttf',
	otf: 'font/otf',
}

/** Download name for a project zip: the project name, minus Windows-forbidden characters. */
export function projectZipName(project: Project): string {
	const name = project.name.replace(/[\\/:*?"<>|]/g, '_').trim()
	return `${name || 'project'}.zip`
}

/** Serializes a project to a zip archive: text files as UTF-8, binaries as raw bytes. */
export function projectToZip(project: Project): Uint8Array {
	const entries: Record<string, Uint8Array> = {}
	for (const file of project.files) {
		const dataUrl = file.content.match(DATA_URL_RE)
		entries[file.path] = dataUrl ? base64ToBytes(dataUrl[1]) : strToU8(file.content)
	}
	return zipSync(entries)
}

/**
 * Builds a project from a zip archive; binary entries become data: URLs, exactly
 * like file uploads. Throws when the archive holds no files.
 */
export function zipToProject(data: Uint8Array, archiveName: string): Project {
	const entries = unzipSync(data)
	const now = Date.now()
	const files: ProjectFile[] = []
	for (const [path, bytes] of Object.entries(entries)) {
		if (path.endsWith('/')) continue // directory entry
		files.push({
			path,
			content: BINARY_FILE_RE.test(path) ? bytesToDataUrl(bytes, path) : strFromU8(bytes),
			lastModified: now,
		})
	}
	if (files.length === 0) {
		throw new Error('archive contains no files')
	}
	const mainFile =
		files.find((file) => file.path === 'main.typ')?.path ??
		files.find((file) => file.path.endsWith('.typ'))?.path ??
		files[0].path
	const name = archiveName.replace(/\.zip$/i, '').trim()
	return {
		id: crypto.randomUUID(),
		name: name || 'Imported Project',
		files,
		mainFile,
		createdAt: now,
		lastModified: now,
	}
}

function base64ToBytes(base64: string): Uint8Array {
	const binary = atob(base64)
	const bytes = new Uint8Array(binary.length)
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i)
	}
	return bytes
}

function bytesToDataUrl(bytes: Uint8Array, path: string): string {
	const extension = path.split('.').pop()?.toLowerCase() ?? ''
	const mime = MIME_TYPES[extension] ?? 'application/octet-stream'
	return `data:${mime};base64,${bytesToBase64(bytes)}`
}

function bytesToBase64(bytes: Uint8Array): string {
	let binary = ''
	// Chunked to avoid blowing the stack on large font/image files.
	const CHUNK = 0x8000
	for (let i = 0; i < bytes.length; i += CHUNK) {
		binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
	}
	return btoa(binary)
}
