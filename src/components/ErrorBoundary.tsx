import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryProps {
	children: ReactNode
}

interface ErrorBoundaryState {
	hasError: boolean
	error: Error | null
}

/**
 * 顶层错误边界：捕获子树渲染/生命周期中的未处理错误，
 * 以友好的中文界面替代整屏白屏。开发模式额外展示错误堆栈。
 */
class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
	constructor(props: ErrorBoundaryProps) {
		super(props)
		this.state = { hasError: false, error: null }
	}

	static getDerivedStateFromError(error: Error): ErrorBoundaryState {
		return { hasError: true, error }
	}

	componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
		console.error('[ErrorBoundary] 未捕获的错误：', error, errorInfo)
	}

	handleRetry = (): void => {
		// 重置错误状态，重新尝试渲染子树
		this.setState({ hasError: false, error: null })
	}

	handleReload = (): void => {
		window.location.reload()
	}

	render(): ReactNode {
		const { hasError, error } = this.state

		if (!hasError) {
			return this.props.children
		}

		const isDev = import.meta.env.DEV
		const message = error?.message ?? '未知错误'

		return (
			<div
				role="alert"
				dir="ltr"
				className="flex h-screen w-screen items-center justify-center bg-gray-900 p-6 text-white"
			>
				<div className="w-full max-w-lg rounded-2xl border border-red-500/30 bg-gray-800/80 p-8 shadow-2xl">
					<div className="mb-4 flex items-center gap-3">
						<span
							aria-hidden="true"
							className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/20 text-2xl text-red-400"
						>
							⚠
						</span>
						<h1 className="text-2xl font-bold">出错了</h1>
					</div>

					<p className="mb-2 text-sm text-gray-300">
						{isDev
							? '应用渲染过程中发生了错误，以下是详细信息：'
							: '应用遇到了问题。请尝试重新加载页面。'}
					</p>

					<pre className="mb-6 max-h-60 overflow-auto whitespace-pre-wrap rounded-lg bg-gray-950/60 p-4 text-xs leading-relaxed text-red-300">
						{message}
					</pre>

					{isDev && error?.stack && (
						<details className="mb-6">
							<summary className="cursor-pointer text-xs text-gray-400 hover:text-gray-200">
								查看错误堆栈（仅开发模式可见）
							</summary>
							<pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap rounded-lg bg-gray-950/60 p-4 text-[11px] leading-relaxed text-gray-400">
								{error.stack}
							</pre>
						</details>
					)}

					<div className="flex flex-wrap gap-3">
						<button
							type="button"
							onClick={this.handleRetry}
							className="rounded-lg bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-400"
						>
							重试
						</button>
						<button
							type="button"
							onClick={this.handleReload}
							className="rounded-lg border border-gray-600 px-5 py-2.5 text-sm font-semibold text-gray-200 transition-colors hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500"
						>
							刷新页面
						</button>
					</div>
				</div>
			</div>
		)
	}
}

export default ErrorBoundary
