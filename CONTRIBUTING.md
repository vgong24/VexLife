# Contributing to VexLife

VexLife accepts contributions under an inbound-equals-outbound policy: each
contribution is submitted under the same MPL-2.0 terms under which the repository
is distributed. There is no contributor license agreement or proprietary
dual-licensing program at this time.

Read [VEXLIFE.md](VEXLIFE.md), [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md), and
[SECURITY.md](SECURITY.md) before contributing. Report vulnerabilities through
the private route in `SECURITY.md`; do not disclose them in an issue or pull
request.

## Developer Certificate of Origin

Every commit must carry a Developer Certificate of Origin 1.1 sign-off:

```text
Signed-off-by: Contributor Name <address>
```

Use `git commit -s` to add the trailer. By signing off, the contributor certifies
the DCO below. The name, address, commit, and sign-off become durable contribution
provenance and may later be public even when the repository is currently staged
privately. The DCO workflow checks every pull-request commit.

### Developer's Certificate of Origin 1.1

```text
Developer Certificate of Origin
Version 1.1

Copyright (C) 2004, 2006 The Linux Foundation and its contributors.

Everyone is permitted to copy and distribute verbatim copies of this
license document, but changing it is not allowed.


Developer's Certificate of Origin 1.1

By making a contribution to this project, I certify that:

(a) The contribution was created in whole or in part by me and I
    have the right to submit it under the open source license
    indicated in the file; or

(b) The contribution is based upon previous work that, to the best
    of my knowledge, is covered under an appropriate open source
    license and I have the right under that license to submit that
    work with modifications, whether created in whole or in part
    by me, under the same open source license (unless I am
    permitted to submit under a different license), as indicated
    in the file; or

(c) The contribution was provided directly to me by some other
    person who certified (a), (b) or (c) and I have not modified
    it.

(d) I understand and agree that this project and the contribution
    are public and that a record of the contribution (including all
    personal information I submit with it, including my sign-off) is
    maintained indefinitely and may be redistributed consistent with
    this project or the open source license(s) involved.
```

The canonical DCO 1.1 text is maintained at
[developercertificate.org](https://developercertificate.org/).

## Provenance disclosures

Complete the pull-request decision record and disclose:

- who authored the contribution and where it came from;
- material AI assistance, including the tool or model when known, affected
  portions, human review, and validation performed;
- third-party code, snippets, assets, or data, with origin, version, and license;
- every dependency added or changed;
- generated files and the preferred source used to produce them;
- patent-sensitive or unusually novel behavior;
- security, privacy, permission, public/private, and data-boundary effects;
- implicated blueprint identities, review lenses, platforms, and tests.

The human contributor remains responsible for AI-assisted output. Generation is
not proof of authorship, compatibility, security, or license clearance.

Do not contribute:

- copied material with unknown or incompatible provenance;
- generated blobs whose preferred source is unavailable;
- dependencies without a known origin and license;
- model artifacts, credentials, private conversations, Score, Rhythm, runtime
  history, or other private Vex Home data;
- private Vextreme-SDK material outside the accepted VexLife source boundary;
- changes that hide legal terms or remove notices without review.

Keep `package.json` marked `"private": true`. Do not hand-edit `generated/**`;
change the canonical source and rebuild its projections.

## Change process

1. Register or locate the canonical identity and affected cultural review lenses.
2. Keep actions, permissions, localization, state ownership, recovery, and
   platform effects explicit.
3. Add deterministic positive and negative proof.
4. Run `npm run pr-ready`.
5. Run and record real browser or native-environment evidence when claimed.
6. Open a pull request using the repository decision-record template.
7. Resolve required checks, DCO sign-off, and code-owner review.

Passing automation does not prove legal clearance, every security property,
accessibility without rendered evidence, or native-platform conformance.

<!-- [VXG RealForever] -->
