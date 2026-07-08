/*

Map Entity Appearances by Scene
Copyright: Ray Crist, modified from original "Map Character Appearances" by Lauri-Matti Parppei, parts Anthony James Huben
Description: A visual timeline of appearances by scene for characters, locations, or user-defined entities.
Version: 2.0
Image: map_entity_appearances.png

*/

const ALPHABETICAL_SETTING = "map_appearances_alphabetical";
const ACTIVE_ENTITY_SETTING = "map_appearances_active_entity_type";
const DEFINED_PATTERNS_SETTING = "map_appearances_defined_regex_patterns";
const ACTIVE_PATTERN_SETTING = "map_appearances_active_regex_pattern";
const ENTITY_CHARACTER = "Characters";
const ENTITY_LOCATION = "Locations";
const ENTITY_SUB_LOCATION = "Sublocations";
const ENTITY_REGEX = "Regex";

function stripSuffix(line) {
        return line.replace(/\(.*\)/gm, '');
}

function titleCase(str) {
     var splitStr = str.toLowerCase().split(' ');
     for (var i = 0; i < splitStr.length; i++) {
             splitStr[i] = splitStr[i].charAt(0).toUpperCase() + splitStr[i].substring(1);     
     }
     return splitStr.join(' '); 
}

function getRandomColor() {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
}

function getSceneLengthInEights(scene) {
  const sceneLen = Beat.currentPagination().sceneLengthInEights(scene);
  return sceneLen[0] * 8 + sceneLen[1]
}


Beat.custom = {
    updateEntityType: function () {
        let entityType = Beat.dropdownPrompt("Change Entity Type", "Which entity would you like to map by scene? Changes apply after re-starting plugin.", validEntities);
        if (entityType == ENTITY_REGEX) {
          setRegexPattern();
        } else if (entityType) {
		      Beat.setUserDefault(ACTIVE_ENTITY_SETTING, entityType);
          Beat.end();
        }
    },
    setRegexPattern: function () {
        setRegexPattern();
        Beat.end();
    },
    updateAlphabetical: function () {
      Beat.alert("Plugin closing; please restart to update.");
      Beat.setUserDefault(ALPHABETICAL_SETTING, !Beat.getUserDefault(ALPHABETICAL_SETTING));
      Beat.end();
    },
    clearRegexPatterns: function () {
      Beat.setUserDefault(DEFINED_PATTERNS_SETTING, []);
    }
}

function setRegexPattern() {
    let patterns = Beat.getUserDefault(DEFINED_PATTERNS_SETTING) || [];
    patterns = patterns.filter(p => {
    try {
      new RegExp(p.pattern, p.flags);
      return true;
    } catch (err) {
      Beat.alert(`Invalid regex removed: ${p.label} /${p.pattern}/${p.flags}`);
      return false;
    }
  });
    Beat.modal({
      title: "Create a New Regex Entity",
      info: "You can use regex expressions to match any custom entity to scene by syntax (for example, you could use a pattern in comment lines to break-down your script. Choose a saved pattern or define a new one.",
      items: [
          {
              type: "text",
              name: "nickname",
              label: "Name",
          },
          {
              type: "text",
              name: "pattern",
              label: "Pattern"
          },
          {
              type: "text",
              name: "flags",
              label: "Flags"
          }
      ]
  }, function(response) {
      Beat.log(JSON.stringify(response));
        try {
          new RegExp(response.pattern, response.flags);
        } catch (err) {
          Beat.alert("Invalid Regex", "The regex pattern you provided is invalid, please try again.");
          return;
        }
        if (!response.nickname) {
          Beat.alert("Entity must have a name.");
          return;
        }
        if (validEntities.includes(response.nickname)) {
          Beat.alert(`${response.nickname} is already the name of an entity type, please pick another name.`);
          return;
        }
        patterns.push({nickname: `${response.nickname}`, pattern: response.pattern, flags: response.flags});
        Beat.setUserDefault(DEFINED_PATTERNS_SETTING, patterns);
        Beat.setUserDefault(ACTIVE_ENTITY_SETTING, response.nickname);
        Beat.end();
    });
}

let scenesForEntity = {}
let template = Beat.assetAsString("ui.html")
const sceneCount = Beat.scenes().length;

// Load entity type and generate data table accordingly. Use character as default entity.
let e = Beat.getUserDefault(ACTIVE_ENTITY_SETTING) || ENTITY_CHARACTER;
const patterns = Beat.getUserDefault(DEFINED_PATTERNS_SETTING) || [];
const activePatternIdx = Beat.getUserDefault(ACTIVE_PATTERN_SETTING) || 0;
const alphabetical = Beat.getUserDefault(ALPHABETICAL_SETTING) || false;
let patternLabels = patterns.map(p=>p.nickname);
let pattern;
let validEntities = [ENTITY_CHARACTER, ENTITY_LOCATION, ENTITY_SUB_LOCATION, ...patternLabels];
if (e == ENTITY_CHARACTER) {
  generateScenesByCharacter();
} else if (e == ENTITY_LOCATION) {
  generateScenesByLocation(false);
} else if (e == ENTITY_SUB_LOCATION) {
  generateScenesByLocation(true);
} else if (patternLabels.includes(e)) {
  pattern = patterns.find(p => p.nickname === e);
  generateScenesByRegex(pattern)
} else {
  Beat.alert(`Entity ${e} has not been implemented. Rerouting to character.`);
  e = ENTITY_CHARACTER;
  generateScenesByCharacter();  
}

