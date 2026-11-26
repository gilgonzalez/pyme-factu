import { isPlatformAdmin, listMyOrganizations } from "@facturalibre/tenancy";
import type { Metadata } from "next";
import Link from "next/link";
import { AppFooter, AppHeader } from "@/components/app-header";
import { streamedPage } from "@/components/form";
import { buttonVariants } from "@/components/ui/button";
import { ROLE_INFO } from "@/lib/roles";
import { getDatabase } from "@/lib/server/db";
import { requireUser } from "@/lib/server/session";

export const metadata: Metadata = { title: "Tus organizaciones" };

export default streamedPage("Cargando tus organizaciones…", Organizations);

async function Organizations() {
  const user = await requireUser("/organizaciones");
  const [organizations, admin] = await Promise.all([listMyOrganizations(getDatabase(), user.id), isPlatformAdmin(getDatabase(), user.id)]);

  return (
    <>
      <AppHeader userName={user.name} />
      <main className="mx-auto grid w-full max-w-3xl content-start gap-6 px-4 py-10 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="grid gap-1">
            <h1 className="text-2xl font-semibold tracking-[-0.02em] sm:text-[1.75rem]">Tus organizaciones</h1>
            <p className="text-muted-foreground">
              {organizations.length === 0
                ? "Aún no perteneces a ninguna. Crea la tuya o pide a alguien que te invite."
                : "Elige con cuál quieres trabajar."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {admin ? (
              <Link href="/plataforma" className={buttonVariants({ size: "lg", variant: "outline" })}>
                Administrar la plataforma
              </Link>
            ) : null}
            <Link href="/nueva-organizacion" className={buttonVariants({ size: "lg" })}>
              Crear organización
            </Link>
          </div>
        </div>

        {organizations.length === 0 ? null : (
          <ul className="grid gap-3" aria-label="Organizaciones">
            {organizations.map((organization) => (
              <li key={organization.slug}>
                <Link
                  href={`/${organization.slug}`}
                  className="flex items-center justify-between gap-4 surface p-5 transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <span className="grid gap-0.5">
                    <span className="font-medium">{organization.name}</span>
                    <span className="text-sm text-muted-foreground">facturalibre/{organization.slug}</span>
                  </span>
                  <span className="rounded-sm bg-accent px-2 py-0.5 text-xs font-semibold text-accent-foreground">{ROLE_INFO[organization.role].label}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
      <AppFooter />
    </>
  );
}
