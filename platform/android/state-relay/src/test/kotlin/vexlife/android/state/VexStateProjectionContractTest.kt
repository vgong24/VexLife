package vexlife.android.state

import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotSame

class VexStateProjectionContractTest {
    private fun snapshot(
        stateRef: String = "state.test",
        instanceRef: String = "instance.1",
        revision: Long = 0,
        transitionRefOrNull: String? = null,
        observation: VexObservation = VexObservation.PRESENT,
        semanticHash: String = "hash.a",
        value: MutableList<String>? = mutableListOf("a"),
    ) = VexStateSnapshot(
        stateRef = stateRef,
        instanceRef = instanceRef,
        revision = revision,
        transitionRefOrNull = transitionRefOrNull,
        observation = observation,
        semanticHash = semanticHash,
        valueOrNull = value,
    )

    private fun projection(initial: VexStateSnapshot<MutableList<String>>) = VexStateProjection(initial) { value ->
        value?.toMutableList()
    }

    @Test
    fun `observation vocabulary maps canonical A1 truth exactly`() {
        assertEquals(
            listOf("UNOBSERVED", "EMPTY", "PRESENT", "HELD", "UNAVAILABLE"),
            VexObservation.entries.map { it.name },
        )
    }

    @Test
    fun `projection exposes read-only latest StateFlow and retains copied values`() {
        val callerOwned = mutableListOf("a")
        val projection = projection(snapshot(value = callerOwned))
        callerOwned += "mutated"

        assertEquals(listOf("a"), projection.state.value.valueOrNull?.toList())
        assertNotSame(callerOwned, projection.state.value.valueOrNull)
    }

    @Test
    fun `state value exposure cannot mutate retained snapshot`() {
        val projection = projection(snapshot())
        val exposed = requireNotNull(projection.state.value.valueOrNull)
        exposed += "consumer mutation"

        val reread = projection.state.value
        assertEquals(listOf("a"), reread.valueOrNull?.toList())
        assertEquals("hash.a", reread.semanticHash)
        assertEquals(0L, reread.revision)
        assertEquals(null, reread.transitionRefOrNull)
        assertNotSame(exposed, reread.valueOrNull)
    }

    @Test
    fun `stateflow replay cache returns a defensive snapshot copy`() {
        val projection = projection(snapshot())
        val replayed = requireNotNull(projection.state.replayCache.single().valueOrNull)
        replayed += "replay mutation"

        val reread = projection.state.value
        assertEquals(listOf("a"), reread.valueOrNull?.toList())
        assertEquals("hash.a", reread.semanticHash)
        assertEquals(0L, reread.revision)
        assertEquals(null, reread.transitionRefOrNull)
        assertNotSame(replayed, reread.valueOrNull)
    }

    @Test
    fun `stateflow collectors receive defensive snapshot copies`() = runBlocking {
        val projection = projection(snapshot())
        val collected = projection.state.first()
        val exposed = requireNotNull(collected.valueOrNull)
        exposed += "collector mutation"

        val reread = projection.state.value
        assertEquals(listOf("a"), reread.valueOrNull?.toList())
        assertEquals("hash.a", reread.semanticHash)
        assertEquals(0L, reread.revision)
        assertEquals(null, reread.transitionRefOrNull)
        assertNotSame(exposed, reread.valueOrNull)
    }

    @Test
    fun `semantic no-op without a distinct transition does not re-emit`() {
        val projection = projection(snapshot())
        val result = projection.admit(snapshot(revision = 1, value = mutableListOf("a")))

        assertEquals(VexProjectionAdmission.SUPPRESSED_SEMANTIC_NO_OP, result)
        assertEquals(0L, projection.state.value.revision)
    }

    @Test
    fun `same value with a distinct explicit transition remains observable`() {
        val projection = projection(snapshot())
        val result = projection.admit(
            snapshot(
                revision = 1,
                transitionRefOrNull = "transition.same-value.1",
                value = mutableListOf("a"),
            ),
        )

        assertEquals(VexProjectionAdmission.EMITTED, result)
        assertEquals(1L, projection.state.value.revision)
        assertEquals("transition.same-value.1", projection.state.value.transitionRefOrNull)
    }

    @Test
    fun `reinstance changes instance identity without retaining an event ledger`() {
        val projection = projection(snapshot())
        val result = projection.admit(
            snapshot(
                instanceRef = "instance.2",
                revision = 1,
                transitionRefOrNull = "transition.reinstance",
                value = mutableListOf("a"),
            ),
        )

        assertEquals(VexProjectionAdmission.EMITTED, result)
        assertEquals("instance.2", projection.state.value.instanceRef)
        assertEquals(1L, projection.state.value.revision)
    }

    @Test
    fun `older revision from the current instance is received but not admitted`() {
        val projection = projection(snapshot(revision = 2, transitionRefOrNull = "transition.2"))
        val result = projection.admit(snapshot(revision = 1, transitionRefOrNull = "transition.1"))

        assertEquals(VexProjectionAdmission.REJECTED_STALE_REVISION, result)
        assertEquals(2L, projection.state.value.revision)
    }

    @Test
    fun `same revision with contradictory semantic identity fails closed`() {
        val projection = projection(snapshot(revision = 2, transitionRefOrNull = "transition.2"))
        val result = projection.admit(
            snapshot(
                revision = 2,
                transitionRefOrNull = "transition.2",
                semanticHash = "hash.changed",
                value = mutableListOf("changed"),
            ),
        )

        assertEquals(VexProjectionAdmission.REJECTED_CONTRADICTORY_REVISION, result)
        assertEquals("hash.a", projection.state.value.semanticHash)
    }

    @Test
    fun `wrong canonical state ref is rejected instead of silently remapped`() {
        val projection = projection(snapshot())
        assertFailsWith<IllegalArgumentException> {
            projection.admit(snapshot(stateRef = "state.other", revision = 1))
        }
    }

    @Test
    fun `accepted values are copied so later caller mutation cannot change retained snapshot`() {
        val projection = projection(snapshot())
        val next = mutableListOf("b")
        val result = projection.admit(
            snapshot(
                revision = 1,
                transitionRefOrNull = "transition.b",
                semanticHash = "hash.b",
                value = next,
            ),
        )
        next += "mutated"

        assertEquals(VexProjectionAdmission.EMITTED, result)
        assertEquals(listOf("b"), projection.state.value.valueOrNull?.toList())
    }
}

// [VXG RealForever]
