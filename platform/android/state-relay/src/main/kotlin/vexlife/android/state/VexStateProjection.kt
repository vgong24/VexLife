package vexlife.android.state

import kotlinx.coroutines.ExperimentalForInheritanceCoroutinesApi
import kotlinx.coroutines.flow.FlowCollector
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/** Exact Android projection of the canonical observation vocabulary. */
enum class VexObservation {
    UNOBSERVED,
    EMPTY,
    PRESENT,
    HELD,
    UNAVAILABLE,
}

/**
 * Immutable identity-bearing projection of a canonical VexLife state snapshot.
 * `semanticHash` is supplied by the canonical State Relay; Android does not
 * redefine its hashing or transition meaning.
 */
data class VexStateSnapshot<T>(
    val stateRef: String,
    val instanceRef: String,
    val revision: Long,
    val transitionRefOrNull: String?,
    val observation: VexObservation,
    val semanticHash: String,
    val valueOrNull: T?,
) {
    init {
        require(stateRef.isNotBlank()) { "stateRef must be non-blank" }
        require(instanceRef.isNotBlank()) { "instanceRef must be non-blank" }
        require(revision >= 0L) { "revision must be non-negative" }
        require(transitionRefOrNull == null || transitionRefOrNull.isNotBlank()) {
            "transitionRefOrNull must be null or non-blank"
        }
        require(semanticHash.isNotBlank()) { "semanticHash must be non-blank" }
    }
}

enum class VexProjectionAdmission {
    EMITTED,
    SUPPRESSED_SEMANTIC_NO_OP,
    REJECTED_STALE_REVISION,
    REJECTED_CONTRADICTORY_REVISION,
}

@OptIn(ExperimentalForInheritanceCoroutinesApi::class)
private class DefensiveCopyStateFlow<T>(
    private val source: StateFlow<VexStateSnapshot<T>>,
    private val expose: (VexStateSnapshot<T>) -> VexStateSnapshot<T>,
) : StateFlow<VexStateSnapshot<T>> {
    override val replayCache: List<VexStateSnapshot<T>>
        get() = listOf(value)

    override val value: VexStateSnapshot<T>
        get() = expose(source.value)

    override suspend fun collect(collector: FlowCollector<VexStateSnapshot<T>>): Nothing =
        source.collect(
            object : FlowCollector<VexStateSnapshot<T>> {
                override suspend fun emit(value: VexStateSnapshot<T>) {
                    collector.emit(expose(value))
                }
            },
        )
}

/**
 * Latest-state adapter only. It intentionally stores no transition ledger.
 * Caller-provided [copyValue] is mandatory so mutable platform values cannot
 * retain ownership of previously admitted snapshots.
 */
class VexStateProjection<T>(
    initial: VexStateSnapshot<T>,
    private val copyValue: (T?) -> T?,
) {
    private val lock = Any()
    private val stateRef = initial.stateRef
    private val mutableState = MutableStateFlow(retain(initial))

    val state: StateFlow<VexStateSnapshot<T>> = DefensiveCopyStateFlow(
        source = mutableState.asStateFlow(),
        expose = ::expose,
    )

    fun admit(received: VexStateSnapshot<T>): VexProjectionAdmission = synchronized(lock) {
        require(received.stateRef == stateRef) {
            "stateRef mismatch: ${received.stateRef} != $stateRef"
        }

        val current = mutableState.value
        if (received.instanceRef == current.instanceRef) {
            if (received.revision < current.revision) {
                return@synchronized VexProjectionAdmission.REJECTED_STALE_REVISION
            }
            if (received.revision == current.revision) {
                return@synchronized if (sameSnapshotIdentity(current, received)) {
                    VexProjectionAdmission.SUPPRESSED_SEMANTIC_NO_OP
                } else {
                    VexProjectionAdmission.REJECTED_CONTRADICTORY_REVISION
                }
            }
        }

        if (isSemanticNoOpWithoutDistinctTransition(current, received)) {
            return@synchronized VexProjectionAdmission.SUPPRESSED_SEMANTIC_NO_OP
        }

        mutableState.value = retain(received)
        VexProjectionAdmission.EMITTED
    }

    private fun retain(snapshot: VexStateSnapshot<T>): VexStateSnapshot<T> = snapshot.copy(
        valueOrNull = copyValue(snapshot.valueOrNull),
    )

    private fun expose(snapshot: VexStateSnapshot<T>): VexStateSnapshot<T> = snapshot.copy(
        valueOrNull = copyValue(snapshot.valueOrNull),
    )

    private fun sameSnapshotIdentity(
        left: VexStateSnapshot<T>,
        right: VexStateSnapshot<T>,
    ): Boolean =
        left.instanceRef == right.instanceRef &&
            left.revision == right.revision &&
            left.transitionRefOrNull == right.transitionRefOrNull &&
            left.observation == right.observation &&
            left.semanticHash == right.semanticHash

    private fun isSemanticNoOpWithoutDistinctTransition(
        current: VexStateSnapshot<T>,
        received: VexStateSnapshot<T>,
    ): Boolean {
        if (received.instanceRef != current.instanceRef) return false
        if (received.observation != current.observation) return false
        if (received.semanticHash != current.semanticHash) return false

        val transition = received.transitionRefOrNull
        val distinctExplicitTransition = transition != null && transition != current.transitionRefOrNull
        return !distinctExplicitTransition
    }
}

// [VXG RealForever]
