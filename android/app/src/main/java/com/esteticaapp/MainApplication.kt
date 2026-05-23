package com.esteticaapp

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.proyecto26.inappbrowser.RNInAppBrowserPackage
import com.rnfs.RNFSPackage
import io.invertase.notifee.NotifeePackage
import org.reactnative.maskedview.RNCMaskedViewPackage

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          add(NotifeePackage())
          add(RNCMaskedViewPackage())
          add(RNFSPackage())
          add(RNInAppBrowserPackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
  }
}
