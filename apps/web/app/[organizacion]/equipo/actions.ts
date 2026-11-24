"use server";
// Acciones de la pantalla Equipo. Cada una: sesión → contexto verificado de la organización →
// caso de uso de @facturalibre/tenancy (permiso + RLS + auditoría) → mensaje en español → refresh().
import { invitationMessage } from "@facturalibre/auth";
import { requireEnv } from "@facturalibre/database";
import { ROLES, type Role } from "@facturalibre/security";
import {
  changeMemberRole,
  inviteMember,
  removeMember,
  revokeInvitation,
  transferOwnership,
} from "@facturalibre/tenancy";
import type { ActionResult } from "@/components/action-form";
import { ROLE_INFO } from "@/lib/roles";
import { getMailer } from "@/lib/server/auth";
import { getDatabase } from "@/lib/server/db";
import { isSessionFresh } from "@/lib/server/session";
import { formText, reasonMessage, tenantAction } from "@/lib/server/tenant-action";

const REASONS: Readonly<Record<string, string>> = {
  NOT_FOUND: "Ese miembro o invitación ya no existe. Recarga la página.",
  SELF_CHANGE: "No puedes cambiar tu propio rol ni quitarte a ti mismo.",
  OWNER_VIA_TRANSFER_ONLY: "La propiedad solo se cambia con «Transferir propiedad».",
  INSUFFICIENT_RANK: "Solo puedes gestionar a personas con un rol inferior al tuyo.",
  ALREADY_MEMBER: "Esa persona ya es miembro de la organización.",
  STALE_SESSION: "Por seguridad, vuelve a iniciar sesión y repite la transferencia en los 10 minutos siguientes.",
};


const isRole = (value: unknown): value is Role => typeof value === "string" && (ROLES as readonly string[]).includes(value);

export async function inviteAction(slug: string, _previous: ActionResult, data: FormData): Promise<ActionResult> {
  return tenantAction({ slug, returnPath: `/${slug}/equipo` }, async ({ user, context }) => {
    const result = await inviteMember(getDatabase(), context, {
      email: data.get("email"),
      role: data.get("role"),
      taxpayerScope: data.get("taxpayerScope"),
    });
    if (!result.ok) return result.reason === "INVALID" ? { ok: false, message: "", errors: result.errors } : reasonMessage(REASONS, result.reason);
    const { email, role } = result.invitation;
    try {
      await getMailer().send(
        invitationMessage({
          to: email,
          inviterName: user.name,
          tenantName: context.tenant.name,
          roleLabel: ROLE_INFO[role].label,
          url: `${requireEnv("APP_BASE_URL")}/invitacion/${result.token}`,
        }),
      );
    } catch {
      return { ok: true, message: `Invitación creada, pero no hemos podido enviar el email a ${email}. Vuelve a invitar para reenviarlo.` };
    }
    return { ok: true, message: `Invitación enviada a ${email}.` };
  });
}

export async function revokeInvitationAction(slug: string, _previous: ActionResult, data: FormData): Promise<ActionResult> {
  return tenantAction({ slug, returnPath: `/${slug}/equipo` }, async ({ context }) => {
    const result = await revokeInvitation(getDatabase(), context, formText(data, "invitationId"));
    return result.ok ? { ok: true, message: "Invitación anulada." } : reasonMessage(REASONS, result.reason);
  });
}

export async function changeRoleAction(slug: string, _previous: ActionResult, data: FormData): Promise<ActionResult> {
  return tenantAction({ slug, returnPath: `/${slug}/equipo` }, async ({ context }) => {
    const role = data.get("role");
    if (!isRole(role)) return { ok: false, message: "Elige un rol." };
    const result = await changeMemberRole(getDatabase(), context, formText(data, "membershipId"), role);
    return result.ok ? { ok: true, message: `Rol cambiado a ${ROLE_INFO[role].label}.` } : reasonMessage(REASONS, result.reason);
  });
}

export async function removeMemberAction(slug: string, _previous: ActionResult, data: FormData): Promise<ActionResult> {
  return tenantAction({ slug, returnPath: `/${slug}/equipo` }, async ({ context }) => {
    const result = await removeMember(getDatabase(), context, formText(data, "membershipId"));
    return result.ok ? { ok: true, message: "Miembro quitado de la organización." } : reasonMessage(REASONS, result.reason);
  });
}

export async function transferOwnershipAction(slug: string, _previous: ActionResult, data: FormData): Promise<ActionResult> {
  return tenantAction({ slug, returnPath: `/${slug}/equipo` }, async ({ user, context }) => {
    if (formText(data, "confirm") !== context.tenant.slug) {
      return { ok: false, message: `Para confirmar, escribe la dirección de la organización: ${context.tenant.slug}` };
    }
    const result = await transferOwnership(getDatabase(), context, formText(data, "membershipId"), { sessionIsFresh: isSessionFresh(user) });
    return result.ok ? { ok: true, message: "Propiedad transferida. Ahora eres administrador." } : reasonMessage(REASONS, result.reason);
  });
}
