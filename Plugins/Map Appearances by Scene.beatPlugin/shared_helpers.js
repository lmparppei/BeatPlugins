/*

Pure helper functions shared by the HTML windows.

Loaded two ways:
- In Beat, renderTemplate (plugin.js) inlines this file into each window's
  SHARED_HELPERS script placeholder - the windows' JS contexts can't load
  files themselves.
- In node, tests.js require()s it directly to unit test the helpers.

Keep this file free of DOM, Beat API, and window-global references so it
stays loadable (and testable) in both contexts. Because it is inlined into
a script tag, the closing HTML script tag must never appear here.

*/

// Formats a length in page-eighths the screenplay way: 12 -> "1 4/8".
function formatPageLength(eights) {
    const wholePages = Math.floor(eights / 8);
    const remainder = eights % 8;

    if (remainder === 0) return `${wholePages}`;
    if (wholePages === 0) return `${remainder}/8`;
    return `${wholePages} ${remainder}/8`;
}

// rows: export rows as built by exportRows in ui.html.
function toCSV(rows) {
    const escape = (value) => {
        const s = String(value);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [["Type", "Name", "Page Length", "Eights", "First Appearance", "Scenes"].join(",")];
    for (const row of rows) {
        lines.push([
            row.type,
            row.name,
            row.pageLength,
            row.eights,
            row.firstAppearance,
            row.scenes.join("; ")
        ].map(escape).join(","));
    }
    return lines.join("\n");
}

// Case-insensitive, whitespace-tolerant check against existing type names.
function isNameTaken(name, takenNames) {
    const upper = name.trim().toUpperCase();
    return takenNames.some(existing => existing.toUpperCase() === upper);
}

// Returns an error message to show the user, or null when the pattern is
// valid. takenNames: reserved built-in type names plus the current custom
// patterns' names.
function validateNewPattern(nickname, pattern, flags, takenNames) {
    if (!nickname.trim()) return "Entity must have a name.";
    if (isNameTaken(nickname, takenNames)) return `"${nickname}" is already the name of an entity type, please pick another name.`;
    try {
        new RegExp(pattern, flags);
    } catch (err) {
        return "The regex pattern you provided is invalid, please try again.";
    }
    return null;
}

// In Beat's windows this file is inlined into a <script> tag; in node it is
// a module. Export only in the latter.
if (typeof module !== "undefined" && module.exports) {
    module.exports = { formatPageLength, toCSV, isNameTaken, validateNewPattern };
}
