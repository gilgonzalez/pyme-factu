import { listBillingRecords, type BillingRecordView } from "@facturalibre/tenancy";
import type { Metadata } from "next";
import Link from "next/link";
import { FormAlert, streamedPage } from "@/components/form";
import { TaxpayerFrame } from "@/components/taxpayer-frame";
import { getDatabase } from "@/lib/server/db";
import { requireTaxpayer } from "@/lib/server/session";

export const metadata: Metadata = { title: "Registros VERI*FACTU" };

export default streamedPage("Comprobando la cadena de registros…", Records);

const STATUS: Readonly<Record<BillingRecordView["status"], string>> = {
  PENDING: "Pendiente de remitir",
  ACCEPTED: "Aceptado",
  ACCEPTED_WITH_ERRORS: "Aceptado con errores",
  REJECTED: "Rechazado",
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
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Registros VERI*FACTU</h1>
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
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <caption className="sr-only">Cadena de registros de {taxpayer.legalName}</caption>
            <thead className="bg-muted/50 text-left">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Nº</th>
                <th scope="col" className="px-3 py-2 font-medium">Tipo</th>
                <th scope="col" className="px-3 py-2 font-medium">Factura</th>
                <th scope="col" className="px-3 py-2 font-medium">Generado</th>
                <th scope="col" className="px-3 py-2 font-medium">Huella</th>
                <th scope="col" className="px-3 py-2 font-medium">Comprobación</th>
                <th scope="col" className="px-3 py-2 font-medium">Remisión</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record, index) => {
                const check = checks[index];
                const ok = check?.hashOk === true && check.linkOk;
                return (
                  <tr key={record.id} className="border-t">
                    <td className="px-3 py-2 tabular-nums">{record.sequence}</td>
                    <td className="px-3 py-2">{record.kind === "ALTA" ? `Alta (${record.invoiceType ?? ""})` : "Anulación"}</td>
                    <td className="px-3 py-2">
                      <Link href={`${path}/facturas/${record.invoiceId}`} className="underline underline-offset-4">
                        {record.invoiceNumber}
                      </Link>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{record.generatedAt}</td>
                    <td className="px-3 py-2">
                      <code title={record.hash}>{shortHash(record.hash)}</code>
                    </td>
                    <td className={ok ? "px-3 py-2" : "px-3 py-2 font-medium text-destructive"}>{ok ? "Correcta" : "No coincide"}</td>
                    <td className="px-3 py-2">
                      {STATUS[record.status]}
                      {record.aeatErrorDescription === null ? null : (
                        <span className="block text-xs text-muted-foreground">
                          {record.aeatErrorCode ?? ""} · {record.aeatErrorDescription}
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
