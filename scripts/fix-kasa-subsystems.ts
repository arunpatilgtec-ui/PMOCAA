import { PrismaClient } from '../src/generated/prisma'
import { PrismaPg } from '@prisma/adapter-pg'

const connectionString = process.env.DATABASE_URL
if (!connectionString) throw new Error('DATABASE_URL not set')
const adapter = new PrismaPg({ connectionString })
const prisma = new PrismaClient({ adapter })

const KASA_SUBSYSTEMS = [
  'Packaging',
  'Steam & Milk Frother Asm',
  'Aesthetics & Cabinet',
  'Brewing System',
  'Grinding System',
  'Heating System',
  'Filling & Distribution System',
  'Controls',
]

async function main() {
  // Find all KASA projects
  const kasaProjects = await prisma.project.findMany({
    where: { category: 'KASA' },
    include: {
      products: {
        include: { resources: { include: { user: { select: { id: true, name: true } } } } },
      },
    },
  })
  console.log(`Found ${kasaProjects.length} KASA project(s)`)

  for (const project of kasaProjects) {
    for (const product of project.products) {
      console.log(`\nProduct: ${product.brand} ${product.modelNo}`)
      for (const resource of product.resources) {
        await prisma.productResource.update({
          where: { id: resource.id },
          data: { subsystems: KASA_SUBSYSTEMS },
        })
        console.log(`  ${resource.user.name} → subsystems set to all 8`)
      }
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect())
