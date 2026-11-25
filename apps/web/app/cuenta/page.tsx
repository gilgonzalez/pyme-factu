import type { Metadata } from "next";
import Link from "next/link";
import { AppFooter, AppHeader } from "@/components/app-header";
import { streamedPage } from "@/components/form";
import { buttonVariants } from "@/components/ui/button";
import { requireUser } from "@/lib/server/session";
import { deactivateAccountAction } from "./actions";
import { DeactivateForm } from "./account-forms";

export const metadata: Metadata = { title: "Mi cuenta" };

export default streamedPage("Cargando tu cuenta…", Account);

/** Datos de la cuenta, su descarga (RGPD arts. 15 y 20) y la desactivación (Fase 7). */
async function Account() {
  const user = await requireUser("/cuenta");
  return (
    <>
      <AppHeader userName={user.name} />
      <main className="mx-auto grid w-full max-w-3xl content-start gap-6 px-4 py-10 sm:px-6">
        <h1 className="font-heading text-[1.95rem] leading-tight font-bold tracking-[-0.02em]">Mi cuenta</h1>
        <p>
          {user.name}, con el email <strong>{user.email}</strong>.
        </p>
        <section aria-labelledby="datos" className="grid gap-2 sheet p-5">
          <h2 id="datos" className="text-lg font-bold">
            Tus datos personales
          </h2>
          <p className="text-sm text-muted-foreground">Una copia en JSON de tu cuenta, las organizaciones a las que perteneces, tus sesiones y tu actividad.</p>
          <a href="/cuenta/datos" className={buttonVariants({ variant: "outline" })} download>
            Descargar mis datos
          </a>
        </section>
        <section aria-labelledby="desactivar" className="grid gap-3 sheet border-l-4 border-l-destructive p-5">
          <h2 id="desactivar" className="text-lg font-bold">
            Desactivar la cuenta
          </h2>
          <p className="text-sm text-muted-foreground">
            No podrás volver a entrar y saldrás de todas tus organizaciones. Lo que hiciste se conserva (auditoría y obligaciones fiscales de las
            organizaciones). Si eres el único propietario de una organización, antes{" "}
            <Link href="/organizaciones" className="text-primary underline decoration-primary/40 underline-offset-4 hover:decoration-primary">
              transfiere la propiedad
            </Link>
            .
          </p>
          <DeactivateForm action={deactivateAccountAction} />
        </section>
      </main>
      <AppFooter />
    </>
  );
}
