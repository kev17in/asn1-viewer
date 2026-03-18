import { create } from 'zustand'

interface JavaStatusState {
  status: 'connecting' | 'running' | 'stopped' | 'error'
  setStatus: (s: JavaStatusState['status']) => void
}

export const useJavaStatus = create<JavaStatusState>((set) => ({
  status: 'connecting',
  setStatus: (status) => set({ status }),
}))

export function initJavaStatusListener() {
  // Poll current status immediately on mount (the push event may have been missed)
  window.electronAPI?.getJavaStatus?.().then((status) => {
    if (status) {
      useJavaStatus.getState().setStatus(status as JavaStatusState['status'])
    }
  })

  // Also listen for future push updates
  if (window.electronAPI?.onJavaStatus) {
    return window.electronAPI.onJavaStatus((status) => {
      useJavaStatus.getState().setStatus(status as JavaStatusState['status'])
    })
  }
  return () => {}
}
