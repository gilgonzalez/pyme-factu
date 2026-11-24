import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthShell } from "@/components/form";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Iniciar sesión" };

export default function SignInPage() {
  return (
    <AuthShell title="Inicia sesión" description="Accede a tus organizaciones y a tu facturación.">
      <Suspense>
        <SignInForm />
      </Suspense>
    </AuthShell>
  );
}
