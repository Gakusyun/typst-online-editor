import { Component, type ComponentChildren } from 'preact'
import { useI18n } from '@/lib/i18n/useI18n'

interface AppErrorBoundaryProps {
	children: ComponentChildren
}

interface AppErrorBoundaryState {
	error: Error | null
}

/**
 * The fallback has to be a function component: it reads the UI language, which
 * only the `I18nProvider` above the boundary can supply.
 */
function ErrorFallback({ error, onReload }: { error: Error; onReload: () => void }) {
	const { t } = useI18n()
	return (
		<div className="flex h-screen flex-col items-center justify-center gap-3 bg-gray-900 p-6 text-center text-gray-200">
			<h1 className="text-lg font-semibold">{t('app.errorTitle')}</h1>
			<p className="max-w-xl font-mono text-xs text-gray-400">{error.message}</p>
			<button
				onClick={onReload}
				className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 transition-colors"
			>
				{t('app.errorReload')}
			</button>
		</div>
	)
}

/**
 * The last line of defence for the render path: a throw anywhere below this
 * (a malformed stored project, a third-party failure) used to unmount the whole
 * tree and leave a blank page with nothing to act on. The boundary keeps the
 * error visible and offers the one thing that reliably helps.
 */
export default class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
	state: AppErrorBoundaryState = { error: null }

	static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
		return { error }
	}

	componentDidCatch(error: Error): void {
		console.error('[app] render failed:', error)
	}

	render() {
		const { error } = this.state
		if (!error) return this.props.children
		return <ErrorFallback error={error} onReload={() => location.reload()} />
	}
}