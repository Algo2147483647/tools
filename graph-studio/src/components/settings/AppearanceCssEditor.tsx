import { useId } from "react";
import { useAppearanceUI } from "./AppearanceUIContext";

export interface AppearanceCssDraft {
  value: string;
  onChange: (value: string) => void;
}

/** Both CSS entry points share the modal draft and the Schema transaction boundary. */
export default function AppearanceCssEditor({
  label = "Custom graph CSS",
  placeholder,
}: {
  label?: string;
  placeholder?: string;
}) {
  const id = useId();
  const { model, commit, cssDraft } = useAppearanceUI();
  const binding = model.bind("style.appearance.css");
  if (!cssDraft || !binding.supported) return null;
  const pending = cssDraft.value !== binding.value;
  return (
    <div className="settings-css">
      <label htmlFor={id}>{label}</label>
      <textarea
        id={id}
        spellCheck={false}
        rows={1}
        value={cssDraft.value}
        placeholder={placeholder}
        onChange={(event) => cssDraft.onChange(event.target.value)}
      />
      <div className="settings-inline-actions">
        <button className="studio-button" disabled={!pending} onClick={() => commit(() => binding.set(cssDraft.value))}>
          Apply CSS
        </button>
        {pending && <span className="setting-draft">Unapplied changes</span>}
      </div>
    </div>
  );
}
