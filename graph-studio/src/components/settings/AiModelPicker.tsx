import { useEffect, useId, useRef, useState } from "react";
import type { AiSettings } from "../../ai/types";
import { listProviderModels, type AvailableModel } from "../../ai/transport/models";

export default function AiModelPicker({
  settings,
  onChange,
}: {
  settings: AiSettings;
  onChange: (model: string) => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [models, setModels] = useState<AvailableModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");
  const [active, setActive] = useState(-1);
  const request = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    request.current?.abort();
    request.current = null;
    setModels([]);
    setLoaded(false);
    setError("");
    setLoading(false);
    setOpen(false);
    return () => {
      request.current?.abort();
      request.current = null;
    };
  }, [settings.provider, settings.baseUrl, settings.apiKey]);
  const load = async () => {
    request.current?.abort();
    const abort = new AbortController();
    request.current = abort;
    setModels([]);
    setLoaded(false);
    setLoading(true);
    setError("");
    const timer = setTimeout(() => abort.abort(), 15000);
    try {
      const values = await listProviderModels(settings, abort.signal);
      if (!abort.signal.aborted) {
        setModels(values);
        setLoaded(true);
      }
    } catch (error) {
      if (request.current === abort)
        setError(
          abort.signal.aborted
            ? "Model list timed out. Retry or enter a model ID."
            : error instanceof Error
              ? error.message
              : "Could not load models.",
        );
    } finally {
      clearTimeout(timer);
      if (request.current === abort) setLoading(false);
    }
  };
  const show = () => {
    setOpen(true);
    setFilter("");
    setActive(-1);
    if (!loaded && !loading) void load();
  };
  const choices = models.filter((model) => `${model.id} ${model.label}`.toLowerCase().includes(filter.toLowerCase()));
  const choose = (model: string) => {
    onChange(model);
    setOpen(false);
    input.current?.focus();
  };
  return (
    <div
      className="ai-model-picker"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <label className="settings-field-label" htmlFor={id}>
        <span>Model</span>
      </label>
      <div className="ai-model-input-row">
        <input
          ref={input}
          id={id}
          className="settings-text-input"
          role="combobox"
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={`${id}-models`}
          aria-activedescendant={open && active >= 0 ? `${id}-model-${active}` : undefined}
          value={settings.model}
          placeholder="Choose or enter a model ID"
          onChange={(e) => {
            onChange(e.target.value);
            setFilter(e.target.value);
            setActive(-1);
            setOpen(true);
            if (!loaded && !loading) void load();
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
            }
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              if (!open) show();
              else
                setActive((n) =>
                  choices.length
                    ? n < 0
                      ? e.key === "ArrowDown"
                        ? 0
                        : choices.length - 1
                      : (n + (e.key === "ArrowDown" ? 1 : -1) + choices.length) % choices.length
                    : -1,
                );
            }
            if (e.key === "Enter" && open && choices[active]) {
              e.preventDefault();
              choose(choices[active].id);
            }
          }}
        />
        <button
          type="button"
          className="studio-button"
          aria-label="Choose model"
          aria-expanded={open}
          onClick={() => (open ? setOpen(false) : show())}
        >
          ▾
        </button>
      </div>
      {open && (
        <div className="ai-model-menu">
          <div className="ai-model-menu-heading">
            <span role="status">{loading ? "Loading models…" : `${models.length} available models`}</span>
            <button type="button" onClick={() => void load()} disabled={loading}>
              Refresh
            </button>
          </div>
          {error && <p role="alert">{error}</p>}
          <div id={`${id}-models`} role="listbox" aria-label="Available AI models">
            {choices.map((model, index) => (
              <button
                type="button"
                role="option"
                id={`${id}-model-${index}`}
                key={model.id}
                aria-selected={model.id === settings.model}
                className={index === active ? "is-active" : ""}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(model.id)}
              >
                <span>{model.id}</span>
                {model.label !== model.id && <small>{model.label}</small>}
              </button>
            ))}
          </div>
          {!loading && !error && !choices.length && <p>No matching models. You can enter a model ID.</p>}
        </div>
      )}
    </div>
  );
}
