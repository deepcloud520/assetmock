import { assertDatabaseAvailable } from "./database-maintenance";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

process.env.DATABASE_URL ||= "file:./financial-associates.db";
const base = globalForPrisma.prisma ?? new PrismaClient();
export const db = base.$extends({ query: { $allOperations({ args, query }) { assertDatabaseAvailable(); return query(args); } } }) as unknown as PrismaClient;

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = base;
