import * as React from "react";
import {
  TreemapSettings,
  SettingConfig,
  NumberSettingConfig,
  SelectSettingConfig,
} from "./settingsConfig";

interface SettingsControlProps {
  config: SettingConfig;
  currentSettings: TreemapSettings;
  onChange: (id: keyof TreemapSettings, value: any) => void;
}

const SettingsControl: React.FC<SettingsControlProps> = ({
  config,
  currentSettings,
  onChange,
}) => {
  const value = currentSettings[config.id];
  const isDisabled = config.disabled ? config.disabled(currentSettings) : false;

  const commonInputStyle: React.CSSProperties = {
    padding: "6px 8px",
    border: "1px solid #4a4a4a",
    backgroundColor: "#2e2e2e",
    color: "#ddd",
    borderRadius: "4px",
    width: "100%",
    boxSizing: "border-box",
    fontSize: "0.9em",
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    marginBottom: "4px",
    fontSize: "0.85em",
    color: isDisabled ? "#777" : "#bbb",
    fontWeight: 500,
  };

  const settingItemStyle: React.CSSProperties = {
    marginBottom: "12px",
    paddingLeft: config.indent ? "20px" : "0px",
  };

  const checkboxLabelStyle: React.CSSProperties = {
    color: isDisabled ? "#777" : "#ddd",
    verticalAlign: "middle",
    fontSize: "0.9em",
    fontWeight: 500,
  };

  if (config.type === "boolean") {
    return (
      <div style={settingItemStyle}>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            cursor: isDisabled ? "not-allowed" : "pointer",
          }}
        >
          <input
            type="checkbox"
            id={config.id}
            checked={!!value}
            onChange={(e) => onChange(config.id, e.target.checked)}
            disabled={isDisabled}
            style={{ marginRight: "8px", accentColor: "#007bff" }}
          />
          <span style={checkboxLabelStyle}>{config.label}</span>
        </label>
      </div>
    );
  }

  if (config.type === "number") {
    const numConfig = config as NumberSettingConfig;
    return (
      <div style={settingItemStyle}>
        <label htmlFor={config.id} style={labelStyle}>
          {config.label}
        </label>
        <input
          type="number"
          id={config.id}
          value={String(value)} // Ensure value is string for input
          onChange={(e) => {
            const val =
              config.step && config.step < 1
                ? parseFloat(e.target.value)
                : parseInt(e.target.value, 10);
            onChange(config.id, isNaN(val) ? currentSettings[config.id] : val); // Prevent NaN update
          }}
          min={numConfig.min}
          max={numConfig.max}
          step={numConfig.step}
          disabled={isDisabled}
          style={{
            ...commonInputStyle,
            backgroundColor: isDisabled ? "#383838" : "#2e2e2e",
          }}
        />
      </div>
    );
  }

  if (config.type === "select") {
    const selectConfig = config as SelectSettingConfig<string>;
    return (
      <div style={settingItemStyle}>
        <label htmlFor={config.id} style={labelStyle}>
          {config.label}
        </label>
        <select
          id={config.id}
          value={value as string}
          onChange={(e) => onChange(config.id, e.target.value)}
          disabled={isDisabled}
          style={{
            ...commonInputStyle,
            backgroundColor: isDisabled ? "#383838" : "#2e2e2e",
          }}
        >
          {selectConfig.options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return null;
};

export default SettingsControl;
