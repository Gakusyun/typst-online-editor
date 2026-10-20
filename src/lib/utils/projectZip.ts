import { zip, unzip, strToU8, strFromU8 } from 'fflate'
import type { Unzipped } from 'fflate'
import type { Project, ProjectFile } from '@/lib/storage/ProjectStorage'

/** Extensions the editor treats as binary (mirrors FileExplorer's upload handling). */
const BINARY_FILE_RE = /\.(png|jpg|jpeg|svg|ttf|otf)$/i
/** Any data URL; the media type may carry parameters, e.g. `data:image/png;charset=utf-8;base64,…`. */
const DATA_URL_RE = /^data:([^,]*),(.*)$/s
/**
 * Compressed archives above this size are rejected outright: everything is read into
 * memory as a single buffer, so a bigger upload cannot be handled by the tab anyway.
 */
const MAX_ARCHIVE_BYTES = 64 * 1024 * 1024
/** Projected uncompressed size above this size is rejected before anything is inflated. */
const MAX_PROJECT_BYTES = 256 * 1024 * 1024
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

/**
 * Serializes a project to a zip archive: files with a binary extension are stored as
 * raw bytes, everything else as UTF-8. Compression runs off the main thread, so
 * exporting a project with multi-megabyte fonts keeps the editor responsive.
 */
export function projectToZip(project: Project): Promise<Uint8Array<ArrayBuffer>> {
	const entries: Record<string, Uint8Array> = {}
	for (const file of project.files) {
		// Binary-ness is decided by extension, the same rule the import path and file
		// uploads use, so the stored bytes survive an export/import round trip even when
		// the text of a file happens to look like a data URL.
		const bytes = BINARY_FILE_RE.test(file.path) ? dataUrlToBytes(file.content) ?? strToU8(file.content) : strToU8(file.content)
		entries[file.path] = bytes
	}
	const { promise, resolve, reject } = Promise.withResolvers<Uint8Array<ArrayBuffer>>()
	zip(entries, (error, archive) => (error ? reject(error) : resolve(archive)))
	return promise
}

export interface ZipToProjectOptions {
	/** Name of the uploaded archive; its base name becomes the project name. */
	archiveName: string
	/** Localized name to use when the archive name yields nothing usable. */
	fallbackName: string
}

/**
 * Builds a project from a zip archive; binary entries become data: URLs, exactly
 * like file uploads. Decompression runs off the main thread and oversized archives
 * are rejected before anything is inflated. Throws when the archive holds no files.
 */
export async function zipToProject(data: Uint8Array, options: ZipToProjectOptions): Promise<Project> {
	if (data.length > MAX_ARCHIVE_BYTES) {
		throw new Error(`archive is larger than ${MAX_ARCHIVE_BYTES / 1024 / 1024} MB`)
	}
	const uncompressedSize = await projectedSize(data)
	if (uncompressedSize > MAX_PROJECT_BYTES) {
		throw new Error(`archive expands to more than ${MAX_PROJECT_BYTES / 1024 / 1024} MB`)
	}
	const entries = await unzipAsync(data)
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
	const name = options.archiveName.replace(/\.zip$/i, '').trim()
	return {
		id: crypto.randomUUID(),
		name: name || options.fallbackName,
		files,
		mainFile,
		createdAt: now,
		lastModified: now,
	}
}

/** Promise wrapper around fflate's asynchronous `zip`/`unzip` callbacks. */
function unzipAsync(data: Uint8Array): Promise<Unzipped> {
	const { promise, resolve, reject } = Promise.withResolvers<Unzipped>()
	unzip(data, (error, files) => (error ? reject(error) : resolve(files)))
	return promise
}

/**
 * Sums the uncompressed sizes advertised in the archive's central directory without
 * inflating anything, so a zip bomb is rejected before it can allocate memory.
 */
function projectedSize(data: Uint8Array): Promise<number> {
	const { promise, resolve, reject } = Promise.withResolvers<number>()
	let total = 0
	// The filter runs for every entry before fflate decompresses any of them; returning
	// false everywhere keeps this pass to a cheap scan of the central directory.
	unzip(
		data,
		{
			filter: (file) => {
				total += file.originalSize
				return false
			},
		},
		(error) => (error ? reject(error) : resolve(total))
	)
	return promise
}

/** Decodes a data URL to bytes; returns null when the content is not a data URL. */
function dataUrlToBytes(content: string): Uint8Array | null {
	const match = DATA_URL_RE.exec(content)
	if (!match) return null
	// Media-type parameters may appear before `base64`, so test the whole parameter list.
	return match[1].split(';').includes('base64')
		? base64ToBytes(match[2].replace(/\s+/g, ''))
		: strToU8(decodeURIComponent(match[2]))
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