import * as React from "react";
import { useState, useEffect, useCallback } from "react";
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
  Controls,
  MiniMap,
  MarkerType,
} from "reactflow";

import "reactflow/dist/style.css";
import "@reactflow/minimap/dist/style.css";
import "@reactflow/controls/dist/style.css";
import "./App.css";
import TreeView from "./TreeView"; // Import the TreeView component

// Import custom node components
import ComponentNodeDisplay from "./ComponentNodeDisplay";
import FileNodeDisplay from "./FileNodeDisplay";
import DependencyNodeDisplay from "./DependencyNodeDisplay";

// Declare the global vscode object provided by the inline script in getWebviewContent.ts
declare const vscode: {
  getState: () => any;
  setState: (state: any) => void;
  postMessage: (message: any) => void;
};

// Interface for settings managed by the App
interface AnalysisSettings {
  maxDepth: number;
  showMinimap: boolean;
  showHooks: boolean;
  showFileDeps: boolean;
  showLibDeps: boolean;
}

// Initial default settings (moved before context creation)
const defaultSettings: AnalysisSettings = {
  maxDepth: 3,
  showMinimap: true,
  showHooks: true, // Default to showing
  showFileDeps: true, // Default to showing
  showLibDeps: true, // Default to showing
};

// --- Settings Context ---
// Export the context
export const SettingsContext =
  React.createContext<AnalysisSettings>(defaultSettings);
// --- End Settings Context ---

