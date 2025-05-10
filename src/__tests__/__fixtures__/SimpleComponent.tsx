import React, { useState } from "react";

const SimpleComponent: React.FC<{ initialCount: number }> = ({
  initialCount,
}) => {
  const [count, setCount] = useState(initialCount);

  const increment = () => {
    setCount(count + 1);
  };

  return (
    <div>
      <p>Count: {count}</p>
      <button onClick={increment}>Increment</button>
    </div>
  );
};

export default SimpleComponent;
