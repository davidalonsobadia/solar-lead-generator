// Minimal ambient typings for the Google Maps JS API. We load the API via a
// script tag (no npm package), so only the small surface the demo map uses is
// declared here. Expand this if/when the lead-finding flow needs more of the API.
declare global {
  interface Window {
    google?: typeof google
  }

  namespace google.maps {
    interface LatLngLiteral {
      lat: number
      lng: number
    }

    interface LatLngBoundsLiteral {
      north: number
      south: number
      east: number
      west: number
    }

    interface MapOptions {
      center?: LatLngLiteral
      zoom?: number
      mapTypeId?: string
      disableDefaultUI?: boolean
      zoomControl?: boolean
    }

    class Map {
      constructor(element: HTMLElement, options?: MapOptions)
      fitBounds(bounds: LatLngBoundsLiteral, padding?: number): void
    }

    interface RectangleOptions {
      bounds?: LatLngBoundsLiteral
      map?: Map
      clickable?: boolean
      strokeColor?: string
      strokeOpacity?: number
      strokeWeight?: number
      fillColor?: string
      fillOpacity?: number
      zIndex?: number
    }

    class Rectangle {
      constructor(options?: RectangleOptions)
      setMap(map: Map | null): void
    }
  }
}

export {}
