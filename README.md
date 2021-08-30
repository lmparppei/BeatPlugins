# Beat Plugins

This is a collection of open source plugins for [Beat](http://kapitan.fi/beat/). 

These official and verified plugins can be downloaded directly inside the app. To browse the available plugins, open Beat and click *Tools → Plugin Library...*. 

To install custom plugins or create your own, click on the folder icon to open the plugin folder. Then just drag & drop a plugin container into the folder, and you are all set.

If you write your own plugin, feel free to submit it either through a pull request or e-mail. 

Official plugins in this repository are released under **MIT License**. 


---

#  Beat Plugin API

Plugins are written in JavaScript. Beat provides a simple API to interact with the app.

A plugin can be either a single file (`Plugin.beatPlugin`) or a folder containing script file by the same name (ie. `Plugin.beatPlugin/Plugin.beatPlugin`. In the folder model, plugins can access supporting asset files, such as HTML templates.

The included sample plugin demonstrates basic logic behind plugins. Documentation below is updated alongside new versions of the app. The best way learn plugin development is to study the existing ones.


## Basics

### Writing Plugins

You can use any supported JavaScript features in WebKit, but the script is confined to run inside the app. You can't access the web, for instance. Scripts run as functions, so they can be terminated any time using `return` when outside any other function scope. It's also advised to **always** terminate your scripts using `Beat.end()`, especially when using asynchronous methods. 

Have fun and make something useful!
  

### Debugging

`Beat.openConsole()` — opens a console for plugin development. Never leave this on for released plugins.
`Beat.log("Message")` — log messages into the console 


### Access Screenplay Content

`Beat.lines()` – all line objects in the script  
`Beat.scenes()` – scene objects  
`Beat.outline()` – all outline objects, including synopsis & heading markers  
`Beat.linesForScene(scene)` – lines for a specified scene  
`Beat.getText()` — whole document as string  
`Beat.currentLine` — line which has the caret  
`Beat.setColorForScene(scene, color)` — set color for a scene object (use `"none"` to remove any existing color)  
  

### Navigate Through The Document

`Beat.selectedRange()` – returns a range object with `.location` and `.length` properties  
`Beat.setSelectedRange(location, length)` – set user selection (make sure you don't go out of range)  
`Beat.scrollTo(index)` – scroll to character index  
`Beat.scrollToScene(scene)` – scroll to a scene object  
`Beat.scrollToLine(line)` – scroll to a line object  
   

### User Interaction

`Beat.alert("Alert title", "Informative Text")` – simple alert box  
`Beat.confirm("Title", "Informative text")` — ask for confirmation, returns `true` or `false`  
`Beat.prompt("Title", "Informative Text", "Placeholder string")` – get text input from the user, returns a string  
`Beat.dropdownPrompt("Title", "Informative Text", [value, value, value])` – allow the user to select a value from an array, returns a string   

For more elaborate inputs it is wiser to use `Beat.htmlPanel()` or `Beat.modal()`.  
  
  
### Advanced Modal Windows

You can create more advanced modal windows with multiple types of inputs using `Beat.modal()`. It takes in an object with the following properties: `title` (title of the modal), `info` (informative text) and `items: []` (an array of inputs).

See the example below to get an idea on how advanced modals work.

```
Beat.modal({
	title: "This is a test modal",
	info: "You can input stuff into multiple types of fields",
	items: [
		{
			type: "text",
			name: "characterName",
			label: "Character Name",
			placeholder: "First Name"
		},
		{
			type: "dropdown",
			name: "characterRole",
			label: "Role",
			items: ["Protagonist", "Supporting Character", "Other"]
		},
		{
			type: "space"
		},
		{
			type: "checkbox",
			name: "important",
			label: "This is an important character"
		},
		{
			type: "checkbox",
			name: "recurring",
			label: "Recurring character"
		}
	]
}, function(response) {
	if (response) {
		// The user clicked OK
		Beat.log(JSON.stringify(response))
	} else {
		// The user clicked CANCEL
	}
})
```



### Save Plugin Defaults

#### App-wide settings

`Beat.getUserDefault("setting name")` – get a user setting  
`Beat.setUserDefault("setting name", value)` – save a user setting  

#### Document-specific settings

These settings are saved alongside the document, and ignored by other Fountain apps.

`Beat.getDocumentSetting("setting name")` – get a document setting  
`Beat.setDocumentSetting("setting name", value)` – set a document setting  

The methods above have a prefix which prevent them from overwriting document settings saved by Beat.

If you *really* know what you are doing, you *can* access those using `Beat.setRawDocumentSetting()` and `Beat.getRawDocumentSetting()`. Open a Fountain file created by Beat and see the JSON block at the end of the file, to get a clue about the values.

### Tagging Data

`Beat.tagsForScene(scene)` — returns a dictionary of tagged items in the scene.

Tags have `.name` and `.range` properties, and a method for getting the type, `.typeAsString()`. Tagging dictionary is structured by type: `{ "Cast": [...], "Prop": [...] }`

***Note**: Tagging is unavailable on UI side, for now*

  
## Manipulating the Document

### Document Model

Beat parser uses `Line` and `Scene` objects to store the screenplay content. To manipulate the document, you make direct changes to the plain-text screenplay content and parse your changes. `Line` object contains useful information about the parsed line, such as line type, position, if it is a Title Page element etc. `line.string` contains the plain-text contents.

`Scene` is more of an abstraction. It's used to determine where a scene starts, its total length in characters, its color and if it is visible or not. `scene.string` property contains the scene heading. A `Scene` object can be either a normal scene heading, section heading (of any level) or a synopsis line. You can filter out sections and synopsis lines by using `Beat.scenes()`.

You **cannot** add text by manipulating these objects, and the plugin API won't let you do that, either, as the values are read-only. If you want to add, remove or replace some text in the screenplay, you will need to add it manually using indexes.


### Adding and Removing Content

`Beat.addString(String, index)` – add string at some index  
`Beat.replaceRange(index, length, string)` – replace a range with a string (which can be empty to remove text)  

Any changes you make are directly represented in the `Line` objects. That's why you can iterate through lines, make changes on the run, and the positions are kept up to date during iteration, as long as you don't add multiple lines.
  

### Lines

**PLEASE NOTE:** You can't just make changes to the line string objects. Every change to the screenplay has to go through the parser, which means using `Beat.addString`, `Beat.replaceRange` etc. to change the document. Never change the values, just read them.

`Beat.lines()` array contains all the lines in the script as objects. This is not a copy of the array, but the actual line array from parser. A line object contains multiple values, including but not limited to:

`line.string` —	string content  
`line.position` — starting index of line  
`line.textRange` — range of the line (`{ location: ..., range: ... }`)  
`line.range` — full location and length INCLUDING line break  
`line.typeAsString()` — "Heading" / "Action" / "Dialogue" / "Parenthetical" etc.  
`line.isTitlePage()` — true/false  
`line.isInvisible()` — true/false  
`line.cleanedString()` — non-printing stuff removed  
`line.stripFormatting()` – non-printing suff and any Fountain formatting removed  
`line.omitted`— true/false  
`line.note` — if the line is a note (wrapped in `[[]]`), true/false  
`line.clone()` — make a copy of the line into memory  

Iterate through lines:
```
for (const line of Beat.lines()) {  
	// Do something  
}  
```	


### Scenes

**NOTE:** `sceneStart` and `sceneLength` are now `position` and `length`. The former are still supported for backwards compatilibity, but deprecated as of 1.89.2 (July 2021).

`scene.line` – line object which begins the scene (ie. heading)  
`scene.position` — starting index  
`scene.length` — scene length in characters  
`scene.string` — scene heading (eg. INT. HOUSE - DAY)  
`scene.color` — scene color as string  
`scene.omited` — true/false  
`scene.storylines` — storylines for the scene  
`scene.sectionDepth` – depth of a section element  
`scene.typeAsString()` — scene type (heading, section, synopse)  
	
Iterate through the outline (includes sections and synopsis markers):  
```
for (const scene of Beat.outline()) {
	// ...
}
```

Iterate through **scenes only**:  
```
for (const scene of Beat.scenes()) {
	// ...
}
```

**NOTE**: Avoid calling `Beat.scenes()` and `Beat.outline()` too often. Both build the whole outline from scratch and can slow down your performance. If possible, save the structure into a variable in the beginning: `const scenes = Beat.scenes()`
  

### Paginator

You can calculate page lengths for lines using the paginator. It can return either a number of pages used, or page length in eights. By default, paginator uses page size (A4/US Letter) from the print dialog.

`const paginator = Beat.paginator()` — create a new paginator instance  
`paginator.paginateLines(lines)` — paginate given lines  
`paginator.numberOfPages` — full number of pages  
`paginator.lengthInEights` — page length in eights, returns `[fullPages, eights]`  
`paginator.setPageSize(0)` — set page size, `0` for A4, `1` for US Letter  

Calculate individual scene lengths in eights:

```
const paginator = Beat.paginator() // Create new paginator instance
const scenes = Beat.scenes()

for (const scene of scenes) {
	const lines = Beat.linesForScene(scene)
	paginator.paginateLines(lines)
	
	let eights = paginator.lengthInEights() // Returns [pages, eights]
}
``` 

**NOTE**: Plan is to deprecate the current paginator as soon as possible. This can be either next week or two years from now. Future paginator will still have the same methods and keywords, and I'll try to keep it backwards-compatible.
  

# Advanced

## Folder-type Plugin

Plugin can be just a single script, but sometimes plugins require supporting assets.

To use additional assets, place the script file inside a folder with the same name, for example `Plugin.beatPlugin/Plugin.beatPlugin`. Plugin can then access any file in the folder using `Beat.assetAsString(filename)`.

`let text = Beat.assetAsString('text.txt')` – get plugin asset as string

**Note:** For the sake of clarity, distributed plugins are all wrapped in folders.

  

## Resident Plugins & Listeners

Usually plugins are just run once, and not left in the memory. If you want the plugin to remain active and track changes to the document, you need to set up an update function. Resident plugins remain in memory even after using `return`, and can be terminated with `Beat.end()` or by unchecking the plugin from *Tools* menu.

Update methods have to be **very** efficient, so they won't slow down the UI. 


### Listen to Text Change

Runs whenever the screenplay is edited, and receives location and length of the latest change.

```
Beat.onTextChange(
	function (location, length) {
		Beat.log("Edited at " + location + " (length: " + length +")")
	}
);
```

### Listen to Selection Change

You can listen to selection changes with `setSelectionUpdate()`. Note that this method is also run when the text changes. Make your update method as snappy as possible.

```
Beat.onSelectionChange(
	function (location, length) {
		Beat.log("Selection changed to " + location + "/" + length)
	}
)
```

### Listen to Changes in Outline

`onOutlineChange()` fires when a scene is added — or something is edited on the edge of a scene.

```
Beat.onOutlineChange(
	function (...outline) {
		for (let i=0; i < outline.length; i++) {
			// Do something with the new outline
		}
	}
)
```

### Listen to Current Scene

Instead of listening to changes in selection and figuring out current scene, you can ask for current scene index. Like `.onSelectionChange()`, `.onSceneIndexUpdate(...)` runs whenever the user selects anything, but only returns the **index** for current scene/outline item. It can be the same as before.

This should only be used for updating something in your UI. For example, if you have created a visual representation of the screenplay using `Beat.outline()` and keep it updated using `Beat.onOutlineChange()`, you current scene index can be used to highlight the scene being edited.

**NOTE**: Index is valid **ONLY** for the full outline (`Beat.outline()`) 

```
const scenes = Beat.outline()
Beat.onSceneIndexUpdate(
	function (sceneIndex) {
		let currentScene = scenes[sceneIndex]
	}
)
```

### Disabling Listeners

If you are listening to text changes and would like to make changes to the text on some event, your original update function will be called again. This can cause an infinite loop.

To avoid strange loops, you can disable the listeners when needed:  

```
Beat.onTextChange(function (len, loc) {
	Beat.onTextChangeDisabled = true
	Beat.replaceRange(0,0, "Hello World! ")
	Beat.onTextChangeDisabled = false
})
```

Property names for disabling change listeners correspond to their setter methods. 

```
Beat.onTextChangeDisabled = true/false
Beat.onOutlineChangeDisabled = true/false
Beat.onSelectionChangeDisabled = true/false
Beat.onSceneIndexChangeDisabled = true/false
```




## Timer

When using a **resident plugin**, you can set a timer for a single interval. The timer **will not** repeat itself.

```
Beat.timer(1.0, function () {
	Beat.log("One second elapsed.")
})
```


 
## Displaying Content

### HTML Panel 

Displays HTML in a **modal** window with preloaded CSS.

`Beat.htmlPanel(htmlContent, width, height, callback, okButton)`

Please note that HTML panel is just a normal web page, and you **can't** run regular plugin code from inside the page without using a special evaluation method, `Beat.call()`. *(**NOTE**: `call` is unavailable in HTML panel until 1.87.3)*

Last parameter, `okButton` is a boolean value. If set to `true`, HTML panel displays *Cancel* and *OK* buttons instead of the standard *Close*. Pressing *OK* then submits data and runs callback, while *Cancel* just closes the panel.

There are three ways to fetch data from `htmlPanel`:

1) Storing an object (***note**: only an object*) into `Beat.data` inside your HTML. It will be returned in the callback alongside other data.

2) Using HTML inputs. Just remember to add `rel='beat'` attribute. The received object will then contain  `inputData` object, which contains every input with their respective name and value (and `checked` value, too).

3) Calling `Beat.call("javaScriptString")` inside the HTML sends code to be evaluated by the main plugin. **Note** that the JS parameter needs to be a string, ie. `Beat.call("Beat.log('Hello world');")`. 

