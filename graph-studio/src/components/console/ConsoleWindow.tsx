import { useEffect, useRef, useState } from "react";
import Icon from "../ui/Icon";
import ConsoleProtocols from "./ConsoleProtocols";
import { useFloatingConsole } from "./useFloatingConsole";
import AiActivityView from "../ui/AiActivityView";
import type { AiActivity } from "../../app/ai/useAiActivity";
import type { NodeKey } from "../../graph/types";

import type { ConsoleEntry, ConsoleReviewCard, ConsoleSuggestion } from "../../console/types";

interface ConsoleWindowProps {
  onClose: () => void;
  hasGraph: boolean;
  entries: ConsoleEntry[];
  inputValue: string;
  contextNodeKey: NodeKey | null;
  aiBusy: boolean;
  aiActivity?: AiActivity;
  suggestions: ConsoleSuggestion[];
  activeSuggestionIndex: number;
  onReviewApply: (planId: string) => void;
  onReviewDismiss: (planId: string) => void;
  onReviewCopy: (commands: string[]) => void;
  onInputChange: (value: string) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  onPaste: (event: React.ClipboardEvent<HTMLInputElement>) => void;
  onSuggestionSelect: (suggestion: ConsoleSuggestion) => void;
}

export default function ConsoleWindow({
  onClose,
  hasGraph,
  entries,
  inputValue,
  contextNodeKey,
  aiBusy,
  aiActivity,
  suggestions,
  activeSuggestionIndex,
  onReviewApply,
  onReviewDismiss,
  onReviewCopy,
  onInputChange,
  onKeyDown,
  onPaste,
  onSuggestionSelect,
}: ConsoleWindowProps) {
  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const followOutput = useRef(true);
  const floating = useFloatingConsole();
  const [activeTab, setActiveTab] = useState<"conversation" | "protocols">("conversation");

  useEffect(() => {
    const previous = document.activeElement;
    inputRef.current?.focus();
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    const output = outputRef.current;
    if (!output || !followOutput.current) {
      return;
    }
    output.scrollTop = output.scrollHeight;
  }, [entries, aiActivity?.content, aiActivity?.reasoning, aiBusy, activeTab]);

  return (
    <section
      ref={floating.ref}
      style={floating.style}
      className="console-window"
      role="dialog"
      aria-modal="false"
      aria-label="Graph console"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <header className="console-window__header" {...floating.headerProps}>
        <div className="console-window__tabs" role="tablist" aria-label="Console pages">
          {(["conversation", "protocols"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              id={`console-tab-${tab}`}
              aria-selected={activeTab === tab}
              aria-controls={`console-panel-${tab}`}
              tabIndex={activeTab === tab ? 0 : -1}
              onClick={() => setActiveTab(tab)}
              onKeyDown={(event) => {
                if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                event.preventDefault();
                const next =
                  event.key === "Home"
                    ? "conversation"
                    : event.key === "End"
                      ? "protocols"
                      : tab === "conversation"
                        ? "protocols"
                        : "conversation";
                setActiveTab(next);
                document.getElementById(`console-tab-${next}`)?.focus();
              }}
            >
              {tab === "conversation" ? "Console" : "Protocols"}
            </button>
          ))}
        </div>
        <div className="console-window__actions">
          <span className={`console-window__status${aiBusy ? " is-busy" : ""}`} role="status">
            {aiBusy ? "Working" : "Ready"}
          </span>
          <button
            type="button"
            className="console-window__close"
            aria-label="Close console"
            title="Close (Esc)"
            onClick={onClose}
          >
            <Icon name="close" size={18} />
          </button>
        </div>
      </header>
      <div
        className="console-window__conversation"
        id="console-panel-conversation"
        role="tabpanel"
        aria-labelledby="console-tab-conversation"
        hidden={activeTab !== "conversation"}
      >
        <div
          ref={outputRef}
          className="console-terminal__output"
          role="log"
          aria-label="Console messages"
          aria-live="polite"
          onScroll={(event) => {
            const output = event.currentTarget;
            followOutput.current = output.scrollHeight - output.scrollTop - output.clientHeight < 40;
          }}
        >
          {entries.map((entry) =>
            entry.tone === "ai-review" ? (
              <AiReviewCardView
                key={entry.id}
                review={entry.review}
                onApply={onReviewApply}
                onDismiss={onReviewDismiss}
                onCopy={onReviewCopy}
              />
            ) : (
              <div key={entry.id} className={`console-terminal__line console-terminal__line--${entry.tone}`}>
                <span>{entry.text}</span>
              </div>
            ),
          )}
          {!hasGraph ? (
            <div className="console-terminal__line console-terminal__line--info">
              Load or initialize a graph to enable mutations.
            </div>
          ) : null}
          {aiBusy && !aiActivity?.request ? (
            <div className="console-terminal__line console-terminal__line--ai">Waiting for model…</div>
          ) : null}
          <AiActivityView activity={aiActivity} busy={aiBusy} />
        </div>
        <div className="console-terminal__input-wrap">
          <label className="console-terminal__prompt" htmlFor="graph-console-input">
            {contextNodeKey ? `${contextNodeKey}>` : "graph>"}
          </label>
          <input
            ref={inputRef}
            id="graph-console-input"
            className="console-terminal__input"
            type="text"
            spellCheck={false}
            autoComplete="off"
            value={inputValue}
            disabled={aiBusy}
            placeholder="Ask AI or type /help…"
            onChange={(event) => onInputChange(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (!event.nativeEvent.isComposing) onKeyDown(event);
            }}
            onPaste={onPaste}
          />
        </div>

        {suggestions.length > 0 ? (
          <div className="console-terminal__suggestions" role="listbox" aria-label="Command suggestions">
            {suggestions.map((suggestion, index) => (
              <button
                key={`${suggestion.label}-${index}`}
                type="button"
                className={`console-terminal__suggestion${index === activeSuggestionIndex ? " is-active" : ""}`}
                onMouseDown={(event) => {
                  event.preventDefault();
                  onSuggestionSelect(suggestion);
                }}
              >
                <span>{suggestion.label}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div
        className="console-window__protocol-panel"
        id="console-panel-protocols"
        role="tabpanel"
        aria-labelledby="console-tab-protocols"
        hidden={activeTab !== "protocols"}
        tabIndex={0}
      >
        <ConsoleProtocols />
      </div>
    </section>
  );
}

function AiReviewCardView({
  review,
  onApply,
  onDismiss,
  onCopy,
}: {
  review: ConsoleReviewCard;
  onApply: (planId: string) => void;
  onDismiss: (planId: string) => void;
  onCopy: (commands: string[]) => void;
}) {
  return (
    <article
      className={`console-review-card console-review-card--${review.status}`}
      aria-label={`AI review plan ${review.title}`}
    >
      <div className="console-review-card__header">
        <div>
          <p className="console-review-card__eyebrow">AI Review</p>
          <h3>{review.title}</h3>
        </div>
        <span className={`console-review-card__risk console-review-card__risk--${review.riskLevel}`}>
          {review.riskLevel}
        </span>
      </div>
      <p className="console-review-card__goal">{review.goal}</p>
      <div className="console-review-card__meta" aria-label="Plan summary">
        <span>{review.changeCount} changes</span>
        <span>{review.commandCount} commands</span>
        <span>{review.status}</span>
      </div>
      {review.validationSummary ? <p className="console-review-card__validation">{review.validationSummary}</p> : null}
      {review.diffPreview.length ? (
        <div className="console-review-card__section">
          <p className="console-review-card__label">Diff Preview</p>
          <pre>{review.diffPreview.join("\n")}</pre>
        </div>
      ) : null}
      <div className="console-review-card__section">
        <p className="console-review-card__label">Commands</p>
        <pre>{review.commands.join("\n")}</pre>
      </div>
      <div className="console-review-card__actions">
        <button type="button" disabled={!review.canApply} onClick={() => onApply(review.planId)}>
          Apply
        </button>
        <button type="button" onClick={() => onCopy(review.commands)}>
          Copy Commands
        </button>
        <button type="button" onClick={() => onDismiss(review.planId)}>
          Dismiss
        </button>
      </div>
    </article>
  );
}
