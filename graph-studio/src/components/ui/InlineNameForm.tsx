import { useState } from "react";
import Icon from "./Icon";
import IconButton from "./IconButton";

export default function InlineNameForm({
  label,
  placeholder,
  busy,
  onSubmit,
  onCancel,
}: {
  label: string;
  placeholder: string;
  busy: boolean;
  onSubmit(value: string): Promise<boolean>;
  onCancel(): void;
}) {
  const [value, setValue] = useState("");
  return (
    <form
      className="inline-name-form"
      aria-label={label}
      onSubmit={async (event) => {
        event.preventDefault();
        if (!busy && value.trim() && (await onSubmit(value))) onCancel();
      }}
    >
      <Icon name="graph" size={17} />
      <input
        className="inline-input"
        aria-label="New graph file"
        autoFocus
        placeholder={placeholder}
        value={value}
        disabled={busy}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && !busy) onCancel();
        }}
      />
      <IconButton
        variant="quiet"
        type="submit"
        className="inline-name-confirm"
        label="Create"
        icon={<Icon name="check" size={15} />}
        disabled={busy || !value.trim()}
      />
      <IconButton
        variant="quiet"
        label="Cancel"
        icon={<Icon name="close" size={14} />}
        disabled={busy}
        onClick={onCancel}
      />
    </form>
  );
}
