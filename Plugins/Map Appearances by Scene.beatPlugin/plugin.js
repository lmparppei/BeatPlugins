/*

Map Appearances by Scene
Copyright: Ray Crist, inspired by "Map Character Appearances" by Lauri-Matti Parppei, parts Anthony James Huben
Description: A visual timeline of appearances by scene for characters, locations, or user-defined entities. Includes export as CSV or JSON.
Version: 1.0
Image: plugin_demo.png

plugin.js generates the entity/scene data and persists settings. ui.html (the
results window) and manage_entity_types.html (the custom entity type editor)
handle user interaction and validation, calling back into Beat.custom for
anything that needs the plugin context (persistence, file access, window
management).

*/

const DEFINED_PATTERNS_SETTING = "map_appearances_defined_regex_patterns";

/*
To add a new built-in entity type, add an entry here:
  - name: unique display name, used as the entity type key everywhere
  - description: shown in ui.html when the type is selected
  - generate: receives the type's name and must call
    addSceneForEntity(entityName, scene, typeName) for every appearance

User-defined entity types require no code changes: users define them as regex
patterns in manage_entity_types.html, persisted under DEFINED_PATTERNS_SETTING.
*/
const BUILTIN_ENTITY_TYPES = [
    {
        name: "Characters",
        description: "Characters who speak in the script, matched by dialogue cues and by name mentions in action lines.",
        generate: generateScenesByCharacter
    },
    {
        name: "Locations",
        description: "Scene locations, taken from each scene heading (INT./EXT. line).",
        generate: generateScenesByLocation
    },
    {
        name: "Hashtags",
        description: "Freeform #hashtags written anywhere in action lines, excluding Fountain's #scene number# syntax.",
        generate: generateScenesByHashtags
    }
];

const scenes = Beat.scenes();
const customPatterns = Beat.getUserDefault(DEFINED_PATTERNS_SETTING) || [];

// Scene info keyed by scene number (the scene's ID). `index` preserves script
// order, since scene numbers can be alphanumeric ("A1", "109B") and unsorted.
const sceneData = buildSceneData(scenes);

// Every entity's appearances, keyed "entityType-ENTITY NAME".
const entities = {};

function main() {
    for (const entityType of BUILTIN_ENTITY_TYPES) {
        entityType.generate(entityType.name);
    }
    for (const pattern of customPatterns) {
        generateScenesByRegex(pattern);
    }
    Beat.makeResident();
    openResultsWindow();
}

// ---------- Appearance generators ----------

// Records one appearance of an entity in a scene. All generators funnel
// through here.
function addSceneForEntity(rawName, scene, entityType) {
    const entityName = rawName.toUpperCase();
    const entityKey = `${entityType}-${entityName}`;
    const sceneInfo = sceneData[scene.sceneNumber];

    if (!entities[entityKey]) {
        entities[entityKey] = {
            entityType,
            entityName,
            scenes: [],
            entityColor: colorForEntity(entityKey),
            eights: 0,
            firstAppearance: null
        };
    }

    const entity = entities[entityKey];
    if (entity.scenes.includes(scene.sceneNumber)) return;

    entity.scenes.push(scene.sceneNumber);
    entity.eights += sceneInfo.eights;
    if (entity.firstAppearance === null || sceneInfo.index < entity.firstAppearance) {
        entity.firstAppearance = sceneInfo.index;
    }
}

function generateScenesByCharacter(entityType) {
    // First pass: characters with dialogue cues.
    for (const scene of scenes) {
        for (const line of Beat.linesForScene(scene)) {
            if (!line) continue;
            if (line.typeAsString() === "Character") {
                addSceneForEntity(line.characterName(), scene, entityType);
            }
        }
    }
    // Second pass: mentions of those characters in action lines.
    const talkingCharacters = Object.values(entities)
        .filter(entity => entity.entityType === entityType)
        .map(entity => entity.entityName);
    for (const scene of scenes) {
        for (const line of Beat.linesForScene(scene)) {
            if (!line || line.typeAsString() !== "Action") continue;
            for (const characterName of talkingCharacters) {
                const escaped = characterName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                const mention = new RegExp(
                    `\\b(?:${titleCase(escaped)}|${escaped.toUpperCase()})\\b`
                );
                if (mention.test(line.string)) {
                    addSceneForEntity(characterName, scene, entityType);
                }
            }
        }
    }
}

