/*

Show Same Scene in Another Screenplay
Copyright: Lauri-Matti Parppei 2023
Image: screenshot.jpg

<Description>

<p>Connects your current screenplay to another window. 
When selecting any scene in your current screenplay, the other one will automatically scroll to a scene with the same scene number.</p>

<p>Very useful when keeping translations up to date or comparing different drafts.</p>

</Description>

*/

let documents = []	// List of open documents

let interface		// This will be the document we're connecting to. 
					// It's the same as Beat.something but in another doc.

const widget = Beat.widget(110)

// Create dropdown
let dropdown = Beat.dropdown(
	[],  			// Items
	(e) => { 		// Action
		selectDocument(dropdown.selectedIndex)
	},
	{ x:5, y:25, width: 200, height: 30 }
)
dropdown.onMenuOpen = () => {
	let i = dropdown.selectedIndex
	let title = (i >= 0) ? dropdown.items[i] : ""

	getOpenDocuments()
	let selection = dropdown.items.indexOf(title)
	if (selection >= 0) dropdown.selectItemAtIndex(selection);
}

// Create widget
widget.addElement(dropdown)
widget.addElement(
	Beat.label("Scroll to corresponding scene in:", 
		{ x: 10, y: 5, width: 200, height: 20 }
	)
)
widget.addElement(
	Beat.label("The selected document will automatically scroll to the same scene number as your current document.", 
		{ x: 10, y: 55, width: 230, height: 50 }, "gray", 8.0
	)
)

// Get list of documents
function getOpenDocuments() {
	documents = []
	dropdown.items = []
	dropdown.addItem("Select document...")

	for (const doc of Beat.documents()) {
		if (doc != Beat.document()) {
			documents.push(doc)
			dropdown.addItem(doc.displayName())
		}
	}
}

// Connect to document
function selectDocument(index) {
	let i = index - 1 // -1 because first item in dropdown is empty
	let doc;
	if (i >= 0) doc = documents[i];

	if (doc == null) return;

	interface = Beat.interface(doc)

	Beat.onSceneIndexUpdate((index) => {
		// Scroll to the same scene index
		const outline = interface.outline()
		let currentScene = Beat.currentScene

		// Find the corresponding scene number
		for (let i=0; i<outline.length; i++) {
			if (outline[i]?.sceneNumber == currentScene?.sceneNumber && interface.currentScene != outline[i]) {
				interface.scrollToScene(outline[i])
			}
		}
	})
}

// Init 
getOpenDocuments()


