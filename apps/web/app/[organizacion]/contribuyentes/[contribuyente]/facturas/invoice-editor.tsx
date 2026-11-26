"use client";
// Editor de borradores: cliente y productos con buscador (y alta sin salir de la factura), líneas dinámicas y totales en vivo calculados
// con el MISMO fiscal-core que usa el servidor (lo que se ve es exactamente lo que se guardará).
import {
  calculateInvoice,
  formatAmount,
  parseDecimal,
  parseInvoiceLine,
  SCALE,
  type ParsedLine,
} from "@facturalibre/fiscal-core";
import Link from "next/link";
import { useId, useState, type ReactNode } from "react";
import { ActionForm, type FormAction } from "@/components/action-form";
import { EntityPicker } from "@/components/entity-picker";
import { Modal } from "@/components/modal";
import { PartyForm } from "@/components/party-form";
import { Field, FormAlert } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { TAX_OPTIONS, taxLabel } from "@/lib/invoicing";
import type { CreatedResult } from "../catalog-actions";
import { ProductForm } from "../productos/product-form";

export interface EditorLine {
  readonly description: string;
  readonly quantity: string;
  readonly unitPrice: string;
  readonly discountPercent: string;
  readonly tax: string;
}

export interface EditorCustomer {
  readonly id: string;
  readonly legalName: string;
  readonly nif: string | null;
  readonly equivalenceSurcharge: boolean;
}

export interface EditorProduct {
  readonly id: string;
  readonly name: string;
  /** Precio ya formateado ("35,5"). */
  readonly unitPrice: string;
  readonly taxKey: string;
}

export interface InvoiceEditorProps {
  readonly action: FormAction;
  readonly customers: readonly EditorCustomer[];
  readonly products: readonly EditorProduct[];
  readonly initial: {
    readonly customerId: string;
    readonly withholdingPercent: string;
    readonly notes: string;
    readonly lines: readonly EditorLine[];
  };
  readonly newCustomerHref: string;
  /** IVA de las líneas nuevas (configuración de la empresa); por defecto, el 21 %. */
  readonly defaultTax?: string | undefined;
  /** Alta de cliente / producto desde el buscador; ausente si el rol no puede darlos de alta. */
  readonly createCustomer?:
    ((data: FormData) => Promise<CreatedResult<EditorCustomer>>) | undefined;
  readonly createProduct?:
    ((data: FormData) => Promise<CreatedResult<EditorProduct>>) | undefined;
  readonly rectification?: { readonly number: string; readonly reason: string };
}

const EMPTY_LINE: EditorLine = {
  description: "",
  quantity: "1",
  unitPrice: "",
  discountPercent: "",
  tax: "VAT:2100",
};
type KeyedLine = EditorLine & { readonly key: number };

const selectClass = "field field-select";

function useLines(initial: readonly EditorLine[], emptyLine: EditorLine) {
  const [nextKey, setNextKey] = useState(initial.length + 1);
  const [lines, setLines] = useState<KeyedLine[]>(() =>
    (initial.length === 0 ? [emptyLine] : initial).map((line, index) => ({
      ...line,
      key: index,
    })),
  );
  return {
    lines,
    add(line: EditorLine) {
      setLines((current) => [...current, { ...line, key: nextKey }]);
      setNextKey(nextKey + 1);
    },
    /** Añade la línea, o rellena la última si está sin empezar (la línea vacía con la que nace la factura). */
    addOrFill(line: EditorLine) {
      setLines((current) => {
        const last = current.at(-1);
        if (
          last !== undefined &&
          last.description === "" &&
          last.unitPrice === ""
        )
          return [...current.slice(0, -1), { ...line, key: last.key }];
        return [...current, { ...line, key: nextKey }];
      });
      setNextKey(nextKey + 1);
    },
    update(key: number, patch: Partial<EditorLine>) {
      setLines((current) =>
        current.map((line) =>
          line.key === key ? { ...line, ...patch } : line,
        ),
      );
    },
    remove(key: number) {
      setLines((current) => current.filter((line) => line.key !== key));
    },
  };
}

