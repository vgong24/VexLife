const REQUIRED_FEATURE_REF = 'feature.vexlife.companion-navigation';
const REQUIRED_CONVERSATION_REF = 'feature.vexlife.addressed-conversation';

function fail(message) {
  throw new Error(`VNAV00: ${message}`);
}

function finite(value, label) {
  if (!Number.isFinite(value)) fail(`${label} must be finite`);
  return value;
}

function requireRef(value, label) {
  if (typeof value !== 'string' || !value.includes('.')) fail(`${label} must be a stable ref`);
  return value;
}

function graphIndex(graph) {
  const nodes = new Map();
  for (const node of graph?.nodes ?? []) {
    requireRef(node.nodeRef, 'nodeRef');
    if (nodes.has(node.nodeRef)) fail(`duplicate node ${node.nodeRef}`);
    nodes.set(node.nodeRef, {
      nodeRef: node.nodeRef,
      x: finite(node.x, `${node.nodeRef}.x`),
      y: finite(node.y, `${node.nodeRef}.y`)
    });
  }
  if (nodes.size < 2) fail('graph requires at least two nodes');

  const adjacency = new Map([...nodes.keys()].map((ref) => [ref, []]));
  for (const edge of graph?.edges ?? []) {
    const from = requireRef(edge.from, 'edge.from');
    const to = requireRef(edge.to, 'edge.to');
    if (!nodes.has(from) || !nodes.has(to)) fail(`edge references unknown node ${from}->${to}`);
    const distanceMeters = finite(edge.distanceMeters, `${from}->${to}.distanceMeters`);
    if (distanceMeters <= 0) fail(`edge distance must be positive ${from}->${to}`);
    adjacency.get(from).push({ to, distanceMeters });
    if (edge.bidirectional !== false) adjacency.get(to).push({ to: from, distanceMeters });
  }
  for (const edges of adjacency.values()) {
    edges.sort((a, b) => a.to.localeCompare(b.to) || a.distanceMeters - b.distanceMeters);
  }
  return { nodes, adjacency };
}

function shortestPath(index, originRef, destinationRef) {
  if (!index.nodes.has(originRef) || !index.nodes.has(destinationRef)) {
    fail(`route endpoint unknown origin=${originRef} destination=${destinationRef}`);
  }
  const distances = new Map([...index.nodes.keys()].map((ref) => [ref, Number.POSITIVE_INFINITY]));
  const previous = new Map();
  const pending = new Set(index.nodes.keys());
  distances.set(originRef, 0);

  while (pending.size) {
    const current = [...pending].sort((a, b) => {
      const delta = distances.get(a) - distances.get(b);
      return delta || a.localeCompare(b);
    })[0];
    pending.delete(current);
    if (!Number.isFinite(distances.get(current))) break;
    if (current === destinationRef) break;
    for (const edge of index.adjacency.get(current)) {
      if (!pending.has(edge.to)) continue;
      const candidate = distances.get(current) + edge.distanceMeters;
      const known = distances.get(edge.to);
      const prior = previous.get(edge.to);
      if (candidate < known || (candidate === known && (!prior || current.localeCompare(prior) < 0))) {
        distances.set(edge.to, candidate);
        previous.set(edge.to, current);
      }
    }
  }

  const distanceMeters = distances.get(destinationRef);
  if (!Number.isFinite(distanceMeters)) return null;
  const path = [];
  let cursor = destinationRef;
  while (cursor) {
    path.unshift(cursor);
    if (cursor === originRef) break;
    cursor = previous.get(cursor);
  }
  if (path[0] !== originRef) return null;
  return { path, distanceMeters };
}

function edgeDistance(index, from, to) {
  const edge = index.adjacency.get(from)?.find((candidate) => candidate.to === to);
  if (!edge) fail(`route contains non-edge ${from}->${to}`);
  return edge.distanceMeters;
}

function maneuvers(index, path) {
  return path.slice(1).map((nodeRef, indexInPath) => ({
    maneuverRef: `maneuver.vnav00.${indexInPath + 1}`,
    fromNodeRef: path[indexInPath],
    toNodeRef: nodeRef,
    instructionClass: indexInPath === path.length - 2 ? 'ARRIVE' : 'CONTINUE',
    distanceMeters: edgeDistance(index, path[indexInPath], nodeRef)
  }));
}

