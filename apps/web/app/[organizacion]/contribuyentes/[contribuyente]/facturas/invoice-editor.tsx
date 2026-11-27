"use client";
// Editor de borradores: cliente y productos con buscador (y alta sin salir de la factura), líneas dinámicas y totales en vivo calculados
// con el MISMO fiscal-core que usa el servidor (lo que se ve es exactamente lo que se guardará).
import { calculateInvoice, formatAmount, parseDecimal, parseInvoiceLine, SCALE, type ParsedLine } from "@facturalibre/fiscal-core";
import { X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type FocusEvent, type ReactNode } from "react";
import { ActionForm, type FormAction } from "@/components/action-form";
import { EntityPicker } from "@/components/entity-picker";
import { MoreFields } from "@/components/form-extras";
import { Modal } from "@/components/modal";
import { PartyForm } from "@/components/party-form";
import { Field, FieldCell, FieldGroup, FieldRow, FormAlert, TextAreaField } from "@/components/form";
import { Button } from "@/components/ui/button";
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
  readonly createCustomer?: ((data: FormData) => Promise<CreatedResult<EditorCustomer>>) | undefined;
  readonly createProduct?: ((data: FormData) => Promise<CreatedResult<EditorProduct>>) | undefined;
  readonly rectification?: { readonly number: string; readonly reason: string };
  /** Editor de una PLANTILLA: con nombre identificativo, cliente opcional y sin aviso de borrador. */
  readonly template?: { readonly name: string };
}

/** Al tocar un número se selecciona entero: se escribe encima (la cantidad empieza en 1) sin borrar antes. */const selectAll = (event: FocusEvent<HTMLInputElement>): void => event.currentTarget.select();
const EMPTY_LINE: EditorLine = {
  description: "",
  quantity: "1",
  unitPrice: "",
  discountPercent: "",
  tax: "VAT:2100",
};
type KeyedLine = EditorLine & { readonly key: number };

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
        if (last !== undefined && last.description === "" && last.unitPrice === "") return [...current.slice(0, -1), { ...line, key: last.key }];
        return [...current, { ...line, key: nextKey }];
      });
      setNextKey(nextKey + 1);
    },
    update(key: number, patch: Partial<EditorLine>) {
      setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
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
  const valid = parsed.flatMap((line): ParsedLine[] => (line.ok ? [line.value] : []));
  const withholdingPercent = parseDecimal(withholding === "" ? "0" : withholding, SCALE.percent);
  const totals = calculateInvoice({
    lines: valid,
    equivalenceSurcharge: surcharge,
    withholdingPercent: withholdingPercent.ok ? withholdingPercent.value : 0n,
  });
  return (
    <section
      aria-labelledby="totales"
      className="figures sticky bottom-(--tabbar-h) z-10 -mx-5 -mb-5 grid gap-1 rounded-b-[14px] border-t bg-card/95 px-5 py-3 text-sm backdrop-blur sm:-mx-8 sm:-mb-8 sm:px-8 sm:py-4"
    >
      <h2 id="totales" className="sr-only">
        Totales
      </h2>
      {/* En móvil, el desglose en una línea: la barra fija no debe comerse la pantalla. */}
      <p aria-hidden="true" className="truncate text-xs text-muted-foreground sm:hidden">
        Base {formatAmount(totals.taxableBase)} · Impuestos {formatAmount(totals.vatTotal + totals.surchargeTotal)}
        {totals.withholdingAmount === 0n ? "" : ` · IRPF −${formatAmount(totals.withholdingAmount)}`}
        {valid.length < lines.length ? " · líneas incompletas sin sumar" : ""}
      </p>
      <div aria-live="polite" className="grid gap-1 max-sm:sr-only">
        {totals.breakdown.map((entry) => (
          <p key={entry.key} className="flex justify-between gap-4 text-muted-foreground">
            <span>
              Base {taxLabel(entry.key)}: {formatAmount(entry.base)}
            </span>
            <span>
              Cuota {formatAmount(entry.quota)}
              {entry.surchargeQuota === 0n ? "" : ` + recargo ${formatAmount(entry.surchargeQuota)}`}
            </span>
          </p>
        ))}
        {totals.withholdingAmount === 0n ? null : <p className="flex justify-between">Retención IRPF: −{formatAmount(totals.withholdingAmount)}</p>}
        {valid.length < lines.length ? <p className="text-muted-foreground">Las líneas incompletas no se suman hasta que estén bien.</p> : null}
      </div>
      <div className="flex items-center justify-between gap-3 sm:mt-1 sm:flex-wrap">
        <p className="flex items-baseline gap-2 text-lg font-bold whitespace-nowrap sm:gap-3 sm:text-xl">
          <span>Total</span>
          <span>{formatAmount(totals.total)}</span>
        </p>
        {children}
      </div>
    </section>
  );
}

