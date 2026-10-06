plugins {
    alias(libs.plugins.androidApplication)
    alias(libs.plugins.composeCompiler)
}

android {
    namespace = "vexlife.android.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.vextreme.vexlife.r2"
        minSdk = 23
        targetSdk = 36
        versionCode = 1
        versionName = "0.0.0-r2-skeleton"
    }

    buildFeatures {
        compose = true
        buildConfig = false
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation(project(":state-relay"))
    implementation(libs.kotlinx.coroutines.core)
    implementation(libs.coroutinesAndroid)
    implementation(platform(libs.composeBom))
    implementation(libs.composeMaterial3)
    implementation(libs.composeUiToolingPreview)
    debugImplementation(libs.composeUiTooling)
    implementation(libs.activityCompose)
    implementation(libs.lifecycleViewModel)
    testImplementation(libs.junit)
}
