package vexlife.android.architecture

import java.util.concurrent.atomic.AtomicLong
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import vexlife.android.state.VexObservation
import vexlife.android.state.VexProjectionAdmission
import vexlife.android.state.VexStateProjection
import vexlife.android.state.VexStateSnapshot

@JvmInline value class SemanticRef(val value: String) {
    init { require(value.isNotBlank()) }
}
@JvmInline value class OperationRef(val value: String) {
    init { require(value.isNotBlank()) }
}
@JvmInline value class AttemptRef(val value: String) {
    init { require(value.isNotBlank()) }
}
@JvmInline value class ResultRef(val value: String) {
    init { require(value.isNotBlank()) }
}

enum class IntentionLifetime { PRESENTATION_BOUND, SESSION_BOUND, DURABLE }

sealed interface VexIntention {
    val semanticTypeRef: SemanticRef
    val lifetime: IntentionLifetime
}

data class RequestConversationAttention(
    val conversationRef: SemanticRef,
) : VexIntention {
    override val semanticTypeRef = SemanticRef(WIRE_TYPE_REF)
    override val lifetime = IntentionLifetime.PRESENTATION_BOUND
    companion object {
        const val WIRE_TYPE_REF = "intention.vexlife.conversation.request-attention/v1"
    }
}

data class PrincipalSessionFence(
    val principalRef: SemanticRef,
    val sessionRef: SemanticRef,
)

data class OperationRecord(
    val operationRef: OperationRef,
    val intention: VexIntention,
    val fence: PrincipalSessionFence,
    val acceptedAtEpochMillis: Long,
)

sealed interface EffectResult {
    val resultRef: ResultRef
    val operationRef: OperationRef
    val attemptRef: AttemptRef
    val fence: PrincipalSessionFence

    data class Success(
        override val resultRef: ResultRef,
        override val operationRef: OperationRef,
        override val attemptRef: AttemptRef,
        override val fence: PrincipalSessionFence,
        val resultTypeRef: SemanticRef,
    ) : EffectResult
}

enum class ResultAdmission(val semanticRef: SemanticRef) {
    ADMIT_CURRENT(SemanticRef("result-admission.vexlife.admit-current/v1")),
    IGNORE_STALE(SemanticRef("result-admission.vexlife.ignore-stale/v1")),
    IGNORE_DUPLICATE(SemanticRef("result-admission.vexlife.ignore-duplicate/v1")),
    SUPERSEDED(SemanticRef("result-admission.vexlife.superseded/v1")),
    HOLD_CONFLICT(SemanticRef("result-admission.vexlife.hold-conflict/v1")),
    FAIL_CONTRACT(SemanticRef("result-admission.vexlife.fail-contract/v1")),
}

fun interface OperationExecutor {
    suspend fun execute(record: OperationRecord, attemptRef: AttemptRef): EffectResult
}
fun interface VexClock { fun nowEpochMillis(): Long }

interface VexDispatchers {
    val main: CoroutineDispatcher
    val default: CoroutineDispatcher
    val io: CoroutineDispatcher
}
object AndroidVexDispatchers : VexDispatchers {
    override val main = Dispatchers.Main.immediate
    override val default = Dispatchers.Default
    override val io = Dispatchers.IO
}
object SystemVexClock : VexClock {
    override fun nowEpochMillis(): Long = System.currentTimeMillis()
}

interface VexIdentityFactory {
    fun newOperationRef(intention: VexIntention): OperationRef
    fun newAttemptRef(operationRef: OperationRef): AttemptRef
    fun newResultRef(operationRef: OperationRef): ResultRef
}

class ProcessLocalR2IdentityFactory : VexIdentityFactory {
    private val sequence = AtomicLong(0)
    override fun newOperationRef(intention: VexIntention) =
        OperationRef("operation.r2.${sequence.incrementAndGet()}")
    override fun newAttemptRef(operationRef: OperationRef) =
        AttemptRef("${operationRef.value}.attempt.${sequence.incrementAndGet()}")
    override fun newResultRef(operationRef: OperationRef) =
        ResultRef("${operationRef.value}.result.${sequence.incrementAndGet()}")
}

class ResultAdmissionController {
    private val admittedResultRefs = linkedSetOf<ResultRef>()

