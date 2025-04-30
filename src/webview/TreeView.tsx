import React from "react";
import { Node } from "reactflow"; // Assuming Node type is available

interface TreeViewProps {
  nodes: Node[];
  // Add edges or a processed tree structure if needed later
}

const TreeView: React.FC<TreeViewProps> = ({ nodes }) => {
  if (!nodes || nodes.length === 0) {
    return (
      <div className="tree-view-panel empty">
        No data to display in tree view.
      </div>
    );
  }

  // Simple list rendering for now
  // TODO: Implement hierarchical rendering if needed
  return (
    <div className="tree-view-panel">
      <h4>Node List</h4>
      <ul>
        {nodes.map((node) => (
          <li key={node.id}>
            {node.data.label || node.id} ({node.type || "default"})
            {/* Add more details or nested structure later */}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default TreeView;
