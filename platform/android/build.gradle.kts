plugins {
    alias(libs.plugins.kotlin.jvm) apply false
}

allprojects {
    layout.buildDirectory.set(
        rootProject.layout.projectDirectory.dir("../../generated/android-gradle/${project.name}"),
    )
}

// [VXG RealForever]
