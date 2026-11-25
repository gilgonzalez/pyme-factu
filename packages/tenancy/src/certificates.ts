// Certificado electrónico del contribuyente para remitir a la AEAT (Fase 6; OM HAC/1177/2024, arts. 4.b y 5).
// Se valida (PKCS#12 + contraseña) y se guarda cifrado por sobre; la KEK no está en la base de datos. Solo lo
// gestiona quien administra el contribuyente (certificates.manage) y nunca se devuelve al navegador.
import { checkCertificate, sealCertificate, type Credentials } from "@facturalibre/aeat-client";
import type { Database } from "@facturalibre/database";
import { recordAudit } from "./audit";
import { activeTaxpayerId } from "./catalog";
import { runInTenant } from "./run-in-tenant";
import type { TenantContext } from "./tenant-context";

export type SaveCertificateResult = { readonly ok: true } | { readonly ok: false; readonly reason: "INVALID"; readonly errors: Readonly<Record<string, string>> };

export function saveCertificate(db: Database, context: TenantContext, credentials: Credentials, kek: Buffer): Promise<SaveCertificateResult> {
  return runInTenant(db, context, "certificates.manage", async (tx): Promise<SaveCertificateResult> => {
    const taxpayerId = activeTaxpayerId(context, "certificates.manage");
    if (!checkCertificate(credentials.pfx, credentials.passphrase)) {
      return { ok: false, reason: "INVALID", errors: { certificate: "El certificado no se abre con esa contraseña o no es un fichero .p12/.pfx." } };
    }
    const sealed = sealCertificate(kek, credentials);
    await tx.taxpayerCertificate.upsert({
      where: { taxpayerId },
      create: { tenantId: context.tenant.id, taxpayerId, sealed, uploadedByUserId: context.user.id },
      update: { sealed, uploadedByUserId: context.user.id },
    });
    await recordAudit(tx, context, "certificate.saved", { type: "taxpayer", id: taxpayerId });
    return { ok: true };
  });
}

/** Si hay certificado y cuándo se subió (nada más: el certificado no sale del servidor). */
export function certificateStatus(db: Database, context: TenantContext): Promise<{ readonly updatedAt: Date } | null> {
  return runInTenant(db, context, "certificates.manage", (tx) =>
    tx.taxpayerCertificate.findUnique({ where: { taxpayerId: activeTaxpayerId(context, "certificates.manage") }, select: { updatedAt: true } }),
  );
}

export function deleteCertificate(db: Database, context: TenantContext): Promise<{ readonly ok: true }> {
  return runInTenant(db, context, "certificates.manage", async (tx) => {
    const taxpayerId = activeTaxpayerId(context, "certificates.manage");
    await tx.taxpayerCertificate.deleteMany({ where: { taxpayerId } });
    await recordAudit(tx, context, "certificate.deleted", { type: "taxpayer", id: taxpayerId });
    return { ok: true } as const;
  });
}
