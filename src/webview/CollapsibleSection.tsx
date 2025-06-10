import * as React from "react";
import { useState } from "react";

interface CollapsibleSectionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  children,
  defaultOpen = true,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div style={{ marginBottom: "1px", borderTop: "1px solid #383838" }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: "100%",
          background: isOpen ? "#3a3a3a" : "#2c2c2c",
          color: "#eee",
          border: "none",
          padding: "10px 12px",
          textAlign: "left",
          fontSize: "0.95em",
          fontWeight: 600,
          cursor: "pointer",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: isOpen ? "1px solid #383838" : "none",
        }}
        aria-expanded={isOpen}
        aria-controls={`section-${title.replace(/\s+/g, "-").toLowerCase()}`}
      >
        {title}
        <span
          style={{
            fontSize: "1.2em",
            transform: isOpen ? "rotate(0deg)" : "rotate(-90deg)",
            transition: "transform 0.2s",
          }}
        >
          {isOpen ? "▼" : "▶"}
        </span>
      </button>
      {isOpen && (
        <div
          id={`section-${title.replace(/\s+/g, "-").toLowerCase()}`}
          style={{
            padding: "15px 12px 5px 12px",
            background: "#252525",
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
};

export default CollapsibleSection;
