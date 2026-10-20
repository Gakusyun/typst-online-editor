import type * as pdfjs from 'pdfjs-dist'

// pdf.js is ~460 KB that only the preview needs, so it is imported on the first
// document rather than at boot — hence the dynamic import and the memo below.
// A static import cannot work here: it would pull the whole viewer library into
// the boot bundle for a feature the user may never open.
let pdfjsPromise: Promise<typeof pdfjs> | null = null

export function getPdfjs() {
	if (!pdfjsPromise) {
		pdfjsPromise = import('pdfjs-dist')
			.then((mod) => {
				// The worker is served from a CDN mirror (mainland-China npm mirror,
				// fastest and most stable there; jsdelivr is unreliable without a
				// proxy) rather than bundled: CDN dependencies are preferred here, and
				// the worker is ~1.26 MB that only the preview needs.
				// Tradeoff, accepted deliberately: pdf.js rewrites a cross-origin
				// `workerSrc` into a blob module worker whose body is `await import(<cdn
				// url>)`, and a blob worker runs with *this page's* origin — so the
				// mirror's code can read what the app keeps in `localStorage` (the AI
				// bearer token). Trust the mirror as a build dependency; see the
				// leftovers note if this ever has to harden.
				mod.GlobalWorkerOptions.workerSrc = `https://registry.npmmirror.com/pdfjs-dist/${mod.version}/files/build/pdf.worker.min.mjs`
				return mod
			})
			.catch((error: unknown) => {
				// Never memoize the rejection: one failed chunk fetch would otherwise
				// poison every later attempt for the rest of the session.
				pdfjsPromise = null
				throw error
			})
	}

	return pdfjsPromise
}