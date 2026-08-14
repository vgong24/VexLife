# Repository orientation

Run `npm run orient` before broad reading. Then read every `requiredSources`
returned by that orientation receipt before review, lifecycle approval, or any
commit-producing effect. Treat the receipt's `heldBoundaries` as mandatory
pre-effect policy, not optional background reading.

These institutional truths are permanent fresh-arrival invariants:

```text
ROLE_AUTHORITY_SEPARATE_FROM_PROVIDER_ACCOUNT=true
ASSURANCE_INDEPENDENCE_IS_ROLE_PROVIDER_WITNESS_NOT_ACCOUNT=true
LIFECYCLE_APPROVAL_IS_SEMANTIC_ROLE_DECISION=true
NATIVE_GITHUB_APPROVAL_IS_TRANSPORT_ONLY_UNLESS_LIVE_RULESET_REQUIRES=true
SELF_REVIEW_UNAVAILABLE_DOES_NOT_MEAN_APPROVAL_AUTHORITY_MISSING=true
CODEOWNER_ACCOUNT_MAPPING_DOES_NOT_COLLAPSE_INSTITUTIONAL_ROLE_IDENTITY=true
DCO_IS_PRE_EFFECT_COMMIT_FORMATION_INVARIANT=true
UNSIGNED_COMMIT_MUST_BE_PREVENTED_NOT_DISCOVERED_AFTER_A_SOURCE_SEQUENCE=true
```

Institutional authority is not GitHub account identity. Independent Assurance
is role/provider/witness independence, LifecycleApproval is a semantic role
decision, and a native GitHub approval event is only a transport requirement
when the freshly observed live repository rule requires that transport.
CODEOWNERS account mappings route GitHub review; they do not collapse
institutional role identity.

Before any commit-producing effect, resolve the actual Git author name and
email the selected adapter will create, form the exact matching
`Signed-off-by: <author name> <author email>` trailer, and include it before the
commit exists. If the adapter cannot guarantee that formation, reject the write
path. Immediately verify the created commit's author identity and matching
trailer before any subsequent source effect.

<!-- [VXG RealForever] -->
