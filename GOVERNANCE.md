# VexLife governance

VexLife is in private foundation staging. The initial repository steward and
maintainer is `@vgong24`.

## Roles

- **Contributor:** proposes a DCO-signed change.
- **Reviewer:** evaluates technical, cultural, security, provenance, and product
  effects.
- **Code owner:** reviews protected paths identified in `.github/CODEOWNERS`.
- **Maintainer:** resolves repository decisions and admits or rejects changes.
- **Release steward:** verifies the exact release candidate, evidence, and
  visibility decision. The initial maintainer holds this role.

DCO sign-off records provenance; it does not grant a governance role or merge
authority.

## Decisions and changes

Normal changes use a branch and pull request. Required automation must pass,
discussion must be resolved, and protected paths require code-owner review.
Reviewers seek consensus. If material disagreement remains, the maintainer records
the decision and its rationale.

The following require explicit maintainer approval:

- license, contribution, trademark, governance, or code-of-conduct changes;
- security disclosure, permission, capability, or Home Bridge changes;
- blueprint contract adoption and platform conformance claims;
- releases, package publication, repository visibility, or public disclosure;
- changes to CI, provenance, source manifests, or protected release paths.

Security reports and conduct cases use confidential processes. They are not
decided in public issue threads.

## Foundation and release gates

The default branch is changed through pull requests only. Force pushes, history
rewrites, automatic publication, and direct-main feature work are not accepted.
Branch protection should require the foundation and DCO checks, code-owner review,
stale-approval dismissal, and resolved conversations.

A release or visibility change requires:

- a current canonical source manifest and exact provenance record;
- public-safety review with no credential, private data, runtime state, private
  SDK payload, or model artifact;
- `npm run pr-ready` in a named environment;
- real browser evidence and any platform-native evidence actually claimed;
- an honest statement that generated scaffolds are not implementation or
  conformance;
- an independent review and Victor's explicit visibility decision.

### Provider-neutral validation evidence

Build Health owns the semantic proof profile. GitHub-hosted Actions is one
qualified evidence producer when its exact workflow actually executes; a runner
allocation, billing, spending-limit, spawn, or timeout failure is provider
unavailability and never semantic PASS.

A qualified one-shot local producer may satisfy the same required proof cells
only when its repository, candidate head/tree, platform/runtime qualification,
receipts, logs, digests, DCO graph proof, dependency/currentness bindings, and
source manifest are exact and current. Equivalent evidence must not weaken a
proof cell, impersonate another platform, or represent local evidence as a
GitHub status context when repository policy actually requires that hosted
context. Windows, Linux, and macOS evidence are never interchangeable merely
because the commands are similar.

Evidence currentness, including Event-driven Work Awareness (EWA), is evidence
about whether prior proof can be reused or must be refreshed. It does not grant
execution, review, approval, ready, merge, publication, or other lifecycle
authority.

The first provider-neutral policy candidate is governed by the repository policy
that existed before that candidate. A candidate must not use its newly proposed
validation policy to self-authorize its own acceptance.

This foundation task does not authorize making the repository public, publishing a
package, merging its own pull request, or admitting native/mobile implementation.

## Policy amendments

Governance amendments use the same pull-request and code-owner process. Any future
maintainer succession, committee, legal entity, dual-license plan, or proprietary
exception must be proposed explicitly rather than inferred.

<!-- [VXG RealForever] -->
