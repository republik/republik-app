package expo.modules.initialintent

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class InitialIntentModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("InitialIntent")

    AsyncFunction("drainIntents") {
      val records = IntentBuffer.drain().toMutableList()
      // Always append whatever intent the activity currently holds. It is both
      // a diagnostic and the graceful degradation path: if the lifecycle
      // listener never ran, this still exposes
      // FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY so JS can avoid reopening a stale
      // link.
      appContext.currentActivity?.let { activity ->
        records.add(IntentBuffer.describe(activity.intent, "current"))
      }
      records.map { it.toBundle() }
    }
  }
}
