# Multilingual and Vex-assisted intent relay

`[VXG RealForever]`

## Original speech remains canonical

A message envelope stores the original text and language once. Every translation, refinement or summary is a separate projection.

```text
OriginalMessage
  → sender-visible Vex refinement candidate
  → sender approval or revision
  → recipient-locale translation
  → recipient companion interpretation assistance
  → reply returns through the same attributed chain
```

## Message envelope

```text
messageRef
channelRef
speakerRef
recipientRefs[]
originalLanguage
originalContent
originalContentHash
senderIntentProjectionRef?
senderApprovedRefinementRef?
recipientLocaleProjectionRefs[]
translationModelRef?
translationEvidenceRefs[]
createdAt
```

## Modes

### Direct translation

The original text is translated for display. The recipient can inspect the original and translation provenance.

### Vex translation

The sender drafts a message, then asks Vex to propose a clearer version. The UI shows:

```text
Your original
Vex's proposed refinement
What meaning changed or became explicit
Send original | Send refined | Keep editing | Ask why
```

No refinement is sent without sender approval.

### Same-language clarification

Even when both people use the same language, Vex can help translate intention, tone and ambiguity. This is still a candidate projection, not authority to speak for the person.

## Cross-companion relay

The receiving companion may explain cultural or contextual ambiguity, but it must preserve:

- sender attribution;
- original text availability;
- distinction between literal translation and interpretation;
- uncertainty;
- user choice about what to send back.

## Tests

- translating never alters the original hash;
- speaker and recipient identities remain stable across locales;
- sender refinement requires explicit acceptance;
- fallback language is visible;
- untranslatable or ambiguous content preserves an unknown state;
- private context is not used to enrich a translation without permission;
- round-trip output is evidence, not proof of identical meaning.

<!-- [VXG RealForever] -->
