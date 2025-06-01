# Treemap layout 2

## Goals

- Treat the treemap like a giant bin packing problem
- Nodes are split into two types:
  - Containers: These are nodes that have children
  - Leafs: These are nodes that have no children
- Containers have a header and are filled with other nodes
- Leafs represent final pieces of code with no children - they render as a rect with text
- Node render is controlled by several settings:
  - We want a node to render as 80x wide by 40px high as a minimum. If the text is shorter than that, it can be less, but aim for that size.
  - If a node cannot be rendered at that size, then it should render as a small 20px by 20px colored box without text.
- The goal is to render each layer of tree, so breadth-first
  - Use the leaf + container sizes to determine if all nodes can be rendered at least with the minimum size.
  - If not, see if they cna all be rendered as small boxes. If possible, then we know that a mixture of big + small is possible.
  - If possible, then layout the depth, for any containers, we want to render them proportional to their value and then attempt to fill in children
- Containers do not need to render as a single bounding rectangle. Allow them to take on L shapes so they they can fit around existing nodes.
- Layout nodes by source order and bin pack to fit things in.
