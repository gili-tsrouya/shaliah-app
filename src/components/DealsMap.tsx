import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { FeedItem } from '../lib/types'

// OpenStreetMap with the home location, the search radius and a price pin for every find that has coordinates
export function DealsMap({ home, rangeMiles, items, selected, onSelect }: {
  home: { lat: number; lng: number }
  rangeMiles: number
  items: FeedItem[]
  selected: string | null
  onSelect: (id: string) => void
}) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const layer = useRef<L.LayerGroup | null>(null)

  useEffect(() => {
    if (!el.current || map.current) return
    map.current = L.map(el.current, { zoomControl: false, attributionControl: true }).setView([home.lat, home.lng], 11)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18, attribution: '© OpenStreetMap',
    }).addTo(map.current)
    layer.current = L.layerGroup().addTo(map.current)
    return () => {
      map.current?.remove()
      map.current = null
    }
  }, [home.lat, home.lng])

  useEffect(() => {
    const m = map.current
    const g = layer.current
    if (!m || !g) return
    g.clearLayers()
    L.marker([home.lat, home.lng], {
      icon: L.divIcon({ className: '', html: '<div class="pin-home">⌂</div>', iconSize: [34, 34], iconAnchor: [17, 17] }),
      keyboard: false,
    }).addTo(g)
    const radius = rangeMiles >= 99 ? 25 : rangeMiles
    const circle = L.circle([home.lat, home.lng], { radius: radius * 1609, color: '#8A96A8', weight: 2, dashArray: '6 6', fill: false }).addTo(g)
    for (const it of items) {
      if (it.lat == null || it.lng == null) continue
      const free = it.priceValue === 0 || it.price === 'חינם'
      const cls = it.id === selected ? 'pin sel' : free ? 'pin free' : 'pin paid'
      const label = (it.price ?? '•').replace(/[<>&]/g, '')
      L.marker([it.lat, it.lng], {
        icon: L.divIcon({ className: '', html: `<button class="${cls}" aria-label="">${label}</button>`, iconSize: [0, 0] }),
        title: it.title,
        zIndexOffset: it.id === selected ? 1000 : 0,
      }).on('click', () => onSelect(it.id)).addTo(g)
    }
    m.fitBounds(circle.getBounds(), { padding: [10, 10] })
  }, [home.lat, home.lng, rangeMiles, items, selected, onSelect])

  return <div ref={el} role="region" aria-label="מפת הגילויים סביב הבית" style={{ height: 340, borderRadius: 18, overflow: 'hidden', border: '1px solid var(--border)' }} />
}
