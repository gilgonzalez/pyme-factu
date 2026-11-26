"use client";
import { ActionButton } from "@/components/action-button";
import { ActionForm, type FormAction } from "@/components/action-form";
import { Field } from "@/components/form";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/select-field";
import { Button } from "@/components/ui/button";
import { RECTIFICATION_OPTIONS } from "@/lib/invoicing";

/** Emitir: asigna número y la factura queda inalterable. Se pide confirmación explícita. */
export function IssueForm({ action, total }: { readonly action: FormAction; readonly total: string }) {
  return (
    <ActionForm action={action} className="grid gap-2" label="Emitir la factura">
      {({ pending }) => (
        <>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="confirm" required className="mt-1" />
            <span>
              He revisado la factura ({total}). Al emitirla recibe número y <strong>ya no se podrá modificar</strong>; para corregirla habrá
              que rectificarla.
            </span>
          </label>
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? "Emitiendo…" : "Emitir factura"}
          </Button>
        </>
      )}
    </ActionForm>
  );
}

/**
 * Enviar al cliente por email, con el PDF adjunto. El destinatario se propone con el email del cliente y se
 * puede cambiar; el mensaje es opcional.
 */
export function SendForm({
  action,
  defaultTo,
  defaultNote,
  draft,
}: {
  readonly action: FormAction;
  readonly defaultTo: string;
  /** Mensaje predeterminado de la configuración de la empresa. */
  readonly defaultNote: string;
  readonly draft: boolean;
}) {
  return (
    <ActionForm action={action} className="grid gap-3" label={draft ? "Enviar el borrador al cliente" : "Enviar la factura al cliente"}>
      {({ pending, errors, values }) => (
        <>
          <Field
            name="to"
            type="email"
            label="Email del cliente"
            required
            autoComplete="email"
            maxLength={254}
            defaultValue={values["to"] ?? defaultTo}
            error={errors["to"]}
          />
          <div className="grid gap-1.5">
            <Label htmlFor="envio-mensaje">Mensaje (opcional)</Label>
            <textarea
              id="envio-mensaje"
              name="note"
              maxLength={2000}
              rows={3}
              defaultValue={values["note"] ?? defaultNote}
              aria-invalid={errors["note"] === undefined ? undefined : true}
              aria-describedby={errors["note"] === undefined ? undefined : "envio-mensaje-error"}
              className="field field-textarea"
            />
            {errors["note"] === undefined ? null : (
              <p id="envio-mensaje-error" className="text-sm text-destructive">
                {errors["note"]}
              </p>
            )}
          </div>
          <Button type="submit" variant={draft ? "default" : "outline"} disabled={pending}>
            {pending ? "Enviando…" : draft ? "Enviar borrador" : "Enviar factura"}
          </Button>
        </>
      )}
    </ActionForm>
  );
}

export const DeleteDraftForm = ({ action }: { readonly action: FormAction }) => (
  <ActionButton action={action} label="Borrar el borrador" idle="Borrar borrador" busy="Borrando…" variant="destructive" />
);

export function RectifyForm({ action }: { readonly action: FormAction }) {
  return (
    <ActionForm action={action} className="grid max-w-xl gap-3" label="Rectificar la factura">
      {({ pending, errors, values }) => (
        <>
          <Field
            name="reason"
            label="Motivo de la rectificación"
            hint="Constará en la factura rectificativa. Por ejemplo: «Precio unitario incorrecto»."
            required
            maxLength={500}
            defaultValue={values["reason"]}
            error={errors["reason"]}
          />
          <SelectField
            name="code"
            label="Tipo de rectificación"
            placeholder="Elige el supuesto…"
            defaultValue={RECTIFICATION_OPTIONS.find((option) => option.value === values["code"])?.value ?? ""}
            options={RECTIFICATION_OPTIONS}
            error={errors["code"]}
          />
          <Button type="submit" variant="outline" disabled={pending}>
            {pending ? "Preparando…" : "Preparar factura rectificativa"}
          </Button>
        </>
      )}
    </ActionForm>
  );
}

/**
 * Anular: solo para una factura expedida por error, sin operación real (OM HAC/1177/2024, art. 11). Si hubo
 * operación y hay que corregirla, lo que procede es una rectificativa.
 */
export function AnnulForm({ action }: { readonly action: FormAction }) {
  return (
    <ActionForm action={action} className="grid max-w-xl gap-3" label="Anular la factura">
      {({ pending, errors, values }) => (
        <>
          <Field
            name="reason"
            label="Por qué se anula"
            hint="Por ejemplo: «Expedida por error: no hubo venta»."
            required
            maxLength={500}
            defaultValue={values["reason"]}
            error={errors["reason"]}
          />
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="confirm" required className="mt-1" />
            <span>
              Confirmo que esta factura se expidió por error y <strong>no corresponde a ninguna operación real</strong>. Se generará un registro de
              anulación que no se puede deshacer.
            </span>
          </label>
          <Button type="submit" variant="destructive" disabled={pending}>
            {pending ? "Anulando…" : "Anular factura"}
          </Button>
        </>
      )}
    </ActionForm>
  );
}
