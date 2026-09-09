'use client'

// Client-only PPTX export for the dashboard's "Project Status" analysis section.
// pptxgenjs is imported dynamically inside the export function so its (large,
// browser-only) code never gets pulled into a server bundle.

export interface CategoryStat {
  category: string
  planned: number
  completedOrInProgress: number
}

export interface ProjectStatusExportInput {
  title: string
  subtitle: string
  categoryStats: CategoryStat[]
  projectsByCategory: Array<{ category: string; projects: string[] }>
  statTiles: Array<{ label: string; value: number; color?: 'emerald' | 'amber' | 'blue' }>
}

const TILE_THEME: Record<string, { bg: string; text: string }> = {
  emerald: { bg: 'E2F3EA', text: '1D8348' },
  amber: { bg: 'FDEBD3', text: 'B9770E' },
  blue: { bg: 'DCE6F5', text: '1F4E79' },
}

const CHART_COLORS = ['4472C4', '70AD47', 'FFC000', 'C00000', '7030A0', '00B0F0', 'ED7D31', 'A5A5A5']

export async function exportProjectStatusPptx(input: ProjectStatusExportInput) {
  const { default: pptxgen } = await import('pptxgenjs')
  const pptx = new pptxgen()
  pptx.defineLayout({ name: 'WIDE', width: 13.33, height: 7.5 })
  pptx.layout = 'WIDE'

  const slide = pptx.addSlide()
  slide.addText(input.title, { x: 0.4, y: 0.22, fontSize: 24, bold: true, color: '1F4E79' })
  slide.addText(input.subtitle, { x: 0.4, y: 0.72, fontSize: 12, color: '595959' })

  const labels = input.categoryStats.map((c) => c.category)

  slide.addText('Total Project Portfolio', { x: 0.4, y: 1.25, fontSize: 14, bold: true, color: '1F4E79' })
  slide.addChart(
    pptx.ChartType.doughnut,
    [{ name: 'Projects', labels, values: input.categoryStats.map((c) => c.planned) }],
    {
      x: 0.2, y: 1.65, w: 5.4, h: 3.7,
      chartColors: CHART_COLORS,
      showLegend: true, legendPos: 'b',
      showPercent: true, dataLabelColor: 'FFFFFF',
    }
  )

  slide.addText('Planned vs Completed/In-Progress (by Category)', { x: 5.9, y: 1.25, fontSize: 14, bold: true, color: '1F4E79' })
  slide.addChart(
    pptx.ChartType.bar,
    [
      { name: 'Planned', labels, values: input.categoryStats.map((c) => c.planned) },
      { name: 'Completed & In Progress', labels, values: input.categoryStats.map((c) => c.completedOrInProgress) },
    ],
    {
      x: 5.8, y: 1.65, w: 7.1, h: 3.7,
      barGrouping: 'clustered',
      showLegend: true, legendPos: 'b',
      chartColors: ['4472C4', '70AD47'],
      catAxisLabelFontSize: 9,
    }
  )

  slide.addText('Projects', { x: 0.4, y: 5.55, fontSize: 14, bold: true, color: '1F4E79' })
  const bulletLines = input.projectsByCategory.flatMap((g) => [
    { text: g.category, options: { bold: true, breakLine: true, color: '1F4E79', fontSize: 9 } },
    ...g.projects.map((name) => ({ text: name, options: { bullet: true, breakLine: true, indentLevel: 1, fontSize: 8 } })),
  ])
  slide.addText(bulletLines, { x: 0.4, y: 5.95, w: 7.6, h: 1.4, valign: 'top', color: '333333' })

  // KPI tiles — 3x2 grid on the bottom-right
  const tileW = 1.55, tileH = 0.68, gap = 0.12
  const gridX = 8.25, gridY = 5.6
  input.statTiles.slice(0, 6).forEach((tile, i) => {
    const col = i % 3, row = Math.floor(i / 3)
    const theme = TILE_THEME[tile.color ?? 'blue']
    const x = gridX + col * (tileW + gap)
    const y = gridY + row * (tileH + gap)
    slide.addShape('roundRect', { x, y, w: tileW, h: tileH, fill: { color: theme.bg }, line: { color: theme.bg }, rectRadius: 0.06 })
    slide.addText(String(tile.value), { x, y: y + 0.02, w: tileW, h: 0.4, align: 'center', fontSize: 18, bold: true, color: theme.text })
    slide.addText(tile.label, { x: x + 0.05, y: y + 0.42, w: tileW - 0.1, h: 0.24, align: 'center', fontSize: 6.5, color: theme.text })
  })

  await pptx.writeFile({ fileName: `${input.title.replace(/[^\w.-]+/g, '_')}.pptx` })
}
