import { PrismaClient } from '@prisma/client'

// Em dev o tsx recarrega o módulo a cada alteração; sem o cache global
// cada reload abriria um novo pool de conexões com o Postgres.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db
}

export default db
