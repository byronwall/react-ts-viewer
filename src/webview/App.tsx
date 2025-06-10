import * as React from "react";
import { useCallback, useEffect, useState } from "react";

import "@reactflow/controls/dist/style.css";
import "@reactflow/minimap/dist/style.css";
import "reactflow/dist/style.css";
import "./App.css";
import { TreemapDisplay } from "./Treemap/TreemapDisplay";
import { vscodeApi } from "./vscodeApi";

import {
  defaultTreemapSettings as newDefaultTreemapSettings,
  TreemapSettings,
} from "./settingsConfig";

// Import custom node components
import { ScopeNode } from "../types";

// Global declarations specific to App.tsx initialization
declare global {
  interface Window {
    initialData?: { filePath?: string };
    initialWorkspaceRoot?: string;
  }
}

// Interface for settings managed by the App
interface AnalysisSettings {
  maxDepth: number;
  showMinimap: boolean;
  showHooks: boolean;
  showLibDeps: boolean;
}

const defaultSettings: AnalysisSettings = {
  maxDepth: 3,
  showMinimap: false,
  showHooks: true,
  showLibDeps: true,
};

// Use the imported defaultTreemapSettings
// const defaultTreemapSettings: TreemapSettings = { ... }; // Removed

const SettingsContext = React.createContext<AnalysisSettings>(defaultSettings);

// Explicitly type the return value

