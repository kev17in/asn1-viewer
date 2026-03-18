const api = window.electronAPI

export interface ParseResult {
  encoding: string
  json: any
}

export interface TypeTreeModule {
  module: string
  versions: { version: string; types: string[] }[]
}

export interface ModuleInfo {
  moduleId: string
  moduleName: string
  version: string
  jarPath: string
  builtin: boolean
  createTime: number
  typeCount: number
}

export interface ScanResult {
  packages: { package: string; types: string[] }[]
  totalTypes: number
  suggestedName?: string
  suggestedVersion?: string
}

export async function getTypeTree(): Promise<TypeTreeModule[]> {
  return (await api.javaRpc('getTypeTree')) as TypeTreeModule[]
}

export async function getTypeNames(): Promise<string[]> {
  return (await api.javaRpc('getTypeNames')) as string[]
}

export async function parseAsn1(params: {
  module?: string
  version?: string
  type: string
  encoding: string
  data: string
}): Promise<ParseResult> {
  return (await api.javaRpc('parseAsn1', params)) as ParseResult
}

export async function getModules(): Promise<ModuleInfo[]> {
  return (await api.javaRpc('getModules')) as ModuleInfo[]
}

export async function importModule(params: {
  jarPath: string
  moduleName?: string
  version?: string
}): Promise<{ moduleId: string; moduleName: string; version: string; typeCount: number }> {
  return (await api.javaRpc('importModule', params)) as any
}

export async function removeModule(moduleId: string): Promise<{ removed: boolean }> {
  return (await api.javaRpc('removeModule', { moduleId })) as { removed: boolean }
}

export async function scanJar(jarPath: string): Promise<ScanResult> {
  return (await api.javaRpc('scanJar', { jarPath })) as ScanResult
}

export async function refreshRegistry(): Promise<void> {
  await api.javaRpc('refreshRegistry')
}

export async function ping(): Promise<string> {
  return (await api.javaRpc('ping')) as string
}
