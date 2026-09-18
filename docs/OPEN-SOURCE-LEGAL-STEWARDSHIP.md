# Open-source licensing, patent-risk hygiene and community stewardship

`[VXG RealForever]`

## Decision status

```text
architectureState=PREPARED
licenseDecisionState=RECOMMENDED_PENDING_VICTOR_CONFIRMATION_AND_COUNSEL_REVIEW
recommendedPrimaryLicense=MPL-2.0
recommendedHostedRelayLicense=AGPL-3.0_ONLY_IF_LATER_SPLIT_INTO_A_SEPARATE_NETWORK_SERVICE
repositoryVisibility=PRIVATE_UNTIL_RELEASE_GATES_PASS
publicSupportBroadcast=OPT_IN_ONLY
publicLegalAllegationBroadcast=COUNSEL_REVIEW_REQUIRED
```

This document is product and repository architecture, not legal advice. A qualified
open-source and patent attorney should review the final launch packet before the
repository becomes public or accepts outside contributions.

## Recommended license posture

Use **Mozilla Public License 2.0 (`MPL-2.0`)** for the first public VexLife repository,
covering source code, executable blueprints, schemas, generators, tests and reference
implementations.

Why this fits VexLife:

- it is a standard OSI-approved license rather than a custom legal experiment;
- it includes an express contributor patent grant;
- modifications to MPL-covered files remain available under MPL when distributed;
- new surrounding files and larger works may use other licenses, which keeps Android,
  iOS, Windows, macOS and browser adoption practical;
- it includes patent-litigation termination against a party asserting that a
  Contributor Version infringes its patent;
- it preserves a real open-source commons more strongly than MIT or Apache-2.0 without
  imposing whole-application copyleft on every platform integration.

Do not dual-license the same files as `MPL-2.0 OR Apache-2.0` if reciprocal openness is
part of the decision: the permissive option would let recipients choose away the MPL
obligations.

### Why not MIT as the default

MIT is intentionally minimal and permissive. It allows proprietary modified forks and
contains no express patent-license section. That simplicity is useful for small utility
code, but it does not match the stated goal of preserving an open, reusable foundation.

### Why not Apache-2.0 as the default

Apache-2.0 contains an express patent grant and is excellent when maximum permissive
adoption is the priority. It still permits proprietary modified forks. A later,
separately versioned interoperability/specification package may use Apache-2.0 if broad
vendor adoption becomes more important than reciprocal source availability.

### Why not AGPL-3.0 for the whole repository

AGPL-3.0 is strong network copyleft. It is appropriate for a future separately deployed
community relay or hosted support service when modified network deployments should
provide corresponding source to their remote users. Applying it to all client,
blueprint and native-platform code at the beginning would create more integration and
review friction than the current product needs.

## License boundary matrix

```text
VexLife source, schemas, executable blueprints, tests
  recommended: MPL-2.0

future separately hosted federation/support relay
  candidate: AGPL-3.0
  state: NOT YET CREATED OR SELECTED

third-party dependencies
  retain original license
  record exact version, origin, hash and notices

model weights and adapters
  governed by their own artifact license
  never inherited from the repository license

user conversations, Score, Rhythm, legal evidence and private profile data
  user-owned data
  not licensed to the public merely because VexLife code is open

VexLife name, logos and source-identifying marks
  governed by a separate trademark policy
  no trademark rights implied by the software license
```

Keep the initial release simple: one software license across the source tree, explicit
third-party exceptions, and separate brand/data/model boundaries.

## Contribution provenance and legal-intake gate

Every external contribution should use an **inbound-equals-outbound** rule: the
contribution enters under the same repository license that recipients receive.

Require Developer Certificate of Origin 1.1 sign-off on every commit:

```text
Signed-off-by: Contributor Name <address>
```

The contributor certifies that they created the contribution or have the right to
submit it under the project license. DCO is provenance evidence; it is not a patent
clearance opinion.

Do not create a custom contributor license agreement casually. Before the first outside
merge, make one explicit business decision:

```text
futureDualLicensingOrProprietaryExceptionsNeeded=false
  → use MPL-2.0 + DCO

futureDualLicensingOrProprietaryExceptionsNeeded=true
  → obtain counsel and adopt a standard reviewed CLA before accepting contributions
```

Every pull request should disclose:

