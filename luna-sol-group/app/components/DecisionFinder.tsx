"use client";

import { useRouter } from "next/navigation";
import { FormEvent, KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import { decisionFinderIndex } from "../content";

type DecisionFinderProps = {
  compact?: boolean;
};

export function DecisionFinder({ compact = false }: DecisionFinderProps) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const instanceId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const dialogId = `decision-finder-${instanceId}`;
  const resultsId = `decision-results-${instanceId}`;
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const results = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const matches = normalizedQuery
      ? decisionFinderIndex.filter((item) => `${item.title} ${item.description} ${item.type} ${item.keywords}`.toLowerCase().includes(normalizedQuery))
      : decisionFinderIndex;
    return matches.slice(0, 8);
  }, [query]);

  useEffect(() => {
    function handleShortcut(event: globalThis.KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isTyping = target?.matches("input, textarea, select, [contenteditable='true']");
      const isCommandSearch = event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey);
      const isSlashSearch = event.key === "/" && !isTyping;
      if ((!isCommandSearch && !isSlashSearch) || isOpen) return;
      event.preventDefault();
      dialogRef.current?.showModal();
      setIsOpen(true);
      requestAnimationFrame(() => inputRef.current?.focus());
    }

    document.addEventListener("keydown", handleShortcut);
    return () => document.removeEventListener("keydown", handleShortcut);
  }, [isOpen]);

  function openFinder() {
    dialogRef.current?.showModal();
    setIsOpen(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function closeFinder() {
    dialogRef.current?.close();
  }

  function selectResult(index: number) {
    const result = results[index];
    if (!result) return;
    closeFinder();
    router.push(result.href);
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    selectResult(activeIndex);
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!results.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % results.length);
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => (current - 1 + results.length) % results.length);
    }
    if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
    }
    if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(results.length - 1);
    }
  }

  return (
    <>
      <button
        className={`decision-finder-trigger${compact ? " decision-finder-trigger-compact" : ""}`}
        type="button"
        ref={triggerRef}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={dialogId}
        onClick={openFinder}
      >
        <span className="decision-finder-icon" aria-hidden="true" />
        <span className="decision-finder-label">Find a decision</span>
        <kbd aria-hidden="true">⌘K</kbd>
      </button>

      <dialog
        className="decision-finder-dialog"
        id={dialogId}
        ref={dialogRef}
        aria-labelledby={`${dialogId}-title`}
        onCancel={(event) => {
          event.preventDefault();
          closeFinder();
        }}
        onClose={() => {
          setIsOpen(false);
          setQuery("");
          requestAnimationFrame(() => triggerRef.current?.focus());
        }}
        onClick={(event) => { if (event.target === dialogRef.current) closeFinder(); }}
      >
        <div className="decision-finder-panel">
          <header>
            <div>
              <span>Local site index</span>
              <h2 id={`${dialogId}-title`}>What decision are you trying to move?</h2>
            </div>
            <button type="button" onClick={closeFinder} aria-label="Close Decision Finder">Close</button>
          </header>

          <form onSubmit={submitSearch}>
            <label htmlFor={`${dialogId}-input`}>Search by problem, capability, case, or tool</label>
            <div className="decision-finder-input-wrap">
              <span aria-hidden="true" />
              <input
                id={`${dialogId}-input`}
                ref={inputRef}
                type="search"
                value={query}
                placeholder="Try “backlog,” “governance,” or “implementation”"
                autoComplete="off"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded="true"
                aria-controls={resultsId}
                aria-activedescendant={results[activeIndex] ? `${resultsId}-${activeIndex}` : undefined}
                onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); }}
                onKeyDown={handleInputKeyDown}
              />
              {query && <button type="button" onClick={() => setQuery("")}>Clear</button>}
            </div>
          </form>

          <div className="decision-finder-status" role="status" aria-live="polite">
            <span>{query ? `${results.length} matching paths` : "Suggested starting points"}</span>
            <small>Use ↑ ↓ and Enter</small>
          </div>

          <div className="decision-finder-results" id={resultsId} role="listbox" aria-label="Decision paths">
            {results.map((result, index) => (
              <button
                id={`${resultsId}-${index}`}
                key={result.href}
                type="button"
                role="option"
                aria-selected={activeIndex === index}
                className={activeIndex === index ? "is-active" : undefined}
                onMouseEnter={() => setActiveIndex(index)}
                onFocus={() => setActiveIndex(index)}
                onClick={() => selectResult(index)}
              >
                <small>{result.type}</small>
                <span>
                  <strong>{result.title}</strong>
                  <em>{result.description}</em>
                </span>
                <i aria-hidden="true">→</i>
              </button>
            ))}
            {!results.length && (
              <div className="decision-finder-empty">
                <strong>No exact path found.</strong>
                <p>Try a broader operating term, or start a conversation to frame the decision directly.</p>
              </div>
            )}
          </div>

          <footer>
            <span>Curated index · no query leaves this browser</span>
            <button type="button" onClick={() => { closeFinder(); router.push("/#contact"); }}>Frame the decision with Luna Sol →</button>
          </footer>
        </div>
      </dialog>
    </>
  );
}
