/**
 * Academic term utilities for generating term options and determining current term
 */

export interface TermOption {
  label: string
  value: string
}

/**
 * Get the current academic term based on the current date
 * Logic:
 * - January-April: Winter
 * - May-August: Spring
 * - September-December: Fall
 */
export function getCurrentTerm(): string {
  const now = new Date()
  const month = now.getMonth() + 1 // getMonth() returns 0-11
  const year = now.getFullYear()

  let season: string

  if (month >= 1 && month <= 4) {
    season = 'Winter'
  } else if (month >= 5 && month <= 8) {
    season = 'Spring'
  } else {
    // September-December
    season = 'Fall'
  }

  return `${season} ${year}`
}

/**
 * Generate term options for 3 years (previous, current, next)
 * Returns 9 options total (3 terms × 3 years)
 * Terms: Winter (Jan-Apr), Spring (May-Aug), Fall (Sep-Dec)
 * Ordered from earliest to latest
 */
export function getTermOptions(): TermOption[] {
  const now = new Date()
  const currentYear = now.getFullYear()
  const years = [currentYear - 1, currentYear, currentYear + 1]
  const seasons = ['Winter', 'Spring', 'Fall']

  const terms: TermOption[] = []

  for (const year of years) {
    for (const season of seasons) {
      const term = `${season} ${year}`
      terms.push({
        label: term,
        value: term,
      })
    }
  }

  return terms
}
