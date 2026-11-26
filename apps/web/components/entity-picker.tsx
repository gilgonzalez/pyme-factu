"use client";
// Buscador para elegir un elemento existente (cliente, producto…) o crear uno nuevo desde el propio campo.
// Patrón combobox de ARIA 1.2 con lista emergente: se escribe para filtrar, flechas para moverse, Intro para
// elegir y Escape para cerrar. La búsqueda ignora mayúsculas y tildes y admite varias palabras en cualquier orden.
import { Plus } from "lucide-react";
import { useId, useState, type KeyboardEvent } from "react";
import { FieldError } from "@/components/form";
import { cn } from "@/lib/utils";

/** "Fontanería  Pérez" → "fontaneria perez". */
const normalize = (text: string): string =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/** Cada palabra de la búsqueda aparece en el texto del elemento (en cualquier orden). */
export function matchesSearch(query: string, text: string): boolean {
  const haystack = normalize(text);
  return normalize(query)
    .split(" ")
    .every((term) => haystack.includes(term));
}

const MAX_RESULTS = 50;

export interface EntityPickerProps<Item> {
  readonly label: string;
  readonly items: readonly Item[];
  readonly itemKey: (item: Item) => string;
  /** Texto principal de cada opción (y del campo cuando está elegida). */
  readonly itemLabel: (item: Item) => string;
  /** Texto secundario (NIF, precio…); también se busca en él. */
  readonly itemDetail?: (item: Item) => string;
  /** Clave del elemento elegido; null si no hay ninguno (o si el campo se vacía al elegir). */
  readonly selectedKey: string | null;
  readonly onSelect: (item: Item) => void;
  readonly placeholder: string;
  /** Opción «Crear…» al final de la lista; sin ella no se puede crear desde aquí. */
  readonly create?: { readonly label: (query: string) => string; readonly onCreate: (query: string) => void };
  readonly noResults: string;
  readonly error?: string | undefined;
}

type Option<Item> = { readonly kind: "item"; readonly item: Item } | { readonly kind: "create" };

export function EntityPicker<Item>({
  label,
  items,
  itemKey,
  itemLabel,
  itemDetail = () => "",
  selectedKey,
  onSelect,
  placeholder,
  create,
  noResults,
  error,
}: EntityPickerProps<Item>) {
  const id = useId();
  const listId = `${id}-opciones`;
  const errorId = `${id}-error`;
  const selected = selectedKey === null ? undefined : items.find((item) => itemKey(item) === selectedKey);
  const selectedText = selected === undefined ? "" : itemLabel(selected);
  // null: no se está escribiendo (el campo muestra lo elegido).
  const [query, setQuery] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const search = query ?? "";
  const matches = items.filter((item) => matchesSearch(search, `${itemLabel(item)} ${itemDetail(item)}`)).slice(0, MAX_RESULTS);
  const options: Option<Item>[] = [...matches.map((item) => ({ kind: "item" as const, item })), ...(create === undefined ? [] : [{ kind: "create" as const }])];
  const optionId = (index: number): string => `${id}-opcion-${String(index)}`;

  const close = (): void => {
    setOpen(false);
    setQuery(null);
  };

  const choose = (option: Option<Item> | undefined): void => {
    if (option === undefined) return;
    if (option.kind === "item") onSelect(option.item);
    else create?.onCreate(search.trim());
    close();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        setActive(0);
        return;
      }
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((current) => (options.length === 0 ? 0 : (current + step + options.length) % options.length));
    } else if (event.key === "Enter" && open) {
      // Intro elige la opción activa en vez de enviar el formulario de la factura.
      event.preventDefault();
      choose(options[active]);
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      close();
    }
  };

  return (
    <div className="field-cell" data-invalid={error === undefined ? undefined : true}>
      <label htmlFor={id} className="text-xs leading-none font-medium text-muted-foreground select-none">
        {label}
      </label>
      <input
        id={id}
        type="text"
        role="combobox"
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && options.length > 0 ? optionId(active) : undefined}
        aria-invalid={error === undefined ? undefined : true}
        aria-describedby={error === undefined ? undefined : errorId}
        placeholder={placeholder}
        value={query ?? selectedText}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={(event) => {
          event.target.select();
          setOpen(true);
          setActive(0);
        }}
        onClick={() => setOpen(true)}
        onBlur={close}
        onKeyDown={onKeyDown}
        className="field-cell-input"
      />
      {open ? (
        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          className="absolute top-full -right-px -left-px z-30 mt-1.5 max-h-72 overflow-y-auto rounded-xl border bg-card p-1 shadow-[0_12px_32px_-8px_rgb(16_16_32/0.18),0_2px_6px_rgb(16_16_32/0.06)]"
          // Que pulsar una opción no quite el foco del campo (si no, el blur cerraría la lista antes del clic).
          onMouseDown={(event) => event.preventDefault()}
        >
          {matches.length === 0 ? <li className="px-3 py-2 text-sm text-muted-foreground">{noResults}</li> : null}
          {options.map((option, index) => {
            const isActive = index === active;
            if (option.kind === "create") {
              return (
                <li
                  key="crear"
                  id={optionId(index)}
                  role="option"
                  aria-selected={isActive}
                  onClick={() => choose(option)}
                  onMouseMove={() => setActive(index)}
                  className={cn("mt-1 flex cursor-pointer items-center gap-2 rounded-md border-t px-3 py-2 text-sm font-semibold text-primary", isActive && "bg-accent")}
                >
                  <Plus aria-hidden="true" className="size-4" />
                  {create?.label(search.trim())}
                </li>
              );
            }
            const key = itemKey(option.item);
            const detail = itemDetail(option.item);
            return (
              <li
                key={key}
                id={optionId(index)}
                role="option"
                aria-selected={isActive}
                onClick={() => choose(option)}
                onMouseMove={() => setActive(index)}
                className={cn("flex cursor-pointer items-baseline justify-between gap-3 rounded-md px-3 py-2 text-sm", isActive && "bg-accent text-accent-foreground")}
              >
                <span className={cn("truncate", key === selectedKey && "font-semibold")}>{itemLabel(option.item)}</span>
                {detail === "" ? null : <span className="figures shrink-0 text-xs text-muted-foreground">{detail}</span>}
              </li>
            );
          })}
        </ul>
      ) : null}
      <FieldError id={errorId} error={error} />
    </div>
  );
}
