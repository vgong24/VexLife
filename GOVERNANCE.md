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

Normal changes use a branch and pull request. Required semantic validation
evidence must pass, discussion must be resolved, and protected paths require
code-owner review. GitHub-hosted automation is an accepted evidence producer
when it actually executes; it is not the semantic identity of proof. Where the
source-managed provider-neutral validation contract is accepted, an exact
qualified provider may produce equivalent evidence for the same required proof
cells. Provider or runner unavailability never becomes PASS, platform-specific
proof may not be impersonated, and repository rules that require named status
contexts remain separately binding until explicitly changed.

Reviewers seek consensus. If material disagreement remains, the maintainer
records the decision and its rationale.

The following require explicit maintainer approval:

- license, contribution, trademark, governance, or code-of-conduct changes;
- security disclosure, permission, capability, or Home Bridge changes;
- blueprint contract adoption and platform conformance claims;
- releases, package publication, repository visibility, or public disclosure;
- changes to CI, provenance, source manifests, validation-evidence policy, or
  protected release paths.

## Provider-neutral validation evidence

VexLife preserves one semantic acceptance matrix even when evidence transport
changes.

```text
equivalent evidence provider != weaker proof
hosted runner unavailable != semantic validation passed
provider identity != proof semantics
currentness != authority
```

The canonical mandatory semantic checks remain source-managed by Build Health.
A provider-neutral validation bundle may aggregate those exact current check
receipts with required platform proof cells only when every producer profile is
current and qualified, every receipt is exact-source-addressable, and the bundle
is bound to the exact repository, base, candidate head/tree, tested checkout,
source-tree fingerprint, runtime/platform identity, and DCO commit set.

A one-shot local producer may satisfy only the platform cells that it actually
ran on the qualified platform. Windows evidence does not satisfy Linux evidence;
macOS evidence does not satisfy either Linux or Windows platform proof. Local
evidence does not manufacture or impersonate a GitHub status context.

Accepted evidence may be reused only when an independently source-addressable
currentness receipt proves that every declared dependency binding remains exact.
Time, cost, or transport outage alone never promotes missing evidence to current.

Validation evidence is evidence only. It grants no source mutation, review,
approval, ready, merge, publication, host, or execution authority.

A change to this validation policy cannot self-authorize using the policy it is
introducing. Its first admission requires the predecessor governance rules,
explicit maintainer approval, complete equivalent evidence, and fresh
Independent Assurance. Any later policy change follows the then-current
governance and validation rules.

## Foundation and release gates

The default branch is changed through pull requests only. Force pushes, history
rewrites, automatic publication, and direct-main feature work are not accepted.
Branch protection should require the foundation and DCO checks, code-owner
review, stale-approval dismissal, and resolved conversations where those
enforcement adapters are available. Source-managed semantic acceptance
requirements remain authoritative even when a hosted status provider is
temporarily unavailable.

A release or visibility change requires:

- a current canonical source manifest and exact provenance record;
- public-safety review with no credential, private data, runtime state, private
  SDK payload, or model artifact;
- `npm run pr-ready` in a named environment;
- real browser evidence and any platform-native evidence actually claimed;
- an honest statement that generated scaffolds are not implementation or
  conformance;
- an independent review and Victor's explicit visibility decision.

This foundation task does not authorize making the repository public, publishing a
package, merging its own pull request, or admitting native/mobile implementation.

## Policy amendments

Governance amendments use the same pull-request and code-owner process. Any future
maintainer succession, committee, legal entity, dual-license plan, or proprietary
exception must be proposed explicitly rather than inferred.

<!-- [VXG RealForever] -->