function LiveTotals({
  lines,
  surcharge,
  withholding,
  children,
}: {
  readonly lines: readonly EditorLine[];
  readonly surcharge: boolean;
  readonly withholding: string;
  readonly children: ReactNode;
}) {
  const parsed = lines.map((line) => parseInvoiceLine(line));
  const valid = parsed.flatMap((line): ParsedLine[] =>
    line.ok ? [line.value] : [],
  );
  const withholdingPercent = parseDecimal(
    withholding === "" ? "0" : withholding,
    SCALE.percent,
  );
  const totals = calculateInvoice({
    lines: valid,
    equivalenceSurcharge: surcharge,
    withholdingPercent: withholdingPercent.ok ? withholdingPercent.value : 0n,
  });
  return (
    <section
      aria-labelledby="totales"
      className="figures sticky bottom-0 z-10 -mx-5 -mb-5 grid gap-1 rounded-b-[14px] border-t bg-card/95 px-5 py-4 text-sm backdrop-blur sm:-mx-8 sm:-mb-8 sm:px-8"
    >
      <h2 id="totales" className="sr-only">
        Totales
      </h2>
      <div aria-live="polite" className="grid gap-1">
        {totals.breakdown.map((entry) => (
          <p
            key={entry.key}
            className="flex justify-between gap-4 text-muted-foreground"
          >
            <span>
              Base {taxLabel(entry.key)}: {formatAmount(entry.base)}
            </span>
            <span>
              Cuota {formatAmount(entry.quota)}
              {entry.surchargeQuota === 0n
                ? ""
                : ` + recargo ${formatAmount(entry.surchargeQuota)}`}
            </span>
          </p>
        ))}
        {totals.withholdingAmount === 0n ? null : (
          <p className="flex justify-between">
            Retención IRPF: −{formatAmount(totals.withholdingAmount)}
          </p>
        )}
        {valid.length < lines.length ? (
          <p className="text-muted-foreground">
            Las líneas incompletas no se suman hasta que estén bien.
          </p>
        ) : null}
      </div>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-baseline gap-3 text-xl font-bold">
          <span>Total</span>
          <span>{formatAmount(totals.total)}</span>
        </p>
        {children}
      </div>
    </section>
  );
}

/** Lo recibido del servidor más lo dado de alta aquí (sin repetir: tras el alta, la página también lo trae). */
const withCreated = <Item extends { readonly id: string }>(
  listed: readonly Item[],
  created: readonly Item[],
): Item[] => [
  ...listed,
  ...created.filter(
    (item) => !listed.some((candidate) => candidate.id === item.id),
  ),
];

/** Convierte un alta desde el editor en la acción de un formulario: si va bien, entrega el elemento creado. */
function creating<Item>(
  create: (data: FormData) => Promise<CreatedResult<Item>>,
  onCreated: (item: Item) => void,
): FormAction {
  return async (_previous, data) => {
    const result = await create(data);
    if (!result.ok)
      return {
        ok: false,
        message: result.message,
        ...(result.errors === undefined ? {} : { errors: result.errors }),
      };
    onCreated(result.item);
    return null;
  };
}

const productLine = (product: EditorProduct): EditorLine => ({
  description: product.name,
  quantity: "1",
  unitPrice: product.unitPrice,
  discountPercent: "",
  tax: product.taxKey,
});

type Creating = {
  readonly kind: "customer" | "product";
  readonly query: string;
} | null;

