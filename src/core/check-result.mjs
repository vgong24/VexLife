const TRANSPORT_STATES = new Set(['EXECUTED', 'SPAWN_FAILED', 'TIMED_OUT']);
const SEMANTIC_STATES = new Set(['PASSED', 'ATTENTION', 'NOT_RUN', 'UNKNOWN', 'STALE', 'BLOCKED', 'FAILED']);

function parseLastJsonObject(output) {
  const text = String(output ?? '').trim();
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== '{') continue;
    try {
      return JSON.parse(text.slice(index));
    } catch {
      // Continue until the outermost final JSON object is found.
    }
  }
  return null;
}

function semanticStateForRawState(rawState, contract) {
  const normalized = String(rawState ?? '').trim().toUpperCase();
  for (const semanticState of SEMANTIC_STATES) {
    if ((contract?.stateAdmission?.[semanticState] ?? []).includes(normalized)) return semanticState;
  }
  return contract?.defaultUnparseableSemanticState ?? 'BLOCKED';
}

export function validateCheckResultContract(contract) {
  const errors = [];
  if (!contract?.contractRef) errors.push('check-result contract missing contractRef');
  if (contract?.outputFormat !== 'FINAL_JSON_OBJECT') errors.push('check-result contract outputFormat must be FINAL_JSON_OBJECT');
  if (!SEMANTIC_STATES.has(contract?.defaultUnparseableSemanticState)) errors.push('check-result contract has invalid defaultUnparseableSemanticState');
  for (const [semanticState, rawStates] of Object.entries(contract?.stateAdmission ?? {})) {
    if (!SEMANTIC_STATES.has(semanticState)) errors.push(`check-result contract has invalid semantic state ${semanticState}`);
    if (!Array.isArray(rawStates) || rawStates.some((state) => typeof state !== 'string')) {
      errors.push(`check-result contract ${semanticState} admission must be an array of strings`);
    }
  }
  return { ok: errors.length === 0, errors };
}

export function admitCheckResult({
  checkRef,
  command,
  contract,
  transportState,
  exitCode = null,
  stdout = '',
  stderr = '',
  timedOutAfterMs = null
}) {
  if (!TRANSPORT_STATES.has(transportState)) throw new Error(`invalid transportState ${transportState}`);
  const payload = transportState === 'EXECUTED' ? parseLastJsonObject(stdout) : null;
  const rawState = payload?.state ?? null;
  let semanticState = transportState === 'EXECUTED'
    ? semanticStateForRawState(rawState, contract)
    : 'BLOCKED';
  let currentness = transportState === 'EXECUTED' && payload
    ? String(payload.currentness ?? 'CURRENT').toUpperCase()
    : 'UNKNOWN';

  if (semanticState === 'PASSED' && currentness !== 'CURRENT') semanticState = 'STALE';
  if (semanticState === 'PASSED' && exitCode !== 0) semanticState = 'FAILED';
  if (!SEMANTIC_STATES.has(semanticState)) semanticState = 'BLOCKED';
  if (!['CURRENT', 'STALE', 'UNKNOWN'].includes(currentness)) currentness = 'UNKNOWN';

  const detail = transportState === 'SPAWN_FAILED'
    ? String(stderr || 'process spawn failed').trim()
    : transportState === 'TIMED_OUT'
      ? `timed out after ${timedOutAfterMs}ms`
      : payload
        ? command
        : `UNPARSEABLE_OUTPUT:${command}`;

  return {
    schemaVersion: 'vexlife.check-result/v0',
    resultContractRef: contract.contractRef,
    checkRef,
    command,
    transportState,
    semanticState,
    rawState,
    exitCode,
    executed: transportState === 'EXECUTED',
    currentness,
    detailRef: detail
  };
}

export const CHECK_RESULT_STATES = {
  transport: [...TRANSPORT_STATES],
  semantic: [...SEMANTIC_STATES]
};

// [VXG RealForever]
