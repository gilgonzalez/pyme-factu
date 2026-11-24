import { listInvitations, listMembers } from "@facturalibre/tenancy";
import type { Metadata } from "next";
import { Suspense } from "react";
import { FormAlert } from "@/components/form";
import { TenantFrame } from "@/components/tenant-frame";
import { getDatabase } from "@/lib/server/db";
import { requireTenant } from "@/lib/server/session";
import { changeRoleAction, inviteAction, removeMemberAction, revokeInvitationAction, transferOwnershipAction } from "./actions";
import { TeamManager } from "./team-manager";

export const metadata: Metadata = { title: "Equipo" };

const dateFormat = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Madrid" });

export default function TeamPage({ params }: PageProps<"/[organizacion]/equipo">) {
  return (
    <Suspense fallback={<p className="p-6 text-muted-foreground">Cargando el equipo…</p>}>
      <Team params={params} />
    </Suspense>
  );
}

async function Team({ params }: { readonly params: PageProps<"/[organizacion]/equipo">["params"] }) {
  const { organizacion } = await params;
  const { user, context } = await requireTenant(organizacion, `/${organizacion}/equipo`);
  const can = (permission: Parameters<typeof context.permissions.has>[0]) => context.permissions.has(permission);

  if (!can("members.read")) {
    return (
      <TenantFrame user={user} context={context} current="equipo">
        <FormAlert tone="error">Tu rol no permite ver el equipo de esta organización.</FormAlert>
      </TenantFrame>
    );
  }

  const db = getDatabase();
  const [members, invitations] = await Promise.all([listMembers(db, context), listInvitations(db, context)]);
  const slug = context.tenant.slug;

  return (
    <TenantFrame user={user} context={context} current="equipo">
      <div className="grid gap-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Equipo</h1>
        <p className="text-muted-foreground">Quién tiene acceso a {context.tenant.name} y con qué rol.</p>
      </div>
      <TeamManager
        slug={slug}
        members={members.map((member) => ({
          membershipId: member.membershipId,
          name: member.name,
          email: member.email,
          role: member.role,
          isMe: member.userId === user.id,
        }))}
        invitations={invitations.map((invitation) => ({
          id: invitation.id,
          email: invitation.email,
          role: invitation.role,
          invitedByName: invitation.invitedByName,
          expiresOn: dateFormat.format(invitation.expiresAt),
        }))}
        can={{
          invite: can("members.invite"),
          changeRole: can("members.update_role"),
          remove: can("members.remove"),
          transfer: can("tenant.transfer_ownership"),
        }}
        actions={{
          invite: inviteAction.bind(null, slug),
          revoke: revokeInvitationAction.bind(null, slug),
          changeRole: changeRoleAction.bind(null, slug),
          remove: removeMemberAction.bind(null, slug),
          transfer: transferOwnershipAction.bind(null, slug),
        }}
      />
    </TenantFrame>
  );
}
