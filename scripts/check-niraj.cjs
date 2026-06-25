const { PrismaClient } = require('../src/generated/prisma')
const prisma = new PrismaClient()

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
        id: true, name: true, status: true, ownerId: true,
        workstream: { select: { name: true, project: { select: { name: true } } } }
      }
    })
    console.log('Tasks owned by Niraj:', JSON.stringify(tasks, null, 2))
  }
}

main().catch(console.error).finally(() => prisma.$disconnect())
