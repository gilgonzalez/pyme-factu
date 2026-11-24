import { listMyOrganizations } from "@facturalibre/tenancy";
import type { Metadata } from "next";
import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { Streamed } from "@/components/form";
import { buttonVariants } from "@/components/ui/button";
import { ROLE_INFO } from "@/lib/roles";
import { getDatabase } from "@/lib/server/db";
import { requireUser } from "@/lib/server/session";

export const metadata: Metadata = { title: "Tus organizaciones" };

export default function OrganizationsPage() {
  return (
    <Streamed message="Cargando tus organizaciones…">
      <Organizations />
    </Streamed>
  );
}

async function Organizations() {
  const user = await requireUser("/organizaciones");
  const organizations = await listMyOrganizations(getDatabase(), user.id);

  return (
    <>
      <AppHeader userName={user.name} />
      <main className="mx-auto grid w-full max-w-3xl gap-6 px-6 py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="grid gap-1">
            <h1 className="font-heading text-2xl font-semibold tracking-tight">Tus organizaciones</h1>
            <p className="text-muted-foreground">
              {organizations.length === 0
                ? "Aún no perteneces a ninguna. Crea la tuya o pide a alguien que te invite."
                : "Elige con cuál quieres trabajar."}
            </p>
          </div>
          <Link href="/nueva-organizacion" className={buttonVariants({ size: "lg" })}>
            Crear organización
          </Link>
        </div>

        {organizations.length === 0 ? null : (
          <ul className="grid gap-3" aria-label="Organizaciones">
            {organizations.map((organization) => (
              <li key={organization.slug}>
                <Link
                  href={`/${organization.slug}`}
                  className="flex items-center justify-between gap-4 rounded-xl border p-4 transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <span className="grid gap-0.5">
                    <span className="font-medium">{organization.name}</span>
                    <span className="text-sm text-muted-foreground">facturalibre/{organization.slug}</span>
                  </span>
                  <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">{ROLE_INFO[organization.role].label}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
