/*

Add CONT'Ds

Copyright: Lauri-Matti Parppei, 2025
Compatibility: 2.1.2
Image: Add CONTDs.jpg

<Description>
Goes through all dialogue and adds any missing <b>CONT'D</b> extensions to all consecutive dialogue blocks by the same character.
</Description>

*/

const localizedContd = (Beat.getRawUserDefault != undefined) ? Beat.getRawUserDefault("screenplayItemContd") : "CONT'D"
const contd = "(" + localizedContd + ")"

let previousCue = null

for (const line of Beat.lines()) {
	
	if (line.type == Beat.type.heading) {
		previousCue = null
	}

	if (!line.isAnyCharacter()) continue;

	const characterName = line.characterName()
	if (characterName != null) {
		if (previousCue != characterName) {
			previousCue = characterName
		} else if (line.string.indexOf(contd) == -1 && line.string.indexOf("(CONT'D)") == -1) {
			let extension = contd
			if (line.string.substr(line.string.length - 1) != " ") extension = " " + extension;

			Beat.addString(extension, line.position + line.length)
		}
	}
}