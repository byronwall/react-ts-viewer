import * as React from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { GraphNodeData } from "../buildDependencyGraph";

// Props for FileNode
interface FileNodeProps extends NodeProps {
  data: GraphNodeData & {
    label: string;
    isEntry?: boolean; // Check if it's the entry point
  };
}

const FileNodeDisplay: React.FC<FileNodeProps> = ({ data }) => {
  return (
    <div
      style={{
        background: data.isEntry ? "#0c3b5f" : "#1a3d5c", // Slightly different bg for entry
        color: "white",
        padding: "8px 12px",
        borderRadius: "3px",
        border: data.isEntry ? "1px solid #3c9af5" : "1px solid #2a5f8a",
        fontSize: "12px",
        minWidth: "120px",
        textAlign: "center",
      }}
    >
      {/* Only allow targets from Top for Files? Or also Left? */}
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: "#555" }}
      />
      {/* <Handle type="target" position={Position.Left} style={{ background: '#555' }} /> */}

      {data.label}

      {/* Files are sources for components/dependencies below them */}
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: "#555" }}
      />
      {/* <Handle type="source" position={Position.Right} style={{ background: '#555' }} /> */}
    </div>
  );
};

export default FileNodeDisplay;