The `callback` function receives an object, which contains two keys, `data` and `inputData`. You can use both if you want to.

```
Beat.htmlPanel(
	"<h1>Hello World</h1>\
	<input type='text' rel='beat' name='textInput'>\
	<script>Beat.data = { 'hello': 'world' }</script>",
	600, 300,
	function (result) {
		/*
		
		In this case, callback receives:
		result = {
			data: { hello: 'world' },
			inputData: { name: 'textInput', value: '' }
		}
		
		*/
		Beat.end()
	}
)
```

Be careful not to overwrite `Beat` object inside the page, as it can cause the app to be unresponsive to user. Also, only store **an object** in `Beat.data`. You can add your own CSS alongside the HTML if you so will — the current CSS is still under development. Just remember to add `!important` when needed.

The easiest way to use HTML panels is to create a folder-type plugin and loading a template:  
```
let html = Beat.assetAsString("template.html");
Beat.htmlPanel(html, 500, 300, null);
```

**NOTE:** When using asynchronous methods and callbacks in plugins, you **HAVE** to end its execution using `Beat.end()`, as in the example above. Otherwise you might end up draining the user's memory.

### HTML Window

A standalone, floating window. Creating a window will make the plugin reside in memory, so remember to terminate using `Beat.end()` in the callback, if needed.

