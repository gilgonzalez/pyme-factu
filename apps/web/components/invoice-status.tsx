// Estado de una factura con los colores de las copias del talonario: borrador (copia amarilla), emitida (el
// original, blanco) y anulada (copia rosa). El color nunca va solo: siempre acompaña a la palabra.

export type InvoiceState = "draft" | "issued" | "annulled";

export const invoiceState = (invoice: { readonly status: "DRAFT" | "ISSUED"; readonly annulled: boolean }): InvoiceState =>
  invoice.status === "DRAFT" ? "draft" : invoice.annulled ? "annulled" : "issued";

const LOOK: Readonly<Record<InvoiceState, { readonly label: string; readonly className: string }>> = {
  draft: { label: "Borrador", className: "border-copy-yellow-ink/30 bg-copy-yellow text-copy-yellow-ink" },
  issued: { label: "Emitida", className: "border-foreground/20 bg-card text-foreground" },
  annulled: { label: "Anulada", className: "border-copy-pink-ink/30 bg-copy-pink text-copy-pink-ink" },
};

/** Fondo de la matriz del talonario según el estado. */
export const STUB_TINT: Readonly<Record<InvoiceState, string>> = {
  draft: "bg-copy-yellow text-copy-yellow-ink",
  issued: "bg-secondary text-foreground",
  annulled: "bg-copy-pink text-copy-pink-ink",
};

export function InvoiceStatus({ state }: { readonly state: InvoiceState }) {
  const look = LOOK[state];
  return <span className={`inline-flex items-center rounded-sm border px-2 py-0.5 text-xs font-bold ${look.className}`}>{look.label}</span>;
}