const App: React.FC = () => {
  const [filePath, setFilePath] = useState<string | null>(
    window.initialData?.filePath || null
  );

  const [rawAnalysisData, setRawAnalysisData] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<AnalysisSettings>(defaultSettings);

  const [treemapSettings, setTreemapSettings] = useState<TreemapSettings>(
    newDefaultTreemapSettings
  );

  const [activeView, setActiveView] = useState<"treemap">("treemap");
  const [scopeTreeData, setScopeTreeData] = useState<ScopeNode | null>(null);
  const [isTreemapLoading, setIsTreemapLoading] = useState<boolean>(false);
  const [treemapError, setTreemapError] = useState<string | null>(null);
  const [currentAnalysisTarget, setCurrentAnalysisTarget] = useState<
    string | null
  >(filePath);
  const [isSettingsPanelOpen, setIsSettingsPanelOpen] =
    useState<boolean>(false);
  const [useGridMode, setUseGridMode] = useState<boolean>(false);

  // State persistence - restore state from VS Code on load (run only once on mount)
  useEffect(() => {
    // Request state from extension instead of using webview state
    vscodeApi.postMessage({ command: "getWebviewState" });
  }, []); // Run only once on mount

  // Handle state response from extension
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      if (message.command === "webviewStateResponse") {
        if (
          message.state &&
          typeof message.state === "object" &&
          Object.keys(message.state).length > 0
        ) {
          const savedState = message.state;
          // Always restore settings and preferences, regardless of initial values
          if (savedState.activeView) {
            setActiveView(savedState.activeView);
          }
          if (savedState.treemapSettings) {
            // Merge saved settings with defaults to ensure new settings are applied
            setTreemapSettings(() => ({
              ...newDefaultTreemapSettings, // Start with all defaults
              ...savedState.treemapSettings, // Override with saved values
            }));
          }
          if (savedState.settings) {
            // For general 'settings', assuming a similar merge might be needed if it evolves
            setSettings(() => ({
              ...defaultSettings, // defaultSettings for AnalysisSettings
              ...savedState.settings,
            }));
          }
          if (savedState.isSettingsPanelOpen !== undefined) {
            setIsSettingsPanelOpen(savedState.isSettingsPanelOpen);
          }
          if (savedState.useGridMode !== undefined) {
            setUseGridMode(savedState.useGridMode);
          }
        }

        // Mark restoration as complete after processing extension response
        setHasRestoredState(true);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []); // Run only once on mount

  // State persistence - save state to extension whenever important state changes
  const [hasRestoredState, setHasRestoredState] = useState(false);

  useEffect(() => {
    // Only save state after restoration is complete
    if (!hasRestoredState) {
      return;
    }

    const stateToSave = {
      activeView,
      treemapSettings,
      settings,
      isSettingsPanelOpen,
      useGridMode,
    };
    try {
      vscodeApi.postMessage({
        command: "saveWebviewState",
        state: stateToSave,
      });
    } catch (error) {
      console.error("[App] Error sending state to extension:", error);
    }
  }, [
    hasRestoredState,
    activeView,
    treemapSettings,
    settings,
    isSettingsPanelOpen,
    useGridMode,
  ]);

  const requestGraphData = useCallback(
    (fp: string) => {
      if (!fp) return;
      vscodeApi.postMessage({ command: "analyzeDocument", text: fp });
      setIsLoading(true);
      setError(null);
      setScopeTreeData(null);
      setTreemapError(null);
      setCurrentAnalysisTarget(fp);
    },
    [vscodeApi]
  );

  const requestTreemapData = useCallback(
    (fp: string) => {
      if (!fp) return;
      vscodeApi.postMessage({
        command: "getScopeTree",
        filePath: fp,
        options: {
          flattenTree: treemapSettings.enableNodeFlattening,
          flattenBlocks: treemapSettings.flattenBlocks,
          flattenArrowFunctions: treemapSettings.flattenArrowFunctions,
          createSyntheticGroups: treemapSettings.createSyntheticGroups,
          includeImports: treemapSettings.showImports,
          includeTypes: treemapSettings.showTypes,
          includeLiterals: treemapSettings.showLiterals,
          includeComments: treemapSettings.showComments,
        },
      });
      setIsTreemapLoading(true);
      setTreemapError(null);
      setRawAnalysisData(null);
      setError(null);
      setCurrentAnalysisTarget(fp);
    },
    [vscodeApi, treemapSettings]
  );

  useEffect(() => {
    if (filePath) {
      if (activeView === "treemap") {
        requestTreemapData(filePath);
      } else if (activeView === "graph") {
        requestGraphData(filePath);
      }
    }
  }, [filePath, activeView, requestGraphData, requestTreemapData]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      switch (message.command) {
        case "analysisResult":
          setRawAnalysisData(message.data);
          setIsLoading(false);
          setError(null);
          break;
        case "analysisError":
          setError(message.error);
          setIsLoading(false);
          setRawAnalysisData(null);
          break;
        case "showScopeTree":
          setScopeTreeData(message.data);
          setIsTreemapLoading(false);
          setTreemapError(null);
          break;
        case "showScopeTreeError":
          setTreemapError(message.error);
          setIsTreemapLoading(false);
          setScopeTreeData(null);
          break;
        case "fileOpened":
          setFilePath(message.filePath);
          if (activeView === "treemap") {
            requestTreemapData(message.filePath);
          } else if (activeView === "graph") {
            requestGraphData(message.filePath);
          }
          break;
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [activeView, requestGraphData, requestTreemapData, vscodeApi]); // Added vscodeApi just in case, though it's stable

  const handleTreemapSettingChange = (
    settingName: keyof TreemapSettings,
    value: any
  ) => {
    setTreemapSettings((prevSettings) => ({
      ...prevSettings,
      [settingName]: value,
    }));
  };

  useEffect(() => {
    if (activeView === "treemap" && currentAnalysisTarget) {
      // Debounce or ensure this doesn't fire excessively if settings change rapidly
      // For now, direct refetch:
      requestTreemapData(currentAnalysisTarget);
    }
  }, [
    // Dependencies that trigger re-fetch for treemap structure
    treemapSettings.enableNodeFlattening,
    treemapSettings.flattenBlocks,
    treemapSettings.flattenArrowFunctions,
    treemapSettings.createSyntheticGroups,
    treemapSettings.showImports,
    treemapSettings.showTypes,
    treemapSettings.showLiterals,
    treemapSettings.showComments,
    // requestTreemapData itself depends on treemapSettings, so including it here
    // along with activeView and currentAnalysisTarget ensures correctness.
    activeView,
    currentAnalysisTarget,
    requestTreemapData,
  ]);

  const currentFileName = currentAnalysisTarget
    ? currentAnalysisTarget.split("/").pop()
    : "No file";

  return (
    <SettingsContext.Provider value={settings}>
      <div
        className="app-container"
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100vh",
        }}
      >
        {/* Main Header / Toolbar */}

        {/* Main Content and Settings Panel Wrapper */}
        <div style={{ display: "flex", flexGrow: 1, overflow: "hidden" }}>
          {/* Main Content Panel */}
          <div
            className="main-content-panel"
            style={{
              flexGrow: 1,
              position: "relative",
              overflow: "auto", // Allow content within to scroll
              height: "100%",
              backgroundColor: "#121212",
            }}
          >
            {/* ... loading states and view rendering (Graph/Treemap) ... */}

            {treemapError && activeView === "treemap" && (
              <div className="error-overlay">Treemap Error: {treemapError}</div>
            )}

            {activeView === "treemap" && scopeTreeData && (
              <div style={{ width: "100%", height: "100%" }}>
                <TreemapDisplay
                  data={scopeTreeData}
                  settings={treemapSettings}
                  onSettingsChange={handleTreemapSettingChange}
                  isSettingsPanelOpen={isSettingsPanelOpen}
                  onToggleSettingsPanel={() =>
                    setIsSettingsPanelOpen(!isSettingsPanelOpen)
                  }
                  fileName={currentFileName || "No file selected"}
                />
                {/* )} */}
              </div>
            )}
            {/* ... placeholder overlays ... */}
            {activeView === "treemap" &&
              !scopeTreeData &&
              !isTreemapLoading &&
              !treemapError && (
                <div className="placeholder-overlay">
                  {currentAnalysisTarget
                    ? `Select/Re-select a file or click "Treemap" to generate for ${currentFileName}.`
                    : "Select a file to generate a treemap."}
                </div>
              )}
          </div>
        </div>
      </div>
    </SettingsContext.Provider>
  );
};

export default App;
