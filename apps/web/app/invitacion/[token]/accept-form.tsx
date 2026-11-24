"use client";
import { ActionForm, type ActionResult } from "@/components/action-form";
import { Button } from "@/components/ui/button";

export function AcceptInvitationForm({ action }: { readonly action: (previous: ActionResult, data: FormData) => Promise<ActionResult> }) {
  return (
    <ActionForm action={action} className="grid gap-3" label="Aceptar la invitación">
      {({ pending }) => (
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Uniéndote…" : "Aceptar y entrar"}
        </Button>
      )}
    </ActionForm>
  );
}
