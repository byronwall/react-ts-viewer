# TODO

## Overall extension

- Save the index results to disk
- Publish to npm + VS Code Marketplace
- Create a README with features and other details

## Biggest annoyances

- Graph view is awful

## Main web view

- Allow user to select a new file with a fuzzy picker dialog (like how move file works)
- Allow the side pane to be resized
- Show the relative file path in the input box
- Results are cleared when losing focus

## Detailed react analysis

- Need to show the props coming into a comp
- Show the fields coming into a hook and compare against the deps array
- (End goal is to support quickly refactoring hooks into their own files)
- Ability to detect a `useContext` and show how the context is being used
- Same ability to detect a global state management library and show how it is being used (like zustand or react-query)

## Structure view

- Reduce the indent + padding on the left side of the tree view
- Clicking on a node in structure view should focus the graph on that node -- double clicking should navigate VS Code to the file (open the editor, ideally at the correct line)
- When a file only has a single export, collapse to a single line in the structure view (show both the file name and the export name)
- Want to see the source next to the comp or hook name - so `useState @ react`
- Show the originating file at the top of structure view (want to focus on the one that triggered the analysis)
- Revise structure view labels to show `H` or `C` for hooks and components and `F` for files -- do this in a way that is easily extendable to other types
- Add a button to collapse all nodes - and another to expand all nodes
- Allow the tree view to trigger `find all references` from VS Code
- Need to style external deps different from internal deps
- Need to identify aliased deps as internal deps

## Graph layout problems

- Need to consider dynamic height + width: <https://github.com/xyflow/xyflow/issues/991>
