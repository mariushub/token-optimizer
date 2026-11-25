import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { LastTurn } from '../types'

// Durée de vie du cache de prompt, en minutes : 60 sur un abonnement Claude.
// Mets 5 si tes requêtes passent au cache de 5 minutes (dépassement de forfait, API).
const CACHE_TTL_MIN = 60
// Fréquence de rafraîchissement du compte à rebours du cache.
const TICK_MS = 30_000

const lastTurn = atom(
  { plugin: 'token-optimizer', key: 'lastTurn' } as const,
  null,
  { shape: 'last-turn-1' },
)
const tick = atom({ plugin: 'token-optimizer', key: 'now' } as const, 0)

type Level = 'ok' | 'warn' | 'bad'

const HEX: Record<Level, string> = {
  ok: '#22c55e',
  warn: '#f59e0b',
  bad: '#ef4444',
}
const THEME: Record<Level, 'success' | 'warning' | 'error'> = {
  ok: 'success',
  warn: 'warning',
  bad: 'error',
}

type Gauge = {
  id: string
  value: string
  label: string
  // Remplissage de l'anneau, 0 à 100 ; null quand on n'a pas encore de mesure.
  fill: number | null
  level: Level
}

// Plus c'est haut, mieux c'est (qualité) ou plus c'est bas, mieux c'est (le reste).
const higherIsBetter = (v: number, ok: number, warn: number): Level =>
  v >= ok ? 'ok' : v >= warn ? 'warn' : 'bad'
const lowerIsBetter = (v: number, ok: number, warn: number): Level =>
  v < ok ? 'ok' : v < warn ? 'warn' : 'bad'

