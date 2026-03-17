Review Manager

Organize your reviews with tags.
Ver 0.91 / © Jürgen Heimüller 2026

Created with the help of DeepSeek.

----------------------------------------------------------------------------

- Changes in V0.91
  Implemented progess bar on batch operations
  Rearranged layout for better overview for small window-sizes
  Lots of small optimizations  
- Changes in V0.90
  Implemented edit-mode: click on the edit-icon to edit the review
  Copy Review: click on the copy-icon (or press [Cmd-C] to copy the entire review (incl. tags)
  Streamlined scroll- and highlight-behaviour when changing filter conditions

----------------------------------------------------------------------------
Description

The Review Manager is a plugin for the Beat screenwriting software that helps you manage and organize reviews using hashtag-based tagging system.

Quick Start Guide


Right Side (Review List)
- Triangle button (top right): Click to expand all reviews (if they are longer than 3 lines) or collapse them (yellow = expanded / grey = collapsed)
- Link button: When activated, the plugin will follow the cursor in the main Beat window and scroll automatically.
- Add tags: Click the "+" below a review to add a new tag. You can add as many tags to a review as you like.
- Remove tags: Click the small "✕" on a tag to remove it.
- Filter by tag: Click on any tag to instantly filter the list by that tag.
- Select reviews: Click the checkbox next to a review to select it. 
  You can also select text in the main Beat window – all reviews within that selection will be automatically selected in the plugin.
- Delete a review: Click the trash icon to delete a single review.

Left Side (Controls)
- Filter by tag: Click the filter field to choose a tag, or select "– no tag –" to show untagged reviews.
- Use the Invert checkbox to show all reviews that do not have the selected tag.
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