    fun admit(record: OperationRecord, currentAttemptRef: AttemptRef, result: EffectResult): ResultAdmission {
        if (result.operationRef != record.operationRef) return ResultAdmission.HOLD_CONFLICT
        if (result.fence != record.fence) return ResultAdmission.HOLD_CONFLICT
        if (result.resultRef in admittedResultRefs) return ResultAdmission.IGNORE_DUPLICATE
        if (result.attemptRef != currentAttemptRef) return ResultAdmission.IGNORE_STALE
        admittedResultRefs += result.resultRef
        return ResultAdmission.ADMIT_CURRENT
    }
}

data class VexOutputState(
    val statusRef: SemanticRef,
    val operationRefOrNull: OperationRef?,
    val lastAdmissionOrNull: ResultAdmission?,
)
data class VexView(
    val statusRef: SemanticRef,
    val operationRefOrNull: OperationRef?,
    val testRef: SemanticRef,
)
fun interface SurfacePolicy { fun present(output: VexOutputState): VexView }

class R2ArchitectureSurfacePolicy(private val testRef: SemanticRef) : SurfacePolicy {
    override fun present(output: VexOutputState) =
        VexView(output.statusRef, output.operationRefOrNull, testRef)
}

class VexRuntimeWitness(
    private val executor: OperationExecutor,
    private val clock: VexClock,
    private val identities: VexIdentityFactory,
    initialInstanceRef: String = "runtime.vexlife.android.r2.instance.001",
) {
    private var revision = 0L
    private val projection = VexStateProjection(
        initial = snapshot(
            revision = revision,
            transitionRefOrNull = null,
            output = VexOutputState(SemanticRef(STATUS_READY), null, null),
            instanceRef = initialInstanceRef,
        ),
        copyValue = { value -> value?.copy() },
    )
    private val admission = ResultAdmissionController()
    private val admissionMutex = Mutex()
    val outputState: StateFlow<VexStateSnapshot<VexOutputState>> = projection.state

    suspend fun submit(intention: VexIntention, fence: PrincipalSessionFence): ResultAdmission {
        val operationRef = identities.newOperationRef(intention)
        val attemptRef = identities.newAttemptRef(operationRef)
        require(operationRef.value != attemptRef.value)
        val record = OperationRecord(operationRef, intention, fence, clock.nowEpochMillis())
        val result = executor.execute(record, attemptRef)
        return admissionMutex.withLock {
            val disposition = admission.admit(record, attemptRef, result)
            if (disposition == ResultAdmission.ADMIT_CURRENT) {
                revision += 1
                val accepted = projection.admit(
                    snapshot(
                        revision = revision,
                        transitionRefOrNull = "transition.r2.$revision",
                        output = VexOutputState(
                            SemanticRef(STATUS_ATTENTION_ADMITTED),
                            operationRef,
                            disposition,
                        ),
                        instanceRef = outputState.value.instanceRef,
                    ),
                )
                require(accepted == VexProjectionAdmission.EMITTED)
            }
            disposition
        }
    }

    private fun snapshot(
        revision: Long,
        transitionRefOrNull: String?,
        output: VexOutputState,
        instanceRef: String,
    ) = VexStateSnapshot(
        stateRef = STATE_REF,
        instanceRef = instanceRef,
        revision = revision,
        transitionRefOrNull = transitionRefOrNull,
        observation = VexObservation.PRESENT,
        semanticHash = "${output.statusRef.value}|${output.operationRefOrNull?.value ?: "none"}|${output.lastAdmissionOrNull?.semanticRef?.value ?: "none"}",
        valueOrNull = output,
    )

    companion object {
        const val STATE_REF = "state.vexlife.android.r2.output"
        const val STATUS_READY = "output.vexlife.android.r2.ready"
        const val STATUS_ATTENTION_ADMITTED = "output.vexlife.android.r2.attention-admitted"
    }
}

class R2NoEffectOperationExecutor(private val identities: VexIdentityFactory) : OperationExecutor {
    override suspend fun execute(record: OperationRecord, attemptRef: AttemptRef) =
        EffectResult.Success(
            resultRef = identities.newResultRef(record.operationRef),
            operationRef = record.operationRef,
            attemptRef = attemptRef,
            fence = record.fence,
            resultTypeRef = SemanticRef("effect-result.vexlife.android.r2.no-effect/v1"),
        )
}
