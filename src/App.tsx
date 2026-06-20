import TypstEditor from '@/components/TypstEditor'
import ErrorBoundary from '@/components/ErrorBoundary'

export default function App() {
	return (
		<ErrorBoundary>
			<TypstEditor />
		</ErrorBoundary>
	)
}
