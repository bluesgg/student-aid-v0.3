'use client'

import { useState, useEffect } from 'react'
import { LanguageModal } from './language-modal'

const LANGUAGE_MODAL_DISMISSED_KEY = 'language_modal_dismissed'

export function LanguageModalTrigger() {
  const [showModal, setShowModal] = useState(false)
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    async function checkFirstLogin() {
      try {
        // First check localStorage - if modal was already dismissed, don't show again
        const dismissed = localStorage.getItem(LANGUAGE_MODAL_DISMISSED_KEY)
        if (dismissed === 'true') {
          setChecked(true)
          return
        }

        const response = await fetch('/api/user/preferences')
        if (!response.ok) {
          setChecked(true)
          return
        }

        const data = await response.json()
        if (data.data?.isNewUser) {
          setShowModal(true)
        }
      } catch (error) {
        console.error('Error checking first login:', error)
      } finally {
        setChecked(true)
      }
    }

    checkFirstLogin()
  }, [])

  function handleClose() {
    // Mark as dismissed in localStorage to prevent showing again even if DB write fails
    localStorage.setItem(LANGUAGE_MODAL_DISMISSED_KEY, 'true')
    setShowModal(false)
  }

  // Don't render anything until we've checked
  if (!checked || !showModal) {
    return null
  }

  return <LanguageModal onClose={handleClose} />
}
