import { config } from 'dotenv'
import path from 'path'
config({ path: path.resolve(process.cwd(), '.env') })

import { PrismaClient } from '../src/generated/prisma'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

async function main() {
  const niraj = await prisma.user.findFirst({
    where: { name: { contains: 'Niraj' } },
    select: { id: true, name: true, role: true }
  })
  console.log('Niraj user:', JSON.stringify(niraj))

  if (niraj) {
    const tasks = await prisma.task.findMany({
      where: { ownerId: niraj.id },
      select: {
        id: true, name: true, status: true,
        workstream: { select: { name: true, project: { select: { name: true } } } }
      }
    })
    console.log(`Tasks owned by Niraj (${tasks.length}):`, JSON.stringify(tasks, null, 2))
  }
}

main().catch(console.error).finally(() => prisma.$disconnect())
