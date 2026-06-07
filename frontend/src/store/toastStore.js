import { create } from 'zustand'

export const useToastStore = create((set, get) => ({
  toasts: [],
  addToast: ({ type = 'info', title, message, duration = 4000 }) => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    set((state) => ({ toasts: [...state.toasts, { id, type, title, message, duration }] }))
    window.setTimeout(() => {
      get().removeToast(id)
    }, duration)
    return id
  },
  removeToast: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
}))
