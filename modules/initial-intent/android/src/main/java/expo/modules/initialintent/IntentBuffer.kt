package expo.modules.initialintent

import android.content.Intent
import android.os.Bundle
import androidx.core.os.bundleOf

/**
 * Process-wide buffer of the intents MainActivity received.
 *
 * Why this exists: on a cold start where the OS killed the process but kept the
 * task in Recents, Android recreates MainActivity with the *task's stored*
 * intent (the link that originally created the task) and delivers the fresh
 * VIEW intent through onNewIntent. That happens long before the JS bundle is
 * loaded, and React Native's bridgeless ReactHostImpl.onNewIntent returns early
 * while the ReactContext is still null - it neither emits the "url" event nor
 * calls Activity.setIntent(). Linking.getInitialURL() therefore keeps returning
 * the stale link for as long as the task record survives.
 *
 * This object is static, so it is alive from the moment the Activity is created
 * and captures the intent React Native drops.
 */
object IntentBuffer {
  data class Record(
    val url: String?,
    val source: String,
    val fromHistory: Boolean,
    val at: Long
  ) {
    fun toBundle(): Bundle = bundleOf(
      "url" to url,
      "source" to source,
      "fromHistory" to fromHistory,
      "at" to at.toDouble()
    )
  }

  private val records = mutableListOf<Record>()

  fun describe(intent: Intent?, source: String): Record {
    val flags = intent?.flags ?: 0
    val fromHistory = (flags and Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) != 0
    val url = intent?.takeIf { it.action == Intent.ACTION_VIEW }?.dataString
    return Record(url, source, fromHistory, System.currentTimeMillis())
  }

  @Synchronized
  fun record(intent: Intent?, source: String) {
    records.add(describe(intent, source))
  }

  @Synchronized
  fun drain(): List<Record> {
    val drained = records.toList()
    records.clear()
    return drained
  }
}
