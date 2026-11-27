"use client";
import { ActionForm, type FormAction } from "@/components/action-form";
import { Field, FieldGroup, FieldRow, FormActions } from "@/components/form";
import { SelectField } from "@/components/select-field";
import { Button } from "@/components/ui/button";
import { TAX_OPTIONS } from "@/lib/invoicing";

/** Alta de producto: en fila en su pantalla; apilado (`stacked`) dentro de una ventana, con el nombre ya escrito. */
export function ProductForm({ action, defaultName = "", stacked = false }: { readonly action: FormAction; readonly defaultName?: string; readonly stacked?: boolean }) {
  return (
    <ActionForm action={action} className={stacked ? "grid gap-4" : "grid max-w-4xl gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"} label="Nuevo producto">
      {({ pending, errors, values }) => (
        <>
          <FieldGroup>
            <FieldRow columns={stacked ? "" : "sm:grid-cols-[minmax(0,1fr)_10rem_13rem]"}>
              <Field name="name" label="Nombre" required maxLength={200} placeholder="Hora de trabajo" defaultValue={values["name"] ?? defaultName} error={errors["name"]} />
              {stacked ? null : <Field name="unitPrice" label="Precio sin IVA (€)" inputMode="decimal" required placeholder="0,00" defaultValue={values["unitPrice"]} error={errors["unitPrice"]} />}
              {stacked ? null : <SelectField name="tax" label="IVA" defaultValue="VAT:2100" options={TAX_OPTIONS} />}
            </FieldRow>
            {stacked ? (
              <FieldRow columns="sm:grid-cols-2">
                <Field name="unitPrice" label="Precio sin IVA (€)" inputMode="decimal" required placeholder="0,00" defaultValue={values["unitPrice"]} error={errors["unitPrice"]} />
                <SelectField name="tax" label="IVA" defaultValue="VAT:2100" options={TAX_OPTIONS} />
              </FieldRow>
            ) : null}
          </FieldGroup>
          <FormActions>
            <Button type="submit" size="lg" disabled={pending}>
              {pending ? "Guardando…" : stacked ? "Guardar y añadir a la factura" : "Guardar"}
            </Button>
          </FormActions>
        </>
      )}
    </ActionForm>
  );
}
