'use client'

import { useState, useEffect, useCallback } from 'react'

const STORAGE_KEY = 'studentaid-layout-preferences'

interface LayoutPreferences {
  pdfPanelSize: number
  stickerPanelSize: number
  qaPanelSize: number
}

const DEFAULT_PREFERENCES: LayoutPreferences = {
  pdfPanelSize: 25, // 25% for PDF viewer (left)
  stickerPanelSize: 50, // 50% for AI explanations (center)
  qaPanelSize: 25, // 25% for Q&A (right)
}

// Min and max constraints (as percentages)
export const PANEL_CONSTRAINTS = {
  minSize: 20,
  maxSize: 70,
}

export function useLayoutPreferences() {
  const [preferences, setPreferences] = useState<LayoutPreferences>(DEFAULT_PREFERENCES)
  const [isLoaded, setIsLoaded] = useState(false)

  // Load preferences from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as LayoutPreferences
        // Validate the parsed values
        if (
          typeof parsed.pdfPanelSize === 'number' &&
          typeof parsed.stickerPanelSize === 'number' &&
          typeof parsed.qaPanelSize === 'number'
        ) {
          setPreferences(parsed)
        }
      }
    } catch {
      // Ignore localStorage errors
    }
    setIsLoaded(true)
  }, [])

  // Save preferences to localStorage
  const savePreferences = useCallback((newPreferences: LayoutPreferences) => {
    setPreferences(newPreferences)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newPreferences))
    } catch {
      // Ignore localStorage errors
    }
  }, [])

  // Update a single panel size (recalculates others proportionally)
  const updatePanelSizes = useCallback(
    (sizes: number[]) => {
      if (sizes.length === 3) {
        savePreferences({
          pdfPanelSize: sizes[0],
          stickerPanelSize: sizes[1],
          qaPanelSize: sizes[2],
        })
      }
    },
    [savePreferences]
  )

  // Reset to defaults
  const resetPreferences = useCallback(() => {
    savePreferences(DEFAULT_PREFERENCES)
  }, [savePreferences])

  return {
    preferences,
    isLoaded,
    updatePanelSizes,
    resetPreferences,
  }
}
