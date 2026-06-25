import { PrismaClient } from '../src/generated/prisma'
import { PrismaPg } from '@prisma/adapter-pg'

const connectionString = process.env.DATABASE_URL
if (!connectionString) throw new Error('DATABASE_URL not set')

const adapter = new PrismaPg({ connectionString })
const prisma = new PrismaClient({ adapter })

// Cutoff: June 23, 2026 12:30 PM UTC
const CUTOFF = new Date('2026-06-23T12:30:00.000Z')
const before = { lte: CUTOFF }

async function main() {
  console.log('Deleting data created before', CUTOFF.toISOString())

  const n = await prisma.notification.deleteMany({ where: { createdAt: before } })
  console.log('Notifications deleted:', n.count)

  const ar = await prisma.approvalRequest.deleteMany({ where: { createdAt: before } })
  console.log('ApprovalRequests deleted:', ar.count)

  const st = await prisma.strategicTask.deleteMany({ where: { createdAt: before } })
  console.log('StrategicTasks deleted:', st.count)

  const sr = await prisma.strategicRequest.deleteMany({ where: { createdAt: before } })
  console.log('StrategicRequests deleted:', sr.count)

  const req = await prisma.request.deleteMany({ where: { createdAt: before } })
  console.log('Requests deleted:', req.count)

  // Deleting projects cascades: workstreams → tasks → history, products, allocations, etc.
  const p = await prisma.project.deleteMany({ where: { createdAt: before } })
  console.log('Projects deleted:', p.count)

  console.log('Done — database is clean.')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
