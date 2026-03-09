plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.moodbloom.wear"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.moodbloom.wear"
        minSdk = 30
        targetSdk = 34
        versionCode = 1
        versionName = "0.5.0"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
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
}
