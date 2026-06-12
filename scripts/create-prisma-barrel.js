const fs = require('fs')
const path = require('path')

const dir = path.join(__dirname, '..', 'src', 'generated', 'prisma')
fs.mkdirSync(dir, { recursive: true })
fs.writeFileSync(
  path.join(dir, 'index.ts'),
  "export * from './client'\nexport * from './enums'\nexport * from './models'\n"
)
console.log('✓ Created src/generated/prisma/index.ts')
