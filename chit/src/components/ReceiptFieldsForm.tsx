import { SAFE_NOTES, SCAN_CATEGORIES, type ReceiptFields } from "../lib/receipt.js";

interface ReceiptFieldsFormProps {
  value: ReceiptFields;
  onChange: (receipt: ReceiptFields) => void;
  disabled?: boolean;
  editing?: boolean;
  original?: ReceiptFields;
  idPrefix: string;
}

export function ReceiptFieldsForm({ value, onChange, disabled = false, editing = false, original, idPrefix }: ReceiptFieldsFormProps): JSX.Element {
  const update = (key: keyof ReceiptFields, text: string): void => onChange({ ...value, [key]: text });
  const modified = (key: keyof ReceiptFields): boolean => !!(editing && original && value[key] !== original[key]);
  const fieldClass = (key: keyof ReceiptFields): string => `field${modified(key) ? " field-modified" : ""}`;
  const editTag = (key: keyof ReceiptFields): JSX.Element | null => modified(key) ? <span className="field-tag modified-tag">EDITED</span> : null;

  return <fieldset className="receipt-fields" disabled={disabled}>
    <legend className="sr-only">The five non-identifying receipt fields</legend>
    <div className={fieldClass("receiptCode")}>
      <label htmlFor={`${idPrefix}-code`}>Receipt code {editTag("receiptCode")}<span className="field-tag">{editing ? "local copy" : "generated serial"}</span></label>
      <input id={`${idPrefix}-code`} name="receiptCode" value={value.receiptCode} onChange={(event) => update("receiptCode", event.target.value.toUpperCase())} readOnly={!editing} maxLength={12} pattern="CHT-[A-Z0-9]{4,8}" required autoComplete="off" spellCheck={false} className="code-input" aria-describedby={`${idPrefix}-code-help`} />
      <small id={`${idPrefix}-code-help`}>Recovery serial only. Never a patient identifier.</small>
    </div>
    <div className={fieldClass("scanCategory")}>
      <label htmlFor={`${idPrefix}-category`}>Scan category {editTag("scanCategory")}</label>
      <select id={`${idPrefix}-category`} name="scanCategory" value={value.scanCategory} onChange={(event) => update("scanCategory", event.target.value)} required>
        {SCAN_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
      </select>
    </div>
    <div className="field-row">
      <div className={fieldClass("visitDate")}>
        <label htmlFor={`${idPrefix}-date`}>Visit date {editTag("visitDate")}</label>
        <input id={`${idPrefix}-date`} name="visitDate" type="date" min="1900-01-01" max="2100-12-31" value={value.visitDate} onChange={(event) => update("visitDate", event.target.value)} required />
      </div>
      <div className={fieldClass("facilityTag")}>
        <label htmlFor={`${idPrefix}-facility`}>Facility tag {editTag("facilityTag")}</label>
        <input id={`${idPrefix}-facility`} name="facilityTag" placeholder="CLINIC-A" value={value.facilityTag} onChange={(event) => update("facilityTag", event.target.value.toUpperCase())} required maxLength={16} autoComplete="off" spellCheck={false} aria-describedby={`${idPrefix}-facility-help`} className="mono-input" />
        <small id={`${idPrefix}-facility-help`}>Generic clinic code only. Never encode a name, patient ID, or phone number.</small>
      </div>
    </div>
    <div className={fieldClass("note")}>
      <label htmlFor={`${idPrefix}-note`}>Anatomic view / visit context {editTag("note")}<span className="field-tag">optional note</span></label>
      <select id={`${idPrefix}-note`} name="note" value={value.note} onChange={(event) => update("note", event.target.value)}>
        {SAFE_NOTES.map((note) => <option key={note} value={note}>{note || "None / not specified"}</option>)}
      </select>
      <small>Predefined, generic descriptors only. No free text, patient names, diagnoses, images, or phone numbers.</small>
    </div>
  </fieldset>;
}
