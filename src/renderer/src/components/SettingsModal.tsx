import { Ban, Check } from 'lucide-react'
import { useSettings } from '@renderer/store/settings'
import { cn } from '@renderer/lib/cn'
import { Modal } from './ui/Modal'
import { Button } from './ui/Button'
import { Slider } from './ui/Slider'
import { NoiseBackground } from './ui/NoiseBackground'

/** Upper bound for the noise overlay opacity (slider maps 0..MAX_NOISE → 0..100%). */
const MAX_NOISE = 0.2

const BACKGROUND_PRESETS = [
  '#2b2150',
  '#1e2a4a',
  '#0f2e3d',
  '#16302a',
  '#3a1f2e',
  '#3a2a16',
  '#2a1c3d',
  '#1b1d2a'
]

interface SettingsModalProps {
  open: boolean
  onClose: () => void
}

export function SettingsModal({ open, onClose }: SettingsModalProps): React.JSX.Element {
  const sidebar = useSettings((s) => s.settings.sidebar)
  const setSidebar = useSettings((s) => s.setSidebar)

  return (
    <Modal
      open={open}
      title="Settings"
      onClose={onClose}
      footer={
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        <section className="flex flex-col gap-2.5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-faint">
            Sidebar background
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              title="Default (no background)"
              onClick={() => void setSidebar({ color: null })}
              className={cn(
                'grid h-7 w-7 place-items-center rounded-md border border-border text-faint transition-colors hover:text-text',
                !sidebar.color && 'ring-2 ring-accent ring-offset-2 ring-offset-surface'
              )}
            >
              <Ban size={13} />
            </button>
            {BACKGROUND_PRESETS.map((color) => (
              <button
                key={color}
                type="button"
                title={color}
                onClick={() => void setSidebar({ color })}
                style={{ background: color }}
                className={cn(
                  'grid h-7 w-7 place-items-center rounded-md border border-white/10 transition-transform hover:scale-110',
                  sidebar.color === color &&
                    'ring-2 ring-white/80 ring-offset-2 ring-offset-surface'
                )}
              >
                {sidebar.color === color && <Check size={13} className="text-white" />}
              </button>
            ))}
            <label
              className="grid h-7 w-7 cursor-pointer place-items-center rounded-md border border-border text-[10px] text-faint hover:text-text"
              title="Custom color"
            >
              <input
                type="color"
                value={sidebar.color ?? '#2b2150'}
                onChange={(e) => void setSidebar({ color: e.target.value })}
                className="sr-only"
              />
              <span aria-hidden>+</span>
            </label>
          </div>
        </section>

        <section className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-faint">
              Noise level
            </h3>
            <span className="text-xs tabular-nums text-muted">
              {Math.round((sidebar.noise / MAX_NOISE) * 100)}%
            </span>
          </div>
          <Slider
            min={0}
            max={MAX_NOISE}
            step={0.01}
            value={sidebar.noise}
            disabled={!sidebar.color}
            onChange={(noise) => void setSidebar({ noise })}
          />
        </section>

        <section className="flex flex-col gap-2.5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-faint">Preview</h3>
          <div className="relative h-24 overflow-hidden rounded-lg border border-border bg-surface">
            <NoiseBackground color={sidebar.color} noise={sidebar.noise} />
            <div className="relative z-10 flex h-full items-center px-3 text-xs text-text">
              {sidebar.color ? 'Sidebar preview' : 'Default surface'}
            </div>
          </div>
        </section>
      </div>
    </Modal>
  )
}
