import { useState, useEffect, useRef } from "react";

/**
 * Number input that:
 *  - shows empty when value is 0 (so user can type freely)
 *  - selects-all on focus so typing replaces existing value
 *  - emits a number via onChange(number)
 */
export default function NumberInput({ value, onChange, className = "", step = "0.01", min, ...props }) {
  const [text, setText] = useState(value === 0 || value == null ? "" : String(value));
  const lastEmitted = useRef(value);

  useEffect(() => {
    if (value !== lastEmitted.current) {
      setText(value === 0 || value == null ? "" : String(value));
      lastEmitted.current = value;
    }
  }, [value]);

  const handleChange = (e) => {
    const raw = e.target.value;
    setText(raw);
    if (raw === "" || raw === "-") {
      lastEmitted.current = 0;
      onChange(0);
      return;
    }
    const n = parseFloat(raw);
    if (!isNaN(n)) {
      lastEmitted.current = n;
      onChange(n);
    }
  };

  return (
    <input
      {...props}
      type="number"
      step={step}
      min={min}
      value={text}
      onChange={handleChange}
      onFocus={(e) => e.target.select()}
      className={`crafteria-input ${className}`}
    />
  );
}
