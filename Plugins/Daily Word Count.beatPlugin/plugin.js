/*
Daily Word Count
Short description: Track your writing progress with a word count counter.
Compatibility: 1.999.10
Copyright: Bode Pickman
<Description>
  <p>Introducing "Daily Word Count," a simple yet powerful Beat plugin designed to help you stay on top of your writing goals. This plugin keeps track of the number of words you write, providing a clear picture of your productivity and progress.</p>
  <p>Features:</p>
  <ul>
    <li>Counts the words you write in Beat, excluding inline notes, text with equal signs, and headings</li>
    <li>Displays the word count in a floating window</li>    
    <li>Updates the word count automatically as you write</li>
    <li>Reset your daily word count back to zero to start fresh every day or every session</li>
    <li>Allows you to set a custom word count goal and highlights the count in blue when the goal is reached</li>
    <li>Customize the size of the word count display by clicking the magnifying glass icon</li>
    <li>Use the eye icon to toggle between two different counter views: daily word count and total word count</li> 
    <li>Minimalist and unobtrusive design</li>
    <li>Supports dark mode</li>
  </ul>
  <p>With "Daily Word Count," you can stay motivated and focused on your writing goals. Keep an eye on your output and strive to improve your productivity over time.</p>
</Description>
Image: daily_word_count.jpg
Version: 1.1
*/
const html = Beat.assetAsString("ui.html")
let wordCount = 0;
let totalWordCount = 0;
let initialWordCount = 0;
let wordCountGoal = null; // Initialize the word count goal to null
let isPluginWindowOpen = false; // Track the state of the plugin window
let countingMode = 'up';

// Set up the panel
let panel = Beat.htmlWindow(html, 155, 65);
panel.stayInMemory = true;
panel.disableFullScreen = true; // Disable full-screen mode
panel.disableMinimize = true;
panel.disableMaximize = true;

function countWords(text) {
    // Remove inline notes, synopsis, headings, sections, and omits.
    const cleanedText = text
        .replace(/\[\[.*?\]\]/g, '') // Remove inline notes
        .replace(/^=.*$/gm, '') // Remove synopsis
        .replace(/^#.*$/gm, '') // Remove sections
        .replace(/\/\*.*?\*\//gs, '') // Remove omits
        .replace(/^\..*$/gm, ''); // Remove headings
        

    // Split the cleaned text into words and count them
    const words = cleanedText.trim().split(/\s+/).length;

    return words;
}



// Function to update the word count
function updateWordCount() {
    let text = Beat.getText();
    totalWordCount = countWords(text);
    wordCount = totalWordCount - initialWordCount;
    panel.runJS(`updateCount(${wordCount}, ${totalWordCount}, ${wordCountGoal}, '${countingMode}')`);
}

// Function to toggle the plugin window
function togglePluginWindow() {
    if (isPluginWindowOpen) {
        panel.hide();
        isPluginWindowOpen = false;
    } else {
        panel.show();
        panel.focus();
        isPluginWindowOpen = true;
    }
}

// Create a menu item to toggle the plugin window
const menuItem = Beat.menuItem("Daily Word Count", ["cmd", "shift", "W"], togglePluginWindow);
const menu = Beat.menu("Daily Word Count", [menuItem]);

// Listen for text changes in the editor
Beat.onTextChange(function (location, length) {
    Beat.onTextChangeDisabled = true; // Disable the listener to avoid loops
    updateWordCount();
    Beat.onTextChangeDisabled = false; // Re-enable the listener
});

// Custom methods
Beat.custom = {
    resetCount: function () {
        let text = Beat.getText();
        totalWordCount = countWords(text);
        initialWordCount = totalWordCount;
        wordCount = 0;
        countingMode = 'up';
        updateWordCount();
    },
    setWordCountGoal: function (goal) {
        wordCountGoal = goal === '' ? null : parseInt(goal);
        updateWordCount();
    },
    toggleCountingMode: function () {
        countingMode = countingMode === 'up' ? 'down' : 'up';
        updateWordCount();
    }
};

// Get the initial word count when the plugin is loaded
let text = Beat.getText();
totalWordCount = countWords(text);
initialWordCount = totalWordCount;
