import React, { useState, useEffect, useCallback } from "react";
import ReactFlow, {
  Controls,
  Background,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  Node,
  Edge,
  Connection,
  EdgeChange,
  NodeChange,
  MiniMap,
} from "reactflow";

import "reactflow/dist/style.css";

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
    <div className="container">
      <div className="controls">
        <h4>Analysis Controls</h4>
        <div>
          <label htmlFor="filePathInput">Target File:</label>
          <input
            id="filePathInput"
            type="text"
            value={filePath}
            readOnly // Typically set by the command, not user input
            style={{ width: "90%" }}
          />
        </div>
        <div>
          <label htmlFor="maxDepthInput">Max Depth:</label>
          <input
            id="maxDepthInput"
            type="number"
            value={maxDepth}
            onChange={(e) => setMaxDepth(parseInt(e.target.value, 10) || 0)}
            min="1"
          />
        </div>
        <div>
          <label>
            <input
              type="checkbox"
              checked={showMiniMap}
              onChange={(e) => setShowMiniMap(e.target.checked)}
            />
            Show Minimap
          </label>
        </div>
        <button onClick={handleRunAnalysis}>Run Analysis</button>
      </div>
      <div className="results">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          fitView
          attributionPosition="top-right"
        >
          <Controls />
          {showMiniMap && <MiniMap nodeStrokeWidth={3} zoomable pannable />}
          <Background gap={12} size={1} />
        </ReactFlow>
      </div>
    </div>
  );
};

export default App;
