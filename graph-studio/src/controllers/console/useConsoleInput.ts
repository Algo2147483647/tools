import { useCallback,useEffect,useMemo,useState } from "react";
import { getConsoleSuggestions } from "../../console/presentation";
import type { ConsoleEntry } from "../../console/types";
type Ask = (message: string) => Promise<void>;
export function useConsoleInput(generation: number, appendMessage: (tone: Exclude<ConsoleEntry["tone"], "ai-review">, text: string) => void) {
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
  const suggestions = useMemo(() => getConsoleSuggestions(input), [input]);
 useEffect(() => { setInput(""); setHistory([]); setHistoryIndex(null); setActiveSuggestionIndex(0); }, [generation]);
  const recordInput = useCallback(
    (prompt: string, source: string) => {
      source
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .forEach((line) => appendMessage("input", `${prompt} ${line}`));
      setHistory((current) => (current[current.length - 1] === source ? current : [...current, source]));
      setHistoryIndex(null);
    },
    [appendMessage],
  );


  const changeInput = useCallback((value: string) => {
    setInput(value);
    setHistoryIndex(null);
    setActiveSuggestionIndex(0);
  }, []);

  function submit(source: string, ask: Ask, runSource: (source: string) => boolean) {
    if (!source.trim()) return;
    if (source.trimStart().startsWith("/")) runSource(source);
    else void ask(source);
    changeInput("");
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>, ask: Ask, runSource: (source: string) => boolean) {
    if (event.key === "Enter") {
      event.preventDefault();
      submit(input, ask, runSource);
    } else if (event.key === "Tab" && suggestions.length) {
      event.preventDefault();
      changeInput(suggestions[activeSuggestionIndex]?.insertText || input);
    } else if (suggestions.length && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActiveSuggestionIndex((current) => (current + step + suggestions.length) % suggestions.length);
    } else if (history.length && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      event.preventDefault();
      if (event.key === "ArrowDown" && historyIndex === null) return;
      const next =
        event.key === "ArrowUp"
          ? historyIndex === null
            ? history.length - 1
            : Math.max(0, historyIndex - 1)
          : historyIndex! + 1;
      setHistoryIndex(next >= history.length ? null : next);
      setInput(history[next] || "");
      setActiveSuggestionIndex(0);
    }
  }

  function handlePaste(event: React.ClipboardEvent<HTMLInputElement>, ask: Ask, runSource: (source: string) => boolean) {
    const pasted = event.clipboardData.getData("text");
    if (!/\r?\n/.test(pasted)) return;
    const { selectionStart, selectionEnd, value } = event.currentTarget;
    const start = selectionStart ?? value.length;
    event.preventDefault();
    submit(`${value.slice(0, start)}${pasted}${value.slice(selectionEnd ?? start)}`, ask, runSource);
  }

 return { input, suggestions, activeSuggestionIndex, recordInput, changeInput, handleKeyDown, handlePaste };
}
