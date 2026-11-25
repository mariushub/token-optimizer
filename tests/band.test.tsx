import { expect, mock, test } from 'claude-code/testing'

const BAND = {
  plugin: 'token-optimizer',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isCollapsed: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 9 },
    view: {},
  },
} as const

test('the band shows every gauge, then flags an expired cache', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({
    value: {
      startedAt: 0,
      context: { tokens: 540_000, window: 1_000_000, percent: 54 },
      rateLimits: [
        { kind: 'five_hour', percentUsed: 12 },
        { kind: 'seven_day', percentUsed: 3 },
      ],
    },
  }))
  on('turn.complete', (_, e) => ({ text: e.answer }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.turn.complete({
    answer: 'ok',
    durationMs: 1000,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
    usage: {
      input_tokens: 1_000,
      cache_read_input_tokens: 98_000,
      cache_creation_input_tokens: 1_000,
      output_tokens: 500,
      model: 'claude-opus-5-5',
    },
  })
  await clock.advance(8 * 60_000)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    // 98% cache hit, 46% of the context free: (98 + 46) / 2 = 72.
    expect((await ui.find({ type: 'Text', text: /^72$/ }))?.text).toBe('72')
    expect((await ui.find({ type: 'Text', text: /^54%$/ }))?.text).toBe('54%')
    expect((await ui.find({ type: 'Text', text: /^52m$/ }))?.text).toBe('52m')
    expect((await ui.find({ type: 'Text', text: /^3%$/ }))?.text).toBe('3%')
    expect((await ui.find({ type: 'Text', text: /^12%$/ }))?.text).toBe('12%')
    expect((await ui.find({ type: 'Text', text: /^5h$/ }))?.text).toBe('5h')
    expect((await ui.find({ type: 'Text', text: /All clear/ }))?.text).toBe('✓ All clear.')
    await ui.unmount()
  }

  await clock.advance(55 * 60_000)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /^expired$/ }))?.text).toBe('expired')
  expect(await ui.find({ type: 'Text', text: /Cache expired/ })).toBeDefined()
  await ui.unmount()
})

test('a nearly used 5h limit says when it resets', async ($, on) => {
  const now = 1_700_000_000_000
  mock.clock(on, { now })
  on('session.usage', () => ({
    value: {
      startedAt: 0,
      context: { window: 1_000_000 },
      rateLimits: [
        {
          kind: 'five_hour',
          percentUsed: 90,
          resetsAt: new Date(now + (2 * 60 + 14) * 60_000).toISOString(),
        },
      ],
    },
  }))

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /^90%$/ }))?.text).toBe('90%')
  expect((await ui.find({ type: 'Text', text: /5h limit/ }))?.text).toBe(
    '⚠ 5h limit at 90%, resets in 2h 14m.',
  )
  await ui.unmount()
})

test('the cache stays full while a turn runs', async ($, on) => {
  mock.clock(on, { now: 5_000_000 })
  on('session.usage', () => ({
    value: { startedAt: 0, context: { window: 1_000_000 }, rateLimits: [] },
  }))

  const ui = await $.ui.mount({
    ...BAND,
    props: { ...BAND.props, isWorking: true },
    surface: 'desktop',
  })
  expect((await ui.find({ type: 'Text', text: /^60m$/ }))?.text).toBe('60m')
  expect(await ui.find({ type: 'Text', text: /Token Optimizer/ })).toBeDefined()
  await ui.unmount()
})
