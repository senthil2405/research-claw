"use client";

import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
// KaTeX styles for rendered formulas.
import "katex/dist/katex.min.css";
import styles from "./Markdown.module.css";

export interface MarkdownProps {
  content: string;
}

/**
 * Renders assistant chat output as GitHub-flavored Markdown with LaTeX math
 * (inline `$…$` and block `$$…$$` via KaTeX). Raw HTML is NOT enabled, so model
 * output can't inject markup. Memoized — re-renders only when content changes.
 */
export const Markdown = memo(function Markdown({ content }: MarkdownProps) {
  return (
    <div className={styles.md}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[[rehypeKatex, { strict: false, throwOnError: false }]]}
        components={{
          a: ({ ...props }) => (
            <a {...props} target="_blank" rel="noreferrer noopener" />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});

export default Markdown;
