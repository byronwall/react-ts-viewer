import * as React from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { SettingsContext } from "./App"; // Import the context
import { GraphNodeData } from "../buildDependencyGraph"; // Assuming type is exported

// Define the props specific to this custom node, extending NodeProps
interface ComponentNodeProps extends NodeProps {
  data: GraphNodeData & {
    // Ensure data conforms to GraphNodeData
    label: string;
    hooksUsed?: { hookName: string; location: any }[]; // Make specific
  };
}

const ComponentNodeDisplay: React.FC<ComponentNodeProps> = ({ data }) => {
  const settings = React.useContext(SettingsContext); // Consume the settings context

  return (
    <div
      style={{
        background: "#004d40", // Dark teal background
        color: "white",
        padding: "10px 15px",
        borderRadius: "5px",
        border: "1px solid #1a7f72",
        fontSize: "12px",
        minWidth: "150px",
        textAlign: "center",
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: "#555" }}
      />

      <strong>{data.label}</strong>

      {/* Conditionally render hooks */}
      {settings.showHooks && data.hooksUsed && data.hooksUsed.length > 0 && (
        <div
          style={{
            marginTop: "8px",
            paddingTop: "5px",
            borderTop: "1px dashed #aaa",
            textAlign: "left",
            fontSize: "10px",
          }}
        >
          <strong>Hooks:</strong>
          <ul style={{ margin: "0", paddingLeft: "15px" }}>
            {data.hooksUsed.map((hook, index) => (
              <li key={index}>{hook.hookName}</li>
            ))}
          </ul>
        </div>
      )}

      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: "#555" }}
      />
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: "#555" }}
      />
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: "#555" }}
      />
    </div>
  );
};

export default ComponentNodeDisplay;
