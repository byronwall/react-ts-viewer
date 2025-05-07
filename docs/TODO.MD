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
- Results are cleared when losing focus - or seem to be reloaded?

## Detailed react analysis

- Need to show the props coming into a comp
- Show the fields coming into a hook and compare against the deps array
- (End goal is to support quickly refactoring hooks into their own files)
- Ability to detect a `useContext` and show how the context is being used
- Same ability to detect a global state management library and show how it is being used (like zustand or react-query)
- Need to break down the calls inside a comp, before the return statement - want to see how complicated the chain of hooks is -- a good visuals would be blocks of color showing how calls are "stacked" to produce the comp - the goal of this structure is to make it easier to refactor long lines of code into dedicated hooks

## Structure view

- Clicking on a node in structure view should focus the graph on that node -- double clicking should navigate VS Code to the file (open the editor, ideally at the correct line)
- When a file only has a single export, collapse to a single line in the structure view (show both the file name and the export name)
- Show the originating file at the top of structure view (want to focus on the one that triggered the analysis)
- Revise structure view labels to show `H` or `C` for hooks and components and `F` for files -- do this in a way that is easily extendable to other types
- Need to style external deps different from internal deps
- Need to identify aliased deps as internal deps - almost there?
- Find all refs is often finding the props interface instead of the actual component export -- appears to be doing dumb string matching
- If we can programmatically trigger the find all refs, we could show the results in the tree view
- `Jump to file` needs to jump to where the comp is referenced (currently jumps to the start of file?)
- Double click for `jump to file` does not really work well - first click changes collapse state... add a button instead
- If the tree view is decent - embed it into the graph view as the contents - then use edges to show how that comp or file relates to other stuff

## Graph layout problems

- Need to consider dynamic height + width: <https://github.com/xyflow/xyflow/issues/991>
