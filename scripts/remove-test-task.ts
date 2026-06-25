import { PrismaClient } from '../src/generated/prisma'
import { PrismaPg } from '@prisma/adapter-pg'

const connectionString = process.env.DATABASE_URL
if (!connectionString) throw new Error('DATABASE_URL not set')

const adapter = new PrismaPg({ connectionString })
const prisma = new PrismaClient({ adapter })

async function main() {
  const akshay = await prisma.user.findFirst({
    where: { name: { contains: 'Akshay', mode: 'insensitive' } },
    select: { id: true, name: true },
  })
  if (!akshay) { console.log('User not found'); return }
  console.log('Found user:', akshay.name, akshay.id)

  const tasks = await prisma.task.findMany({
    where: {
      ownerId: akshay.id,
      name: { contains: 'test', mode: 'insensitive' },
    },
    select: { id: true, name: true, status: true, createdAt: true },
  })
  console.log('Tasks found:', tasks)

  if (tasks.length === 0) { console.log('No matching tasks — nothing deleted'); return }

  const ids = tasks.map(t => t.id)
  const deleted = await prisma.task.deleteMany({ where: { id: { in: ids } } })
  console.log(`Deleted ${deleted.count} task(s)`)
}

main().catch(console.error).finally(() => prisma.$disconnect())