/** Lo recibido del servidor más lo dado de alta aquí (sin repetir: tras el alta, la página también lo trae). */
const withCreated = <Item extends { readonly id: string }>(listed: readonly Item[], created: readonly Item[]): Item[] => [
  ...listed,
  ...created.filter((item) => !listed.some((candidate) => candidate.id === item.id)),
];

/** Convierte un alta desde el editor en la acción de un formulario: si va bien, entrega el elemento creado. */
function creating<Item>(create: (data: FormData) => Promise<CreatedResult<Item>>, onCreated: (item: Item) => void): FormAction {
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

function EditorForm({
  action,
  customers: listedCustomers,
  products: listedProducts,
  initial,
  newCustomerHref,
  defaultTax,
  createCustomer,
  createProduct,
  rectification,
  template,
}: InvoiceEditorProps) {
  const emptyLine: EditorLine = {
    ...EMPTY_LINE,
    tax: defaultTax ?? EMPTY_LINE.tax,
  };
  const { lines, add, addOrFill, update, remove } = useLines(initial.lines, emptyLine);
  const [customerId, setCustomerId] = useState(initial.customerId);
  const [withholding, setWithholding] = useState(initial.withholdingPercent);
  const [createdCustomers, setCreatedCustomers] = useState<EditorCustomer[]>([]);
  const [createdProducts, setCreatedProducts] = useState<EditorProduct[]>([]);
  const [creatingNew, setCreatingNew] = useState<Creating>(null);
  const [detailOpen, setDetailOpen] = useState<ReadonlySet<number>>(new Set());
  const toggleDetail = (key: number) =>
    setDetailOpen((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  const customers = withCreated(listedCustomers, createdCustomers);
  const products = withCreated(listedProducts, createdProducts);
  const surcharge = customers.find((customer) => customer.id === customerId)?.equivalenceSurcharge ?? false;

  return (
    <ActionForm action={action} className="surface grid" label={template === undefined ? "Factura" : "Plantilla"}>
      {({ pending, errors }) => (
        <>
          {template === undefined ? (
            <p className="rounded-t-[14px] border-b border-warning-ink/20 bg-warning-soft px-5 py-2 text-sm font-semibold text-warning-ink sm:px-8">
              Borrador: no tiene número ni validez fiscal hasta que lo emitas.
            </p>
          ) : (
            <p className="rounded-t-[14px] border-b border-primary/15 bg-accent px-5 py-2 text-sm font-medium text-accent-foreground sm:px-8">
              Plantilla: al usarla se prepara una factura nueva con estos datos. Lo que cambies en esa factura no toca la plantilla.
            </p>
          )}
          <div className="grid gap-7 p-5 sm:p-8">
            {template === undefined ? null : (
              <div className="max-w-xl">
                <Field
                  name="name"
                  label="Nombre de la plantilla"
                  hint="Para reconocerla al facturar, p. ej. «Mantenimiento mensual» o «Clases — Academia Sol»."
                  maxLength={80}
                  required
                  defaultValue={template.name}
                  error={errors["name"]}
                />
              </div>
            )}
            {rectification === undefined ? null : (
              <FormAlert tone="success">
                Rectificativa de la factura <strong>{rectification.number}</strong>. Motivo: {rectification.reason}. Las cantidades en negativo anulan lo
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
                {errors["customerId"] === undefined ? null : <p className="text-sm text-destructive">{errors["customerId"]}</p>}
              </div>
            ) : (
              <div className="grid max-w-xl gap-1.5">
                <EntityPicker
                  label={template === undefined ? "Cliente" : "Cliente (opcional)"}
                  items={customers}
                  itemKey={(customer) => customer.id}
                  itemLabel={(customer) => customer.legalName}
                  itemDetail={(customer) => customer.nif ?? ""}
                  selectedKey={customerId === "" ? null : customerId}
                  onSelect={(customer) => setCustomerId(customer.id)}
                  placeholder="Busca por nombre o NIF…"
                  noResults={customers.length === 0 ? "Todavía no tienes clientes." : "Ningún cliente coincide."}
                  error={errors["customerId"]}
                  {...(createCustomer === undefined
                    ? {}
                    : {
                        create: {
                          label: (query: string) => (query === "" ? "Nuevo cliente" : `Crear cliente «${query}»`),
                          onCreate: (query: string) => setCreatingNew({ kind: "customer", query }),
                        },
                      })}
                />
                {/* En una plantilla el cliente es opcional: se puede dejar para elegirlo al facturar. */}
                {template === undefined || customerId === "" ? null : (
                  <Button type="button" variant="ghost" size="sm" className="justify-self-start" onClick={() => setCustomerId("")}>
                    Quitar cliente (se elige al facturar)
                  </Button>
                )}
              </div>
            )}

            <fieldset className="grid gap-3">
              <legend className="mb-1 font-semibold">Líneas</legend>
              {errors["lines"] === undefined ? null : <p className="text-sm text-destructive">{errors["lines"]}</p>}
              <FieldGroup>
                {lines.map((line, index) => {
                  const name = (field: string) => `lines.${String(index)}.${field}`;
                  const taxId = `impuesto-${String(line.key)}`;
                  // En el móvil, IVA y descuento plegados tras «Cambiar» (casi nunca cambian); abiertos si tienen error.
                  const detailError = errors[name("discountPercent")] ?? errors[name("tax")];
                  const showDetail = detailOpen.has(line.key) || detailError !== undefined;
                  const detailSummary = `${taxLabel(line.tax)}${line.discountPercent.trim() === "" || line.discountPercent.trim() === "0" ? "" : ` · dto. ${line.discountPercent} %`}`;
                  return (
                    <div
                      key={line.key}
                      className="field-row grid-cols-2 sm:grid-cols-4 lg:grid-cols-[minmax(0,1fr)_6rem_7.5rem_5.5rem_11rem_3rem] [&>*:first-child]:col-span-full lg:[&>*:first-child]:col-span-1"
                      role="group"
                      aria-label={`Línea ${String(index + 1)}`}
                    >
                      <Field
                        name={name("description")}
                        label="Descripción"
                        placeholder="Qué vendes o qué servicio prestas"
                        value={line.description}
                        onChange={(event) => update(line.key, { description: event.target.value })}
                        error={errors[name("description")]}
                      />
                      <Field
                        name={name("quantity")}
                        label="Cantidad"
                        inputMode="decimal"
                        onFocus={selectAll}
                        value={line.quantity}
                        onChange={(event) => update(line.key, { quantity: event.target.value })}
                        error={errors[name("quantity")]}
                      />
                      <Field
                        name={name("unitPrice")}
                        label="Precio (€)"
                        inputMode="decimal"
                        placeholder="0,00"
                        onFocus={selectAll}
                        value={line.unitPrice}
                        onChange={(event) => update(line.key, { unitPrice: event.target.value })}
                        error={errors[name("unitPrice")]}
                      />
                      <div className={showDetail ? "contents" : "contents max-lg:hidden"}>
                      <Field
                        name={name("discountPercent")}
                        label="Dto. %"
                        inputMode="decimal"
                        placeholder="0"
                        onFocus={selectAll}
                        value={line.discountPercent}
                        onChange={(event) => update(line.key, { discountPercent: event.target.value })}
                        error={errors[name("discountPercent")]}
                      />
                      <FieldCell id={taxId} label="IVA">
                        <select
                          id={taxId}
                          name={name("tax")}
                          value={line.tax}
                          onChange={(event) => update(line.key, { tax: event.target.value })}
                          className="field-cell-input"
                        >
                          {TAX_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </FieldCell>
                      </div>
                      <div className="col-span-2 flex items-center justify-between gap-2 bg-card py-1 pr-1 pl-3.5 sm:col-span-4 lg:col-span-1 lg:justify-center lg:p-1">
                        <button
                          type="button"
                          onClick={() => toggleDetail(line.key)}
                          aria-expanded={showDetail}
                          aria-label={`${showDetail ? "Ocultar" : "Cambiar"} el impuesto o el descuento de la línea ${String(index + 1)}`}
                          className="flex min-h-11 min-w-0 items-center gap-2 text-left text-sm lg:hidden"
                        >
                          <span className="truncate text-muted-foreground">{detailSummary}</span>
                          <span className="font-semibold text-primary">{showDetail ? "Listo" : "Cambiar"}</span>
                        </button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => remove(line.key)}
                          disabled={lines.length === 1}
                          aria-label={`Quitar la línea ${String(index + 1)}`}
                          title="Quitar la línea"
                        >
                          <X aria-hidden="true" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </FieldGroup>
              <div className="flex flex-wrap items-end gap-3">
                <Button type="button" variant="outline" onClick={() => add(emptyLine)}>
                  Añadir línea
                </Button>
                {products.length === 0 && createProduct === undefined ? null : (
                  <div className="w-full max-w-md">
                    <EntityPicker
                      label="Añadir producto"
                      items={products}
                      itemKey={(product) => product.id}
                      itemLabel={(product) => product.name}
                      itemDetail={(product) => `${product.unitPrice} € · ${taxLabel(product.taxKey)}`}
                      selectedKey={null}
                      onSelect={(product) => addOrFill(productLine(product))}
                      placeholder="Busca un producto o servicio…"
                      noResults={products.length === 0 ? "Todavía no tienes productos guardados." : "Ningún producto coincide."}
                      {...(createProduct === undefined
                        ? {}
                        : {
                            create: {
                              label: (query: string) => (query === "" ? "Nuevo producto" : `Crear producto «${query}»`),
                              onCreate: (query: string) => setCreatingNew({ kind: "product", query }),
                            },
                          })}
                    />
                  </div>
                )}
              </div>
            </fieldset>

            {/* Casi nunca hacen falta: plegados salvo que ya tengan algo (p. ej. la retención por defecto de la empresa). */}
            <MoreFields
              label="retención IRPF u observaciones"
              defaultOpen={initial.withholdingPercent !== "" || initial.notes !== ""}
              forceOpen={errors["withholdingPercent"] !== undefined || errors["notes"] !== undefined}
            >
              <FieldGroup>
                <FieldRow columns="sm:grid-cols-[14rem_minmax(0,1fr)]">
                  <Field
                    name="withholdingPercent"
                    label="Retención IRPF % (opcional)"
                    hint="Si facturas como profesional a una empresa o autónomo."
                    inputMode="decimal"
                    placeholder="p. ej. 15"
                    onFocus={selectAll}
                    value={withholding}
                    onChange={(event) => setWithholding(event.target.value)}
                    error={errors["withholdingPercent"]}
                  />
                  <TextAreaField name="notes" label="Observaciones (opcional)" maxLength={1000} rows={2} defaultValue={initial.notes} error={errors["notes"]} />
                </FieldRow>
              </FieldGroup>
            </MoreFields>

            {creatingNew?.kind === "customer" && createCustomer !== undefined ? (
              <Modal title="Nuevo cliente" description="Se guarda en tus clientes y queda elegido en esta factura." onClose={() => setCreatingNew(null)}>
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

            <LiveTotals lines={lines} surcharge={surcharge} withholding={withholding}>
              <Button type="submit" size="lg" disabled={pending}>
                {pending ? "Guardando…" : template === undefined ? "Guardar borrador" : "Guardar plantilla"}
              </Button>
            </LiveTotals>
          </div>
        </>
      )}
    </ActionForm>
  );
}

/**
 * Next conserva ocultas las pantallas ya visitadas, con su estado: al volver a «Nueva factura» o «Nueva plantilla»
 * aparecería lo escrito la vez anterior (o lo ya guardado). Al ocultarse la pantalla (limpieza del efecto) el
 * editor se renueva, así que vuelve con los datos de partida. Un refresco del servidor (p. ej. tras dar de alta un
 * cliente desde el buscador) no lo oculta, y no se pierde nada.
 */
export function InvoiceEditor(props: InvoiceEditorProps) {
  const [generation, setGeneration] = useState(0);
  useEffect(() => () => setGeneration((current) => current + 1), []);
  return <EditorForm key={generation} {...props} />;
}
