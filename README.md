# Beat Plugins

This is a collection of open source plugins for [Beat](http://kapitan.fi/beat/).

To install plugins, open Beat and navigate to *Tools → Plugin Library...* (*Manage Plugins* in older versions). You can download official plugins right from the app. To install custom ones or create your own, click on the folder icon to open the plugin folder.

If you write your own plugin, feel free to submit it either through pull request or e-mail. Sometimes, some of the stuff documented here might only work in the latest development build. 

Official plugins in this repository are released under **MIT License**.


---

#  Beat Plugin API

Plugins are written in JavaScript. Beat provides a simple API to interact with the app.

A plugin can be either a single file (`Plugin.beatPlugin`) or a folder containing script file by the same name (ie. `Plugin.beatPlugin/Plugin.beatPlugin`. In the folder model, plugins can access supporting asset files, such as HTML templates.

The included sample plugin demonstrates basic logic behind plugins.


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

For more elaborate inputs it is wiser to use `Beat.htmlPanel()`.   
  

### Save Plugin Defaults

`Beat.getUserDefault("setting name")` – get a value  
`Beat.setUserDefault("setting name", value)` – save a value  
  

### Tagging Data

`Beat.tagsForScene(scene)` — returns a dictionary of tagged items in the scene.

Tags have `.name` and `.range` properties, and a method for getting the type, `.typeAsString()`. Tagging dictionary is structured by type: `{ "Cast": [...], "Prop": [...] }`

***Note**: Tagging is unavailable on UI side, for now*

  
## Manipulating the Document

### Document Model

Beat parser uses `Line` and `Scene` objects to store the screenplay content. To manipulate the document, you make direct changes to the plain-text screenplay content and parse your changes. `Line` object contains useful information about the parsed line, such as line type, position, if it is a Title Page element etc. The `string` property contains its plain-text contents.

`Scene` is more of an abstraction. It's used to determine where a scene starts, its total length in characters, its color and if it is visible or not. Its `string` property contains the scene heading. 


### Adding and Removing Content

`Beat.addString(String, index)` – add string at some index  
`Beat.replaceRange(index, length, string)` – replace a range with a string (which can be empty)  
`Beat.parse()` – parse changes you've made and update the lines/scenes arrays  
  

### Lines

**PLEASE NOTE:** You can't just make changes to the line string objects. Every change to the screenplay has to go through the parser, which means using `Beat.addString`, `Beat.replaceRange` etc. to change the document and then parsing your changes. Just read values and never change them.

Lines array contains all the lines in the script as objects. A line object contains multiple values, including but not limited to:

`line.string` —	string content  
`line.position` — starting index of line  
`line.textRange` — range of the line `{ location: ..., range: ... }`  
`line.range` — full location and length INCLUDING line break  
`line.typeAsString()` — "Heading" / "Action" / "Dialogue" / "Parenthetical" etc.  
`line.isTitlePage()` — true/false  
`line.isInvisible()` — true/false  
`line.cleanedString()` — non-printing stuff removed  

Iterate through lines:
```
for (const line of Beat.lines()) {  
	// Do something  
}  
```	


### Scenes

`scene.line` – line object which begins the scene (ie. heading)  
`scene.sceneStart` — starting index  
`scene.sceneLength` — length of the whole scene in characters  
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

**NOTE**: Avoid calling `Beat.scenes()` and `Beat.outline()` too often. Both build the whole outline from scratch and can slow down your performance. Instead, save the structure into a variable in the beginning: `const scenes = Beat.scenes()`
  

### Paginator

You can calculate page lengths for lines using the paginator. It can return either a number of pages used, or page length in eights. Paginator uses page size (A4/US Letter) from the print dialog.

`const paginator = Beat.paginator()` — create new paginator instance  
`paginator.paginateLines(lines)` — paginate given lines  
`paginator.numberOfPages` — full number of pages  
`paginator.lengthInEights` — page length in eights, returns `[fullPages, eights]`  

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

  

# Advanced

## Folder-type Plugin

Plugin can be just a single script, but sometimes plugins require supporting files. Place the script inside a folder of the same name, for example `Plugin.beatPlugin/Plugin.beatPlugin`. The plugin can then access files inside its folder using `Beat.assetAsString(filename)`.

`let text = Beat.assetAsString('text.txt')` – get plugin asset as string

**Note:** For the sake of clarity, the distributed plugins are all wrapped in folders.

  

## Resident Plugins

Usually plugins are just run once, and not left in the memory. If you want the plugin to remain active and track changes to the document, you need to set up an update function. 

Update methods have to be **very** efficient, not to slow down the UI. Resident plugins remain in memory even after using `return`. They can be terminated with `Beat.end()` or by unchecking the plugin from *Tools* menu.

### Text Change Update

Default update method is run whenever the screenplay is edited, and receives location and length of the latest change.

```
Beat.setUpdate(
	function (location, length) {
		Beat.log("Edited at " + location + " (length: " + length +")")
	}
);
```

### Selection Change Update

You can listen to selection changes with `setSelectionUpdate()`. Note that this method is also run when the text changes. Make your update method as snappy as possible.

```
Beat.setSelectionUpdate(
	function (location, length) {
		Beat.log("Selection changed to " + location + "/" + length)
	}
)
```

 
## Displaying Content

### HTML Panel 

Displays HTML a **modal** window with preloaded CSS.

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

Communicating with the window is a constant ping-pong of evaluations and stringified data. Look through existing plugin code, or drop by Beat Discord to ask for help. 


## File Access

### Import Data

`Beat.openFile([extensions], function (filePath) { })` – displays an open dialog for an array of extensions and returns a path to the callback  
`Beat.fileToString(path)` – file contents as string  
`Beat.pdfToString(path)` – converts PDF file contents into a string  

### Export Data

`Beat.saveFile(extension, function (filePath) { })` – displays a save dialog and returns the path to callback  
`Beat.writeToFile(path, content)` – write a string to path. macOS will confirm file access from the user. Please don't try to do anything malicious.


## Standalone Plugins

In the future, you will be able to create standalone plugins, which run independently and are not attached to a document. The feature will be used for file import plugins, but can be exploited to create other tools, too. 


## Background Threading

While running a resident plugin (ie. something with either `setUpdate`, `setSelectionUpdate` or `htmlWindow`), you might want to run more demanding processes in the background. You can then use `Beat.dispatch()` to run a background worker, and then `Beat.dispatch_sync()` to return its results to main thread.

`Beat.dispatch(function)` — run a function in a background thread
`Beat.dispatch_sync(function)` — run a function in the main thread

**NOTE:** You CANNOT call anything UI-related from a background thread. Be sure to fetch any required synchronous data (such as selected range, scenes, lines etc.) before entering a background thread. **Never** access anything synchronous while processing something in the background.

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

	// Return the results to UI in main thread
	dispatch_sync(function () {
		htmlWindow.setHTML("Results: ... ")
	})
})
```


  

# Plugin Guidelines


* **Be Nice** – don't make the user confused and try not to mess up their work. Test your plugins thoroughly if they make any changes to the screenplay itself. Also take edge cases into account.

* **Be Inclusive** – avoid discriminatory language. For example, use *women/men/other* rather than male/female. Using gender-neutral pronouns *(ie. they, hen, etc.)* is recommended when gender is ambiguous.

* Preferrably distribute your plugins **free of charge** and make them open source. Beat is a non-profit and anti-capitalist venture, and not a platform for making profits. Nothing prevents you from making money out of making custom plugins, but sharing your creations would be greatly appreciated!


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

