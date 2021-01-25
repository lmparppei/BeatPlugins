# Beat Plugins

This is a collection of open source plugins for [Beat](http://kapitan.fi/beat/).

To install plugins, open Beat and navigate to *Tools → Plugins → Open Plugin Folder...*. Then just drag plugin files into the opened folder. If you write your own plugin, feel free to submit it either through pull request or e-mail.

**NOTE:** Requires Beat 1.7.2 or later.

---

#  Beat Plugin API

Plugins are written in JavaScript and Beat provides a simple API to interact with the app. A plugin can be either a single file (`Plugin.beatPlugin`) or a folder containing a script by the same name (ie. `Plugin.beatPlugin`. Supporting files contained in the folder can then be accessed by the plugin. 

If anybody ever writes a plugin, *please, please, please* be nice to people and test your code thoroughly before deploying it. Loss of work hurts and it might be completely possible to crash the whole app with plugin code. I'm doing my best to stay backwards-compatible 

The included sample plugin demonstrates the basic logic behind plugins.


## Basics

### Writing Plugins

You can use any supported JavaScript features in WebKit, but the script is confined to run inside the app, so you can't access the web, for instance. Scripts run as functions, so they can be terminated any time using `return` when outside any other function scope. It's also advised to **always** end your scripts using `Beat.end()`, especially when using asynchronous methods. 

Have fun and make something useful!

### Get Screenplay Content

`Beat.lines()` – all line objects in the script  
`Beat.scenes()` – scene objects  
`Beat.outline()` – all outline objects, including synopsis & heading markers  
`Beat.linesForScene(scene)` – lines for a specified scene  
`Beat.getText()` — whole document as string  

### Navigate Through The Document

`Beat.setSelectedRange(start, length)` – select a range in the document (**always** double-check that the values are in document range)  
`Beat.scrollTo(index)` – scroll to character index  
`Beat.scrollToScene(scene)` – scroll to a scene object  
`Beat.scrollToLine(line)` – scroll to line  
 
### User Interaction

`Beat.alert("Alert title", "Informative Text")` – simple alert box  
`Beat.confirm("Title", "Informative text")` — get user confirmation, returns `true` or `false`  
`Beat.prompt("Title", "Informative Text", "Placeholder string")` – get text input from the user, returns a string  
`Beat.dropdownPrompt("Title", "Informative Text", [value, value, value])` – allow the user to select a value from an array, returns a string   

For more elaborate inputs it is wiser to use `Beat.htmlPanel()`.   

### Save Plugin Defaults

`Beat.getUserDefault("setting name")` – get a value  
`Beat.setUserDefault("setting name", value)` – save a value  

  
## Manipulating the Document

### Document Model

Beat parser uses `Line` and `Scene` objects to store the screenplay content. To manipulate the document, you make direct changes to the plain-text screenplay content and parse your changes. `Line` object contains useful information about the parsed line, such as line type, position, if it is a Title Page element etc. The `string` property contains its plain-text contents.

`Scene` is more of an abstraction. It's used to determine where a scene starts, its total length in characters, its color and if it is visible or not. Its `string` property contains the scene heading. 

### Adding and Removing Content

`Beat.addString(String, index)` – add string at some index  
`Beat.replaceRange(index, length, string)` – replace a range with a string (which can be empty)  
`Beat.parse()` – parse changes you've made and update the lines/scenes arrays  

### Get and Set Selection

`Beat.selectedRange()` – returns a range object with `.location` and `.length` properties  
`Beat.setSelectedRange(location, length)` – set user selection  

### Lines

**PLEASE NOTE:** You can't just make changes to the line string objects. Every change to the screenplay has to go through the parser, which means using `Beat.addString`, `Beat.replaceRange` etc. to change the document and then parsing your changes.

Lines array contains all the lines in the script as objects. A line object contains multiple values, including but not limited to:

`line.string` —	string content  
`line.position` — starting index of line  
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

`scene.sceneStart` — starting index  
`scene.sceneLength` — length of the whole scene in characters  
`scene.string` — scene heading (eg. INT. HOUSE - DAY)  
`scene.color` — scene color as string  
`scene.omited()` — true/false  
`scene.typeAsString()` — scene type (heading, section, synopse)  
	
Iterate through scenes:  

```
for (const scene of Beat.scenes()) {
	// ...
}
```

## Advanced

### Folder-type Plugin

Plugin can be just a single script, but sometimes plugins require supporting files. Place the script inside a folder of the same name, for example `Plugin.beatPlugin/Plugin.beatPlugin`. The plugin can then access files inside its folder using `Beat.assetAsString(filename)`.

`let text = Beat.assetAsString('text.txt')` – get plugin asset as string

### Import Data

`beat.openFile([extensions], function (filePath) { })` – displays an open dialog for an array of extensions and returns a path to the callback  
`beat.fileToString(path)` – file contents as string  
`beat.pdfToString(path)` – converts PDF file contents into a string  

### HTML Panel

`Beat.htmlPanel(htmlContent, width, height, callback)`   

Displays HTML content with preloaded CSS. You can fetch data from here using two ways. Callback function receives an object, which contains keys `data` and `inputData`. 

You can store an object (***note**: only an object*) in `Beat.data` inside your HTML, which will be returned in the callback. You can also use inputs, just add `rel='beat'` to their attributes. The received object will then contain  `inputData` object, which contains every input with their respective name and value (and `checked` value, too).

```
Beat.htmlPanel(
	"<h1>Hello World</h1><input type='text' rel='beat' name='textInput'><script>Beat.data = { 'hello': 'world' }</script>",
	600, 300,
	function (data) {
		/*
		
		Returned data in this case:
		{
			data: { hello: 'world' },
			inputData: { name: 'textInput', value: '' }
		}
		
		*/
	}
)
```

Easiest way to use HTML panels is to create a folder-type plugin containing a template:
```
let html = Beat.assetAsString("template.html");
Beat.htmlPanel(html, 500, 300, null);
```

Be careful not to overwrite the `Beat` object inside the page, as it can cause the app to be unresponsive to user. Also, only store **an object** in `Beat.data`. You can add your own CSS alongside the HTML if you so will — the current CSS is still under development. Just remember to add `!important` when needed.

**NOTE:** When using asynchronous methods and callbacks in plugins, you **HAVE** to end its execution using `Beat.end()`. Otherwise you might end up draining the user's memory. 


# Plugin Guidelines

* **Be Nice** – don't make the user confused and try not to mess up their work. Test your plugins thoroughly if they make any changes to the screenplay itself. Also take edge cases into account.

* **Be Inclusive** – avoid discriminatory language. For example, don't refer to male/female names, but use women/men/other. Using gender-neutral pronouns native to the chosen language *(ie. they)* is recommended.

* **User Interface** – try to stay consistent. The HTML panel has a preloaded CSS, which might be modified at some point. It's very possible that the stylesheet is quite ugly in your case, so feel free to add some stylization. There are simple stylesheet examples within the existing plugins.

