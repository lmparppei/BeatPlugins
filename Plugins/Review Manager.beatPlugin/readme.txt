Review Manager

Organize your reviews with tags.
Ver 0.93 / © Jürgen Heimüller 2026

Created with the help of DeepSeek.

----------------------------------------------------------------------------


- Changes in V0.93
  Rearranged interface
  Plugin now suppresses review display in the main document and instead briefly flashes the reference text.
  Keyboard support: press [Arrow-up][Arrow-down] to navigate through reviews, [Enter] to expand/collapse, [Space] to select, see tooltips for more key commands
  New „move“ function: select text in the document and click on the (yellow) move-icon to move review position
  New icons for copy and edit
  Optimized scrolling behaviour.
- Changes in V0.91
  New progress bar on batch operations
  Lots of small optimizations    
- Changes in V0.90
  New edit-mode: click on the edit-icon to edit the review
  Copy Review: click on the copy-icon (or press [Cmd-C] to copy the entire review (incl. tags)
  Streamlined scroll- and highlight-behaviour when changing filter conditions

----------------------------------------------------------------------------
Description

The Review Manager is a plugin for the Beat screenwriting software that helps you manage and organize reviews using hashtag-based tagging system.

Quick Start Guide


Right Side (Review List)
- Resize window icons (narrow and wide)
- Tag-Filter: Click the filter field to choose a tag, or select "– no tag –" to show untagged reviews. Use the Invert icon to invert filter.
- Link button: When activated, the plugin will follow the cursor in the main Beat window and scroll automatically.
- Triangle button (top right): Click to expand all reviews (if they are longer than 3 lines) permanently or collapse them and expand manually (Enter).
- Add tags: Click the "+" below a review to add a new tag. You can add as many tags to a review as you like.
- Move: select text in the document and click on the (yellow) move-icon to move review position
- Edit: Click on the edit-icon to edit the review, click the undo icon (or press [Esc] to revert to the saved version
- Copy: Click on the copy-icon (or press [Cmd-C] to copy the entire review (incl. tags)
- Remove tags: Click the small "✕" on a tag to remove it.
- Filter by tag: Click on any tag to instantly filter the list by that tag.
- Select reviews: Click the checkbox next to a review to select it. 
  You can also select text in the main Beat window – all reviews within that selection will be automatically selected in the plugin.
- Delete a review: Click the trash icon to delete a single review.

Left Side (Controls)
- Selection tools:
  All: Select all visible reviews
  Reverse: Invert the current selection
  Intersect: Keep only visible reviews in the selection (for AND-operations)
  Clear: Deselect all reviews
  (Note: "All", "Reverse", and "Intersect" only apply to the currently filtered reviews.)
- Batch operations:
  Once reviews are selected, you can:
  Add a tag to all selected reviews
  Remove a tag from all selected reviews
  Delete all selected reviews at once
- Export to CSV:
  Click "Export to Clipboard" to copy all filtered reviews to the clipboard in CSV format.
  You can then paste them directly into a word processor or spreadsheet application.