"use client";
// Formulario de datos fiscales de una persona o entidad: contribuyentes (emisores) y clientes (destinatarios).
// Pensado para quien factura por obligación: a la vista solo lo imprescindible (NIF y nombre; en clientes, también
// el email para enviarles la factura); el resto, plegado y abierto solo si ya tiene datos o algún error.
import { provinceForPostalCode } from "@facturalibre/domain";
import type { ChangeEvent, FocusEvent } from "react";
import { ActionForm, type FormAction } from "@/components/action-form";
import { Field, FieldGroup, FieldRow, FormActions } from "@/components/form";
import { MoreFields } from "@/components/form-extras";
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

/** Campos que van plegados («dirección y contacto»); el email solo en contribuyentes (en clientes está a la vista). */
const FOLDED: readonly (keyof PartyValues)[] = ["tradeName", "addressLine", "postalCode", "city", "province", "phone", "website", "registryInfo"];

/** NIF como lo espera Hacienda: sin espacios, guiones ni puntos y en mayúsculas («b-1234567-4» → «B12345674»). */
function tidyNif(event: FocusEvent<HTMLInputElement>): void {
  event.currentTarget.value = event.currentTarget.value.replace(/[\s.\-]/g, "").toUpperCase();
}

/** Con el código postal completo, la provincia se rellena sola (si aún está vacía). */
function fillProvince(event: ChangeEvent<HTMLInputElement>): void {
  const province = event.currentTarget.form?.elements.namedItem("province");
  const found = provinceForPostalCode(event.currentTarget.value);
  if (found !== null && province instanceof HTMLInputElement && province.value.trim() === "") province.value = found;
}

export function PartyForm({ action, label, submitLabel, pendingLabel, values, nif, withTradeName = false, withSurcharge = false, withContact = false }: PartyFormProps) {
  return (
    <ActionForm action={action} className="grid max-w-3xl gap-4" label={label}>
      {({ pending, errors, values: sent }) => {
        const initial = (name: keyof PartyValues): string => sent[name] ?? value(values?.[name]);
        const folded = withContact ? [...FOLDED, "email" as const] : FOLDED;
        const email = (
          <Field
            name="email"
            label="Email de facturación (opcional)"
            hint={withContact ? undefined : "Para enviarle sus facturas con un toque."}
            type="email"
            inputMode="email"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={254}
            placeholder="facturas@empresa.es"
            defaultValue={initial("email")}
            error={errors["email"]}
          />
        );
        return (
          <>
            <FieldGroup>
              <FieldRow columns={nif === "none" ? "" : "sm:grid-cols-[14rem_minmax(0,1fr)]"}>
                {nif === "none" ? null : (
                  <Field
                    name="nif"
                    label={nif === "required" ? "NIF" : "NIF (opcional)"}
                    hint="Lo escribes como quieras: quitamos espacios y guiones y comprobamos la letra."
                    required={nif === "required"}
                    maxLength={15}
                    autoComplete="off"
                    autoCapitalize="characters"
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder="B12345674"
                    onBlur={tidyNif}
                    defaultValue={sent["nif"]}
                    error={errors["nif"]}
                  />
                )}
                <Field
                  name="legalName"
                  label="Nombre y apellidos o razón social"
                  required
                  maxLength={120}
                  autoCapitalize="words"
                  defaultValue={initial("legalName")}
                  error={errors["legalName"]}
                />
              </FieldRow>
              {withContact ? null : <FieldRow>{email}</FieldRow>}
            </FieldGroup>

            {withSurcharge ? (
              <label className="flex items-start gap-3 rounded-xl border bg-card px-3.5 py-3 text-sm">
                <input type="checkbox" name="equivalenceSurcharge" defaultChecked={sent["equivalenceSurcharge"] === "on"} className="mt-0.5" />
                <span>
                  Está en el <strong>recargo de equivalencia</strong> (comercio minorista): sus facturas llevan el recargo además del IVA.
                </span>
              </label>
            ) : null}

            <MoreFields
              label={withContact ? "contacto, dirección y datos registrales" : "dirección"}
              {...(withContact ? {} : { hint: "necesaria si es una empresa o un autónomo" })}
              defaultOpen={nif === "none" || folded.some((name) => initial(name) !== "")}
              forceOpen={folded.some((name) => errors[name] !== undefined)}
            >
              <FieldGroup>
                {withTradeName ? (
                  <FieldRow>
                    <Field name="tradeName" label="Nombre comercial (opcional)" maxLength={120} autoCapitalize="words" defaultValue={initial("tradeName")} error={errors["tradeName"]} />
                  </FieldRow>
                ) : null}
                {withContact ? (
                  <FieldRow columns="sm:grid-cols-[minmax(0,1fr)_15rem]">
                    {email}
                    <Field
                      name="phone"
                      label="Teléfono (opcional)"
                      type="tel"
                      inputMode="tel"
                      maxLength={30}
                      autoComplete="tel"
                      placeholder="600 000 000"
                      defaultValue={initial("phone")}
                      error={errors["phone"]}
                    />
                  </FieldRow>
                ) : null}
                <FieldRow>
                  <Field
                    name="addressLine"
                    label="Dirección (opcional)"
                    maxLength={200}
                    autoComplete="street-address"
                    placeholder="Calle, número, piso"
                    defaultValue={initial("addressLine")}
                    error={errors["addressLine"]}
                  />
                </FieldRow>
                <FieldRow columns="grid-cols-2 sm:grid-cols-[10rem_minmax(0,1fr)_minmax(0,1fr)] [&>*:last-child]:col-span-full sm:[&>*:last-child]:col-span-1">
                  <Field
                    name="postalCode"
                    label="Código postal (opcional)"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={5}
                    autoComplete="postal-code"
                    placeholder="28001"
                    onChange={fillProvince}
                    defaultValue={initial("postalCode")}
                    error={errors["postalCode"]}
                  />
                  <Field name="city" label="Municipio (opcional)" maxLength={100} autoComplete="address-level2" autoCapitalize="words" defaultValue={initial("city")} error={errors["city"]} />
                  <Field
                    name="province"
                    label="Provincia (opcional)"
                    maxLength={100}
                    autoComplete="address-level1"
                    autoCapitalize="words"
                    defaultValue={initial("province")}
                    error={errors["province"]}
                  />
                </FieldRow>
                {withContact ? (
                  <>
                    <FieldRow>
                      <Field
                        name="website"
                        label="Web (opcional)"
                        inputMode="url"
                        autoCapitalize="none"
                        spellCheck={false}
                        maxLength={200}
                        autoComplete="url"
                        placeholder="www.tuempresa.es"
                        defaultValue={initial("website")}
                        error={errors["website"]}
                      />
                    </FieldRow>
                    <FieldRow>
                      <Field
                        name="registryInfo"
                        label="Datos registrales (opcional)"
                        hint="Solo si eres una sociedad. Sale al pie de tus facturas."
                        maxLength={300}
                        placeholder="Inscrita en el Registro Mercantil de …, tomo …, folio …, hoja …"
                        defaultValue={initial("registryInfo")}
                        error={errors["registryInfo"]}
                      />
                    </FieldRow>
                  </>
                ) : null}
              </FieldGroup>
            </MoreFields>

            <FormActions sticky={withContact}>
              <Button type="submit" size="lg" disabled={pending}>
                {pending ? pendingLabel : submitLabel}
              </Button>
            </FormActions>
          </>
        );
      }}
    </ActionForm>
  );
}
