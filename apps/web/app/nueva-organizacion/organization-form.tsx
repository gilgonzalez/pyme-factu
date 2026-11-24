"use client";
import { suggestSlug } from "@facturalibre/tenancy/validation";
import { useActionState, useState } from "react";
import { Field, FormAlert } from "@/components/form";
import { Button } from "@/components/ui/button";
import { createOrganizationAction, type CreateOrganizationState } from "./actions";

export function OrganizationForm() {
  const [state, action, pending] = useActionState<CreateOrganizationState, FormData>(createOrganizationAction, {});
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);

  return (
    <form action={action} className="grid gap-4">
      {state.message === undefined ? null : <FormAlert tone="error">{state.message}</FormAlert>}
      <Field
        name="name"
        label="Nombre de la organización"
        hint="Tu empresa, tu actividad como autónomo o tu gestoría. Podrás cambiarlo después."
        required
        maxLength={120}
        autoComplete="organization"
        value={name}
        error={state.errors?.name}
        onChange={(event) => {
          setName(event.target.value);
          if (!slugEdited) setSlug(event.target.value === "" ? "" : suggestSlug(event.target.value));
        }}
      />
      <Field
        name="slug"
        label="Dirección"
        hint="Aparece en la barra del navegador: letras minúsculas, números y guiones."
        required
        minLength={3}
        maxLength={63}
        pattern="[a-z0-9]([a-z0-9\-]{1,61}[a-z0-9])"
        value={slug}
        error={state.errors?.slug}
        onChange={(event) => {
          setSlugEdited(true);
          setSlug(event.target.value.toLowerCase());
        }}
      />
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Creando…" : "Crear organización"}
      </Button>
    </form>
  );
}
