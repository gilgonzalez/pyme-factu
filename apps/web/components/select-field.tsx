import { useId } from "react";
import { FieldCell, type FieldWidth } from "@/components/form";

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
    <FieldCell id={id} label={label} error={error} width={width}>
      <select
        id={id}
        name={name}
        defaultValue={defaultValue}
        required={placeholder !== undefined}
        aria-invalid={error === undefined ? undefined : true}
        aria-describedby={error === undefined ? undefined : errorId}
        className="field-cell-input"
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
    </FieldCell>
  );
}
