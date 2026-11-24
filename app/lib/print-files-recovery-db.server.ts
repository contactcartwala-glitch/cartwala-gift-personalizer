import { PrismaClient } from "@prisma/client";
import { createRecoveryReader } from "./print-files-recovery.server";

// No import of db.server: this dedicated client must not run its cleanup hooks.
export const readRecoveryPrintDesigns = createRecoveryReader(process.env, url =>
  new PrismaClient({ datasourceUrl: url, log: [] }));
