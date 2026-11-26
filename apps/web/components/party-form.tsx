"use client";
// Formulario de datos fiscales de una persona o entidad: contribuyentes (emisores) y clientes (destinatarios).
import { ActionForm, type FormAction } from "@/components/action-form";
import { Field } from "@/components/form";
import { Button } from "@/components/ui/button";

export interface PartyValues {
  readonly legalName?: string;
  readonly tradeName?: string | null;
  readonly addressLine?: string | null;
  readonly postalCode?: string | null;
  readonly city?: string | null;
  readonly province?: string | null;
  readonly email?: string | null;
  readonly phone?: string | null;
  readonly website?: string | null;
  readonly registryInfo?: string | null;
}

export interface PartyFormProps {
  readonly action: FormAction;
  readonly label: string;
  readonly submitLabel: string;
  readonly pendingLabel: string;
  readonly values?: PartyValues | undefined;
  /** NIF obligatorio (alta de contribuyente), opcional (cliente) o ausente (edición: el NIF no cambia). */
  readonly nif: "required" | "optional" | "none";
  readonly withTradeName?: boolean;
  /** Casilla «recargo de equivalencia» (solo clientes). */
  readonly withSurcharge?: boolean;
  /** Teléfono, web y datos registrales (contribuyentes: se imprimen en sus facturas). */
  readonly withContact?: boolean;
}

const value = (input: string | null | undefined): string => input ?? "";

export function PartyForm({ action, label, submitLabel, pendingLabel, values, nif, withTradeName = false, withSurcharge = false, withContact = false }: PartyFormProps) {
  return (
    <ActionForm action={action} className="grid gap-4 sm:grid-cols-2" label={label}>
      {({ pending, errors, values: sent }) => {
        const initial = (name: keyof PartyValues): string => sent[name] ?? value(values?.[name]);
        return (
          <>
            {nif === "none" ? null : (
              <Field
                name="nif"
                label={nif === "required" ? "NIF" : "NIF (opcional)"}
                hint="DNI, NIE o NIF de la empresa. Comprobamos la letra o el dígito de control."
                required={nif === "required"}
                maxLength={15}
                autoComplete="off"
                autoCapitalize="characters"
                defaultValue={sent["nif"]}
                error={errors["nif"]}
              />
            )}
            <Field name="legalName" label="Nombre y apellidos o razón social" required maxLength={120} defaultValue={initial("legalName")} error={errors["legalName"]} />
            {withTradeName ? (
              <Field name="tradeName" label="Nombre comercial (opcional)" maxLength={120} defaultValue={initial("tradeName")} error={errors["tradeName"]} />
            ) : null}
            <Field name="email" label="Email de facturación (opcional)" type="email" maxLength={254} defaultValue={initial("email")} error={errors["email"]} />
            <Field name="addressLine" label="Dirección (opcional)" maxLength={200} autoComplete="street-address" defaultValue={initial("addressLine")} error={errors["addressLine"]} />
            <Field name="postalCode" label="Código postal (opcional)" inputMode="numeric" maxLength={5} autoComplete="postal-code" defaultValue={initial("postalCode")} error={errors["postalCode"]} />
            <Field name="city" label="Municipio (opcional)" maxLength={100} autoComplete="address-level2" defaultValue={initial("city")} error={errors["city"]} />
            <Field name="province" label="Provincia (opcional)" maxLength={100} autoComplete="address-level1" defaultValue={initial("province")} error={errors["province"]} />
            {withContact ? (
              <>
                <Field name="phone" label="Teléfono (opcional)" type="tel" maxLength={30} autoComplete="tel" defaultValue={initial("phone")} error={errors["phone"]} />
                <Field name="website" label="Web (opcional)" maxLength={200} autoComplete="url" placeholder="www.tuempresa.es" defaultValue={initial("website")} error={errors["website"]} />
                <div className="sm:col-span-2">
                  <Field
                    name="registryInfo"
                    label="Datos registrales (opcional)"
                    hint="Si eres una sociedad: «Inscrita en el Registro Mercantil de …, tomo …, folio …, hoja …». Sale al pie de tus facturas."
                    maxLength={300}
                    defaultValue={initial("registryInfo")}
                    error={errors["registryInfo"]}
                  />
                </div>
              </>
            ) : null}
            {withSurcharge ? (
              <label className="flex items-start gap-2 text-sm sm:col-span-2">
                <input type="checkbox" name="equivalenceSurcharge" defaultChecked={sent["equivalenceSurcharge"] === "on"} className="mt-1" />
                <span>
                  Está en el <strong>recargo de equivalencia</strong> (comercio minorista): sus facturas llevan el recargo además del IVA.
                </span>
              </label>
            ) : null}
            <div className="sm:col-span-2">
              <Button type="submit" size="lg" disabled={pending}>
                {pending ? pendingLabel : submitLabel}
              </Button>
            </div>
          </>
        );
      }}
    </ActionForm>
  );
}
