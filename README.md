# Token Optimizer

A band above the Claude Code prompt (desktop app and terminal) that shows where your session stands at a glance:

| Gauge | What it measures |
| --- | --- |
| **quality** | A score out of 100: half the share of the last turn served by the prompt cache, half the free room in the context window. |
| **context** | How much of the context window is used. |
| **cache** | Time left before the prompt cache expires. After that, your next message re-sends the whole context at full price. |
| **5h** | How much of your 5-hour usage limit is used. |
| **week** | How much of your 7-day usage limit is used. |

Each gauge has a green, amber or red ring. A status line above them says "All clear." or warns you when the context is almost full, when the cache is about to expire or has expired, or when a usage limit is close (with the reset time for the 5-hour limit).

## Install

In a Claude Code session, at the prompt:

```
/plugin install token-optimizer --marketplace mariushub/token-optimizer
```

Answer `y` to add the marketplace, then pick a scope (just you, or the project).

From a shell:

```bash
claude plugin install token-optimizer --marketplace mariushub/token-optimizer
```

## Settings

The cache lifetime is set to 60 minutes, the one Claude subscriptions use. If your requests use the 5-minute cache (usage overage, API key), change `CACHE_TTL_MIN` at the top of `hooks/register.tsx`.

## Tests

```bash
claude plugin test .
```

## License

MIT
