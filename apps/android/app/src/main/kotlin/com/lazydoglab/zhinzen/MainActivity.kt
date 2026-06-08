package com.lazydoglab.zhinzen

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import com.google.android.gms.maps.MapsInitializer
import com.lazydoglab.zhinzen.data.Backend

class MainActivity : ComponentActivity() {
    // Hoist the VM to the activity so deep links can be delivered to the same instance.
    private val viewModel: AppViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Force the LEGACY Maps renderer. The LATEST renderer is delivered via Play
        // Services and fails to draw custom bitmap markers on some devices (e.g. Sony
        // A13 with a flaky GMS broker) — the map tiles show but markers don't. LEGACY
        // is bundled in the SDK and reliable across devices; we don't use cloud styling.
        MapsInitializer.initialize(applicationContext, MapsInitializer.Renderer.LEGACY) { }
        // Warm the Firebase SDK clients so the first create/join isn't slowed by init.
        Backend.warmUp()
        viewModel.handleDeepLink(intent?.dataString)
        enableEdgeToEdge()
        setContent {
            ZhinzenApp(viewModel)
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        viewModel.handleDeepLink(intent.dataString)
    }
}
