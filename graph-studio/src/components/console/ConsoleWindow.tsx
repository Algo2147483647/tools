import { useEffect, useRef, type ReactNode } from "react";
import Icon from "../ui/Icon";
import ConsoleProtocols from "./ConsoleProtocols";
import { useFloatingConsole } from "./useFloatingConsole";
import AiActivityView from "../ui/AiActivityView";
import type { AiActivity } from "../../app/ai/useAiActivity";

import type { ConsoleEntry } from "../../console/types";

const CONSOLE_TABS = [
  { id: "conversation", label: "Console" },
  { id: "workbench", label: "Workbench" },
  { id: "protocols", label: "Protocols" },
] as const;
export type ConsoleTab = (typeof CONSOLE_TABS)[number]["id"];

interface ConsoleWindowProps {
  activeTab: ConsoleTab;
  onTabChange(tab: ConsoleTab): void;
  workbench: ReactNode;
  toolbar: ReactNode;
  capabilityContext?: import("../../console/capabilities").CapabilityContext;
  onCancelAi?: () => void;
  onClose: () => void;
  hasGraph: boolean;
  entries: ConsoleEntry[];
  inputValue: string;
  aiBusy: boolean;
  aiActivity?: AiActivity;
  onInputChange: (value: string) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
}

export default function ConsoleWindow({
  activeTab,
  onTabChange,
  workbench,
  toolbar,
  onClose,
  capabilityContext,
  onCancelAi,
  hasGraph,
  entries,
  inputValue,
  aiBusy,
  aiActivity,
  onInputChange,
  onKeyDown,
}: ConsoleWindowProps) {
  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const followOutput = useRef(true);
  const floating = useFloatingConsole();

  useEffect(() => {
    const previous = document.activeElement;
    if (activeTab === "conversation") inputRef.current?.focus();
    else document.getElementById(`console-tab-${activeTab}`)?.focus();
    return () => {
      const target =
        previous instanceof HTMLElement && previous !== document.body && previous.isConnected
          ? previous
          : document.getElementById("studio-launcher");
      target?.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    if (activeTab === "conversation") inputRef.current?.focus({ preventScroll: true });
  }, [activeTab]);

  useEffect(() => {
    const output = outputRef.current;
    if (!output || !followOutput.current) {
      return;
    }
    output.scrollTop = output.scrollHeight;
  }, [entries, aiActivity?.content, aiActivity?.reasoning, aiBusy, activeTab]);

  return (
    <section
      id="graph-console"
      ref={floating.ref}
      style={floating.style}
      className="console-window"
      role="dialog"
      aria-modal="false"
      aria-label="Graph console"
      onKeyDown={(event) => {
        if (event.key === "Escape" && !event.defaultPrevented) {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <header className="console-window__header" {...floating.headerProps}>
        <div className="console-window__tabs" role="tablist" aria-label="Console pages">
          {CONSOLE_TABS.map(({ id: tab, label }, index) => (
            <button
              key={tab}
              type="button"
              role="tab"
              id={`console-tab-${tab}`}
              aria-selected={activeTab === tab}
              aria-controls={`console-panel-${tab}`}
              tabIndex={activeTab === tab ? 0 : -1}
              onClick={() => onTabChange(tab)}
              onKeyDown={(event) => {
                if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                event.preventDefault();
                const nextIndex =
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? CONSOLE_TABS.length - 1
                      : (index + (event.key === "ArrowRight" ? 1 : -1) + CONSOLE_TABS.length) % CONSOLE_TABS.length;
                const next = CONSOLE_TABS[nextIndex].id;
                onTabChange(next);
                document.getElementById(`console-tab-${next}`)?.focus();
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="console-window__actions">
          {aiBusy && onCancelAi && (
            <button type="button" onClick={onCancelAi} aria-label="Cancel AI request">
              Stop
            </button>
          )}
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
          {entries.map((entry) => (
            <div key={entry.id} className={`console-terminal__line console-terminal__line--${entry.tone}`}>
              <span>{entry.text}</span>
            </div>
          ))}
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
          <textarea
            ref={inputRef}
            id="graph-console-input"
            aria-label="AI message"
            className="console-terminal__input"
            rows={2}
            spellCheck={false}
            autoComplete="off"
            value={inputValue}
            disabled={aiBusy}
            onChange={(event) => onInputChange(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (!event.nativeEvent.isComposing) onKeyDown(event);
            }}
          />
        </div>
      </div>
      <div
        className="console-window__workbench-panel"
        id="console-panel-workbench"
        role="tabpanel"
        aria-labelledby="console-tab-workbench"
        hidden={activeTab !== "workbench"}
        tabIndex={0}
      >
        {toolbar}
        {workbench}
      </div>
      <div
        className="console-window__protocol-panel"
        id="console-panel-protocols"
        role="tabpanel"
        aria-labelledby="console-tab-protocols"
        hidden={activeTab !== "protocols"}
        tabIndex={0}
      >
        <ConsoleProtocols context={capabilityContext} />
      </div>
    </section>
  );
}
