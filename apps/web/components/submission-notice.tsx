import { submissionStatus, type TenantContext } from "@facturalibre/tenancy";
import Link from "next/link";
import { getDatabase } from "@/lib/server/db";

const dateTime = new Intl.DateTimeFormat("es-ES", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Madrid" });
const records = (count: number): string => (count === 1 ? "1 registro" : `${String(count)} registros`);

/**
 * Aviso obligatorio mientras una incidencia impida remitir los registros a la AEAT, indicando cuántos faltan
 * (OM HAC/1177/2024, art. 16.4), y de los registros que la AEAT ha rechazado.
 */
export async function SubmissionNotice({ context, recordsHref }: { readonly context: TenantContext; readonly recordsHref: string }) {
  if (!context.permissions.has("verifactu.read")) return null;
  const status = await submissionStatus(getDatabase(), context);
  if (status.failingSince === null && status.rejected === 0) return null;
  return (
    <div role="alert" className="grid gap-1 rounded-lg border border-destructive/50 bg-destructive/5 p-3 text-sm">
      {status.failingSince === null ? null : (
        <p>
          <strong>No se han podido remitir {records(status.pending)} a la AEAT</strong> desde el {dateTime.format(status.failingSince)}
          {status.lastError === null ? "" : ` (${status.lastError})`}. FacturaLibre lo reintenta automáticamente; puedes seguir facturando.
        </p>
      )}
      {status.rejected === 0 ? null : (
        <p>
          <strong>La AEAT ha rechazado {records(status.rejected)}.</strong>{" "}
          <Link href={recordsHref} className="underline underline-offset-4">
            Revísalos en Registros VERI*FACTU
          </Link>
          .
        </p>
      )}
    </div>
  );
}
