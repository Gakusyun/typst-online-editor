let pdfjsPromise: Promise<typeof import('pdfjs-dist')> | null = null;

export async function getPdfjs() {
	if (!pdfjsPromise) {
		pdfjsPromise = import('pdfjs-dist').then((mod) => {
			// PDF.js worker via npmmirror (mainland-China npm mirror, fastest and most
			// stable there; jsdelivr is unreliable without a proxy).
			mod.GlobalWorkerOptions.workerSrc = `https://registry.npmmirror.com/pdfjs-dist/${mod.version}/files/build/pdf.worker.min.mjs`;
			// PDF.js 的 viewer（`pdfjs-dist/web/pdf_viewer.mjs`）会从 `globalThis.pdfjsLib` 读取核心 API。
			(globalThis as unknown as { pdfjsLib?: typeof import('pdfjs-dist') }).pdfjsLib = mod;
			return mod;
		});
	}

	return pdfjsPromise;
}
