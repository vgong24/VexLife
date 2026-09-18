import crypto from 'node:crypto';
import { semanticHash } from './utils.mjs';

function ref(prefix) { return `${prefix}.${crypto.randomUUID()}`; }

export function createDeviceInstallation({ personRef, familyRef, deviceName, platform, architecture, now = new Date().toISOString() }) {
  const deviceRef = ref('device.vexlife');
  const lineageRef = ref('companion-lineage.vexlife');
  return {
    schemaVersion: 'vexlife.device-installation/v0',
    personRef,
    familyRef,
    deviceRef,
    deviceName,
    platform,
    architecture,
    companionLineageRef: lineageRef,
    rhythmRef: ref('rhythm.vexlife.local'),
    scoreProjectionRef: ref('score-projection.vexlife.empty'),
    currentInstanceRef: null,
    createdAt: now,
    identityStatement: 'Distinct device companion lineage; shared Score does not collapse identity.'
  };
}

export function createScoreRecord({ recordRef, type, subjectRef, scopeRef, content, sourceLineageRef, consentState = 'ACCEPTED', visibility = 'PRIVATE', currentness = 'CURRENT' }) {
  return {
    recordRef,
    type,
    subjectRef,
    scopeRef,
    content,
    contentHash: semanticHash(content),
    sourceLineageRef,
    consentState,
    visibility,
    currentness
  };
}

export function synchronizeScore({ targetInstallation, records, allowedScopes }) {
  const allowed = new Set(allowedScopes);
  const accepted = records.filter((record) => record.consentState === 'ACCEPTED' && allowed.has(record.scopeRef));
  return {
    targetLineageRef: targetInstallation.companionLineageRef,
    records: structuredClone(accepted),
    sourceLineageRefs: [...new Set(accepted.map((record) => record.sourceLineageRef))],
    lineageCollapsed: false,
    rhythmImported: false,
    projectionHash: semanticHash(accepted)
  };
}

export function createSiblingTrail({ trailRef, sourceLineageRef, sourceRangeRefs, summary, acceptedDecisions = [], openLoops = [], visibility = 'FAMILY_PRIVATE' }) {
  return {
    trailRef,
    sourceLineageRef,
    sourceRangeRefs: [...sourceRangeRefs],
    summary,
    acceptedDecisions: [...acceptedDecisions],
    openLoops: [...openLoops],
    visibility,
    contentHash: semanticHash({ sourceRangeRefs, summary, acceptedDecisions, openLoops })
  };
}

// [VXG RealForever]
