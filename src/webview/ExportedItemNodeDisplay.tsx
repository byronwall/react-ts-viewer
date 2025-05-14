import * as React from "react";
import { CustomNodeProps, nodeWidth, nodeHeight } from "./App";

export const ExportedItemNodeDisplay: React.FC<CustomNodeProps> = (props) => {
  return (
    <div
      style={{
        padding: 10,
        border: "1px solid purple",
        background: "#f3e7f3",
        borderRadius: "5px",
        width: props.width || nodeWidth,
        height: props.height || nodeHeight,
      }}
    >
      <strong>Exported Item</strong> ({props.data?.actualType || "Unknown Type"}
      )<br />
      ID: {props.id}
      <br />
      Label: {props.data?.label || "N/A"}
    </div>
  );
};
