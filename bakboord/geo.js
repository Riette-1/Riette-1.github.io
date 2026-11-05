// Route maths for Bakboord na stuurboord. No Google code here, so it can be
// tested on its own: decoding Google's route line, measuring it, and finding
// the point a given distance along it.
(function (root) {
  'use strict';

  // Google's encoded polyline format -> [{lat, lng}, ...]
  function decodePolyline(str) {
    const points = [];
    let index = 0, lat = 0, lng = 0;
    while (index < str.length) {
      for (const axis of ['lat', 'lng']) {
        let result = 0, shift = 0, byte;
        do {
          byte = str.charCodeAt(index++) - 63;
          result |= (byte & 0x1f) << shift;
          shift += 5;
        } while (byte >= 0x20 && index < str.length);
        const delta = (result & 1) ? ~(result >> 1) : (result >> 1);
        if (axis === 'lat') lat += delta; else lng += delta;
      }
      points.push({ lat: lat / 1e5, lng: lng / 1e5 });
    }
    return points;
  }

  // Great-circle distance in metres.
  function haversine(a, b) {
    const R = 6371008.8, rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
    const h = Math.sin(dLat / 2) ** 2 +
      Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  // Running distance (metres) at each point of the path.
  function cumulative(path) {
    const out = [0];
    for (let i = 1; i < path.length; i++) out.push(out[i - 1] + haversine(path[i - 1], path[i]));
    return out;
  }

  // Split the path at `fraction` (0..1) of its length. Returns the point
  // there, plus the travelled and remaining parts of the line.
  function splitAt(path, fraction) {
    if (!path.length) return { point: null, done: [], todo: [] };
    const f = Math.max(0, Math.min(1, fraction));
    const cum = cumulative(path);
    const total = cum[cum.length - 1];
    if (total === 0 || f === 0) return { point: path[0], done: [path[0]], todo: path.slice() };
    if (f === 1) { const end = path[path.length - 1]; return { point: end, done: path.slice(), todo: [end] }; }
    const target = f * total;
    let i = 1;
    while (i < cum.length - 1 && cum[i] < target) i++;
    const segLen = cum[i] - cum[i - 1];
    const t = segLen === 0 ? 0 : (target - cum[i - 1]) / segLen;
    const a = path[i - 1], b = path[i];
    const point = { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
    return { point, done: path.slice(0, i).concat([point]), todo: [point].concat(path.slice(i)) };
  }

  const api = { decodePolyline, haversine, cumulative, splitAt };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Geo = api;
})(typeof window !== 'undefined' ? window : globalThis);
