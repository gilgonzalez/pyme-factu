import { listPlatformTenants, listPlatformUsers, listVerifactuStatus, platformOverview, type PlatformTenant, type PlatformUser } from "@facturalibre/tenancy";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppFooter, AppHeader } from "@/components/app-header";
import { streamedPage } from "@/components/form";
import { PageSection } from "@/components/page-section";
import { StatusBadge } from "@/components/invoice-status";
import { spanishShortDateTime } from "@/lib/invoice-view";
import { getDatabase } from "@/lib/server/db";
import { requirePlatformAdmin } from "@/lib/server/platform";
import { enterSupportAction, reactivateTenantAction, reactivateUserAction, suspendTenantAction, suspendUserAction } from "./actions";
import { ReactivateButton, SupportButton, SuspendForm } from "./platform-forms";

export const metadata: Metadata = { title: "Administración de la plataforma" };

export default streamedPage("Cargando la administración de la plataforma…", Platform);

const when = (date: Date | null): string => (date === null ? "—" : spanishShortDateTime(new Date(date).toISOString()));

function Metric({ label, value, detail }: { readonly label: string; readonly value: number; readonly detail?: string }) {
  return (
    <div className="surface grid gap-0.5 p-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="figures text-2xl font-semibold tracking-[-0.02em]">{value}</dd>
      {detail === undefined ? null : <dd className="text-xs text-muted-foreground">{detail}</dd>}
    </div>
  );
}

const th = "px-4 py-2.5 text-left font-medium";

