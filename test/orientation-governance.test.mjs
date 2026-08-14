import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deriveOrientationReceipt } from '../src/core/orientation.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
const contract = JSON.parse(read('blueprint/orientation.json'));

const POLICY_FLAGS = [
  'ROLE_AUTHORITY_SEPARATE_FROM_PROVIDER_ACCOUNT=true',
  'ASSURANCE_INDEPENDENCE_IS_ROLE_PROVIDER_WITNESS_NOT_ACCOUNT=true',
  'LIFECYCLE_APPROVAL_IS_SEMANTIC_ROLE_DECISION=true',
  'NATIVE_GITHUB_APPROVAL_IS_TRANSPORT_ONLY_UNLESS_LIVE_RULESET_REQUIRES=true',
  'SELF_REVIEW_UNAVAILABLE_DOES_NOT_MEAN_APPROVAL_AUTHORITY_MISSING=true',
  'CODEOWNER_ACCOUNT_MAPPING_DOES_NOT_COLLAPSE_INSTITUTIONAL_ROLE_IDENTITY=true',
  'DCO_IS_PRE_EFFECT_COMMIT_FORMATION_INVARIANT=true',
  'UNSIGNED_COMMIT_MUST_BE_PREVENTED_NOT_DISCOVERED_AFTER_A_SOURCE_SEQUENCE=true'
];

const REQUIRED_GOVERNANCE_SOURCES = [
  'GOVERNANCE.md',
  'CONTRIBUTING.md',
  '.github/CODEOWNERS',
  '.github/workflows/dco.yml'
];

function groundedReceipt() {
  return deriveOrientationReceipt({
    contract,
    evidence: {
      repository: { slug: 'vgong24/VexLife', remoteUrl: 'git@example.invalid:VexLife.git' },
      git: {
        branch: 'main',
        workingTree: 'CLEAN',
        checkoutKind: 'BRANCH',
        upstreamRef: 'origin/main',
        behind: 0,
        candidateHeadSha: 'a'.repeat(40),
        testedMergeSha: null,
        baseSha: 'a'.repeat(40)
      }
    },
    currentWork: {
      visibility: 'PRIVATE',
      visibilitySource: 'TEST',
      prNumber: null,
      prSource: 'UNKNOWN',
      workRef: null,
      workSource: 'UNKNOWN',
      attentions: [],
      priorReviewedHead: null,
      commitsAbovePriorHead: null
    },
    lifecycle: { state: 'PRIVATE_STAGING', source: 'TEST' },
    blueprint: {
      state: 'CURRENT',
      semanticHash: 'fixture',
      sourceManifestState: 'CURRENT',
      sourceTreeSha256: 'fixture',
      pathTopologyState: 'ROOT_RELATIVE',
      valid: true,
      sourceManifestCurrent: true,
      pathTopologyValid: true
    }
  });
}

test('orientation receipt cannot omit canonical governance and DCO sources', () => {
  const receipt = groundedReceipt();
  assert.equal(receipt.state, 'GROUNDED', `${receipt.attentions.join('; ')} ${receipt.blockers.join('; ')}`);
  for (const source of REQUIRED_GOVERNANCE_SOURCES) {
    assert.ok(receipt.requiredSources.includes(source), `orientation omitted ${source}`);
  }
});

test('fresh-arrival source carries every institutional role/account and DCO invariant', () => {
  const agents = read('AGENTS.md');
  for (const flag of POLICY_FLAGS) assert.ok(agents.includes(flag), `arrival contract omitted ${flag}`);
  assert.match(agents, /read every `requiredSources`/u);
  assert.match(agents, /before review, lifecycle approval, or any\s+commit-producing effect/u);
  assert.match(agents, /resolve the actual Git author name and\s+email/u);
  assert.match(agents, /include it before the\s+commit exists/u);
  assert.match(agents, /reject the write\s+path/u);
  assert.match(agents, /verify the created commit's author identity and matching\s+trailer before any subsequent source effect/u);
});

test('canonical governance, CODEOWNERS, contribution and DCO workflow remain required source truth', () => {
  const governance = read('GOVERNANCE.md');
  const contributing = read('CONTRIBUTING.md');
  const codeowners = read('.github/CODEOWNERS');
  const dco = read('.github/workflows/dco.yml');

  assert.match(governance, /DCO sign-off records provenance; it does not grant a governance role or merge\s+authority/u);
  assert.match(governance, /\*\*Reviewer:\*\*/u);
  assert.match(governance, /\*\*Code owner:\*\*/u);
  assert.match(governance, /\*\*Maintainer:\*\*/u);
  assert.match(contributing, /Every commit must carry a Developer Certificate of Origin 1\.1 sign-off/u);
  assert.match(codeowners, /\/GOVERNANCE\.md @vgong24/u);
  assert.match(codeowners, /\/\.github\/workflows\/\*\* @vgong24/u);
  assert.match(dco, /git rev-list --reverse/u);
  assert.match(dco, /--format=%an/u);
  assert.match(dco, /--format=%ae/u);
  assert.match(dco, /expected_signoff="Signed-off-by: \$\{author_name\} <\$\{author_email\}>"/u);
  assert.match(dco, /grep -Fxiq/u);
});

// [VXG RealForever]
