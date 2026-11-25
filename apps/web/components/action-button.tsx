"use client";
import { ActionForm, type FormAction } from "@/components/action-form";
import { Button } from "@/components/ui/button";

/** Formulario de un solo botón que lanza una Server Action (borrar, anular…), con su texto mientras se ejecuta. */
export function ActionButton({
  action,
  label,
  idle,
  busy,
  variant = "default",
}: {
  readonly action: FormAction;
  readonly label: string;
  readonly idle: string;
  readonly busy: string;
  readonly variant?: "default" | "destructive" | "outline";
}) {
  return (
    <ActionForm action={action} label={label}>
      {({ pending }) => (
        <Button type="submit" variant={variant} disabled={pending}>
          {pending ? busy : idle}
        </Button>
      )}
    </ActionForm>
  );
}
