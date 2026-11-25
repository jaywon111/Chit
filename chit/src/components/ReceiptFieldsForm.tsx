import { SAFE_NOTES, SCAN_CATEGORIES, type ReceiptFields } from "../lib/receipt.js";

export function ReceiptFieldsForm({ value, onChange, disabled = false, editing = false, idPrefix }: { value: ReceiptFields; onChange: (receipt: ReceiptFields) => void; disabled?: boolean; editing?: boolean; idPrefix: string }): JSX.Element {
  const update = (key: keyof ReceiptFields, text: string): void => onChange({ ...value, [key]: text });
  return <fieldset className="receipt-fields" disabled={disabled}>
    <legend className="sr-only">Non-identifying receipt fields</legend>
    <div className="field">
      <label htmlFor={`${idPrefix}-code`}>Receipt code <span className="field-tag">{editing ? "editable" : "auto-generated"}</span></label>
      <input id={`${idPrefix}-code`} name="receiptCode" value={value.receiptCode} onChange={(event) => update("receiptCode", event.target.value.toUpperCase())} readOnly={!editing} maxLength={12} pattern="CHT-[A-Z0-9]{4,8}" required autoComplete="off" spellCheck={false} className="code-input" aria-describedby={`${idPrefix}-code-help`} />
      <small id={`${idPrefix}-code-help`}>A recovery code, never a patient identifier.</small>
    </div>
    <div className="field">
      <label htmlFor={`${idPrefix}-category`}>Scan category</label>
      <select id={`${idPrefix}-category`} name="scanCategory" value={value.scanCategory} onChange={(event) => update("scanCategory", event.target.value)} required>
        {SCAN_CATEGORIES.map((category) => <option key={category}>{category}</option>)}
      </select>
    </div>
    <div className="field-row">
      <div className="field">
        <label htmlFor={`${idPrefix}-date`}>Visit date</label>
        <input id={`${idPrefix}-date`} name="visitDate" type="date" min="1900-01-01" max="2100-12-31" value={value.visitDate} onChange={(event) => update("visitDate", event.target.value)} required />
      </div>
      <div className="field">
        <label htmlFor={`${idPrefix}-facility`}>Facility tag</label>
        <input id={`${idPrefix}-facility`} name="facilityTag" placeholder="CLINIC-A" value={value.facilityTag} onChange={(event) => update("facilityTag", event.target.value.toUpperCase())} required maxLength={16} autoComplete="off" spellCheck={false} aria-describedby={`${idPrefix}-facility-help`} />
        <small id={`${idPrefix}-facility-help`}>Generic clinic code only.</small>
      </div>
    </div>
    <div className="field">
      <label htmlFor={`${idPrefix}-note`}>Visit note <span className="field-tag">optional</span></label>
      <select id={`${idPrefix}-note`} name="note" value={value.note} onChange={(event) => update("note", event.target.value)}>
        {SAFE_NOTES.map((note) => <option key={note} value={note}>{note || "No note"}</option>)}
      </select>
      <small>Predefined notes only. No names, diagnoses, images, or phone numbers.</small>
    </div>
  </fieldset>;
}
