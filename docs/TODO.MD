# TODO

- Get things to run quickly on 1 file - OK
- Save the index results to disk
- Need to show the deps going into hooks and the variables being used
  - Need to get hooks to appear in single file view
- Show the props coming into a comp - trace those through the parents + tree
- Keep trucking on the plan - get Cursor to update the status and README with current functionality
- Publish to npm + VS Code Marketplace

Improve single file display:

- Group by file (do not show as a separate node)
- Still need to see external deps - show them as a box with each import listed?
- Show repeated hooks with a count instead of a list
- Allow a click to expand the node to show deps for a given hook

Biggest annoyances:

- Graph view is awful
- Need to show internal + external deps
  - External deps should be listed in the file box
  - Ensure that all internal comps in a file are shown in the list (not just exported ones that are used by others)
- Need to show the props coming into a comp
- Clicking on a node in structure view should focus the graph on that node -- double clicking should navigate VS Code to the file (open the editor, ideally at the correct line)
- When a file only have a single export, collapse to a single line in the structure view (show both the file name and the export name)
- Revise structure view labels to show `H` or `C` for hooks and components and `F` for files -- do this in a way that is easily extendable to other types
