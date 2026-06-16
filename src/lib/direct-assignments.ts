import { prisma } from '@/lib/prisma'

const DIRECT_WORK_PROJECT_NAME = '__direct_assignments__'

export async function getOrCreateDirectWorkstream(assignerId: string) {
  const existing = await prisma.project.findFirst({
    where: { name: DIRECT_WORK_PROJECT_NAME },
    include: { workstreams: { take: 1 } },
  })

  if (existing) {
    if (existing.workstreams.length > 0) return existing.workstreams[0]
    return prisma.workstream.create({
      data: { projectId: existing.id, name: 'Direct Assignments', status: 'IN_PROGRESS' },
    })
  }

  const created = await prisma.project.create({
    data: {
      name: DIRECT_WORK_PROJECT_NAME,
      description: 'System project for direct work assignments',
      type: 'OTHER',
      status: 'ACTIVE',
      priority: 'MEDIUM',
      startDate: new Date('2024-01-01'),
      endDate: new Date('2099-12-31'),
      plannerId: assignerId,
      workstreams: {
        create: { name: 'Direct Assignments', status: 'IN_PROGRESS' },
      },
    },
    include: { workstreams: { take: 1 } },
  })
  return created.workstreams[0]
}
