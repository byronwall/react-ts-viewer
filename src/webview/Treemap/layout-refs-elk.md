# Layout References w/ ELK

Goals:

- Use ELK to layout the treemap
- The goal is to take a block of code and break it down to show external references
- For a given block of code, decompose into:
  - Every external reference - determine where it comes from: import, earlier code scope, etc.
  - Draw an edge from the source to the reference
- Use ELK to layout the code and the references
- Other code blocks should be rendered to the side with lower opacity
