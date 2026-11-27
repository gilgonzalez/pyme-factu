"use client";
// Formularios de la configuración de la empresa: cobro y valores por defecto de las facturas, y logo.
import { useId, type ReactNode } from "react";
import { ActionButton } from "@/components/action-button";
import { ActionForm, type FormAction } from "@/components/action-form";
import { Field, FieldGroup, FieldRow, FormActions, TextAreaField } from "@/components/form";
import { SelectField } from "@/components/select-field";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { TAX_OPTIONS } from "@/lib/invoicing";

/** Valores ya formateados para los campos (IBAN agrupado, porcentaje con coma…). */
export interface BillingSettingsValues {
  readonly iban: string;
  readonly paymentInstructions: string;
  readonly paymentTermsDays: string;
  readonly defaultWithholdingPercent: string;
  readonly defaultTaxKey: string;
  readonly footerNote: string;
  readonly emailMessage: string;
}

/** Bloque con su título y explicación encima de las celdas. */
function Group({ title, description, children }: { readonly title: string; readonly description: string; readonly children: ReactNode }) {
  return (
    <fieldset className="grid gap-3">
      <legend className="sr-only">{title}</legend>
      <div className="grid gap-0.5" aria-hidden="true">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </fieldset>
  );
}

const TAX_DEFAULTS = [{ value: "", label: "IVA 21 % (el general)" }, ...TAX_OPTIONS.filter((option) => option.value !== "VAT:2100")];

export function BillingSettingsForm({ action, values }: { readonly action: FormAction; readonly values: BillingSettingsValues }) {
  return (
    <ActionForm action={action} className="grid max-w-3xl gap-7" label="Cobro y facturas">
      {({ pending, errors, values: sent }) => {
        const initial = (name: keyof BillingSettingsValues): string => sent[name] ?? values[name];
        return (
          <>
            <Group title="Cobro" description="Cómo te pagan. Sale en la forma de pago de tus borradores y facturas.">
              <FieldGroup>
                <FieldRow columns="sm:grid-cols-[minmax(0,1fr)_12rem]">
                  <Field
                    name="iban"
                    label="IBAN para transferencias (opcional)"
                    autoComplete="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    maxLength={42}
                    placeholder="ES00 0000 0000 0000 0000 0000"
                    defaultValue={initial("iban")}
                    error={errors["iban"]}
                  />
                  <Field
                    name="paymentTermsDays"
                    label="Plazo de pago (días)"
                    hint="Con 30, vence a los 30 días."
                    inputMode="numeric"
                    maxLength={4}
                    placeholder="p. ej. 30"
                    defaultValue={initial("paymentTermsDays")}
                    error={errors["paymentTermsDays"]}
                  />
                </FieldRow>
                <FieldRow>
                  <TextAreaField
                    name="paymentInstructions"
                    label="Otras instrucciones de pago (opcional)"
                    hint="Por ejemplo: «También por Bizum al 600 000 000» o «Pago al contado»."
                    maxLength={500}
                    rows={2}
                    defaultValue={initial("paymentInstructions")}
                    error={errors["paymentInstructions"]}
                  />
                </FieldRow>
              </FieldGroup>
            </Group>

            <Group title="Valores por defecto" description="Con qué empieza cada factura nueva. Siempre puedes cambiarlos en la propia factura.">
              <FieldGroup>
                <FieldRow columns="sm:grid-cols-2">
                  <Field
                    name="defaultWithholdingPercent"
                    label="Retención IRPF % (opcional)"
                    hint="Profesionales que facturan a empresas: normalmente 15."
                    inputMode="decimal"
                    maxLength={6}
                    placeholder="p. ej. 15"
                    defaultValue={initial("defaultWithholdingPercent")}
                    error={errors["defaultWithholdingPercent"]}
                  />
                  {/* key: tras un error, React reinicia el formulario; así el desplegable vuelve a lo elegido. */}
                  <SelectField
                    key={initial("defaultTaxKey")}
                    name="defaultTaxKey"
                    label="IVA de las líneas nuevas"
                    defaultValue={initial("defaultTaxKey")}
                    options={TAX_DEFAULTS}
                    error={errors["defaultTaxKey"]}
                  />
                </FieldRow>
              </FieldGroup>
            </Group>

            <Group title="Textos" description="Lo que acompaña a cada documento.">
              <FieldGroup>
                <FieldRow>
                  <TextAreaField
                    name="footerNote"
                    label="Pie de factura (opcional)"
                    hint="Sale al final de cada borrador y factura: condiciones, agradecimiento, protección de datos…"
                    maxLength={1000}
                    defaultValue={initial("footerNote")}
                    error={errors["footerNote"]}
                  />
                </FieldRow>
                <FieldRow>
                  <TextAreaField
                    name="emailMessage"
                    label="Mensaje al enviar por email (opcional)"
                    hint="Aparece ya escrito al enviar un borrador o una factura; puedes cambiarlo en cada envío."
                    maxLength={2000}
                    defaultValue={initial("emailMessage")}
                    error={errors["emailMessage"]}
                  />
                </FieldRow>
              </FieldGroup>
            </Group>

            <FormActions sticky>
              <Button type="submit" size="lg" disabled={pending}>
                {pending ? "Guardando…" : "Guardar configuración"}
              </Button>
            </FormActions>
          </>
        );
      }}
    </ActionForm>
  );
}