function nearestNode(index, observation) {
  const x = finite(observation.x, `${observation.observationRef}.x`);
  const y = finite(observation.y, `${observation.observationRef}.y`);
  return [...index.nodes.values()].map((node) => ({
    nodeRef: node.nodeRef,
    distanceSquared: (node.x - x) ** 2 + (node.y - y) ** 2
  })).sort((a, b) => a.distanceSquared - b.distanceSquared || a.nodeRef.localeCompare(b.nodeRef))[0];
}

function mapMatch(index, gpsTrace) {
  return (gpsTrace ?? []).map((observation) => {
    requireRef(observation.observationRef, 'gps observationRef');
    if (observation.observationClass !== 'GPS_FIX') fail('gps trace observationClass must be GPS_FIX');
    const nearest = nearestNode(index, observation);
    return {
      sourceObservationRef: observation.observationRef,
      sourceObservationClass: 'GPS_FIX',
      matchedPositionRef: `map-matched.${observation.observationRef}`,
      matchedPositionClass: 'MAP_MATCHED_POSITION',
      matchedNodeRef: nearest.nodeRef,
      accuracyMeters: finite(observation.accuracyMeters, `${observation.observationRef}.accuracyMeters`),
      fullBody3dTruthClaimed: false
    };
  });
}

function remainingDistance(index, path, fromNodeRef) {
  const position = path.indexOf(fromNodeRef);
  if (position < 0) return null;
  let total = 0;
  for (let i = position; i < path.length - 1; i += 1) total += edgeDistance(index, path[i], path[i + 1]);
  return total;
}

function composeBlocked(fixture, blockers) {
  return {
    schemaVersion: 'vexlife.vnav00.synthetic-receipt/v1',
    fixtureRef: fixture.fixtureRef ?? null,
    featureRef: fixture.featureRef ?? null,
    disposition: 'BLOCKED',
    blockers: [...blockers].sort(),
    currentness: {
      mapData: fixture.mapPack?.currentness ?? 'MISSING',
      routingGraph: fixture.router?.currentness ?? 'MISSING',
      traffic: fixture.traffic?.currentness ?? 'UNKNOWN'
    },
    truth: {
      routeFound: false,
      roadCurrentlyOpenClaimed: false,
      liveTrafficClaimed: false,
      routeGuidanceIsVehicleControl: false,
      locationPermissionImpliesRetention: false,
      rawGpsTraceIncluded: false,
      rawSearchHistoryIncluded: false,
      memoryPromotionPerformed: false,
      messageSent: false,
      externalEffectPerformed: false
    }
  };
}

