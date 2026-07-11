/*

Unit tests for Map Entity Appearances by Scene.

Run with:  node tests.js

plugin.js runs top-to-bottom inside Beat rather than exporting anything, so
these tests evaluate it with a mocked `Beat` global and a small fake
screenplay, then assert on the data the plugin hands to the HTML.

The pure helpers shared by the HTML windows (formatPageLength, toCSV,
validateNewPattern, ...) live in shared_helpers.js - inlined into the
windows' <script> tags by renderTemplate in Beat, require()d directly here.
Logic that stays inside the HTML <script> tags (DOM rendering, event wiring)
is still uncovered.

*/

const fs = require("fs");
const path = require("path");

const PLUGIN_SOURCE = fs.readFileSync(path.join(__dirname, "plugin.js"), "utf8");
const PATTERNS_SETTING = "map_appearances_defined_regex_patterns";

const helpers = require("./shared_helpers.js");

// ---------- Beat mock ----------

// Each scene spec: { number, heading, eights: [pages, eighths], lines }
// Each line spec:  { type, text, character? }
function makeBeatMock({ screenplay, userDefaults = {} }) {
    const sceneObjects = [];
    const linesByScene = new Map();
    const eightsByScene = new Map();

    for (const spec of screenplay) {
        const scene = {
            sceneNumber: spec.number,
            line: { stripFormatting: () => spec.heading }
        };
        sceneObjects.push(scene);
        eightsByScene.set(scene, spec.eights);
        linesByScene.set(scene, spec.lines.map(line => ({
            string: line.text,
            typeAsString: () => line.type,
            characterName: () => line.character
        })));
    }

    // Placeholder-only templates: the tests parse the JSON the plugin
    // injects, one placeholder per line.
    const assets = {
        "ui.html": "{{ENTITIES}}\n{{SCENES}}\n{{DESCRIPTIONS}}\n{{ENTITY_TYPE_GROUPS}}",
        "manage_entity_types.html": "{{PATTERNS}}\n{{RESERVED_NAMES}}",
        "shared_helpers.js": "/* shared helpers stub */"
    };

    const captured = {
        windows: [],
        alerts: [],
        savedDefaults: {},
        writtenFiles: [],
        ended: false,
        resident: false
    };

    const Beat = {
        scenes: () => sceneObjects,
        linesForScene: (scene) => linesByScene.get(scene),
        currentPagination: () => ({
            sceneLengthInEights: (scene) => eightsByScene.get(scene)
        }),
        getUserDefault: (key) => userDefaults[key],
        setUserDefault: (key, value) => { captured.savedDefaults[key] = value; },
        assetAsString: (name) => assets[name],
        htmlWindow: (html, width, height, onClose) => {
            captured.windows.push(html);
            return { close: () => onClose && onClose() };
        },
        makeResident: () => { captured.resident = true; },
        end: () => { captured.ended = true; },
        alert: (message) => { captured.alerts.push(message); },
        saveFile: (extension, callback) => callback(`/mock/export.${extension}`),
        writeToFile: (filePath, content) => {
            captured.writtenFiles.push({ path: filePath, content });
        }
    };

    return { Beat, captured };
}

function runPlugin(options) {
    const { Beat, captured } = makeBeatMock(options);
    new Function("Beat", PLUGIN_SOURCE)(Beat);

    // The results window is always the first window the plugin opens.
    const [entities, sceneData, descriptions, entityTypeGroups] =
        captured.windows[0].split("\n").map(JSON.parse);
    return { Beat, captured, entities, sceneData, descriptions, entityTypeGroups };
}

// ---------- Fixtures ----------

