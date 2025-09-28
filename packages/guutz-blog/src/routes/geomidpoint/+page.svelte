<script lang="ts">
  import { Canvas, T } from '@threlte/core';
  import { OrbitControls } from '@threlte/extras';
  import { browser } from '$app/environment';
  import { onDestroy, onMount } from 'svelte';
  import * as THREE from 'three';
  import { geoEquirectangular, geoGraticule10, geoPath } from 'd3-geo';
  import { feature } from 'topojson-client';
  import type { FeatureCollection, Geometry } from 'geojson';

  type Location = {
    id: number;
    raw: string;
    lat: number;
    lng: number;
    place?: string;
  };

  const MIN_LOCATIONS = 2;
  const GLOBE_RADIUS = 50;
  const MARKER_ALTITUDE = 1.5;
  const LOCATION_COLORS = ['#2196F3', '#4CAF50', '#FFC107', '#9C27B0', '#EC407A', '#26C6DA', '#8BC34A'];
  const LAND_TOPOJSON_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json';

  let locations: Location[] = [
    { id: 1, raw: '34.0522,-118.2437', lat: 34.0522, lng: -118.2437 },
    { id: 2, raw: '40.7128,-74.0060', lat: 40.7128, lng: -74.0060 }
  ];
  let nextLocationId = 3;

  let midpoint: Location | null = null;
  let error = '';
  let globeTexture: THREE.Texture | null = null;
  let mapError = '';
  let globeSignature = '';

  let pointsGroup: THREE.Group | undefined;
  let arcsGroup: THREE.Group | undefined;
  let camera: THREE.PerspectiveCamera | undefined;

  let isDragging = false;
  let draggedMarker: THREE.Mesh | null = null;
  let dragHelper: THREE.Mesh | undefined;

  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  const locationTimers = new Map<number, number>();
  const lookupTokens = new Map<number, number>();
  let lookupCounter = 0;

  onMount(() => {
    if (!browser) return;

    disposeTexture(globeTexture);
    globeTexture = createFallbackTexture();

    const handlePointerUp = () => endDrag();

    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    window.addEventListener('pointerleave', handlePointerUp);

    buildGlobeTexture().catch((err) => {
      console.error('Failed to build detailed globe texture', err);
      mapError = 'Using fallback map texture (failed to load high-resolution map data).';
      globeTexture = createFallbackTexture();
    });

    return () => {
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
      window.removeEventListener('pointerleave', handlePointerUp);
    };
  });

  onDestroy(() => {
    if (browser) {
      for (const timeoutId of locationTimers.values()) {
        window.clearTimeout(timeoutId);
      }
    }
    locationTimers.clear();
    lookupTokens.clear();

    disposeTexture(globeTexture);
    globeTexture = null;

    if (dragHelper) {
      dragHelper.geometry.dispose();
      disposeMaterial(dragHelper.material as THREE.Material | THREE.Material[]);
    }
  });

  $: ({ midpoint, error } = computeMidpoint(locations));

  $: {
    const nextSignature = JSON.stringify({
      locations: locations.map((loc) => ({ id: loc.id, lat: loc.lat, lng: loc.lng })),
      midpoint: midpoint ? { lat: midpoint.lat, lng: midpoint.lng } : null
    });

    if (nextSignature !== globeSignature) {
      globeSignature = nextSignature;
      if (pointsGroup && arcsGroup) {
        updateGlobe();
      }
    }
  }

  async function buildGlobeTexture() {
    if (!browser) return;

    try {
      const response = await fetch(LAND_TOPOJSON_URL, { cache: 'force-cache' });
      if (!response.ok) {
        throw new Error(`Unexpected response ${response.status}`);
      }

      const topojson = await response.json();
      if (!topojson?.objects?.land) {
        throw new Error('Malformed topojson response (missing land object)');
      }

      const land = feature(topojson, topojson.objects.land) as FeatureCollection<Geometry>;
      const canvas = document.createElement('canvas');
      canvas.width = 2048;
      canvas.height = 1024;
      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('Unable to get 2d canvas context');
      }

      const projection = geoEquirectangular().fitExtent(
        [
          [32, 32],
          [canvas.width - 32, canvas.height - 32]
        ],
        land
      );
      const path = geoPath(projection, context);

      const oceanGradient = context.createLinearGradient(0, 0, 0, canvas.height);
      oceanGradient.addColorStop(0, '#030712');
      oceanGradient.addColorStop(1, '#0f172a');
      context.fillStyle = oceanGradient;
      context.fillRect(0, 0, canvas.width, canvas.height);

      context.beginPath();
      path(land);
      context.fillStyle = '#1f2937';
      context.fill();

      context.beginPath();
      path(geoGraticule10());
      context.strokeStyle = 'rgba(148, 163, 184, 0.28)';
      context.lineWidth = 0.7;
      context.stroke();

      const texture = new THREE.CanvasTexture(canvas);
      texture.anisotropy = 8;
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.needsUpdate = true;

      disposeTexture(globeTexture);
      globeTexture = texture;
      mapError = '';
    } catch (err) {
      console.error('Failed to generate globe texture', err);
      throw err;
    }
  }

  function createFallbackTexture(): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 512;
    const context = canvas.getContext('2d');
    if (!context) {
      return new THREE.Texture();
    }

    const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#0b1220');
    gradient.addColorStop(1, '#111827');
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.strokeStyle = 'rgba(148, 163, 184, 0.22)';
    context.lineWidth = 1.1;
    const latLines = [-60, -30, 0, 30, 60];
    latLines.forEach((lat) => {
      const y = ((lat + 90) / 180) * canvas.height;
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(canvas.width, y);
      context.stroke();
    });

    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = 4;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
  }

  function disposeTexture(texture: THREE.Texture | null) {
    if (!texture) return;
    texture.dispose();
  }

  function parseCoordinatePair(input: string): { lat: number; lng: number } | null {
    const match = input.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (!match) return null;

    const lat = Number.parseFloat(match[1]);
    const lng = Number.parseFloat(match[2]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    return { lat, lng };
  }

  function cancelPendingLookup(id: number) {
    const timeoutId = locationTimers.get(id);
    if (timeoutId !== undefined) {
      if (browser) {
        window.clearTimeout(timeoutId);
      }
      locationTimers.delete(id);
    }
    lookupTokens.delete(id);
  }

  function scheduleGeocode(id: number, query: string) {
    if (!browser) return;

    cancelPendingLookup(id);
    const token = ++lookupCounter;
    lookupTokens.set(id, token);

    const timeoutId = window.setTimeout(async () => {
      locationTimers.delete(id);
      try {
        const result = await geocodePlace(query);
        if (lookupTokens.get(id) !== token) {
          return;
        }

        if (result) {
          locations = locations.map((loc) =>
            loc.id === id
              ? {
                  ...loc,
                  lat: result.lat,
                  lng: result.lng,
                  place: result.place ?? query
                }
              : loc
          );
        }
      } catch (err) {
        console.error('Failed to geocode location', err);
      }
    }, 450);

    locationTimers.set(id, timeoutId);
  }

  async function geocodePlace(query: string): Promise<{ lat: number; lng: number; place?: string } | null> {
    if (!browser || !query) return null;

    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Geocoding failed with status ${response.status}`);
    }

    const results = (await response.json()) as Array<{ lat: string; lon: string; display_name?: string }>;
    if (!Array.isArray(results) || results.length === 0) {
      return null;
    }

    const { lat, lon, display_name } = results[0];
    const parsedLat = Number.parseFloat(lat);
    const parsedLng = Number.parseFloat(lon);
    if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng)) {
      return null;
    }

    return {
      lat: parsedLat,
      lng: parsedLng,
      place: display_name
    };
  }

  function updateLocation(id: number, rawValue: string) {
    const input = rawValue.trim();

    locations = locations.map((loc) => (loc.id === id ? { ...loc, raw: input } : loc));

    const pair = parseCoordinatePair(input);
    if (pair) {
      cancelPendingLookup(id);
      locations = locations.map((loc) =>
        loc.id === id
          ? {
              ...loc,
              lat: pair.lat,
              lng: pair.lng,
              place: undefined
            }
          : loc
      );
      return;
    }

    locations = locations.map((loc) =>
      loc.id === id
        ? {
            ...loc,
            lat: Number.NaN,
            lng: Number.NaN
          }
        : loc
    );

    if (!browser || !input) {
      cancelPendingLookup(id);
      return;
    }

    scheduleGeocode(id, input);
  }

  function updateLocationFromDrag(id: number, lat: number, lng: number) {
    cancelPendingLookup(id);
    const raw = `${lat.toFixed(6)},${lng.toFixed(6)}`;
    locations = locations.map((loc) =>
      loc.id === id
        ? {
            ...loc,
            raw,
            lat,
            lng,
            place: undefined
          }
        : loc
    );
  }

  function addLocation() {
    const newLocation: Location = {
      id: nextLocationId++,
      raw: '',
      lat: Number.NaN,
      lng: Number.NaN
    };
    locations = [...locations, newLocation];
  }

  function removeLocation(id: number) {
    if (locations.length <= MIN_LOCATIONS) return;
    cancelPendingLookup(id);
    locations = locations.filter((loc) => loc.id !== id);
    if (draggedMarker && draggedMarker.userData.locationId === id) {
      endDrag();
    }
  }

  function computeMidpoint(locationList: Location[]): { midpoint: Location | null; error: string } {
    const valid = locationList.filter(isValidLocation);
    if (valid.length < MIN_LOCATIONS) {
      return {
        midpoint: null,
        error: `Enter at least ${MIN_LOCATIONS} valid locations.`
      };
    }

    const latRad = valid.map((loc) => (loc.lat * Math.PI) / 180);
    const lngRad = valid.map((loc) => (loc.lng * Math.PI) / 180);

    const x = latRad.map((lat, i) => Math.cos(lat) * Math.cos(lngRad[i]));
    const y = latRad.map((lat, i) => Math.cos(lat) * Math.sin(lngRad[i]));
    const z = latRad.map((lat) => Math.sin(lat));

    const xAvg = x.reduce((acc, value) => acc + value, 0) / x.length;
    const yAvg = y.reduce((acc, value) => acc + value, 0) / y.length;
    const zAvg = z.reduce((acc, value) => acc + value, 0) / z.length;

    if (xAvg === 0 && yAvg === 0 && zAvg === 0) {
      const [first] = valid;
      return {
        midpoint: {
          id: 0,
          raw: `${first.lat.toFixed(6)},${first.lng.toFixed(6)}`,
          lat: first.lat,
          lng: first.lng
        },
        error: ''
      };
    }

    const hyp = Math.sqrt(xAvg * xAvg + yAvg * yAvg);
    const lat = (Math.atan2(zAvg, hyp) * 180) / Math.PI;
    const lng = (Math.atan2(yAvg, xAvg) * 180) / Math.PI;

    return {
      midpoint: {
        id: 0,
        raw: `${lat.toFixed(6)},${lng.toFixed(6)}`,
        lat,
        lng
      },
      error: ''
    };
  }

  function updateGlobe() {
    if (!pointsGroup || !arcsGroup) return;

    const points = pointsGroup;
    const arcs = arcsGroup;

    clearGroup(points);
    clearGroup(arcs);

    const validLocations = locations.filter(isValidLocation);

    validLocations.forEach((loc, index) => {
      const marker = createLocationMarker(loc, LOCATION_COLORS[index % LOCATION_COLORS.length]);
      points.add(marker);
    });

    if (midpoint) {
      const midpointMarker = createLocationMarker(midpoint, '#F44336', true);
      points.add(midpointMarker);

      validLocations.forEach((loc) => {
        const arc = createArc(loc, midpoint);
        arcs.add(arc);
      });
    }
  }

  function createLocationMarker(location: Location, color: string, isMidpoint = false): THREE.Mesh {
    const geometry = new THREE.SphereGeometry(isMidpoint ? 1.8 : 1.2, 16, 16);
    const material = new THREE.MeshStandardMaterial({
      color,
      emissive: isMidpoint ? new THREE.Color(color).multiplyScalar(0.25) : new THREE.Color('#111111'),
      emissiveIntensity: isMidpoint ? 0.5 : 0.15,
      metalness: 0.1,
      roughness: 0.45
    });

    const mesh = new THREE.Mesh(geometry, material);
    const position = latLngToVector3(location.lat, location.lng, GLOBE_RADIUS + MARKER_ALTITUDE);
    mesh.position.copy(position);
    mesh.userData = {
      locationId: location.id,
      isDraggable: !isMidpoint
    };
    return mesh;
  }

  function createArc(start: Location, end: Location): THREE.Line {
    const startVec = latLngToVector3(start.lat, start.lng, GLOBE_RADIUS + MARKER_ALTITUDE);
    const endVec = latLngToVector3(end.lat, end.lng, GLOBE_RADIUS + MARKER_ALTITUDE);

    const arcPoints: THREE.Vector3[] = [];
    const points = 64;
    for (let i = 0; i <= points; i++) {
      const t = i / points;
      const intermediate = new THREE.Vector3().lerpVectors(startVec, endVec, t);
      const elevation = 1 + Math.sin(Math.PI * t) * 6;
      intermediate.normalize().multiplyScalar(GLOBE_RADIUS + MARKER_ALTITUDE + elevation);
      arcPoints.push(intermediate);
    }

    const geometry = new THREE.BufferGeometry().setFromPoints(arcPoints);
    const material = new THREE.LineBasicMaterial({ color: 0xffffff, opacity: 0.7, transparent: true });
    return new THREE.Line(geometry, material);
  }

  function clearGroup(group: THREE.Group) {
    for (const child of [...group.children]) {
      group.remove(child);
      if (child instanceof THREE.Mesh) {
        child.geometry?.dispose?.();
        disposeMaterial(child.material);
      } else if (child instanceof THREE.Line) {
        child.geometry.dispose();
        disposeMaterial(child.material);
      }
    }
  }

  function disposeMaterial(material: THREE.Material | THREE.Material[]) {
    if (Array.isArray(material)) {
      material.forEach((mat) => mat.dispose());
    } else {
      material.dispose();
    }
  }

  function latLngToVector3(lat: number, lng: number, radius: number): THREE.Vector3 {
    const phi = THREE.MathUtils.degToRad(90 - lat);
    const theta = THREE.MathUtils.degToRad(lng + 180);

    const x = -(radius * Math.sin(phi) * Math.cos(theta));
    const z = radius * Math.sin(phi) * Math.sin(theta);
    const y = radius * Math.cos(phi);

    return new THREE.Vector3(x, y, z);
  }

  function vector3ToLatLng(position: THREE.Vector3): { lat: number; lng: number } {
    const normalized = position.clone().normalize();
    const lat = THREE.MathUtils.radToDeg(Math.asin(normalized.y));
    const lng = THREE.MathUtils.radToDeg(Math.atan2(normalized.z, -normalized.x));
    return { lat, lng };
  }

  function isValidLocation(location: Location): boolean {
    return Number.isFinite(location.lat) && Number.isFinite(location.lng);
  }

  function onPointerDown(event: PointerEvent) {
    if (!camera || !pointsGroup) return;

    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const draggableMarkers = pointsGroup.children.filter((child) => (child as THREE.Object3D).userData?.isDraggable) as THREE.Object3D[];
    const intersects = raycaster.intersectObjects(draggableMarkers, false);
    if (intersects.length === 0) return;

    draggedMarker = intersects[0].object as THREE.Mesh;
    isDragging = true;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent) {
    if (!isDragging || !draggedMarker || !camera) return;

    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  if (!dragHelper) return;
  const intersects = raycaster.intersectObject(dragHelper, false);
    if (intersects.length === 0) return;

    const newPosition = intersects[0].point.clone().normalize().multiplyScalar(GLOBE_RADIUS + MARKER_ALTITUDE);
    draggedMarker.position.copy(newPosition);

    const { lat, lng } = vector3ToLatLng(newPosition);
    const locationId = draggedMarker.userData.locationId as number | undefined;
    if (locationId !== undefined) {
      updateLocationFromDrag(locationId, lat, lng);
    }
  }

  function onPointerUp(event: PointerEvent) {
    const target = event.currentTarget as HTMLElement;
    if (target.hasPointerCapture?.(event.pointerId)) {
      target.releasePointerCapture(event.pointerId);
    }
    endDrag();
  }

  function onPointerLeave(event: PointerEvent) {
    const target = event.currentTarget as HTMLElement;
    if (target.hasPointerCapture?.(event.pointerId)) {
      target.releasePointerCapture(event.pointerId);
    }
    endDrag();
  }

  function endDrag() {
    isDragging = false;
    draggedMarker = null;
  }
</script>

<main class="midpoint-container">
  <h1 class="title">Geographic Midpoint Calculator</h1>
  <p class="subtitle">
    Find the exact point that lies halfway between two or more places. Enter coordinates (e.g. <span class="mono">34.0522,-118.2437</span>) or a place name (e.g. <span class="mono">Los Angeles</span>) for each location below. You can also drag the markers on the globe to adjust positions.
  </p>

  <section class="inputs-panel">
    <div class="input-list">
      {#each locations as location, index (location.id)}
        <div class="location-row">
          <div class="location-label">
            <span
              class="color-dot"
              style={`--dot-color: ${LOCATION_COLORS[index % LOCATION_COLORS.length]}`}
            ></span>
            <span>Location {index + 1}</span>
          </div>
          <div class="location-controls">
            <input
              type="text"
              class="location-input"
              value={location.raw}
              placeholder="Latitude,Longitude"
              on:input={(event) => updateLocation(location.id, (event.target as HTMLInputElement).value)}
            />
            {#if locations.length > MIN_LOCATIONS}
              <button
                class="remove-button"
                type="button"
                on:click={() => removeLocation(location.id)}
                aria-label={`Remove location ${index + 1}`}
              >
                ×
              </button>
            {/if}
          </div>
        </div>
      {/each}
    </div>
    <button class="add-button" type="button" on:click={addLocation}>
      + Add location
    </button>
  </section>

  {#if error}
    <div class="error">{error}</div>
  {/if}
  {#if mapError}
    <div class="map-warning">{mapError}</div>
  {/if}

  <div
    class="map-box"
    class:dragging={isDragging}
    on:pointerdown={onPointerDown}
    on:pointermove={onPointerMove}
    on:pointerup={onPointerUp}
    on:pointerleave={onPointerLeave}
  >
    <Canvas>
      <T.PerspectiveCamera makeDefault position={[0, 0, 120]} fov={60} bind:ref={camera}>
        <OrbitControls 
          enableDamping 
          dampingFactor={0.05}
          minDistance={80}
          maxDistance={200}
          enabled={!isDragging}
        />
      </T.PerspectiveCamera>
      
      <!-- Lighting -->
      <T.AmbientLight intensity={0.6} />
      <T.DirectionalLight intensity={0.8} position={[10, 10, 5]} />
      <T.PointLight intensity={0.5} position={[-20, -20, -10]} />
      
      <!-- Globe -->
      <T.Mesh>
        <T.SphereGeometry args={[50, 64, 32]} />
        <T.MeshStandardMaterial
          map={globeTexture ?? undefined}
          color={0xffffff}
          roughness={0.85}
          metalness={0.05}
        />
      </T.Mesh>
      
      <!-- Location points and arcs -->
      <T.Group bind:ref={pointsGroup} />
      <T.Group bind:ref={arcsGroup} />
      <T.Mesh bind:ref={dragHelper}>
        <T.SphereGeometry args={[GLOBE_RADIUS + MARKER_ALTITUDE, 64, 32]} />
        <T.MeshBasicMaterial transparent opacity={0} depthWrite={false} depthTest={true} />
      </T.Mesh>
    </Canvas>
  </div>

  {#if midpoint}
    <div class="result">
      <h2>Midpoint:</h2>
      <p>Latitude: {midpoint.lat.toFixed(6)}, Longitude: {midpoint.lng.toFixed(6)}</p>
      <p class="raw">{midpoint.raw}</p>
    </div>
  {/if}
</main>

<style>
.midpoint-container {
  margin: 2rem auto;
  padding: 2rem;
  max-width: 960px;
  border-radius: 20px;
  background: linear-gradient(160deg, rgba(9, 14, 26, 0.92), rgba(12, 19, 33, 0.82));
  border: 1px solid rgba(59, 130, 246, 0.12);
  box-shadow: 0 35px 60px rgba(2, 12, 32, 0.55);
  backdrop-filter: blur(18px);
  color: #e2e8f0;
}

.title {
  font-size: 2rem;
  font-weight: 700;
  margin-bottom: 0.75rem;
  color: #93c5fd;
  letter-spacing: 0.01em;
}

.subtitle {
  margin-bottom: 1.75rem;
  line-height: 1.65;
  color: #94a3b8;
}

.mono {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', monospace;
  background: rgba(59, 130, 246, 0.16);
  color: #f8fafc;
  padding: 0 0.32em;
  border-radius: 4px;
  border: 1px solid rgba(59, 130, 246, 0.18);
}

.inputs-panel {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-bottom: 1.75rem;
}

.input-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.location-row {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0.95rem 1.1rem;
  border-radius: 14px;
  background: rgba(15, 23, 42, 0.7);
  border: 1px solid rgba(148, 163, 184, 0.16);
  transition: border-color 0.25s ease, transform 0.2s ease;
}

.location-row:hover {
  border-color: rgba(148, 163, 184, 0.28);
  transform: translateY(-1px);
}

@media (min-width: 640px) {
  .location-row {
    flex-direction: row;
    align-items: center;
  }
}

.location-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
  color: #cbd5f5;
}

.color-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--dot-color, #60a5fa);
  box-shadow: 0 0 10px rgba(96, 165, 250, 0.55);
}

.location-controls {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  flex: 1;
}

.location-input {
  flex: 1;
  padding: 0.65rem 0.85rem;
  border-radius: 10px;
  border: 1px solid rgba(99, 102, 241, 0.25);
  font-size: 1rem;
  color: #f1f5f9;
  background: rgba(15, 23, 42, 0.9);
  transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.12s ease;
}

.location-input::placeholder {
  color: rgba(148, 163, 184, 0.6);
}

.location-input:focus-visible {
  border-color: rgba(14, 165, 233, 0.7);
  box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.2);
  outline: none;
  transform: translateY(-1px);
}

.remove-button {
  background: rgba(76, 29, 149, 0.45);
  border: 1px solid rgba(209, 213, 219, 0.14);
  color: #fca5a5;
  font-size: 1rem;
  line-height: 1;
  cursor: pointer;
  padding: 0.35rem 0.55rem;
  border-radius: 8px;
  transition: background 0.2s ease, transform 0.15s ease, box-shadow 0.2s ease;
}

.remove-button:hover,
.remove-button:focus-visible {
  background: rgba(225, 29, 72, 0.28);
  box-shadow: 0 6px 16px rgba(225, 29, 72, 0.25);
  transform: translateY(-1px);
  outline: none;
}

.add-button {
  align-self: flex-start;
  background: linear-gradient(120deg, #2563eb, #06b6d4);
  color: #f8fafc;
  border: none;
  border-radius: 999px;
  padding: 0.6rem 1.35rem;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.18s ease, box-shadow 0.18s ease, filter 0.2s ease;
}

.add-button:hover,
.add-button:focus-visible {
  transform: translateY(-1px);
  box-shadow: 0 14px 30px rgba(37, 99, 235, 0.35);
  filter: brightness(1.05);
  outline: none;
}

.error {
  color: #fecaca;
  background: rgba(127, 29, 29, 0.35);
  border-left: 4px solid rgba(248, 113, 113, 0.85);
  padding: 0.85rem 1.1rem;
  border-radius: 10px;
  margin-bottom: 1rem;
  backdrop-filter: blur(10px);
}

.map-warning {
  color: #facc15;
  background: rgba(120, 53, 15, 0.35);
  border-left: 4px solid rgba(251, 191, 36, 0.85);
  padding: 0.85rem 1.1rem;
  border-radius: 10px;
  margin-bottom: 1rem;
  backdrop-filter: blur(10px);
}

.map-box {
  width: 100%;
  height: 380px;
  margin: 1.5rem 0;
  border-radius: 18px;
  box-shadow: 0 25px 50px rgba(8, 12, 26, 0.75);
  background: radial-gradient(circle at 30% 30%, rgba(96, 165, 250, 0.08), transparent 65%);
  overflow: hidden;
  cursor: grab;
  touch-action: none;
  border: 1px solid rgba(59, 130, 246, 0.12);
}

.map-box.dragging {
  cursor: grabbing;
  border-color: rgba(59, 130, 246, 0.28);
}

.result {
  margin-top: 2rem;
  padding: 1.25rem 1.5rem;
  background: linear-gradient(140deg, rgba(15, 118, 110, 0.25), rgba(37, 99, 235, 0.18));
  border-radius: 14px;
  border: 1px solid rgba(45, 212, 191, 0.18);
  color: #e2e8f0;
  box-shadow: inset 0 1px 0 rgba(148, 210, 223, 0.25);
}

.result h2 {
  margin-bottom: 0.65rem;
  font-size: 1.15rem;
  font-weight: 700;
  color: #a5f3fc;
  letter-spacing: 0.02em;
}

.result p {
  margin: 0.15rem 0;
}

.result .raw {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', monospace;
  font-size: 0.95rem;
  color: #bae6fd;
}

@media (max-width: 640px) {
  .midpoint-container {
    padding: 1.5rem;
  }

  .map-box {
    height: 320px;
  }
}
</style>