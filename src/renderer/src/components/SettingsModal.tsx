import { useEffect, useState } from 'react'
import { Sun, Moon, Monitor, Sparkles, Palette, CheckCircle2 } from 'lucide-react'
import type { AiProvider, ThemeMode } from '@shared/types'
import { useSettings } from '@renderer/store/settings'
import { useAi, DEFAULT_MODEL } from '@renderer/store/ai'
import { toast } from '@renderer/store/toasts'
import { cn } from '@renderer/lib/cn'
import { Modal } from './ui/Modal'
import { Button } from './ui/Button'
import { Input } from './ui/Input'
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

const PROVIDERS: { value: AiProvider; label: string }[] = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' }
]

type Tab = 'appearance' | 'ai'

interface SettingsModalProps {
  open: boolean
  onClose: () => void
  initialTab?: Tab
}

export function SettingsModal({
  open,
  onClose,
  initialTab = 'appearance'
}: SettingsModalProps): React.JSX.Element {
  const [tab, setTab] = useState<Tab>(initialTab)

  // Honour the requested tab whenever the modal is (re)opened.
  const [lastOpen, setLastOpen] = useState(open)
  if (open && !lastOpen) {
    setLastOpen(true)
    setTab(initialTab)
  } else if (!open && lastOpen) {
    setLastOpen(false)
  }

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
      <div className="flex flex-col gap-4">
        <div className="flex gap-1 rounded-lg border border-border bg-surface-2 p-1">
          <TabButton
            active={tab === 'appearance'}
            onClick={() => setTab('appearance')}
            icon={Palette}
          >
            Appearance
          </TabButton>
          <TabButton active={tab === 'ai'} onClick={() => setTab('ai')} icon={Sparkles}>
            AI Assistant
          </TabButton>
        </div>

        {tab === 'appearance' ? <AppearanceTab /> : <AiTab />}
      </div>
    </Modal>
  )
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  children
}: {
  active: boolean
  onClick: () => void
  icon: typeof Sun
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-colors',
        active ? 'bg-accent text-white' : 'text-muted hover:bg-surface-3 hover:text-text'
      )}
    >
      <Icon size={14} />
      {children}
    </button>
  )
}

function AppearanceTab(): React.JSX.Element {
  const sidebar = useSettings((s) => s.settings.sidebar)
  const setSidebar = useSettings((s) => s.setSidebar)
  const themeMode = useSettings((s) => s.settings.themeMode)
  const setThemeMode = useSettings((s) => s.setThemeMode)

  return (
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
          <h3 className="text-xs font-semibold uppercase tracking-wider text-faint">Noise level</h3>
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
  )
}

function AiTab(): React.JSX.Element {
  const storeProvider = useAi((s) => s.provider)
  const storeModel = useAi((s) => s.model)
  const setConfig = useAi((s) => s.setConfig)
  const saveKey = useAi((s) => s.saveKey)

  const [provider, setProvider] = useState<AiProvider>(storeProvider)
  const [model, setModel] = useState(storeModel)
  const [apiKey, setApiKey] = useState('')
  const [keySaved, setKeySaved] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    void window.api.ai.hasKey(provider).then(setKeySaved)
  }, [provider])

  const onProvider = (p: AiProvider): void => {
    setProvider(p)
    setModel(DEFAULT_MODEL[p])
    setApiKey('')
  }

  const save = async (): Promise<void> => {
    setSaving(true)
    try {
      await setConfig(provider, model.trim() || DEFAULT_MODEL[provider])
      if (apiKey.trim()) {
        await saveKey(provider, apiKey.trim())
        setApiKey('')
        setKeySaved(true)
      }
      toast.success('AI settings saved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs leading-relaxed text-muted">
        Ask questions in plain English and get a query for the open database. Bring your own API key
        — it’s encrypted and stored locally, and only your database schema (table and column names)
        is sent to the provider, never your data.
      </p>

      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-faint">Provider</h3>
        <div className="flex gap-1 rounded-lg border border-border bg-surface-2 p-1">
          {PROVIDERS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => onProvider(p.value)}
              className={cn(
                'flex-1 rounded-md py-1.5 text-xs font-medium transition-colors',
                provider === p.value
                  ? 'bg-accent text-white'
                  : 'text-muted hover:bg-surface-3 hover:text-text'
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </section>

      <Input
        label="Model"
        value={model}
        onChange={(e) => setModel(e.target.value)}
        placeholder={DEFAULT_MODEL[provider]}
      />

      <div className="flex flex-col gap-1.5">
        <span className="flex items-center gap-2 text-xs font-medium text-muted">
          API key
          {keySaved && (
            <span className="flex items-center gap-1 text-ok">
              <CheckCircle2 size={12} /> saved
            </span>
          )}
        </span>
        <Input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={keySaved ? '•••••••••• (leave blank to keep)' : `${provider} API key`}
        />
      </div>

      <Button variant="primary" onClick={save} disabled={saving} className="self-start">
        Save AI settings
      </Button>
    </div>
  )
}