```text
source and authorship of the contribution
AI assistance used, if any
third-party code or snippets and their licenses
new or changed dependencies
patent-sensitive or unusually novel behavior
security, privacy and public/private boundary effects
files generated from another source
required blueprint identities and tests
```

The project must reject:

- code copied from an unknown or incompatible source;
- generated blobs whose preferred source is unavailable;
- dependencies without known provenance or license;
- contributions whose author will not certify the right to submit;
- legal terms hidden inside source comments, generated artifacts or dependency setup;
- changes that remove license, copyright, provenance or patent notices without review.

No automated scanner can prove that code is free from every third-party patent claim.
The architecture reduces risk through provenance, review, prior-art mapping and explicit
high-risk escalation rather than pretending a scan can produce patent clearance.

## Repository protection baseline

Before making VexLife public:

```text
LICENSE                         exact unmodified MPL-2.0 text
LICENSE-POLICY.md               scope and exception map
NOTICE                          required notices and provenance
THIRD_PARTY_NOTICES.md          dependency notices
TRADEMARKS.md                   brand-use boundary
CONTRIBUTING.md                 DCO and provenance requirements
SECURITY.md                     private vulnerability-report route
GOVERNANCE.md                   decision, review and release authority
CODEOWNERS                      protected legal/security/blueprint surfaces
SUPPORT.md                      ordinary support routes
CITATION.cff                    stable project citation
```

Repository settings should require:

- pull requests for the default branch;
- status checks;
- review from code owners for legal, security, release and blueprint files;
- stale approval dismissal after new commits;
- conversation resolution;
- no force pushes or branch deletion;
- signed commits or verified sign-off where practical;
- secret scanning, dependency alerts and code scanning;
- exact release manifests, hashes and reproducible provenance receipts.

## Invention-review and defensive-publication gate

Public source can help establish a dated technical record, but public disclosure is an
IP decision. Before publishing a materially novel architecture or feature, choose one:

```text
PUBLISH_OPENLY
PUBLISH_AS_DEFENSIVE_DISCLOSURE
SEEK_PATENT_COUNSEL_BEFORE_PUBLICATION
KEEP_PRIVATE_TEMPORARILY
NOT_NOVEL_OR_PATENT_SENSITIVE
```

Do not let a public pull request accidentally make this choice.

A defensive-publication record should be sufficient for a technically competent reader
to understand what was invented. It should contain:

```text
disclosureRef
title and plain-language abstract
problem and prior approaches
complete enabling architecture or algorithm
important alternatives and edge cases
diagrams and stable blueprint refs
first-publication date
source commit, release tag and content hash
public archive locations
inventor/author attribution
supersession links
```

The record must not include private conversations, credentials, personal Score data,
attorney communications or confidential business material.

A public disclosure does not prevent anyone from sending a demand or filing a case. It
may provide useful prior-art evidence, and printed publications can be submitted to the
USPTO in certain pending-application procedures. Patent counsel should decide when and
how a particular disclosure is used.

## No public "patent troll wall"

Do not build a public accusation board that labels a person or company a patent troll,
infringer, extortionist or bad actor. That creates avoidable defamation, privacy,
privilege, litigation-strategy and harassment risks.

Build a neutral **Stewardship and Support Board** instead. It reports attributable states
and help requested without deciding legal guilt.

Allowed public states:

```text
NOTICE_RECEIVED
COUNSEL_REVIEW_REQUESTED
PUBLIC_RECORD_AVAILABLE
PRIOR_ART_HELP_REQUESTED
LEGAL_COUNSEL_REQUESTED
FINANCIAL_SUPPORT_REQUESTED
TECHNICAL_ANALYSIS_REQUESTED
HELP_IN_PROGRESS
RESOLVED
WITHDRAWN
```

Verification levels describe evidence, not truth:

```text
SELF_REPORTED
DOCUMENT_HASH_VERIFIED
PUBLIC_DOCKET_LINKED
COUNSEL_REVIEWED_FOR_PUBLICATION
COURT_DISPOSITION_LINKED
```

## Public/private VexLife separation

Do not implement public/private life as one repository with a visibility toggle. Use
separate custody planes and connect them only through consented projections.

```text
VexLife upstream public source
  reusable product, protocol and reference implementation

Vex Home private custody
  raw conversations, Score, Rhythm, Dream candidates, credentials,
  private legal evidence, workspace files and local continuity

Vex Public Profile (optional)
  user-selected public identity, projects, support links and signed public notices

Vex Stewardship Relay (optional, later)
  indexes opted-in public profile signals; never reads private Vex Home
```

