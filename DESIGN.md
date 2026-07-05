# Design System

A reusable design reference for projects built with **React + Tailwind CSS v4**. Extracted from TableDock.

---

## Principles

- **Dark-first.** The dark theme is the primary experience; light is an override.
- **Minimal chrome.** Borders and surfaces are subtle. Ink is the focus.
- **Consistent density.** 13px base font, 36px (h-9) standard control height, tight but breathable spacing.
- **One accent.** A single purple/blue accent color (`accent`) carries all interactive meaning — focus rings, active states, primary buttons.
- **Three text roles.** `text` for primary content, `muted` for labels and secondary info, `faint` for placeholders and decorative hints.

---

## Color Tokens

Defined as CSS custom properties in `@theme {}` (Tailwind v4). Override the full set inside `:root[data-theme='light']` for the light theme.

### Dark theme (default)

| Token                   | Value      | Role                                      |
| ----------------------- | ---------- | ----------------------------------------- |
| `--color-bg`            | `#0a0c14`  | App background                            |
| `--color-surface`       | `#11131f`  | Card / panel surface                      |
| `--color-surface-2`     | `#181b2a`  | Raised surface (inputs, hover backgrounds)|
| `--color-surface-3`     | `#1f2334`  | Further raised (active items, tooltips)   |
| `--color-border`        | `#262a3d`  | Default border                            |
| `--color-border-strong` | `#343a52`  | Emphasized border (hover, tooltips)       |
| `--color-text`          | `#e6e8f2`  | Primary text                              |
| `--color-muted`         | `#8b90a8`  | Secondary text, labels                    |
| `--color-faint`         | `#5b6076`  | Placeholders, decorative hints            |
| `--color-accent`        | `#8b7bff`  | Primary interactive color                 |
| `--color-accent-hover`  | `#9c8eff`  | Accent hover state                        |
| `--color-accent-soft`   | `#2a2550`  | Accent tint for backgrounds               |
| `--color-blue`          | `#5b8cff`  | Informational, links                      |
| `--color-danger`        | `#ff6b81`  | Destructive actions, errors               |
| `--color-ok`            | `#4ade80`  | Success states                            |

### Light theme overrides

| Token                   | Value      |
| ----------------------- | ---------- |
| `--color-bg`            | `#f4f5f8`  |
| `--color-surface`       | `#ffffff`  |
| `--color-surface-2`     | `#f0f1f5`  |
| `--color-surface-3`     | `#e6e8ef`  |
| `--color-border`        | `#dde0e8`  |
| `--color-border-strong` | `#c4c9d6`  |
| `--color-text`          | `#1b1e2b`  |
| `--color-muted`         | `#5b6076`  |
| `--color-faint`         | `#9296a8`  |
| `--color-accent`        | `#6d5dd3`  |
| `--color-accent-hover`  | `#5d4dc0`  |
| `--color-accent-soft`   | `#e8e4fb`  |
| `--color-blue`          | `#3f6fd6`  |
| `--color-danger`        | `#d83a4e`  |
| `--color-ok`            | `#2f9e54`  |

Apply light theme via `document.documentElement.dataset.theme = 'light'`.

---

## Typography

```css
font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
font-size: 13px;
line-height: 1.5;
-webkit-font-smoothing: antialiased;
```

Monospace (code, query editor, masked keys):
```css
font-family: 'JetBrains Mono', 'SF Mono', ui-monospace, Menlo, Monaco, monospace;
```

### Text scale in use

| Class         | Size | Role                                   |
| ------------- | ---- | -------------------------------------- |
| `text-[11px]` | 11px | Fine print, timestamps, secondary hints|
| `text-xs`     | 12px | Labels, badges, form help text         |
| `text-[13px]` | 13px | Body, inputs, buttons (base size)      |
| `text-sm`     | 14px | Modal titles, section headings         |
| `text-lg`     | 18px | Page headings (welcome screen)         |

---

## Spacing & Sizing

| Concept                            | Value                                                      |
| ---------------------------------- | ---------------------------------------------------------- |
| Standard control height            | `h-9` (36px)                                               |
| Small control height               | `h-7` (28px)                                               |
| Icon button size                   | `h-7 w-7`                                                  |
| Standard border radius             | `rounded-md` (6px)                                         |
| Card / modal border radius         | `rounded-xl` (12px)                                        |
| Standard padding (inline controls) | `px-3.5`                                                   |
| Small padding                      | `px-2.5`                                                   |
| Form gap                           | `gap-1.5` between label and input; `gap-4` between fields  |

