package vexlife.android.presentation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Card
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import vexlife.android.app.R

object VexDesignLabRefs {
    const val REGISTRY_REF: String = "registry.vexlife.android-design-lab.001"
    const val SURFACE_REF: String = "surface.vexlife.android.design-lab.001"
    const val PRESENTATION_REF: String = "presentation.vexlife.android.design-lab"
    const val DOORWAY_COMPONENT_REF: String = "component.vexlife.action-vessel"
    const val DOORWAY_ELEMENT_REF: String = "element.vexlife.android.design-lab.fab"
    const val DOORWAY_ACTION_REF: String = "action.vexlife.design-lab.open"
    const val SPECIMEN_REF: String = "specimen.vexlife.design-lab.vex-button.001"
    const val BUTTON_COMPONENT_REF: String = "component.vexlife.design-lab.vex-button"
    const val BUTTON_ELEMENT_REF: String = "element.vexlife.design-lab.specimen.vex-button"
    const val BUTTON_ACTION_REF: String = "action.vexlife.design-lab.specimen.button.increment"
    const val OUTPUT_CONSOLE_ELEMENT_REF: String = "element.vexlife.design-lab.output-console"
    const val OUTPUT_RESULT: String = "ADMITTED_LOCAL_FIXTURE"
    const val PRESENTATION_EVENT: String = "DESIGN_LAB_LOCAL_SPECIMEN_ACTION"
}

data class VexDesignLabReceipt(
    val actionRequested: Boolean,
    val elementRef: String,
    val actionRef: String,
    val itemRefOrNull: String?,
    val operationRefOrNull: String?,
    val preRevision: Int,
    val result: String,
    val postRevision: Int,
    val presentationEvent: String,
)

fun nextVexButtonReceipt(preRevision: Int): VexDesignLabReceipt =
    VexDesignLabReceipt(
        actionRequested = true,
        elementRef = VexDesignLabRefs.BUTTON_ELEMENT_REF,
        actionRef = VexDesignLabRefs.BUTTON_ACTION_REF,
        itemRefOrNull = null,
        operationRefOrNull = null,
        preRevision = preRevision,
        result = VexDesignLabRefs.OUTPUT_RESULT,
        postRevision = preRevision + 1,
        presentationEvent = VexDesignLabRefs.PRESENTATION_EVENT,
    )

private data class DesignLabSectionSpec(
    val sectionRef: String,
    val labelRes: Int,
    val current: Boolean,
)

private val designLabSections = listOf(
        DesignLabSectionSpec("section.vexlife.design-lab.play", R.string.design_lab_section_play, false),
        DesignLabSectionSpec("section.vexlife.design-lab.building-blocks", R.string.design_lab_section_building_blocks, true),
        DesignLabSectionSpec("section.vexlife.design-lab.tokens-themes", R.string.design_lab_section_tokens_themes, false),
        DesignLabSectionSpec("section.vexlife.design-lab.inspect", R.string.design_lab_section_inspect, false),
)

@Composable
fun VexDesignLabDoorwayFab(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    VexFab(
        elementRef = VexDesignLabRefs.DOORWAY_ELEMENT_REF,
        actionRef = VexDesignLabRefs.DOORWAY_ACTION_REF,
        onClick = onClick,
        modifier = modifier,
    ) {
        Icon(
            painter = painterResource(R.drawable.ic_vex_design_lab),
            contentDescription = stringResource(R.string.design_lab_open),
        )
    }
}

@Composable
fun VexDesignLabSurface(onClose: () -> Unit) {
    var revision by remember { mutableIntStateOf(0) }
    var receipt by remember { mutableStateOf<VexDesignLabReceipt?>(null) }

    Surface(
        modifier = Modifier
            .fillMaxSize()
            .testTag(VexDesignLabRefs.PRESENTATION_REF),
    ) {
        Column(
            verticalArrangement = Arrangement.spacedBy(20.dp),
            modifier = Modifier
                .safeDrawingPadding()
                .verticalScroll(rememberScrollState())
                .padding(24.dp),
        ) {
            Row(
                horizontalArrangement = Arrangement.SpaceBetween,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(
                    text = stringResource(R.string.design_lab_title),
                    style = MaterialTheme.typography.headlineMedium,
                )
                TextButton(onClick = onClose) {
                    Text(stringResource(R.string.design_lab_close))
                }
            }

            designLabSections.forEach { section ->
                Column(
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.testTag(section.sectionRef),
                ) {
                    Text(
                        text = stringResource(section.labelRes),
                        style = MaterialTheme.typography.titleMedium,
                    )
                    if (section.current) {
                        Text(
                            text = stringResource(R.string.design_lab_vex_button),
                            style = MaterialTheme.typography.titleSmall,
                        )
                        Card(
                            modifier = Modifier
                                .fillMaxWidth()
                                .testTag(VexDesignLabRefs.BUTTON_ELEMENT_REF),
                        ) {
                            Column(
                                verticalArrangement = Arrangement.spacedBy(8.dp),
                                modifier = Modifier.padding(16.dp),
                            ) {
                                VexButton(
                            semanticRef = VexDesignLabRefs.BUTTON_ACTION_REF,
                            label = stringResource(R.string.design_lab_vex_button_action),
                            onClick = {
                                val next = nextVexButtonReceipt(revision)
                                revision = next.postRevision
                                receipt = next
                            },
                                )
                            }
                        }
                        OutputConsole(receipt)
                    } else {
                        Text(
                            text = stringResource(R.string.design_lab_held_later),
                            style = MaterialTheme.typography.bodyMedium,
                        )
                    }
                }
                HorizontalDivider()
            }
        }
    }
}

@Composable
private fun OutputConsole(receipt: VexDesignLabReceipt?) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .testTag(VexDesignLabRefs.OUTPUT_CONSOLE_ELEMENT_REF),
    ) {
        Column(
            verticalArrangement = Arrangement.spacedBy(4.dp),
            modifier = Modifier.padding(16.dp),
        ) {
            Text(
                text = stringResource(R.string.design_lab_output_console),
                style = MaterialTheme.typography.titleSmall,
            )
            if (receipt == null) {
                Text(stringResource(R.string.design_lab_output_waiting))
            } else {
                Text("${stringResource(R.string.design_lab_output_action_requested)}=${receipt.actionRequested}")
                Text("${stringResource(R.string.design_lab_output_element)}=${receipt.elementRef}")
                Text("${stringResource(R.string.design_lab_output_action)}=${receipt.actionRef}")
                Text("${stringResource(R.string.design_lab_output_pre_revision)}=${receipt.preRevision}")
                Text("${stringResource(R.string.design_lab_output_result)}=${receipt.result}")
                Text("${stringResource(R.string.design_lab_output_post_revision)}=${receipt.postRevision}")
                Text("${stringResource(R.string.design_lab_output_presentation_event)}=${receipt.presentationEvent}")
            }
        }
    }
}
