# Brand assets

Logo, icons and hero video for MediLink Rwanda. Prompts used to generate them: [prompts.md](prompts.md). Colours: [design research 02](../docs/design/research/02-color-system.md).

## Naming rules

- lowercase, words separated by hyphens, no spaces: `medilink-logo-horizontal-color.svg`
- pattern: `medilink-<asset>-<variant>-<colour>[-<size>].<ext>`
  - asset: `symbol` (icon only), `logo` (symbol + name), `app-icon`
  - variant: `horizontal`, `stacked` (only for `logo`)
  - colour: `color`, `black`, `white`, `dark` (for dark backgrounds)
  - size: only for PNGs, in pixels (`-512`)
- favicon and PWA icon files use the **standard web names** below (browsers and tools expect them)

## Folders and files

### `logo/source/`: raw downloads from ChatGPT (keep as they are)

| File | What it is |
|---|---|
| `concept-a-pin-cross.png` | Main concept: location pin + cross + linked strokes |
| `concept-b-linked-m.png` | Alternative: linked "m" (optional) |
| `concept-c-ticket.png` | Alternative: queue ticket (optional) |
| `logo-horizontal-raw.png` | Symbol + "MediLink / RWANDA" lockup as generated |
| `app-icon-raw.png` | White symbol on emerald rounded square |
| `app-icon-dark-raw.png` | `#34D399` symbol on `#022C22` |

If you made several attempts, add `-v2`, `-v3` (e.g. `concept-a-pin-cross-v2.png`) and keep only the ones worth keeping.

### `logo/svg/`: vectorised masters (the real logo files)

| File | Use |
|---|---|
| `medilink-symbol-color.svg` | Symbol only, emerald, on light backgrounds |
| `medilink-symbol-white.svg` | Symbol only, white, on dark/emerald backgrounds (hero, sidebar, display) |
| `medilink-symbol-black.svg` | Symbol only, black, for documents, stamps, fax/photocopy |
| `medilink-logo-horizontal-color.svg` | Symbol + wordmark (Figtree), main logo |
| `medilink-logo-horizontal-white.svg` | Same in white, for the deep forest hero and login panel |
| `medilink-logo-horizontal-black.svg` | Same in black, for PDF documents (prescriptions, receipts) |

### `logo/png/`: exports from the SVGs (transparent background)

| File | Use |
|---|---|
| `medilink-symbol-color-1024.png` | Large symbol, presentations |
| `medilink-logo-horizontal-color-2048.png` | Large logo, presentations, partners |
| `medilink-logo-horizontal-white-2048.png` | On dark slides/backgrounds |
| `medilink-logo-horizontal-black-1200.png` | Documents if SVG can't be used |

### `favicon/`: website tab icons (standard names)

| File | Size |
|---|---|
| `favicon.svg` | Vector (modern browsers) |
| `favicon.ico` | Contains 16, 32, 48 px |
| `favicon-32.png` | 32 × 32 |
| `favicon-16.png` | 16 × 16 |
| `apple-touch-icon.png` | 180 × 180 (iPhone home screen; no transparency, emerald background) |

### `app-icons/`: PWA / Android icons (standard names)

| File | Size | Notes |
|---|---|---|
| `icon-192.png` | 192 × 192 | Normal icon |
| `icon-512.png` | 512 × 512 | Normal icon, splash screen |
| `icon-maskable-512.png` | 512 × 512 | Symbol inside the central 60% (safe zone) so Android can crop to circle/squircle |
| `icon-dark-512.png` | 512 × 512 | Dark variant (`#34D399` on `#022C22`) |

Tip: generate the favicon and icon set from `medilink-symbol-color.svg` (or the app-icon SVG) with realfavicongenerator.net, then rename to the names above.

### `video/source/`: raw Google Flow exports (**not committed to git**: too large)

| File | Shot |
|---|---|
| `shot-01-kigali-sunrise.mp4` | Aerial sunrise over Kigali hills |
| `shot-02-waiting-at-home.mp4` | Elderly woman at home, phone notification |
| `shot-03-journey.mp4` | Mother with child walking to the health center |
| `shot-04-arrival-reception.mp4` | Calm reception, nurse welcomes |
| `shot-05-care.mp4` | Doctor examines child |
| `bg-loop-waiting-area.mp4` | Background loop alternative |
| `hero-story-full.mp4` | Shots stitched together in Flow (if made) |

Back these up outside git (e.g. a shared drive).

### `video/web/`: compressed files the website will use (committed)

| File | Spec |
|---|---|
| `hero-loop.webm` | 720p, 8–12 s, muted (no audio track), < ~2 MB, VP9/AV1 |
| `hero-loop.mp4` | Same in H.264 for Safari/older browsers |
| `hero-poster.webp` | First/representative frame, 1280 px wide, < 150 KB (shown on phones, data-saver, reduced motion) |
| `hero-poster.jpg` | Fallback poster |

Example compression commands (ffmpeg):
```
ffmpeg -i source/hero-story-full.mp4 -an -vf "scale=1280:-2,fps=24" -c:v libvpx-vp9 -b:v 0 -crf 38 -row-mt 1 web/hero-loop.webm
ffmpeg -i source/hero-story-full.mp4 -an -vf "scale=1280:-2,fps=24" -c:v libx264 -crf 28 -preset slow -movflags +faststart web/hero-loop.mp4
ffmpeg -ss 2 -i web/hero-loop.mp4 -frames:v 1 -vf "scale=1280:-2" web/hero-poster.jpg
```

## Where these go later

When the apps are built, copies go to:
- `apps/patient-web/public/` and `apps/staff-web/public/`: favicon, app icons, logos
- the API's static files: black logo for PDF letterheads
- the homepage: the hero video and poster

These `brand/` files stay the single source of truth.

## Checklist

- [ ] Main symbol chosen and saved in `logo/source/`
- [ ] Symbol vectorised → `logo/svg/medilink-symbol-*.svg` (color, white, black)
- [ ] Wordmark set in Figtree → `logo/svg/medilink-logo-horizontal-*.svg`
- [ ] PNG exports in `logo/png/`
- [ ] Favicon set in `favicon/`
- [ ] PWA icons (incl. maskable + dark) in `app-icons/`
- [ ] Raw video shots in `video/source/` (backed up elsewhere)
- [ ] Compressed loop + poster in `video/web/`