export function InvoiceEditor({
  action,
  customers: listedCustomers,
  products: listedProducts,
  initial,
  newCustomerHref,
  defaultTax,
  createCustomer,
  createProduct,
  rectification,
}: InvoiceEditorProps) {
  const ids = { notes: useId() };
  const emptyLine: EditorLine = {
    ...EMPTY_LINE,
    tax: defaultTax ?? EMPTY_LINE.tax,
  };
  const { lines, add, addOrFill, update, remove } = useLines(
    initial.lines,
    emptyLine,
  );
  const [customerId, setCustomerId] = useState(initial.customerId);
  const [withholding, setWithholding] = useState(initial.withholdingPercent);
  const [createdCustomers, setCreatedCustomers] = useState<EditorCustomer[]>(
    [],
  );
  const [createdProducts, setCreatedProducts] = useState<EditorProduct[]>([]);
  const [creatingNew, setCreatingNew] = useState<Creating>(null);
  const customers = withCreated(listedCustomers, createdCustomers);
  const products = withCreated(listedProducts, createdProducts);
  const surcharge =
    customers.find((customer) => customer.id === customerId)
      ?.equivalenceSurcharge ?? false;

  return (
    <ActionForm action={action} className="surface grid" label="Factura">
      {({ pending, errors }) => (
        <>
          <p className="rounded-t-[14px] border-b border-warning-ink/20 bg-warning-soft px-5 py-2 text-sm font-semibold text-warning-ink sm:px-8">
            Borrador: no tiene número ni validez fiscal hasta que lo emitas.
          </p>
          <div className="grid gap-7 p-5 sm:p-8">
            {rectification === undefined ? null : (
              <FormAlert tone="success">
                Rectificativa de la factura{" "}
                <strong>{rectification.number}</strong>. Motivo:{" "}
                {rectification.reason}. Las cantidades en negativo anulan lo
                facturado; ajústalas si solo corriges una parte.
              </FormAlert>
            )}
            <input type="hidden" name="customerId" value={customerId} />
            {customers.length === 0 && createCustomer === undefined ? (
              <div className="grid gap-1.5">
                <p className="text-sm font-medium">Cliente</p>
                <p className="text-sm">
                  Todavía no tienes clientes.{" "}
                  <Link
                    href={newCustomerHref}
                    className="font-semibold text-primary underline decoration-primary/30 underline-offset-4 hover:decoration-primary"
                  >
                    Da de alta el primero
                  </Link>
                  .
                </p>
                {errors["customerId"] === undefined ? null : (
                  <p className="text-sm text-destructive">
                    {errors["customerId"]}
                  </p>
                )}
              </div>
            ) : (
              <div className="max-w-xl">
                <EntityPicker
                  label="Cliente"
                  items={customers}
                  itemKey={(customer) => customer.id}
                  itemLabel={(customer) => customer.legalName}
                  itemDetail={(customer) => customer.nif ?? ""}
                  selectedKey={customerId === "" ? null : customerId}
                  onSelect={(customer) => setCustomerId(customer.id)}
                  placeholder="Busca por nombre o NIF…"
                  noResults={
                    customers.length === 0
                      ? "Todavía no tienes clientes."
                      : "Ningún cliente coincide."
                  }
                  error={errors["customerId"]}
                  {...(createCustomer === undefined
                    ? {}
                    : {
                        create: {
                          label: (query: string) =>
                            query === ""
                              ? "Nuevo cliente"
                              : `Crear cliente «${query}»`,
                          onCreate: (query: string) =>
                            setCreatingNew({ kind: "customer", query }),
                        },
                      })}
                />
              </div>
            )}

            <fieldset className="grid gap-3">
              <legend className="mb-1 font-semibold">Líneas</legend>
              {errors["lines"] === undefined ? null : (
                <p className="text-sm text-destructive">{errors["lines"]}</p>
              )}
              {lines.map((line, index) => {
                const name = (field: string) =>
                  `lines.${String(index)}.${field}`;
                return (
                  <div
                    key={line.key}
                    className="grid grid-cols-2 gap-3 border-b pb-4 sm:grid-cols-4 lg:grid-cols-[minmax(0,1fr)_5.5rem_7.5rem_5rem_11.5rem_auto] lg:items-end [&>*:first-child]:col-span-full lg:[&>*:first-child]:col-span-1"
                    role="group"
                    aria-label={`Línea ${String(index + 1)}`}
                  >
                    <Field
                      name={name("description")}
                      label="Descripción"
                      value={line.description}
                      onChange={(event) =>
                        update(line.key, { description: event.target.value })
                      }
                      error={errors[name("description")]}
                    />
                    <Field
                      name={name("quantity")}
                      label="Cantidad"
                      inputMode="decimal"
                      value={line.quantity}
                      onChange={(event) =>
                        update(line.key, { quantity: event.target.value })
                      }
                      error={errors[name("quantity")]}
                    />
                    <Field
                      name={name("unitPrice")}
                      label="Precio (€)"
                      inputMode="decimal"
                      value={line.unitPrice}
                      onChange={(event) =>
                        update(line.key, { unitPrice: event.target.value })
                      }
                      error={errors[name("unitPrice")]}
                    />
                    <Field
                      name={name("discountPercent")}
                      label="Dto. %"
                      inputMode="decimal"
                      value={line.discountPercent}
                      onChange={(event) =>
                        update(line.key, {
                          discountPercent: event.target.value,
                        })
                      }
                      error={errors[name("discountPercent")]}
                    />
                    <div className="grid gap-1.5">
                      <Label htmlFor={`impuesto-${String(line.key)}`}>
                        IVA
                      </Label>
                      <select
                        id={`impuesto-${String(line.key)}`}
                        name={name("tax")}
                        value={line.tax}
                        onChange={(event) =>
                          update(line.key, { tax: event.target.value })
                        }
                        className={selectClass}
                      >
                        {TAX_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => remove(line.key)}
                      disabled={lines.length === 1}
                      aria-label={`Quitar la línea ${String(index + 1)}`}
                    >
                      Quitar
                    </Button>
                  </div>
                );
              })}
              <div className="flex flex-wrap items-end gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => add(emptyLine)}
                >
                  Añadir línea
                </Button>
                {products.length === 0 && createProduct === undefined ? null : (
                  <div className="w-full max-w-md">
                    <EntityPicker
                      label="Añadir producto"
                      items={products}
                      itemKey={(product) => product.id}
                      itemLabel={(product) => product.name}
                      itemDetail={(product) =>
                        `${product.unitPrice} € · ${taxLabel(product.taxKey)}`
                      }
                      selectedKey={null}
                      onSelect={(product) => addOrFill(productLine(product))}
                      placeholder="Busca un producto o servicio…"
                      noResults={
                        products.length === 0
                          ? "Todavía no tienes productos guardados."
                          : "Ningún producto coincide."
                      }
                      {...(createProduct === undefined
                        ? {}
                        : {
                            create: {
                              label: (query: string) =>
                                query === ""
                                  ? "Nuevo producto"
                                  : `Crear producto «${query}»`,
                              onCreate: (query: string) =>
                                setCreatingNew({ kind: "product", query }),
                            },
                          })}
                    />
                  </div>
                )}
              </div>
            </fieldset>

            <div className="grid gap-4 sm:grid-cols-[12rem_minmax(0,1fr)]">
              <Field
                name="withholdingPercent"
                label="Retención IRPF % (opcional)"
                hint="Solo si facturas como profesional a una empresa o autónomo."
                inputMode="decimal"
                value={withholding}
                onChange={(event) => setWithholding(event.target.value)}
                error={errors["withholdingPercent"]}
              />
              <div className="grid gap-1.5">
                <Label htmlFor={ids.notes}>Observaciones (opcional)</Label>
                <textarea
                  id={ids.notes}
                  name="notes"
                  defaultValue={initial.notes}
                  maxLength={1000}
                  rows={3}
                  className="field field-textarea"
                />
              </div>
            </div>

            {creatingNew?.kind === "customer" &&
            createCustomer !== undefined ? (
              <Modal
                title="Nuevo cliente"
                description="Se guarda en tus clientes y queda elegido en esta factura."
                onClose={() => setCreatingNew(null)}
              >
                <PartyForm
                  action={creating(createCustomer, (customer) => {
                    setCreatedCustomers((current) => [...current, customer]);
                    setCustomerId(customer.id);
                    setCreatingNew(null);
                  })}
                  label="Nuevo cliente"
                  submitLabel="Guardar y elegir"
                  pendingLabel="Guardando…"
                  nif="optional"
                  withSurcharge
                  values={{ legalName: creatingNew.query }}
                />
              </Modal>
            ) : null}
            {creatingNew?.kind === "product" && createProduct !== undefined ? (
              <Modal
                title="Nuevo producto"
                description="Se guarda en tus productos y se añade como línea de esta factura."
                onClose={() => setCreatingNew(null)}
              >
                <ProductForm
                  stacked
                  defaultName={creatingNew.query}
                  action={creating(createProduct, (product) => {
                    setCreatedProducts((current) => [...current, product]);
                    addOrFill(productLine(product));
                    setCreatingNew(null);
                  })}
                />
              </Modal>
            ) : null}

            <LiveTotals
              lines={lines}
              surcharge={surcharge}
              withholding={withholding}
            >
              <Button type="submit" size="lg" disabled={pending}>
                {pending ? "Guardando…" : "Guardar borrador"}
              </Button>
            </LiveTotals>
          </div>
        </>
      )}
    </ActionForm>
  );
}
