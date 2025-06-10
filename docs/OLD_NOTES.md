# OLD_NOTES.md

This document contains detailed technical notes and specifications that were previously in the README.md but were moved here to keep the main README focused on the three main phases: Code Processing, Tree Building, and Tree Rendering.

## Layout Algorithm Details

### 2D Bin Packing Layout

Advanced Guillotine-based bin packing algorithm that maximizes space utilization:

- **True 2D Packing**: Places nodes in any available 2D space rather than limiting to rows/shelves like traditional algorithms
- **Guillotine Rectangle Splitting**: Splits remaining space into optimal rectangular regions after each placement for maximum efficiency
- **Multiple Fit Heuristics**: Supports BestAreaFit, BestShortSideFit, and BestLongSideFit strategies for different packing scenarios
- **Overlap Prevention**: Maintains precise tracking of free rectangles to prevent any node overlaps or space conflicts
- **Optimal Item Sorting**: Pre-sorts items by area, width, height, or perimeter for improved packing density
- **Visual Space Debugging**: Includes comprehensive console visualization showing packed items and remaining free rectangles
- **Minimal White Space**: Eliminates the large gaps common in shelf-based layouts by utilizing irregular spaces left by different-sized nodes
- **Space-Efficient**: Significantly reduces wasted space compared to row-based packing approaches

### Binary Layout Algorithm

New bin-packing layout algorithm following the layout2.md specification:

- **Breadth-First Rendering**: Analyzes each tree level to determine optimal rendering strategy before layout decisions
- **Bin Packing Approach**: Treats layout as a bin packing problem, placing nodes in source order while optimizing space utilization
- **L-Shaped Container Support**: Containers can take on non-rectangular shapes to better fit around existing nodes
- **Text vs Box Mode Logic**: Smart decision-making between text rendering (80x40px minimum) and box rendering (20x20px minimum)
- **Level-Based Strategy**: Each depth level is analyzed to determine if all children can fit with text, or if some need box mode
- **Source Order Preservation**: Maintains original code order while optimizing for space efficiency
- **Proportional Value-Based Sizing**: Node sizes reflect their actual complexity while meeting minimum readability requirements
- **Value-Aware Layout Selection**: Hybrid approach that always prioritizes good aspect ratios by using grid layouts when horizontal layouts would be too tall, but applies proportional sizing within grid rows when nodes have significant value differences (3x+ ratio)
- **Space Splitting**: Available spaces are dynamically split after each node placement to create new packing opportunities

### Improved Layout Algorithm

New intelligent layout system that implements depth-first rendering with strict constraints:

- **Source Code Order Preservation**: All nodes are rendered in their original source code order, maintaining logical flow and making it easier to understand code structure
- **Text-First Design**: Layout decisions prioritize displaying readable text labels, with minimum character width requirements to ensure code readability
- **Depth-Constrained Rendering**: Implements strict depth constraints where nodes at deeper levels switch to simplified "box mode" rendering when text would be too small to read
- **Common Proportion Templates**: Pre-defined optimal layouts for 2, 3, and 4-child arrangements (horizontal, vertical, grid patterns) that create visually pleasing and space-efficient displays
- **Intelligent Text Fitting**: Algorithm determines if all nodes can fit with readable text at each depth level, switching to box mode when necessary to prevent illegible text
- **Smart Header Priority**: Container headers always get adequate space for readable labels, as group names are more important than individual element details
- **Proportional Value-Based Sizing**: Node dimensions reflect their actual complexity/value while maintaining readability constraints
- **Render Mode Management**: Three distinct rendering modes (text, box, none) based on available space and depth constraints

### Proportional Bin Packing Layout

Advanced layout system that sizes nodes proportionally to their actual values rather than splitting space equally among siblings:

- **Value-Based Sizing**: Node dimensions directly reflect their relative importance based on complexity/size metrics
- **Bin Packing Algorithm**: Intelligently packs nodes to minimize wasted space while respecting proportional constraints
- **Flexible Grid Layouts**: Grid columns have variable widths based on the total value of nodes in each column
- **Proportional Horizontal Layouts**: Horizontal arrangements allocate width proportionally to each child's value
- **Multi-Layout Scoring**: Evaluates multiple layout approaches and selects the optimal one based on space utilization and visual quality

### Grid-Based Layout Algorithm

Advanced layout system that intelligently subdivides space to create optimal rectangle sizes for text display:

- **Text-First Approach**: Layout decisions prioritize displaying 10-15 characters per node for optimal readability
- **Smart Grid Generation**: Automatically calculates optimal column counts based on available space and content
- **Multi-Layout Comparison**: Evaluates vertical stacks, horizontal layouts, and grid arrangements to find the best fit
- **Width Constraints**: Prevents overly wide rectangles by breaking them into columns when beneficial
- **Header Priority**: Ensures headers always get adequate space for readable text labels
- **Improved Multi-Column Layouts**: Enhanced layout algorithm that aggressively prevents overly wide nodes by:
  - **Reduced Optimal Width**: Uses more conservative character width calculations (8 chars optimal vs previous 12)
  - **Extended Column Range**: Tests up to 6 columns for layouts with many child nodes
  - **Width Penalties**: Heavily penalizes nodes that exceed 60% of available width
  - **Multi-Item Preference**: Provides scoring bonuses for layouts that split content into multiple items
  - **Constrained Node Widths**: Limits individual node widths to prevent single nodes from spanning entire page width

