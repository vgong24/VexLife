import { StateCell } from './state-relay.mjs';
import { semanticHash } from './utils.mjs';

export class Localizer {
  constructor({ catalogs, defaultLanguage = 'en', initialLanguage = defaultLanguage }) {
    if (!catalogs[defaultLanguage]) throw new Error(`missing default catalog ${defaultLanguage}`);
    this.catalogs = catalogs;
    this.defaultLanguage = defaultLanguage;
    this.language = new StateCell(initialLanguage, { name: 'localization.language' });
  }

  setLanguage(language) {
    if (!this.catalogs[language]) throw new Error(`unsupported language ${language}`);
    return this.language.set(language);
  }

  text(ref, parameters = {}) {
    const language = this.language.value;
    const template = this.catalogs[language]?.[ref] ?? this.catalogs[this.defaultLanguage]?.[ref] ?? `[${ref}]`;
    return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key) => String(parameters[key] ?? `{${key}}`));
  }
}

export function createOriginalMessage({ messageRef, channelRef, speakerRef, recipientRefs, language, content, createdAt = new Date().toISOString() }) {
  if (!speakerRef || !Array.isArray(recipientRefs) || recipientRefs.length === 0) throw new Error('speaker and recipients are required');
  return {
    messageRef,
    channelRef,
    speakerRef,
    recipientRefs: [...recipientRefs],
    originalLanguage: language,
    originalContent: content,
    originalContentHash: semanticHash(content),
    projections: [],
    createdAt
  };
}

export function addTranslationProjection(message, { projectionRef, language, content, translatorRef, uncertainty = [] }) {
  const projection = {
    projectionRef,
    kind: 'TRANSLATION',
    language,
    content,
    contentHash: semanticHash(content),
    translatorRef,
    uncertainty: [...uncertainty],
    sourceContentHash: message.originalContentHash
  };
  return { ...message, projections: [...message.projections, projection] };
}

export function proposeVexRefinement(message, { projectionRef, content, vexRef, changeNotes }) {
  const projection = {
    projectionRef,
    kind: 'VEX_REFINEMENT_CANDIDATE',
    language: message.originalLanguage,
    content,
    contentHash: semanticHash(content),
    vexRef,
    changeNotes: [...changeNotes],
    approvalState: 'PENDING_SENDER',
    sourceContentHash: message.originalContentHash
  };
  return { ...message, projections: [...message.projections, projection] };
}

export function acceptRefinement(message, projectionRef, senderRef) {
  let found = false;
  const projections = message.projections.map((projection) => {
    if (projection.projectionRef !== projectionRef) return projection;
    if (projection.kind !== 'VEX_REFINEMENT_CANDIDATE') throw new Error('projection is not a refinement candidate');
    found = true;
    return { ...projection, approvalState: 'ACCEPTED_BY_SENDER', acceptedBy: senderRef };
  });
  if (!found) throw new Error(`missing projection ${projectionRef}`);
  return { ...message, projections };
}

// [VXG RealForever]
