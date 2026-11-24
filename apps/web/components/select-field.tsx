import { useId } from "react";
import { Label } from "@/components/ui/label";

/** Desplegable nativo (accesible por teclado y lector de pantalla) con etiqueta visible. */
export function SelectField<Value extends string>({
  name,
  label,
  defaultValue,
  options,
}: {
  readonly name: string;
  readonly label: string;
  readonly defaultValue: Value;
  readonly options: readonly { readonly value: Value; readonly label: string }[];
}) {
  const id = useId();
  return (
    <div className="grid min-w-0 gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        name={name}
        defaultValue={defaultValue}
        className="h-8 w-full min-w-0 max-w-full truncate rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