`let htmlWindow = Beat.htmlWindow(htmlContent, width, height, callback)`   

The biggest difference to `htmlPanel` is, that you can transfer data in real time between plugin and its HTML window. Use `Beat.call("evaluatedJavaScript")` inside HTML to access Beat, and `htmlWindow.runJS("evaluatedJavaScript")` inside the plugin itself, to evaluate JavaScript in the window.

```
let htmlWindow = Beat.htmlWindow(
	"<div id='ctx'></div>\
	<script>\
		let ctx = document.getElementById('ctx')\
		Beat.call(\"Beat.log('Hello world')\")
	</script>", 
	300, 200,
	function () { Beat.end() }
)

Beat.setUpdate(function (loc, len) {
	htmlWindow.runJS("ctx.innerHTML += 'change at " + loc + ' (length ' + len + ")<br>'")
})
```

The code above creates a floating HTML window, logs a confirmation message from inside the HTML, and will display every change to the document. 

**Always** remember to terminate the plugin using `Beat.end()` in the callback if you don't want to leave it running in the background.


#### Interacting With Windows

`htmlWindow.title` — window title
`htmlWindow.setTitle(string)` — set window title  
`htmlWindow.setHTML(htmlString)` — set window content  
`htmlWindow.close()` — close the window and run callback  
`htmlWindow.setFrame(x, y, width, height)` — set window position and size  
`htmlWindow.getFrame()` — returns position and size for the window  
`htmlWindow.screenSize()` — returns size for the screen window has appeared on 
`htmlWindow.runJS(javascriptString)` — sends JavaScript to be evaluated in the window 


