import { useState } from "react";
import { AlertTriangle, Check } from "lucide-react";
import { Modal, Btn, Field, Input, Toast } from "./ui-atoms.jsx";

function NameModal({ title, fields, initial, onClose, onSave }) {
  // fields: [{key,label,hint,type,required,placeholder}]
  const [vals, setVals] = useState(() => {
    const v = {};
    fields.forEach(f => v[f.key] = initial?.[f.key] ?? "");
    return v;
  });
  const [error, setError] = useState("");
  const [missingKey, setMissingKey] = useState(null);

  // Driven by a plain button onClick rather than <form onSubmit> — the
  // claude.ai artifact sandbox does not reliably fire native form submission,
  // even though the click event itself reaches the button. onClick is the
  // one path confirmed to work everywhere.
  const handleSave = () => {
    for (const f of fields) {
      if (f.required && !String(vals[f.key]).trim()) {
        setError(`${f.label} is required.`);
        setMissingKey(f.key);
        return;
      }
    }
    setError("");
    setMissingKey(null);
    onSave(vals);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") { e.preventDefault(); handleSave(); }
  };

  return (
    <Modal title={title} onClose={onClose} width={440}>
      <Toast message={error} onDismiss={() => setError("")} />
      <div onKeyDown={handleKeyDown}>
        {error && (
          <div style={{
            display: "flex", gap: 9, alignItems: "flex-start", background: "var(--pill-expense-bg)",
            color: "var(--expense)", border: "1px solid var(--expense-line)", borderRadius: 9,
            padding: "11px 14px", fontSize: 13.5, fontWeight: 600, marginBottom: 16
          }}>
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} /> {error}
          </div>
        )}
        {fields.map((f, i) => (
          <Field key={f.key} label={f.required ? `${f.label} *` : f.label} hint={f.hint}>
            <Input autoFocus={i === 0} type={f.type || "text"} value={vals[f.key]}
              onChange={e => { setVals(v => ({ ...v, [f.key]: e.target.value })); if (missingKey === f.key) setMissingKey(null); }}
              placeholder={f.placeholder}
              style={missingKey === f.key ? { borderColor: "var(--expense)", background: "var(--pill-expense-bg)" } : {}} />
          </Field>
        ))}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn icon={Check} onClick={handleSave}>Save</Btn>
        </div>
      </div>
    </Modal>
  );
}

export { NameModal };
