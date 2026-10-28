import { AI_PROVIDER_ENTRIES, AI_PROVIDER_PRESETS } from "../../ai/transport/providerPresets";
import type { AiProvider, AiSettings } from "../../ai/types";
import Icon from "../ui/Icon";
import ProviderIcon from "./ProviderIcon";
import AiModelPicker from "./AiModelPicker";

export type AiConnectionStatus = "idle" | "testing" | "success" | "error";

interface AiSettingsPanelProps {
  showConnection?: boolean;
  aiSettings: AiSettings;
  aiBusy: boolean;
  providerMenuOpen: boolean;
  aiConnectionStatus: AiConnectionStatus;
  onProviderMenuOpenChange: (open: boolean | ((current: boolean) => boolean)) => void;
  onAiConnectionTestClick: () => void;
  onAiSettingsChange: (settings: AiSettings) => void;
}

export default function AiSettingsPanel({
  showConnection = true,
  aiSettings,
  aiBusy,
  providerMenuOpen,
  aiConnectionStatus,
  onProviderMenuOpenChange,
  onAiConnectionTestClick,
  onAiSettingsChange,
}: AiSettingsPanelProps) {
  const selectedProvider = AI_PROVIDER_PRESETS[aiSettings.provider];
  const aiConnectionButtonText = getAiConnectionButtonText(aiConnectionStatus, aiBusy);
  const updateAiSetting = <K extends keyof AiSettings>(key: K, value: AiSettings[K]) => {
    onAiSettingsChange({ ...aiSettings, [key]: value });
  };
  const handleAiProviderChange = (provider: AiProvider) => {
    const preset = AI_PROVIDER_PRESETS[provider];
    onAiSettingsChange({
      ...aiSettings,
      provider,
      baseUrl: preset.baseUrl,
      model: preset.model,
      apiKey: provider === "ollama" ? "" : aiSettings.apiKey,
    });
    onProviderMenuOpenChange(false);
  };

  return (
    <section className="settings-section ai-settings-section" aria-label="AI settings">
      {showConnection && (
        <>
          <div className="ai-settings-grid">
            <label className="settings-field-label" htmlFor="ai-provider-select">
              <span>Provider</span>
              <div className="provider-picker">
                <button
                  id="ai-provider-select"
                  className="provider-select-button"
                  type="button"
                  aria-haspopup="listbox"
                  aria-expanded={providerMenuOpen}
                  onClick={() => onProviderMenuOpenChange((current) => !current)}
                >
                  <ProviderIcon provider={aiSettings.provider} />
                  <span>{selectedProvider.label}</span>
                  <span className="provider-select-chevron" aria-hidden="true">
                    <Icon name="chevron" className="icon-glyph" />
                  </span>
                </button>
                {providerMenuOpen ? (
                  <div className="provider-options" role="listbox" aria-label="AI provider">
                    {AI_PROVIDER_ENTRIES.map(([provider, preset]) => (
                      <button
                        key={provider}
                        type="button"
                        className={`provider-option${provider === aiSettings.provider ? " is-active" : ""}`}
                        role="option"
                        aria-selected={provider === aiSettings.provider}
                        onClick={() => handleAiProviderChange(provider)}
                      >
                        <ProviderIcon provider={provider} />
                        <span>{preset.label}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </label>
            <AiModelPicker settings={aiSettings} onChange={(model) => updateAiSetting("model", model)} />
            <label className="settings-field-label ai-settings-wide" htmlFor="ai-base-url-input">
              <span>Base URL</span>
              <input
                id="ai-base-url-input"
                className="settings-text-input"
                type="text"
                value={aiSettings.baseUrl}
                onChange={(event) => updateAiSetting("baseUrl", event.currentTarget.value)}
              />
            </label>
            <label className="settings-field-label ai-settings-wide" htmlFor="ai-api-key-input">
              <span>API Key</span>
              <input
                id="ai-api-key-input"
                className="settings-text-input"
                type="password"
                value={aiSettings.apiKey}
                placeholder={aiSettings.provider === "ollama" ? "not required" : "sk-..."}
                onChange={(event) => updateAiSetting("apiKey", event.currentTarget.value)}
              />
            </label>
          </div>
          <button
            type="button"
            className={`ghost-btn settings-action-btn ai-connection-test-btn ai-connection-test-btn-${aiBusy ? "testing" : aiConnectionStatus}`}
            disabled={aiBusy}
            onClick={onAiConnectionTestClick}
          >
            {aiConnectionButtonText}
          </button>
        </>
      )}
    </section>
  );
}

function getAiConnectionButtonText(status: AiConnectionStatus, aiBusy: boolean): string {
  if (aiBusy || status === "testing") {
    return "Testing connection...";
  }
  if (status === "success") {
    return "Connection OK - Retest";
  }
  if (status === "error") {
    return "Connection Failed - Retest";
  }
  return "Test Connection";
}