function generateScenesByLocation(entityType) {
    for (const scene of scenes) {
        addSceneForEntity(getLocationFromHeading(scene), scene, entityType);
    }
}

function generateScenesByHashtags(entityType) {
    generateScenesByRegex({
        nickname: entityType,
        pattern: "(?:^|\\s)#([A-Za-z0-9_]+)(?![A-Za-z0-9_.]*#)",
        flags: "g"
    });
}

// Runs a pattern against every line of every scene; the text matched by the
// pattern's first capture group becomes the entity name.
function generateScenesByRegex(pattern) {
    for (const scene of scenes) {
        for (const line of Beat.linesForScene(scene)) {
            const regex = new RegExp(pattern.pattern, pattern.flags);
            let match;
            while ((match = regex.exec(line.string)) !== null) {
                if (match.length > 1) {
                    addSceneForEntity(match[1].trim(), scene, pattern.nickname);
                }

                // Non-global regexes only ever return one match.
                if (!regex.global) break;

                // Prevent infinite loops on zero-length matches.
                if (match[0].length === 0) {
                    regex.lastIndex++;
                }
            }
        }
    }
}

// "INT. HOUSE - BEDROOM - NIGHT" -> "HOUSE - BEDROOM"
function getLocationFromHeading(scene) {
    const heading = cleanSceneHeading(scene).toUpperCase();
    const segments = heading.substring(heading.indexOf(" ")).split(" - ");
    const location = segments.length > 1 ? segments.slice(0, -1).join(" - ") : segments[0];
    return location.trim();
}

