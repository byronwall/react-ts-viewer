# Problems with ELK LAyout and Reference + Scope Graph

Review the problem description in this file and figure out how to fix it. Implement those fixes. I will update the MD and we'll iterate until things are completely solved. Place an emphasis on concise but well placed logs that will help spot problems. I will be pasting them back in here.

## Problems

- The reference for `keysToTrack` does not render. Instead arrows originate from the variable declaration for `useKeyModifiers` and point to the `useCallback` and `if` scopes. The target on the arrows is OK. The source should be a synthetic node for the `keysToTrack` variable since it is a parameter to the `useKeyModifiers` function. It looks like maybe our logic cannot handle exported arrow functions vs. "traditional" functions.

## Test Scenario

With the treemap loaded for the code below, I `SHIFT + CLICK` on the `handleKeyDown` scope.

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";

type ModifierKey = "Control" | "Shift" | "Alt" | "Meta";

// Type for the hook's return value
type KeyModifiersState = Partial<Record<ModifierKey, boolean>>;

export const useKeyModifiers = (
  keysToTrack: ModifierKey[]
): KeyModifiersState => {
  const [pressedModifiers, setPressedModifiers] = useState<KeyModifiersState>(
    {}
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (keysToTrack.includes(event.key as ModifierKey)) {
        setPressedModifiers((prev) => ({
          ...prev,
          [event.key as ModifierKey]: true,
        }));
      }
    },
    [keysToTrack]
  );

  const handleKeyUp = useCallback(
    (event: KeyboardEvent) => {
      if (keysToTrack.includes(event.key as ModifierKey)) {
        setPressedModifiers((prev) => ({
          ...prev,
          [event.key as ModifierKey]: false,
        }));
      }
    },
    [keysToTrack]
  );

  // Effect to add/remove global event listeners
  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    // Cleanup listeners on unmount
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [handleKeyDown, handleKeyUp]); // Re-attach if handlers change (due to keysToTrack changing)

  // Add visibility change listener to reset keys if window loses focus
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Reset all tracked keys to false when window is hidden
        const resetState = keysToTrack.reduce((acc, key) => {
          acc[key] = false;
          return acc;
        }, {} as KeyModifiersState);
        setPressedModifiers(resetState);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [keysToTrack]);

  return pressedModifiers;
};
```

## Most recent logs

```

```
