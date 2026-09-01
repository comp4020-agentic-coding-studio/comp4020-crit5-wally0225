# Process overview

## What I built

Pillars: a single-screen survival game on a 7x7 grid. Pillars sweep in from
one or more of the four edges each round; the only way to live is to be
standing on a cell the active wall layout keeps safe from every direction
attacking that round. Difficulty escalates as rounds climb: attacks add a
second simultaneous direction, warning/retract time compresses, and the wall
layout itself churns, all against a background of synthesized, intensity-
scaling music.

## The moments that mattered

1. **General-position walls, not an arbitrary pair.** Once attacks escalate
   to two simultaneous directions, a naive random direction pick can land on
   a genuinely unsolvable round if the walls happen to share a row or
   column. Instead of accepting that as "the difficulty curve", I added a
   third wall, enforced that all walls sit on distinct rows *and* columns
   (general position), and filtered direction picks down to `solvablePairs`
   — pairs with a nonempty safe-cell intersection. Verified by running
   `defaultPickWalls`/`defaultPickDirections` 200 times each in tests,
   asserting the invariant and the survivable intersection hold every time.
   [`462cd9b`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-wally0225/commit/462cd9b91aceedc5e6e8349ff5fe8d1cbb876c79)

2. **A correction folded into the rule, not just the run.** After shipping
   2-direction escalation from round 2 plus anti-repeat direction logic, the
   user caught that round 2 was meant to stay single-direction — only round
   3 should escalate. Rather than patch the constant and move on, I re-ran
   the anti-repeat suite (100 simulated trials across rounds 1-10) to
   confirm the one-line fix hadn't reopened the same-direction-twice bug the
   earlier commit had specifically closed.
   [`3e1226e...69e1f43`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-wally0225/compare/3e1226e...69e1f43)
