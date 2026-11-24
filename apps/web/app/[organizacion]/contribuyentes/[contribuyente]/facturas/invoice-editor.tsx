"use client";
// Editor de borradores: líneas dinámicas, productos guardados con un clic y totales en vivo calculados
// con el MISMO fiscal-core que usa el servidor (lo que se ve es exactamente lo que se guardará).
import { calculateInvoice, formatAmount, parseDecimal, parseInvoiceLine, SCALE, type ParsedLine } from "@facturalibre/fiscal-core";
import Link from "next/link";
import { useId, useState } from "react";
import { ActionForm, type FormAction } from "@/components/action-form";
import { Field, FormAlert } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { TAX_OPTIONS, taxLabel } from "@/lib/invoicing";

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
  readonly initial: { readonly customerId: string; readonly withholdingPercent: string; readonly notes: string; readonly lines: readonly EditorLine[] };
  readonly newCustomerHref: string;
  readonly rectification?: { readonly number: string; readonly reason: string };
}

const EMPTY_LINE: EditorLine = { description: "", quantity: "1", unitPrice: "", discountPercent: "", tax: "VAT:2100" };
type KeyedLine = EditorLine & { readonly key: number };

const selectClass =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function useLines(initial: readonly EditorLine[]) {
  const [nextKey, setNextKey] = useState(initial.length + 1);
  const [lines, setLines] = useState<KeyedLine[]>(() => (initial.length === 0 ? [EMPTY_LINE] : initial).map((line, index) => ({ ...line, key: index })));
  return {
    lines,
    add(line: EditorLine) {
      setLines((current) => [...current, { ...line, key: nextKey }]);
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

function LiveTotals({ lines, surcharge, withholding }: { readonly lines: readonly EditorLine[]; readonly surcharge: boolean; readonly withholding: string }) {
  const parsed = lines.map((line) => parseInvoiceLine(line));
  const valid = parsed.flatMap((line): ParsedLine[] => (line.ok ? [line.value] : []));
  const withholdingPercent = parseDecimal(withholding === "" ? "0" : withholding, SCALE.percent);
  const totals = calculateInvoice({ lines: valid, equivalenceSurcharge: surcharge, withholdingPercent: withholdingPercent.ok ? withholdingPercent.value : 0n });
  return (
    <section aria-labelledby="totales" aria-live="polite" className="grid gap-1 rounded-xl border bg-muted/30 p-4 text-sm">
      <h2 id="totales" className="font-medium">
        Totales
      </h2>
      {totals.breakdown.map((entry) => (
        <p key={entry.key} className="flex justify-between gap-4">
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
      <p className="flex justify-between text-base font-semibold">
        <span>Total</span>
        <span>{formatAmount(totals.total)}</span>
      </p>
      {valid.length < lines.length ? <p className="text-muted-foreground">Las líneas incompletas no se suman hasta que estén bien.</p> : null}
    </section>
  );
}

export function InvoiceEditor({ action, customers, products, initial, newCustomerHref, rectification }: InvoiceEditorProps) {
  const ids = { customer: useId(), product: useId(), notes: useId() };
  const { lines, add, update, remove } = useLines(initial.lines);
  const [customerId, setCustomerId] = useState(initial.customerId);
  const [withholding, setWithholding] = useState(initial.withholdingPercent);
  const surcharge = customers.find((customer) => customer.id === customerId)?.equivalenceSurcharge ?? false;

  return (
    <ActionForm action={action} className="grid gap-6" label="Factura">
      {({ pending, errors }) => (
        <>
          {rectification === undefined ? null : (
            <FormAlert tone="success">
              Rectificativa de la factura <strong>{rectification.number}</strong>. Motivo: {rectification.reason}. Las cantidades en
              negativo anulan lo facturado; ajústalas si solo corriges una parte.
            </FormAlert>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor={ids.customer}>Cliente</Label>
            {customers.length === 0 ? (
              <p className="text-sm">
                Todavía no tienes clientes.{" "}
                <Link href={newCustomerHref} className="font-medium underline underline-offset-4">
                  Da de alta el primero
                </Link>
                .
              </p>
            ) : (
              <select id={ids.customer} name="customerId" value={customerId} onChange={(event) => setCustomerId(event.target.value)} className={selectClass} aria-invalid={errors["customerId"] === undefined ? undefined : true}>
                <option value="">Elige un cliente…</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.legalName}
                    {customer.nif === null ? "" : ` (${customer.nif})`}
                  </option>
                ))}
              </select>
            )}
            {errors["customerId"] === undefined ? null : <p className="text-sm text-destructive">{errors["customerId"]}</p>}
          </div>

          <fieldset className="grid gap-3">
            <legend className="font-medium">Líneas</legend>
            {errors["lines"] === undefined ? null : <p className="text-sm text-destructive">{errors["lines"]}</p>}
            {lines.map((line, index) => {
              const name = (field: string) => `lines.${String(index)}.${field}`;
              return (
                <div key={line.key} className="grid gap-2 rounded-xl border p-3 sm:grid-cols-[3fr_1fr_1fr_1fr_1fr_auto] sm:items-end" role="group" aria-label={`Línea ${String(index + 1)}`}>
                  <Field name={name("description")} label="Descripción" value={line.description} onChange={(event) => update(line.key, { description: event.target.value })} error={errors[name("description")]} />
                  <Field name={name("quantity")} label="Cantidad" inputMode="decimal" value={line.quantity} onChange={(event) => update(line.key, { quantity: event.target.value })} error={errors[name("quantity")]} />
                  <Field name={name("unitPrice")} label="Precio (€)" inputMode="decimal" value={line.unitPrice} onChange={(event) => update(line.key, { unitPrice: event.target.value })} error={errors[name("unitPrice")]} />
                  <Field name={name("discountPercent")} label="Dto. %" inputMode="decimal" value={line.discountPercent} onChange={(event) => update(line.key, { discountPercent: event.target.value })} error={errors[name("discountPercent")]} />
                  <div className="grid gap-1.5">
                    <Label htmlFor={`impuesto-${String(line.key)}`}>IVA</Label>
                    <select id={`impuesto-${String(line.key)}`} name={name("tax")} value={line.tax} onChange={(event) => update(line.key, { tax: event.target.value })} className={selectClass}>
                      {TAX_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Button type="button" variant="ghost" onClick={() => remove(line.key)} disabled={lines.length === 1} aria-label={`Quitar la línea ${String(index + 1)}`}>
                    Quitar
                  </Button>
                </div>
              );
            })}
            <div className="flex flex-wrap items-end gap-3">
              <Button type="button" variant="outline" onClick={() => add(EMPTY_LINE)}>
                Añadir línea
              </Button>
              {products.length === 0 ? null : (
                <div className="grid gap-1.5">
                  <Label htmlFor={ids.product}>Añadir un producto guardado</Label>
                  <select
                    id={ids.product}
                    value=""
                    className={selectClass}
                    onChange={(event) => {
                      const product = products.find((candidate) => candidate.id === event.target.value);
                      if (product !== undefined) add({ description: product.name, quantity: "1", unitPrice: product.unitPrice, discountPercent: "", tax: product.taxKey });
                    }}
                  >
                    <option value="">Elige un producto…</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name} · {product.unitPrice} €
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-[1fr_3fr]">
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
              <textarea id={ids.notes} name="notes" defaultValue={initial.notes} maxLength={1000} rows={2} className="rounded-lg border border-input bg-background px-2.5 py-1.5 text-sm" />
            </div>
          </div>

          <LiveTotals lines={lines} surcharge={surcharge} withholding={withholding} />

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" size="lg" disabled={pending}>
              {pending ? "Guardando…" : "Guardar borrador"}
            </Button>
            <p className="text-sm text-muted-foreground">El borrador no tiene número ni validez fiscal hasta que lo emitas.</p>
          </div>
        </>
      )}
    </ActionForm>
  );
}
