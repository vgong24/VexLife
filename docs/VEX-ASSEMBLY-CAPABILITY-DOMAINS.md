# Vex Assembly VA-I04 — bounded capability read domains

`[VXG RealForever]`

VA-I04 makes four ordinary first-turn read domains visible to the adopted Browser Companion capability runtime without widening the canonical five-tool root kernel or creating a new capability engine.

## Intention

A lived Companion should be able to distinguish where a read belongs before it guesses at implementation mechanics:

```text
LOCAL   -> bounded local runtime/system/source identity observation
ONLINE  -> truthful held status until a safe online provider is explicitly bound
VEXHOME -> canonical Home identity plus qualified model/runtime/recovery summary
CODE    -> Source-Manifest-backed repository source read
```

These names are routing domains. They are not authority grants.

```text
DOMAIN_NAME != EXECUTION_AUTHORITY
READ_ONLY_OBSERVATION != EFFECT_AUTHORITY
ONLINE != STANDING_NETWORK_AUTHORITY
CODE != GENERIC_FILESYSTEM
CODE != GENERIC_SHELL
VEXHOME != ARBITRARY_HOME_READ
VEXHOME != MEMORY_READ
LOCAL != HOST_MUTATION
HELD != FAILED
VA-I04 != NEW_CAPABILITY_ENGINE
```

## First-turn composition

The canonical root kernel remains exactly:

```text
capability.search
capability.describe
process.resolve
context.where
help.render
```

VA-I04 registers one non-executable parent:

```text
capability.vexlife.companion-read-domains
```

with four executable `READ_ONLY` children:

```text
capability.vexlife.local.observe
capability.vexlife.online.observe
capability.vexlife.vexhome.observe
capability.vexlife.code.read
```

Only `scripts/serve-browser-core.mjs` activates that parent, and only when the server-selected runtime mode is `ADOPTED_READ_ONLY`. The browser request schema has no `activeCapabilityRef` field. The server wrapper overwrites any internal caller value with the canonical parent before request formation, so prompt/model output cannot widen activation.

`DIRECT_SINGLE_TURN` and `CANONICAL_E2_UNTAUGHT_G0` retain their existing tool-free behavior.

## Domain contracts

### LOCAL

LOCAL returns bounded runtime and source identity only: Node version, operating-system platform/architecture, and the current Source Manifest contract identity. It does not expose arbitrary host paths, mutate the host, start a process, read credentials, or perform network work.

### ONLINE

ONLINE is deliberately executable as a status observation, not as a network client. Until a separately accepted provider is bound it returns:

```text
HELD_NO_SAFE_ONLINE_PROVIDER
```

with `networkPerformed=false` and `credentialsUsed=false`. No fetch, socket, redirect, login, token lookup, or provider fallback occurs in VA-I04.

### VEXHOME

VEXHOME consumes only the existing canonical Home identity reader plus two fixed read-only files under that canonical Home:

```text
config/model.json
recovery/vex-initialization-receipt.json
```

It returns only:

- `homeRef`, current device ref and Companion lineage ref;
- qualified model/profile/generation/request-model identity;
- bounded runtime identity/hash/PID summary without probing or changing the process;
- matching initialization/recovery receipt summary.

Absolute Home/model/runtime paths are not projected. Conversation, Living Journal, Memory, Score, Rhythm, arbitrary Home files, process start/stop, model download/activation, and recovery execution are out of scope and remain untouched.

### CODE

CODE accepts one repository-relative `path` argument. The reader:

1. requires an exact safe relative POSIX path;
2. rejects Git internals, tool-local/private roots, generated output, runtime/model roots, Source Manifest self-files and any `node_modules` segment;
3. validates the current stable Source Manifest descriptor contract;
4. derives exactly one deterministic `source-manifest-parts/bucket-xx.json` from the requested UTF-8 path;
5. requires exactly one manifest record for that path with a regular Git mode;
6. rejects filesystem symlinks and symlink ancestors and keeps the resolved path inside the canonical source root;
7. verifies worktree byte count and SHA-256 against the Source Manifest record;
8. requires valid UTF-8;
9. returns exact source identity plus at most 4096 UTF-8 bytes of content and an explicit `truncated` flag.

CODE does not invoke Git, a shell, a package manager, a repository write, or an arbitrary filesystem path.

## Evidence boundary

Focused VA-I04 proof covers:

- unchanged five-tool root kernel;
- unchanged DIRECT and canonical E2 tool-free modes;
- server-owned first-turn parent plus all four child domains in `ADOPTED_READ_ONLY`;
- activation non-injectability;
- LOCAL no-effect observation;
- ONLINE exact held/no-network result;
- VEXHOME whitelist, identity matching and no Memory/recovery execution;
- CODE manifest membership, regular-file/UTF-8/hash checks and escape/symlink negatives;
- reuse of the existing scheduler revalidation and ToolResultRelay path for injected executors.

Repository-wide proof remains the source-managed sequence: focused tests, full `npm test`, Source Manifest regeneration/check, Build Admission and `npm run pr-ready`. Passing those gates does not create publication, approval, READY, merge, native-platform conformance, or any non-read effect authority.

<!-- [VXG RealForever] -->
