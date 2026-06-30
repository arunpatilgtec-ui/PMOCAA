import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'

function addCalDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

// Advance to next weekday (Mon–Fri) if date lands on a weekend
function nextWeekday(date: Date): Date {
  const d = new Date(date)
  const dow = d.getDay()
  if (dow === 6) d.setDate(d.getDate() + 2) // Sat → Mon
  if (dow === 0) d.setDate(d.getDate() + 1) // Sun → Mon
  return d
}

// Shift ALL workstreams so they are back-to-back with no gaps,
// treating each workstream as a single block.
// Tasks WITHIN a workstream keep their relative offsets (preserves parallel tasks).
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

    let updated = 0
    let prevWsEnd: Date | null = null

    await prisma.$transaction(async (tx) => {
      for (const ws of project.workstreams) {
        // Only consider non-cancelled tasks that have dates
        const datedTasks = ws.tasks.filter(
          (t) => t.status !== 'CANCELLED' && t.startDate && t.endDate,
        )
        if (datedTasks.length === 0) continue

        // Workstream bounding box
        const wsStartMs = Math.min(...datedTasks.map((t) => new Date(t.startDate!).getTime()))
        const wsEndMs   = Math.max(...datedTasks.map((t) => new Date(t.endDate!).getTime()))
        const wsStart   = new Date(wsStartMs)
        const wsEnd     = new Date(wsEndMs)

        // Where should this workstream start?
        let newWsStart: Date
        if (prevWsEnd === null) {
          newWsStart = nextWeekday(new Date(project.startDate))
        } else {
          // Day immediately after previous workstream ends (skip weekends)
          newWsStart = nextWeekday(addCalDays(prevWsEnd, 1))
        }

        // Calendar-day shift to apply to every task in this workstream
        const shiftDays = Math.round(
          (newWsStart.getTime() - wsStart.getTime()) / 86_400_000,
        )

        if (shiftDays !== 0) {
          for (const task of ws.tasks) {
            if (!task.startDate) continue
            const newStart = addCalDays(task.startDate, shiftDays)
            const newEnd   = task.endDate
              ? addCalDays(task.endDate, shiftDays)
              : newStart // endDate < startDate guard — use startDate as end
            await tx.task.update({
              where: { id: task.id },
              data: { startDate: newStart, endDate: newEnd },
            })
            updated++
          }
        }

        // Advance cursor to new end of this workstream
        prevWsEnd = addCalDays(wsEnd, shiftDays)
      }

      // Update project endDate to match the last task's end
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
