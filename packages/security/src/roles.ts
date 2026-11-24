import { isTaxpayerRead, isTaxpayerWrite, PERMISSIONS, type Permission } from "./permissions";

export const ROLES = ["OWNER", "ADMIN", "ACCOUNTANT", "EMPLOYEE", "VIEWER"] as const;
export type Role = (typeof ROLES)[number];

/** Acceso efectivo del miembro al contribuyente activo. NONE: sin contribuyente activo o sin acceso. */
export type TaxpayerAccess = "FULL" | "READ_ONLY" | "NONE";

const ALL: readonly Permission[] = PERMISSIONS;

const ROLE_PERMISSIONS: Readonly<Record<Role, readonly Permission[]>> = {
  OWNER: ALL,
  ADMIN: ALL.filter((permission) => permission !== "tenant.deactivate" && permission !== "tenant.transfer_ownership"),
  ACCOUNTANT: [
    "tenant.read",
    "members.read",
    "taxpayers.read",
    "settings.read",
    "customers.read",
    "customers.write",
    "products.read",
    "products.write",
    "invoices.read",
    "invoices.draft",
    "invoices.issue",
    "invoices.rectify",
    "verifactu.read",
    "reports.read",
  ],
  EMPLOYEE: [
    "tenant.read",
    "taxpayers.read",
    "customers.read",
    "customers.write",
    "products.read",
    "invoices.read",
    "invoices.draft",
    "verifactu.read",
  ],
  VIEWER: ["tenant.read", "taxpayers.read", "customers.read", "products.read", "invoices.read", "verifactu.read", "reports.read"],
};

/** Rango para impedir la escalada: solo se actúa sobre roles estrictamente inferiores al propio. */
const RANK: Readonly<Record<Role, number>> = { OWNER: 5, ADMIN: 4, ACCOUNTANT: 3, EMPLOYEE: 2, VIEWER: 1 };

function allowedByTaxpayerAccess(permission: Permission, access: TaxpayerAccess): boolean {
  if (isTaxpayerWrite(permission)) return access === "FULL";
  if (isTaxpayerRead(permission)) return access !== "NONE";
  return true;
}

/**
 * Permisos efectivos = permisos del rol ∩ lo que permite el acceso al contribuyente activo.
 * El acceso al contribuyente solo puede RESTAR permisos, nunca añadirlos.
 */
export function effectivePermissions(role: Role, taxpayerAccess: TaxpayerAccess): ReadonlySet<Permission> {
  return new Set(ROLE_PERMISSIONS[role].filter((permission) => allowedByTaxpayerAccess(permission, taxpayerAccess)));
}

export interface RoleChangeRequest {
  readonly actorUserId: string;
  readonly actorRole: Role;
  /** null cuando se trata de una invitación a alguien que aún no es miembro. */
  readonly targetUserId: string | null;
  readonly targetCurrentRole: Role | null;
  readonly newRole: Role;
}

export type RoleChangeDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: "MISSING_PERMISSION" | "SELF_CHANGE" | "OWNER_VIA_TRANSFER_ONLY" | "INSUFFICIENT_RANK" };

export interface MemberRemovalRequest {
  readonly actorUserId: string;
  readonly actorRole: Role;
  readonly targetUserId: string;
  readonly targetRole: Role;
}

export type MemberRemovalDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: "MISSING_PERMISSION" | "SELF_CHANGE" | "INSUFFICIENT_RANK" };

/** Quitar a un miembro: solo con members.remove y sobre rangos estrictamente inferiores al propio. */
export function decideMemberRemoval(request: MemberRemovalRequest): MemberRemovalDecision {
  if (!ROLE_PERMISSIONS[request.actorRole].includes("members.remove")) return { allowed: false, reason: "MISSING_PERMISSION" };
  if (request.targetUserId === request.actorUserId) return { allowed: false, reason: "SELF_CHANGE" };
  if (RANK[request.targetRole] >= RANK[request.actorRole]) return { allowed: false, reason: "INSUFFICIENT_RANK" };
  return { allowed: true };
}

/** Reglas anti-escalada para invitar o cambiar el rol de un miembro. */
export function decideRoleChange(request: RoleChangeRequest): RoleChangeDecision {
  const required: Permission = request.targetCurrentRole === null ? "members.invite" : "members.update_role";
  if (!ROLE_PERMISSIONS[request.actorRole].includes(required)) return { allowed: false, reason: "MISSING_PERMISSION" };
  if (request.targetUserId === request.actorUserId) return { allowed: false, reason: "SELF_CHANGE" };
  if (request.newRole === "OWNER") return { allowed: false, reason: "OWNER_VIA_TRANSFER_ONLY" };
  const actorRank = RANK[request.actorRole];
  const targetRank = request.targetCurrentRole === null ? 0 : RANK[request.targetCurrentRole];
  if (targetRank >= actorRank || RANK[request.newRole] >= actorRank) return { allowed: false, reason: "INSUFFICIENT_RANK" };
  return { allowed: true };
}
