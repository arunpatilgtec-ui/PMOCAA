import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { CATEGORY_TEMPLATES } from '@/lib/project-templates'
import { addWorkingDays, countWorkingDays } from '@/lib/date-utils'

// Force-resequence ALL task dates from project startDate with no gaps.
// Unlike sync-template, this overwrites existing dates to fix ordering issues.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth()
    if (!['ADMIN', 'PLANNER', 'MANAGER'].includes(session.role)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        workstreams: {
          orderBy: { order: 'asc' },
          include: { tasks: { orderBy: { order: 'asc' } } },
        },
      },
    })
    if (!project) return Response.json({ error: 'Not found' }, { status: 404 })

    const wsTemplates = project.category ? CATEGORY_TEMPLATES[project.category] : undefined

    let updated = 0

    await prisma.$transaction(async (tx) => {
      let cursor = new Date(project.startDate)
      cursor.setHours(0, 0, 0, 0)

      for (const ws of project.workstreams) {
        const tmplWs = wsTemplates?.find((w) => w.name === ws.name)

        for (const task of ws.tasks) {
          // Skip cancelled tasks — they don't occupy timeline space
          if (task.status === 'CANCELLED') continue

          // Determine working-day duration from existing dates, then from template, then default 1
          let durationDays = 1
          if (task.startDate && task.endDate) {
            durationDays = countWorkingDays(new Date(task.startDate), new Date(task.endDate))
          } else {
            const tmplTask = tmplWs?.tasks.find((t) => t.name === task.name)
            durationDays = tmplTask?.durationDays ?? 1
          }

          const taskStart = new Date(cursor)
          const taskEnd   = addWorkingDays(new Date(cursor), durationDays - 1)

          await tx.task.update({
            where: { id: task.id },
            data: { startDate: taskStart, endDate: taskEnd },
          })

          cursor = addWorkingDays(taskEnd, 1)
          updated++
        }
      }

      // Align project endDate to the last task's end
      const lastWs = project.workstreams[project.workstreams.length - 1]
      const lastTask = lastWs?.tasks.filter((t) => t.status !== 'CANCELLED').slice(-1)[0]
      if (lastTask) {
        const newEnd = addWorkingDays(new Date(cursor), -1)
        await tx.project.update({ where: { id }, data: { endDate: newEnd } })
      }
    })

    return Response.json({ updated })
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'Unauthorized') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('[RESEQUENCE]', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
