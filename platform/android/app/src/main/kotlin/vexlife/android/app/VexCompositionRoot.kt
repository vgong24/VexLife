package vexlife.android.app

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import vexlife.android.identity.GeneratedCanonicalRefs
import vexlife.android.architecture.AndroidVexDispatchers
import vexlife.android.architecture.PrincipalSessionFence
import vexlife.android.architecture.ProcessLocalR2IdentityFactory
import vexlife.android.architecture.R2ArchitectureSurfacePolicy
import vexlife.android.architecture.R2NoEffectOperationExecutor
import vexlife.android.architecture.SystemVexClock
import vexlife.android.architecture.VexClock
import vexlife.android.architecture.VexDispatchers
import vexlife.android.architecture.VexIdentityFactory
import vexlife.android.architecture.VexRuntimeWitness

class VexCompositionRoot(
    private val dispatchers: VexDispatchers = AndroidVexDispatchers,
    private val clock: VexClock = SystemVexClock,
    private val identities: VexIdentityFactory = ProcessLocalR2IdentityFactory(),
) {
    private val executor = R2NoEffectOperationExecutor(identities)
    private val runtime = VexRuntimeWitness(executor, clock, identities)
    private val surfacePolicy = R2ArchitectureSurfacePolicy(GeneratedCanonicalRefs.statusElement)
    private val fence = PrincipalSessionFence(
        GeneratedCanonicalRefs.localPrincipal,
        GeneratedCanonicalRefs.presentationSession,
    )

    fun viewModelFactory(): ViewModelProvider.Factory =
        object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T {
                require(modelClass == VexAppViewModel::class.java)
                return VexAppViewModel(runtime, surfacePolicy, fence, dispatchers) as T
            }
        }
}
