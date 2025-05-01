import * as React from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { GraphNodeData } from "../buildDependencyGraph";

// Props for DependencyNode
interface DependencyNodeProps extends NodeProps {
  data: GraphNodeData & {
    label: string; // Module specifier
    isExternal?: boolean; // Is it a library dep?
  };
}

const DependencyNodeDisplay: React.FC<DependencyNodeProps> = ({ data }) => {
  return (
    <div
      style={{
        background: data.isExternal ? "#5a3d1a" : "#4f5861", // Orange-ish for libs, gray for files
        color: "white",
        padding: "6px 10px",
        borderRadius: "2px",
        border: data.isExternal ? "1px solid #a87a3f" : "1px solid #728090",
        fontSize: "11px",
        minWidth: "100px",
        textAlign: "center",
      }}
    >
      {/* Dependencies are only targets */}
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: "#555" }}
      />
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: "#555" }}
      />

      {data.label}

      {/* No source handles for dependency nodes */}
    </div>
  );
};

export default DependencyNodeDisplay;
