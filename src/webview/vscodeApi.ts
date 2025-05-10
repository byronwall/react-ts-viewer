// --- Robust VS Code API Singleton ---
// Declare acquireVsCodeApi for environments where it's globally available (like VS Code webviews)
// but not explicitly imported.
declare const acquireVsCodeApi: () => any;

export interface VsCodeApi {
  postMessage(message: any): void;
  getState(): any;
  setState(newState: any): void;
  // Add other methods you use if necessary
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
  if (typeof console !== "undefined") {
    console.log("[vscodeApi.ts] Initializing VSCode API...");
  }

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
      console.log(
        "[vscodeApi.ts] Using pre-existing valid API from globalScope.vscodeApiInstance."
      );
      resolvedApi = existingInstance;
    }
  } catch (e) {
    console.warn("[vscodeApi.ts] Error checking vscodeApiInstance:", e);
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
        console.log(
          "[vscodeApi.ts] Using pre-existing valid API from globalScope.acquiredVsCodeApi."
        );
        resolvedApi = existingAcquiredApi;
        // Store it in our standard location too
        (globalScope as any).vscodeApiInstance = existingAcquiredApi;
      }
    } catch (e) {
      console.warn("[vscodeApi.ts] Error checking acquiredVsCodeApi:", e);
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
        console.log(
          "[vscodeApi.ts] Using pre-existing valid API from globalScope.vscode."
        );
        resolvedApi = existingVsCode;
        // Store it in our standard location too
        (globalScope as any).vscodeApiInstance = existingVsCode;
      }
    } catch (e) {
      console.warn("[vscodeApi.ts] Error checking vscode:", e);
    }
  }

  // If no valid instance found in common locations, try to acquire it
  if (!resolvedApi) {
    console.log(
      "[vscodeApi.ts] No API found in common locations. Attempting to acquire."
    );

    try {
      // Check if acquireVsCodeApi is available
      if (typeof acquireVsCodeApi === "function") {
        const acquiredApi = acquireVsCodeApi();
        console.log(
          "[vscodeApi.ts] acquireVsCodeApi() call successful. Storing on globalScope."
        );
        (globalScope as any).vscodeApiInstance = acquiredApi;
        resolvedApi = acquiredApi;
      } else {
        console.warn(
          "[vscodeApi.ts] acquireVsCodeApi is not available in this context."
        );
      }
    } catch (error: any) {
      console.error(
        "[vscodeApi.ts] Error during acquireVsCodeApi() call:",
        error?.message || error
      );

      const alreadyAcquired =
        error?.message &&
        typeof error.message === "string" &&
        error.message.includes("already been acquired");

      if (alreadyAcquired) {
        console.log(
          "[vscodeApi.ts] API 'already acquired'. Checking a few last places..."
        );

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
            console.log(
              "[vscodeApi.ts] Found valid API at globalScope.__vscode__"
            );
            (globalScope as any).vscodeApiInstance = vsCodeSpecial;
            resolvedApi = vsCodeSpecial;
          }
        } catch (e) {
          console.warn("[vscodeApi.ts] Error checking __vscode__:", e);
        }

        if (!resolvedApi) {
          console.warn(
            "[vscodeApi.ts] API 'already acquired', but could not locate it in common places. Will use mock implementation."
          );
        }
      } else {
        console.warn(
          "[vscodeApi.ts] acquireVsCodeApi() failed with an unexpected error. API unavailable."
        );
      }
    }
  }
} else {
  console.warn(
    "[vscodeApi.ts] Global scope (window/global) not found. VS Code API cannot be initialized."
  );
}

// Define the exported API object with graceful fallbacks
export const vscodeApi: VsCodeApi = {
  postMessage: (message: any) => {
    try {
      if (resolvedApi) {
        resolvedApi.postMessage(message);
      } else {
        console.warn("VSCode API (mock) postMessage:", message);

        // Last-ditch effort - try to directly access vscode on window
        // This is a common pattern in VS Code webviews where the API is injected into the global scope
        try {
          if (
            (globalScope as any).vscode &&
            typeof (globalScope as any).vscode.postMessage === "function"
          ) {
            (globalScope as any).vscode.postMessage(message);
            console.log(
              "[vscodeApi.ts] Successfully used window.vscode for postMessage"
            );

            // Save for future use
            resolvedApi = (globalScope as any).vscode;
            (globalScope as any).vscodeApiInstance = resolvedApi;
          }
        } catch (e) {
          console.error(
            "[vscodeApi.ts] Final attempt to use window.vscode failed:",
            e
          );
        }
      }
    } catch (e) {
      console.error("[vscodeApi.ts] Error in postMessage:", e);
    }
  },
  getState: () => {
    try {
      if (resolvedApi && typeof resolvedApi.getState === "function") {
        return resolvedApi.getState();
      }
    } catch (e) {
      console.error("[vscodeApi.ts] Error in getState:", e);
    }
    console.warn("VSCode API (mock) getState called.");
    return {};
  },
  setState: (newState: any) => {
    try {
      if (resolvedApi && typeof resolvedApi.setState === "function") {
        resolvedApi.setState(newState);
        return;
      }
    } catch (e) {
      console.error("[vscodeApi.ts] Error in setState:", e);
    }
    console.warn("VSCode API (mock) setState with:", newState);
  },
};

if (resolvedApi && typeof resolvedApi.postMessage === "function") {
  console.log("[vscodeApi.ts] VSCode API initialized and ready.");
} else {
  console.warn(
    "[vscodeApi.ts] VSCode API could not be initialized. Operations will use mock implementation."
  );
}
