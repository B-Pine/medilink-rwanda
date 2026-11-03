import "leaflet/dist/leaflet.css";

import L from "leaflet";
import { useEffect, useRef } from "react";

import { cx } from "../utils/cx";

export interface LocationPickerProps {
  /** The pin, or null before one is placed. */
  value: { lat: number; lng: number } | null;
  /** A tap on the map or the end of a drag places the pin (6 decimals). */
  onChange: (value: { lat: number; lng: number }) => void;
  /** Tile URL template, e.g. `https://tile.openstreetmap.org/{z}/{x}/{y}.png` (OD-3). */
  tilesUrl: string;
  attribution: string;
  /** Accessible name of the map region. */
  label: string;
  /** Accessible name of the pin, e.g. "Facility entrance". */
  pinLabel: string;
  className?: string;
}

/** Rwanda, for the first view before a pin is placed. */
const RWANDA: L.LatLngBoundsExpression = [
  [-2.84, 28.86],
  [-1.05, 30.9],
];

const round = (value: number) => Number(value.toFixed(6));

/**
 * Place one pin on a map (facility application, 2026-11-03): tap the map or drag the pin. Loaded
 * on its own (`@medilink/ui/map-picker`). The form beside it keeps latitude and longitude fields
 * as the keyboard alternative.
 */
export default function LocationPicker({
  value,
  onChange,
  tilesUrl,
  attribution,
  label,
  pinLabel,
  className,
}: LocationPickerProps) {
  const node = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const pin = useRef<L.Marker | null>(null);
  const change = useRef(onChange);
  useEffect(() => {
    change.current = onChange;
  });

  useEffect(() => {
    if (!node.current) return;
    const instance = L.map(node.current, { zoomControl: true, attributionControl: true });
    instance.fitBounds(RWANDA);
    L.tileLayer(tilesUrl, { attribution, maxZoom: 19 }).addTo(instance);
    instance.on("click", (event: L.LeafletMouseEvent) =>
      change.current({ lat: round(event.latlng.lat), lng: round(event.latlng.lng) }),
    );
    map.current = instance;
    return () => {
      instance.remove();
      map.current = null;
      pin.current = null;
    };
  }, [tilesUrl, attribution]);

  // The pin follows `value`; the first pin (and a pin typed far away) brings the view to it.
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    if (!value) {
      pin.current?.remove();
      pin.current = null;
      return;
    }
    if (!pin.current) {
      pin.current = L.marker([value.lat, value.lng], {
        draggable: true,
        keyboard: true,
        title: pinLabel,
        alt: pinLabel,
        icon: L.divIcon({
          className: "",
          html: '<span class="ml-pin ml-pin--clinic ml-pin--selected"></span>',
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        }),
      })
        .on("dragend", (event) => {
          const at = (event.target as L.Marker).getLatLng();
          change.current({ lat: round(at.lat), lng: round(at.lng) });
        })
        .addTo(instance);
    } else {
      pin.current.setLatLng([value.lat, value.lng]);
    }
    if (!instance.getBounds().contains([value.lat, value.lng]))
      instance.setView([value.lat, value.lng], 16);
    else if (instance.getZoom() < 14) instance.setView([value.lat, value.lng], 16);
  }, [value, pinLabel]);

  return (
    <div
      className={cx(
        "relative isolate h-72 overflow-hidden rounded-3xl bg-subtle shadow-card",
        className,
      )}
    >
      <div ref={node} role="region" aria-label={label} className="absolute inset-0" />
    </div>
  );
}
