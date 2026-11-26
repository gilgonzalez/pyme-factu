"use client";
// Formularios de la configuración de la empresa: cobro y valores por defecto de las facturas, y logo.
import { useId, type ReactNode } from "react";
import { ActionButton } from "@/components/action-button";
import { ActionForm, type FormAction } from "@/components/action-form";
import { Field } from "@/components/form";
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

const inputClass = "rounded-lg border border-input bg-card px-3 py-2 text-base md:text-sm aria-invalid:border-destructive";

function TextArea({
  name,
  label,
  hint,
  maxLength,
  defaultValue,
  error,
}: {
  readonly name: string;
  readonly label: string;
  readonly hint: string;
  readonly maxLength: number;
  readonly defaultValue: string;
  readonly error: string | undefined;
}) {
  const id = useId();
  const describedBy = [`${id}-ayuda`, error === undefined ? null : `${id}-error`].filter(Boolean).join(" ");
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <textarea
        id={id}
        name={name}
        rows={3}
        maxLength={maxLength}
        defaultValue={defaultValue}
        aria-invalid={error === undefined ? undefined : true}
        aria-describedby={describedBy}
        className={inputClass}
      />
      <p id={`${id}-ayuda`} className="text-sm text-muted-foreground">
        {hint}
      </p>
      {error === undefined ? null : (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function Group({ title, description, children }: { readonly title: string; readonly description: string; readonly children: ReactNode }) {
  return (
    <fieldset className="grid gap-4 border-t pt-5 first:border-t-0 first:pt-0">
      <legend className="sr-only">{title}</legend>
      <div className="grid gap-0.5" aria-hidden="true">
        <p className="font-semibold">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </fieldset>
  );
}

export function BillingSettingsForm({ action, values }: { readonly action: FormAction; readonly values: BillingSettingsValues }) {
  const taxId = useId();
  return (
    <ActionForm action={action} className="grid gap-5" label="Cobro y facturas">
      {({ pending, errors, values: sent }) => {
        const initial = (name: keyof BillingSettingsValues): string => sent[name] ?? values[name];
        return (
          <>
            <Group title="Cobro" description="Cómo te pagan. Sale en la forma de pago de tus borradores y facturas.">
              <div className="grid gap-4 sm:grid-cols-[1fr_13rem]">
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
                  hint="Con 30, vence a los 30 días de la fecha."
                  inputMode="numeric"
                  maxLength={4}
                  defaultValue={initial("paymentTermsDays")}
                  error={errors["paymentTermsDays"]}
                />
              </div>
              <TextArea
                name="paymentInstructions"
                label="Otras instrucciones de pago (opcional)"
                hint="Por ejemplo: «También por Bizum al 600 000 000» o «Pago al contado»."
                maxLength={500}
                defaultValue={initial("paymentInstructions")}
                error={errors["paymentInstructions"]}
              />
            </Group>

            <Group title="Valores por defecto" description="Con qué empieza cada factura nueva. Siempre puedes cambiarlos en la propia factura.">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  name="defaultWithholdingPercent"
                  label="Retención IRPF % (opcional)"
                  hint="Profesionales que facturan a empresas: normalmente 15 (7 los primeros años)."
                  inputMode="decimal"
                  maxLength={6}
                  defaultValue={initial("defaultWithholdingPercent")}
                  error={errors["defaultWithholdingPercent"]}
                />
                <div className="grid content-start gap-1.5">
                  <Label htmlFor={taxId}>IVA de las líneas nuevas</Label>
                  {/* key: tras un error, React reinicia el formulario; así el desplegable vuelve a lo elegido. */}
                  <select
                    key={initial("defaultTaxKey")}
                    id={taxId}
                    name="defaultTaxKey"
                    defaultValue={initial("defaultTaxKey")}
                    aria-invalid={errors["defaultTaxKey"] === undefined ? undefined : true}
                    className="h-10 w-full rounded-lg border border-input bg-card px-3 text-base md:text-sm"
                  >
                    <option value="">IVA 21 % (el general)</option>
                    {TAX_OPTIONS.filter((option) => option.value !== "VAT:2100").map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {errors["defaultTaxKey"] === undefined ? null : <p className="text-sm text-destructive">{errors["defaultTaxKey"]}</p>}
                </div>
              </div>
            </Group>

            <Group title="Textos" description="Lo que acompaña a cada documento.">
              <TextArea
                name="footerNote"
                label="Pie de factura (opcional)"
                hint="Sale al final de cada borrador y factura: condiciones, agradecimiento, protección de datos…"
                maxLength={1000}
                defaultValue={initial("footerNote")}
                error={errors["footerNote"]}
              />
              <TextArea
                name="emailMessage"
                label="Mensaje al enviar por email (opcional)"
                hint="Aparece ya escrito al enviar un borrador o una factura; puedes cambiarlo en cada envío."
                maxLength={2000}
                defaultValue={initial("emailMessage")}
                error={errors["emailMessage"]}
              />
            </Group>

            <div>
              <Button type="submit" size="lg" disabled={pending}>
                {pending ? "Guardando…" : "Guardar configuración"}
              </Button>
            </div>
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
                className="w-full max-w-full min-w-0 text-sm file:mr-3 file:rounded-md file:border file:bg-card file:px-3 file:py-1.5 file:text-sm file:font-medium"
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
