// Shared loader for the Google Maps JS API. We bootstrap the API via a script
// tag (no npm package), so the load is global and must happen at most once —
// React Strict Mode mounts effects twice in development and components remount.
let mapsScriptPromise: Promise<void> | null = null

/** Load the Google Maps JS API once, resolving when `window.google.maps` is ready. */
export function loadGoogleMaps(apiKey: string): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google Maps can only load in the browser"))
  }
  // Already available (e.g. after a client-side navigation back to a map screen).
  if (window.google?.maps) {
    return Promise.resolve()
  }
  if (mapsScriptPromise) {
    return mapsScriptPromise
  }

  mapsScriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script")
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly`
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => {
      // Allow a later mount to retry the load.
      mapsScriptPromise = null
      reject(new Error("Failed to load the Google Maps script"))
    }
    document.head.appendChild(script)
  })

  return mapsScriptPromise
}
