package vexlife.android.app

import androidx.lifecycle.ViewModel
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import vexlife.android.identity.GeneratedCanonicalRefs
import vexlife.android.architecture.PrincipalSessionFence
import vexlife.android.architecture.RequestConversationAttention
import vexlife.android.architecture.SurfacePolicy
import vexlife.android.architecture.VexDispatchers
import vexlife.android.architecture.VexRuntimeWitness

class VexAppViewModel(
    private val runtime: VexRuntimeWitness,
    private val surfacePolicy: SurfacePolicy,
    private val fence: PrincipalSessionFence,
    dispatchers: VexDispatchers,
) : ViewModel() {
    private val attemptJob: Job = SupervisorJob()
    private val presentationAttemptScope = CoroutineScope(attemptJob + dispatchers.main)

    val viewState = runtime.outputState
        .map { snapshot -> surfacePolicy.present(requireNotNull(snapshot.valueOrNull)) }
        .stateIn(
            presentationAttemptScope,
            SharingStarted.Eagerly,
            surfacePolicy.present(requireNotNull(runtime.outputState.value.valueOrNull)),
        )

    fun requestConversationAttention() {
        presentationAttemptScope.launch {
            runtime.submit(
                RequestConversationAttention(GeneratedCanonicalRefs.architectureSurface),
                fence,
            )
        }
    }

    override fun onCleared() {
        presentationAttemptScope.cancel()
    }
}