### Communicating With Plugin

You can run any regular JavaScript inside HTML panel/window, but **NOT** your normal Beat plugin code

Think of it as host/client situation: plugin is the host, HTML window is the client. Communication is handled using strings containing JavaScript code. HTML window provides couple of methods for this.

To access the app or send and fetch data, you can either use `Beat.call()` which evaluates a JavaScript code string, or send data through callbacks. 


#### Callbacks

Inside **HTML panel**, set `Beat.data` object to be another object. This object is sent to the parser when user presses *Close*. If you want to create your own submit button, use `sendBeatData()` method in your JavaScript. 

HTML code:  
````
<script>
	Beat.data = { customData: "This will be sent to the callback." }
</script>
<button onclick='sendBeatData()'>Send Data</button>
````

Plugin code:  
````
Beat.htmlPanel(html, 400, 400, function (htmlData) {
	// We will now receive any data set in the HTML panel
	Beat.alert("This is what we got:", htmlData.data.customData)
})
````

The above method will also receive all the normal data, such as form elements with `rel='beat'` attached to them.


#### Calling Plugin Methods

If you want to run plugin code from inside an HTML window/panel, you need to send it to the plugin for evaluation using `Beat.call`, ie. `Beat.call("Beat.log('Hello')")`.

There are some quirks because of JavaScript scope and asynchronous communication. This is why you **can't** run plain functions through evaluation. For example, this **WILL NOT WORK**:

