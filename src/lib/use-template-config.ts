'use client'

import { useEffect, useState, useCallback } from 'react'

export interface TemplateModelTypeDTO { id: string; code: string; label: string }
export interface TemplateTaskDTO { id: string; name: string; durationDays: number; estimatedHours: number; parallelGroup: string | null }
export interface TemplateWorkstreamDTO { id: string; name: string; modelTypeId: string | null; tasks: TemplateTaskDTO[] }
export interface TemplateCategoryDTO {
  id: string
  name: string
  modelTypes: TemplateModelTypeDTO[]
  workstreams: TemplateWorkstreamDTO[]
}
export interface TemplateCostingTypeDTO { id: string; code: string; label: string }
export interface TemplateProjectTypeDTO { id: string; name: string }

export interface TemplateConfig {
  categories: TemplateCategoryDTO[]
  costingTypes: TemplateCostingTypeDTO[]
  projectTypes: TemplateProjectTypeDTO[]
}

// Shared client-side fetch of the admin-editable project category / teardown
// template / subsystem / costing-type configuration. Used anywhere the app
// used to import the hardcoded CATEGORY_TEMPLATES / SUBSYSTEMS_BY_CATEGORY /
// COSTING_TYPES constants.
export function useTemplateConfig() {
  const [config, setConfig] = useState<TemplateConfig | null>(null)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(() => {
    setLoading(true)
    return fetch('/api/config/templates')
      .then((r) => r.json())
      .then((d) => setConfig(d))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { reload() }, [reload])

  const allCategoryNames = (config?.categories ?? []).map((c) => c.name)
  const categoryByName = (name: string | null | undefined) =>
    name ? config?.categories.find((c) => c.name === name) : undefined

  return {
    config,
    loading,
    reload,
    allCategoryNames,
    getWorkstreams: (name: string | null | undefined, productTypeCode?: string | null) => {
      const cat = categoryByName(name)
      if (!cat) return []
      if (!productTypeCode) return cat.workstreams.filter((w) => !w.modelTypeId)
      const modelType = cat.modelTypes.find((m) => m.code === productTypeCode)
      return cat.workstreams.filter((w) => !w.modelTypeId || w.modelTypeId === modelType?.id)
    },
    getModelTypes: (name: string | null | undefined) => categoryByName(name)?.modelTypes ?? [],
    // Subsystems are the Tear Down phase's task names -- scoped to a specific
    // model type the same way getWorkstreams is, so a Blender product only
    // ever offers Blender's own subsystems, not every model type's combined.
    getSubsystems: (name: string | null | undefined, productTypeCode?: string | null) => {
      const cat = categoryByName(name)
      if (!cat) return []
      const modelType = productTypeCode ? cat.modelTypes.find((m) => m.code === productTypeCode) : undefined
      const tearDowns = cat.workstreams.filter((w) =>
        w.name === 'Tear Down' && (!productTypeCode ? !w.modelTypeId : (!w.modelTypeId || w.modelTypeId === modelType?.id))
      )
      const seen = new Set<string>()
      return tearDowns
        .flatMap((w) => w.tasks)
        .map((t) => t.name)
        .filter((n) => (seen.has(n) ? false : (seen.add(n), true)))
    },
    costingTypes: config?.costingTypes ?? [],
    projectTypes: config?.projectTypes ?? [],
  }
}
