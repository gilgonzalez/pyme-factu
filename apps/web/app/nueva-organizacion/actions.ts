"use server";
import { createOrganization } from "@facturalibre/tenancy";
import { redirect } from "next/navigation";
import { getDatabase } from "@/lib/server/db";
import { requireUser } from "@/lib/server/session";

export type CreateOrganizationState = {
  readonly message?: string;
  readonly errors?: Partial<Record<"name" | "slug", string>>;
};

const MESSAGES = {
  SLUG_TAKEN: { errors: { slug: "Esa dirección ya está en uso. Prueba con otra." } },
  EMAIL_NOT_VERIFIED: { message: "Confirma tu email antes de crear una organización." },
} as const;

export async function createOrganizationAction(_previous: CreateOrganizationState, data: FormData): Promise<CreateOrganizationState> {
  const user = await requireUser("/nueva-organizacion");
  const result = await createOrganization(getDatabase(), user.id, { name: data.get("name"), slug: data.get("slug") });
  if (!result.ok) return result.reason === "INVALID" ? { errors: result.errors } : MESSAGES[result.reason];
  redirect(`/${result.slug}`);
}