HTML:  
```
<script>Beat.call("hello()");</script>
```

Plugin:  
```
function hello() {
	Beat.alert("Hello World")
}
```

**Instead**, To call a custom function from inside the HTML, you need to register a custom `Beat` object.

Plugin:  
```
Beat.custom = {
	hello: function () {
		Beat.alert("Hello World!")
	}
}
```

HTML:  
```
<script>Beat.call("Beat.custom.hello()");</script>
```

Communicating with the window is a constant and convoluted ping-pong of evaluations and stringified data. Look through existing plugin code or drop by Beat Discord to ask for help. 


## File Access

Because Beat is sandboxed, the user has to confirm file access. Please don't try to do anything malicious. 

### Import Data

`Beat.openFile([extensions], function (filePath) { })` – displays an open dialog for an array of extensions and returns a path  
`Beat.openFiles([extensions], function ([filePaths]) { })` — as above, but allows selecting multiple files and returns an **array** of paths  
`Beat.fileToString(path)` – file contents as string  
`Beat.pdfToString(path)` – converts PDF file contents into a string  

### Export Data

`Beat.saveFile(extension, function (filePath) { })` – displays a save dialog and returns the path to callback  
`Beat.writeToFile(path, content)` – write a string to path

## Standalone Plugins

In the future, you will be able to create standalone plugins, which run independently and are not attached to a document. The feature will be used for file import plugins, but can be exploited to create other tools, too. 

