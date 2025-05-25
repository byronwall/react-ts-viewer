// --- Robust VS Code API Singleton ---
// Declare acquireVsCodeApi for environments where it's globally available (like VS Code webviews)
// but not explicitly imported.
declare const acquireVsCodeApi: () => any;

export interface VsCodeApi {
  postMessage(message: any): void;
  getState(): any;
  setState(newState: any): void;
}

// Ensure window object is accessible
declare global {
  interface Window {
    vscodeApiInstance?: VsCodeApi;
    acquiredVsCodeApi?: VsCodeApi;
    vscode?: VsCodeApi;
  }
}

const globalScope =
  typeof window !== "undefined"
    ? window
    : typeof global !== "undefined"
      ? global
      : undefined;

let resolvedApi: VsCodeApi | undefined = undefined;

if (globalScope) {
  // Try to safely access common places where VS Code API might be stored
  try {
    // 1. Try from vscodeApiInstance
    const existingInstance = (globalScope as any).vscodeApiInstance as
      | VsCodeApi
      | undefined;
    if (
      existingInstance &&
      typeof existingInstance.postMessage === "function"
    ) {
      resolvedApi = existingInstance;
    }
  } catch (e) {
    // Silently handle error
  }

  // If not found, try other common locations
  if (!resolvedApi) {
    try {
      // 2. Try from acquiredVsCodeApi
      const existingAcquiredApi = (globalScope as any).acquiredVsCodeApi as
        | VsCodeApi
        | undefined;
      if (
        existingAcquiredApi &&
        typeof existingAcquiredApi.postMessage === "function"
      ) {
        resolvedApi = existingAcquiredApi;
        // Store it in our standard location too
        (globalScope as any).vscodeApiInstance = existingAcquiredApi;
      }
    } catch (e) {
      // Silently handle error
    }
  }

  // If still not found, try window.vscode
  if (!resolvedApi) {
    try {
      // 3. Try from vscode
      const existingVsCode = (globalScope as any).vscode as
        | VsCodeApi
        | undefined;
      if (existingVsCode && typeof existingVsCode.postMessage === "function") {
        resolvedApi = existingVsCode;
        // Store it in our standard location too
        (globalScope as any).vscodeApiInstance = existingVsCode;
      }
    } catch (e) {
      // Silently handle error
    }
  }

  // If no valid instance found in common locations, try to acquire it
  if (!resolvedApi) {
    try {
      // Check if acquireVsCodeApi is available
      if (typeof acquireVsCodeApi === "function") {
        const acquiredApi = acquireVsCodeApi();
        (globalScope as any).vscodeApiInstance = acquiredApi;
        resolvedApi = acquiredApi;
      }
    } catch (error: any) {
      const alreadyAcquired =
        error?.message &&
        typeof error.message === "string" &&
        error.message.includes("already been acquired");

      if (alreadyAcquired) {
        // Safe checks for a few specific locations without enumerating all properties
        try {
          // One more attempt with __vscode__
          const vsCodeSpecial = (globalScope as any).__vscode__ as
            | VsCodeApi
            | undefined;
          if (
            vsCodeSpecial &&
            typeof vsCodeSpecial.postMessage === "function"
          ) {
            (globalScope as any).vscodeApiInstance = vsCodeSpecial;
            resolvedApi = vsCodeSpecial;
          }
        } catch (e) {
          // Silently handle error
        }
      }
    }
  }
}

// Define the exported API object with graceful fallbacks
export const vscodeApi: VsCodeApi = {
  postMessage: (message: any) => {
    try {
      if (resolvedApi) {
        resolvedApi.postMessage(message);
      } else {
        // Last-ditch effort - try to directly access vscode on window
        // This is a common pattern in VS Code webviews where the API is injected into the global scope
        try {
          if (
            (globalScope as any).vscode &&
            typeof (globalScope as any).vscode.postMessage === "function"
          ) {
            (globalScope as any).vscode.postMessage(message);

            // Save for future use
            resolvedApi = (globalScope as any).vscode;
            (globalScope as any).vscodeApiInstance = resolvedApi;
          }
        } catch (e) {
          // Silently handle error
        }
      }
    } catch (e) {
      // Silently handle error
    }
  },
  getState: () => {
    try {
      if (resolvedApi && typeof resolvedApi.getState === "function") {
        return resolvedApi.getState();
      }
    } catch (e) {
      // Silently handle error
    }
    return undefined; // Return undefined instead of {} to indicate no state available
  },
  setState: (newState: any) => {
    try {
      if (resolvedApi && typeof resolvedApi.setState === "function") {
        resolvedApi.setState(newState);
        return;
      }
    } catch (e) {
      // Silently handle error
    }
  },
};
