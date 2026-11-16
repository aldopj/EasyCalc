/**
 * Triggers subtle tactile haptic feedback when supported (e.g. mobile PWAs).
 * Silently no-ops on unsupported browsers or platforms.
 */
export function triggerHaptic(durationMs = 8) {
  try {
    if (
      typeof navigator !== 'undefined' &&
      typeof navigator.vibrate === 'function'
    ) {
      navigator.vibrate(durationMs);
    }
  } catch {
    // Ignore vibration errors in restricted contexts
  }
}
