import { Check, X } from 'lucide-preact'
import { useI18n } from '@/lib/i18n/useI18n'

interface RenameInputProps {
	value: string
	onChange: (value: string) => void
	onRename: () => void
	onCancel: () => void
	/** Input styling; defaults to the tree-item rename input style. */
	inputClassName?: string
}

/**
 * Inline rename editor (input + confirm/cancel). Shared by file and folder tree
 * items and the project name in the file explorer header.
 */
export default function RenameInput({
	value,
	onChange,
	onRename,
	onCancel,
	inputClassName = 'flex-1 px-2 py-1 text-sm bg-gray-700 text-gray-100 border border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500',
}: RenameInputProps) {
	const { t } = useI18n()

	return (
		<>
			<input
				type="text"
				value={value}
				onInput={(e) => onChange(e.currentTarget.value)}
				onKeyDown={(e) => {
					if (e.key === 'Enter') onRename()
					if (e.key === 'Escape') onCancel()
				}}
				className={inputClassName}
				autoFocus
			/>
			<button onClick={onRename} className="p-1 hover:bg-gray-700 rounded" title={t('files.rename')} aria-label={t('files.rename')}>
				<Check className="w-3 h-3 text-green-400" />
			</button>
			<button onClick={onCancel} className="p-1 hover:bg-gray-700 rounded" title={t('files.cancel')} aria-label={t('files.cancel')}>
				<X className="w-3 h-3 text-red-400" />
			</button>
		</>
	)
}
