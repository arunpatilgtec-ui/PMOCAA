import { prisma } from '../src/lib/prisma.js'
import bcrypt from 'bcryptjs'

async function main() {
  const hash = await bcrypt.hash('admin123', 12)
  const result = await prisma.user.update({
    where: { email: 'admin@pmo.internal' },
    data: { password: hash, isActive: true },
    select: { email: true, role: true, isActive: true }
  })
  console.log('Updated admin:', result)
}

main().then(() => prisma.$disconnect()).catch(e => { console.error(e); process.exit(1) })
