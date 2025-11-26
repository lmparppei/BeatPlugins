# Copilot / AI Agent Instructions for BeatPlugins

This file gives concise, repository-specific guidance for automated code work in this repo. Focus on plugin patterns, packaging, and the Beat plugin API idioms used across `Plugins/`.

**Big Picture**

- **Repo purpose**: A collection of JavaScript plugins for the Beat screenwriting app. Each plugin is distributed as a folder container under `Plugins/`.
- **Plugin model**: Plugins are either a single script file or a folder where the main script has the same base name as the folder. See `Plugins/create_json.sh` for how plugins are discovered and packaged.

**Key Files / Locations**

- `README.md`: authoritative reference for Beat plugin API and runtime conventions — use it for API examples like `Beat.openConsole()`, `Beat.htmlPanel()` and listener methods.
- `Plugins/create_json.sh`: packaging script — it creates zips and a `Dist/Beat Plugins.json`. Follow its conventions for filenames and README metadata extraction (Version, Description, Copyright, Image).
- `Plugins/*/*.beatPlugin` or `Plugins/*/plugin.js`: typical plugin entry points. Example: `Plugins/QMan.beatPlugin/QMan.js` (large, self-contained tool showing preferences, listeners, and HTML panel usage).

**Common Patterns to follow (use these examples in PRs/edits)**

- Plugin metadata block: many plugins include a top-of-file comment with `Name:`, `Version:`, `Type:`, `Compatibility:`, `Description:`. The packaging script parses these fields.
- Persistent settings: use `Beat.getUserDefault("<key>")` / `Beat.setUserDefault("<key>", value)`. Keys are typically namespaced per plugin (e.g. `qman_preferences`).
- Assets & HTML UI: load embedded HTML/assets with `Beat.assetAsString('file.html')` or construct HTML in the plugin and open with `Beat.htmlPanel(...)` / `Beat.modal(...)`. Use `htmlWindow.runJS(...)` to communicate into the HTML UI.
- Event listeners: use `Beat.onTextChange`, `Beat.onSelectionChange`, `Beat.onOutlineChange`, etc. Keep callbacks fast and use the corresponding `...Disabled` flag to avoid edit loops (e.g. `Beat.onTextChangeDisabled = true`).
- Resident plugins: if a plugin remains active, ensure you clean up and call `Beat.end()` to terminate resident behavior when appropriate.

**Coding conventions & expectations**

- Prefer small, focused changes that preserve plugin header metadata and packaging expectations. Do not rename plugin folders or move main plugin files unless also updating `create_json.sh`-compatible naming.
- Avoid network I/O or adding runtime dependencies; plugin code runs inside Beat's WebKit environment and should not assume Node or browser globals outside what's shown in `README.md`.
- Use `Beat.log(...)` for debug output and `Beat.alert(...)` for user-facing errors. For development only, `Beat.openConsole()` is allowed but should not be left enabled in published plugins.

**Packaging and release**

- Follow `Plugins/create_json.sh` for packaging: zip the plugin folder, copy images into `Dist/Images/` and update `Dist/Beat Plugins.json`. When adding metadata, put human-readable `Description:` and optional `Image:` into the plugin script header.

**Examples (copyable patterns)**

- Read preferences safely:
  ```js
  const stored = Beat.getUserDefault("qman_preferences");
  const prefs = stored ? JSON.parse(stored) : defaultPrefs;
  ```
- Detect cues and update UI (from `QMan.js`):
  - Use `Beat.lines()` to iterate parsed lines.
  - Use `htmlWindow.runJS("setCuesList(JSON.parse('...'))")` to pass JSON into the UI window.

**When editing plugins**

- Preserve the header metadata and any references that `create_json.sh` extracts (`Version:`, `Description:`, `Image:`). If you change those fields, tests/packaging expect the new values.
- If adding UI assets, ensure they're accessible via `Beat.assetAsString()` from the plugin folder.

**What not to change**

- Do not remove or rename the plugin folder structure without coordinating packaging changes.
- Do not add heavy build tooling or non-discoverable runtime dependencies; Beat runs plugins inside a contained WebKit environment.

If anything here is unclear or you want more detail for a specific plugin (for example, `QMan.beatPlugin`), tell me which plugin to analyze next and I will expand the instructions with concrete code snippets and tests.
