import { isValidYear } from './yearSlug'

export const STORED_YEAR_KEY = 'tp.year'

/** Son seçilen yıl; kayıt yoksa, bozuksa ya da depolama erişilemezse (gizli pencere) null. */
export function readStoredYear(): number | null {
  try {
    const raw = localStorage.getItem(STORED_YEAR_KEY)
    if (raw === null || !/^-?\d+$/.test(raw)) return null
    const year = Number(raw)
    return isValidYear(year) ? year : null
  } catch {
    return null
  }
}

/** Depolama erişilemezse sessizce geçer; yalnızca bir kolaylık. */
export function writeStoredYear(year: number): void {
  if (!isValidYear(year)) return
  try {
    localStorage.setItem(STORED_YEAR_KEY, String(year))
  } catch {
    // kota dolu ya da depolama kapalı: önemli değil
  }
}
