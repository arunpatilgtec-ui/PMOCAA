import { PrismaClient } from '../src/generated/prisma'
import { PrismaPg } from '@prisma/adapter-pg'

const connectionString = process.env.DATABASE_URL
if (!connectionString) throw new Error('DATABASE_URL not set')
const adapter = new PrismaPg({ connectionString })
const prisma = new PrismaClient({ adapter })

async function main() {
  const wsList = await prisma.workstream.findMany({ where: { name: 'Product Costing' } })
  if (wsList.length === 0) { console.log('No Product Costing workstream found'); return }
  for (const ws of wsList) {
    const del = await prisma.task.deleteMany({ where: { workstreamId: ws.id } })
    await prisma.workstream.delete({ where: { id: ws.id } })
    console.log(`Deleted workstream "${ws.name}" (id=${ws.id}) and ${del.count} task(s)`)
  }
}

main().catch(console.error).finally(() => prisma.$disconnect())
