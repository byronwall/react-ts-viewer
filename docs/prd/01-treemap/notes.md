# Treemap notes

## Initial pass

First version generates tree maps with several options

![alt text](image.png)

### Improvements from here

Todo:

- Node sizes are not well determined - figure out how to keep things more consistent
- Tree map should probably render on the side of code - open existing editor when clicking.

Design:

- Set a min size to prevent things from getting too small - really need a min height - some examples have whitespace and small nodes
- Reduce border weight & recursion outline
  - 2 px borders for every level generate moiré patterns; switch to 1 px for children and 0 px for leaves, or draw only the hovered branch.
- Make the file path scannable
  - Break long paths into breadcrumbs and ellipsize middle segments; current string overflows on smaller widths.
- Introduce scale-aware typography
  - Auto-hide or truncate labels below a minimum pixel area; reveal full label on hover/focus.
  - Use a semi-transparent label background so text remains legible over coloured fills.
- Put a min height on elements so that text is visible if there's space somewhere
- App sidebar needs to collapse

UX:

- Expose quick search / filter
  - Let me type “useState” and instantly highlight every hook invocation node.
  - Show a list of variable names and hover to show where they are used
- Change import label to show full name of external import (just use the file part for internal and aliased imports)
- Improve display [val, setVal] and other destructuring assignments - current show as `VariableDeclaration`
- Consider some sort of max height to prevent large islands of nothing when graph is small -- or change the layout to prevent a simple code like view with bars on top of each other (like `slice`)
- Export JSON should focus only on the rendered tree, not the entire code
- Tooltip position is awful when tall, getting clipped by edges - likely need to implement a custom tooltip component based on mouse events
- Ideally allow interaction with the tooltip - do not move with the mouse, but stay in the same position

Tree creation

- Add a symbol or marker to indicate if something is exported
- Give some ability to track props and other "incoming" edges
- Switch statements need some love in the parsing, see `Other:` in places
- Variable settings/assignment need nodes - currently not showing up