const ring = (g: Gauge): string => {
  const fill = Math.max(0, Math.min(100, g.fill ?? 0))
  const arc =
    g.fill === null
      ? ''
      : `<circle cx="8" cy="8" r="6" fill="none" stroke="${HEX[g.level]}" stroke-width="2.5" pathLength="100" stroke-dasharray="${fill} 100" stroke-linecap="${fill > 0 ? 'round' : 'butt'}" transform="rotate(-90 8 8)"/>`

  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="none" stroke="#8888" stroke-opacity="0.35" stroke-width="2.5"/>${arc}</svg>`
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const now = await $.clock.now()
    await update($, tick, () => now)
    // Redessine la barre régulièrement pour faire avancer le compte à rebours du cache.
    $.clock.every(TICK_MS, () => {
      void $.clock.now().then(t => update($, tick, () => t))
    })

    return next(e)
  })

  // À la fin de chaque tour du fil principal : part du cache et heure de la dernière réponse.
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)

    if (e.agentId === undefined && e.usage) {
      const u = e.usage
      const input =
        u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens
      const turn: LastTurn = {
        cacheHit:
          input > 0 ? Math.round((u.cache_read_input_tokens / input) * 100) : null,
        at: await $.clock.now(),
      }
      await update($, lastTurn, () => turn)
    }

    return result
  })

  // Le contexte ou les limites ont bougé : on redessine.
  on('session.measure', async ($, e, next) => {
    const now = await $.clock.now()
    await update($, tick, () => now)

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) {
      return next(e)
    }

    await read($, tick)
    const turn = await read($, lastTurn)
    const usage = await $.session.usage()
    const now = await $.clock.now()

    const ctx = usage.context.percent ?? null
    const fiveHourLimit = usage.rateLimits.find(r => r.kind === 'five_hour')
    const fiveHour = fiveHourLimit?.percentUsed ?? null
    const week =
      usage.rateLimits.find(r => r.kind === 'seven_day')?.percentUsed ?? null

    // Temps avant la remise à zéro de la fenêtre de 5 h, ex. « 2h14 » ou « 38 min ».
    const resetMs = fiveHourLimit?.resetsAt
      ? Date.parse(fiveHourLimit.resetsAt) - now
      : NaN
    const fiveHourReset =
      Number.isNaN(resetMs) || resetMs <= 0
        ? null
        : resetMs >= 3_600_000
          ? `${Math.floor(resetMs / 3_600_000)}h${String(Math.floor((resetMs % 3_600_000) / 60_000)).padStart(2, '0')}`
          : `${Math.ceil(resetMs / 60_000)} min`

    // Cache : plein pendant qu'un tour tourne (chaque requête le rafraîchit),
    // sinon le temps restant depuis la dernière réponse.
    const ttlMs = CACHE_TTL_MIN * 60_000
    const cacheLeftMs = e.props.isWorking
      ? ttlMs
      : turn === null
        ? null
        : Math.max(0, ttlMs - (now - turn.at))
    const cacheMin = cacheLeftMs === null ? null : Math.ceil(cacheLeftMs / 60_000)

    // Qualité : moitié efficacité du cache au dernier tour, moitié place libre dans le contexte.
    const quality =
      turn?.cacheHit == null || ctx === null
        ? null
        : Math.round(turn.cacheHit * 0.5 + (100 - ctx) * 0.5)

    const gauges: Gauge[] = [
      {
        id: 'quality',
        value: quality === null ? '—' : String(quality),
        label: 'qualité',
        fill: quality,
        level: quality === null ? 'ok' : higherIsBetter(quality, 70, 40),
      },
      {
        id: 'context',
        value: ctx === null ? '—' : `${ctx}%`,
        label: 'contexte',
        fill: ctx,
        level: ctx === null ? 'ok' : lowerIsBetter(ctx, 60, 80),
      },
      {
        id: 'cache',
        value: cacheMin === null ? '—' : cacheMin === 0 ? 'expiré' : `${cacheMin}m`,
        label: 'cache',
        fill: cacheLeftMs === null ? null : (cacheLeftMs / ttlMs) * 100,
        level:
          cacheMin === null ? 'ok' : cacheMin > 15 ? 'ok' : cacheMin > 5 ? 'warn' : 'bad',
      },
      {
        id: 'five-hour',
        value: fiveHour === null ? '—' : `${Math.round(fiveHour)}%`,
        label: '5h',
        fill: fiveHour,
        level: fiveHour === null ? 'ok' : lowerIsBetter(fiveHour, 60, 85),
      },
      {
        id: 'week',
        value: week === null ? '—' : `${Math.round(week)}%`,
        label: 'semaine',
        fill: week,
        level: week === null ? 'ok' : lowerIsBetter(week, 60, 85),
      },
    ]

    const status: { level: Level; text: string } =
      ctx !== null && ctx >= 80
        ? { level: 'bad', text: 'Contexte presque plein : lance /compact ou une nouvelle session.' }
        : cacheMin === 0
          ? { level: 'warn', text: 'Cache expiré : le prochain message renverra tout le contexte au prix fort.' }
          : cacheMin !== null && cacheMin <= 5
            ? { level: 'warn', text: `Le cache expire dans ${cacheMin} min.` }
            : fiveHour !== null && fiveHour >= 85
              ? {
                  level: fiveHour >= 95 ? 'bad' : 'warn',
                  text: `Limite 5h à ${Math.round(fiveHour)} %${fiveHourReset ? `, remise à zéro dans ${fiveHourReset}` : ''}.`,
                }
              : week !== null && week >= 85
              ? { level: 'warn', text: `Limite hebdo à ${Math.round(week)} %.` }
              : turn?.cacheHit != null && turn.cacheHit < 50
                ? { level: 'warn', text: 'Peu de cache au dernier tour : le contexte a été réécrit.' }
                : { level: 'ok', text: 'Tout est bon.' }

    const table = $.ui.resolve(e)
    const { Box, Text } = table
    const Svg = 'Svg' in table ? table.Svg : null

    return (
      <Box flexDirection="column" gap="xs">
        <Box flexDirection="row" alignItems="center" gap={1}>
          <Text bold>Token Optimizer</Text>
          <Text color={THEME[status.level]}>
            {status.level === 'ok' ? '✓' : '⚠'} {status.text}
          </Text>
        </Box>
        <Box flexDirection="row" alignItems="center" flexWrap="wrap" columnGap={3}>
          {gauges.map(g => (
            <Box key={g.id} flexDirection="row" alignItems="center" gap={1}>
              {Svg ? (
                <Svg source={ring(g)} alt={`${g.label} ${g.value}`} width={16} height={16} />
              ) : (
                <Text color={THEME[g.level]}>●</Text>
              )}
              <Text bold tabular>
                {g.value}
              </Text>
              <Text dimColor>{g.label}</Text>
            </Box>
          ))}
        </Box>
      </Box>
    )
  })
}
