/** Lee una variable de entorno obligatoria; falla en el arranque si falta. */
export function requireEnv(name: string, env: NodeJS.ProcessEnv = process.env): string {
  const value = env[name];
  if (value === undefined || value.trim() === "") {
    throw new Error(`Falta la variable de entorno obligatoria ${name}`);
  }
  return value;
}
