import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthShell } from "@/components/form";
import { SignUpForm } from "./sign-up-form";

export const metadata: Metadata = { title: "Crear cuenta" };

export default function SignUpPage() {
  return (
    <AuthShell title="Crea tu cuenta" description="Gratis. Después podrás crear tu organización o unirte a la que te invite.">
      <Suspense>
        <SignUpForm />
      </Suspense>
    </AuthShell>
  );
}