export function evaluateVnav00Fixture(fixture) {
  if (!fixture || typeof fixture !== 'object') fail('fixture is required');
  requireRef(fixture.fixtureRef, 'fixtureRef');
  if (fixture.featureRef !== REQUIRED_FEATURE_REF) fail(`featureRef must be ${REQUIRED_FEATURE_REF}`);
  if (fixture.addressedConversationFeatureRef !== REQUIRED_CONVERSATION_REF) {
    fail(`addressed conversation must reuse ${REQUIRED_CONVERSATION_REF}`);
  }

  const blockers = [];
  if (fixture.mapPack?.currentness !== 'CURRENT') blockers.push('MAP_DATA_NOT_CURRENT');
  if (fixture.router?.currentness !== 'CURRENT') blockers.push('ROUTING_GRAPH_NOT_CURRENT');
  if (fixture.router?.externalDependencyMaterialized !== false) blockers.push('EXTERNAL_ROUTER_DEPENDENCY_FORBIDDEN');
  if (fixture.destination?.sourceClass === 'WEB_PLACE_RESULT' && fixture.destination?.coordinateTrust !== 'RESOLVED_LOCAL') {
    blockers.push('WEB_PLACE_COORDINATE_UNTRUSTED');
  }
  if (fixture.privacy?.rawGpsRetention !== 'EPHEMERAL') blockers.push('RAW_GPS_RETENTION_FORBIDDEN');
  if (!['EPHEMERAL', 'SESSION'].includes(fixture.privacy?.rawSearchRetention)) blockers.push('RAW_SEARCH_RETENTION_FORBIDDEN');
  if (fixture.privacy?.memoryPromotion !== false) blockers.push('MEMORY_PROMOTION_FORBIDDEN');
  if (fixture.effectBoundary?.realGpsRead !== false) blockers.push('REAL_GPS_EFFECT_FORBIDDEN');
  if (fixture.effectBoundary?.networkEffect !== false) blockers.push('NETWORK_EFFECT_FORBIDDEN');
  if (fixture.effectBoundary?.vehicleControl !== false) blockers.push('VEHICLE_CONTROL_FORBIDDEN');
  if (fixture.effectBoundary?.humanMessageSend !== false) blockers.push('MESSAGE_SEND_FORBIDDEN');
  if (blockers.length) return composeBlocked(fixture, blockers);

  const index = graphIndex(fixture.graph);
  const originRef = requireRef(fixture.origin?.nodeRef, 'origin.nodeRef');
  const destinationRef = requireRef(fixture.destination?.nodeRef, 'destination.nodeRef');
  const initialRoute = shortestPath(index, originRef, destinationRef);
  if (!initialRoute) return composeBlocked(fixture, ['ROUTE_NOT_FOUND']);

  const matchedPositions = mapMatch(index, fixture.syntheticGpsTrace);
  const routeSet = new Set(initialRoute.path);
  const deviation = matchedPositions.find((position) => !routeSet.has(position.matchedNodeRef));
  const reroute = deviation ? shortestPath(index, deviation.matchedNodeRef, destinationRef) : null;
  if (deviation && !reroute) return composeBlocked(fixture, ['REROUTE_NOT_FOUND']);

  const activeRoute = reroute ?? initialRoute;
  const questionNodeRef = fixture.howMuchLonger?.atNodeRef ?? activeRoute.path[0];
  const remainingMeters = remainingDistance(index, activeRoute.path, questionNodeRef);
  const speedMps = finite(fixture.howMuchLonger?.speedMps ?? 10, 'howMuchLonger.speedMps');
  if (speedMps <= 0) fail('howMuchLonger.speedMps must be positive');

  const detourNodeRef = requireRef(fixture.detourCandidate?.nodeRef, 'detourCandidate.nodeRef');
  const toDetour = shortestPath(index, originRef, detourNodeRef);
  const fromDetour = shortestPath(index, detourNodeRef, destinationRef);
  const detourDistanceMeters = toDetour && fromDetour ? toDetour.distanceMeters + fromDetour.distanceMeters : null;

  const criticalMeters = finite(fixture.attention?.nextCriticalManeuverMeters, 'attention.nextCriticalManeuverMeters');
  const deferThreshold = finite(fixture.attention?.deferThresholdMeters, 'attention.deferThresholdMeters');
  const questionPresent = typeof fixture.attention?.largeContextQuestion === 'string' && fixture.attention.largeContextQuestion.length > 0;
  const attentionDisposition = questionPresent && criticalMeters <= deferThreshold
    ? 'DEFERRED_UNTIL_AFTER_CRITICAL_MANEUVER'
    : 'ANSWER_NOW';

  const prepared = fixture.preparedMessage ?? {};
  if (prepared.state !== 'MESSAGE_PREPARED') fail('preparedMessage.state must be MESSAGE_PREPARED');
  if (prepared.sent !== false) fail('prepared message must remain unsent');
  if (prepared.humanSpeakerRef === prepared.vexAuthorRef) fail('human speaker and Vex author must remain distinct');

  const networkDisposition = fixture.network?.available === false
    ? 'LOCAL_GUIDANCE_PRESERVED_WITHOUT_NETWORK'
    : 'LOCAL_GUIDANCE_AVAILABLE';

  return {
    schemaVersion: 'vexlife.vnav00.synthetic-receipt/v1',
    fixtureRef: fixture.fixtureRef,
    featureRef: fixture.featureRef,
    addressedConversationFeatureRef: fixture.addressedConversationFeatureRef,
    disposition: 'VNAV00_SYNTHETIC_PASS',
    route: {
      routePlanRef: fixture.routePlanRef,
      generation: reroute ? 2 : 1,
      initialPathNodeRefs: initialRoute.path,
      initialDistanceMeters: initialRoute.distanceMeters,
      maneuverRefs: maneuvers(index, initialRoute.path).map((item) => item.maneuverRef),
      deviationDetected: Boolean(deviation),
      deviationMatchedNodeRef: deviation?.matchedNodeRef ?? null,
      reroutePathNodeRefs: reroute?.path ?? [],
      rerouteDistanceMeters: reroute?.distanceMeters ?? null,
      roadCurrentlyOpenClaimed: false
    },
    mapMatching: {
      sourceClass: 'GPS_FIX',
      outputClass: 'MAP_MATCHED_POSITION',
      fullBody3dTruthClaimed: false,
      matchedPositionRefs: matchedPositions.map((item) => item.matchedPositionRef),
      matchedNodeRefs: matchedPositions.map((item) => item.matchedNodeRef)
    },
    eta: {
      questionClass: 'HOW_MUCH_LONGER',
      atNodeRef: questionNodeRef,
      remainingDistanceMeters: remainingMeters,
      remainingDurationSeconds: remainingMeters === null ? null : Math.ceil(remainingMeters / speedMps),
      trafficAware: false
    },
    attention: {
      profile: 'DRIVING_LOW_DISTRACTION_SYNTHETIC',
      disposition: attentionDisposition,
      nextCriticalManeuverMeters: criticalMeters,
      screenInspectionRequired: false
    },
    messaging: {
      state: 'MESSAGE_PREPARED',
      sent: false,
      humanSpeakerRef: prepared.humanSpeakerRef,
      vexAuthorRef: prepared.vexAuthorRef,
      recipientRefs: [...(prepared.recipientRefs ?? [])],
      humanMessageEqualsVexMessage: false,
      addressedConversationReused: true
    },
    detour: {
      candidateRef: fixture.detourCandidate.candidateRef,
      viaNodeRef: detourNodeRef,
      candidateDistanceMeters: detourDistanceMeters,
      baseDistanceMeters: initialRoute.distanceMeters,
      extraDistanceMeters: detourDistanceMeters === null ? null : detourDistanceMeters - initialRoute.distanceMeters,
      recommendationOnly: true,
      routeChanged: false
    },
    currentness: {
      mapData: fixture.mapPack.currentness,
      mapDataGeneration: fixture.mapPack.generation,
      routingGraph: fixture.router.currentness,
      traffic: fixture.traffic?.currentness ?? 'UNKNOWN',
      liveTrafficClaimed: false
    },
    continuity: {
      networkDisposition,
      localMapDataSufficient: fixture.network?.localMapDataSufficient === true,
      rawGpsTraceIncluded: false,
      rawSearchHistoryIncluded: false,
      tripMemoryCreated: false,
      memoryPromotionPerformed: false
    },
    receipts: {
      mapPackRef: fixture.mapPack.mapPackRef,
      mapSourceRefs: [...(fixture.mapPack.sourceRefs ?? [])],
      licenseRef: fixture.mapPack.licenseRef,
      routerAdapterRef: fixture.router.adapterRef,
      privacyRef: fixture.privacy.privacyRef,
      routeSourceRefs: [...(fixture.routeSourceRefs ?? [])]
    },
    truth: {
      gpsFixEqualsMapMatchedPosition: false,
      mapMatchedPositionEqualsFullBody3dTruth: false,
      locationPermissionImpliesRetention: false,
      routeFoundEqualsRoadOpen: false,
      staticMapDataEqualsLiveTraffic: false,
      routeGuidanceIsVehicleControl: false,
      messagePreparedEqualsMessageSent: false,
      searchHistoryIsMemoryByDefault: false,
      witnessedTripEqualsRememberedTrip: false,
      externalEffectPerformed: false
    }
  };
}

export const VNAV00_CONTRACT = Object.freeze({
  featureRef: REQUIRED_FEATURE_REF,
  addressedConversationFeatureRef: REQUIRED_CONVERSATION_REF,
  sourceOnly: true,
  effectFree: true,
  externalMapRuntimeMaterialized: false,
  realGpsRead: false,
  networkEffect: false,
  humanMessageSend: false,
  vehicleControl: false,
  locationRetention: false,
  memoryMutation: false
});

// [VXG RealForever]