---

## Components

### Button

Four variants, two sizes.

```tsx
<Button variant="primary">Save</Button>
<Button variant="secondary">Cancel</Button>
<Button variant="ghost">Dismiss</Button>
<Button variant="danger">Delete</Button>
<Button size="sm">Small</Button>
```

| Variant     | Style                                                             |
| ----------- | ----------------------------------------------------------------- |
| `primary`   | `bg-accent text-white hover:bg-accent-hover`, subtle glow shadow  |
| `secondary` | `bg-surface-2 border border-border hover:bg-surface-3`            |
| `ghost`     | `text-muted hover:text-text hover:bg-surface-2`                   |
| `danger`    | `text-danger border border-danger/40 hover:bg-danger/10`          |

All variants share: `rounded-md font-medium transition-colors focus-visible:ring-2 focus-visible:ring-accent/60 disabled:opacity-60`.

Sizes: `md` → `h-9 px-3.5 text-[13px]`, `sm` → `h-7 px-2.5 text-xs`.

---

### IconButton

Square icon-only button with an accessible label and built-in tooltip.

```tsx
<IconButton label="Close" onClick={onClose}>
  <X size={16} />
</IconButton>
```

Base: `h-7 w-7 rounded-md text-muted hover:bg-surface-2 hover:text-text`.

---

### Input

```tsx
<Input label="Host" placeholder="localhost" />
<Input type="password" value={key} onChange={...} />
```

Base: `h-9 w-full rounded-md border border-border bg-surface px-3 text-[13px]`
States: `hover:border-border-strong`, `focus:border-accent focus:ring-2 focus:ring-accent/30`
Placeholder: `text-faint`

When `label` is provided, wraps in a `<label>` with `text-xs font-medium text-muted` and `gap-1.5`.

---

### Select

```tsx
<Select label="Driver" value={kind} onChange={...}>
  <option value="mysql">MySQL</option>
</Select>
```

Same height/border/focus treatment as Input. Custom chevron via absolute-positioned `ChevronDown` icon; native `<select>` with `appearance-none`.

---

### Toggle

```tsx
<Toggle checked={enabled} onChange={setEnabled} label="Enable SSL" />
```

`h-5 w-9 rounded-full`. Track: `bg-surface-3` → `bg-accent`. Thumb: white circle, `translate-x-0.5` → `translate-x-4`.

---

### Modal

```tsx
<Modal open={open} title="Edit connection" onClose={onClose} size="lg" footer={<Button>Save</Button>}>
  {/* content */}
</Modal>
```

Overlay: `bg-black/60 backdrop-blur-sm`. Panel: `rounded-xl border border-border bg-surface shadow-2xl`. Max widths: `md` → `max-w-md`, `lg` → `max-w-lg`, `xl` → `max-w-2xl`. Body scrolls at `max-h-[70vh]`. Footer: `bg-surface-2 border-t border-border`.

Closes on Escape or overlay click.

---

### Tooltip

```tsx
<Tooltip label="Disconnect">
  <IconButton label="Disconnect" onClick={...}>
    <Unplug size={15} />
  </IconButton>
</Tooltip>
```

Powered by Radix UI. Style: `rounded-md border border-border-strong bg-surface-3 px-2 py-1 text-xs shadow-xl`. Arrow fill matches `surface-3`.

---

### Tabs

```tsx
<Tabs tabs={tabs} activeId={activeId} onSelect={setActive} onClose={closeTab} />
```

Strip: `bg-surface border-b border-border`. Active tab: `bg-surface-2 text-text` with a 2px `accent` underline via `shadow-[inset_0_-2px_0_0_var(--color-accent)]`. Inactive: `text-muted hover:bg-surface-2/50`. Close button fades in on group hover.

---

### EmptyState

```tsx
<EmptyState
  icon={<DatabaseZap size={28} className="text-faint" />}
  title="No tables found"
  description="This database appears to be empty."
  action={<Button>Create table</Button>}
/>
```

