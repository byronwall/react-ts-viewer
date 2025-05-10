import React, { useEffect, useCallback, useReducer } from "react";

// A custom hook
function useLogger(componentName: string) {
  useEffect(() => {
    console.log(`${componentName} mounted`);
    return () => console.log(`${componentName} unmounted`);
  }, [componentName]);
}

type State = { count: number; text: string };
type Action = { type: "INCREMENT" } | { type: "SET_TEXT"; payload: string };

const initialState: State = { count: 0, text: "" };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "INCREMENT":
      return { ...state, count: state.count + 1 };
    case "SET_TEXT":
      return { ...state, text: action.payload };
    default:
      return state;
  }
}

interface AdvancedComponentProps {
  id: string;
  onUpdate?: (count: number) => void;
}

const AdvancedComponent: React.FC<AdvancedComponentProps> = ({
  id,
  onUpdate,
}) => {
  useLogger(`AdvancedComponent-${id}`);
  const [state, dispatch] = useReducer(reducer, initialState);

  const handleIncrement = useCallback(() => {
    dispatch({ type: "INCREMENT" });
    if (onUpdate) {
      onUpdate(state.count + 1);
    }
  }, [state.count, onUpdate]);

  const handleTextChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    dispatch({ type: "SET_TEXT", payload: event.target.value });
  };

  // Example of a nested function not necessarily a React component or hook
  function utilityFunction(value: number) {
    if (value % 2 === 0) {
      return value * 2;
    }
    return value * 3;
  }

  useEffect(() => {
    const result = utilityFunction(state.count);
    console.log("Utility function result:", result);
  }, [state.count]);

  return (
    <div className={`advanced-component advanced-component--${id}`}>
      <h2>Advanced Component ({id})</h2>
      <p>Current Count: {state.count}</p>
      <input
        type="text"
        value={state.text}
        onChange={handleTextChange}
        placeholder="Enter text"
      />
      <p>Current Text: {state.text}</p>
      <button onClick={handleIncrement}>Increment</button>
      {state.count > 5 && (
        <p style={{ color: "green" }}>Count is greater than 5!</p>
      )}
      {(() => {
        // IIFE for conditional rendering logic
        if (state.text.length > 0) {
          return <p>You entered: {state.text.toUpperCase()}</p>;
        }
        return null;
      })()}
    </div>
  );
};

export { AdvancedComponent, useLogger };
export default AdvancedComponent;
