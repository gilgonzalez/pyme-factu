"use client";
import type { Role } from "@facturalibre/security";
import { ActionForm, type FormAction } from "@/components/action-form";
import { Field } from "@/components/form";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/select-field";
import { ASSIGNABLE_ROLES, ROLE_INFO } from "@/lib/roles";

export interface TeamMemberView {
  readonly membershipId: string;
  readonly name: string;
  readonly email: string;
  readonly role: Role;
  readonly isMe: boolean;
}

export interface InvitationView {
  readonly id: string;
  readonly email: string;
  readonly role: Role;
  readonly expiresOn: string;
  readonly invitedByName: string;
}

export interface TeamManagerProps {
  readonly slug: string;
  readonly members: readonly TeamMemberView[];
  readonly invitations: readonly InvitationView[];
  readonly can: { readonly invite: boolean; readonly changeRole: boolean; readonly remove: boolean; readonly transfer: boolean };
  readonly actions: { readonly invite: FormAction; readonly revoke: FormAction; readonly changeRole: FormAction; readonly remove: FormAction; readonly transfer: FormAction };
}

function RoleSelect({ name, defaultValue, label }: { readonly name: string; readonly defaultValue?: Role; readonly label: string }) {
  return (
    <SelectField
      name={name}
      label={label}
      defaultValue={defaultValue ?? "EMPLOYEE"}
      options={ASSIGNABLE_ROLES.map((role) => ({ value: role, label: `${ROLE_INFO[role].label} — ${ROLE_INFO[role].description}` }))}
    />
  );
}

function InviteSection({ action }: { readonly action: FormAction }) {
  return (
    <section aria-labelledby="invitar" className="grid gap-3 rounded-xl border p-4">
      <h2 id="invitar" className="font-medium">
        Invitar a alguien
      </h2>
      <ActionForm action={action} className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end" label="Invitar a alguien">
        {({ pending, errors, values }) => (
          <>
            <Field name="email" label="Email" type="email" required maxLength={254} autoComplete="off" defaultValue={values["email"]} error={errors["email"]} />
            <RoleSelect name="role" label="Rol" />
            <SelectField
              name="taxpayerScope"
              label="Contribuyentes"
              defaultValue="ALL_TAXPAYERS"
              options={[
                { value: "ALL_TAXPAYERS", label: "Todos" },
                { value: "ASSIGNED_TAXPAYERS", label: "Solo los que se le asignen" },
              ]}
            />
            <Button type="submit" disabled={pending}>
              {pending ? "Enviando…" : "Enviar invitación"}
            </Button>
          </>
        )}
      </ActionForm>
      <p className="text-sm text-muted-foreground">La invitación caduca en 7 días y solo puede aceptarla la cuenta de ese email.</p>
    </section>
  );
}

function MemberActions({ member, props }: { readonly member: TeamMemberView; readonly props: TeamManagerProps }) {
  if (member.isMe || member.role === "OWNER") return null;
  const hidden = <input type="hidden" name="membershipId" value={member.membershipId} />;
  return (
    <div className="flex flex-wrap items-end gap-3">
      {props.can.changeRole ? (
        <ActionForm action={props.actions.changeRole} className="flex flex-wrap items-end gap-2" label={`Cambiar rol de ${member.name}`}>
          {({ pending }) => (
            <>
              {hidden}
              <RoleSelect name="role" defaultValue={member.role} label="Rol" />
              <Button type="submit" variant="outline" disabled={pending}>
                Cambiar rol
              </Button>
            </>
          )}
        </ActionForm>
      ) : null}
      {props.can.remove ? (
        <ActionForm action={props.actions.remove} label={`Quitar a ${member.name}`}>
          {({ pending }) => (
            <>
              {hidden}
              <Button type="submit" variant="destructive" disabled={pending}>
                Quitar
              </Button>
            </>
          )}
        </ActionForm>
      ) : null}
      {props.can.transfer ? (
        <details className="basis-full text-sm">
          <summary className="cursor-pointer text-muted-foreground">Transferir la propiedad a {member.name}</summary>
          <ActionForm action={props.actions.transfer} className="mt-2 grid max-w-md gap-2" label={`Transferir la propiedad a ${member.name}`}>
            {({ pending }) => (
              <>
                {hidden}
                <p>Pasarás a ser administrador y {member.name} será el nuevo propietario. Esta acción no se puede deshacer tú solo.</p>
                <Field name="confirm" label={`Escribe «${props.slug}» para confirmar`} required autoComplete="off" />
                <Button type="submit" variant="destructive" disabled={pending}>
                  Transferir propiedad
                </Button>
              </>
            )}
          </ActionForm>
        </details>
      ) : null}
    </div>
  );
}

export function TeamManager(props: TeamManagerProps) {
  return (
    <div className="grid gap-8">
      {props.can.invite ? <InviteSection action={props.actions.invite} /> : null}

      <section aria-labelledby="miembros" className="grid gap-3">
        <h2 id="miembros" className="font-medium">
          Miembros ({props.members.length})
        </h2>
        <ul className="grid gap-3">
          {props.members.map((member) => (
            <li key={member.membershipId} className="grid gap-3 rounded-xl border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="grid">
                  <span className="font-medium">
                    {member.name} {member.isMe ? <span className="text-sm font-normal text-muted-foreground">(tú)</span> : null}
                  </span>
                  <span className="text-sm text-muted-foreground">{member.email}</span>
                </span>
                <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">{ROLE_INFO[member.role].label}</span>
              </div>
              <MemberActions member={member} props={props} />
            </li>
          ))}
        </ul>
      </section>

      {props.invitations.length === 0 ? null : (
        <section aria-labelledby="pendientes" className="grid gap-3">
          <h2 id="pendientes" className="font-medium">
            Invitaciones pendientes
          </h2>
          <ul className="grid gap-3">
            {props.invitations.map((invitation) => (
              <li key={invitation.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
                <span className="grid">
                  <span className="font-medium">{invitation.email}</span>
                  <span className="text-sm text-muted-foreground">
                    {ROLE_INFO[invitation.role].label} · invitado por {invitation.invitedByName} · caduca el {invitation.expiresOn}
                  </span>
                </span>
                {props.can.invite ? (
                  <ActionForm action={props.actions.revoke} label={`Anular la invitación a ${invitation.email}`}>
                    {({ pending }) => (
                      <>
                        <input type="hidden" name="invitationId" value={invitation.id} />
                        <Button type="submit" variant="outline" disabled={pending}>
                          Anular
                        </Button>
                      </>
                    )}
                  </ActionForm>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
