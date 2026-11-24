# PixelPeek

MV3 browser extension for inspecting any webpage's computed design values. Phase 2: advanced CSS reverse-engineering workspace with box model, computed properties, typography, colours, gradients, hierarchy navigation, and deterministic Agent Prompts.

## Build and verification

- `npm run check` is the full gate: strict `tsc --noEmit` → `vitest run` → production build.
- `npm run build` is **three separate Vite configs in order** (`vite.config.ts` → `vite.content.config.ts` → `vite.background.config.ts`). Vite 8 rejects array configs; do not merge them.
- `dist/` is the unpacked extension. Load that directory in `chrome://extensions` → Developer mode → Load unpacked. Rebuild and click "reload" on the extension card after any source change.
- `npm test` runs Vitest in jsdom (`.test.ts` and `.test.tsx`). `npm run test:watch` for focused work.
- `npm run icons` regenerates the three PNGs in `public/icons/`; they are produced by `scripts/generate-icons.mjs`, not hand-authored.

## Architecture constraints

- `src/shared/messages.ts` is the single typed message contract. Every new message type needs a runtime guard there; `src/shared/transport.ts` is the only module that touches `chrome.*` for the panel and content script.
- `content.js` must stay a standalone IIFE with no shared chunks — Chrome content scripts cannot import ES modules. Keep its build in `lib` mode and never introduce a shared chunk between content and background. It bundles its own copy of the shared modules.
- `background.js` runs as an MV3 module service worker: all listeners are registered at top level with no `await` before them, and inspection state lives in `chrome.storage.session`. Do not move mutable state into module scope or add top-level `await` (the wake-up event is lost).
- The overlay is one Shadow DOM host appended to `document.documentElement`, with `pointer-events: none` and `all: initial`. Never inject styles into the page or mutate the target element; host-page CSS will otherwise break the highlight.
- `src/content/inspect.ts` and `src/content/css.ts` are pure and receive their dependencies injected. Keep DOM reads inside `inspect.ts` and keep CSS values allowlisted/sanitized in `css.ts` — the Copy CSS feature must never emit `url()`, `;`, braces, or form values.
- Clicking an element in the picker captures it and ends inspection immediately (Escape also ends it), so normal page interaction is restored. Background also ends inspection on tab activation, URL change, and tab removal.
- `src/panel/hooks/usePanelWidth.ts` owns the responsive breakpoints (compact <380px, regular <480px, wide otherwise). Panel surfaces must not reintroduce fixed wide sidebars or `px-7` padding; keep `min-w-0` through the flex/grid chain and use `break-anywhere` for long CSS values.
- Phase 2 extraction is pure and dependency-injected: `src/content/box-model.ts`, `css-properties.ts`, `typography.ts`, `color.ts`, `gradient.ts`, `hierarchy.ts`, and `snapshot.ts` receive style/geometry/DOM readers and never touch `chrome.*`. The content script keeps only a bounded current element reference for hierarchy navigation and clears it on navigation, DOM removal, or explicit stop.
- `InspectionState.lastTabId` lets snapshot and hierarchy requests reach the content script after the picker has stopped; clear it on tab activation, URL change, and tab removal. Never restore selection from a tab whose page navigated.
- `src/panel/prompts/` is UI-free and deterministic: `model.ts` converts detected `ElementInfo` into facts and omissions, `templates.ts` renders the ten-section prompt for the three output modes. Never fabricate missing properties or mix inferred guidance into detected values.

## Environment gotchas

- The authoritative Git repository for this project is this folder; the parent `/mnt/c/USERS/tabiq` is an unrelated repository with staged files. Never commit from the parent.
- `activeTab` is granted by the toolbar click that opens the side panel. Starting inspection without that gesture can fail injection on pages where no host permission exists; report the error instead of requesting broad host permissions.
- `http(s)` pages only: `chrome://`, `chrome-extension://`, `about:`, `file://` and `data:` are rejected before injection.
- Browser behavior has not been verified in Chrome. Manual testing in a real browser is required before claiming compatibility.
