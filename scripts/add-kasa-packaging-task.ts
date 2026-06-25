import { PrismaClient } from '../src/generated/prisma'
import { PrismaPg } from '@prisma/adapter-pg'

const connectionString = process.env.DATABASE_URL
if (!connectionString) throw new Error('DATABASE_URL not set')

const adapter = new PrismaPg({ connectionString })
const prisma = new PrismaClient({ adapter })

async function main() {
  // Find the Kitchenaid KES8558PL product in the KASA project
  const product = await prisma.product.findFirst({
    where: { brand: { contains: 'Kitchenaid', mode: 'insensitive' }, modelNo: 'KES8558PL' },
    include: {
      project: { select: { id: true, startDate: true, endDate: true } },
      resources: { include: { user: { select: { id: true, name: true } } } },
    },
  })
  if (!product) { console.log('Product not found'); return }
  console.log(`Found product: ${product.brand} ${product.modelNo} (id=${product.id})`)

  // Add Packaging to each resource's subsystems if not already there
  for (const resource of product.resources) {
    if (resource.subsystems.includes('Packaging')) {
      console.log(`  ${resource.user.name}: Packaging already in subsystems`)
      continue
    }
    const updated = ['Packaging', ...resource.subsystems]
    await prisma.productResource.update({
      where: { id: resource.id },
      data: { subsystems: updated },
    })
    console.log(`  ${resource.user.name}: added Packaging → [${updated.join(', ')}]`)
    resource.subsystems = updated
  }

  // Find or create "Product Costing" workstream
  const projectId = product.project.id
  const existingWs = await prisma.workstream.findFirst({
    where: { projectId, name: 'Product Costing' },
  })
  const wsOrder = existingWs ? 0 : await prisma.workstream.count({ where: { projectId } })
  const costingWs = existingWs ?? await prisma.workstream.create({
    data: { projectId, name: 'Product Costing', order: wsOrder },
  })
  console.log(`Using workstream: ${costingWs.name} (id=${costingWs.id})`)

  // Delete old tasks for this product in Product Costing
  const deleted = await prisma.task.deleteMany({
    where: { workstreamId: costingWs.id, description: { contains: `__productTask:${product.id}:` } },
  })
  console.log(`Deleted ${deleted.count} old task(s)`)

  // Recreate all tasks from current subsystems (including Packaging)
  const updatedResources = await prisma.productResource.findMany({
    where: { productId: product.id },
    select: { userId: true, subsystems: true },
  })
  const taskRows = updatedResources.flatMap((r) =>
    r.subsystems.map((sub) => ({
      workstreamId: costingWs.id,
      name: `${product.brand} — ${sub}`,
      description: `__productTask:${product.id}:${r.userId}__`,
      ownerId: r.userId,
      startDate: product.project.startDate ?? null,
      endDate: product.project.endDate ?? null,
      effortHours: 8,
      estimatedHours: 8,
    }))
  )
  if (taskRows.length > 0) {
    await prisma.task.createMany({ data: taskRows })
    console.log(`Created ${taskRows.length} task(s):`)
    taskRows.forEach((t) => console.log(`  - ${t.name}`))
  }
}

main().catch(console.error).finally(() => prisma.$disconnect())
