import type {
  ChangeEvent, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes,
} from 'react';
import { useId, useState } from 'react';
import { IconAlert, IconEye, IconEyeOff, IconSearch } from '../icons';

/* ============================================================
   Field — the label/hint/error frame every control sits in.
   A label is always rendered; placeholders never stand in for one.
   ============================================================ */
export function Field({
  label, hint, error, optional, required, htmlFor, children, className = '',
}: {
  label: string; hint?: ReactNode; error?: string;
  optional?: boolean; required?: boolean; htmlFor?: string;
  children: ReactNode; className?: string;
}) {
  return (
    <div className={`field ${className}`.trim()}>
      <label className="field-label" htmlFor={htmlFor}>
        {label}
        {required && <span className="field-required" aria-hidden="true">*</span>}
        {optional && <span className="field-optional">Optional</span>}
      </label>
      {children}
      {hint && !error && <span className="field-hint">{hint}</span>}
      {error && (
        <span className="field-error" role="alert">
          <IconAlert size={13} />{error}
        </span>
      )}
    </div>
  );
}

/** Field + input in one call, with the id wiring done for you. */
export function TextField({
  label, hint, error, optional, required, className, ...rest
}: {
  label: string; hint?: ReactNode; error?: string; optional?: boolean;
} & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <Field label={label} hint={hint} error={error} optional={optional} required={required} htmlFor={id} className={className}>
      <Input id={id} aria-invalid={error ? true : undefined} required={required} {...rest} />
    </Field>
  );
}

export function Input({ className = '', type = 'text', ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input type={type} className={`input ${className}`.trim()} {...rest} />;
}

/**
 * Pulls a typed value back inside [min, max] before anyone reads it.
 * The native `min`/`max` attributes only complain at submit; this
 * rewrites the field as the person types, so "500" in a field capped at
 * 50 becomes 50 on the third keystroke. Whole numbers only.
 */
function clampNumberInput(el: HTMLInputElement, min?: number, max?: number, step = 1) {
  if (el.value === '') return;
  const n = Number(el.value);
  if (Number.isNaN(n)) { el.value = ''; return; }
  const lo = min ?? Number.NEGATIVE_INFINITY;
  const hi = max ?? Number.POSITIVE_INFINITY;
  // Whole numbers unless the caller allows a finer step (half marks, say).
  const snapped = Number.isInteger(step) ? Math.trunc(n) : Math.round(n / step) * step;
  const bounded = Math.min(hi, Math.max(lo, snapped));
  if (bounded !== n) el.value = String(bounded);
}

type NumberInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'min' | 'max' | 'step'> & {
  min?: number; max?: number; step?: number;
};

/** Bare number input that cannot hold a value outside [min, max]. */
export function NumberInput({ min, max, step = 1, onChange, onBlur, ...rest }: NumberInputProps) {
  return (
    <Input
      type="number" inputMode={Number.isInteger(step) ? 'numeric' : 'decimal'} step={step} min={min} max={max}
      onChange={(e: ChangeEvent<HTMLInputElement>) => { clampNumberInput(e.target, min, max, step); onChange?.(e); }}
      onBlur={(e) => { clampNumberInput(e.currentTarget, min, max, step); onBlur?.(e); }}
      {...rest}
    />
  );
}

/** Labelled number input with the same hard bounds. */
export function NumberField({
  label, hint, error, optional, required, className, min, max, onChange, onBlur, ...rest
}: {
  label: string; hint?: ReactNode; error?: string; optional?: boolean;
} & NumberInputProps) {
  const id = useId();
  return (
    <Field label={label} hint={hint} error={error} optional={optional} required={required} htmlFor={id} className={className}>
      <NumberInput
        id={id} aria-invalid={error ? true : undefined} required={required}
        min={min} max={max} onChange={onChange} onBlur={onBlur} {...rest}
      />
    </Field>
  );
}

export function Textarea({ className = '', ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`textarea ${className}`.trim()} {...rest} />;
}

/** Field + textarea, for anything entered one item per line. */
export function TextareaField({
  label, hint, error, optional, required, className, rows = 4, ...rest
}: {
  label: string; hint?: ReactNode; error?: string; optional?: boolean;
} & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  return (
    <Field label={label} hint={hint} error={error} optional={optional} required={required} htmlFor={id} className={className}>
      <Textarea id={id} rows={rows} aria-invalid={error ? true : undefined} required={required} {...rest} />
    </Field>
  );
}

export function Select({ className = '', children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`select ${className}`.trim()} {...rest}>{children}</select>;
}

export function SelectField({
  label, hint, error, optional, required, className, children, ...rest
}: {
  label: string; hint?: ReactNode; error?: string; optional?: boolean; children: ReactNode;
} & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  return (
    <Field label={label} hint={hint} error={error} optional={optional} required={required} htmlFor={id} className={className}>
      <Select id={id} aria-invalid={error ? true : undefined} required={required} {...rest}>{children}</Select>
    </Field>
  );
}

/* ============================================================
   Search — a labelled input that looks like a search field
   ============================================================ */
export function SearchInput({
  label = 'Search', value, onValueChange, placeholder = 'Search…', className = '', ...rest
}: {
  label?: string; onValueChange: (v: string) => void;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'>) {
  return (
    <div className={`input-wrap ${className}`.trim()}>
      <span className="input-icon"><IconSearch size={15} /></span>
      <input
        type="search"
        className="input"
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        {...rest}
      />
    </div>
  );
}

/* ============================================================
   Password — reveal control sits inside the field, not beside it
   ============================================================ */
export function PasswordField({
  label, hint, error, required, ...rest
}: {
  label: string; hint?: ReactNode; error?: string;
} & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  const [show, setShow] = useState(false);
  return (
    <Field label={label} hint={hint} error={error} required={required} htmlFor={id}>
      <div className="input-wrap input-wrap-plain">
        <input
          id={id}
          type={show ? 'text' : 'password'}
          className="input"
          aria-invalid={error ? true : undefined}
          required={required}
          {...rest}
        />
        <button
          type="button"
          className="input-affix"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? 'Hide password' : 'Show password'}
        >
          {show ? <IconEyeOff size={16} /> : <IconEye size={16} />}
        </button>
      </div>
    </Field>
  );
}

/* ============================================================
   Checkbox
   ============================================================ */
export function Checkbox({
  label, description, className = '', ...rest
}: { label?: ReactNode; description?: ReactNode } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={`check ${className}`.trim()}>
      <input type="checkbox" {...rest} />
      {(label || description) && (
        <span>
          {label}
          {description && <span className="field-hint" style={{ display: 'block' }}>{description}</span>}
        </span>
      )}
    </label>
  );
}

/* ============================================================
   Segmented control — mutually exclusive choices, 2–4 options
   ============================================================ */
export function Segmented<T extends string>({
  value, onChange, options, block, label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
  block?: boolean;
  label: string;
}) {
  return (
    <div className={`segmented ${block ? 'segmented-block' : ''}`.trim()} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
