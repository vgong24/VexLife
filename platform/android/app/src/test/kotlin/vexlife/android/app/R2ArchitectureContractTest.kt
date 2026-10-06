package vexlife.android.app

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import vexlife.android.identity.GeneratedCanonicalRefs
import vexlife.android.architecture.AttemptRef
import vexlife.android.architecture.EffectResult
import vexlife.android.architecture.OperationExecutor
import vexlife.android.architecture.OperationRecord
import vexlife.android.architecture.PrincipalSessionFence
import vexlife.android.architecture.ProcessLocalR2IdentityFactory
import vexlife.android.architecture.RequestConversationAttention
import vexlife.android.architecture.ResultAdmission
import vexlife.android.architecture.ResultAdmissionController
import vexlife.android.architecture.ResultRef
import vexlife.android.architecture.SemanticRef
import vexlife.android.architecture.VexClock
import vexlife.android.architecture.VexDispatchers
import vexlife.android.architecture.VexRuntimeWitness

class R2ArchitectureContractTest {
    @Test fun operationIdentityIsNotAttemptIdentity() {
        val identities = ProcessLocalR2IdentityFactory()
        val intention = RequestConversationAttention(SemanticRef("conversation.test"))
        val operation = identities.newOperationRef(intention)
        val attempt = identities.newAttemptRef(operation)
        assertNotEquals(operation.value, attempt.value)
    }

    @Test fun duplicateAndStaleResultsAreRejectedDeterministically() {
        val record = OperationRecord(
            vexlife.android.architecture.OperationRef("operation.test"),
            RequestConversationAttention(SemanticRef("conversation.test")),
            PrincipalSessionFence(SemanticRef("principal.test"), SemanticRef("session.test")),
            1L,
        )
        val current = AttemptRef("attempt.current")
        val stale = EffectResult.Success(
            ResultRef("result.stale"), record.operationRef, AttemptRef("attempt.stale"), record.fence,
            SemanticRef("effect-result.test/v1"),
        )
        val accepted = EffectResult.Success(
            ResultRef("result.current"), record.operationRef, current, record.fence,
            SemanticRef("effect-result.test/v1"),
        )
        val admission = ResultAdmissionController()
        val wrongFence = accepted.copy(
            resultRef = ResultRef("result.wrong-fence"),
            fence = PrincipalSessionFence(SemanticRef("principal.other"), SemanticRef("session.other")),
        )
        assertEquals(ResultAdmission.IGNORE_STALE, admission.admit(record, current, stale))
        assertEquals(ResultAdmission.HOLD_CONFLICT, admission.admit(record, current, wrongFence))
        assertEquals(ResultAdmission.ADMIT_CURRENT, admission.admit(record, current, accepted))
        assertEquals(ResultAdmission.IGNORE_DUPLICATE, admission.admit(record, current, accepted))
    }

    @Test fun sentenceLikeIntentionCrossesTypedAdmissionBoundary() = runBlocking {
        val identities = ProcessLocalR2IdentityFactory()
        val executor = OperationExecutor { record, attempt ->
            EffectResult.Success(
                identities.newResultRef(record.operationRef), record.operationRef, attempt, record.fence,
                SemanticRef("effect-result.test.no-effect/v1"),
            )
        }
        val runtime = VexRuntimeWitness(executor, VexClock { 100L }, identities)
        val disposition = runtime.submit(
            RequestConversationAttention(SemanticRef("conversation.test")),
            PrincipalSessionFence(SemanticRef("principal.test"), SemanticRef("session.test")),
        )
        assertEquals(ResultAdmission.ADMIT_CURRENT, disposition)
        assertEquals(
            VexRuntimeWitness.STATUS_ATTENTION_ADMITTED,
            runtime.outputState.value.valueOrNull?.statusRef?.value,
        )
    }

    @Test fun semanticIdentityIsIndependentOfLocalizedLabels() {
        assertEquals(
            "action.vexlife.conversation.request-attention",
            GeneratedCanonicalRefs.requestAttentionAction.value,
        )
        assertEquals(
            "result-admission.vexlife.admit-current/v1",
            ResultAdmission.ADMIT_CURRENT.semanticRef.value,
        )
        assertTrue(GeneratedCanonicalRefs.ARCHITECTURE_BASELINE_REF.startsWith("architecture.vexlife."))
    }

    @Test fun dispatcherAndClockAreSubstitutable() {
        val dispatchers = object : VexDispatchers {
            override val main = Dispatchers.Unconfined
            override val default = Dispatchers.Unconfined
            override val io = Dispatchers.Unconfined
        }
        val clock = VexClock { 42L }
        assertEquals(Dispatchers.Unconfined, dispatchers.main)
        assertEquals(42L, clock.nowEpochMillis())
    }
}
