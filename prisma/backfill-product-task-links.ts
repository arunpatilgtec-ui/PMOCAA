/**
 * One-time backfill for the Products <-> Timeline resource-assignment sync.
 *
 * Existing teardown/costing tasks only carried a loose text tag
 * (`__productTask:{productId}:teardown__` / `:costing__`) with no reliable
 * link back to which subsystem/costing-type they represent. This script:
 *
 *   1. Parses that link from the task's description + name (stripping the
 *      "${brand} ${modelNo} — " prefix) and writes it into the new
 *      Task.productId / Task.productSubsystem columns.
 *   2. Additively reconciles ProductResource: if a task's current owner
 *      isn't already reflected in that product's ProductResource entry for
 *      the relevant subsystem/costing type, it's added (never removed) —
 *      this brings any pre-existing drift from past Timeline/Kanban
 *      reassignments into alignment without discarding real assignments.
 *
 * Safe to re-run: every step is idempotent (skips already-linked tasks,
 * only adds missing ProductResource entries).
 *
 * Usage:
 *   npx tsx prisma/backfill-product-task-links.ts
 */
import { PrismaClient } from '../src/generated/prisma'
import { PrismaPg } from '@prisma/adapter-pg'
import 'dotenv/config'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

async function main() {
  const tasks = await prisma.task.findMany({
    where: {
      productId: null,
      OR: [
        { description: { contains: ':teardown__' } },
        { description: { contains: ':costing__' } },
        { description: { contains: ':costing:' } }, // legacy format, subsystem embedded in description
      ],
    },
    select: { id: true, name: true, description: true, ownerId: true },
  })
  console.log(`Found ${tasks.length} product-tagged tasks without a productId link.`)

  const productCache = new Map<string, { brand: string; modelNo: string } | null>()
  let linked = 0
  let skipped = 0
  let resourcesAdded = 0

  for (const task of tasks) {
    const currentMatch = task.description?.match(/^__productTask:([^:]+):(teardown|costing)__$/)
    const legacyMatch = task.description?.match(/^__productTask:([^:]+):costing:(.+)__$/)
    if (!currentMatch && !legacyMatch) { skipped++; continue }

    const productId = (currentMatch ?? legacyMatch)![1]
    const isCosting = currentMatch ? currentMatch[2] === 'costing' : true

    if (!productCache.has(productId)) {
      const p = await prisma.product.findUnique({ where: { id: productId }, select: { brand: true, modelNo: true } })
      productCache.set(productId, p)
    }
    const product = productCache.get(productId)
    if (!product) { skipped++; continue } // product deleted since

    let subsystem: string
    if (legacyMatch) {
      subsystem = legacyMatch[2]
    } else {
      const productLabel = `${product.brand}${product.modelNo ? ` ${product.modelNo}` : ''}`
      const prefix = `${productLabel} — `
      if (!task.name.startsWith(prefix)) { skipped++; continue }
      subsystem = task.name.slice(prefix.length)
    }

    await prisma.task.update({
      where: { id: task.id },
      data: { productId, productSubsystem: subsystem },
    })
    linked++

    // Additive reconciliation: make sure the current owner (if any) is
    // reflected in ProductResource for this subsystem/costing type.
    if (task.ownerId) {
      const resource = await prisma.productResource.findUnique({
        where: { productId_userId: { productId, userId: task.ownerId } },
      })
      if (!resource) {
        await prisma.productResource.create({
          data: {
            productId,
            userId: task.ownerId,
            subsystems: isCosting ? [] : [subsystem],
            costingTypes: isCosting ? [subsystem] : [],
          },
        })
        resourcesAdded++
      } else {
        const current = isCosting ? resource.costingTypes : resource.subsystems
        if (!current.includes(subsystem)) {
          await prisma.productResource.update({
            where: { id: resource.id },
            data: isCosting ? { costingTypes: [...current, subsystem] } : { subsystems: [...current, subsystem] },
          })
          resourcesAdded++
        }
      }
    }
  }

  console.log(`\nLinked ${linked} tasks to their product/subsystem.`)
  console.log(`Skipped ${skipped} tasks (couldn't parse product/name, or product deleted).`)
  console.log(`Added/updated ${resourcesAdded} ProductResource entries to reconcile existing task owners.`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })
