"use client";
import type { Role } from "@facturalibre/security";
import { ActionForm, type FormAction } from "@/components/action-form";
import { Field } from "@/components/form";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/select-field";
import { ROLE_INFO } from "@/lib/roles";

export interface TaxpayerValues {
  readonly legalName?: string;
  readonly tradeName?: string | null;
  readonly addressLine?: string | null;
  readonly postalCode?: string | null;
  readonly city?: string | null;
  readonly province?: string | null;
  readonly email?: string | null;
}

const value = (input: string | null | undefined): string => input ?? "";

/** Alta (con NIF) o edición (sin NIF: es la identidad fiscal y no cambia) de un contribuyente. */
export function TaxpayerForm({ action, values, withNif }: { readonly action: FormAction; readonly values?: TaxpayerValues; readonly withNif: boolean }) {
  return (
    <ActionForm action={action} className="grid gap-4 sm:grid-cols-2" label={withNif ? "Nuevo contribuyente" : "Datos del contribuyente"}>
      {({ pending, errors, values: sent }) => (
        <>
          {withNif ? (
            <Field
              name="nif"
              label="NIF"
              hint="DNI, NIE o NIF de la empresa. Comprobamos la letra o el dígito de control."
              required
              maxLength={15}
              autoComplete="off"
              autoCapitalize="characters"
              defaultValue={sent["nif"]}
              error={errors["nif"]}
            />
          ) : null}
          <Field name="legalName" label="Nombre y apellidos o razón social" required maxLength={120} defaultValue={sent["legalName"] ?? value(values?.legalName)} error={errors["legalName"]} />
          <Field name="tradeName" label="Nombre comercial (opcional)" maxLength={120} defaultValue={sent["tradeName"] ?? value(values?.tradeName)} error={errors["tradeName"]} />
          <Field name="email" label="Email de facturación (opcional)" type="email" maxLength={254} defaultValue={sent["email"] ?? value(values?.email)} error={errors["email"]} />
          <Field name="addressLine" label="Dirección (opcional)" maxLength={200} autoComplete="street-address" defaultValue={sent["addressLine"] ?? value(values?.addressLine)} error={errors["addressLine"]} />
          <Field name="postalCode" label="Código postal (opcional)" inputMode="numeric" maxLength={5} autoComplete="postal-code" defaultValue={sent["postalCode"] ?? value(values?.postalCode)} error={errors["postalCode"]} />
          <Field name="city" label="Municipio (opcional)" maxLength={100} autoComplete="address-level2" defaultValue={sent["city"] ?? value(values?.city)} error={errors["city"]} />
          <Field name="province" label="Provincia (opcional)" maxLength={100} autoComplete="address-level1" defaultValue={sent["province"] ?? value(values?.province)} error={errors["province"]} />
          <div className="sm:col-span-2">
            <Button type="submit" size="lg" disabled={pending}>
              {withNif ? (pending ? "Dando de alta…" : "Dar de alta") : pending ? "Guardando…" : "Guardar cambios"}
            </Button>
          </div>
        </>
      )}
    </ActionForm>
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
        <li key={row.membershipId} className="flex flex-wrap items-end justify-between gap-3 rounded-xl border p-4">
          <span className="grid">
            <span className="font-medium">
              {row.name} {row.isMe ? <span className="text-sm font-normal text-muted-foreground">(tú)</span> : null}
            </span>
            <span className="text-sm text-muted-foreground">
              {row.email} · {ROLE_INFO[row.role].label}
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