## Visual Rendering Details

### Container Padding System

Intelligent padding system that ensures child nodes are rendered properly inside their parent containers:

- **Layout-Integrated Padding**: Padding is calculated during the layout phase, not just for visual rendering
- **Hierarchical Spacing**: Parent nodes automatically reserve space for padding, positioning children inside the padded area
- **Depth-Aware Padding**: Padding is only applied to non-root nodes to avoid wasting space at the top level
- **Visual Container Boundaries**: Parent containers render with subtle borders to clearly delineate hierarchical structure

### Visual Hierarchy Features

- **Infinite Depth Rendering**: Supports rendering nested code structures to unlimited depth with intelligent visual scaling
- **Dynamic Visual Hierarchy**: Header and body sections automatically adjust size, opacity, and stroke width based on nesting depth
- **Header and Body Rendering**: Each node has a customizable header (dynamic height) and body section, allowing for rich visual representation
- **Improved Group Placement**: Fixed rendering issues where child nodes were appearing faint or misplaced within parent groups
- **Enhanced Visibility**: Optimized opacity calculations to ensure nodes remain visible at deeper nesting levels (minimum 60% opacity for leaf nodes, 80% for headers)
- **Robust Coordinate System**: Improved coordinate calculations and bounds checking to prevent rendering artifacts and ensure proper node positioning

### Group Border Management

Enhanced border rendering system that properly handles group selection and highlighting:

- **Group-Level Selection**: When parent nodes are selected, borders are drawn around the entire group container, not just the header
- **Hierarchical Border Logic**: Group containers get prominent selection borders (red for selected, gold for search matches) while child elements use subdued borders to avoid visual conflicts
- **Smart Border Inheritance**: Headers and leaf nodes within selected groups use darker, thinner borders that complement the main group border
- **Consistent Visual Hierarchy**: All parent nodes with children get container borders for clear visual grouping, regardless of depth

### Hidden Children Indicators

Visual indicators show when layout constraints have forced some child nodes to be hidden:

- **Orange Circle Indicators**: Small orange circles with three dots (⋯) appear on nodes that have hidden children
- **Hidden Count Display**: Shows the number of hidden children when space permits
- **Enhanced Tooltips**: Hover tooltips display detailed information about hidden children including count and reason
- **Root Level Protection**: The root node is guaranteed to show all its direct children; the layout will compress larger children to make room rather than hide any root-level nodes
- **Layout Constraint Tracking**: Different reasons for hiding are tracked (size constraints vs. layout constraints) and displayed in tooltips

## Grid Mode Features

### Multi-File Treemaps

Display multiple files from the same folder in a progressive grid layout:

- **Progressive Loading**: Primary file loads immediately, then up to 5 additional files from the same folder load progressively with smooth animations
- **Grid Layout**: Files are arranged in an intelligent grid (1x1, 2x2, 3x2, or 3x3) based on the number of files
- **Animated Entry**: New treemaps "fly" onto the screen with smooth scale and opacity transitions
- **Individual Interaction**: Each treemap in the grid supports full interaction (click, drill-down, tooltips)
- **Unified Controls**: Single settings panel controls all treemaps in the grid
- **Isolation Mode**: Alt+click any node to isolate and zoom into a single file's treemap
- **Cross-File Navigation**: Jump between files seamlessly while maintaining treemap context
- **Automatic File Discovery**: Automatically finds and loads TypeScript, JavaScript, CSS, SCSS, and Markdown files from the current folder
- **Toggle Option**: Easy toggle between single-file and grid mode in the settings panel

## Interactive Features Detail

### Viewport Controls

Advanced zoom and pan functionality for detailed exploration:

- **Mouse Wheel Zoom**: Zoom in and out using the mouse wheel (supports trackpad gestures on Mac)
- **Cursor-Focused Zoom**: Zoom operations center on the cursor position for intuitive navigation
- **Click and Drag Panning**: Click and drag to move the viewport around when zoomed in
- **Reset View Button**: Convenient reset button to return to the default view that fits the entire treemap
- **Performance Optimized**: Viewport transforms are applied at the rendering layer without triggering treemap re-calculations
- **Smooth Interactions**: Uses hardware-accelerated CSS transforms for smooth zoom and pan operations
- **Visual Feedback**: Cursor changes to indicate interaction modes (grab/grabbing during panning)
- **Debug Information**: When debug mode is enabled, shows current scale and pan coordinates

## Experimental Features

### Experimental Treemap Layout

Introduced an alternative treemap layout algorithm (`geminiLayout`) based on bin packing and breadth-first rendering. This is currently an experimental feature and can be enabled by modifying the `selectedLayout` setting (defaults to the original `binaryLayout`). The new layout aims to fulfill specifications outlined in `src/webview/Treemap/layout2.md`.

## Technical Implementation Notes

### Custom Implementation

Uses a hand-rolled treemap implementation with binary layout algorithm for optimal performance and customization.

### Hierarchical Value Calculation

Each leaf node (child without children) has a value of 1, and parent nodes recursively sum their children's values. This provides meaningful size representation where larger containers automatically reflect their complexity through the sum of their components.

### Smart Layout Algorithm

Enhanced binary layout with aspect ratio optimization and minimum size constraints for deeply nested nodes.

### Responsive Design

Automatically adjusts to container size changes and window resizing.
