# VexLife security policy

## Supported state

VexLife is currently a private foundation candidate with no stable public release,
security support window, bounty program, or guaranteed response time. Reports are
triaged on a best-effort basis against the current default branch.

## Report privately

Do not open an issue, discussion, or pull request containing vulnerability details.

During private staging:

1. A repository administrator creates a private draft advisory at
   `https://github.com/vgong24/VexLife/security/advisories/new`.
2. A reporter who cannot create that advisory sends only a minimal request for a
   confidential intake to `@vgong24` through an already established private
   collaboration channel. Do not include exploit details in the request.
3. The administrator adds the reporter as a private advisory collaborator before
   technical details are exchanged.

The launch pack does not designate a security email address, so this policy does
not invent or repurpose one. Before any public release or outside contribution
intake, the maintainer must approve a durable private contact, enable GitHub
Private Vulnerability Reporting, and verify the repository's **Report a
vulnerability** route.

## Include in a report

Provide the affected commit or version, affected component, impact, minimal
reproduction, required preconditions, and any known mitigation. State disclosure
and credit preferences. Use the smallest safe proof: do not submit real
credentials, raw personal data, private Vex Home content, model artifacts, or
unrelated private files.

The maintainer will validate scope, preserve confidentiality, coordinate a fix and
tests, and agree on disclosure before public details are released.

## Security boundaries

- The raw model endpoint is never a remote public API.
- Home Bridge is the capability-gated entry to an authoritative desktop Home; it
  is not sibling synchronization.
- A visible tool does not imply admitted effect authority.
- Unknown permissions or authority fail closed.
- Credentials, runtime history, personal Score and Rhythm, private conversations,
  model weights, and private Vextreme-SDK payload remain outside the repository.

<!-- [VXG RealForever] -->
