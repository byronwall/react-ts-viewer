import * as React from "react";
import {
  useState,
  useEffect,
  useCallback,
  useLayoutEffect,
  useMemo,
} from "react";
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
  ReactFlowProvider,
  useReactFlow,
  Panel,
} from "reactflow";
import ELK from "elkjs/lib/elk.bundled.js";

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

// --- ELK Layout ---
const elk = new ELK();

// ELK layout options
// See https://www.eclipse.org/elk/reference/options.html
const elkOptions = {
  "elk.algorithm": "layered",
  "elk.layered.spacing.nodeNodeBetweenLayers": "100",
  "elk.spacing.nodeNode": "80",
  "elk.direction": "DOWN", // Default layout direction
};

// Hardcoded node dimensions for ELK layout
// TODO: Consider making these dynamic based on node type/content
const nodeWidth = 172;
const nodeHeight = 100; // Increased height estimate

// Explicitly type the return value
const getLayoutedElements = (
  nodes: Node[],
  edges: Edge[],
  options = {}
): Promise<{ nodes: Node[]; edges: Edge[] } | void> => {
  const layoutOptions = { ...elkOptions, ...options };
  const isHorizontal = layoutOptions["elk.direction"] === "RIGHT";
  const graph: any = {
    // Use any temporarily for the graph type to avoid deep ELK type issues
    id: "root",
    layoutOptions: layoutOptions,
    children: nodes.map((node) => ({
      ...node,
      targetPosition: isHorizontal ? "left" : "top",
      sourcePosition: isHorizontal ? "right" : "bottom",
      width: node.width ?? nodeWidth,
      height: node.height ?? nodeHeight,
    })),
    // Map React Flow edges to ELK edges format (sources/targets arrays)
    edges: edges.map((edge) => ({
      ...edge,
      sources: [edge.source],
      targets: [edge.target],
    })),
  };

  return elk
    .layout(graph)
    .then((layoutedGraph) => {
      // Check if layoutedGraph and children exist
      if (!layoutedGraph || !layoutedGraph.children) {
        console.error(
          "[Webview] ELK layout failed: No graph or children returned."
        );
        return; // Return void if layout failed
      }
      return {
        nodes: layoutedGraph.children.map((node: any) => ({
          // Use any for node type from ELK result
          ...node,
          position: { x: node.x, y: node.y },
        })),
        // Return the original edges, ELK doesn't modify edge structure in the return
        // unless specific options are used (like bendpoints)
        edges: edges,
      };
    })
    .catch((err) => {
      console.error("[Webview] ELK layout promise error:", err);
      // Return void in case of error
      return;
    });
};
// --- End ELK Layout ---

