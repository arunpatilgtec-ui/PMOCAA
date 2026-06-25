import { PrismaClient } from '../src/generated/prisma'
import { PrismaPg } from '@prisma/adapter-pg'

async function main() {
  const connectionString = process.env.DATABASE_URL!
  const adapter = new PrismaPg({ connectionString })
  const prisma = new PrismaClient({ adapter })

  // Cascade deletes handle all child records (workstreams, tasks, products, etc.)
  const result = await prisma.project.deleteMany({})
  console.log(`Deleted ${result.count} project(s) (and all related data via cascade)`)
  await prisma.$disconnect()
}

main().catch((e) => { console.error(e.message); process.exit(1) })