const SCREENPLAY = [
    {
        number: "A1",
        heading: "INT. HOUSE - BEDROOM - NIGHT",
        eights: [1, 0], // one full page = 8 eighths
        lines: [
            { type: "Character", text: "BILLIE", character: "BILLIE" },
            { type: "Action", text: "Joey waves at the #dawn sky. A sign reads PROP: LANTERN." }
        ]
    },
    {
        number: "2",
        heading: "INT. HOUSE - BATHROOM - DAY [[unfilmed]] #2#",
        eights: [0, 4],
        lines: [
            { type: "Character", text: "JOEY", character: "JOEY" },
            { type: "Action", text: "Billie hums. #dawn again. Scene number syntax #42# is not a hashtag." }
        ]
    },
    {
        number: "3",
        heading: "EXT. BEACH",
        eights: [0, 2],
        lines: [
            { type: "Action", text: "Empty waves." }
        ]
    }
];

const CUSTOM_PATTERNS = [
    { nickname: "Props", pattern: "PROP: ([A-Z]+)", flags: "g", description: "Props called out in action lines." },
    { nickname: "Vehicles", pattern: "VEHICLE: ([A-Z]+)", flags: "g", description: "" }
];

function runWithFixtures() {
    return runPlugin({
        screenplay: SCREENPLAY,
        userDefaults: { [PATTERNS_SETTING]: CUSTOM_PATTERNS }
    });
}

// ---------- Test harness ----------

let passed = 0;
const failures = [];

function test(name, fn) {
    try {
        fn();
        passed++;
        console.log(`ok - ${name}`);
    } catch (err) {
        failures.push(name);
        console.log(`FAIL - ${name}\n      ${err.message}`);
    }
}

function assert(condition, message) {
    if (!condition) throw new Error(message || "assertion failed");
}

function assertEqual(actual, expected, label = "value") {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e) throw new Error(`${label}: expected ${e}, got ${a}`);
}

// ---------- Tests: appearance generation ----------

test("characters are found by dialogue cue and by mention in action lines", () => {
    const { entities } = runWithFixtures();
    const billie = entities["Characters-BILLIE"];
    const joey = entities["Characters-JOEY"];
    assert(billie && joey, "expected BILLIE and JOEY entities");
    assertEqual([...billie.scenes].sort(), ["2", "A1"], "BILLIE's scenes");
    assertEqual([...joey.scenes].sort(), ["2", "A1"], "JOEY's scenes");
});

test("page eighths are summed across a character's scenes", () => {
    const { entities } = runWithFixtures();
    assertEqual(entities["Characters-BILLIE"].eights, 12, "BILLIE eighths (8 + 4)");
});

test("firstAppearance is the earliest scene index, even when found out of order", () => {
    const { entities } = runWithFixtures();
    // JOEY's dialogue cue is in scene index 1, but the action-line mention in
    // scene index 0 comes first in the script.
    assertEqual(entities["Characters-JOEY"].firstAppearance, 0, "JOEY firstAppearance");
    assert(Number.isInteger(entities["Characters-JOEY"].firstAppearance), "firstAppearance is an integer");
});

test("locations keep sublocations distinct and drop the time of day", () => {
    const { entities } = runWithFixtures();
    assert(entities["Locations-HOUSE - BEDROOM"], "expected HOUSE - BEDROOM");
    assert(entities["Locations-HOUSE - BATHROOM"], "expected HOUSE - BATHROOM");
    assert(!entities["Locations-HOUSE"], "locations must not collapse to HOUSE");
});

test("single-segment scene headings still produce a location", () => {
    const { entities } = runWithFixtures();
    assertEqual(entities["Locations-BEACH"].scenes, ["3"], "BEACH scenes");
});

test("hashtags are collected; Fountain #scene number# syntax is excluded", () => {
    const { entities } = runWithFixtures();
    const hashtags = Object.values(entities).filter(e => e.entityType === "Hashtags");
    assertEqual(hashtags.map(e => e.entityName), ["DAWN"], "hashtag entities");
    assertEqual([...entities["Hashtags-DAWN"].scenes].sort(), ["2", "A1"], "DAWN's scenes");
});