## Background Threading

While running a resident plugin (ie. something with either `onTextChange`, `onSelectionChange`, `onOutlineChange` or `htmlWindow`), you might want to run more demanding processes in the background. Using background threads requires some minor knowledge on how threading works on macOS.

You can use `Beat.dispatch()` to run a background worker, and then `Beat.dispatch_sync()` to return its results to main thread.

`Beat.dispatch(function)` — run a function in a background thread  
`Beat.dispatch_sync(function)` — run a function in the main thread  

**WARNING:** You CANNOT call anything UI-related from a background thread. Be sure to fetch any required synchronous data (such as selected range, scenes, lines etc.) before entering a background thread. **Never** access anything synchronous while processing something in the background, or you might risk crashing the app.

Using background threads in plugins is highly experimental and unrecommended, but I can't stop you anymore. Just be careful, dread lightly and **test** your code thoroughly.

Example:  
```
// Load any required data
const scenes = Beat.scenes()
const lines = Beat.lines()

// Dispatch to a background thread
Beat.dispatch(function () {
	// Do something with the data
	for (let line of lines) {
		// ...
	}

	// Return results to the main thread (UI)
	Beat.dispatch_sync(function () {
		htmlWindow.setHTML("Results: ... ")
	})
})
```

## Accessing the Parser

Most of the methods here are wrappers for the parser associated with current document. The actual, underlying parser for the host document can be accessed through `Beat.currentParser`:  

```
let parser = Beat.currentParser
for (let line of parser.lines) {
	//...
}
``` 

You can also create a new, static parser to parse external Fountain files, with access to their line and scene objects.

```
let parser = Beat.parser(stringToParse)

for (let line of parser.lines) {
	// ...
}
```

There are some property/method inconsistencies between the normal Beat parser access and the core parser object. Most property names are the same, however.

`parser.lines` — line objects *(**note**: property, not a method)*  
`parser.outline` — all scene objects, including synopsis lines and sections *(note: property, not a method)*  
`parser.scenes` — scene objects only *(**note**: property, not a method)*  
`parser.titlePage` — title page elements  
`parser.linesInRange({ location: x, length: y })` — get all lines in the selected range *(**note:** parameter has to be a range object)*  
`parser.lineAtIndex(index)` — get line item at given character index  
`parser.sceneAtIndex(index)` — get outline item at given character index  
  

# Plugin Guidelines

* **Be Nice** – don't make the user confused and try not to mess up their work. Test your plugins thoroughly, especially if they make any changes to the screenplay itself. Try to take edge cases into account.

* **Be Inclusive** – avoid discriminatory language. For example, use *women/men/other* rather than male/female. Using gender-neutral pronouns *(ie. they, hän, hen, etc.)* is recommended when gender is ambiguous.

* Preferrably distribute your plugins **free of charge** and make them open source. Beat is a non-profit and anti-capitalist venture, and not a platform for finding loose change. Nothing prevents you from making money out of custom plugins, but sharing your creations would be greatly appreciated!


## Plugin Info

If you want your plugin to be distributed, you should add a block of information at the beginning of your file:

```
/*

Name: Plugin Name
Copyright: Copyright Holder
Description: A short description of what the plugin does
Version: 1.0
Type: Plugin Type

*/
```

Version numbers should use **ONLY** numbers, and preferrably just a single dot, as in `1.1` or `2.12`. If a more recent version of the plugin is available in this repository, the Plugin Manager will show an option to update it.

Allowed plugin types are `Tool`, `Export`, `Import` and `Standalone`. 

To get your plugin published in the Plugin Library, either submit a pull request, or send your plugin via e-mail: beat@kapitan.fi 

