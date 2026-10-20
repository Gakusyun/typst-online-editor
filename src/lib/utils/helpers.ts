/**
 * Creates a debounced function that delays invoking func until after delay milliseconds
 * have elapsed since the last time the debounced function was invoked.
 */
export function debounce<Args extends unknown[], R>(
	func: (...args: Args) => R,
	delay: number
): {
	(...args: Args): void
	cancel: () => void
} {
	let timeoutId: number | null = null

	const debounced = (...args: Args) => {
		if (timeoutId !== null) {
			clearTimeout(timeoutId)
		}

		timeoutId = window.setTimeout(() => {
			func(...args)
			timeoutId = null
		}, delay)
	}

	debounced.cancel = () => {
		if (timeoutId !== null) {
			clearTimeout(timeoutId)
			timeoutId = null
		}
	}

	return debounced
}

/**
 * Hands a URL to the browser downloader. The anchor must be in the document for the
 * click to count, and the URL must outlive the click: revoking it synchronously makes
 * Firefox and Safari drop large downloads before they start.
 */
function triggerDownload(url: string, filename: string, cleanup?: () => void): void {
	const a = document.createElement('a')
	a.href = url
	a.download = filename
	document.body.appendChild(a)
	a.click()
	a.remove()
	// Release the URL on a later macrotask, once the download has been handed off.
	if (cleanup) setTimeout(cleanup, 0)
}

/**
 * Download a blob as a file
 */
export function downloadBlob(blob: Blob, filename: string): void {
	const url = URL.createObjectURL(blob)
	triggerDownload(url, filename, () => URL.revokeObjectURL(url))
}

/**
 * Download a PDF from a URL
 */
export function downloadPdfFromUrl(url: string, filename: string = 'document.pdf'): void {
	triggerDownload(url, filename)
}
