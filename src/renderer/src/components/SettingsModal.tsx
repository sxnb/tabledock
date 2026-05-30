import { Sun, Moon, Monitor } from 'lucide-react'
import type { ThemeMode } from '@shared/types'
import { useSettings } from '@renderer/store/settings'
import { cn } from '@renderer/lib/cn'
import { Modal } from './ui/Modal'
import { Button } from './ui/Button'
import { Slider } from './ui/Slider'
import { ColorPicker } from './ui/ColorPicker'
import { NoiseBackground } from './ui/NoiseBackground'

const THEME_OPTIONS: { value: ThemeMode; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor }
]

/** Upper bound for the noise overlay opacity. The slider works in 0..100%. */
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
  const themeMode = useSettings((s) => s.settings.themeMode)
  const setThemeMode = useSettings((s) => s.setThemeMode)

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
          <h3 className="text-xs font-semibold uppercase tracking-wider text-faint">Theme</h3>
          <div className="flex gap-1 rounded-lg border border-border bg-surface-2 p-1">
            {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => void setThemeMode(value)}
                className={cn(
                  'flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-colors',
                  themeMode === value
                    ? 'bg-accent text-white'
                    : 'text-muted hover:bg-surface-3 hover:text-text'
                )}
              >
                <Icon size={14} />
                {label}
              </button>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-2.5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-faint">
            Sidebar background
          </h3>
          <ColorPicker
            value={sidebar.color}
            presets={BACKGROUND_PRESETS}
            allowCustom
            onChange={(color) => void setSidebar({ color })}
          />
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
            max={100}
            step={5}
            value={Math.round((sidebar.noise / MAX_NOISE) * 100)}
            disabled={!sidebar.color}
            onChange={(percent) => {
              window.api.haptics.tap()
              void setSidebar({ noise: (percent / 100) * MAX_NOISE })
            }}
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
