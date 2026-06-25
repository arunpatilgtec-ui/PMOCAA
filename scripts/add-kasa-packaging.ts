import { PrismaClient } from '../src/generated/prisma'
import { PrismaPg } from '@prisma/adapter-pg'

const connectionString = process.env.DATABASE_URL
if (!connectionString) throw new Error('DATABASE_URL not set')

const adapter = new PrismaPg({ connectionString })
const prisma = new PrismaClient({ adapter })

async function main() {
  // Find all KASA projects
  const kasaProjects = await prisma.project.findMany({
    where: { category: 'KASA' },
    select: { id: true, name: true },
  })
  console.log(`Found ${kasaProjects.length} KASA project(s):`, kasaProjects.map(p => p.name))

  for (const project of kasaProjects) {
    // Find Tear Down and Costing workstreams
    const workstreams = await prisma.workstream.findMany({
      where: {
        projectId: project.id,
        name: { in: ['Tear Down', 'Costing'] },
      },
      include: {
        tasks: { orderBy: { order: 'asc' }, select: { id: true, name: true, order: true } },
      },
    })

    for (const ws of workstreams) {
      const firstTask = ws.tasks[0]
      if (firstTask?.name === 'Packaging') {
        console.log(`  [${project.name}] ${ws.name}: Packaging already first — skipping`)
        continue
      }

      // Shift all existing tasks up by 1 to make room
      if (ws.tasks.length > 0) {
        await prisma.task.updateMany({
          where: { workstreamId: ws.id },
          data: { order: { increment: 1 } },
        })
      }

      // Insert Packaging as order=0 (first)
      const created = await prisma.task.create({
        data: {
          name: 'Packaging',
          workstreamId: ws.id,
          estimatedHours: 8,
          order: 0,
        },
      })
      console.log(`  [${project.name}] ${ws.name}: added Packaging (id=${created.id})`)
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect())