A user may operate VexLife entirely privately and never create a public profile.

## Support-signal contract

A support signal is a bounded, signed, expiring public projection:

```json
{
  "schemaVersion": "vexlife.support-signal/v0",
  "signalRef": "support-signal.example.001",
  "issuerPublicProfileRef": "profile.example.public",
  "category": "LEGAL_COUNSEL",
  "visibility": "PUBLIC_PROFILE",
  "status": "LEGAL_COUNSEL_REQUESTED",
  "verificationLevel": "SELF_REPORTED",
  "jurisdiction": "US-CA",
  "publicSummary": "Neutral factual summary reviewed for publication.",
  "requestedHelp": ["patent counsel introduction", "prior-art research"],
  "publicRecordRefs": [],
  "redactedEvidenceRefs": [],
  "privateEvidenceAvailableThrough": "counsel-controlled intake",
  "fundingLinkRef": null,
  "createdAt": "RFC3339 timestamp",
  "expiresAt": "RFC3339 timestamp",
  "supersedesSignalRef": null,
  "signatureRef": "signature.example.001"
}
```

The public projection must not contain:

- unredacted service addresses, financial records or identity documents;
- attorney-client communications or work product;
- sealed, confidential or restricted filings;
- private keys, credentials or internal system details;
- accusations beyond counsel-approved public language;
- raw private-life context used merely to make the appeal more emotionally compelling.

When a document is sensitive, publish only a neutral description and content hash, or a
link to an official public docket when appropriate. The full document remains in private
custody or counsel-controlled storage.

## Ecosystem relay and subscriptions

Community support is opt-in on both sides:

```text
profile owner publishes an eligible support signal
→ signature and schema validation
→ moderation and safety checks
→ opted-in ecosystem relay indexes the signal
→ subscribers receive only selected categories/jurisdictions
→ helpers respond through an explicit route
→ signal expires, resolves or is superseded
```

Subscriber preferences may filter:

```text
legal counsel
prior-art research
financial support
security incident response
accessibility support
technical review
geography and jurisdiction
urgency
verified-professional status
```

No fork is automatically enrolled. No upstream project may silently push notices into a
private installation. A public profile's permission to relay one signal is not permission
to read the person's private profile or Vex Home.

## Professional and funding safety

Professional status must be verified independently before the UI labels a person a
lawyer, patent agent, accountant or other regulated professional. VexLife should route an
introduction; it should not represent that a professional-client relationship exists.

The initial system should link to established external funding processors rather than
holding, pooling or disbursing money itself. Funding state and legal merit are separate.
A popular request is not a verified claim, and a verified public filing is not proof that
the requester will prevail.

## Optional collective patent-risk programs

After the project has a legal entity and counsel, evaluate membership in established
patent-defense communities such as LOT Network and Open Invention Network. These programs
have defined scopes and agreements; neither is a universal shield. Membership should be
recorded as a reviewed legal effect, not activated automatically from the product UI.

## Human-facing decision experience

When VexLife encounters a licensing, publication, support or legal-notice choice, present:

```text
Recommended
  one bounded option and why it fits

Tell me more
  consequences, alternatives, reversibility and held unknowns

Skip for now
  exact effect of waiting and a durable reason

Ask counsel
  prepare a question packet without publishing or conceding anything
```

A Vex Guide explanation is advisory. It cannot select a license, publish a legal notice,
create a public profile, launch a funding request or join a patent network without the
required human and legal gates.

## Exact pre-publication decision

The recommended current choice is:

```text
codeAndExecutableBlueprintLicense=MPL-2.0
contributionPolicy=INBOUND_EQUALS_OUTBOUND_PLUS_DCO_1_1
trademarkPolicy=SEPARATE_REQUIRED
hostedRelayLicense=UNSELECTED_FUTURE_AGPL_3_0_CANDIDATE
publicProfile=OPTIONAL
privateVexHome=NEVER_PUBLIC_BY_DEFAULT
legalSupportBoard=NEUTRAL_OPT_IN_COUNSEL_GATED
outsideContributionAdmission=AFTER_GOVERNANCE_AND_PROVENANCE_GATES
```

Do not add the final `LICENSE` file or publish the repository until Victor explicitly
accepts the license choice and the launch packet is reviewed.

<!-- [VXG RealForever] -->
