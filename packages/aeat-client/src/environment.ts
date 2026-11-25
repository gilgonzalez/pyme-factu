// A dónde se remiten los registros (SistemaFacturacion.wsdl 1.0, servicio sfVerifactu). La URL de producción
// solo se usa con FACTURALIBRE_ENV=production; cualquier otro valor va al simulador local (R-19).

export type Endpoint = { readonly kind: "simulator" } | { readonly kind: "aeat"; readonly url: string };

const AEAT_URLS = {
  production: "https://www1.agenciatributaria.gob.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP",
  test: "https://prewww1.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP",
} as const;

export function endpointFor(environment: string | undefined): Endpoint {
  if (environment === "production" || environment === "test") return { kind: "aeat", url: AEAT_URLS[environment] };
  return { kind: "simulator" };
}
