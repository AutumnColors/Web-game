# Claude review handoff — experimental cycle evolution

Branch: dev/cycle-evolution. Do not merge or deploy automatically.

## Goal
Preserve the existing real quadratic Basilica playback and recorder; generalize verified Julia cycle evolution to arbitrary degree and primitive period. Preview and Record must share a trajectory, preserve camera anchor and restore exact saved state on request.

## Files
explore/birth-of-structure-lab/{cycle-evolution.js,birth.js,cycle-addon.js,index.html,light-recorder.js,lab.js}

## Current evidence
[
  {
    "d": 2,
    "p": 2,
    "centers": [
      2
    ],
    "points": 0,
    "diagnostics": [
      "Continuous child bridge unavailable at period 2"
    ]
  },
  {
    "d": 12,
    "p": 48,
    "centers": [
      48,
      96
    ],
    "points": 149,
    "diagnostics": []
  },
  {
    "d": 13,
    "p": 26,
    "centers": [
      26,
      52
    ],
    "points": 149,
    "diagnostics": []
  }
]
Previous numerical recoveries: d7 P224, d11 P88, d12 P96, d13 P52; primitive critical residual threshold 1e-8, not certified branch connectivity. Existing specialized Basilica path retained; new bridge solver fails its standalone Basilica test. No browser/pixel regression run after latest changes.

## Review priorities
- Check cancellation-free midpoint recurrence and analytic Jacobian replacement for fixed finite difference epsilon.
- Check branch connectivity: h ray sampling, near-zero multiplier, critical Newton correction, primitive period, parameter displacement and final bridge gap. Reject false branch switches.
- Review hybridTrajectory: currently uses bridge only for generalized path despite name; no fallback to discontinuous center guesses. Partial trajectory explicit; first failed bridge yields no playback. Consider safe fallback only with verified continuous bridge.
- Check UI lifecycle: cycle metadata lazy loader, capturePlan, context invalidation, anchor continuation, restore, reverse unavailable, recording timing, cancellation, synchronous preparation freezing UI, recorder sample cap and identical preview/record path.
- Verify exact Basilica regression with mocked and real browser tests, then d2 P3/P5, d3 P2, d5 P3, d7 P7, d11 P11, d12 P12, d13 P13 and complex seeds/deep zoom.
- Normalized eight-state map and scaling-guided sampling not implemented; do not claim they are.
- Add reproducible seed fixtures and automated tests. Check no deployment until approved.

## Visual acceptance
Open dev build, generate a cycle, Preview with anchor on/off, Stop and restore yes/no, Record independently, inspect samples and compare same trajectory. Confirm no drift, no silent radial fallback, partial status visible. Browser testing and deployment not performed by this handoff.
