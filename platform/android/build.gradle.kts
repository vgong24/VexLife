plugins {
    alias(libs.plugins.androidApplication) apply false
    alias(libs.plugins.composeCompiler) apply false
    alias(libs.plugins.kotlin.jvm) apply false
}

allprojects {
    group = "vexlife.android"
    version = "0.0.0-r2-skeleton"
    layout.buildDirectory.set(
        rootProject.layout.projectDirectory.dir("../../generated/android-gradle/${project.name}"),
    )
}