// Inner component to handle React Flow instance and layout
const FlowCanvas: React.FC<{
  initialNodes: Node[];
  initialEdges: Edge[];
  settings: AnalysisSettings;
}> = ({ initialNodes, initialEdges, settings }) => {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const { fitView } = useReactFlow(); // Hook for fitView

  // React Flow change handlers
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

  // Layout effect to run ELK when initial nodes/edges change
  useLayoutEffect(() => {
    if (initialNodes.length > 0) {
      console.log("[Webview] Running ELK layout...");
      getLayoutedElements(initialNodes, initialEdges)
        .then((layoutResult) => {
          // Check if the layout result is valid before destructuring
          if (layoutResult && layoutResult.nodes && layoutResult.edges) {
            const { nodes: layoutedNodes, edges: layoutedEdges } = layoutResult;
            setNodes(layoutedNodes);
            setEdges(layoutedEdges);
            // Use timeout to ensure layout is applied before fitting view
            window.requestAnimationFrame(() => {
              fitView({ duration: 300 }); // Smooth transition
            });
            console.log("[Webview] ELK layout applied.");
          } else {
            console.error("[Webview] ELK layout failed to return nodes/edges.");
          }
        })
        .catch((err) => console.error("[Webview] ELK layout error:", err));
    } else {
      // Clear nodes/edges if initial data is empty
      setNodes([]);
      setEdges([]);
    }
    // Depend on the raw initial data passed as props
  }, [initialNodes, initialEdges, fitView]);

  // Effect to update node/edge visibility based on settings
  // This runs *after* layouting and initial state setting
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
      if (node.hidden !== newHidden) {
        nodesChanged = true;
        return { ...node, hidden: newHidden };
      }
      return node; // Return same instance if no change
    });

    // Update edges based on the visibility of the potentially updated nodes
    let edgesChanged = false;
    const nextEdges = edges.map((edge) => {
      let newHidden = false;
      // Find nodes in the *current potentially updated* list (nextNodes)
      const sourceNode = nextNodes.find((n) => n.id === edge.source);
      const targetNode = nextNodes.find((n) => n.id === edge.target);

      // Check if the source or target node is now hidden
      if (sourceNode?.hidden || targetNode?.hidden) {
        newHidden = true;
      } else {
        // Specifically hide dependency edges if their type is toggled off
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
        return { ...edge, hidden: newHidden };
      }
      return edge; // Return same instance if no change
    });

    // Only update state if necessary to prevent loops
    if (nodesChanged) {
      setNodes(nextNodes);
    }
    if (edgesChanged) {
      setEdges(nextEdges);
    }
  }, [settings, nodes, edges]); // Re-run when settings or the base nodes/edges change

  // Define nodeTypes mapping
  const nodeTypes = useMemo(
    () => ({
      ComponentNode: ComponentNodeDisplay,
      FileNode: FileNodeDisplay,
      DependencyNode: DependencyNodeDisplay,
    }),
    []
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      fitView // fitView is now called manually after layout
      nodeTypes={nodeTypes}
      defaultEdgeOptions={{
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { strokeWidth: 1.5 },
      }}
      // Add explicit background color for contrast if needed
      // style={{ backgroundColor: '#1e1e1e' }}
    >
      <Controls />
      {settings.showMinimap && (
        <MiniMap nodeStrokeWidth={3} zoomable pannable />
      )}
      <Background gap={12} size={1} />
      {/* Panel for layout buttons could be added here later */}
      {/* <Panel position="top-right"> ... </Panel> */}
    </ReactFlow>
  );
};
// --- End FlowCanvas ---

const App: React.FC = () => {
  // State moved: nodes, edges, onNodesChange, onEdgesChange are now in FlowCanvas
  const [targetFile, setTargetFile] = useState<string>("");
  const [settings, setSettings] = useState<AnalysisSettings>(defaultSettings);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  // State to hold raw results from extension before layouting
  const [rawAnalysisData, setRawAnalysisData] = useState<{
    nodes: Node[];
    edges: Edge[];
  }>({ nodes: [], edges: [] });

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
          // Ensure we use the *current* settings state
          setSettings((currentSettings) => {
            runAnalysis(message.filePath, currentSettings);
            return currentSettings; // No change to settings needed here
          });
          break;
        case "showResults":
          console.log(
            "[Webview] Storing raw results for layout:",
            message.data
          );
          setIsLoading(false);
          // Store raw data; layout happens in FlowCanvas's effect
          setRawAnalysisData({
            nodes: message.data.nodes || [],
            edges: message.data.edges || [],
          });
          break;
        // Add other message handlers if needed
      }
    };

    window.addEventListener("message", handleMessage);

    // Clean up the event listener when the component unmounts
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [runAnalysis]); // Removed settings dependency, handled within setFile logic

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

  // Visibility update useEffect is now inside FlowCanvas

  // nodeTypes is now inside FlowCanvas

  return (
    // Wrap the entire app in the SettingsContext Provider
    <SettingsContext.Provider value={settings}>
      {/* Wrap the layout part in ReactFlowProvider */}
      <ReactFlowProvider>
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
                handleSettingChange(
                  "maxDepth",
                  parseInt(e.target.value, 10) || 1
                )
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

          {/* Tree View Panel */}
          <div
            style={{
              width: "300px", // Adjust width as needed
              padding: "10px",
              borderRight: "1px solid #444",
              backgroundColor: "#252526",
              color: "#ccc",
              overflowY: "auto", // Make it scrollable if content overflows
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: "15px" }}>
              Structure View
            </h3>
            {/* Render the TreeView component */}
            <TreeView
              nodes={rawAnalysisData.nodes}
              edges={rawAnalysisData.edges}
            />
          </div>

          {/* React Flow Canvas Area */}
          <div style={{ flexGrow: 1, height: "100%" }}>
            {/* Pass raw data and settings to the inner component */}
            <FlowCanvas
              initialNodes={rawAnalysisData.nodes}
              initialEdges={rawAnalysisData.edges}
              settings={settings}
            />
          </div>
        </div>
      </ReactFlowProvider>
    </SettingsContext.Provider>
  );
};

export default App;
