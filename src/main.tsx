import { render } from 'preact'
import TypstEditor from '@/components/TypstEditor'
import './styles/globals.css'
import './styles/pdfjs-textlayer.css'
import './styles/pdfjs-annotationlayer.css'

const root = document.getElementById('app')
if (!root) throw new Error('missing #app root element')
render(<TypstEditor />, root)
