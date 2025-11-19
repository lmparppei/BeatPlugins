# QMan

**Version:** 1.2  | © Nicola Marra de Scisciolo 2025
**Compatibility:** Beat 2.1.2+

A cue management plugin for Beat screenwriting software that dynamically detects and manages technical cues (SOUND, LIGHT, MUSIC, VIDEO, PROJECTION, etc.) in your screenplay.

## Features

- 🎯 **Dynamic Detection** - Automatically detects and tracks all technical cues in your screenplay
- 🔄 **Auto-Update** - Real-time updates as you edit your document
- 🎨 **Color-Coded Types** - Visual distinction between different cue types
- 🔍 **Smart Filtering** - Tab-based filtering by cue type
- 🔢 **Sequential Renumbering** - Renumber all cues or filter by type with dynamic button coloring
- 📊 **Export Options** - Export to CSV, HTML, or QLab format
- 🎨 **Customizable Highlighting** - Highlight cues in your screenplay with custom colors
- 👁️ **Visibility Control** - Hide specific cue types from screenplay output using Fountain standard Note syntax.
- 🌓 **Theme Support** - Dark, light, or system-matched appearance
- 📍 **Scene Context**  - Optional display of scene headings for each cue
- ⚡ **Instant-Apply Preferences** - Changes apply immediately without saving
- ⌨️ **Keyboard Shortcuts** - Fast navigation and actions
- 🔗 **Click to Navigate** - Jump directly to any cue in your screenplay

## Installation

1. Follow standard Beat Plugin install instructions
2. Restart Beat or reload plugins
3. Access QMan from the Tools menu

## Cue Format

QMan recognizes cues in the following formats:

SOUND: Door slams shut
LIGHT (cue 1): Fade to black
MUSIC (cue 2): Start dramatic score
VIDEO: Display countdown timer
PROJECTION (cue 5): Show title card
[[SOUND (cue 1): Background ambience]]
```
SOUND: Door slams shut
LIGHT (cue 1): Fade to black
MUSIC (cue 2): Start dramatic score
VIDEO: Display countdown timer
PROJECTION (cue 5): Show title card
```

### Format Rules

- **Cue Type**: All uppercase letters (e.g., SOUND, LIGHT, MUSIC)
- **Cue Number** (optional): `(cue X)` or just `(X)` after the type
- **Description**: Text following the colon
- **Force Action**: Prefix with `!` to force as action element (e.g., `!SOUND: Thunder`)

### Hidden Cues

Wrap cues in note brackets to hide them from screenplay output:

```
[[SOUND (cue 1): Background ambience]]
```

## Interface

### Main Window

- **Search Box** - Filter cues by type, number, or description (Ctrl+F)
- **Renumber Button** - Sequentially renumber cues (Ctrl+R)
- **Export Menu** - Export to CSV or HTML (Ctrl+E)
- **Tabs** - Filter by cue type or view all
- **Cue List** - Click any cue to jump to its location in the screenplay
- **Preferences Icon** - Access customization options

### Preferences

All preferences apply instantly without needing to save:

- **Theme** - Choose between Dark, Light, or System (matches macOS appearance)
- **Show Scene Context** - Display scene headings with each cue in the list
- **Highlight All Cues** - Enable/disable text highlighting in screenplay
- **Hide All Cues** - Toggle visibility of all cues in screenplay output
- **Per-Type Settings**:
  - **Color Picker** - Customize the color for each cue type
  - **Highlight Toggle** - Enable highlighting for specific types
  - **Hide Toggle** - Hide specific types from screenplay output

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+F` / `Cmd+F` | Focus search box |
| `Ctrl+R` / `Cmd+R` | Renumber cues |
| `Ctrl+E` / `Cmd+E` | Export to CSV |

## Export Formats

### CSV Export

Exports with three columns:

- **Number** - Cue number
- **Type** - Cue type (SOUND, LIGHT, etc.)
- **Note** - Cue description

Perfect for importing into QLab, spreadsheets, or other production tools.

### HTML Export

Generates a formatted HTML table with:

- Color-coded cue types
- Professional styling
- Printable format
- Sortable columns

## Use Cases

### Theater Production

- Track all technical cues across your script
- Export to CSV for QLab import
- Color-code by department (sound, lighting, video)
- Hide cues from actor scripts

### Film/Video Production

- Manage sound effects and music cues
- Track VFX and post-production notes
- Export technical notes for departments
- Maintain clean shooting scripts

### Live Events

- Coordinate multiple technical departments
- Sequence cues for live performances
- Export cue sheets for technical directors
- Quick reference during rehearsals

## Tips & Best Practice

1. **Consistent Naming** - Use consistent cue type names (all caps)
2. **Numbering** - Let QMan handle numbering with the Renumber feature
3. **Color Coding** - Assign colors that match your production workflow
4. **Export Early** - Export cue lists during early rehearsals for technical teams
5. **Hidden Cues** - Use `[[ ]]` for technical notes that shouldn't appear in final scripts
6. **Search** - Use search to quickly find specific cues during editing

## Supported Cue Types

**Default types:**

- SOUND
- LIGHT
- MUSIC
- VIDEO
- PROJECTION

**Custom types:** QMan automatically detects and supports any all-caps cue type you create (e.g., PYRO, AUTOMATION, SFX, etc.)

## Troubleshooting

**Cues not appearing?**

- Ensure cue type is ALL CAPS
- Check format: `TYPE: description` or `TYPE (cue X): description`
- Verify the line isn't in a different element type

**Colors not saving?**

- Click Save in Preferences window
- Check Beat console for error messages

**Export not working?**

- Ensure you have write permissions to the destination folder
- Try exporting to a different location

## Version History

### 1.2.0 (November 18, 2025)

**Maintenance & Compatibility Fixes:**

- ✅ Use `line.type` correctly (numeric) for scene heading detection
- ✅ Use `line.range.length` (with fallback) when calling `Beat.replaceRange` to cover newline characters
- ✅ Cache `Beat.lines()` in heavy loops for better performance on large documents
- ✅ Fix tab activation bug by passing DOM `event` into `filterTab` from the HTML window
- ✅ Replaced fragile string-evaluation Beat.call usages in the UI HTML with a safer anonymous-function form
- ✅ Misc. defensive coding improvements and logging

**Notes:**

- These updates improve stability and make the plugin more robust when interacting with Beat's API and the HTML window communication channel.

### 1.1.0 (November 2025)

**New Features:**

- 🌓 Theme support with Dark, Light, and System modes
- 📍 Scene context display toggle in preferences
- ⚡ Instant-apply preferences (no save button needed)
- 🎨 Dynamic renumber button coloring that matches active cue type filter
- 📤 QLab export format (AppleScript)
- 🎭 Improved UI with flexbox layout for better responsiveness

**Improvements:**

- Renumber button color now updates immediately when changing cue type colors in preferences
- Progress indicator for time-consuming operations (hide/unwrap)
- Scene headings automatically detected and associated with cues
- Modern macOS-style interface design

**Bug Fixes:**

- Fixed default scene context preference not applying on window open
- Fixed UI glitches in preferences window
- Improved layout consistency across different window sizes

### 1.0.0 (2025)

- Initial release
- Dynamic cue detection
- Color-coded cue types
- Tab filtering
- Sequential renumbering
- CSV/HTML export
- Customizable highlighting
- Visibility control
- Keyboard shortcuts
- Click-to-navigate

## License

Copyright © 2025. All rights reserved.

## Support

For bug reports and feature requests, please contact the developer or submit an issue on the project repository.

---

**QMan** - Professional cue management for Beat screenwriting software
