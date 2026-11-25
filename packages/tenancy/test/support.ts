// Mundo de pruebas de tenancy: clientes Prisma con los roles reales y helpers que crean usuarios,
// organizaciones y miembros por los flujos reales (alta + invitación + aceptación).
import { createDatabaseClient, type Database } from "@facturalibre/database";
import type {} from "@facturalibre/database/testing";
import type { Role } from "@facturalibre/security";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, inject } from "vitest";
import { acceptInvitation, createCustomer, createDraftInvoice, createOrganization, createTaxpayer, inviteMember, resolveTenantContext, type TenantContext } from "../src";

export const unique = (): string => randomUUID().slice(0, 8);

/** Identidad del sistema informático en las pruebas (productor ficticio). */
export const VERIFACTU = {
  software: { producerName: "Productor Ficticio SL", producerNif: "B12345674", name: "FacturaLibre", id: "FL", version: "0.5.0-test" },
} as const;

export interface Member {
  readonly id: string;
  readonly membershipId: string;
  ctx(taxpayerId?: string | null): Promise<TenantContext>;
}

export interface Team {
  readonly slug: string;
  readonly ownerId: string;
  ownerCtx(taxpayerId?: string | null): Promise<TenantContext>;
  /** Da de alta un miembro con el rol (y alcance) indicados mediante el flujo real de invitación. */
  add(role: Exclude<Role, "OWNER">, taxpayerScope?: "ALL_TAXPAYERS" | "ASSIGNED_TAXPAYERS"): Promise<Member>;
}

export interface World {
  /** Rol facturalibre_app (sujeto a RLS). */
  readonly db: Database;
  /** Rol propietario (sin RLS): solo para preparar datos y comprobar resultados. */
  readonly owner: Database;
  readonly createUser: (options?: { verified?: boolean; email?: string }) => Promise<{ id: string; email: string }>;
  readonly contextFor: (userId: string, tenantSlug: string, taxpayerId?: string | null) => Promise<TenantContext>;
  readonly newTeam: () => Promise<Team>;
}

/** Registra los hooks de conexión y devuelve el mundo de pruebas (usar en el nivel superior del fichero). */
export function testWorld(): World {
  let db: Database | undefined;
  let owner: Database | undefined;
  beforeAll(() => {
    db = createDatabaseClient(inject("dbUrls").app, { maxConnections: 2 });
    owner = createDatabaseClient(inject("dbUrls").owner, { maxConnections: 1 });
  });
  afterAll(async () => {
    await Promise.all([db?.$disconnect(), owner?.$disconnect()]);
  });
  const required = (client: Database | undefined): Database => {
    if (client === undefined) throw new Error("La base de datos de pruebas no está inicializada (beforeAll)");
    return client;
  };

  const world: World = {
    get db() {
      return required(db);
    },
    get owner() {
      return required(owner);
    },
    async createUser(options = {}) {
      const email = options.email ?? `persona-${unique()}@example.test`;
      const user = await world.owner.user.create({ data: { name: `Persona ${email}`, email, emailVerified: options.verified ?? true } });
      return { id: user.id, email };
    },
    async contextFor(userId, tenantSlug, taxpayerId = null) {
      const result = await resolveTenantContext(world.db, { userId, tenantSlug, taxpayerId, requestId: "test" });
      if (!result.ok) throw new Error(`contexto no resuelto: ${result.reason}`);
      return result.context;
    },
    async newTeam() {
      const founder = await world.createUser();
      const slug = `org-${unique()}`;
      const created = await createOrganization(world.db, founder.id, { name: "Organización ficticia", slug });
      if (!created.ok) throw new Error(`alta fallida: ${created.reason}`);
      const ownerCtx = (taxpayerId: string | null = null): Promise<TenantContext> => world.contextFor(founder.id, slug, taxpayerId);
      return {
        slug,
        ownerId: founder.id,
        ownerCtx,
        async add(role, taxpayerScope = "ALL_TAXPAYERS") {
          const member = await world.createUser();
          const invited = await inviteMember(world.db, await ownerCtx(), { email: member.email, role, taxpayerScope });
          if (!invited.ok) throw new Error(`invitación fallida: ${invited.reason}`);
          await acceptInvitation(world.db, member.id, invited.token);
          const ctx = (taxpayerId: string | null = null): Promise<TenantContext> => world.contextFor(member.id, slug, taxpayerId);
          return { id: member.id, membershipId: (await ctx()).membership.id, ctx };
        },
      };
    },
  };
  return world;
}

// ─── Facturación ─────────────────────────────────────────────────────────────

export interface Billing {
  readonly team: Team;
  readonly taxpayerId: string;
  readonly customerId: string;
  readonly ctx: () => Promise<TenantContext>;
}

/** Organización + contribuyente + cliente, listos para facturar como OWNER. */
export async function billingFor(world: World, customer: Record<string, unknown> = { legalName: "Cliente Ficticio SL", nif: "B12345674" }): Promise<Billing> {
  const team = await world.newTeam();
  const taxpayer = await createTaxpayer(world.db, await team.ownerCtx(), { nif: "12345678Z", legalName: "Ana Ficticia Pérez", city: "Madrid" });
  if (!taxpayer.ok) throw new Error(taxpayer.reason);
  const ctx = () => team.ownerCtx(taxpayer.taxpayer.id);
  const created = await createCustomer(world.db, await ctx(), customer);
  if (!created.ok) throw new Error(created.reason);
  return { team, taxpayerId: taxpayer.taxpayer.id, customerId: created.customer.id, ctx };
}

export const LINE = { description: "Reparación ficticia", quantity: "2", unitPrice: "50", discountPercent: "", tax: "VAT:2100" };

export async function draftInvoice(world: World, b: Billing, extra: Record<string, unknown> = {}): Promise<string> {
  const result = await createDraftInvoice(world.db, await b.ctx(), { customerId: b.customerId, lines: [LINE], ...extra });
  if (!result.ok) throw new Error(JSON.stringify(result));
  return result.invoiceId;
}

/** Año en curso en España (las series se numeran por año: F2026, R2026…). */
export const YEAR = new Date().toLocaleString("en-CA", { timeZone: "Europe/Madrid", year: "numeric" });

/** Mundo de pruebas de facturación: registra los hooks de conexión y da atajos para preparar datos. */
export function invoicingWorld(): {
  readonly world: World;
  readonly billing: (customer?: Record<string, unknown>) => Promise<Billing>;
  readonly draft: (b: Billing, extra?: Record<string, unknown>) => Promise<string>;
} {
  const world = testWorld();
  return { world, billing: (customer) => billingFor(world, customer), draft: (b, extra = {}) => draftInvoice(world, b, extra) };
}
