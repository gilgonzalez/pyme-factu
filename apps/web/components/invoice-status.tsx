// Estado con un punto de color y su palabra (el color nunca va solo). Lo usan facturas y registros.

export type Tone = "neutral" | "success" | "warning" | "danger";

const TONE: Readonly<Record<Tone, { readonly badge: string; readonly dot: string }>> = {
  neutral: { badge: "bg-secondary text-secondary-foreground", dot: "bg-muted-foreground/60" },
  success: { badge: "bg-success-soft text-success-ink", dot: "bg-success" },
  warning: { badge: "bg-warning-soft text-warning-ink", dot: "bg-warning" },
  danger: { badge: "bg-danger-soft text-danger-ink", dot: "bg-danger" },
};

export function StatusBadge({ tone, children }: { readonly tone: Tone; readonly children: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${TONE[tone].badge}`}>
      <span aria-hidden="true" className={`size-1.5 rounded-full ${TONE[tone].dot}`} />
      {children}
    </span>
  );
}

export type InvoiceState = "draft" | "issued" | "annulled";

export const invoiceState = (invoice: { readonly status: "DRAFT" | "ISSUED"; readonly annulled: boolean }): InvoiceState =>
  invoice.status === "DRAFT" ? "draft" : invoice.annulled ? "annulled" : "issued";

const INVOICE: Readonly<Record<InvoiceState, { readonly label: string; readonly tone: Tone }>> = {
  draft: { label: "Borrador", tone: "warning" },
  issued: { label: "Emitida", tone: "success" },
  annulled: { label: "Anulada", tone: "danger" },
};

export function InvoiceStatus({ state }: { readonly state: InvoiceState }) {
  return <StatusBadge tone={INVOICE[state].tone}>{INVOICE[state].label}</StatusBadge>;
}
