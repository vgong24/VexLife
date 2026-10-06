import org.gradle.api.initialization.resolve.RepositoriesMode

pluginManagement {
    repositories {
        google()
        gradlePluginPortal()
        mavenCentral()
    }
}

val kotlinPersistentDir = rootDir.resolve("../../generated/android-gradle/kotlin-persistent").canonicalFile
check(kotlinPersistentDir.mkdirs() || kotlinPersistentDir.isDirectory) {
    "Unable to create Kotlin persistent project directory: $kotlinPersistentDir"
}
val kotlinPersistentSessions = kotlinPersistentDir.resolve("sessions")
check(kotlinPersistentSessions.mkdirs() || kotlinPersistentSessions.isDirectory) {
    "Unable to create Kotlin compiler sessions directory: $kotlinPersistentSessions"
}

gradle.beforeProject {
    extensions.extraProperties.apply {
        set("kotlin.project.persistent.dir", kotlinPersistentDir.absolutePath)
        set("kotlin.user.home", kotlinPersistentDir.absolutePath)
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "vexlife-android"
include(":state-relay")
include(":app")
