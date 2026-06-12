import { PrismaClient } from '../src/generated/prisma'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcryptjs'
import { addDays, subDays } from 'date-fns'
import 'dotenv/config'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

async function hash(password: string) {
  return bcrypt.hash(password, 12)
}

async function main() {
  console.log('🌱 Seeding database...')

  // ---- Users ----
  const users = await Promise.all([
    // Admin
    prisma.user.upsert({
      where: { email: 'admin@pmo.internal' },
      update: {},
      create: {
        email: 'admin@pmo.internal', name: 'Alex Administrator',
        password: await hash('admin123'), role: 'ADMIN',
        title: 'PMO Administrator', department: 'PMO', capacityPct: 100,
      },
    }),
    // Managers
    prisma.user.upsert({
      where: { email: 'manager@pmo.internal' },
      update: {},
      create: {
        email: 'manager@pmo.internal', name: 'Maria Manager',
        password: await hash('manager123'), role: 'MANAGER',
        title: 'Engineering Manager', department: 'Engineering', capacityPct: 80,
      },
    }),
    prisma.user.upsert({
      where: { email: 'michael.chen@pmo.internal' },
      update: {},
      create: {
        email: 'michael.chen@pmo.internal', name: 'Michael Chen',
        password: await hash('password123'), role: 'MANAGER',
        title: 'Senior Engineering Manager', department: 'Engineering', capacityPct: 80,
      },
    }),
    // Planners
    prisma.user.upsert({
      where: { email: 'planner@pmo.internal' },
      update: {},
      create: {
        email: 'planner@pmo.internal', name: 'Peter Planner',
        password: await hash('planner123'), role: 'PLANNER',
        title: 'Project Planner', department: 'PMO', capacityPct: 100,
      },
    }),
    prisma.user.upsert({
      where: { email: 'sarah.jones@pmo.internal' },
      update: {},
      create: {
        email: 'sarah.jones@pmo.internal', name: 'Sarah Jones',
        password: await hash('password123'), role: 'PLANNER',
        title: 'Senior Planner', department: 'PMO', capacityPct: 100,
      },
    }),
    // Project Leads
    prisma.user.upsert({
      where: { email: 'lead1@pmo.internal' },
      update: {},
      create: {
        email: 'lead1@pmo.internal', name: 'Laura Lead',
        password: await hash('lead123'), role: 'PROJECT_LEAD',
        title: 'Senior Project Lead', department: 'Mechanical', capacityPct: 100,
      },
    }),
    prisma.user.upsert({
      where: { email: 'james.wilson@pmo.internal' },
      update: {},
      create: {
        email: 'james.wilson@pmo.internal', name: 'James Wilson',
        password: await hash('password123'), role: 'PROJECT_LEAD',
        title: 'Project Lead', department: 'Electronics', capacityPct: 100,
      },
    }),
    // Workstream Leads
    prisma.user.upsert({
      where: { email: 'ws.mech@pmo.internal' },
      update: {},
      create: {
        email: 'ws.mech@pmo.internal', name: 'Mark Mechanical',
        password: await hash('password123'), role: 'WORKSTREAM_LEAD',
        title: 'Mechanical Lead', department: 'Mechanical', capacityPct: 100,
      },
    }),
    prisma.user.upsert({
      where: { email: 'ws.elec@pmo.internal' },
      update: {},
      create: {
        email: 'ws.elec@pmo.internal', name: 'Elena Electronics',
        password: await hash('password123'), role: 'WORKSTREAM_LEAD',
        title: 'Electronics Lead', department: 'Electronics', capacityPct: 100,
      },
    }),
    prisma.user.upsert({
      where: { email: 'ws.cost@pmo.internal' },
      update: {},
      create: {
        email: 'ws.cost@pmo.internal', name: 'Carlos Costing',
        password: await hash('password123'), role: 'WORKSTREAM_LEAD',
        title: 'Cost Analysis Lead', department: 'Finance', capacityPct: 100,
      },
    }),
    // Resources (Engineers/Analysts)
    prisma.user.upsert({
      where: { email: 'eng1@pmo.internal' },
      update: {},
      create: {
        email: 'eng1@pmo.internal', name: 'Emma Engineer',
        password: await hash('password123'), role: 'RESOURCE',
        title: 'Mechanical Engineer', department: 'Mechanical', capacityPct: 100,
      },
    }),
    prisma.user.upsert({
      where: { email: 'eng2@pmo.internal' },
      update: {},
      create: {
        email: 'eng2@pmo.internal', name: 'David Designer',
        password: await hash('password123'), role: 'RESOURCE',
        title: 'Design Engineer', department: 'Mechanical', capacityPct: 100,
      },
    }),
    prisma.user.upsert({
      where: { email: 'eng3@pmo.internal' },
      update: {},
      create: {
        email: 'eng3@pmo.internal', name: 'Rachel Richards',
        password: await hash('password123'), role: 'RESOURCE',
        title: 'Electronics Engineer', department: 'Electronics', capacityPct: 100,
      },
    }),
    prisma.user.upsert({
      where: { email: 'eng4@pmo.internal' },
      update: {},
      create: {
        email: 'eng4@pmo.internal', name: 'Tom Thompson',
        password: await hash('password123'), role: 'RESOURCE',
        title: 'Software Engineer', department: 'Electronics', capacityPct: 100,
      },
    }),
    prisma.user.upsert({
      where: { email: 'eng5@pmo.internal' },
      update: {},
      create: {
        email: 'eng5@pmo.internal', name: 'Nancy Nguyen',
        password: await hash('password123'), role: 'RESOURCE',
        title: 'Manufacturing Engineer', department: 'Manufacturing', capacityPct: 100,
      },
    }),
    prisma.user.upsert({
      where: { email: 'eng6@pmo.internal' },
      update: {},
      create: {
        email: 'eng6@pmo.internal', name: 'Kevin Kim',
        password: await hash('password123'), role: 'RESOURCE',
        title: 'Cost Analyst', department: 'Finance', capacityPct: 100,
      },
    }),
    prisma.user.upsert({
      where: { email: 'eng7@pmo.internal' },
      update: {},
      create: {
        email: 'eng7@pmo.internal', name: 'Anna Anderson',
        password: await hash('password123'), role: 'RESOURCE',
        title: 'Quality Engineer', department: 'Quality', capacityPct: 100,
      },
    }),
    prisma.user.upsert({
      where: { email: 'eng8@pmo.internal' },
      update: {},
      create: {
        email: 'eng8@pmo.internal', name: 'Brian Brown',
        password: await hash('password123'), role: 'RESOURCE',
        title: 'Systems Engineer', department: 'Systems', capacityPct: 100,
      },
    }),
    prisma.user.upsert({
      where: { email: 'eng9@pmo.internal' },
      update: {},
      create: {
        email: 'eng9@pmo.internal', name: 'Sophia Santos',
        password: await hash('password123'), role: 'RESOURCE',
        title: 'Mechanical Engineer II', department: 'Mechanical', capacityPct: 80,
      },
    }),
    prisma.user.upsert({
      where: { email: 'eng10@pmo.internal' },
      update: {},
      create: {
        email: 'eng10@pmo.internal', name: 'Daniel Davis',
        password: await hash('password123'), role: 'RESOURCE',
        title: 'Reliability Engineer', department: 'Quality', capacityPct: 100,
      },
    }),
    // Leadership
    prisma.user.upsert({
      where: { email: 'vp@pmo.internal' },
      update: {},
      create: {
        email: 'vp@pmo.internal', name: 'Victoria VP',
        password: await hash('vp123'), role: 'LEADERSHIP',
        title: 'VP Engineering', department: 'Leadership', capacityPct: 20,
      },
    }),
    prisma.user.upsert({
      where: { email: 'director@pmo.internal' },
      update: {},
      create: {
        email: 'director@pmo.internal', name: 'Derek Director',
        password: await hash('password123'), role: 'LEADERSHIP',
        title: 'Engineering Director', department: 'Leadership', capacityPct: 30,
      },
    }),
  ])

  const [admin, manager, manager2, planner, planner2, lead1, lead2, wsLead1, wsLead2, wsLead3,
    eng1, eng2, eng3, eng4, eng5, eng6, eng7, eng8, eng9, eng10] = users

  console.log('✅ Users created:', users.length)

  const today = new Date()

  // ---- Project 1: Active Teardown - Competitor Dishwasher ----
  const proj1 = await prisma.project.upsert({
    where: { id: 'proj_teardown_dishwasher' },
    update: {},
    create: {
      id: 'proj_teardown_dishwasher',
      name: 'Competitor Dishwasher Teardown Q2',
      description: 'Full teardown and analysis of competitor\'s premium dishwasher line including cost analysis, manufacturing assessment, and technology benchmarking.',
      type: 'TEARDOWN',
      status: 'ACTIVE',
      priority: 'HIGH',
      startDate: subDays(today, 30),
      endDate: addDays(today, 60),
      leadId: lead1.id,
      plannerId: planner.id,
    },
  })

  const ws1_mech = await prisma.workstream.upsert({
    where: { id: 'ws1_mech' },
    update: {},
    create: {
      id: 'ws1_mech', name: 'Mechanical Analysis', projectId: proj1.id,
      leadId: wsLead1.id, status: 'IN_PROGRESS', order: 0,
    },
  })
  const ws1_elec = await prisma.workstream.upsert({
    where: { id: 'ws1_elec' },
    update: {},
    create: {
      id: 'ws1_elec', name: 'Electronics Assessment', projectId: proj1.id,
      leadId: wsLead2.id, status: 'IN_PROGRESS', order: 1,
    },
  })
  const ws1_cost = await prisma.workstream.upsert({
    where: { id: 'ws1_cost' },
    update: {},
    create: {
      id: 'ws1_cost', name: 'Costing & BOM', projectId: proj1.id,
      leadId: wsLead3.id, status: 'NOT_STARTED', order: 2,
    },
  })
  const ws1_report = await prisma.workstream.upsert({
    where: { id: 'ws1_report' },
    update: {},
    create: {
      id: 'ws1_report', name: 'Reporting', projectId: proj1.id,
      status: 'NOT_STARTED', order: 3,
    },
  })

  // Tasks for proj1
  const tasks1 = await Promise.all([
    prisma.task.upsert({
      where: { id: 'task1_1' }, update: {},
      create: {
        id: 'task1_1', name: 'Disassembly & Documentation',
        workstreamId: ws1_mech.id, ownerId: eng1.id,
        status: 'COMPLETED', priority: 'HIGH',
        startDate: subDays(today, 28), endDate: subDays(today, 20),
        effortHours: 16, estimatedHours: 20, order: 0,
        tags: ['teardown', 'mechanical'],
      },
    }),
    prisma.task.upsert({
      where: { id: 'task1_2' }, update: {},
      create: {
        id: 'task1_2', name: 'Spray Arm Mechanism Analysis',
        workstreamId: ws1_mech.id, ownerId: eng1.id,
        status: 'IN_PROGRESS', priority: 'HIGH',
        startDate: subDays(today, 18), endDate: addDays(today, 5),
        effortHours: 12, estimatedHours: 16, order: 1,
        tags: ['mechanical', 'analysis'],
      },
    }),
    prisma.task.upsert({
      where: { id: 'task1_3' }, update: {},
      create: {
        id: 'task1_3', name: 'Pump Assembly Reverse Engineering',
        workstreamId: ws1_mech.id, ownerId: eng2.id,
        status: 'IN_PROGRESS', priority: 'MEDIUM',
        startDate: subDays(today, 15), endDate: addDays(today, 10),
        effortHours: 20, estimatedHours: 24, order: 2,
      },
    }),
    prisma.task.upsert({
      where: { id: 'task1_4' }, update: {},
      create: {
        id: 'task1_4', name: 'Door Latch & Seal Assessment',
        workstreamId: ws1_mech.id, ownerId: eng9.id,
        status: 'PLANNED', priority: 'LOW',
        startDate: addDays(today, 5), endDate: addDays(today, 20),
        effortHours: 8, estimatedHours: 10, order: 3,
      },
    }),
    prisma.task.upsert({
      where: { id: 'task1_5' }, update: {},
      create: {
        id: 'task1_5', name: 'Control Board Reverse Engineering',
        workstreamId: ws1_elec.id, ownerId: eng3.id,
        status: 'IN_PROGRESS', priority: 'CRITICAL',
        startDate: subDays(today, 20), endDate: addDays(today, 15),
        effortHours: 30, estimatedHours: 32, order: 0,
        tags: ['electronics', 'critical'],
      },
    }),
    prisma.task.upsert({
      where: { id: 'task1_6' }, update: {},
      create: {
        id: 'task1_6', name: 'Motor Driver Analysis',
        workstreamId: ws1_elec.id, ownerId: eng4.id,
        status: 'PLANNED', priority: 'HIGH',
        startDate: addDays(today, 2), endDate: addDays(today, 18),
        effortHours: 16, estimatedHours: 20, order: 1,
      },
    }),
    prisma.task.upsert({
      where: { id: 'task1_7' }, update: {},
      create: {
        id: 'task1_7', name: 'BOM Construction - Mechanical',
        workstreamId: ws1_cost.id, ownerId: eng6.id,
        status: 'PLANNED', priority: 'HIGH',
        startDate: addDays(today, 15), endDate: addDays(today, 30),
        effortHours: 24, estimatedHours: 30, order: 0,
      },
    }),
    prisma.task.upsert({
      where: { id: 'task1_8' }, update: {},
      create: {
        id: 'task1_8', name: 'Cost Analysis & Benchmarking',
        workstreamId: ws1_cost.id, ownerId: eng6.id,
        status: 'BACKLOG', priority: 'HIGH',
        startDate: addDays(today, 28), endDate: addDays(today, 45),
        effortHours: 20, estimatedHours: 24, order: 1,
      },
    }),
    prisma.task.upsert({
      where: { id: 'task1_9' }, update: {},
      create: {
        id: 'task1_9', name: 'Executive Summary Report',
        workstreamId: ws1_report.id,
        status: 'BACKLOG', priority: 'MEDIUM',
        startDate: addDays(today, 45), endDate: addDays(today, 60),
        effortHours: 16, estimatedHours: 20, order: 0,
      },
    }),
  ])

  // Milestones for proj1
  await Promise.all([
    prisma.milestone.upsert({
      where: { id: 'ms1_1' }, update: {},
      create: {
        id: 'ms1_1', name: 'Teardown Complete', projectId: proj1.id,
        dueDate: subDays(today, 20), completed: true, completedAt: subDays(today, 22),
      },
    }),
    prisma.milestone.upsert({
      where: { id: 'ms1_2' }, update: {},
      create: {
        id: 'ms1_2', name: 'Electronics Analysis Complete', projectId: proj1.id,
        dueDate: addDays(today, 20), completed: false,
      },
    }),
    prisma.milestone.upsert({
      where: { id: 'ms1_3' }, update: {},
      create: {
        id: 'ms1_3', name: 'Full Report Delivered', projectId: proj1.id,
        dueDate: addDays(today, 60), completed: false,
      },
    }),
  ])

  // Allocations for proj1
  await Promise.all([
    prisma.resourceAllocation.upsert({
      where: { userId_projectId: { userId: eng1.id, projectId: proj1.id } }, update: {},
      create: { userId: eng1.id, projectId: proj1.id, allocationPct: 60, startDate: subDays(today, 30), endDate: addDays(today, 60) },
    }),
    prisma.resourceAllocation.upsert({
      where: { userId_projectId: { userId: eng2.id, projectId: proj1.id } }, update: {},
      create: { userId: eng2.id, projectId: proj1.id, allocationPct: 50, startDate: subDays(today, 30), endDate: addDays(today, 60) },
    }),
    prisma.resourceAllocation.upsert({
      where: { userId_projectId: { userId: eng3.id, projectId: proj1.id } }, update: {},
      create: { userId: eng3.id, projectId: proj1.id, allocationPct: 80, startDate: subDays(today, 30), endDate: addDays(today, 60) },
    }),
    prisma.resourceAllocation.upsert({
      where: { userId_projectId: { userId: eng6.id, projectId: proj1.id } }, update: {},
      create: { userId: eng6.id, projectId: proj1.id, allocationPct: 40, startDate: addDays(today, 15), endDate: addDays(today, 60) },
    }),
  ])

  // ---- Project 2: Active Teardown - Refrigerator ----
  const proj2 = await prisma.project.upsert({
    where: { id: 'proj_teardown_fridge' },
    update: {},
    create: {
      id: 'proj_teardown_fridge',
      name: 'Premium Refrigerator Competitive Teardown',
      description: 'Detailed analysis of three competitor premium refrigerators focusing on compressor technology, insulation materials, and smart features.',
      type: 'TEARDOWN',
      status: 'ACTIVE',
      priority: 'CRITICAL',
      startDate: subDays(today, 45),
      endDate: addDays(today, 30),
      leadId: lead2.id,
      plannerId: planner2.id,
    },
  })

  const ws2_mech = await prisma.workstream.upsert({
    where: { id: 'ws2_mech' }, update: {},
    create: { id: 'ws2_mech', name: 'Mechanical Systems', projectId: proj2.id, leadId: wsLead1.id, status: 'IN_PROGRESS', order: 0 },
  })
  const ws2_thermal = await prisma.workstream.upsert({
    where: { id: 'ws2_thermal' }, update: {},
    create: { id: 'ws2_thermal', name: 'Thermal Management', projectId: proj2.id, status: 'IN_PROGRESS', order: 1 },
  })
  const ws2_elec = await prisma.workstream.upsert({
    where: { id: 'ws2_elec' }, update: {},
    create: { id: 'ws2_elec', name: 'Smart Controls', projectId: proj2.id, leadId: wsLead2.id, status: 'NOT_STARTED', order: 2 },
  })

  await Promise.all([
    prisma.task.upsert({
      where: { id: 'task2_1' }, update: {},
      create: {
        id: 'task2_1', name: 'Compressor Analysis', workstreamId: ws2_mech.id, ownerId: eng2.id,
        status: 'COMPLETED', priority: 'CRITICAL',
        startDate: subDays(today, 44), endDate: subDays(today, 30),
        effortHours: 24, estimatedHours: 24, order: 0,
      },
    }),
    prisma.task.upsert({
      where: { id: 'task2_2' }, update: {},
      create: {
        id: 'task2_2', name: 'Door Seal & Gasket Study', workstreamId: ws2_mech.id, ownerId: eng9.id,
        status: 'IN_PROGRESS', priority: 'HIGH',
        startDate: subDays(today, 25), endDate: addDays(today, 5),
        effortHours: 12, estimatedHours: 16, order: 1,
      },
    }),
    prisma.task.upsert({
      where: { id: 'task2_3' }, update: {},
      create: {
        id: 'task2_3', name: 'Insulation Material Testing', workstreamId: ws2_thermal.id, ownerId: eng7.id,
        status: 'IN_PROGRESS', priority: 'HIGH',
        startDate: subDays(today, 20), endDate: addDays(today, 10),
        effortHours: 20, estimatedHours: 20, order: 0,
      },
    }),
    prisma.task.upsert({
      where: { id: 'task2_4' }, update: {},
      create: {
        id: 'task2_4', name: 'Refrigerant Cycle Mapping', workstreamId: ws2_thermal.id, ownerId: eng8.id,
        status: 'IN_PROGRESS', priority: 'MEDIUM',
        startDate: subDays(today, 15), endDate: addDays(today, 15),
        effortHours: 16, estimatedHours: 18, order: 1,
      },
    }),
    prisma.task.upsert({
      where: { id: 'task2_5' }, update: {},
      create: {
        id: 'task2_5', name: 'IoT Module Reverse Engineering', workstreamId: ws2_elec.id, ownerId: eng3.id,
        status: 'PLANNED', priority: 'MEDIUM',
        startDate: addDays(today, 8), endDate: addDays(today, 25),
        effortHours: 20, estimatedHours: 24, order: 0,
      },
    }),
  ])

  await Promise.all([
    prisma.resourceAllocation.upsert({
      where: { userId_projectId: { userId: eng2.id, projectId: proj2.id } }, update: {},
      create: { userId: eng2.id, projectId: proj2.id, allocationPct: 50, startDate: subDays(today, 45), endDate: addDays(today, 30) },
    }),
    prisma.resourceAllocation.upsert({
      where: { userId_projectId: { userId: eng3.id, projectId: proj2.id } }, update: {},
      create: { userId: eng3.id, projectId: proj2.id, allocationPct: 30, startDate: addDays(today, 5), endDate: addDays(today, 30) },
    }),
    prisma.resourceAllocation.upsert({
      where: { userId_projectId: { userId: eng7.id, projectId: proj2.id } }, update: {},
      create: { userId: eng7.id, projectId: proj2.id, allocationPct: 60, startDate: subDays(today, 20), endDate: addDays(today, 30) },
    }),
  ])

  // Note: eng3 is now allocated 80% to proj1 + 30% to proj2 = 110% → OVERLOADED (sample conflict)

  // ---- Project 3: Cost Reduction Study ----
  const proj3 = await prisma.project.upsert({
    where: { id: 'proj_costreduction' },
    update: {},
    create: {
      id: 'proj_costreduction',
      name: 'Washing Machine BOM Cost Reduction',
      description: 'Identify and implement cost reduction opportunities across the product BOM targeting 15% reduction in COGS.',
      type: 'OTHER',
      status: 'ACTIVE',
      priority: 'HIGH',
      startDate: subDays(today, 10),
      endDate: addDays(today, 80),
      leadId: lead1.id,
      plannerId: planner.id,
    },
  })

  const ws3_analysis = await prisma.workstream.upsert({
    where: { id: 'ws3_analysis' }, update: {},
    create: { id: 'ws3_analysis', name: 'BOM Analysis', projectId: proj3.id, status: 'IN_PROGRESS', order: 0 },
  })
  const ws3_supplier = await prisma.workstream.upsert({
    where: { id: 'ws3_supplier' }, update: {},
    create: { id: 'ws3_supplier', name: 'Supplier Investigation', projectId: proj3.id, status: 'NOT_STARTED', order: 1 },
  })
  const ws3_mfg = await prisma.workstream.upsert({
    where: { id: 'ws3_mfg' }, update: {},
    create: { id: 'ws3_mfg', name: 'Manufacturing Assessment', projectId: proj3.id, status: 'NOT_STARTED', order: 2 },
  })

  await Promise.all([
    prisma.task.upsert({
      where: { id: 'task3_1' }, update: {},
      create: {
        id: 'task3_1', name: 'Full BOM Review', workstreamId: ws3_analysis.id, ownerId: eng6.id,
        status: 'IN_PROGRESS', priority: 'HIGH',
        startDate: subDays(today, 8), endDate: addDays(today, 14),
        effortHours: 24, estimatedHours: 28, order: 0,
      },
    }),
    prisma.task.upsert({
      where: { id: 'task3_2' }, update: {},
      create: {
        id: 'task3_2', name: 'Identify Top 20 Cost Drivers', workstreamId: ws3_analysis.id, ownerId: eng6.id,
        status: 'PLANNED', priority: 'HIGH',
        startDate: addDays(today, 14), endDate: addDays(today, 25),
        effortHours: 16, estimatedHours: 16, order: 1,
      },
    }),
    prisma.task.upsert({
      where: { id: 'task3_3' }, update: {},
      create: {
        id: 'task3_3', name: 'Alternative Supplier Sourcing', workstreamId: ws3_supplier.id, ownerId: eng5.id,
        status: 'PLANNED', priority: 'MEDIUM',
        startDate: addDays(today, 20), endDate: addDays(today, 50),
        effortHours: 32, estimatedHours: 40, order: 0,
      },
    }),
    prisma.task.upsert({
      where: { id: 'task3_4' }, update: {},
      create: {
        id: 'task3_4', name: 'Manufacturing Process Efficiency', workstreamId: ws3_mfg.id, ownerId: eng5.id,
        status: 'BACKLOG', priority: 'MEDIUM',
        startDate: addDays(today, 45), endDate: addDays(today, 70),
        effortHours: 28, estimatedHours: 32, order: 0,
      },
    }),
  ])

  // ---- Project 4: Failure Analysis ----
  const proj4 = await prisma.project.upsert({
    where: { id: 'proj_failure' },
    update: {},
    create: {
      id: 'proj_failure',
      name: 'Dryer Heating Element Failure Analysis',
      description: 'Root cause analysis of field returns related to heating element failures. Includes material analysis and design review.',
      type: 'OTHER',
      status: 'ACTIVE',
      priority: 'CRITICAL',
      startDate: subDays(today, 5),
      endDate: addDays(today, 25),
      leadId: lead2.id,
      plannerId: planner2.id,
    },
  })

  const ws4_rca = await prisma.workstream.upsert({
    where: { id: 'ws4_rca' }, update: {},
    create: { id: 'ws4_rca', name: 'Root Cause Analysis', projectId: proj4.id, status: 'IN_PROGRESS', order: 0 },
  })

  await Promise.all([
    prisma.task.upsert({
      where: { id: 'task4_1' }, update: {},
      create: {
        id: 'task4_1', name: 'Failed Unit Inspection', workstreamId: ws4_rca.id, ownerId: eng10.id,
        status: 'IN_PROGRESS', priority: 'CRITICAL',
        startDate: subDays(today, 4), endDate: addDays(today, 3),
        effortHours: 16, estimatedHours: 16, order: 0,
      },
    }),
    prisma.task.upsert({
      where: { id: 'task4_2' }, update: {},
      create: {
        id: 'task4_2', name: 'Material Composition Testing', workstreamId: ws4_rca.id, ownerId: eng7.id,
        status: 'PLANNED', priority: 'CRITICAL',
        startDate: addDays(today, 3), endDate: addDays(today, 12),
        effortHours: 20, estimatedHours: 20, order: 1,
      },
    }),
    prisma.task.upsert({
      where: { id: 'task4_3' }, update: {},
      create: {
        id: 'task4_3', name: 'Design Review & Recommendations', workstreamId: ws4_rca.id, ownerId: eng8.id,
        status: 'BACKLOG', priority: 'HIGH',
        startDate: addDays(today, 12), endDate: addDays(today, 22),
        effortHours: 16, estimatedHours: 20, order: 2,
      },
    }),
  ])

  // ---- Project 5: Planning (not yet started) ----
  const proj5 = await prisma.project.upsert({
    where: { id: 'proj_microwave' },
    update: {},
    create: {
      id: 'proj_microwave',
      name: 'Countertop Microwave Technology Assessment',
      type: 'TEARDOWN',
      status: 'PLANNING',
      priority: 'MEDIUM',
      startDate: addDays(today, 30),
      endDate: addDays(today, 120),
      leadId: lead1.id,
      plannerId: planner.id,
    },
  })

  // ---- Requests ----
  await Promise.all([
    prisma.request.upsert({
      where: { id: 'req_1' }, update: {},
      create: {
        id: 'req_1',
        title: 'Robot Vacuum Competitive Analysis',
        description: 'Request to teardown and analyze the latest robot vacuum cleaners from three major competitors to identify technology gaps.',
        type: 'TEARDOWN', priority: 'MEDIUM', status: 'SUBMITTED',
        submitterId: lead1.id,
      },
    }),
    prisma.request.upsert({
      where: { id: 'req_2' }, update: {},
      create: {
        id: 'req_2',
        title: 'Heat Pump Technology Benchmarking',
        description: 'Assess heat pump technology in premium HVAC systems to inform our next-gen platform development.',
        type: 'TEARDOWN', priority: 'HIGH', status: 'REVIEW',
        submitterId: manager.id,
        assigneeId: planner.id,
      },
    }),
    prisma.request.upsert({
      where: { id: 'req_3' }, update: {},
      create: {
        id: 'req_3',
        title: 'Motor Supplier Investigation',
        description: 'Investigate 3 alternative motor suppliers for the dishwasher pump assembly to reduce COGS.',
        type: 'OTHER', priority: 'HIGH', status: 'APPROVED',
        submitterId: lead2.id,
        assigneeId: planner2.id,
      },
    }),
    prisma.request.upsert({
      where: { id: 'req_4' }, update: {},
      create: {
        id: 'req_4',
        title: 'Oven Thermal Efficiency Study',
        description: 'Study thermal efficiency of competitor ovens to develop design improvements for our premium line.',
        type: 'OTHER', priority: 'LOW', status: 'SUBMITTED',
        submitterId: eng1.id,
      },
    }),
  ])

  // ---- Schedule Changes (pending approvals) ----
  const change1 = await prisma.scheduleChange.upsert({
    where: { id: 'change_1' }, update: {},
    create: {
      id: 'change_1',
      changeType: 'TASK_DATES_CHANGED',
      description: 'Control Board Reverse Engineering task needs a 5-day extension due to higher complexity than estimated.',
      requesterId: eng3.id,
      projectId: proj1.id,
      affectedTaskIds: ['task1_5'],
      currentData: { taskId: 'task1_5', endDate: addDays(today, 15).toISOString() },
      proposedData: { taskId: 'task1_5', endDate: addDays(today, 20).toISOString() },
      impactSummary: {
        affectedTasks: [{ id: 'task1_5', name: 'Control Board Reverse Engineering', type: 'task', currentEndDate: addDays(today, 15), proposedEndDate: addDays(today, 20), delayDays: 5, reason: 'Direct date change' }],
        affectedProjects: [],
        affectedResources: [],
        overloadedResources: [],
        totalDelayDays: 5,
        severity: 'MEDIUM',
        summary: '1 task delayed by 5 days. No project-level impact.',
      },
      status: 'PENDING',
    },
  })

  await prisma.approvalRequest.upsert({
    where: { id: 'approval_1' }, update: {},
    create: {
      id: 'approval_1',
      scheduleChangeId: change1.id,
      requesterId: eng3.id,
      status: 'PENDING',
    },
  })

  const change2 = await prisma.scheduleChange.upsert({
    where: { id: 'change_2' }, update: {},
    create: {
      id: 'change_2',
      changeType: 'RESOURCE_OVERLOAD',
      description: 'Rachel Richards (Electronics Engineer) is allocated at 110% capacity. Requesting to reduce allocation on Project 2 from 30% to 20%.',
      requesterId: manager.id,
      projectId: proj2.id,
      affectedTaskIds: ['task2_5'],
      currentData: { userId: eng3.id, allocationPct: 30 },
      proposedData: { userId: eng3.id, allocationPct: 20 },
      impactSummary: {
        affectedTasks: [],
        affectedProjects: [],
        affectedResources: [{ id: eng3.id, name: 'Rachel Richards', type: 'resource', reason: 'Currently 110% allocated' }],
        overloadedResources: ['Rachel Richards'],
        totalDelayDays: 0,
        severity: 'HIGH',
        summary: 'Resource overload detected. Rachel Richards is at 110% allocation.',
      },
      status: 'PENDING',
    },
  })

  await prisma.approvalRequest.upsert({
    where: { id: 'approval_2' }, update: {},
    create: {
      id: 'approval_2',
      scheduleChangeId: change2.id,
      requesterId: manager.id,
      status: 'PENDING',
    },
  })

  // ---- Notifications ----
  await prisma.notification.createMany({
    data: [
      {
        type: 'TASK_ASSIGNED', title: 'New Task Assigned',
        message: 'You have been assigned to Spray Arm Mechanism Analysis',
        userId: eng1.id, senderId: planner.id,
        taskId: 'task1_2', projectId: proj1.id,
        actionUrl: '/tasks/task1_2', isRead: false,
      },
      {
        type: 'APPROVAL_REQUIRED', title: 'Schedule Change Approval Required',
        message: 'A 5-day extension has been requested for Control Board Reverse Engineering',
        userId: manager.id, senderId: eng3.id,
        projectId: proj1.id, actionUrl: `/approvals/change_1`, isRead: false,
      },
      {
        type: 'APPROVAL_REQUIRED', title: 'Schedule Change Approval Required',
        message: 'Resource overload resolution requires your approval',
        userId: planner.id, senderId: manager.id,
        projectId: proj2.id, actionUrl: `/approvals/change_2`, isRead: false,
      },
      {
        type: 'RESOURCE_OVERLOADED', title: 'Resource Overload Alert',
        message: 'Rachel Richards is allocated at 110% capacity across multiple projects',
        userId: manager.id,
        projectId: proj1.id, isRead: true,
      },
      {
        type: 'MILESTONE_UPCOMING', title: 'Milestone Due in 20 Days',
        message: 'Electronics Analysis Complete milestone is due in 20 days',
        userId: lead1.id, projectId: proj1.id,
        actionUrl: `/projects/${proj1.id}`, isRead: false,
      },
    ],
    skipDuplicates: true,
  })

  console.log('✅ Projects created: 5')
  console.log('✅ Workstreams created')
  console.log('✅ Tasks created')
  console.log('✅ Schedule changes + approvals created')
  console.log('✅ Notifications created')
  console.log('\n🚀 Seed complete!')
  console.log('\nDemo accounts:')
  console.log('  admin@pmo.internal / admin123')
  console.log('  manager@pmo.internal / manager123')
  console.log('  planner@pmo.internal / planner123')
  console.log('  lead1@pmo.internal / lead123')
  console.log('  eng1@pmo.internal / password123')
  console.log('  vp@pmo.internal / vp123')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
