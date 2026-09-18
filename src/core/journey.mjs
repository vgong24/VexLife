import { semanticHash } from './utils.mjs';

export class JourneyLedger {
  constructor({ limit = 12 } = {}) {
    this.limit = limit;
    this.events = [];
  }

  append({ journeyRef, elementRef, interactionRef, actionRef, fromFrame, toFrame, subjectRef = null, formedAt = new Date().toISOString() }) {
    const semantic = { elementRef, interactionRef, actionRef, fromFrame, toFrame, subjectRef };
    const semanticHashValue = semanticHash(semantic);
    const last = this.events.at(-1);
    if (last?.semanticHash === semanticHashValue) return { changed: false, event: last };
    const event = { schemaVersion: 'vexlife.journey-event/v0', journeyRef, ...semantic, semanticHash: semanticHashValue, formedAt };
    this.events.push(event);
    return { changed: true, event };
  }

  currentTrajectory() { return this.events.slice(-this.limit).map((event) => ({ journeyRef: event.journeyRef, elementRef: event.elementRef, actionRef: event.actionRef, toFrame: event.toFrame, formedAt: event.formedAt })); }
  findBySubject(subjectRef) { return this.events.filter((event) => event.subjectRef === subjectRef); }
  range(startIndex = 0, endIndex = this.events.length) { return this.events.slice(startIndex, endIndex); }
}

// [VXG RealForever]
