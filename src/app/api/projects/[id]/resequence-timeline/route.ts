import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { addWorkingDays } from '@/lib/date-utils'

function addCalDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

// Advance past any weekend day
function nextWeekday(date: Date): Date {
  const d = new Date(date)
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1)
  return d
}

// Resets task dates so workstreams are sequential with no gaps:
//  - "Tear Down" workstream → working days 3–7 from project start  (matches sync-product-teardown)
//  - "Costing" workstream   → working days 8–12 from project start (matches sync-product-teardown)
//  - All other workstreams  → shifted as a block to follow the previous workstream
// Tasks WITHIN a workstream all receive the same dates for per-product parallel tasks,
// or retain their relative offsets via the block-shift for non-parallel workstreams.
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

    // These windows exactly mirror sync-product-teardown so per-product tasks
    // are restored to the same dates they had on first creation.
    const tdStart   = addWorkingDays(new Date(project.startDate), 2)
    const tdEnd     = addWorkingDays(new Date(project.startDate), 6)
    const costStart = addWorkingDays(new Date(project.startDate), 7)
    const costEnd   = addWorkingDays(new Date(project.startDate), 11)

    let updated   = 0
    let prevWsEnd: Date | null = null

    await prisma.$transaction(async (tx) => {
      for (const ws of project.workstreams) {
        const activeTasks = ws.tasks.filter((t) => t.status !== 'CANCELLED')
        if (activeTasks.length === 0) continue

        if (ws.name === 'Tear Down') {
          for (const task of activeTasks) {
            await tx.task.update({
              where: { id: task.id },
              data: { startDate: tdStart, endDate: tdEnd },
            })
            updated++
          }
          prevWsEnd = tdEnd
          continue
        }

        if (ws.name === 'Costing') {
          for (const task of activeTasks) {
            await tx.task.update({
              where: { id: task.id },
              data: { startDate: costStart, endDate: costEnd },
            })
            updated++
          }
          prevWsEnd = costEnd
          continue
        }

        // Non Tear Down / Costing: shift the whole workstream block so it starts
        // right after the previous workstream ends.
        const datedTasks = activeTasks.filter((t) => t.startDate && t.endDate)
        if (datedTasks.length === 0) continue

        const wsStartMs = Math.min(...datedTasks.map((t) => new Date(t.startDate!).getTime()))
        const wsEndMs   = Math.max(...datedTasks.map((t) => new Date(t.endDate!).getTime()))
        const wsStart   = new Date(wsStartMs)
        const wsEnd     = new Date(wsEndMs)

        const newWsStart = prevWsEnd === null
          ? nextWeekday(new Date(project.startDate))
          : nextWeekday(addCalDays(prevWsEnd, 1))

        const shiftDays = Math.round(
          (newWsStart.getTime() - wsStart.getTime()) / 86_400_000,
        )

        if (shiftDays !== 0) {
          for (const task of ws.tasks) {
            if (!task.startDate) continue
            await tx.task.update({
              where: { id: task.id },
              data: {
                startDate: addCalDays(task.startDate, shiftDays),
                endDate: task.endDate
                  ? addCalDays(task.endDate, shiftDays)
                  : addCalDays(task.startDate, shiftDays),
              },
            })
            updated++
          }
        }

        prevWsEnd = addCalDays(wsEnd, shiftDays)
      }

      if (prevWsEnd) {
        await tx.project.update({ where: { id }, data: { endDate: prevWsEnd } })
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
