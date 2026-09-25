package expo.modules.androidintentfix

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.os.Bundle
import expo.modules.core.interfaces.Package
import expo.modules.core.interfaces.ReactActivityLifecycleListener

/**
 * Workaround for Linking.getInitialURL() returning a stale deep link on Android.
 *
 * MainActivity is singleTask. When the OS kills the process but keeps the task,
 * tapping a link recreates MainActivity with the task's original intent and
 * delivers the new link via onNewIntent. React Native's ReactHostImpl.onNewIntent
 * drops that intent while the React context is not ready and never calls
 * setIntent(), so getInitialURL() keeps returning the old link.
 *
 * Remove once React Native updates the activity intent itself.
 */
class AndroidIntentFixPackage : Package {
  override fun createReactActivityLifecycleListeners(
    activityContext: Context?
  ): List<ReactActivityLifecycleListener> =
    listOfNotNull((activityContext as? Activity)?.let { IntentFixListener(it) })
}

private class IntentFixListener(private val activity: Activity) : ReactActivityLifecycleListener {
  override fun onCreate(activity: Activity?, savedInstanceState: Bundle?) {
    val intent = this.activity.intent ?: return
    val fromHistory = (intent.flags and Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) != 0
    // Relaunched from Recents after process death: the intent is the task's
    // original one, so its link is stale. Drop the data and let the app
    // restore the last visited page instead.
    if (fromHistory && intent.data != null) {
      this.activity.intent = Intent(intent).setData(null)
    }
  }

  override fun onNewIntent(intent: Intent?): Boolean {
    if (intent != null) {
      activity.intent = intent
    }
    // let React Native handle the intent as usual (emits the "url" event when ready)
    return false
  }
}
