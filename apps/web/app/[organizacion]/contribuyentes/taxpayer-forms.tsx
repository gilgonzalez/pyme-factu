"use client";
import type { Role } from "@facturalibre/security";
import { ActionForm, type FormAction } from "@/components/action-form";
import { PartyForm, type PartyValues } from "@/components/party-form";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/select-field";
import { ROLE_INFO } from "@/lib/roles";

export type { PartyValues as TaxpayerValues } from "@/components/party-form";

/** Alta (con NIF) o edición (sin NIF: es la identidad fiscal y no cambia) de un contribuyente. */
export function TaxpayerForm({ action, values, withNif }: { readonly action: FormAction; readonly values?: PartyValues; readonly withNif: boolean }) {
  return (
    <PartyForm
      action={action}
      values={values}
      nif={withNif ? "required" : "none"}
      withTradeName
      withContact
      label={withNif ? "Nuevo contribuyente" : "Datos del contribuyente"}
      submitLabel={withNif ? "Dar de alta" : "Guardar cambios"}
      pendingLabel={withNif ? "Dando de alta…" : "Guardando…"}
    />
  );
}

export interface AccessRow {
  readonly membershipId: string;
  readonly name: string;
  readonly email: string;
  readonly role: Role;
  readonly scope: "ALL_TAXPAYERS" | "ASSIGNED_TAXPAYERS";
  readonly access: "FULL" | "READ_ONLY" | "NONE";
  readonly isMe: boolean;
}

const ACCESS_LABEL = { FULL: "Completo", READ_ONLY: "Solo lectura", NONE: "Sin acceso" } as const;

function AccessSelect({ defaultValue }: { readonly defaultValue: AccessRow["access"] }) {
  return (
    <SelectField
      name="access"
      label="Acceso"
      defaultValue={defaultValue}
      options={(Object.keys(ACCESS_LABEL) as AccessRow["access"][]).map((level) => ({ value: level, label: ACCESS_LABEL[level] }))}
    />
  );
}

/** Quién accede a este contribuyente. Solo se edita a quien tiene alcance «contribuyentes asignados». */
export function AccessManager({ rows, action }: { readonly rows: readonly AccessRow[]; readonly action: FormAction }) {
  return (
    <ul className="grid gap-3">
      {rows.map((row) => (
        <li key={row.membershipId} className="flex flex-wrap items-end justify-between gap-3 surface p-5">
          <span className="grid">
            <span className="font-medium">
              {row.name} {row.isMe ? <span className="text-sm font-normal text-muted-foreground">(tú)</span> : null}
            </span>
            <span className="text-sm text-muted-foreground">
              {row.email}, {ROLE_INFO[row.role].label.toLowerCase()}
            </span>
          </span>
          {row.scope === "ALL_TAXPAYERS" || row.isMe ? (
            <span className="text-sm text-muted-foreground">
              {row.scope === "ALL_TAXPAYERS" ? "Completo (accede a todos los contribuyentes)" : ACCESS_LABEL[row.access]}
            </span>
          ) : (
            <ActionForm action={action} className="flex flex-wrap items-end gap-2" label={`Acceso de ${row.name}`}>
              {({ pending }) => (
                <>
                  <input type="hidden" name="membershipId" value={row.membershipId} />
                  <AccessSelect defaultValue={row.access} />
                  <Button type="submit" variant="outline" disabled={pending}>
                    Guardar
                  </Button>
                </>
              )}
            </ActionForm>
          )}
        </li>
      ))}
    </ul>
  );
}
