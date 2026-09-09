import { prisma } from '@/lib/prisma'

// Keeps a Product's ProductResource rows (subsystems[]/costingTypes[] per
// person) in sync when a linked teardown/costing Task's owner changes from
// somewhere OTHER than the Products tab itself (Timeline, Kanban, Gantt).
// This is the reverse of the direction Products already handles: Products
// edits regenerate Task.ownerId from ProductResource; this function updates
// ProductResource from a Task.ownerId change, so either side stays truthful.
export async function syncProductResourceFromTask({
  productId, subsystem, isCosting, fromUserId, toUserId, changedById,
}: {
  productId: string
  subsystem: string
  isCosting: boolean
  fromUserId: string | null
  toUserId: string | null
  changedById: string
}) {
  if (fromUserId === toUserId) return

  const userIds = [fromUserId, toUserId].filter((x): x is string => !!x)
  if (userIds.length === 0) return

  const resources = await prisma.productResource.findMany({
    where: { productId, userId: { in: userIds } },
    include: { user: { select: { name: true } } },
  })
  const fromResource = fromUserId ? resources.find((r) => r.userId === fromUserId) : undefined
  const toResource = toUserId ? resources.find((r) => r.userId === toUserId) : undefined

  // Remove the subsystem/costing tag from the previous owner's assignment.
  if (fromResource) {
    const current = isCosting ? fromResource.costingTypes : fromResource.subsystems
    if (current.includes(subsystem)) {
      const next = current.filter((s) => s !== subsystem)
      const otherArrayStillHasEntries = (isCosting ? fromResource.subsystems : fromResource.costingTypes).length > 0
      if (next.length === 0 && !otherArrayStillHasEntries) {
        await prisma.productResource.delete({ where: { id: fromResource.id } })
        await prisma.productHistory.create({
          data: {
            productId, action: 'RESOURCE_REMOVED', targetUserId: fromResource.userId, changedById,
            data: { userName: fromResource.user.name, subsystems: fromResource.subsystems, costingTypes: fromResource.costingTypes },
          },
        })
      } else {
        await prisma.productResource.update({
          where: { id: fromResource.id },
          data: isCosting ? { costingTypes: next } : { subsystems: next },
        })
        await prisma.productHistory.create({
          data: {
            productId, action: isCosting ? 'COSTING_CHANGED' : 'SUBSYSTEMS_CHANGED', targetUserId: fromResource.userId, changedById,
            data: { userName: fromResource.user.name, from: current, to: next },
          },
        })
      }
    }
  }

  // Add the subsystem/costing tag to the new owner's assignment.
  if (toUserId) {
    if (toResource) {
      const current = isCosting ? toResource.costingTypes : toResource.subsystems
      if (!current.includes(subsystem)) {
        const next = [...current, subsystem]
        await prisma.productResource.update({
          where: { id: toResource.id },
          data: isCosting ? { costingTypes: next } : { subsystems: next },
        })
        await prisma.productHistory.create({
          data: {
            productId, action: isCosting ? 'COSTING_CHANGED' : 'SUBSYSTEMS_CHANGED', targetUserId: toResource.userId, changedById,
            data: { userName: toResource.user.name, from: current, to: next },
          },
        })
      }
    } else {
      const user = await prisma.user.findUnique({ where: { id: toUserId }, select: { name: true } })
      await prisma.productResource.create({
        data: {
          productId,
          userId: toUserId,
          subsystems: isCosting ? [] : [subsystem],
          costingTypes: isCosting ? [subsystem] : [],
        },
      })
      await prisma.productHistory.create({
        data: {
          productId, action: 'RESOURCE_ADDED', targetUserId: toUserId, changedById,
          data: {
            userName: user?.name ?? toUserId,
            subsystems: isCosting ? [] : [subsystem],
            costingTypes: isCosting ? [subsystem] : [],
          },
        },
      })
    }
  }
}