Centered column layout: `flex flex-col items-center justify-center gap-3 text-center`. Icon in `text-faint`, title in `text-sm font-medium text-text`, description in `text-xs text-muted max-w-sm leading-relaxed`.

---

### Toast

Three types: `success` (`text-ok`), `error` (`text-danger`), `info` (`text-accent`).

Container: fixed `bottom-4 right-4`, `w-80`. Each toast: `rounded-lg border border-border bg-surface-2 px-3 py-2.5 shadow-xl`. Entrance animation via `dd-toast-in` keyframe (fade + 6px slide up, 0.15s ease-out).

---

## Scrollbars

Thin, themed scrollbars across the app:

```css
::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb {
  background: var(--color-border-strong);
  border-radius: 6px;
  border: 2px solid transparent;
  background-clip: padding-box;
}
::-webkit-scrollbar-thumb:hover { background: var(--color-faint); }
```

---

## Animations

### Toast entrance

```css
@keyframes dd-toast-in {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}
.dd-toast-in { animation: dd-toast-in 0.15s ease-out; }
```

### Blob morph (AI button)

A playful border-radius morph on hover. Starts/ends at 35% so the easing is smooth.

```css
@keyframes dd-blob {
  0%, 100% { border-radius: 35%; }
  25%  { border-radius: 62% 38% 45% 55% / 55% 62% 38% 45%; }
  50%  { border-radius: 40% 60% 58% 42% / 60% 38% 62% 40%; }
  75%  { border-radius: 55% 45% 62% 38% / 42% 58% 45% 55%; }
}
.dd-blob { border-radius: 35%; transition: border-radius 0.4s ease; }
.dd-blob:hover { animation: dd-blob 5s ease-in-out infinite; }
```

### Radial glow (empty / welcome screens)

```css
.dd-glow {
  background: radial-gradient(600px circle at 50% 30%, rgba(139, 123, 255, 0.12), transparent 60%);
}
```

---

## Themed Sidebar with Noise Background

The sidebar supports a user-configurable background color with a multi-stop mesh gradient and a pixelated noise overlay — similar to Arc browser's sidebar theming.

### How it works

Three layers stack inside a `relative overflow-hidden` container:

1. **Mesh gradient** — three overlapping radial/linear gradients derived from a single base color using `lighten` and `darken` helpers.
2. **Pixel noise** — a 128×128 canvas of random grayscale static, upscaled to 256px with `image-rendering: pixelated` for chunky 2×2 pixel blocks, blended with `mix-blend-mode: overlay` at a configurable opacity.
3. **Content** — sits above both layers via `relative z-10`.

### NoiseBackground component

```tsx
<aside className="relative flex w-64 flex-col overflow-hidden border-r border-border bg-surface">
  <NoiseBackground color={sidebarBg.color} noise={sidebarBg.noise} />
  <div className="relative z-10 flex min-h-0 flex-1 flex-col">
    {/* sidebar content */}
  </div>
</aside>
```

Props:
- `color: string | null` — hex background color. `null` renders nothing (no themed background).
- `noise: number` — overlay opacity, `0..1`. Typically `0.04–0.15`.

### Gradient mesh

Built from a single base color using `lighten` / `darken` mix helpers:

```ts
function buildGradient(color: string): string {
  return [
    `radial-gradient(120% 75% at 0% 0%, ${lighten(color, 0.16)}, transparent 55%)`,
    `radial-gradient(120% 75% at 100% 15%, ${lighten(color, 0.05)}, transparent 50%)`,
    `linear-gradient(165deg, ${darken(color, 0.04)}, ${darken(color, 0.24)})`
  ].join(', ')
}
```

### Color helpers

```ts
// Mix a hex color toward a target RGB by `amount` (0..1)
export const lighten = (hex: string, amount: number): string => mix(hex, [255, 255, 255], amount)
export const darken  = (hex: string, amount: number): string => mix(hex, [0, 0, 0], amount)

// Pick black (#000000) or white (#ffffff) for readable contrast (YIQ)
export function contrastText(hex: string): '#000000' | '#ffffff' {
  const rgb = hexToRgb(hex)
  if (!rgb) return '#ffffff'
  const yiq = (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000
  return yiq >= 150 ? '#000000' : '#ffffff'
}
```

### Adapting text and active states to the theme

