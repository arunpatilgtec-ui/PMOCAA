import { prisma } from './prisma'
import type { NotificationType, Prisma } from '@/generated/prisma'

interface CreateNotificationInput {
  type: NotificationType
  title: string
  message: string
  userId: string
  senderId?: string
  projectId?: string
  taskId?: string
  actionUrl?: string
  metadata?: Record<string, unknown>
}

export async function createNotification(input: CreateNotificationInput) {
  return prisma.notification.create({
    data: {
      type: input.type,
      title: input.title,
      message: input.message,
      userId: input.userId,
      senderId: input.senderId,
      projectId: input.projectId,
      taskId: input.taskId,
      actionUrl: input.actionUrl,
      metadata: input.metadata as Prisma.InputJsonValue,
    },
  })
}

export async function createBulkNotifications(inputs: CreateNotificationInput[]) {
  return prisma.notification.createMany({
    data: inputs.map((i) => ({
      type: i.type,
      title: i.title,
      message: i.message,
      userId: i.userId,
      senderId: i.senderId,
      projectId: i.projectId,
      taskId: i.taskId,
      actionUrl: i.actionUrl,
      metadata: i.metadata as Prisma.InputJsonValue,
    })),
  })
}

export async function notifyTaskAssigned(
  taskId: string,
  assigneeId: string,
  assignedById: string,
  projectId?: string
) {
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { name: true } })
  await createNotification({
    type: 'TASK_ASSIGNED',
    title: 'Task Assigned',
    message: `You have been assigned to task: ${task?.name}`,
    userId: assigneeId,
    senderId: assignedById,
    taskId,
    projectId,
    actionUrl: `/tasks/${taskId}`,
  })
}

export async function notifyScheduleChangeProposed(
  scheduleChangeId: string,
  requesterId: string,
  projectId: string,
  managerIds: string[]
) {
  await createBulkNotifications(
    managerIds.map((uid) => ({
      type: 'APPROVAL_REQUIRED' as NotificationType,
      title: 'Schedule Change Requires Approval',
      message: 'A schedule change has been proposed and requires your approval.',
      userId: uid,
      senderId: requesterId,
      projectId,
      actionUrl: `/approvals/${scheduleChangeId}`,
    }))
  )
}

export async function notifyApprovalCompleted(
  scheduleChangeId: string,
  approverId: string,
  requesterId: string,
  approved: boolean,
  projectId?: string
) {
  await createNotification({
    type: 'APPROVAL_COMPLETED',
    title: approved ? 'Schedule Change Approved' : 'Schedule Change Rejected',
    message: approved
      ? 'Your proposed schedule change has been approved and applied.'
      : 'Your proposed schedule change has been rejected.',
    userId: requesterId,
    senderId: approverId,
    projectId,
    actionUrl: `/approvals/${scheduleChangeId}`,
  })
}
