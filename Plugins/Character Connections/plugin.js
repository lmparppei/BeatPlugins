/*

Name: Character Connections
Version: 1.0

Copyright: Lauri-Matti Parppei 2024
Description: Displays a rough overview of characters who interact with each other (in dialogue)
Image: Character_Connections.jpg

*/

let charactersToScenes = {}

// First map characters against scenes
for (const scene of Beat.scenes()) {
	for (const character of scene.characters) {
		if (charactersToScenes[character] == null) charactersToScenes[character] = [];

		charactersToScenes[character].push(scene)
	}
}

// Then go through characters and map characters from scenes
/// character: String, scenes: [OutlineScene]
let connections = {}

for (const [character, scenes] of Object.entries(charactersToScenes)) {
	for (const scene of scenes) {
		let names = scene.characters
		
		let index = names.indexOf(character);
		if (index !== -1) names.splice(index, 1);

		if (connections[character] == null) connections[character] = [];

		// First, let's see if there's no existing connection...
		for (const name of [... names]) {
			if (connections[name] != null && connections[name]?.indexOf(character) != -1) {
				names.splice(names.indexOf(name), 1)
			}
		}
		// Some JS silliness ahead
		connections[character] = [... new Set(connections[character].concat(names))]
	}
}

let data = JSON.stringify(connections)
let ui = Beat.assetAsString("ui.html")
let header = "<script type='text/javascript' src='vis-network.js'></script>"
ui = ui.replace("{{data}}", data)

Beat.htmlPanel([ui, header], 900, 700, () => {
	Beat.end()
})
