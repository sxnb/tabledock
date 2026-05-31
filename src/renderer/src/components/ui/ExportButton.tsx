import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Download } from 'lucide-react'
import { toCsv, toJson } from '@renderer/lib/exporters'
import { cn } from '@renderer/lib/cn'
import { Button } from './Button'

interface ExportButtonProps {
  columns: string[]
  rows: unknown[][]
  /** Base filename (without extension). */
  filename: string
}

/** Exports the given result grid to a CSV or JSON file via a save dialog. */
export function ExportButton({ columns, rows, filename }: ExportButtonProps): React.JSX.Element {
  const disabled = columns.length === 0

  const exportAs = (format: 'csv' | 'json'): void => {
    const content = format === 'csv' ? toCsv(columns, rows) : toJson(columns, rows)
    void window.api.dialog.saveText(content, {
      defaultName: `${filename}.${format}`,
      filters: [
        { name: format.toUpperCase(), extensions: [format] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild disabled={disabled}>
        <Button size="sm" variant="secondary" disabled={disabled}>
          <Download size={13} />
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
              onSelect={() => exportAs(format)}
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
