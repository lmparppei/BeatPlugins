/*

Name: Shortcut Cheat Sheet
Version: 1.0

Copyright: Lauri-Matti Parppei 2025
Description: Displays a floating window with all shortcuts in the app, including custom ones. You can also filter the results.
Image: Shortcut_Cheat_Sheet.jpg

*/

require("MojaveSupport")
require("Template")

function listShortcuts() { // -> String (HTML table)

	let templates = {
		"item": new Template("<tr><td class='item depth-{{depth}}'>{{title}}</td><td class='keys'>{{mask}}&nbsp;{{keys}}</td></tr>"),
		"heading": new Template("<tr><td colspan='2' class='heading depth-{{depth}}'><b>{{title}}</b></td></tr>")
	}

	// These are the bitmasks of NSEvent modifier masks
	const ModifierFlags = {
		capsLock:  1 << 16,
		shift:     1 << 17,
		control:   1 << 18,
		option:    1 << 19,
		command:   1 << 20,
		numericPad:1 << 21,
		help:      1 << 22,
		function:  1 << 23
	};

	// Shortcut symbols
	const KeySymbols = {
		shift: "⇧",
		control: "⌃",
		option: "⌥",
		command: "⌘",
		function: "🌐︎"
	}

	// Some characters can't be represented by default font, map them here
	const Keys = {
		"": "↑",
		"": "↓",
		"\t": "↹",
		" ": "␣"
	}

	// Returns a human-readable array of key modifiers
	function describeMask(mask) {
		return Object.entries(ModifierFlags)
			.filter(([name, value]) => (mask & value) !== 0)
			.map(([name]) => KeySymbols[name]);
	}

	// Replaces the non-printing key symbols
	function replaceKeys(keys) { // -> string
		for (let [key, value] of Object.keys(Keys)) {
			keys = keys.replaceAll(key, Keys[key])
		}
		return keys
	}

	let depth = -1

	/// Returns [{ title:, keys:, mask: }]
	function getMenuItems(menu) {

		let items = []

		let menuItems = menu.getMenuItems()

		for (item of menuItems) {
			if (item.isHidden) continue;

			let m = {
				title: item.title,
				keys: item.keyEquivalent,
				mask: describeMask(item.keyEquivalentModifierMask)
			}

			if (item.submenu != null) {
				m.submenu = getMenuItems(item.submenu)
			}

			if (m.submenu?.length > 0 || (item.keyEquivalent != null && item.keyEquivalent?.length > 0)) {
				items.push(m)
			}
		}

		return items
	}

	let allItems = getMenuItems(Beat.getMainMenu())

	let html = ""

	// Top level items
	for (const item of allItems) {
		html += "<table>"
		addHTML(item.title, item.submenu, 0)
		html += "</table>"
	}

	function addHTML(title, submenu, depth) {
		if (title == "Services") return;

		html += templates.heading.withData({ title: title, depth: depth })

		for (const item of submenu) {
			item.depth = depth

			if (item.submenu?.length > 0) {
				item.depth++
				addHTML(item.title, item.submenu, depth + 1)
			} else {
				item.keys = replaceKeys(item.keys).toUpperCase()
				item.mask = item.mask.join("")
				html += templates.item.withData(item)
			}
		}
	}

	return html
}


const html = listShortcuts()
let ui = Beat.assetAsString("ui.html")
ui = ui.replace("%items%", html)

const screenSize = Beat.screen() // [x, y, w, h]
let window = Beat.htmlWindow({ content: ui }, 250, Beat.screen()[3] * 0.8, () => {
	Beat.setUserDefault("frame", window.getFrame())
	Beat.end()
})

let frame = window.getFrame()

const savedFrame = Beat.getUserDefault("frame")
if (savedFrame) window.setFrame(savedFrame.x, savedFrame.y, savedFrame.width, savedFrame.height);
else window.setFrame(screenSize[2] - frame.width - 20, frame.y, frame.width, frame.height)

