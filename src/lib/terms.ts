export interface TermOption {
  label: string
  value: string
}

const SEASONS = ['Winter', 'Spring', 'Fall'] as const

// Maps month (1-12) to season index: Jan-Apr -> Winter(0), May-Aug -> Spring(1), Sep-Dec -> Fall(2)
function getSeasonFromMonth(month: number): string {
  return SEASONS[Math.floor((month - 1) / 4)]
}

export function getCurrentTerm(): string {
  const now = new Date()
  const month = now.getMonth() + 1
  const year = now.getFullYear()
  return `${getSeasonFromMonth(month)} ${year}`
}

export function getTermOptions(): TermOption[] {
  const currentYear = new Date().getFullYear()
  const years = [currentYear - 1, currentYear, currentYear + 1]

  return years.flatMap((year) =>
    SEASONS.map((season) => {
      const term = `${season} ${year}`
      return { label: term, value: term }
    })
  )
}
