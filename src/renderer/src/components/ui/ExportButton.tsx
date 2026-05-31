import { useState } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Download } from 'lucide-react'
import { toCsv, toJson } from '@renderer/lib/exporters'
import { cn } from '@renderer/lib/cn'
import { Button } from './Button'
import { Spinner } from './Spinner'

interface ExportButtonProps {
  columns: string[]
  rows: unknown[][]
  /** Base filename (without extension). */
  filename: string
  /**
   * Optional async source for the full result set (all pages). When provided,
   * exports use these rows instead of `rows` (which may be just the loaded page).
   */
  fetchRows?: () => Promise<unknown[][]>
}

/** Exports the given result grid to a CSV or JSON file via a save dialog. */
export function ExportButton({
  columns,
  rows,
  filename,
  fetchRows
}: ExportButtonProps): React.JSX.Element {
  const [busy, setBusy] = useState(false)
  const disabled = columns.length === 0

  const exportAs = async (format: 'csv' | 'json'): Promise<void> => {
    setBusy(true)
    try {
      const data = fetchRows ? await fetchRows() : rows
      const content = format === 'csv' ? toCsv(columns, data) : toJson(columns, data)
      await window.api.dialog.saveText(content, {
        defaultName: `${filename}.${format}`,
        filters: [
          { name: format.toUpperCase(), extensions: [format] },
          { name: 'All Files', extensions: ['*'] }
        ]
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild disabled={disabled || busy}>
        <Button size="sm" variant="secondary" disabled={disabled || busy}>
          {busy ? <Spinner size={13} /> : <Download size={13} />}
          Export
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          className="z-50 min-w-36 overflow-hidden rounded-md border border-border bg-surface-2 p-1 text-xs text-text shadow-xl"
        >
          {(['csv', 'json'] as const).map((format) => (
            <DropdownMenu.Item
              key={format}
              onSelect={() => void exportAs(format)}
              className={cn(
                'cursor-pointer rounded px-2 py-1.5 outline-none',
                'data-[highlighted]:bg-accent-soft data-[highlighted]:text-text'
              )}
            >
              Export as {format.toUpperCase()}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
