import { render } from 'preact'
import TypstEditor from '@/components/TypstEditor'
import AppErrorBoundary from '@/components/AppErrorBoundary'
import I18nProvider from '@/lib/i18n/I18nProvider'
import AppearanceProvider from '@/lib/appearance/AppearanceProvider'
import './styles/globals.css'
import './styles/pdfjs-textlayer.css'
import './styles/pdfjs-annotationlayer.css'

const root = document.getElementById('app')
if (!root) throw new Error('missing #app root element')
render(
	// The boundary sits inside the providers so its fallback can still read the
	// UI language, and outside the editor so a render throw is contained.
	<I18nProvider>
		<AppErrorBoundary>
			<AppearanceProvider>
				<TypstEditor />
			</AppearanceProvider>
		</AppErrorBoundary>
	</I18nProvider>,
	root
)