const App: React.FC = () => {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [targetFile, setTargetFile] = useState<string>("");
  const [settings, setSettings] = useState<AnalysisSettings>(defaultSettings);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Load initial state and settings from VS Code state API
  useEffect(() => {
    const state = vscode.getState();
    if (state?.filePath) {
      console.log("[Webview] Restoring state with file path:", state.filePath);
      setTargetFile(state.filePath);
      // Optionally restore previous settings if saved
      // if (state.settings) setSettings(state.settings);
    }
    // Trigger analysis automatically if a file path is present on load
    if (state?.filePath) {
      runAnalysis(state.filePath, settings);
    }
  }, []);

  // Update VS Code state when targetFile or settings change
  useEffect(() => {
    console.log("[Webview] Saving state:", { filePath: targetFile, settings });
    vscode.setState({ filePath: targetFile, settings });
  }, [targetFile, settings]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) =>
      setNodes((nds) => applyNodeChanges(changes, nds)),
    []
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) =>
      setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );

  // Function to send analysis request to extension
  const runAnalysis = useCallback(
    (filePath: string, currentSettings: AnalysisSettings) => {
      if (!filePath) {
        console.warn("[Webview] runAnalysis called with empty filePath");
        return;
      }
      console.log(
        `[Webview] Requesting analysis for: ${filePath} with settings:`,
        currentSettings
      );
      setIsLoading(true);
      vscode.postMessage({
        command: "runAnalysis",
        filePath: filePath,
        settings: currentSettings, // Send current settings
      });
    },
    [] // No dependencies needed as vscode is stable
  );

  // Handle messages from the extension
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data; // The json data that the extension sent
      console.log("[Webview] Received message:", message);
      switch (message.command) {
        case "setFile":
          console.log("[Webview] Setting file path:", message.filePath);
          setTargetFile(message.filePath);
          // Automatically run analysis when file is set from extension
          runAnalysis(message.filePath, settings);
          break;
        case "showResults":
          console.log("[Webview] Showing results:", message.data);
          setIsLoading(false);
          // TODO: Update node/edge visibility based on settings *before* setting state
          setNodes(message.data.nodes || []);
          setEdges(message.data.edges || []);
          break;
        // Add other message handlers if needed
      }
    };

    window.addEventListener("message", handleMessage);

    // Clean up the event listener when the component unmounts
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [runAnalysis, settings]); // Add settings dependency

  // Handle settings changes
  const handleSettingChange = (
    settingName: keyof AnalysisSettings,
    value: any
  ) => {
    setSettings((prev) => {
      const newSettings = { ...prev, [settingName]: value };
      // TODO: Update node/edge visibility based on the *new* settings
      // Maybe trigger a re-filter/update of hidden props here?
      return newSettings;
    });
  };

  // Update nodes/edges visibility based on settings
  useEffect(() => {
    console.log("[Webview] Updating nodes/edges visibility based on settings");
    let nodesChanged = false;
    const nextNodes = nodes.map((node) => {
      let newHidden = false;
      if (node.data?.type === "FileDep" && !settings.showFileDeps) {
        newHidden = true;
      }
      if (node.data?.type === "LibDep" && !settings.showLibDeps) {
        newHidden = true;
      }
      // We don't hide Component nodes based on hooks, hooks are shown *inside*
      if (node.hidden !== newHidden) {
        nodesChanged = true;
      }
      return { ...node, hidden: newHidden };
    });

    if (nodesChanged) {
      setNodes(nextNodes);
    }

    // Update edges based on the potentially updated nodes (nextNodes)
    let edgesChanged = false;
    const nextEdges = edges.map((edge) => {
      let newHidden = false;
      // Hide edges connected to hidden nodes (use nextNodes for calculation)
      const sourceNode = nextNodes.find((n) => n.id === edge.source);
      const targetNode = nextNodes.find((n) => n.id === edge.target);

      // Check if the source or target node *will be* hidden
      if (sourceNode?.hidden || targetNode?.hidden) {
        newHidden = true;
      } else {
        // Specifically hide dependency edges if their type is toggled off
        // Check based on source/target types and settings
        if (sourceNode?.data?.type === "Component") {
          if (targetNode?.data?.type === "FileDep" && !settings.showFileDeps) {
            newHidden = true;
          }
          if (targetNode?.data?.type === "LibDep" && !settings.showLibDeps) {
            newHidden = true;
          }
        }
        // Add other edge hiding logic if needed
      }

      if (edge.hidden !== newHidden) {
        edgesChanged = true;
      }
      return { ...edge, hidden: newHidden };
    });

    // Only update edges state if necessary
    if (edgesChanged) {
      setEdges(nextEdges);
    }
    // The dependency array still includes nodes because changes to the *base* nodes
    // (received from the extension) should trigger this visibility update.
    // The internal checks (nodesChanged, edgesChanged) prevent infinite loops
    // caused by the effect updating its own dependencies.
  }, [settings, nodes, edges]); // Also add edges to dependency array

  // Define nodeTypes mapping
  const nodeTypes = React.useMemo(
    () => ({
      ComponentNode: ComponentNodeDisplay,
      FileNode: FileNodeDisplay,
      DependencyNode: DependencyNodeDisplay,
    }),
    []
  );

  return (
    // Wrap the entire app in the SettingsContext Provider
    <SettingsContext.Provider value={settings}>
      <div style={{ height: "100vh", width: "100vw", display: "flex" }}>
        {/* Controls Panel */}
        <div
          style={{
            width: "250px",
            padding: "10px",
            borderRight: "1px solid #444",
            display: "flex",
            flexDirection: "column",
            backgroundColor: "#252526", // VS Code dark theme background
            color: "#ccc", // Light text color
          }}
        >
          <h3 style={{ marginTop: 0, marginBottom: "15px" }}>
            Analysis Controls
          </h3>

          {/* Target File Input */}
          <label htmlFor="targetFile" style={{ marginBottom: "5px" }}>
            Target File:
          </label>
          <input
            type="text"
            id="targetFile"
            value={targetFile}
            onChange={(e) => setTargetFile(e.target.value)}
            placeholder="/path/to/your/component.tsx"
            style={{
              marginBottom: "15px",
              width: "100%",
              padding: "5px",
              backgroundColor: "#3c3c3c",
              color: "#ccc",
              border: "1px solid #555",
            }}
          />

          {/* Max Depth Input */}
          <label htmlFor="maxDepth" style={{ marginBottom: "5px" }}>
            Max Depth:
          </label>
          <input
            type="number"
            id="maxDepth"
            value={settings.maxDepth}
            onChange={(e) =>
              handleSettingChange("maxDepth", parseInt(e.target.value, 10) || 1)
            }
            min="1"
            max="10" // Reasonable max
            style={{
              marginBottom: "15px",
              width: "60px", // Smaller width
              padding: "5px",
              backgroundColor: "#3c3c3c",
              color: "#ccc",
              border: "1px solid #555",
            }}
          />

          {/* Show Minimap Checkbox */}
          <div style={{ marginBottom: "10px" }}>
            <input
              type="checkbox"
              id="showMinimap"
              checked={settings.showMinimap}
              onChange={(e) =>
                handleSettingChange("showMinimap", e.target.checked)
              }
            />
            <label htmlFor="showMinimap" style={{ marginLeft: "5px" }}>
              Show Minimap
            </label>
          </div>

          {/* ---- Added Checkboxes ---- */}
          <div style={{ marginBottom: "10px" }}>
            <input
              type="checkbox"
              id="showHooks"
              checked={settings.showHooks}
              onChange={(e) =>
                handleSettingChange("showHooks", e.target.checked)
              }
            />
            <label htmlFor="showHooks" style={{ marginLeft: "5px" }}>
              Show Hooks
            </label>
          </div>

          <div style={{ marginBottom: "10px" }}>
            <input
              type="checkbox"
              id="showFileDeps"
              checked={settings.showFileDeps}
              onChange={(e) =>
                handleSettingChange("showFileDeps", e.target.checked)
              }
            />
            <label htmlFor="showFileDeps" style={{ marginLeft: "5px" }}>
              Show File Dependencies
            </label>
          </div>

          <div style={{ marginBottom: "10px" }}>
            <input
              type="checkbox"
              id="showLibDeps"
              checked={settings.showLibDeps}
              onChange={(e) =>
                handleSettingChange("showLibDeps", e.target.checked)
              }
            />
            <label htmlFor="showLibDeps" style={{ marginLeft: "5px" }}>
              Show Library Dependencies
            </label>
          </div>
          {/* ---- End Added Checkboxes ---- */}

          {/* Run Analysis Button */}
          <button
            onClick={() => runAnalysis(targetFile, settings)}
            disabled={isLoading || !targetFile}
            style={{
              marginTop: "auto", // Push to bottom
              padding: "8px 15px",
              cursor: "pointer",
              backgroundColor: isLoading ? "#555" : "#0e639c",
              color: "white",
              border: "none",
              borderRadius: "3px",
              opacity: !targetFile ? 0.6 : 1,
            }}
          >
            {isLoading ? "Analyzing..." : "Run Analysis"}
          </button>
        </div>

        {/* React Flow Canvas */}
        <div style={{ flexGrow: 1, height: "100%" }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            fitView
            nodeTypes={nodeTypes} // Pass the node types
            defaultEdgeOptions={{
              markerEnd: { type: MarkerType.ArrowClosed },
              style: { strokeWidth: 1.5 },
            }}
          >
            <Controls />
            {settings.showMinimap && (
              <MiniMap nodeStrokeWidth={3} zoomable pannable />
            )}
            <Background gap={12} size={1} />
          </ReactFlow>
        </div>
      </div>
    </SettingsContext.Provider>
  );
};

export default App;
