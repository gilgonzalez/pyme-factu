"use client";
import { ActionButton } from "@/components/action-button";
import { ActionForm, type FormAction } from "@/components/action-form";
import { Field } from "@/components/form";
import { Button } from "@/components/ui/button";

export function CertificateForm({ action, replacing }: { readonly action: FormAction; readonly replacing: boolean }) {
  return (
    <ActionForm action={action} className="grid max-w-xl gap-3" label="Subir el certificado">
      {({ pending, errors }) => (
        <>
          <Field
            name="certificate"
            type="file"
            accept=".p12,.pfx,application/x-pkcs12"
            label="Fichero del certificado (.p12 o .pfx)"
            hint="Certificado electrónico cualificado del contribuyente (o de su representante o colaborador social)."
            required
            error={errors["certificate"]}
          />
          <Field name="passphrase" type="password" label="Contraseña del certificado" autoComplete="off" required />
          <Button type="submit" disabled={pending}>
            {pending ? "Comprobando…" : replacing ? "Sustituir certificado" : "Guardar certificado"}
          </Button>
        </>
      )}
    </ActionForm>
  );
}

export const DeleteCertificateForm = ({ action }: { readonly action: FormAction }) => (
  <ActionButton action={action} label="Borrar el certificado" idle="Borrar certificado" busy="Borrando…" variant="destructive" />
);
