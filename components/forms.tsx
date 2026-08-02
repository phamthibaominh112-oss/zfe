import type { ReactNode } from "react";

export function Field({ label, name, type = "text", required = false, defaultValue, placeholder, min, max, step }: { label: string; name: string; type?: string; required?: boolean; defaultValue?: string | number; placeholder?: string; min?: string | number; max?: string | number; step?: string | number }) {
  return <label className="form-group"><span>{label}</span><input className="input" name={name} type={type} required={required} defaultValue={defaultValue} placeholder={placeholder} min={min} max={max} step={step} /></label>;
}

export function SelectField({ label, name, options, required = false, defaultValue }: { label: string; name: string; options: Array<{ value: string; label: string }>; required?: boolean; defaultValue?: string }) {
  return <label className="form-group"><span>{label}</span><select className="select input" name={name} required={required} defaultValue={defaultValue}><option value="">Chọn...</option>{options.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label>;
}

export function TextAreaField({ label, name, required = false, defaultValue, placeholder }: { label: string; name: string; required?: boolean; defaultValue?: string; placeholder?: string }) {
  return <label className="form-group form-span-2"><span>{label}</span><textarea className="textarea" name={name} required={required} defaultValue={defaultValue} placeholder={placeholder} /></label>;
}

export function FormGrid({ children }: { children: ReactNode }) {
  return <div className="form-grid">{children}</div>;
}
