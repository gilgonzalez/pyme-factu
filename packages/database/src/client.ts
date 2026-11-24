import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

export type Database = PrismaClient;

export interface DatabaseClientOptions {
  /** Tamaño máximo del pool de conexiones de este proceso. */
  readonly maxConnections?: number;
}

/**
 * Crea un cliente Prisma sobre node-postgres.
 * En tiempo de ejecución la cadena de conexión debe ser la de un rol SIN BYPASSRLS
 * (facturalibre_app o facturalibre_worker), nunca la del propietario de las tablas.
 */
export function createDatabaseClient(connectionString: string, options: DatabaseClientOptions = {}): Database {
  const adapter = new PrismaPg({ connectionString, max: options.maxConnections ?? 10 });
  return new PrismaClient({ adapter });
}
