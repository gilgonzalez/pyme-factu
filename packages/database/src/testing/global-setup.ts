// globalSetup de Vitest: una base de datos PostgreSQL real, migrada y con roles, por ejecución.
import type { TestProject } from "vitest/node";
import { seedIsolationFixtures } from "./fixtures";
import { startTestDatabase } from "./index";

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const database = await startTestDatabase();
  await seedIsolationFixtures(database.urls.owner);
  project.provide("dbUrls", database.urls);
  return () => database.stop();
}
