import { useEffect, useState } from "react";

/** Every submitted message is AI input. There is no local command path. */
export function useConsoleInput(generation: number) {
  const [input, setInput] = useState("");
  useEffect(() => setInput(""), [generation]);
  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>, ask: (message: string) => Promise<void>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    if (!input.trim()) return;
    void ask(input);
    setInput("");
  };
  return { input, changeInput: setInput, handleKeyDown };
}
