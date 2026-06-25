import pkg from '../src/generated/prisma/index.js'
const { PrismaClient } = pkg

const prisma = new PrismaClient()

// Cutoff: June 23, 2026 12:30 PM UTC
const CUTOFF = new Date('2026-06-23T12:30:00.000Z')
const before = { lte: CUTOFF }

async function main() {
  console.log('Deleting data created before', CUTOFF.toISOString())

  // 1. Notifications (linked to projects, or standalone)
  const n = await prisma.notification.deleteMany({ where: { createdAt: before } })
  console.log('Notifications deleted:', n.count)

  // 2. Approval requests
  const ar = await prisma.approvalRequest.deleteMany({ where: { createdAt: before } })
  console.log('ApprovalRequests deleted:', ar.count)

  // 3. Strategic tasks → strategic requests
  const st = await prisma.strategicTask.deleteMany({ where: { createdAt: before } })
  console.log('StrategicTasks deleted:', st.count)

  const sr = await prisma.strategicRequest.deleteMany({ where: { createdAt: before } })
  console.log('StrategicRequests deleted:', sr.count)

  // 4. Requests (linked to projects)
  const req = await prisma.request.deleteMany({ where: { createdAt: before } })
  console.log('Requests deleted:', req.count)

  // 5. Projects — cascades: workstreams → tasks → taskHistory, taskOwnerHistory,
  //    products → productHistory, productResource, resourceAllocation, milestone,
  //    scheduleChange, document, notification
  const p = await prisma.project.deleteMany({ where: { createdAt: before } })
  console.log('Projects deleted:', p.count)

  console.log('Done.')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
