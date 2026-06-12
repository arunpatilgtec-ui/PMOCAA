import { prisma } from './prisma'
import type { ChangeType, Priority } from '@/generated/prisma'

export interface ImpactedItem {
  id: string
  name: string
  type: 'task' | 'project' | 'resource'
  currentEndDate?: Date
  proposedEndDate?: Date
  delayDays?: number
  reason: string
}

export interface ScheduleImpactResult {
  affectedTasks: ImpactedItem[]
  affectedProjects: ImpactedItem[]
  affectedResources: ImpactedItem[]
  overloadedResources: string[]
  totalDelayDays: number
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  summary: string
}

export async function calculateScheduleImpact(
  changeType: ChangeType,
  payload: {
    taskId?: string
    projectId?: string
    userId?: string
    newStartDate?: Date
    newEndDate?: Date
    newPriority?: Priority
    additionalHours?: number
  }
): Promise<ScheduleImpactResult> {
  const affectedTasks: ImpactedItem[] = []
  const affectedProjects: ImpactedItem[] = []
  const affectedResources: ImpactedItem[] = []
  const overloadedResources: string[] = []

  if (payload.taskId) {
    const task = await prisma.task.findUnique({
      where: { id: payload.taskId },
      include: {
        owner: true,
        workstream: { include: { project: true } },
      },
    })

    if (task) {
      // Find dependent tasks
      if (task.endDate && payload.newEndDate) {
        const delayMs = payload.newEndDate.getTime() - task.endDate.getTime()
        const delayDays = Math.ceil(delayMs / (1000 * 60 * 60 * 24))

        if (delayDays > 0) {
          affectedTasks.push({
            id: task.id,
            name: task.name,
            type: 'task',
            currentEndDate: task.endDate,
            proposedEndDate: payload.newEndDate,
            delayDays,
            reason: `Direct schedule change: +${delayDays} day(s)`,
          })

          // Check project impact
          const project = task.workstream.project
          if (project.endDate && payload.newEndDate > project.endDate) {
            const projectDelay = Math.ceil(
              (payload.newEndDate.getTime() - project.endDate.getTime()) / (1000 * 60 * 60 * 24)
            )
            affectedProjects.push({
              id: project.id,
              name: project.name,
              type: 'project',
              currentEndDate: project.endDate,
              proposedEndDate: payload.newEndDate,
              delayDays: projectDelay,
              reason: `Critical task delayed by ${delayDays} day(s)`,
            })
          }

          // Check resource overload
          if (task.ownerId) {
            const owner = task.owner!
            const conflictingTasks = await prisma.task.count({
              where: {
                ownerId: task.ownerId,
                id: { not: task.id },
                status: { in: ['IN_PROGRESS', 'PLANNED'] },
                startDate: { lte: payload.newEndDate },
                endDate: { gte: payload.newStartDate || task.startDate || undefined },
              },
            })

            if (conflictingTasks > 0) {
              overloadedResources.push(owner.name)
              affectedResources.push({
                id: owner.id,
                name: owner.name,
                type: 'resource',
                reason: `Has ${conflictingTasks} conflicting task(s) in the new time window`,
              })
            }
          }
        }
      }
    }
  }

  if (payload.userId) {
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      include: {
        ownedTasks: {
          where: { status: { in: ['IN_PROGRESS', 'PLANNED'] } },
          include: { workstream: { include: { project: true } } },
        },
        allocations: { include: { project: true } },
      },
    })

    if (user) {
      const totalAllocation = user.allocations.reduce((sum, a) => sum + a.allocationPct, 0)
      if (totalAllocation > user.capacityPct) {
        overloadedResources.push(user.name)
        affectedResources.push({
          id: user.id,
          name: user.name,
          type: 'resource',
          reason: `Allocated ${totalAllocation}% vs capacity ${user.capacityPct}%`,
        })
      }
    }
  }

  const totalDelayDays = Math.max(
    0,
    ...affectedTasks.map((t) => t.delayDays || 0),
    ...affectedProjects.map((p) => p.delayDays || 0)
  )

  const severity: ScheduleImpactResult['severity'] =
    totalDelayDays >= 14 || affectedProjects.length > 1
      ? 'CRITICAL'
      : totalDelayDays >= 7 || overloadedResources.length > 0
        ? 'HIGH'
        : totalDelayDays >= 3
          ? 'MEDIUM'
          : 'LOW'

  const summary =
    affectedTasks.length === 0 && affectedProjects.length === 0 && overloadedResources.length === 0
      ? 'No significant schedule impact detected.'
      : `Impact: ${affectedTasks.length} task(s) affected, ${affectedProjects.length} project(s) at risk, ${overloadedResources.length} resource(s) overloaded. Max delay: ${totalDelayDays} day(s).`

  return {
    affectedTasks,
    affectedProjects,
    affectedResources,
    overloadedResources,
    totalDelayDays,
    severity,
    summary,
  }
}
