/*

Plugin name: Clean (CONT'D)'s
Description: Tidies up all (CONT'D)'s in a screenplay.
Image: Clean (CONT'D)'s.png

Version: 1.2
Copyright: 2025 gfrancine

*/

const promptResult = Beat.dropdownPrompt(
  "Clean (CONT'D)'s: Select mode",
  `Strict mode is best when cleaning up large scripts. All (CONT'D)'s will be checked (and removed in dual dialogue). 

  In non-strict mode, existing (CONT'D)'s are respected and simply formatted.

  To tidy up only a few lines, select the text in the editor.`,
  [
    "Strict (check all CONT'Ds)",
    "Non-strict (respect existing CONT'Ds)",
    "Remove all (CONT'D)'s",
  ],
);

if (promptResult) {
  const REMOVE_CONTDS = promptResult === "Remove all (CONT'D)'s";
  const STRICT_MODE = promptResult === "Strict (check all CONT'Ds)";

  const selectedRange = Beat.selectedRange();
  let lines = Beat.lines();

  // get selected lines
  if (selectedRange.length > 0) {
    const selectionStart = selectedRange.location;
    const selectionEnd = selectedRange.location + selectedRange.length;
    const selectedLines = [];
    let startLine;

    for (const line of lines) {
      if (startLine) {
        selectedLines.push(line);

        if (
          selectionEnd >= line.textRange.location &&
          selectionEnd <= line.textRange.location + line.textRange.length
        ) {
          break; // last selected line
        }
      } else if (
        selectionStart >= line.textRange.location &&
        selectionStart <= line.textRange.location + line.textRange.length
      ) {
        startLine = line;
        selectedLines.push(line);
      }
    }

    lines = selectedLines;
  }

  // every character/dual dialogue character line in the script
  const characterLines = [];

  // first pass
  let previousCharacter = null;

  for (const line of lines) {
    switch (line.type) {
      case Beat.type.character:
      case Beat.type.dualDialogueCharacter: {
        const trimmedString = line.string.trim();
        let changed = false;
        let newString;
        let inputHasContd;
        let character;

        if (line.type === Beat.type.character) {
          inputHasContd = trimmedString.toUpperCase().endsWith("(CONT'D)");
          character = trimmedString
            .slice(0, inputHasContd ? -8 : undefined)
            .trim();

          // respect existing CONT'Ds in nonstrict mode
          if (
            previousCharacter === character ||
            (!STRICT_MODE && inputHasContd)
          ) {
            newString = character + " (CONT'D)";
            changed = true;
          }

          // replace all invalid CONT'Ds in strict mode
          if (
            REMOVE_CONTDS ||
            (STRICT_MODE && inputHasContd && previousCharacter !== character)
          ) {
            newString = character;
            changed = true;
          }

          previousCharacter = character; // store for next line
        } else {
          // dual dialogue
          inputHasContd = trimmedString
            .toUpperCase()
            .slice(0, -1) // "^"
            .trim()
            .endsWith("(CONT'D)");

          character = trimmedString
            .slice(0, -1)
            .trim()
            .slice(0, inputHasContd ? -8 : undefined)
            .trim();

          if (inputHasContd) {
            if (STRICT_MODE || REMOVE_CONTDS) {
              // in strict mode, remove all CONT'Ds in dual dialogue
              newString = character + "^";
            } else {
              // in nonstrict mode, respect all CONT'Ds in dual dialogue
              newString = character + " (CONT'D)^";
            }
            changed = true;
          }

          previousCharacter = null; // reset for dual dialogue
        }

        characterLines.push({
          line,
          changed,
          newString,
          inputHasContd,
          character,
          isDualDialogue: line.type === Beat.type.dualDialogueCharacter,
        });

        break;
      }
      case Beat.type.heading: {
        previousCharacter = null;
      }
    }
  }

  // second pass: handle left-side dual dialogues
  for (const [i, characterLine] of characterLines.entries()) {
    const nextCharacterLine = characterLines[i + 1];

    if (
      characterLine.changed &&
      nextCharacterLine &&
      nextCharacterLine.isDualDialogue // left-side dual dialogue
    ) {
      // again, respect input CONT'Ds in nonstrict mode
      if (STRICT_MODE || !characterLine.inputHasContd) {
        characterLine.newString = characterLine.character;
      }
    }
  }

  for (const characterLine of characterLines) {
    if (characterLine.changed) {
      Beat.replaceRange(
        characterLine.line.position,
        characterLine.line.string.length,
        characterLine.newString,
      );
    }
  }
}
