interface EmailPayload {
  to: string | string[]
  subject: string
  html: string
  text?: string
}

export async function sendEmail(payload: EmailPayload): Promise<void> {
  // In production, configure nodemailer here
  // For development, just log to console
  if (process.env.NODE_ENV !== 'production') {
    const recipients = Array.isArray(payload.to) ? payload.to.join(', ') : payload.to
    console.log(`[EMAIL] To: ${recipients} | Subject: ${payload.subject}`)
    return
  }

  try {
    const nodemailer = await import('nodemailer')
    const transporter = nodemailer.default.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    })

    await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: Array.isArray(payload.to) ? payload.to.join(', ') : payload.to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
    })
  } catch (err) {
    console.error('[EMAIL ERROR]', err)
  }
}

export function buildTaskAssignedEmail(userName: string, taskName: string, projectName: string) {
  return {
    subject: `Task Assigned: ${taskName}`,
    html: `
      <h2>You've been assigned a new task</h2>
      <p>Hi ${userName},</p>
      <p>You have been assigned to <strong>${taskName}</strong> in project <strong>${projectName}</strong>.</p>
      <p>Please log in to the PMO Portal to view the details.</p>
    `,
  }
}

export function buildApprovalRequestEmail(approverName: string, requesterName: string, description: string) {
  return {
    subject: 'Approval Required: Schedule Change',
    html: `
      <h2>Schedule Change Requires Your Approval</h2>
      <p>Hi ${approverName},</p>
      <p><strong>${requesterName}</strong> has proposed a schedule change:</p>
      <blockquote>${description}</blockquote>
      <p>Please log in to review and approve or reject this change.</p>
    `,
  }
}

export function buildApprovalCompleteEmail(
  requesterName: string,
  approved: boolean,
  comments?: string
) {
  return {
    subject: `Schedule Change ${approved ? 'Approved' : 'Rejected'}`,
    html: `
      <h2>Schedule Change ${approved ? 'Approved' : 'Rejected'}</h2>
      <p>Hi ${requesterName},</p>
      <p>Your proposed schedule change has been <strong>${approved ? 'approved' : 'rejected'}</strong>.</p>
      ${comments ? `<p>Comments: ${comments}</p>` : ''}
      <p>Please log in to view the updated schedule.</p>
    `,
  }
}
