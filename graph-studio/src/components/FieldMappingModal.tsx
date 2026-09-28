import { useEffect, useState } from "react";
import {
  MAPPABLE_SYSTEM_FIELD_KEYS,
  getDefaultFieldMapping,
  validateFieldMapping,
  type FieldMapping,
  type MappableSystemFieldKey,
} from "../graph/fieldMapping";

interface FieldMappingModalProps {
  open: boolean;
  mapping: FieldMapping;
  onSave: (mapping: FieldMapping) => void;
  onClose: () => void;
}

export default function FieldMappingModal({ open, mapping, onSave, onClose }: FieldMappingModalProps) {
  const [draft, setDraft] = useState<FieldMapping>(mapping);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setDraft(mapping);
      setError("");
    }
  }, [mapping, open]);

  if (!open) {
    return null;
  }

  return (
    <div id="field-mapping-modal" className="field-mapping-modal is-visible" aria-hidden="false">
      <div className="field-mapping-dialog" role="dialog" aria-modal="true" aria-labelledby="field-mapping-title">
        <h3 id="field-mapping-title">Field Mapping</h3>
        <p className="field-mapping-description">Customize how system keywords are read from and written to JSON files.</p>
        <div className="field-mapping-table-wrap">
          <table className="field-mapping-table">
            <thead>
              <tr>
                <th scope="col">System Keyword</th>
                <th scope="col">Field Display Name</th>
              </tr>
            </thead>
            <tbody>
              {MAPPABLE_SYSTEM_FIELD_KEYS.map((systemKey) => (
                <tr key={systemKey}>
                  <td>{systemKey}</td>
                  <td>
                    <input
                      className="field-mapping-input"
                      type="text"
                      spellCheck={false}
                      value={draft[systemKey]}
                      onChange={(event) => handleValueChange(systemKey, event.currentTarget.value)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {error ? <p className="field-mapping-error">{error}</p> : null}
        <div className="field-mapping-actions">
          <button id="field-mapping-reset" className="ghost-btn" type="button" onClick={() => setDraft(getDefaultFieldMapping())}>Reset Default</button>
          <button id="field-mapping-cancel" className="ghost-btn" type="button" onClick={onClose}>Cancel</button>
          <button
            id="field-mapping-save"
            className="primary-btn"
            type="button"
            onClick={() => {
              const validation = validateFieldMapping(draft);
              if (!validation.ok) {
                setError(validation.message);
                return;
              }
              onSave(draft);
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );

  function handleValueChange(systemKey: MappableSystemFieldKey, rawValue: string) {
    setDraft((current) => ({ ...current, [systemKey]: rawValue }));
    setError("");
  }
}
