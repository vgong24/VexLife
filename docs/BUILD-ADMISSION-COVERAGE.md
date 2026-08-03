# Build Admission Coverage

Build Admission is the final effect membrane between scheduler-admitted work and one observable repository mutation. It does **not** create another queue, replace the Intent Scheduler, grant arbitrary shell access, or authorize remote Git.

## Exact route

```text
immutable Build Request
→ current Scheduler admission and authority evidence
→ exact Workgraph node + one path claim
→ current occupancy/capability/effect/resource/worker/context leases
→ current clean disposable repository evidence
→ human confirmation for one local Git commit
→ Build Admission receipt
→ registered local Git adapter
→ direct parent/tree/blob/path/diff readback
→ real-effect completion verification
→ claim + six leases released once
→ Queue/Terrain/Health/Guide convergence
```

The request itself is no-effect. The adapter accepts only the registered fixture path inside a newly created disposable child repository. It configures no remote, performs no network operation, does not touch the implementation checkout, and cannot select a protected branch.

## Recovery

The simulation injects failures before write, after write, at commit, at readback, at cleanup, and during rollback. Recovery must prove one of:

- repository unchanged;
- before-image restored;
- disposable repository removed; or
- `HELD_UNKNOWN` with a minimal human-attention route.

A failure never grants retry authority. It becomes exact ConcernWatch evidence, and duplicate evidence remains content-addressed.

## Proof

`npm run build-admission:check` executes BA0–BA25 with one real local Git commit and writes `generated/health/build-admission-simulation.json`. `npm run pr-ready` and `npm run health:check` independently consume the same exact integrated receipt.

The runtime adapter never pushes, fetches, pulls, clones, rebases, amends, resets, force-updates, or rewrites history.

<!-- [VXG RealForever] -->
