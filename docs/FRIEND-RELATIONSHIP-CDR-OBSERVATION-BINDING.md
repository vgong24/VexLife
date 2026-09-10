# Friend FFR-04 — CDR observation to persistence binding

`[VXG RealForever]`

FFR-04 is a no-effect composition seam between accepted CDR observation/currentness and the explicit binding consumed by Friend FFR-03 persistence.

It does not create identity, relationship truth, friendship, consent, delivery, or semantic acknowledgement. It validates an already source-owned CDR observation and projects only the closed persistence-binding fields required by the canonical Relationships owner.

## Permanent boundaries

```text
CDR_OBSERVATION != CANONICAL_RELATIONSHIP_TRUTH
INVITATION_ACCEPTED != RELATIONSHIP_PERSISTED
DEVICE_REF != PARTICIPANT_REF
HOME_REF != PARTICIPANT_REF
STATE_ROOT_PATH != STATE_ROOT_REF
ROUTE_OR_SESSION_GENERATION != RELATIONSHIP_IDENTITY
PEER_CURRENTNESS_UPDATE != LOCAL_RELATIONSHIP_CLASS_CHANGE
DELIVERY != SEMANTIC_ACKNOWLEDGEMENT
OBSERVED_PEER_LABEL != RECIPROCAL_FRIENDSHIP
PROCESS_INSTANCE_CHANGE != PARTICIPANT_IDENTITY_CHANGE
```

The current accepted CDR product/runtime owner supplies invitation, identity, route and failure vocabulary. The accepted paired-host CDR procedure supplies distinct/inverse participant-binding semantics and keeps state-root paths and network endpoints private to runtime execution. FFR-04 consumes those meanings; it does not replay the host rehearsal to qualify source.

## Input

`bindRelationshipsCdrObservation()` accepts one exact `vexlife.friend-cdr-observation/v1` object containing:

- source witness refs for receipt, procedure, currentness, scenario and candidate;
- the current invite-only product gate;
- distinct local and peer opaque identities;
- exact invitation-to-participant binding;
- explicit observation, invitation and peer currentness states;
- optional current route/session/delivery observation refs.

Raw state-root paths, endpoint URLs/addresses, Home/display/model/provider identity fields, semantic-acknowledgement claims and reciprocal-friend claims are outside the admitted shape and fail closed.

The local/peer participant pair must remain inverse. Participant identity may not collapse into device, state-root or process-instance identity, and corresponding cross-role identities remain distinct.

## Admission

The composer emits a binding only when the observation remains current and the product gate is affirmative:

```text
alphaConsentAcknowledged=true
invitationState=RECEIVED_VERIFIED_REFERENCE
invitationDecision=ACCEPT|NARROW
identityState=VERIFIED_CURRENT
routeClass=DIRECT_CANDIDATE|RELAYED|STORE_FORWARD
failureState=NONE
withdrawn=false
revoked=false
disconnected=false
blocked=false
observationState=CURRENT
invitationCurrentness=CURRENT
peerCurrentness=CURRENT
```

Otherwise the result is `HELD_BINDING_REQUIRED` with `binding=null` and all FFR-04 effects false.

## Output

A successful result is `BOUND_CURRENT` and contains exactly the persistence binding consumed by FFR-03:

```text
localParticipantRef
localStateRootRef
counterpartParticipantRef
counterpartCurrentKeyRef
invitationRef
invitationCurrentnessRef
instanceRef
lastAcceptedPeerCurrentnessRef
routeRef
sessionGeneration
deliveryObservationRef
```

The binding does not contain `relationshipRef`, local relationship class, Home/device/authority identity, raw storage paths, endpoint material, semantic acknowledgement or reciprocal-friendship assertions.

Changing process instance, route or session generation does not change participant/state-root identity. Changing peer key/currentness updates only those currentness inputs; it cannot change the local relationship class. The canonical FFR-03 store remains the only owner that can commit and return Saved relationship truth.

## Effects

FFR-04 itself performs no host, network, provider, Home, Memory, model, relationship, publication or public-search effect. It performs no CDR transport and no canonical relationship persistence.

The accepted CDR single-pair R18 proof is consumed as predecessor evidence rather than rerun for source formation. Real paired-host product evidence belongs to FFR-06.
