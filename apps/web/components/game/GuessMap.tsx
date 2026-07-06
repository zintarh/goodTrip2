"use client";

// Loaded via dynamic import with ssr:false — Leaflet requires the browser DOM.
import { MapContainer, TileLayer, Marker, Polyline, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { useEffect, useState } from "react";

// Classic teardrop map-pin markers matching the app's black/white/purple
// theme (replaces Leaflet's default blue marker images). The anchor sits at
// the pin's tip, not its center, so it points exactly at the clicked coord.
function pinIcon(color: string) {
  const width = 30;
  const height = 42;
  return L.divIcon({
    className: "",
    html: `<svg width="${width}" height="${height}" viewBox="0 0 24 36" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0 2px 3px rgba(0,0,0,0.45));">
      <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24C24 5.4 18.6 0 12 0z" fill="${color}"/>
      <circle cx="12" cy="12" r="5" fill="white"/>
    </svg>`,
    iconSize: [width, height],
    iconAnchor: [width / 2, height],
  });
}

const guessPinIcon = pinIcon("#7C3AED");
const answerPinIcon = pinIcon("#111111");

// Once both pins exist (post-reveal), zoom/pan so the guess, the answer, and
// the line between them are all clearly visible together.
function FitBounds({ guess, answer }: { guess: { lat: number; lng: number } | null; answer: { lat: number; lng: number } | null }) {
  const map = useMap();
  useEffect(() => {
    if (!guess || !answer) return;
    map.fitBounds([[guess.lat, guess.lng], [answer.lat, answer.lng]], { padding: [48, 48], maxZoom: 10 });
  }, [guess, answer, map]);
  return null;
}

// Leaflet caches its container size at mount and doesn't notice when the
// parent (our animated corner widget) grows/shrinks via CSS — without this,
// expanding the map leaves the extra space blank/gray until a manual resize.
function InvalidateSizeOnChange({ watch }: { watch: unknown }) {
  const map = useMap();
  useEffect(() => {
    const timeout = setTimeout(() => map.invalidateSize(), 320); // just past the 300ms CSS transition
    return () => clearTimeout(timeout);
  }, [watch, map]);
  return null;
}

interface Props {
  onGuess: (coords: { lat: number; lng: number }) => void;
  disabled?: boolean;
  answerPin?: { lat: number; lng: number };
  compact?: boolean;
}

function ClickHandler({ onGuess, disabled }: { onGuess: Props["onGuess"]; disabled: boolean }) {
  useMapEvents({
    click(e) {
      if (!disabled) onGuess({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

export default function GuessMap({ onGuess, disabled = false, answerPin, compact = false }: Props) {
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);

  function handleGuess(coords: { lat: number; lng: number }) {
    setPin(coords);
    onGuess(coords);
  }

  // Bare tile.openstreetmap.org is meant for light manual use and can throttle
  // to blank tiles under any real traffic. CARTO's Voyager basemap is free for
  // embedding and — importantly — renders country/region labels even at the
  // world-view zoom level, not just once you zoom in.
  // language=en forces English labels instead of dual local-script/English
  // (e.g. "AFRIKA / أفريقيا") — harmless if a given style ignores it.
  const hasMapTiler = !!process.env.NEXT_PUBLIC_MAPTILER_KEY;
  const tileUrl = hasMapTiler
    ? `https://api.maptiler.com/maps/streets/{z}/{x}/{y}{r}.png?key=${process.env.NEXT_PUBLIC_MAPTILER_KEY}&language=en`
    : "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";

  // MapTiler serves native 512px tiles. With Leaflet's default 256px tileSize,
  // each 512px tile is crammed into a 256px slot — halving the apparent size of
  // every label and making them near-illegible at world view. tileSize 512 +
  // zoomOffset -1 tells Leaflet to render them at their true scale, roughly
  // doubling label size. detectRetina conflicts with a manual tileSize (it
  // rewrites both), so it's off on this path — {r} then resolves to 1x, which
  // is exactly what we want for the largest, most readable labels.
  const tileProps = hasMapTiler
    ? ({ tileSize: 512, zoomOffset: -1 } as const)
    : ({ detectRetina: true } as const);

  return (
    <MapContainer
      center={[20, 0]}
      // Zoom 1 packs the whole world into a couple of tiles, so country/city
      // labels render at a near-illegible size. Starting one level deeper
      // makes labels noticeably bigger and readable, while minZoom={1} still
      // lets a player pinch/scroll out to the full-world view if they want it.
      zoom={2}
      minZoom={1}
      style={{ height: "100%", width: "100%", cursor: disabled ? "default" : "crosshair" }}
      zoomControl
      attributionControl={!compact}
    >
      <TileLayer
        url={tileUrl}
        subdomains="abcd"
        {...tileProps}
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
      />
      <ClickHandler onGuess={handleGuess} disabled={disabled} />
      <InvalidateSizeOnChange watch={compact} />

      {/* Player's guess pin */}
      {pin && <Marker position={[pin.lat, pin.lng]} icon={guessPinIcon} />}

      {/* Answer pin + line to guess (shown after reveal) */}
      {answerPin && (
        <>
          <Marker position={[answerPin.lat, answerPin.lng]} icon={answerPinIcon} />
          {pin && (
            <Polyline
              positions={[[pin.lat, pin.lng], [answerPin.lat, answerPin.lng]]}
              pathOptions={{ color: "#7C3AED", dashArray: "6 4", weight: 2 }}
            />
          )}
          <FitBounds guess={pin} answer={answerPin} />
        </>
      )}
    </MapContainer>
  );
}
