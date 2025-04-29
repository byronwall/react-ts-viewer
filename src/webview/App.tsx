import React, { useState, useEffect, useCallback } from "react";
import ReactFlow, {
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  Node,
  Edge,
  Connection,
  EdgeChange,
  NodeChange,
  Background,
  BackgroundVariant,
} from "reactflow";
import { MiniMap } from "@reactflow/minimap";
import { Controls } from "@reactflow/controls";

import "reactflow/dist/style.css";
import "@reactflow/minimap/dist/style.css";
import "@reactflow/controls/dist/style.css";
import "./App.css";

// Acquire the VS Code API instance (only available in the webview context)
declare const vscode: {
  getState: () => any;
  setState: (state: any) => void;
  postMessage: (message: any) => void;
};

const App: React.FC = () => {
  // State for the graph
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);

  // State for the target file path
  const [filePath, setFilePath] = useState<string>("");

  // State for settings (example)
  const [showMiniMap, setShowMiniMap] = useState<boolean>(true);
  const [maxDepth, setMaxDepth] = useState<number>(5);

  // Load initial state from VS Code
  useEffect(() => {
    const state = vscode.getState();
    if (state?.filePath) {
      setFilePath(state.filePath);
    }
  }, []);

  // Handlers for react-flow changes
  const onNodesChange = useCallback(
    (changes: NodeChange[]) =>
      setNodes((nds) => applyNodeChanges(changes, nds)),
    [setNodes]
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) =>
      setEdges((eds) => applyEdgeChanges(changes, eds)),
    [setEdges]
  );
  const onConnect = useCallback(
    (connection: Connection) => setEdges((eds) => addEdge(connection, eds)),
    [setEdges]
  );

  // Handle messages from the extension
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data; // The message payload
      switch (message.command) {
        case "showResults":
          console.log("Webview received results:", message.data);
          setNodes(message.data.nodes || []);
          setEdges(message.data.edges || []);
          // Optionally update settings based on results if needed
          break;
        case "setFile": // Handle file change if panel is reused
          console.log("Webview received new file path:", message.filePath);
          setFilePath(message.filePath);
          setNodes([]); // Clear previous results
          setEdges([]);
          vscode.setState({ filePath: message.filePath }); // Update persisted state
          break;
      }
    };

    window.addEventListener("message", handleMessage);

    // Cleanup listener on component unmount
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, []);

  const handleRunAnalysis = () => {
    console.log("Sending runAnalysis command for:", filePath);
    vscode.postMessage({
      command: "runAnalysis",
      filePath: filePath,
      settings: {
        maxDepth: maxDepth,
        // Add other settings here
      },
    });
  };

  return (
    <div className="app-container">
      <div className="controls-panel">
        <h4>Analysis Controls</h4>
        <div className="control-item">
          <label htmlFor="filePathInput">Target File:</label>
          <input
            id="filePathInput"
            type="text"
            value={filePath}
            readOnly // Typically set by the command, not user input
            className="file-path-input"
          />
        </div>
        <div className="control-item">
          <label htmlFor="maxDepthInput">Max Depth:</label>
          <input
            id="maxDepthInput"
            type="number"
            value={maxDepth}
            onChange={(e) => setMaxDepth(parseInt(e.target.value, 10) || 0)}
            min="1"
            className="depth-input"
          />
        </div>
        <div className="control-item">
          <label>
            <input
              type="checkbox"
              checked={showMiniMap}
              onChange={(e) => setShowMiniMap(e.target.checked)}
            />
            Show Minimap
          </label>
        </div>
        <button onClick={handleRunAnalysis} className="run-button">
          Run Analysis
        </button>
      </div>
      <div className="reactflow-wrapper">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          fitView
          attributionPosition="top-right"
          className="react-flow"
        >
          <Controls />
          {showMiniMap && <MiniMap nodeStrokeWidth={3} zoomable pannable />}
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
        </ReactFlow>
      </div>
    </div>
  );
};

export default App;
