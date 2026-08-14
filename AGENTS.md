# Repository orientation

Run `npm run orient` before broad reading. Then read every `requiredSources`
returned by that orientation receipt before review, lifecycle approval, or any
commit-producing effect. Treat the receipt's `heldBoundaries` as mandatory
pre-effect policy, not optional background reading.

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
