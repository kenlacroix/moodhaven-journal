import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Read version from the same tauri.properties used by the phone app so both
// APKs always share the same versionCode (required: same applicationId).
val tauriProperties = Properties().apply {
    val propFile = rootProject.file("app/tauri.properties")
    if (propFile.exists()) propFile.inputStream().use { load(it) }
}

// Release signing — reads keystore from environment variables set in CI.
// Falls back gracefully so debug builds work without any env vars.
val keystoreBase64 = System.getenv("ANDROID_KEYSTORE_BASE64")
val keystoreFile = if (keystoreBase64 != null) {
    val f = rootProject.file("keystore-wear.jks")
    f.writeBytes(java.util.Base64.getDecoder().decode(keystoreBase64))
    f
} else null

android {
    namespace = "com.moodbloom.wear"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.moodbloom.app"
        minSdk = 30
        targetSdk = 34
        versionCode = tauriProperties.getProperty("tauri.android.versionCode", "1").toInt()
        versionName = tauriProperties.getProperty("tauri.android.versionName", "0.5.0")
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        buildConfig = true
    }

    signingConfigs {
        if (keystoreFile != null) {
            create("release") {
                storeFile = keystoreFile
                storePassword = System.getenv("ANDROID_STORE_PASSWORD") ?: ""
                keyAlias = System.getenv("ANDROID_KEY_ALIAS") ?: ""
                keyPassword = System.getenv("ANDROID_KEY_PASSWORD") ?: ""
            }
        }
    }

    buildTypes {
        debug {
            isDebuggable = true
        }
        release {
            isMinifyEnabled = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
            if (keystoreFile != null) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }
}

dependencies {
    // Wear OS View-based UI (WearableRecyclerView, WearableLinearLayoutManager)
    implementation("androidx.wear:wear:1.3.0")

    // Wear OS Data Layer (MessageClient / NodeClient)
    implementation("com.google.android.gms:play-services-wearable:18.2.0")

    // Coroutines
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-play-services:1.8.1")

    // Lifecycle (lifecycleScope on FragmentActivity)
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.7.0")

    // Activity / Fragment KTX: required for registerForActivityResult() and
    // ActivityResultContracts in Fragment subclasses.
    implementation("androidx.activity:activity-ktx:1.9.0")
    implementation("androidx.fragment:fragment-ktx:1.8.0")

    // Guava ListenableFuture bridge for coroutines (used by TileService)
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-guava:1.8.1")

    // ViewPager2 for swipe navigation between pages
    implementation("androidx.viewpager2:viewpager2:1.1.0")

    // Wear OS Tiles (quick-access tile swiped from watch face)
    implementation("androidx.wear.tiles:tiles:1.4.1")
    implementation("androidx.wear.protolayout:protolayout:1.2.1")
    implementation("androidx.wear.protolayout:protolayout-material:1.2.1")

    // Watch face complications (data source provider)
    implementation("androidx.wear.watchface:watchface-complications-data-source:1.2.1")
    implementation("androidx.wear.watchface:watchface-complications-data-source-ktx:1.2.1")
}