test("custom patterns create entities from their first capture group", () => {
    const { entities } = runWithFixtures();
    assertEqual(entities["Props-LANTERN"].scenes, ["A1"], "LANTERN scenes");
});

test("entity colors are deterministic hex values derived from the entity key", () => {
    const first = runWithFixtures();
    const second = runWithFixtures();

    const billieColor = first.entities["Characters-BILLIE"].entityColor;
    assert(/^#[0-9a-f]{6}$/.test(billieColor), `expected #rrggbb hex, got ${billieColor}`);
    assertEqual(second.entities["Characters-BILLIE"].entityColor, billieColor,
        "same entity gets the same color on every run");
    assert(first.entities["Characters-JOEY"].entityColor !== billieColor,
        "different entities get different colors");
});

// ---------- Tests: data handed to ui.html ----------

test("sceneData is keyed by scene number and preserves script order via index", () => {
    const { sceneData } = runWithFixtures();
    assertEqual(sceneData["A1"].index, 0, "A1 index");
    assertEqual(sceneData["2"].index, 1, "scene 2 index");
    assertEqual(sceneData["A1"].eights, 8, "A1 eighths");
});

test("scene headings are cleaned of markers and trailing scene numbers", () => {
    const { sceneData } = runWithFixtures();
    assertEqual(sceneData["2"].heading, "INT. HOUSE - BATHROOM - DAY", "cleaned heading");
    assertEqual(sceneData["A1"].heading, "INT. HOUSE - BEDROOM - NIGHT", "untouched heading");
});

test("descriptions cover built-in types and custom patterns", () => {
    const { descriptions } = runWithFixtures();
    assert(descriptions["Characters"].length > 0, "built-in description present");
    assertEqual(descriptions["Props"], "Props called out in action lines.", "custom description");
});

test("entity type groups include custom types with zero results", () => {
    const { entities, entityTypeGroups } = runWithFixtures();
    assertEqual(entityTypeGroups["Built-in Entities"], ["Characters", "Locations", "Hashtags"]);
    assertEqual(entityTypeGroups["Custom Entities"], ["Props", "Vehicles"]);
    assert(!Object.values(entities).some(e => e.entityType === "Vehicles"),
        "Vehicles matched nothing, so it should have no entities");
});

// ---------- Tests: Beat.custom callbacks ----------

test("saveCustomEntityTypes persists valid patterns, drops invalid ones, and ends the plugin", () => {
    const { Beat, captured } = runWithFixtures();
    Beat.custom.saveCustomEntityTypes(JSON.stringify([
        CUSTOM_PATTERNS[0],
        { nickname: "Broken", pattern: "([", flags: "" }
    ]));

    const saved = captured.savedDefaults[PATTERNS_SETTING];
    assertEqual(saved.map(p => p.nickname), ["Props"], "saved patterns");
    assertEqual(captured.alerts.length, 2, "alerts: invalid pattern, then restart notice");
    assert(captured.alerts[0].startsWith("Invalid regex removed"), "first alert flags the invalid pattern");
    assert(captured.alerts[1].includes("restart"), "second alert tells the user to restart");
    assert(captured.ended, "plugin should end after saving");
});

test("saving unchanged patterns closes the window without persisting, alerting, or ending", () => {
    const { Beat, captured } = runWithFixtures();
    Beat.custom.manageCustomEntityTypes();
    Beat.custom.saveCustomEntityTypes(JSON.stringify(CUSTOM_PATTERNS));

    assertEqual(captured.savedDefaults, {}, "nothing persisted");
    assertEqual(captured.alerts, [], "no alerts");
    assert(!captured.ended, "plugin still running");
});

test("closing the manage window without saving persists nothing and keeps the plugin alive", () => {
    const { Beat, captured } = runWithFixtures();
    Beat.custom.manageCustomEntityTypes();
    assertEqual(captured.windows.length, 2, "manage window opened");

    const reservedNames = JSON.parse(captured.windows[1].split("\n")[1]);
    assertEqual(reservedNames, ["Characters", "Locations", "Hashtags"], "reserved names");

    Beat.custom.closeManageWindow();
    assertEqual(captured.savedDefaults, {}, "nothing persisted");
    assert(!captured.ended, "plugin still running");
});

test("exportEntities writes the window-provided content via the save dialog", () => {
    const { Beat, captured } = runWithFixtures();
    Beat.custom.exportEntities(JSON.stringify({ format: "csv", content: "Type,Name\nProps,LANTERN" }));

    assertEqual(captured.writtenFiles.length, 1, "one file written");
    assert(captured.writtenFiles[0].path.endsWith(".csv"), "extension from format");
    assertEqual(captured.writtenFiles[0].content, "Type,Name\nProps,LANTERN", "content passed through");
});

test("plugin becomes resident so window callbacks keep working", () => {
    const { captured } = runWithFixtures();
    assert(captured.resident, "Beat.makeResident() was called");
});

// ---------- Tests: shared helpers (inlined into the HTML windows) ----------

test("formatPageLength renders eighths the screenplay way", () => {
    assertEqual(helpers.formatPageLength(0), "0", "zero");
    assertEqual(helpers.formatPageLength(3), "3/8", "under a page");
    assertEqual(helpers.formatPageLength(8), "1", "exactly one page");
    assertEqual(helpers.formatPageLength(12), "1 4/8", "pages plus eighths");
});

test("toCSV escapes quotes, commas, and newlines, and joins scenes", () => {
    const csv = helpers.toCSV([{
        type: "Characters",
        name: 'SMITH, "DOC"',
        pageLength: "1 4/8",
        eights: 12,
        firstAppearance: "A1",
        scenes: ["A1", "2"]
    }]);
    const lines = csv.split("\n");
    assertEqual(lines[0], "Type,Name,Page Length,Eights,First Appearance,Scenes", "header row");
    assertEqual(lines[1], 'Characters,"SMITH, ""DOC""",1 4/8,12,A1,A1; 2', "escaped data row");
});

test("isNameTaken is case-insensitive and trims whitespace", () => {
    assert(helpers.isNameTaken("characters", ["Characters"]), "case-insensitive match");
    assert(helpers.isNameTaken("  Props ", ["Props"]), "surrounding whitespace ignored");
    assert(!helpers.isNameTaken("Vehicles", ["Props"]), "unrelated name is free");
});

test("validateNewPattern reports each failure mode and passes valid input", () => {
    const taken = ["Characters", "Props"];
    assertEqual(helpers.validateNewPattern("", "x", "", taken), "Entity must have a name.", "empty name");
    assert(helpers.validateNewPattern("props", "x", "", taken).includes("already the name"), "taken name");
    assert(helpers.validateNewPattern("New", "([", "", taken).includes("invalid"), "broken regex");
    assertEqual(helpers.validateNewPattern("New", "PROP: ([A-Z]+)", "g", taken), null, "valid pattern");
});

test("both HTML templates load the shared helpers and don't redefine them", () => {
    for (const file of ["ui.html", "manage_entity_types.html"]) {
        const html = fs.readFileSync(path.join(__dirname, file), "utf8");
        assert(html.includes("<script>{{SHARED_HELPERS}}</script>"), `${file} has the placeholder`);
        for (const name of Object.keys(helpers)) {
            assert(!html.includes(`function ${name}(`), `${file} must not redefine ${name}`);
        }
    }
});

test("shared_helpers.js is safe to inline into a script tag", () => {
    const source = fs.readFileSync(path.join(__dirname, "shared_helpers.js"), "utf8");
    // The HTML parser ends a script element at the first closing script tag,
    // even inside a JS comment or string - inlining would break there.
    assert(!/<\/script/i.test(source), "must not contain a closing script tag");
});

// ---------- Summary ----------

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) process.exitCode = 1;
