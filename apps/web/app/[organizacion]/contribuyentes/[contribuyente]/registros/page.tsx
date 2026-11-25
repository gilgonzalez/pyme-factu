import { listBillingRecords, type BillingRecordView } from "@facturalibre/tenancy";
import type { Metadata } from "next";
import Link from "next/link";
import { FormAlert, streamedPage } from "@/components/form";
import { TaxpayerFrame } from "@/components/taxpayer-frame";
import { spanishShortDateTime } from "@/lib/invoice-view";
import { getDatabase } from "@/lib/server/db";
import { requireTaxpayer } from "@/lib/server/session";

export const metadata: Metadata = { title: "Registros VERI*FACTU" };

export default streamedPage("Comprobando la cadena de registros…", Records);

const STATUS: Readonly<Record<BillingRecordView["status"], { readonly label: string; readonly className: string }>> = {
  PENDING: { label: "Pendiente de remitir", className: "border-foreground/20 bg-card text-muted-foreground" },
  ACCEPTED: { label: "Aceptado", className: "border-ok-ink/25 bg-ok text-ok-ink" },
  ACCEPTED_WITH_ERRORS: { label: "Aceptado con errores", className: "border-copy-yellow-ink/30 bg-copy-yellow text-copy-yellow-ink" },
  REJECTED: { label: "Rechazado", className: "border-copy-pink-ink/30 bg-copy-pink text-copy-pink-ink" },
};

const shortHash = (hash: string): string => `${hash.slice(0, 8)}…${hash.slice(-8)}`;

/**
 * Cadena de registros de facturación del contribuyente activo (OM HAC/1177/2024, arts. 6 y 7): cada registro con
 * su huella recalculada y su enlace con el anterior comprobados al mostrar la página.
 */
async function Records({ params }: { readonly params: PageProps<"/[organizacion]/contribuyentes/[contribuyente]/registros">["params"] }) {
  const { organizacion, contribuyente } = await params;
  const path = `/${organizacion}/contribuyentes/${contribuyente}`;
  const { user, context, taxpayer } = await requireTaxpayer(organizacion, contribuyente, `${path}/registros`);
  const { records, checks } = await listBillingRecords(getDatabase(), context);
  const broken = checks.filter((check) => !check.hashOk || !check.linkOk);

  return (
    <TaxpayerFrame user={user} context={context} taxpayer={taxpayer} current="registros">
      <div className="grid gap-1">
        <h1 className="font-heading text-[1.95rem] leading-tight font-bold tracking-[-0.02em]">Registros VERI*FACTU</h1>
        <p className="text-muted-foreground">
          Cada factura emitida genera un registro de alta; una factura anulada, uno de anulación. Cada registro incluye la huella del anterior.
        </p>
      </div>
      {records.length === 0 ? (
        <p className="text-muted-foreground">Aún no hay registros: se generan al emitir la primera factura.</p>
      ) : broken.length === 0 ? (
        <FormAlert tone="success">Cadena comprobada: las {records.length} huellas coinciden y cada registro enlaza con el anterior.</FormAlert>
      ) : (
        <FormAlert tone="error">
          <strong>Alarma de integridad:</strong> {broken.length} registro(s) no superan la comprobación (nº {broken.map((check) => check.sequence).join(", ")}).
          Avisa al equipo técnico: los registros no deben poder alterarse.
        </FormAlert>
      )}
      {records.length === 0 ? null : (
        <div className="sheet overflow-x-auto">
          <table className="figures w-full text-sm">
            <caption className="sr-only">Cadena de registros de {taxpayer.legalName}</caption>
            <thead className="border-b text-left text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">Nº</th>
                <th scope="col" className="px-4 py-3 font-semibold">Tipo</th>
                <th scope="col" className="px-4 py-3 font-semibold">Factura</th>
                <th scope="col" className="px-4 py-3 font-semibold">Generado</th>
                <th scope="col" className="px-4 py-3 font-semibold">Huella</th>
                <th scope="col" className="px-4 py-3 font-semibold">Comprobación</th>
                <th scope="col" className="px-4 py-3 font-semibold">Remisión</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record, index) => {
                const check = checks[index];
                const ok = check?.hashOk === true && check.linkOk;
                return (
                  <tr key={record.id} className="border-t">
                    <td className="px-4 py-3 tabular-nums">{record.sequence}</td>
                    <td className="px-4 py-3">{record.kind === "ALTA" ? `Alta (${record.invoiceType ?? ""})` : "Anulación"}</td>
                    <td className="px-4 py-3">
                      <Link href={`${path}/facturas/${record.invoiceId}`} className="font-mono font-bold whitespace-nowrap text-primary underline decoration-primary/30 underline-offset-4 hover:decoration-primary">
                        {record.invoiceNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <time dateTime={record.generatedAt}>{spanishShortDateTime(record.generatedAt)}</time>
                    </td>
                    <td className="px-4 py-3">
                      <code title={record.hash} className="font-mono text-xs whitespace-nowrap">
                        {shortHash(record.hash)}
                      </code>
                    </td>
                    <td className={ok ? "px-4 py-3" : "px-4 py-3 font-medium text-destructive"}>{ok ? "Correcta" : "No coincide"}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-sm border px-2 py-0.5 text-xs font-bold whitespace-nowrap ${STATUS[record.status].className}`}>{STATUS[record.status].label}</span>
                      {record.aeatErrorDescription === null ? null : (
                        <span className="mt-1 block max-w-56 text-xs text-muted-foreground">
                          {record.aeatErrorCode ?? ""} {record.aeatErrorDescription}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </TaxpayerFrame>
  );
}
