import { useId } from "react";
import { FIELD_WIDTHS, FieldError, type FieldWidth } from "@/components/form";
import { Label } from "@/components/ui/label";

/**
 * Desplegable nativo (accesible por teclado y lector de pantalla) con etiqueta visible. Con `placeholder`, la
 * primera opción está vacía y elegir es obligatorio (para decisiones que no deben tener un valor por defecto).
 */
export function SelectField<Value extends string>({
  name,
  label,
  defaultValue,
  options,
  placeholder,
  error,
  width = "full",
}: {
  readonly name: string;
  readonly label: string;
  readonly defaultValue: Value | "";
  readonly options: readonly { readonly value: Value; readonly label: string }[];
  readonly placeholder?: string;
  readonly error?: string | undefined;
  readonly width?: FieldWidth;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div className={`grid min-w-0 content-start gap-1.5 ${FIELD_WIDTHS[width]}`}>
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        name={name}
        defaultValue={defaultValue}
        required={placeholder !== undefined}
        aria-invalid={error === undefined ? undefined : true}
        aria-describedby={error === undefined ? undefined : errorId}
        className="field field-select"
      >
        {placeholder === undefined ? null : (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <FieldError id={errorId} error={error} />
    </div>
  );
}
