import { create } from 'zustand'
import { theme as antdTheme } from 'antd'

type ThemeMode = 'light' | 'dark' | 'auto'
type EffectiveTheme = 'light' | 'dark'

interface ThemeState {
  mode: ThemeMode
  effectiveTheme: EffectiveTheme
  toggleTheme: () => void
  setTheme: (mode: ThemeMode) => void
  setSystemTheme: (systemTheme: EffectiveTheme) => void
}

function applyEffectiveTheme(effective: EffectiveTheme) {
  document.documentElement.className = effective === 'dark' ? 'dark-theme' : ''
}

let cachedSystemTheme: EffectiveTheme = 'light'

export const useThemeStore = create<ThemeState>((set, get) => ({
  mode: 'light',
  effectiveTheme: 'light',
  toggleTheme: () =>
    set((state) => {
      const order: ThemeMode[] = ['light', 'dark', 'auto']
      const idx = order.indexOf(state.mode)
      const newMode = order[(idx + 1) % order.length]
      const effective = newMode === 'auto' ? cachedSystemTheme : newMode as EffectiveTheme
      applyEffectiveTheme(effective)
      window.electronAPI?.setConfig('theme', newMode)
      return { mode: newMode, effectiveTheme: effective }
    }),
  setTheme: (mode: ThemeMode) => {
    const effective = mode === 'auto' ? cachedSystemTheme : mode as EffectiveTheme
    applyEffectiveTheme(effective)
    set({ mode, effectiveTheme: effective })
  },
  setSystemTheme: (systemTheme: EffectiveTheme) => {
    cachedSystemTheme = systemTheme
    const state = get()
    if (state.mode === 'auto') {
      applyEffectiveTheme(systemTheme)
      set({ effectiveTheme: systemTheme })
    }
  },
}))

export function useAntdTheme() {
  const effectiveTheme = useThemeStore((s) => s.effectiveTheme)
  return {
    algorithm: effectiveTheme === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
    token: {
      colorPrimary: effectiveTheme === 'dark' ? '#7aa2f7' : '#1a73e8',
      borderRadius: 6,
    },
  }
}
