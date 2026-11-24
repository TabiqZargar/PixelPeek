# PixelPeek

MV3 browser extension for inspecting any webpage's computed design values. Phase 1 only: side panel + element picker.

## Build and verification

- `npm run check` is the full gate: strict `tsc --noEmit` → `vitest run` → production build.
- `npm run build` is **three separate Vite configs in order** (`vite.config.ts` → `vite.content.config.ts` → `vite.background.config.ts`). Vite 8 rejects array configs; do not merge them.
- `dist/` is the unpacked extension. Load that directory in `chrome://extensions` → Developer mode → Load unpacked. Rebuild and click "reload" on the extension card after any source change.
- `npm test` runs Vitest in jsdom. `npm run test:watch` for focused work.
- `npm run icons` regenerates the three PNGs in `public/icons/`; they are produced by `scripts/generate-icons.mjs`, not hand-authored.

## Architecture constraints

- `src/shared/messages.ts` is the single typed message contract. Every new message type needs a runtime guard there; `src/shared/transport.ts` is the only module that touches `chrome.*` for the panel and content script.
- `content.js` must stay a standalone IIFE with no shared chunks — Chrome content scripts cannot import ES modules. Keep its build in `lib` mode and never introduce a shared chunk between content and background. It bundles its own copy of the shared modules.
- `background.js` runs as an MV3 module service worker: all listeners are registered at top level with no `await` before them, and inspection state lives in `chrome.storage.session`. Do not move mutable state into module scope or add top-level `await` (the wake-up event is lost).
- The overlay is one Shadow DOM host appended to `document.documentElement`, with `pointer-events: none` and `all: initial`. Never inject styles into the page or mutate the target element; host-page CSS will otherwise break the highlight.
- `src/content/inspect.ts` and `src/content/css.ts` are pure and receive their dependencies injected. Keep DOM reads inside `inspect.ts` and keep CSS values allowlisted/sanitized in `css.ts` — the Copy CSS feature must never emit `url()`, `;`, braces, or form values.
- Clicking an element in the picker captures it and ends inspection immediately (Escape also ends it), so normal page interaction is restored. Background also ends inspection on tab activation, URL change, and tab removal.

## Environment gotchas

- The Git repository root is `/mnt/c/USERS/tabiq` (the home directory), not this folder, and it contains unrelated staged files. Do not commit from the project directory without first deciding which repo owns this work; the Phase 1 checkpoint uses a project-local repository.
- `activeTab` is granted by the toolbar click that opens the side panel. Starting inspection without that gesture can fail injection on pages where no host permission exists; report the error instead of requesting broad host permissions.
- `http(s)` pages only: `chrome://`, `chrome-extension://`, `about:`, `file://` and `data:` are rejected before injection.
- Browser behavior has not been verified in Chrome. Manual testing in a real browser is required before claiming compatibility.
