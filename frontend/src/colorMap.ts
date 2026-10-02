import type { ColorMatch, Well } from './api'

/**
 * The user's explicit choices per drawing color: a well id, or null for "don't paint".
 * Colors without an entry (or pointing to a deleted well) use the closest well.
 */
export type ColorChoices = Record<string, string | null>

export const AUTO = '__auto__'
export const SKIP = '__skip__'

/** Well id each drawing color is painted with (null = not painted). */
export function resolveColorMap(
  colors: string[],
  choices: ColorChoices,
  matches: ColorMatch[],
  wells: Well[],
): Record<string, string | null> {
  const ids = new Set(wells.map((w) => w.id))
  const best = new Map(matches.map((m) => [m.color, m.best_well_id]))
  return Object.fromEntries(
    colors.map((c) => {
      const choice = choices[c]
      if (choice === null) return [c, null]
      if (choice !== undefined && ids.has(choice)) return [c, choice]
      const b = best.get(c) ?? null
      return [c, b !== null && ids.has(b) ? b : null]
    }),
  )
}

export function matchQuality(deltaE: number): { label: string; color: string } {
  if (deltaE <= 2.3) return { label: 'exact', color: 'green' }
  if (deltaE <= 10) return { label: 'close', color: 'cyan' }
  if (deltaE <= 25) return { label: 'similar', color: 'gold' }
  return { label: 'far', color: 'red' }
}
