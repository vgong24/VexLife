package vexlife.android.presentation

import androidx.compose.foundation.layout.Box
import androidx.compose.material3.Button
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag

@Composable
fun VexButton(
    semanticRef: String,
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Button(
        onClick = onClick,
        modifier = modifier.testTag(semanticRef),
    ) { Text(label) }
}

@Composable
fun VexFab(
    elementRef: String,
    actionRef: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    Box(modifier = modifier.testTag(elementRef)) {
        FloatingActionButton(
            onClick = onClick,
            modifier = Modifier.testTag(actionRef),
        ) { content() }
    }
}
