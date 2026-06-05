package com.lazydoglab.zhinzen

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.lazydoglab.zhinzen.data.Backend

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Warm the Firebase SDK clients so the first create/join isn't slowed by init.
        Backend.warmUp()
        enableEdgeToEdge()
        setContent {
            ZhinzenApp()
        }
    }
}
