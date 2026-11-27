"use client";
// Piezas de formulario con estado: lo opcional plegado (para no abrumar) y la contraseña que se puede ver.
import { ChevronDown, Eye, EyeOff, Plus } from "lucide-react";
import { useId, useState, type ComponentProps, type ReactNode } from "react";
import { describedBy, FieldCell } from "@/components/form";

/**
 * Campos opcionales plegados tras un botón («+ Añadir dirección»): a la vista solo lo imprescindible.
 * Plegados siguen en el formulario y se envían. Se abren solos si ya tienen algo (`defaultOpen`) o si alguno
 * tiene un error (`forceOpen`): nunca se esconde un error ni un dato ya escrito.
 */
export function MoreFields({
  label,
  hint,
  summary,
  defaultOpen = false,
  forceOpen = false,
  children,
}: {
  /** Qué hay plegado, en minúscula: «dirección», «retención IRPF u observaciones». */
  readonly label: string;
  /** Aclaración junto al botón mientras está plegado, p. ej. «necesaria si es una empresa». */
  readonly hint?: string;
  /** Qué hay ya, en una línea, cuando está plegado (p. ej. «IVA 21 % · sin descuento»). */
  readonly summary?: string;
  readonly defaultOpen?: boolean;
  readonly forceOpen?: boolean;
  readonly children: ReactNode;
}) {
  const [toggled, setToggled] = useState<boolean | null>(null);
  const open = forceOpen || (toggled ?? defaultOpen);
  const contentId = useId();
  return (
    <div className="grid gap-3">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setToggled(!open)}
        className="flex min-h-11 items-center gap-2 justify-self-start rounded-lg px-1 text-left text-sm font-semibold text-primary hover:underline hover:underline-offset-4"
      >
        {open ? <ChevronDown aria-hidden="true" className="size-4 shrink-0 rotate-180" /> : <Plus aria-hidden="true" className="size-4 shrink-0" />}
        <span>
          {open ? `Ocultar ${label}` : `Añadir ${label}`}
          {!open && hint !== undefined ? <span className="font-normal text-muted-foreground"> ({hint})</span> : null}
          {!open && summary !== undefined ? <span className="font-normal text-muted-foreground"> · {summary}</span> : null}
        </span>
      </button>
      <div id={contentId} hidden={!open} className="grid gap-3">
        {children}
      </div>
    </div>
  );
}

interface PasswordFieldProps extends Omit<ComponentProps<"input">, "id" | "name" | "type"> {
  readonly name: string;
  readonly label: string;
  readonly hint?: string;
  readonly error?: string | undefined;
}

/** Contraseña con «Mostrar»: en el móvil es fácil equivocarse al escribirla sin verla. */
export function PasswordField({ name, label, hint, error, ...input }: PasswordFieldProps) {
  const id = `campo-${name}-${useId()}`;
  const [visible, setVisible] = useState(false);
  return (
    <FieldCell id={id} label={label} hint={hint} error={error}>
      <span className="relative z-[2] flex items-center gap-2">
        <input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          className="field-cell-input"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={error === undefined ? undefined : true}
          aria-describedby={describedBy(id, hint, error)}
          {...input}
        />
        <button
          type="button"
          onClick={() => setVisible(!visible)}
          aria-pressed={visible}
          aria-label={visible ? "Ocultar lo escrito" : "Ver lo escrito"}
          className="-my-2 -mr-2 grid size-10 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-black/[0.04] hover:text-foreground"
        >
          {visible ? <EyeOff aria-hidden="true" className="size-5" /> : <Eye aria-hidden="true" className="size-5" />}
        </button>
      </span>
    </FieldCell>
  );
}
