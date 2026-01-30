import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as typeof globalThis & {
	prisma?: PrismaClient;
};

export const prisma =
	globalForPrisma.prisma ??
	new PrismaClient({
		log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
	});

if (process.env.NODE_ENV !== "production") {
	globalForPrisma.prisma = prisma;
}

function scheduleDisconnect(): void {
	void prisma.$disconnect();
}

process.once("beforeExit", scheduleDisconnect);
process.once("SIGINT", scheduleDisconnect);
process.once("SIGTERM", scheduleDisconnect);
