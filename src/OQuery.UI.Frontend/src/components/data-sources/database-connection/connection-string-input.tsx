import { useState } from "react";
import Icon from "../../shared/icon/icon";
import "./connection-string-input.css";

type ConnectionStringInputProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
};

// Masked by default. The eye button shows the raw text while the user checks what they typed.
export default function ConnectionStringInput({ value, onChange, placeholder, required, disabled }: ConnectionStringInputProps) {
  const [visible, setVisible] = useState(false);
  return (
    <span className="connection-string-field">
      <input
        type={visible ? "text" : "password"}
        autoComplete="new-password"
        spellCheck={false}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
      />
      <button
        type="button"
        className="connection-string-toggle"
        aria-label={visible ? "Hide connection string" : "Show connection string"}
        aria-pressed={visible}
        title={visible ? "Hide connection string" : "Show connection string"}
        onClick={() => setVisible((current) => !current)}
        disabled={disabled}
      >
        <Icon name={visible ? "eye-off" : "eye"} size={16} />
      </button>
    </span>
  );
}
