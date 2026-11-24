import { previewInvitation } from "@facturalibre/tenancy";
import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell, FormAlert, Streamed } from "@/components/form";
import { SignOutButton } from "@/components/sign-out-button";
import { buttonVariants } from "@/components/ui/button";
import { ROLE_INFO } from "@/lib/roles";
import { getDatabase } from "@/lib/server/db";
import { getSessionUser } from "@/lib/server/session";
import { AcceptInvitationForm } from "./accept-form";
import { acceptInvitationAction } from "./actions";

export const metadata: Metadata = { title: "Invitación", referrer: "no-referrer" };

const CLOSED: Readonly<Record<string, string>> = {
  ACCEPTED: "Esta invitación ya se ha aceptado.",
  EXPIRED: "La invitación ha caducado. Pide a la organización que te invite de nuevo.",
  REVOKED: "La organización ha anulado esta invitación.",
};

export default function InvitationPage({ params }: PageProps<"/invitacion/[token]">) {
  return (
    <AuthShell title="Invitación a FacturaLibre" description="Únete a una organización para trabajar con su equipo.">
      <Streamed message="Comprobando la invitación…">
        <Invitation params={params} />
      </Streamed>
    </AuthShell>
  );
}

async function Invitation({ params }: { readonly params: PageProps<"/invitacion/[token]">["params"] }) {
  const { token } = await params;
  const here = `/invitacion/${token}`;
  const user = await getSessionUser();

  if (user === null) {
    return (
      <div className="grid gap-4">
        <p>Para ver y aceptar la invitación, inicia sesión o crea una cuenta con el email al que te llegó.</p>
        <div className="flex flex-wrap gap-2">
          <Link href={`/entrar?volver=${encodeURIComponent(here)}`} className={buttonVariants({ size: "lg" })}>
            Iniciar sesión
          </Link>
          <Link href={`/registro?volver=${encodeURIComponent(here)}`} className={buttonVariants({ size: "lg", variant: "outline" })}>
            Crear cuenta
          </Link>
        </div>
      </div>
    );
  }

  const preview = token.length > 100 ? null : await previewInvitation(getDatabase(), user.id, token);
  if (preview === null) return <FormAlert tone="error">Esta invitación no existe. Revisa que el enlace esté completo.</FormAlert>;
  if (preview.status !== "PENDING") return <FormAlert tone="error">{CLOSED[preview.status]}</FormAlert>;

  if (preview.email !== user.email) {
    return (
      <div className="grid gap-3">
        <FormAlert tone="error">
          Esta invitación es para <strong>{preview.email}</strong>, pero has iniciado sesión como <strong>{user.email}</strong>.
        </FormAlert>
        <SignOutButton />
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <p>
        Te han invitado a <strong>{preview.tenantName}</strong> con el rol <strong>{ROLE_INFO[preview.role].label}</strong>:{" "}
        {ROLE_INFO[preview.role].description.toLowerCase()}
      </p>
      <AcceptInvitationForm action={acceptInvitationAction.bind(null, token)} />
    </div>
  );
}
