import { render } from 'preact'
import TypstEditor from '@/components/TypstEditor'
import I18nProvider from '@/lib/i18n/I18nProvider'
import './styles/globals.css'
import './styles/pdfjs-textlayer.css'
import './styles/pdfjs-annotationlayer.css'

const root = document.getElementById('app')
if (!root) throw new Error('missing #app root element')
render(
	<I18nProvider>
		<TypstEditor />
	</I18nProvider>,
	root
)