/** Logo: vista previa, subir uno nuevo (PNG o JPEG hasta 512 KB) o quitarlo. */
export function LogoForm({
  upload,
  remove,
  logoUrl,
}: {
  readonly upload: FormAction;
  readonly remove: FormAction;
  /** null si no hay logo. */
  readonly logoUrl: string | null;
}) {
  const inputId = useId();
  return (
    <div className="flex flex-wrap items-start gap-5">
      <div className="grid size-32 shrink-0 place-items-center rounded-lg border border-dashed bg-subtle p-2">
        {logoUrl === null ? (
          <span className="text-center text-xs text-muted-foreground">Sin logo</span>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- imagen privada servida por la propia app
          <img src={logoUrl} alt="Logo actual de la empresa" className="max-h-full max-w-full object-contain" />
        )}
      </div>
      <div className="grid min-w-0 flex-1 gap-3">
        <ActionForm action={upload} className="grid min-w-0 gap-2" label="Subir logo">
          {({ pending, errors }) => (
            <>
              <Label htmlFor={inputId}>{logoUrl === null ? "Sube tu logo" : "Cambiar el logo"}</Label>
              <input
                id={inputId}
                type="file"
                name="logo"
                required
                accept="image/png,image/jpeg"
                aria-invalid={errors["logo"] === undefined ? undefined : true}
                aria-describedby={`${inputId}-ayuda`}
                className="w-full max-w-full min-w-0 cursor-pointer text-sm text-muted-foreground file:mr-3 file:cursor-pointer file:rounded-lg file:border file:border-border file:bg-card file:px-3.5 file:py-2 file:text-sm file:font-medium file:text-foreground file:shadow-[0_1px_2px_rgb(16_16_32/0.05)] hover:file:bg-subtle"
              />
              <p id={`${inputId}-ayuda`} className="text-sm text-muted-foreground">
                PNG o JPEG de hasta 512 KB. Sale arriba a la derecha en tus borradores y facturas.
              </p>
              {errors["logo"] === undefined ? null : <p className="text-sm text-destructive">{errors["logo"]}</p>}
              <div>
                <Button type="submit" variant="outline" disabled={pending}>
                  {pending ? "Subiendo…" : "Subir logo"}
                </Button>
              </div>
            </>
          )}
        </ActionForm>
        {logoUrl === null ? null : <ActionButton action={remove} label="Quitar el logo" idle="Quitar logo" busy="Quitando…" variant="destructive" />}
      </div>
    </div>
  );
}
