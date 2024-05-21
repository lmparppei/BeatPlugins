/*

Import Markdown
Version: 1.1
Description: Import Markdown files and convert them to Fountain
Copyright: Lauri-Matti Parppei 2021
Type: Import
<Description>
	<p>Import Markdown files and convert them to Fountain. Replaces basic formatting, converts comments to notes, and multi-line comment blocks to omissions.</p>
	<p>When the mport plugin is installed, you'll see Markdown under <em>File → Import</em>.</p>
</Description>

*/

Beat.importHandler(["md"], function (path) {
	if (path) {
		importMd(Beat.fileToString(path))
	}
})

function importMd(contents) {
	const noteRegex = /%%(.*)%%/g
	const omitRegex = /%%((.|\n)*)%%/gm
	const boldRegex = /__((.)*)__/gm
	const italicRegex = /_((.)*)_/gm

	// Replace notes
	let text = contents
	text = text.replace(noteRegex, "[[$1]]")
	text = text.replace(omitRegex, "/*$1*/")
	text = text.replace(boldRegex, "**$1**")
	text = text.replace(italicRegex, "*$1*")

	Beat.newDocument(text)
}
