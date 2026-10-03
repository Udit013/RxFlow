import { create } from 'zustand'

/** Transient UI chrome state shared between the top bar and the sidebar drawer. */
interface UiState {
  mobileNavOpen: boolean
  setMobileNavOpen: (open: boolean) => void
}

export const useUi = create<UiState>((set) => ({
  mobileNavOpen: false,
  setMobileNavOpen: (open) => set({ mobileNavOpen: open }),
}))
