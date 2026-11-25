import { useId } from "react";
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
}: {
  readonly name: string;
  readonly label: string;
  readonly defaultValue: Value | "";
  readonly options: readonly { readonly value: Value; readonly label: string }[];
  readonly placeholder?: string;
  readonly error?: string | undefined;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div className="grid min-w-0 gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        name={name}
        defaultValue={defaultValue}
        required={placeholder !== undefined}
        aria-invalid={error === undefined ? undefined : true}
        aria-describedby={error === undefined ? undefined : errorId}
        className="h-10 w-full min-w-0 max-w-full truncate rounded-md border border-input bg-card px-3 text-base md:text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive"
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
      {error === undefined ? null : (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
