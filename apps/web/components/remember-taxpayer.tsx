"use client";
// Recuerda el último contribuyente abierto en esta organización (cookie de preferencia, sin datos personales):
// las pantallas de la organización muestran sus secciones en el lateral. El servidor comprueba siempre el acceso.
import { useEffect } from "react";
import { workingTaxpayerCookie } from "@/lib/working-taxpayer";

const ONE_YEAR = 60 * 60 * 24 * 365;

export function RememberTaxpayer({ tenantId, taxpayerId }: { readonly tenantId: string; readonly taxpayerId: string }) {
  useEffect(() => {
    document.cookie = `${workingTaxpayerCookie(tenantId)}=${taxpayerId}; path=/; max-age=${String(ONE_YEAR)}; samesite=lax`;
  }, [tenantId, taxpayerId]);
  return null;
}
