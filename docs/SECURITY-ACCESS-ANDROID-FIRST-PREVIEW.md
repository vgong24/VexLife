# Security & Access — Android-first preview

`[VXG RealForever]`

## Human purpose

The first VexLife Security & Access slice gives a person one calm place to see that security options exist, understand what they would do, and ask Vex for an explanation **without** pretending that authentication, device pairing, trusted-device data, recovery, or private Home access is already connected.

This is a product projection over accepted owners. It is not a new authenticator.

## First-slice truth

```text
Health contextual projection
→ Security & Access
→ Android-first preview
→ deterministic PREVIEW_ONLY or BACKEND_UNAVAILABLE
→ future protected controls visible but disabled
→ Vex may explain
→ no protected effect
```

```text
VEX_EXPLAINS != VEX_AUTHENTICATES != VEX_AUTHORIZES
FEATURE_FLAG != SECURITY_POLICY
PAIRING_PREVIEW != DEVICE_PAIRED
AUTHENTICATOR_LIST_PREVIEW != CREDENTIAL_CUSTODY
LOGIN_SUCCESS != PRIVATE_HOME_AUTHORITY
DEVICE_PAIRED != EVERY_CAPABILITY_GRANTED
ROUTE_REACHABLE != AUTHENTICATED != AUTHORIZED
MODEL_AVAILABLE != SECURITY_CONTROL_AVAILABLE
```

## Ownership

The slice reuses:

```text
screen.vexlife.health
route.health
state.health
service.health
action.guide.ask
permission.none
permission.conversation.send
process.vexlife.feature.register-and-project
```

The dedicated `security-access-preview-registry.json` owns only preview vocabulary and held first-slice projection truth. It cannot mint credentials, pair devices, grant capability leases, change recovery, write Home/Memory/Friend state, expose a listener, call a provider/model, train, activate, publish, or search publicly.

## Preview visibility

`flag.vexlife.security-access.preview` is a presentation preference only.

`FLAG_OFF` hides the preview content. It does **not** disable security.  
`FLAG_VISIBLE_PREVIEW` shows deterministic reference truth.  
`FLAG_RUNTIME_BOUND` remains future/held.

The browser may persist only:

```text
vexlife.security-access.preview-visible = true | false
```

No authentication or policy state is stored there.

## Android first

The current reference targets an Android-shaped human experience without requiring an iPhone. Native Android pairing or a real phone connection is **not** implemented by this source slice.

A later real-device Human Experience proof may use a separately admitted temporary host bridge such as a QR-opened local session, but only after explicit network-listener authority exists. The first slice keeps `networkListenerOrExposure=false`.

## Held controls

The reference shows, but cannot execute:

- Add Android phone
- Register passkey
- Use authenticator app
- Review trusted devices
- End sessions
- Revoke lost device
- Review recovery
- Secure My Vex

Every one remains disabled with a source-owned reason.

## Proof

Focused source tests prove strict input shape, held future states, explicit all-false protected effects, EN/JA/ZH coverage, Health placement, compact/mobile CSS, deterministic Ask Vex explanation, and absence of credential/network implementation APIs. The mandatory browser integration suite separately exercises the rendered projection.

`[VXG RealForever]`
