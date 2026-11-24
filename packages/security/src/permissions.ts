// Catálogo ÚNICO de permisos de FacturaLibre. Toda comprobación de autorización usa estos nombres;
// nunca se comprueban nombres de rol directamente fuera de este paquete.

/** Permisos de ámbito organización: no dependen del contribuyente activo. */
export const TENANT_PERMISSIONS = [
  "tenant.read",
  "tenant.update",
  "tenant.deactivate",
  "tenant.transfer_ownership",
  "members.read",
  "members.invite",
  "members.update_role",
  "members.remove",
  "taxpayers.read",
  "taxpayers.create",
  "taxpayers.manage_access",
  "settings.read",
  "settings.update",
  "audit.read",
] as const;

/** Permisos de ámbito contribuyente: requieren acceso al contribuyente activo. */
export const TAXPAYER_READ_PERMISSIONS = ["customers.read", "products.read", "invoices.read", "verifactu.read", "reports.read"] as const;

export const TAXPAYER_WRITE_PERMISSIONS = [
  "taxpayers.update",
  "customers.write",
  "products.write",
  "invoices.draft",
  "invoices.issue",
  "invoices.rectify",
  "certificates.manage",
] as const;

export const PERMISSIONS = [...TENANT_PERMISSIONS, ...TAXPAYER_READ_PERMISSIONS, ...TAXPAYER_WRITE_PERMISSIONS] as const;

export type Permission = (typeof PERMISSIONS)[number];

const readSet: ReadonlySet<Permission> = new Set(TAXPAYER_READ_PERMISSIONS);
const writeSet: ReadonlySet<Permission> = new Set(TAXPAYER_WRITE_PERMISSIONS);

export const isTaxpayerRead = (permission: Permission): boolean => readSet.has(permission);
export const isTaxpayerWrite = (permission: Permission): boolean => writeSet.has(permission);
