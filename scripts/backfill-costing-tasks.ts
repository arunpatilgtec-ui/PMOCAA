import { config } from 'dotenv'
import path from 'path'
config({ path: path.resolve(process.cwd(), '.env') })

import { PrismaClient } from '../src/generated/prisma'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

async function main() {
  // Get all ProductResource entries that have costingTypes
  const resources = await prisma.productResource.findMany({
    where: { costingTypes: { isEmpty: false } },
    include: {
      user: { select: { id: true, name: true } },
      product: {
        include: {
          project: { select: { id: true, name: true, startDate: true, endDate: true } },
        },
      },
    },
  })

  console.log(`Found ${resources.length} ProductResource entries with costingTypes`)

  // Group by project
  const byProject = new Map<string, typeof resources>()
  for (const r of resources) {
    const pid = r.product.project.id
    if (!byProject.has(pid)) byProject.set(pid, [])
    byProject.get(pid)!.push(r)
  }

  for (const [projectId, projectResources] of byProject) {
    const proj = projectResources[0].product.project
    console.log(`\nProject: ${proj.name}`)

    // Find or create Costing workstream
    let costingWs = await prisma.workstream.findFirst({
      where: { projectId, name: { in: ['Costing', 'Product Costing'] } },
    })
    if (!costingWs) {
      const wsCount = await prisma.workstream.count({ where: { projectId } })
      costingWs = await prisma.workstream.create({
        data: { projectId, name: 'Costing', order: wsCount },
      })
      console.log(`  Created Costing workstream`)
    } else {
      console.log(`  Using workstream: ${costingWs.name}`)
    }

    // Group by product
    const byProduct = new Map<string, typeof resources>()
    for (const r of projectResources) {
      const pid = r.productId
      if (!byProduct.has(pid)) byProduct.set(pid, [])
      byProduct.get(pid)!.push(r)
    }

    for (const [productId, productResources] of byProduct) {
      const product = productResources[0].product
      const productLabel = `${product.brand}${product.modelNo ? ` ${product.modelNo}` : ''}`

      // Remove stale auto-created costing tasks for this product
      const deleted = await prisma.task.deleteMany({
        where: {
          workstreamId: costingWs.id,
          description: { contains: `__productTask:${productId}:costing:` },
        },
      })
      if (deleted.count > 0) console.log(`  Removed ${deleted.count} stale costing tasks for ${productLabel}`)

      // Create new tasks: one per (user × costingType)
      const rows = productResources.flatMap((r) =>
        r.costingTypes.map((ct) => ({
          workstreamId: costingWs!.id,
          name: `${productLabel} — ${ct}`,
          description: `__productTask:${productId}:costing:${ct}__`,
          ownerId: r.userId,
          startDate: proj.startDate ?? null,
          endDate: proj.endDate ?? null,
          estimatedHours: 8,
          effortHours: 8,
        }))
      )

      if (rows.length > 0) {
        await prisma.task.createMany({ data: rows })
        for (const r of productResources) {
          console.log(`  Created task "${productLabel} — ${r.costingTypes.join(', ')}" → ${r.user.name}`)
        }
      }
    }
  }

  console.log('\nBackfill complete.')
}

main().catch(console.error).finally(() => prisma.$disconnect())