// "INT. HOUSE - NIGHT [[marker]] #4#" -> "INT. HOUSE - NIGHT"
function cleanSceneHeading(scene) {
    return scene.line.stripFormatting()
        .replace(/\[\[.*?\]\]/g, "")
        .replace(/#[^#\s]+#\s*$/, "")
        .trim();
}

// ---------- Windows ----------

function openResultsWindow() {
    const descriptions = {};
    for (const entityType of BUILTIN_ENTITY_TYPES) {
        descriptions[entityType.name] = entityType.description;
    }
    for (const pattern of customPatterns) {
        descriptions[pattern.nickname] = pattern.description || "";
    }

    const html = renderTemplate("ui.html", {
        ENTITIES: entities,
        SCENES: sceneData,
        DESCRIPTIONS: descriptions,
        ENTITY_TYPE_GROUPS: {
            "Built-in Entities": BUILTIN_ENTITY_TYPES.map(entityType => entityType.name),
            "Custom Entities": customPatterns.map(pattern => pattern.nickname)
        }
    });

    Beat.htmlWindow(html, 3000, 1000, function () {
        Beat.end();
    });
}

let manageWindow = null;

function openManageWindow(patterns) {
    const html = renderTemplate("manage_entity_types.html", {
        PATTERNS: patterns,
        RESERVED_NAMES: BUILTIN_ENTITY_TYPES.map(entityType => entityType.name)
    });
    manageWindow = Beat.htmlWindow(html, 700, 600, function () {});
}

// Called from the HTML windows via Beat.call
Beat.custom = {
    manageCustomEntityTypes: function () {
        openManageWindow(filterValidPatterns(Beat.getUserDefault(DEFINED_PATTERNS_SETTING) || []));
    },

    saveCustomEntityTypes: function (patternsJSON) {
        const patterns = filterValidPatterns(JSON.parse(patternsJSON));
        if (patternsFingerprint(patterns) === patternsFingerprint(customPatterns)) {
            Beat.custom.closeManageWindow();
            return;
        }
        // Entities are only calculated at plugin start, so changing patterns forces a restart.
        Beat.setUserDefault(DEFINED_PATTERNS_SETTING, patterns);
        Beat.alert("Please restart the plugin so that your changes can take effect.");
        Beat.end();
    },

    // window.close() is a no-op inside Beat's HTML windows; the window has to
    // be closed from the plugin context.
    closeManageWindow: function () {
        if (manageWindow) manageWindow.close();
        manageWindow = null;
    },

    // ui.html builds the CSV/JSON content; this only shows the save dialog
    // and writes the file, since file access requires the plugin context.
    exportEntities: function (payloadJSON) {
        const payload = JSON.parse(payloadJSON);
        Beat.saveFile(payload.format, function (path) {
            if (path) Beat.writeToFile(path, payload.content);
        });
    }
};

// ---------- Helpers ----------

function buildSceneData(scenes) {
    const sceneData = {};
    scenes.forEach((scene, index) => {
        sceneData[scene.sceneNumber] = {
            id: scene.sceneNumber,
            index,
            eights: getSceneLengthInEights(scene),
            heading: cleanSceneHeading(scene)
        };
    });
    return sceneData;
}

function getSceneLengthInEights(scene) {
    const sceneLength = Beat.currentPagination().sceneLengthInEights(scene);
    return sceneLength[0] * 8 + sceneLength[1];
}

function filterValidPatterns(patterns) {
    return patterns.filter(pattern => {
        try {
            new RegExp(pattern.pattern, pattern.flags);
            return true;
        } catch (err) {
            Beat.alert(`Invalid regex removed: ${pattern.nickname} /${pattern.pattern}/${pattern.flags}`);
            return false;
        }
    });
}

// Order-sensitive comparison key (generators run and the type dropdown lists
// custom types in definition order, so reordering counts as a change).
function patternsFingerprint(patterns) {
    return JSON.stringify(patterns.map(p =>
        [p.nickname, p.pattern, p.flags || "", p.description || ""]
    ));
}

// Anonymous functions used for replacements to ensure .replace() places `$` sequences literally. 
function renderTemplate(assetName, replacements) {
    // Raw JS shared by both windows (and require()d directly by tests.js).
    let html = Beat.assetAsString(assetName)
        .replace("{{SHARED_HELPERS}}", () => Beat.assetAsString("shared_helpers.js"));
    for (const [placeholder, value] of Object.entries(replacements)) {
        html = html.replace(`{{${placeholder}}}`, () => JSON.stringify(value));
    }
    return html;
}

// Colors are hashed, so the same entity gets the same color on every run. 
// Must return hex, because ui.html appends an alpha byte for the row tint.
function colorForEntity(entityKey) {
    const hash = hashString(entityKey);
    const hue = hash % 360;
    const saturation = 65 + ((hash >> 9) % 25);  // 65-89%
    const lightness = 50 + ((hash >> 17) % 35);  // 50-84%
    return hslToHex(hue, saturation, lightness);
}

// FNV-1a hashing function.
function hashString(text) {
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 16777619) >>> 0;
    }
    return hash;
}

function hslToHex(hue, saturationPercent, lightnessPercent) {
    const s = saturationPercent / 100;
    const l = lightnessPercent / 100;
    const a = s * Math.min(l, 1 - l);
    const channel = (n) => {
        const k = (n + hue / 30) % 12;
        const value = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
        return Math.round(value * 255).toString(16).padStart(2, "0");
    };
    return `#${channel(0)}${channel(8)}${channel(4)}`;
}

function titleCase(text) {
    return text
        .toLowerCase()
        .split(" ")
        .map(word => word.charAt(0).toUpperCase() + word.substring(1))
        .join(" ");
}

main();
