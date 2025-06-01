# Improvements to the treemap layout system

Goals:

- Nodes split into containers and leafs
- Containers have a header and are filled with other nodes
- Leafs represent final pieces of code with no children - they render as a rect with text
- Node render is controlled by several settings:
  - Minimum size for a node to be shown with text - if node is smaller than this, it will not attempt to render text - call it `minSizeForText`
  - Minimuze size where a node renders without text (just a box with maybe color)
  - Containers will render a header and some representation of the children (either text nodes or a box with color)
- Following are at odds:
  - Trees are deep and we want to show everything
  - We need to be able to read the text if we render it
- To meet those needs
  - We will attempt to render all nodes at a given depth
  - We should not start rendering nodes at a greater depth until we have finished the current level across all nodes - call this `strictDepthConstraint`
  - We should give preference to rendering containers with headers over leafs - the most important text comes from group labels
  - We should give a nice balance to the layout and make the best use of space
- Layout algorithm:
  - We will start by rendering all nodes at depth 0
  - Specifically, we will pick the biggest child node and give it an area that is proportional to its value
  - When choosing where to place the node, try to place it in source code order - so if the node is at the end of the list, place it near the bottom or right side of the container - if the node is in the middle, try to place it in the middle of the container (if possible), if it's the first node, then just pick a side and place it there.
  - After placing that node, we will subdivide the remaining space for the next largest node. That process repeats until all nodes are placed for the current depth
  - We should attempt to render common proportions in pleasing ways - build some sort of lookup system for 2, 3, and 4 child nodes with common proportions
  - We should attempt to render as many nodes with text as possible - a layout that splits up the space is much better, we should aim to "barely" fit nodes if we know we will run out of space
    - ADD LOGIC TO DETERMINE IF WE CAN FIT ALL NODES WITH TEXT - if we can, just do it
    - If not, then we need to make nodes as small as possible, knowing that we will switch to "box only" rendering at a certain depth and no rendering below that depth.