When a color is active, foreground text must switch to black or white for contrast. Active connection rows use a darkened, semi-transparent variant of the base color:

```ts
const themed  = Boolean(sidebarBg.color)
const activeBg = sidebarBg.color ? `${darken(sidebarBg.color, 0.38)}80` : null  // 50% alpha
const fg      = themed ? contrastText(sidebarBg.color) : null  // '#000000' | '#ffffff'
const fgSoft  = fg ? `${fg}b3` : undefined  // ~70% alpha for secondary text
```

Apply inline styles conditionally:

```tsx
<span style={fg ? { color: fg } : undefined}>Label</span>
<span style={fg ? { color: fgSoft } : undefined}>Secondary</span>

{/* Active row */}
<div style={active && activeBg ? { backgroundColor: activeBg, boxShadow: 'rgba(0,0,0,0.2) 0px 2px 8px' } : {}}>
  ...
</div>
```

Use the CSS classes `dd-sidebar-action`, `dd-conn-name`, `dd-conn-sub`, and `dd-conn-row` (defined in `main.css`) to handle the rest → text → muted color transition on hover without duplicating logic:

```css
.dd-sidebar-action { color: var(--dd-fg); }
.dd-sidebar-action:hover { color: var(--color-text); }

.dd-conn-name { color: var(--dd-fg); }
.dd-conn-sub  { color: var(--dd-fg-soft); }
.dd-conn-row:hover .dd-conn-name { color: var(--color-text); }
.dd-conn-row:hover .dd-conn-sub  { color: var(--color-muted); }
```

Set the CSS variables on the sidebar element when a theme is active:

```tsx
<aside style={fg ? { '--dd-fg': fg, '--dd-fg-soft': fgSoft } as React.CSSProperties : undefined}>
```

### Noise generation

The noise tile is generated once via canvas and cached as a PNG data URI:

```ts
let cachedNoise: string | null = null
function pixelNoise(): string {
  if (cachedNoise) return cachedNoise
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  const image = ctx.createImageData(size, size)
  for (let i = 0; i < image.data.length; i += 4) {
    const v = (Math.random() * 255) | 0
    image.data[i] = image.data[i + 1] = image.data[i + 2] = v
    image.data[i + 3] = 255
  }
  ctx.putImageData(image, 0, 0)
  cachedNoise = canvas.toDataURL('image/png')
  return cachedNoise
}
```

Rendered with:

```tsx
<div
  style={{
    backgroundImage: `url("${pixelNoise()}")`,
    backgroundSize: '256px 256px',   // 2× upscale → chunky 2px blocks
    imageRendering: 'pixelated',
    opacity: noise,
    mixBlendMode: 'overlay'
  }}
/>
```

---

## Form patterns

### Label + control

```tsx
<label className="flex flex-col gap-1.5">
  <span className="text-xs font-medium text-muted">Label</span>
  <Input ... />
</label>
```

### Label + control in a row (inline toggle)

```tsx
<div className="flex items-center justify-between">
  <span className="text-xs font-medium text-muted">Enable feature</span>
  <Toggle checked={...} onChange={...} />
</div>
```

### Status badge row

```tsx
<div className="flex items-center justify-between rounded-lg border border-border bg-surface-2 px-3 py-2.5">
  <span className="text-xs font-medium text-muted">Status</span>
  <span className="flex items-center gap-1.5 text-xs font-semibold text-ok">
    <CheckCircle2 size={13} />
    Active
  </span>
</div>
```

---

## Icons

[lucide-react](https://lucide.dev). Size conventions:

| Context                    | Size                |
| -------------------------- | ------------------- |
| Inline with text           | 13–14px             |
| Icon buttons               | 15–16px             |
| Empty state / decorative   | 24–28px             |
| Welcome screen logo-scale  | 56px (`h-14 w-14`)  |

---

## Dependencies

| Package                                 | Purpose                                          |
| --------------------------------------- | ------------------------------------------------ |
| `tailwindcss` v4                        | Utility classes + design tokens via `@theme {}`  |
| `lucide-react`                          | Icons                                            |
| `@radix-ui/react-tooltip`               | Accessible tooltip primitives                    |
| `@radix-ui/react-context-menu`          | Right-click context menus                        |
| `clsx` + `tailwind-merge` (via `cn()`)  | Conditional class merging                        |
