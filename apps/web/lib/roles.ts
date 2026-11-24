import type { Role } from "@facturalibre/security";

/** Nombre y descripción de cada rol tal como se muestran en la interfaz. */
export const ROLE_INFO: Readonly<Record<Role, { readonly label: string; readonly description: string }>> = {
  OWNER: { label: "Propietario", description: "Control total, incluida la propiedad y la desactivación de la organización." },
  ADMIN: { label: "Administrador", description: "Gestiona el equipo, los contribuyentes y la configuración." },
  ACCOUNTANT: { label: "Contable", description: "Emite y rectifica facturas, gestiona clientes y productos." },
  EMPLOYEE: { label: "Empleado", description: "Prepara borradores de factura y gestiona clientes." },
  VIEWER: { label: "Solo lectura", description: "Consulta facturas, clientes e informes sin modificar nada." },
};

/** Roles que se pueden asignar por invitación o cambio de rol (la propiedad solo se transfiere). */
export const ASSIGNABLE_ROLES = ["ADMIN", "ACCOUNTANT", "EMPLOYEE", "VIEWER"] as const satisfies readonly Role[];
