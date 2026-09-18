# Friend FFR-05 — restart continuity and isolated local profiles

`[VXG RealForever]`

FFR-05 is an integration-proof stage over the accepted FFR-03 persistence owner and the FFR-04 CDR observation binding. It adds no new production relationship owner when those sources already satisfy restart and rightful-owner semantics.

The proof uses two test-owned isolated local Homes representing opposite directional participants. Each participant may independently choose a local relationship class, and each local canonical store owns only that participant's directional record.

```text
A_CALLS_B_FRIEND != B_CALLS_A_FRIEND
RESTART != RELATIONSHIP_RECREATION
RECONNECT != RELATIONSHIP_RECREATION
TWO_PROFILES != SHARED_CANONICAL_STORE
A_TO_B_RELATIONSHIP_REF != B_TO_A_RELATIONSHIP_REF
WRONG_STATE_ROOT != READABLE_OWNER
INVITATION_ACCEPTED != PERSISTED
```

The FFR-04 binding step itself creates no durable state. Profile A becomes Saved only after the FFR-03 bridge commits and independently reads back the canonical record. Reconstructing the bridge over the same Home, participant and state-root returns the same relationshipRef and revision.

A second isolated profile cannot read A's store. It has no canonical relationship until B performs B's own affirmative local commit. B's resulting directional relationshipRef is distinct from A's and survives its own restart-shaped bridge reconstruction.

Disconnect/reconnect, route changes, session-generation changes, process-instance changes and peer-currentness changes preserve the owning profile's relationshipRef and human local relationship class. Each profile's bounded list returns only rightful owner-local canonical records.

No network, provider, Memory, Home-layout, model, publication, public-search, semantic-acknowledgement or reciprocal-friendship effect is manufactured by the proof. Test-owned Homes are deleted after every case.

If this proof remains green, FFR-05 closes without new production source and the next irreducible Friend stage is FFR-06: the real Mac↔Windows product walk with independently consumed canonical RETURNS.
