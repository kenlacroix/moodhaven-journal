plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.moodbloom.wear"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.moodbloom.app"
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
