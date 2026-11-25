"use server";
// Certificado electrónico del contribuyente para remitir a la AEAT (Fase 6). El fichero y su contraseña solo
// viajan del formulario al servidor; se guardan cifrados y nunca vuelven al navegador.
import { deleteCertificate, saveCertificate } from "@facturalibre/tenancy";
import type { ActionResult } from "@/components/action-form";
import { getDatabase } from "@/lib/server/db";
import { formText, tenantAction } from "@/lib/server/tenant-action";
import { certificateKek } from "@/lib/server/verifactu";

/** Un PKCS#12 de un certificado cualificado ocupa unos pocos KB: más de 100 KB no es un certificado. */
const MAX_BYTES = 100 * 1024;

const path = (slug: string, taxpayerId: string): string => `/${slug}/contribuyentes/${taxpayerId}/certificado`;

async function fileBytes(data: FormData): Promise<Buffer | null> {
  const file = data.get("certificate");
  if (!(file instanceof File) || file.size === 0 || file.size > MAX_BYTES) return null;
  return Buffer.from(await file.arrayBuffer());
}

export async function saveCertificateAction(slug: string, taxpayerId: string, _previous: ActionResult, data: FormData): Promise<ActionResult> {
  return tenantAction({ slug, taxpayerId, returnPath: path(slug, taxpayerId) }, async ({ context }) => {
    const pfx = await fileBytes(data);
    if (pfx === null) return { ok: false, message: "Revisa los campos marcados.", errors: { certificate: "Elige el fichero del certificado (.p12 o .pfx)." } };
    const kek = certificateKek();
    if (kek === null) return { ok: false, message: "Este servidor no tiene configurada la clave para guardar certificados (CERTIFICATE_KEK)." };
    const result = await saveCertificate(getDatabase(), context, { pfx, passphrase: formText(data, "passphrase") }, kek);
    return result.ok ? { ok: true, message: "Certificado guardado. Se usará en el próximo envío a la AEAT." } : { ok: false, message: "Revisa los campos marcados.", errors: result.errors };
  });
}

export async function deleteCertificateAction(slug: string, taxpayerId: string): Promise<ActionResult> {
  return tenantAction({ slug, taxpayerId, returnPath: path(slug, taxpayerId) }, async ({ context }) => {
    await deleteCertificate(getDatabase(), context);
    return { ok: true, message: "Certificado borrado. Sin certificado no se pueden remitir los registros a la AEAT." };
  });
}
