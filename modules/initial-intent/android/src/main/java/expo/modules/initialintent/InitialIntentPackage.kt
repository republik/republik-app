package expo.modules.initialintent

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.os.Bundle
import expo.modules.core.interfaces.Package
import expo.modules.core.interfaces.ReactActivityLifecycleListener
import java.lang.ref.WeakReference

/**
 * Registers an activity lifecycle listener.
 *
 * Autolinking discovers this class by scanning for files named *Package.kt that
 * import expo.modules.core.interfaces.Package, so the file name, the class name
 * and the import below all matter.
 *
 * The listener is created by ReactActivityDelegateWrapper at activity-create
 * time - before the React context exists - which is exactly why it catches the
 * onNewIntent that React Native drops on a cold start. Expo's own OnNewIntent
 * module hook cannot be used for this: it is dispatched through
 * ReactLifecycleDelegate, an ActivityEventListener registered on the React
 * context, so it is only live once that context exists.
 */
class InitialIntentPackage : Package {
  override fun createReactActivityLifecycleListeners(
    activityContext: Context?
  ): List<ReactActivityLifecycleListener> = listOf(InitialIntentLifecycleListener())
}

private class InitialIntentLifecycleListener : ReactActivityLifecycleListener {
  private var activityRef: WeakReference<Activity>? = null

  override fun onCreate(activity: Activity?, savedInstanceState: Bundle?) {
    activityRef = activity?.let { WeakReference(it) }
    IntentBuffer.record(activity?.intent, "onCreate")
  }

  override fun onNewIntent(intent: Intent?): Boolean {
    // The setIntent() React Native never performs, so that a later
    // Linking.getInitialURL() cannot hand back the stale intent either.
    activityRef?.get()?.intent = intent
    IntentBuffer.record(intent, "onNewIntent")
    // false -> every other listener still gets to see this intent
    return false
  }

  override fun onDestroy(activity: Activity?) {
    activityRef = null
  }
}