// Get scene lengths
let sceneEights = {};
for (let i = 0; i < sceneCount; i++) {
  const scene = Beat.scenes()[i];
  const eights = getSceneLengthInEights(scene);
  sceneEights[i] = eights;
}

let html = `<div class="row header">`;
html += `<div class="cell nameCell">Scene</div>`;

const separators = Math.floor(sceneCount / 10);

for (let i = 0; i < sceneCount; i++) {
  classes = ["cell", "sceneCell"]
  if (i % separators == 0) {
    html += `<div class="cell sceneCell divider" style="flex-grow:${sceneEights[i]}"><div class="number">${i + 1}</div></div>`
  } else {
    html += `<div class="cell sceneCell" style="flex-grow:${sceneEights[i]}"></div>`
  }
}
html += `<div class="cell sumCell">pages</div>`;
html += `</div>`;

// Body rows
let bodyRows = [];
let totalEights = 0;
for (const [entityName, {entityColor, scenes: sceneIndexesForCharacter}] of Object.entries(scenesForEntity)) {
  let rowDiv = `<div class="row bodyRow">`;
  // Name column
  let sumEights = 0;
  rowDiv += `<div class="cell nameCell">${entityName}</div>`;

  // Scene cells
  for (let i = 0; i < sceneCount; i++) {

    const classes = ["cell", "sceneCell"];
    if (i % separators == 0) classes.push("divider");

    const present = sceneIndexesForCharacter.includes(i);
    if (present) classes.push("present");
    if (present) sumEights += sceneEights[i];

    const style = [
      `flex-grow:${sceneEights[i]}`,
      present ? `background-color:${entityColor}` : ""
    ].filter(Boolean).join(";");

    rowDiv += `<div class="${classes.join(" ")}" style="${style}"></div>`;
  }
  rowDiv += `<div class="cell sumCell">${Math.floor(sumEights / 8)} ${sumEights % 8}/8</div>`;
  rowDiv += `</div>`;
  bodyRows.push({sumEights, entityName, rowDiv});
  totalEights += sumEights;
}


if (alphabetical) {
  bodyRows
    .sort((a, b) => {
      return a.entityName.localeCompare(b.entityName);
    }) // alphabetical
} else {
bodyRows
  .sort((a, b) => b.sumEights - a.sumEights) // largest → smallest;
}
bodyRows
  .forEach(row => {
      html += row.rowDiv;
  });


// Display results
Beat.makeResident();
let title = `Map Appearances By Scene (${e})`;
if (e == ENTITY_REGEX) title += ` ${pattern.nickname}`;
let helpText = "";
if (patternLabels.includes(e)) {
  helpText = `Regex Pattern: ${escapeHtml(pattern.pattern) + "/" + pattern.flags}. Regex is tested against each line of each scene individually.`
} else if (e == ENTITY_CHARACTER) {
 helpText = "Note: Some scenes where the characters have only action lines might be missing. This is not scientific."
}

let tHTML = template.replace("#DATA#", html).replace("#TITLE#", title);
tHTML = tHTML.replace("#HELPTEXT#", helpText);
Beat.htmlWindow(tHTML, 3000, 1000, function () {
    Beat.end();
});

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}


function addSceneForEntity(rawName, index, entityType) {
      const name = rawName.toUpperCase();
      if (!scenesForEntity[name]) scenesForEntity[name] = {entityType, scenes: [], entityColor: getRandomColor()};
      if (!scenesForEntity[name].scenes.includes(index)) scenesForEntity[name].scenes.push(index)
}


function generateScenesByLocation(differentiateSublocations = false) {
  for (let i = 0; i < sceneCount; i++) {
    const scene = Beat.scenes()[i];
    addSceneForEntity(getCleanLocation(scene, differentiateSublocations), i, ENTITY_LOCATION);
  }
}

function generateScenesByCharacter() {
  for (let i = 0; i < sceneCount; i++) {
    // Process one scene at a time.
    const scene = Beat.scenes()[i];
    const lines = Beat.linesForScene(scene);
    for (const line of lines) {
      if (!line) return null;
      if (line.typeAsString() == "Action") {
        // handle
      } else if (line.typeAsString() == "Character") {
        addSceneForEntity(line.characterName(), i, ENTITY_CHARACTER);
      }
    }
  }
}

function generateScenesByRegex(pattern) {
    const scenes = Beat.scenes();

    for (let i = 0; i < scenes.length; i++) {
        const scene = scenes[i];
        const lines = Beat.linesForScene(scene);

        for (const line of lines) {
            const regex = new RegExp(pattern.pattern, pattern.flags);

            let match;
            while ((match = regex.exec(line.string)) !== null) {
                if (match.length > 1) {
                    const entity = match[1].trim();
                    addSceneForEntity(entity, i, ENTITY_REGEX);
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


function getCleanLocation(scene, differentiateSublocations = false) {
  let string = scene.line.stripFormatting().toUpperCase();
	let headings = string.substring(string.indexOf(" ")).split(" - ");
	let location = headings[0];
  if (differentiateSublocations && headings.length > 1) {
    location = ""
    for (let i = 0; i < headings.length - 1; i++) {
      location += headings[i] + " ";
      if (i != headings.length - 2) location += "- ";
    }
  }
	return location.trim();
}