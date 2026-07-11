# Map Appearances by Scene

A [Beat](https://kapitan.fi/beat/) plugin that renders a visual timeline of which scenes each "entity" appears in — characters, locations, hashtags, or user-defined regex patterns. Scene cells are sized by page length in eighths, colored per entity, with hover tooltips and CSV/JSON export.

![The results window: one row per character, colored cells marking the scenes each appears in, with a tooltip listing everyone in the hovered scene](plugin_demo.png)

## Developing

There is no build step or package manager — Beat loads `plugin.js` directly from this directory at runtime. To iterate, edit the files and re-run the plugin from Beat's plugin menu.

Run the tests after changing `plugin.js` or `shared_helpers.js`:

```
node tests.js
```

No framework: `tests.js` evaluates `plugin.js` with a mocked `Beat` global and a small fixture screenplay, then asserts on the JSON handed to the windows; it also unit-tests `shared_helpers.js` directly. Logic still inside the HTML `<script>` tags (DOM rendering, event wiring) is not covered.

## Files

- `plugin.js` — reads the current document via the `Beat` API, computes scene/entity data, and persists settings. Deliberately kept thin: it generates data, saves `Beat.getUserDefault`/`setUserDefault` state, and does the few things that require the plugin context (file dialogs, window management). It does not own user-interaction or validation logic.
- `ui.html` — template for the main results window: the entity timeline table, type/sort controls, per-type descriptions, tooltips, and CSV/JSON export (content built here, written to disk by `plugin.js`).
- `manage_entity_types.html` — template for the "Manage Custom Entity Types" window, opened via `Beat.custom.manageCustomEntityTypes`. Add/delete/validate custom regex patterns entirely client-side; it calls back into `plugin.js` only on Save (persist + end, both skipped if the patterns are unchanged) or Cancel (close window, persist nothing).
- `shared_helpers.js` — pure helpers used by both windows (`formatPageLength`, `toCSV`, `isNameTaken`, `validateNewPattern`). Inlined into each window's `<script>{{SHARED_HELPERS}}</script>` placeholder by `renderTemplate`; `require()`d directly by `tests.js`. Must stay free of DOM/Beat/window-global references, and must never contain the literal text `</script>` (it's inlined into a script tag).
- `tests.js` — unit tests, see above.

## Architecture / control flow

`plugin.js` runs top-to-bottom once per invocation, then stays resident (`Beat.makeResident()`) so `Beat.custom` callbacks from the windows keep working:

1. Read custom patterns from `DEFINED_PATTERNS_SETTING` (stored as `{nickname, pattern, flags, description}`).
2. Build `sceneData`, a map keyed by scene number with `{ id, index, eights, heading }` — `index` is the integer script order (scene numbers can be alphanumeric like "A1", so never sort by them).
3. Run every generator in `BUILTIN_ENTITY_TYPES`, then `generateScenesByRegex` for each custom pattern. All generators funnel through `addSceneForEntity`, which fills `entities` (keyed `"entityType-ENTITY NAME"`) with `{ scenes, eights, firstAppearance (scene index), entityColor }`. Colors are a deterministic hash of the entity key (FNV-1a → HSL → hex; must stay hex because ui.html appends an alpha byte for row tints).
4. `renderTemplate` injects the JSON into `ui.html`'s `{{PLACEHOLDER}}`s and opens the results window. All types are generated up front; the type dropdown in ui.html only filters rows.

Settings are only re-read at plugin start, so `saveCustomEntityTypes` persists, alerts, and calls `Beat.end()` to force a restart — but only when the saved set actually differs from the active one (`patternsFingerprint`); saving unchanged patterns just closes the window. Canceling or closing the manage window persists nothing and keeps the plugin alive.

### Window ↔ plugin bridge

`Beat.custom = { fnName: ... }` in `plugin.js` is the *only* way window JS reaches back into the plugin; new UI actions need a matching entry there. Calls cross the bridge via `Beat.call`, which serializes the callback **to a string** and re-runs it in the plugin context — closures do NOT capture window-local variables. Pass data as the second argument:

```js
// window-side
Beat.call((payloadJSON) => { Beat.custom.doThing(payloadJSON); }, JSON.stringify(data));
```

Referencing a window-local variable inside the callback throws "Can't find variable" in Beat's console. Related quirks this plugin works around: `window.close()` is a no-op inside Beat's HTML windows (only the `Beat.htmlWindow` handle's `.close()` works, hence `Beat.custom.closeManageWindow`), and native `title` tooltips don't render in Beat's WKWebView (the custom `#scene-tooltip` div in `ui.html` is the pattern to extend).

## Adding a new built-in entity type

Add one entry to `BUILTIN_ENTITY_TYPES` in `plugin.js`: `{ name, description, generate }`. The `generate` function receives the type's name and must call `addSceneForEntity(entityName, scene, typeName)` for every appearance it finds. Everything else — the generation loop, the type dropdown (grouped, with counts, disabled at zero results), descriptions, and the manage window's reserved names — derives from the registry. Custom entity types need no code changes; users define them as regex patterns in the manage window.

## Conventions

- Responsibility split: `plugin.js` generates data and persists it; the HTML windows own interaction and validation. Keep new logic on the right side of that line.
- Persisted settings go through `Beat.getUserDefault`/`setUserDefault` with a named `*_SETTING` constant — don't invent ad hoc storage.
- Regex patterns are validated with `new RegExp(pattern, flags)` in a try/catch: client-side in `manage_entity_types.html` on Add (which also enforces unique names against the registry's reserved names), and again in `filterValidPatterns` on save/load (invalid saved patterns are dropped with a `Beat.alert`). Pattern input is used verbatim — the pattern/flags fields carry `spellcheck="false"` so macOS can't curl quotes as the user types, and nothing rewrites what they enter (curly quotes must stay matchable).
- Both windows use real `<table>` markup restyled with `display: block/flex/grid` overrides for layout — semantic HTML first, ARIA only to fill a gap. Those `display` overrides strip the tables' implicit semantics, so both windows add explicit `role="table"/"rowgroup"/"row"/"columnheader"/"rowheader"/"cell"` back (in the static markup and in `createTimelineRow`/`renderPatternList`) to restore screen-reader table navigation. The timeline's scene cells are decorative divs inside a single `<td>` — `aria-hidden`, with an `.sr-only` span in the cell listing the appearances as their text equivalent. Keep those in sync when changing the markup.