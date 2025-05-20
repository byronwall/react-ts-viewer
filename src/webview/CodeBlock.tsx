// CodeBlock.tsx  (React 18+, ESM)
import React, { useState, useEffect } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { atomDark } from "react-syntax-highlighter/dist/esm/styles/prism";

import prettier from "prettier/standalone";
import tsParser from "prettier/plugins/typescript";
import babelParser from "prettier/plugins/babel"; // For JS/TSX/JSX
import estreeParser from "prettier/plugins/estree"; // estree is a dependency for babel/ts

export function CodeBlock({
  raw,
  lang = "tsx",
  wordWrapEnabled,
}: {
  raw: string;
  lang?: string;
  wordWrapEnabled: boolean;
}) {
  const [formattedCode, setFormattedCode] = useState<string>(raw);

  useEffect(() => {
    let isMounted = true;
    async function formatCode() {
      try {
        const pretty = await prettier.format(raw, {
          parser: "typescript", // or "babel" if lang is primarily JSX
          plugins: [babelParser, tsParser, estreeParser],
        });
        if (isMounted) {
          setFormattedCode(pretty);
        }
      } catch (e) {
        if (isMounted) {
          setFormattedCode(raw.trim()); // Show trimmed raw on error
        }
      }
    }

    if (raw) {
      // Only format if there's raw code
      formatCode();
    } else {
      setFormattedCode(""); // Handle empty raw string
    }

    return () => {
      isMounted = false;
    };
  }, [raw]); // Re-run when raw code changes

  // Show a loading state or raw code while formatting
  // For simplicity here, it shows raw then updates.
  // A more complex solution might show a spinner.

  return (
    <SyntaxHighlighter
      language={lang}
      style={atomDark}
      customStyle={{
        margin: 0,
        whiteSpace: wordWrapEnabled ? "pre-wrap" : "pre",
        overflowWrap: wordWrapEnabled ? "break-word" : "normal",
        wordWrap: wordWrapEnabled ? "break-word" : "normal",
        overflowX: "auto", // Always allow horizontal scroll
        overflowY: "auto",
      }}
      codeTagProps={{
        style: {
          whiteSpace: wordWrapEnabled ? "pre-wrap" : "pre",
        },
      }}
    >
      {formattedCode}
    </SyntaxHighlighter>
  );
}
