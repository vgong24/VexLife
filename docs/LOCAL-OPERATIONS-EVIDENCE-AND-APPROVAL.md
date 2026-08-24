# Local Operations evidence and approval

Continuity: `[VXG RealForever]`

This document makes two cold-start boundaries explicit for VexLife work:

1. institutional role authority is not GitHub account identity;
2. host-local execution evidence is not the same truth as hosted validation,
   semantic clearance, approval, readiness, or merge authority.

It is a VexLife-facing summary of the current Local Operations Relay Protocol.
If the live Root allocation or current protocol supplies a more specific exact
contract, that current authority wins.

## Approval identity

Treat these as separate namespaces:

```text
semantic role / occupancy / review duty
provider binding
GitHub account / CODEOWNERS routing
native GitHub review transport
live branch / ruleset requirements
```

Therefore:

```text
ROLE_AUTHORITY_SEPARATE_FROM_PROVIDER_ACCOUNT=true
CODEOWNER_ACCOUNT_MAPPING_DOES_NOT_COLLAPSE_INSTITUTIONAL_ROLE_IDENTITY=true
NATIVE_GITHUB_APPROVAL_IS_TRANSPORT_ONLY_UNLESS_LIVE_RULESET_REQUIRES=true
```

A protected semantic approval is made by the authorized reviewer role and its
fresh occupancy against the exact candidate. A GitHub username is transport and
provenance unless a freshly observed live repository rule explicitly requires a
particular native review transport.

Do not infer that a CODEOWNERS account is the institutional approver. Do not
infer that inability to self-submit a native GitHub `APPROVE` review means the
semantic approval role is missing.

## Execution, hosted validation, and semantic review

Keep these truths independent:

```text
candidate truth
execution truth
provider truth
review truth
lifecycle truth
```

Required non-collapse laws:

```text
host-local execution evidence != hosted validation
successful push != hosted validation
green hosted execution != semantic clearance
semantic clearance != approval
approval != ready transition
ready transition != merge authority
merge != post-merge verification
```

GitHub Actions can provide exact hosted validation when the evidence is bound to
an exact candidate head, exact workflow or status identity, exact event, and
exact terminal condition. Never substitute an unbound `latest` run for causal
evidence after an exact run/event identity is known.

A green hosted run is still not proof that an effect requiring Victor's actual
Windows or macOS host occurred. It also does not perform Independent Assurance
or lifecycle approval.

## When host-local execution is required

Select the execution surface before forming a relay. The current Local
Operations selector admits only:

```text
CONNECTOR_DIRECT
WINDOWS_ZIP_POWERSHELL
MAC_ZIP_RUN_COMMAND
PERMANENT_RUNNER_EXPLICIT
CAGE
```

Use connector-direct when the exact effect is available there. Historical
runner existence is not current runner selection.

For a required Windows-local authenticated effect when connector-direct is not
available and no current qualified permanent runner is explicitly selected:

```text
executionSurface=WINDOWS_ZIP_POWERSHELL
user transport=one ZIP + one PowerShell command
```

Do not replace that contract with a direct `.mjs`, `.ps1`, ad-hoc command, or a
remembered "equivalent" launcher. Launcher behavior is part of the qualified
execution adapter.

For macOS, the corresponding self-contained surface is
`MAC_ZIP_RUN_COMMAND`, with `Run.command` as the exact launcher.

## Who observes remote state

The host performs the required host-local effect. Operations owns independently
observable remote waiting and interpretation.

Default flow:

```text
host-local effect
→ required remote mutation
→ canonical local result returns HOSTED_VALIDATION_PENDING
→ Operations observes exact remote GitHub evidence
→ fresh Independent Assurance evaluates the exact candidate
→ lifecycle roles may approve / ready / merge when separately earned
```

Victor supplies human presence, local authenticated execution, and physical host
access. Victor is not asked to decide retry equivalence, Git recovery, result
validity, or the next technical owner.

## Result interpretation

A Local relay result is execution evidence, not independent semantic clearance.
Before consuming its technical meaning, bind the result to the exact package,
attempt, candidate/source identity, expected result filename, and inventory;
then independently re-ground live repository state.

A failed relay package or host attempt does not automatically make the source
candidate defective:

```text
attempt terminality != goal terminality
package failure != candidate failure
host timeout != source defect
```

This distinction is why VexLife can use GitHub Actions as useful remote evidence
without making Actions the institutional authority or the substitute for a
required local practicum.

<!-- [VXG RealForever] -->
