// Provincia de un código postal español: los dos primeros dígitos son el código INE de la provincia (01–52).
// Sirve para rellenarla sola en los formularios; quien escribe siempre puede cambiarla.

const PROVINCES: readonly string[] = [
  "Araba/Álava", "Albacete", "Alicante", "Almería", "Ávila", "Badajoz", "Illes Balears", "Barcelona", "Burgos", "Cáceres",
  "Cádiz", "Castellón", "Ciudad Real", "Córdoba", "A Coruña", "Cuenca", "Girona", "Granada", "Guadalajara", "Gipuzkoa",
  "Huelva", "Huesca", "Jaén", "León", "Lleida", "La Rioja", "Lugo", "Madrid", "Málaga", "Murcia",
  "Navarra", "Ourense", "Asturias", "Palencia", "Las Palmas", "Pontevedra", "Salamanca", "Santa Cruz de Tenerife", "Cantabria", "Segovia",
  "Sevilla", "Soria", "Tarragona", "Teruel", "Toledo", "Valencia", "Valladolid", "Bizkaia", "Zamora", "Zaragoza",
  "Ceuta", "Melilla",
];

/** Provincia del código postal (5 dígitos) o null si no es un código postal español completo. */
export function provinceForPostalCode(raw: string): string | null {
  const code = raw.trim();
  if (!/^\d{5}$/.test(code)) return null;
  return PROVINCES[Number(code.slice(0, 2)) - 1] ?? null;
}
