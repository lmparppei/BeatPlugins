/*

Plugin name: Clean (CONT'D)'s
Description: Tidies up all (CONT'D)'s in a screenplay
Image: Clean (CONT'D)'s.png

Version: 1.0
Copyright: 2025 gfrancine

*/

const promptResult = Beat.dropdownPrompt(
  "Clean (CONT'D)'s: Select mode",
  `Strict mode is best when cleaning up large scripts. (CONT'D)'s are only added on successive dialogue lines (uninterrupted by scene headings) and removed in all dual dialogue lines. 
  
  In non-strict mode, existing (CONT'D)'s are respected and simply formatted.`,
  ["Strict (format all CONT'Ds)", "Non-strict (respect existing CONT'Ds)"],
);

if (promptResult) {
  const STRICT_MODE = promptResult === "Strict (format all CONT'Ds)";
  const characterLines = [];

  // first pass
  let previousCharacter = null;

  for (const line of Beat.lines()) {
    switch (line.type) {
      case Beat.type.character:
      case Beat.type.dualDialogueCharacter: {
        const trimmedString = line.string.trim();
        let changed = false;
        let newString;
        let hasContd;
        let character;

        if (line.type === Beat.type.character) {
          hasContd = trimmedString.toUpperCase().endsWith("(CONT'D)");
          character = trimmedString.slice(0, hasContd ? -8 : undefined).trim();

          // respect existing CONT'Ds in nonstrict mode
          if (previousCharacter === character || !STRICT_MODE && hasContd) {
            newString = character + " (CONT'D)";
            changed = true;
          }

          // replace all invalid CONT'Ds in strict mode
          if (STRICT_MODE && hasContd && previousCharacter !== character) {
            newString = character;
            changed = true;
          }

          previousCharacter = character; // store for next line
        } else { // dual dialogue
          hasContd = trimmedString
            .toUpperCase()
            .slice(0, -1) // "^"
            .trim()
            .endsWith("(CONT'D)");

          character = trimmedString
            .slice(0, -1)
            .trim()
            .slice(0, hasContd ? -8 : undefined)
            .trim();

          if (hasContd) {
            if (STRICT_MODE) {
              // in strict mode, remove all CONT'Ds in dual dialogue
              newString = character + "^";
            } else {
              // in nonstrict mode, remove all CONT'Ds in dual dialogue
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
          hasContd,
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
      nextCharacterLine && nextCharacterLine.isDualDialogue && // left-side dual dialogue
      characterLine.changed
    ) {
      if (STRICT_MODE || !characterLine.hasContd) {
        characterLine.newString = characterLine.character;
      } else {
        characterLine.newString = characterLine.character + " (CONT'D)";
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