/** Tabla de organizaciones o cuentas: nombre, uso, estado y acciones. */
function AdminTable({ caption, first, children }: { readonly caption: string; readonly first: string; readonly children: ReactNode }) {
  return (
    <div className="surface overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-subtle text-xs text-muted-foreground">
          <tr>
            <th scope="col" className={th}>{first}</th>
            <th scope="col" className={th}>Uso</th>
            <th scope="col" className={th}>Estado</th>
            <th scope="col" className={th}>
              <span className="sr-only">Acciones</span>
            </th>
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
const td = "px-4 py-3 align-top";

function TenantRow({ tenant }: { readonly tenant: PlatformTenant }) {
  const suspended = tenant.suspendedAt !== null;
  return (
    <tr className="border-t">
      <td className={td}>
        <p className="font-medium">{tenant.name}</p>
        <p className="font-mono text-xs text-muted-foreground">/{tenant.slug}</p>
        <p className="text-xs text-muted-foreground">Alta: {when(tenant.createdAt)}</p>
      </td>
      <td className={`${td} figures`}>
        {tenant.members} miembros · {tenant.taxpayers} contribuyentes
        <p className="text-xs text-muted-foreground">
          {tenant.issuedInvoices} emitidas · {tenant.draftInvoices} borradores · última {when(tenant.lastIssuedAt)}
        </p>
      </td>
      <td className={td}>
        {suspended ? <StatusBadge tone="danger">Suspendida</StatusBadge> : <StatusBadge tone="success">Activa</StatusBadge>}
        {tenant.suspendedReason === null ? null : <p className="mt-1 max-w-48 text-xs text-muted-foreground">{tenant.suspendedReason}</p>}
      </td>
      <td className={td}>
        <div className="flex flex-wrap items-start gap-2">
          <SupportButton action={enterSupportAction.bind(null, tenant.slug)} label={`Entrar en soporte en ${tenant.name}`} />
          {suspended ? (
            <ReactivateButton action={reactivateTenantAction.bind(null, tenant.id)} label={`Reactivar ${tenant.name}`} />
          ) : (
            <SuspendForm action={suspendTenantAction.bind(null, tenant.id)} label={`Suspender ${tenant.name}`} />
          )}
        </div>
      </td>
    </tr>
  );
}

function userState(user: PlatformUser): ReactNode {
  if (user.suspendedAt !== null) return <StatusBadge tone="danger">Suspendida</StatusBadge>;
  if (user.deactivatedAt !== null) return <StatusBadge tone="neutral">Desactivada por su titular</StatusBadge>;
  if (!user.emailVerified) return <StatusBadge tone="warning">Sin verificar</StatusBadge>;
  return <StatusBadge tone="success">Activa</StatusBadge>;
}

function UserRow({ user, me }: { readonly user: PlatformUser; readonly me: string }) {
  return (
    <tr className="border-t">
      <td className={td}>
        <p className="font-medium">
          {user.name} {user.isAdmin ? <span className="ml-1 text-xs font-semibold text-primary">Administrador</span> : null}
        </p>
        <p className="text-sm text-muted-foreground">{user.email}</p>
      </td>
      <td className={`${td} figures text-sm`}>
        {user.organizations} organizaciones
        <p className="text-xs text-muted-foreground">Alta: {when(user.createdAt)}</p>
      </td>
      <td className={td}>
        {userState(user)}
        {user.suspendedReason === null ? null : <p className="mt-1 max-w-48 text-xs text-muted-foreground">{user.suspendedReason}</p>}
      </td>
      <td className={td}>
        {user.id === me ? (
          <span className="text-sm text-muted-foreground">Tu cuenta</span>
        ) : user.suspendedAt === null ? (
          <SuspendForm action={suspendUserAction.bind(null, user.id)} label={`Suspender a ${user.email}`} />
        ) : (
          <ReactivateButton action={reactivateUserAction.bind(null, user.id)} label={`Reactivar a ${user.email}`} />
        )}
      </td>
    </tr>
  );
}

async function Platform() {
  const user = await requirePlatformAdmin("/plataforma");
  const db = getDatabase();
  const [overview, tenants, users, verifactu] = await Promise.all([
    platformOverview(db, user.id),
    listPlatformTenants(db, user.id),
    listPlatformUsers(db, user.id),
    listVerifactuStatus(db, user.id),
  ]);

  return (
    <>
      <AppHeader userName={user.name} />
      <main className="mx-auto grid w-full max-w-6xl content-start gap-10 px-4 py-10 sm:px-6">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold tracking-[-0.02em] sm:text-[1.75rem]">Administración de la plataforma</h1>
          <p className="text-muted-foreground">
            Solo metadatos. El contenido de una organización solo se ve entrando en soporte: en solo lectura, durante una hora y quedando en su
            auditoría.
          </p>
        </div>

        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" aria-label="Resumen">
          <Metric label="Cuentas" value={overview.users} detail={`${String(overview.verifiedUsers)} verificadas · ${String(overview.suspendedUsers)} suspendidas`} />
          <Metric label="Organizaciones" value={overview.tenants} detail={`${String(overview.suspendedTenants)} suspendidas`} />
          <Metric label="Contribuyentes" value={overview.taxpayers} />
          <Metric label="Facturas emitidas" value={overview.issuedInvoices} detail={`${String(overview.draftInvoices)} borradores`} />
          <Metric label="Registros pendientes" value={overview.pendingRecords} />
          <Metric label="Registros rechazados" value={overview.rejectedRecords} />
        </dl>

        <PageSection id="organizaciones" title="Organizaciones" description="Suspender deja a sus miembros sin acceso; el envío a la AEAT de lo ya registrado continúa.">
          <AdminTable caption="Organizaciones de la plataforma" first="Organización">
                {tenants.map((tenant) => (
                  <TenantRow key={tenant.id} tenant={tenant} />
                ))}
          </AdminTable>
        </PageSection>

        <PageSection id="cuentas" title="Cuentas" description="Suspender una cuenta cierra todas sus sesiones y le impide volver a entrar.">
          <AdminTable caption="Cuentas de la plataforma" first="Cuenta">
                {users.map((row) => (
                  <UserRow key={row.id} user={row} me={user.id} />
                ))}
          </AdminTable>
        </PageSection>

        <PageSection id="verifactu" title="VERI*FACTU" description="Registros de facturación por contribuyente: lo pendiente de remitir y lo que la AEAT ha rechazado.">
          {verifactu.length === 0 ? (
            <p className="surface p-5 text-sm text-muted-foreground">Todavía no hay registros de facturación.</p>
          ) : (
            <div className="surface overflow-x-auto">
              <table className="figures w-full text-sm">
                <caption className="sr-only">Estado VERI*FACTU por contribuyente</caption>
                <thead className="bg-subtle text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className={th}>Contribuyente</th>
                    <th scope="col" className={th}>Pendientes</th>
                    <th scope="col" className={th}>Aceptados</th>
                    <th scope="col" className={th}>Con errores</th>
                    <th scope="col" className={th}>Rechazados</th>
                    <th scope="col" className={th}>Último error</th>
                  </tr>
                </thead>
                <tbody>
                  {verifactu.map((row) => (
                    <tr key={row.taxpayerId} className="border-t">
                      <td className={td}>
                        <p className="font-medium">{row.taxpayerName}</p>
                        <p className="text-xs text-muted-foreground">
                          NIF {row.taxpayerNif} · {row.tenantName}
                        </p>
                      </td>
                      <td className={td}>
                        {row.pending}
                        {row.oldestPendingAt === null ? null : <p className="text-xs text-muted-foreground">desde {when(row.oldestPendingAt)}</p>}
                      </td>
                      <td className={td}>{row.accepted}</td>
                      <td className={td}>{row.acceptedWithErrors}</td>
                      <td className={`${td} ${row.rejected > 0 ? "font-semibold text-destructive" : ""}`}>{row.rejected}</td>
                      <td className={`${td} max-w-72 text-xs`}>
                        {row.lastErrorCode === null ? "—" : `${row.lastErrorCode} ${row.lastErrorDescription ?? ""} (${when(row.lastErrorAt)})`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </PageSection>
      </main>
      <AppFooter />
    </>
  );
}
