# ThruBox Brand Kit

This folder is the canonical source for ThruBox's visual identity: logos, favicons/icons, and color palette. All assets referenced below live in this `brand/` folder.

## Logo

| Asset | File |
| --- | --- |
| ThruBox logo (SVG, with wordmark) | [`thrubox-logo.svg`](./thrubox-logo.svg) |
| AOSSIE org logo (SVG) | [`aossie-logo.svg`](./aossie-logo.svg) |

The ThruBox mark is a Menger-sponge-style cube made of green tessellated tiles wrapped around a padlock, representing an encrypted "box" relaying data between clients.

## Favicons & Icons

Generated from `thrubox-logo.svg` at the standard sizes used across browsers, bookmarks, and mobile home screens:

| File | Size | Use |
| --- | --- | --- |
| [`favicon.ico`](./favicon.ico) | 16/32/48 (multi-res) | Classic browser favicon |
| [`favicon-16x16.png`](./favicon-16x16.png) | 16×16 | Browser tab |
| [`favicon-32x32.png`](./favicon-32x32.png) | 32×32 | Browser tab (HiDPI) |
| [`favicon-48x48.png`](./favicon-48x48.png) | 48×48 | Windows taskbar |
| [`apple-touch-icon.png`](./apple-touch-icon.png) | 180×180 | iOS home screen |
| [`icon-512.png`](./icon-512.png) | 512×512 | PWA manifest / app icon |

This package has no bundled web app (it's a Node.js/browser SDK library), so these assets aren't wired into an `index.html` — they're provided as the canonical brand exports for use in demo apps, npm listing pages, or documentation sites that consume this SDK.

## Color Palette

Sourced directly from `thrubox-logo.svg`:

| Swatch | Name | Hex | Usage in logo |
| --- | --- | --- | --- |
| 🟩 | ThruBox Green (light) | `#3eb03e` | Sponge tile — top face |
| 🟩 | ThruBox Green (mid) | `#228B22` | Sponge tile — front face, wordmark |
| 🟩 | ThruBox Green (dark) | `#145A14` | Sponge tile — side face |
| ⬛ | Outline | `#0f420f` | Tile stroke |
| 🟨 | Lock Gold | `#FFC517` | Padlock accent, sourced from `thrubox-logo.svg` |

## Typography

This is a non-UI project (TypeScript SDK library) — there is no application typography to document. The wordmark in `thrubox-logo.svg` uses `'Arial Black', system-ui, sans-serif` at weight 900 as a logotype only.
