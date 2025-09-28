<script lang="ts">
  import { Canvas, T } from '@threlte/core';
  import { OrbitControls } from '@threlte/extras';
  import { onMount } from 'svelte';
  import * as THREE from 'three';
  
  type Location = { raw: string; lat: number; lng: number; place?: string };

  // Default starting points: Los Angeles and New York
  let locations: Location[] = [
    { raw: '34.0522,-118.2437', lat: 34.0522, lng: -118.2437 },
    { raw: '40.7128,-74.0060', lat: 40.7128, lng: -74.0060 }
  ];
  let midpoint: Location | null = null;
  let error = '';

    // Three.js objects for the globe
  let pointsGroup: THREE.Group | undefined;
  let arcsGroup: THREE.Group | undefined;
  
  // Drag interaction state
  let isDragging = false;
  let draggedMarker: THREE.Mesh | null = null;
  let camera: THREE.Camera | undefined;
  let raycaster = new THREE.Raycaster();
  let mouse = new THREE.Vector2();

  // Parse coordinate string into lat/lng
  function parseCoordinates(input: string): { lat: number; lng: number } | null {
    // Remove extra spaces and normalize
    const cleaned = input.trim().replace(/\s+/g, ' ');
    
    // Try different coordinate formats
    const patterns = [
      /^(-?\d+\.?\d*),\s*(-?\d+\.?\d*)$/, // "lat,lng" format
      /^(-?\d+\.?\d*)\s+(-?\d+\.?\d*)$/, // "lat lng" format
      /^(-?\d+\.?\d*)°?\s*[NS]?,?\s*(-?\d+\.?\d*)°?\s*[EW]?$/i, // degree format
    ];
    
    for (const pattern of patterns) {
      const match = cleaned.match(pattern);
      if (match) {
        const lat = parseFloat(match[1]);
        const lng = parseFloat(match[2]);
        
        if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
          return { lat, lng };
        }
      }
    }
    
    return null;
  }

  function updateLocations(index: number, value: string) {
    const coords = parseCoordinates(value);
    if (coords) {
      locations[index] = { ...coords, raw: value };
      locations = [...locations]; // trigger reactivity
      calculateMidpoint();
      updateGlobe();
    } else {
      locations[index] = { raw: value, lat: 0, lng: 0 };
      locations = [...locations];
    }
  }

  // Update the globe with current locations and midpoint
  function updateGlobe() {
    if (!pointsGroup || !arcsGroup) return;
    
    // Clear existing points and arcs
    pointsGroup.clear();
    arcsGroup.clear();
    
    // Add location markers
    locations.forEach((loc, i) => {
      if (loc && loc.lat !== undefined && loc.lng !== undefined && pointsGroup) {
        const color = i === 0 ? '#2196F3' : '#4CAF50';
        const marker = createLocationMarker(loc.lat, loc.lng, color, 1.2, i);
        pointsGroup.add(marker);
      }
    });
    
    // Add midpoint marker
    if (midpoint && pointsGroup) {
      const midpointMarker = createLocationMarker(midpoint.lat, midpoint.lng, '#F44336', 1.5);
      pointsGroup.add(midpointMarker);
      
      // Add arcs from each location to midpoint
      if (arcsGroup) {
        locations.forEach(loc => {
          if (loc && loc.lat !== undefined && loc.lng !== undefined && midpoint && arcsGroup) {
            const arc = createArc(loc.lat, loc.lng, midpoint.lat, midpoint.lng);
            arcsGroup.add(arc);
          }
        });
      }
    }
  }

  function calculateMidpoint() {
    const validLocations = locations.filter(loc => loc && loc.lat !== undefined && loc.lng !== undefined);
    
    if (validLocations.length < 2) {
      error = 'Enter at least two valid locations.';
      midpoint = null;
      return;
    }
    
    // Calculate geographic midpoint using spherical coordinates
    const latRad = validLocations.map(l => l.lat * Math.PI / 180);
    const lngRad = validLocations.map(l => l.lng * Math.PI / 180);
    const x = latRad.map((lat, i) => Math.cos(lat) * Math.cos(lngRad[i]));
    const y = latRad.map((lat, i) => Math.cos(lat) * Math.sin(lngRad[i]));
    const z = latRad.map(lat => Math.sin(lat));
    const xAvg = x.reduce((a, b) => a + b, 0) / x.length;
    const yAvg = y.reduce((a, b) => a + b, 0) / y.length;
    const zAvg = z.reduce((a, b) => a + b, 0) / z.length;
    const hyp = Math.sqrt(xAvg * xAvg + yAvg * yAvg);
    const lat = Math.atan2(zAvg, hyp) * 180 / Math.PI;
    const lng = Math.atan2(yAvg, xAvg) * 180 / Math.PI;
    midpoint = { raw: `${lat.toFixed(6)},${lng.toFixed(6)}`, lat, lng };
    error = '';
  }


  // Convert lat/lng to 3D coordinates on a sphere
  function latLngToVector3(lat: number, lng: number, radius = 50): THREE.Vector3 {
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lng + 180) * (Math.PI / 180);
    
    const x = -(radius * Math.sin(phi) * Math.cos(theta));
    const z = (radius * Math.sin(phi) * Math.sin(theta));
    const y = (radius * Math.cos(phi));
    
    return new THREE.Vector3(x, y, z);
  }

  // Create location markers
  function createLocationMarker(lat: number, lng: number, color: string, size = 1, locationIndex?: number): THREE.Mesh {
    const geometry = new THREE.SphereGeometry(size, 8, 8);
    const material = new THREE.MeshLambertMaterial({ color });
    const sphere = new THREE.Mesh(geometry, material);
    
    const position = latLngToVector3(lat, lng, 51);
    sphere.position.copy(position);
    
    // Store original data for dragging
    (sphere as any).userData = {
      lat,
      lng,
      locationIndex,
      isDraggable: locationIndex !== undefined
    };
    
    return sphere;
  }
  
  // Convert 3D position back to lat/lng
  function vector3ToLatLng(position: THREE.Vector3): { lat: number; lng: number } {
    const normalizedPos = position.clone().normalize();
    const lat = Math.asin(normalizedPos.y) * (180 / Math.PI);
    const lng = Math.atan2(normalizedPos.z, -normalizedPos.x) * (180 / Math.PI);
    return { lat, lng };
  }

  // Create arc between two points
  function createArc(lat1: number, lng1: number, lat2: number, lng2: number): THREE.Line {
    const start = latLngToVector3(lat1, lng1, 51);
    const end = latLngToVector3(lat2, lng2, 51);
    
    const points = [];
    for (let i = 0; i <= 50; i++) {
      const t = i / 50;
      const point = new THREE.Vector3().lerpVectors(start, end, t);
      point.normalize().multiplyScalar(51);
      points.push(point);
    }
    
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ color: 0xffffff, opacity: 0.8, transparent: true });
    
    return new THREE.Line(geometry, material);
  }

  // Create globe texture reactively
  let globeTexture: THREE.Texture;
  
  onMount(() => {
    // Create a light, clean world map texture
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    
    // Light blue background (oceans)
    ctx.fillStyle = '#E8F4FD';
    ctx.fillRect(0, 0, 1024, 512);
    
    // Draw more accurate continent shapes
    ctx.strokeStyle = '#B0BEC5';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#F8F9FA';
    
    // More detailed continent coordinates (simplified world map)
    const continents = [
      // North America
      [[100, 80], [180, 60], [220, 80], [280, 100], [320, 140], [300, 200], [250, 250], [200, 240], [150, 220], [120, 180], [80, 120]],
      // South America
      [[240, 280], [280, 260], [300, 300], [320, 360], [300, 420], [280, 450], [250, 460], [220, 440], [200, 400], [180, 350], [190, 300], [220, 280]],
      // Europe
      [[480, 120], [520, 100], [560, 110], [580, 140], [570, 170], [540, 180], [500, 160], [460, 150]],
      // Africa
      [[480, 200], [520, 180], [560, 200], [580, 240], [590, 300], [580, 360], [560, 400], [520, 420], [480, 400], [460, 360], [450, 300], [460, 240]],
      // Asia
      [[580, 80], [680, 60], [750, 80], [800, 120], [820, 160], [800, 200], [750, 220], [700, 200], [650, 180], [620, 140], [580, 120]],
      // Australia
      [[720, 340], [800, 330], [850, 350], [870, 380], [850, 400], [800, 410], [750, 400], [720, 380]],
      // Greenland
      [[300, 40], [350, 30], [380, 60], [360, 100], [320, 90], [280, 70]]
    ];
    
    continents.forEach(continent => {
      ctx.beginPath();
      ctx.moveTo(continent[0][0], continent[0][1]);
      continent.forEach(([x, y]) => ctx.lineTo(x, y));
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    });
    
    // Add grid lines for better geography reference
    ctx.strokeStyle = '#E0E0E0';
    ctx.lineWidth = 0.5;
    
    // Longitude lines
    for (let i = 0; i <= 12; i++) {
      const x = (i / 12) * 1024;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 512);
      ctx.stroke();
    }
    
    // Latitude lines
    for (let i = 0; i <= 6; i++) {
      const y = (i / 6) * 512;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(1024, y);
      ctx.stroke();
    }
    
    globeTexture = new THREE.CanvasTexture(canvas);
    calculateMidpoint();
    
    // Wait for the groups to be initialized
    setTimeout(() => {
      updateGlobe();
    }, 100);
  });

  // Mouse interaction functions
  function onMouseDown(event: MouseEvent) {
    if (!camera || !pointsGroup) return;
    
    const rect = (event.target as HTMLElement).getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(pointsGroup.children);
    
    if (intersects.length > 0) {
      const object = intersects[0].object as THREE.Mesh;
      if (object.userData.isDraggable) {
        isDragging = true;
        draggedMarker = object;
        event.preventDefault();
      }
    }
  }

  function onMouseMove(event: MouseEvent) {
    if (!isDragging || !draggedMarker || !camera) return;
    
    const rect = (event.target as HTMLElement).getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    raycaster.setFromCamera(mouse, camera);
    
    // Project the mouse position onto the globe surface
    const sphereGeometry = new THREE.SphereGeometry(51, 32, 16);
    const sphereMesh = new THREE.Mesh(sphereGeometry);
    const sphereIntersects = raycaster.intersectObject(sphereMesh);
    
    if (sphereIntersects.length > 0) {
      const newPosition = sphereIntersects[0].point.clone().normalize().multiplyScalar(51);
      draggedMarker.position.copy(newPosition);
      
      // Update the location data
      const newCoords = vector3ToLatLng(newPosition);
      const locationIndex = draggedMarker.userData.locationIndex;
      
      if (locationIndex !== undefined) {
        locations[locationIndex] = {
          ...locations[locationIndex],
          lat: newCoords.lat,
          lng: newCoords.lng,
          raw: `${newCoords.lat.toFixed(6)},${newCoords.lng.toFixed(6)}`
        };
        locations = [...locations]; // trigger reactivity
        calculateMidpoint();
        updateGlobe();
      }
    }
  }

  function onMouseUp() {
    isDragging = false;
    draggedMarker = null;
  }
  });
</script>

<main class="midpoint-container">
  <h1 class="title">Geographic Midpoint Calculator</h1>
  <p class="subtitle">
    Find the exact point that lies halfway between two or more places. Enter coordinates (e.g. <span class="mono">34.0522,-118.2437</span>) or a place name (e.g. <span class="mono">Los Angeles</span>) for each location below. You can also drag the markers on the globe to adjust positions.
  </p>

  <div class="input-row">
    <input
      type="text"
      bind:value={locations[0].raw}
      on:input={e => updateLocations(0, (e.target as HTMLInputElement).value)}
      placeholder="Location 1 (coords or name)"
      class="location-input location-input-1"
    />
    <input
      type="text"
      bind:value={locations[1].raw}
      on:input={e => updateLocations(1, (e.target as HTMLInputElement).value)}
      placeholder="Location 2 (coords or name)"
      class="location-input location-input-2"
    />
  </div>

  {#if error}
    <div class="error">{error}</div>
  {/if}

  <div class="map-box" 
       on:mousedown={onMouseDown}
       on:mousemove={onMouseMove} 
       on:mouseup={onMouseUp}
       on:mouseleave={onMouseUp}>
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
      
      <!-- Globe -->
      <T.Mesh>
        <T.SphereGeometry args={[50, 64, 32]} />
        <T.MeshLambertMaterial map={globeTexture} color={0xffffff} />
      </T.Mesh>
      
      <!-- Location points and arcs -->
      <T.Group bind:ref={pointsGroup} />
      <T.Group bind:ref={arcsGroup} />
    </Canvas>
  </div>

  {#if midpoint}
    <div class="result">
      <h2>Midpoint:</h2>
      <p>Latitude: {midpoint.lat.toFixed(6)}, Longitude: {midpoint.lng.toFixed(6)}</p>
    </div>
  {/if}
</main>

<style>
.midpoint-container {
  margin: 2rem auto;
  padding: 2rem;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.08);
}
.title {
  color: #1976d2;
  font-size: 2rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
}
.subtitle {
  color: #333;
  margin-bottom: 1.5rem;
}
.mono {
  font-family: monospace;
  background: #f0f0f0;
  padding: 0 0.2em;
  border-radius: 3px;
}
.input-row {
  display: flex;
  gap: 1rem;
  margin-bottom: 1.5rem;
}
.location-input {
  flex: 1;
  padding: 0.5rem;
  border-radius: 4px;
  border: 2px solid #ccc;
  font-size: 1rem;
  transition: border-color 0.2s ease;
}
.location-input-1 {
  border-color: #2196F3;
  box-shadow: 0 0 0 2px rgba(33, 150, 243, 0.1);
}
.location-input-1:focus {
  border-color: #2196F3;
  box-shadow: 0 0 0 3px rgba(33, 150, 243, 0.2);
  outline: none;
}
.location-input-2 {
  border-color: #4CAF50;
  box-shadow: 0 0 0 2px rgba(76, 175, 80, 0.1);
}
.location-input-2:focus {
  border-color: #4CAF50;
  box-shadow: 0 0 0 3px rgba(76, 175, 80, 0.2);
  outline: none;
}

.map-box {
  width: 100%;
  height: 350px;
  margin: 1.5rem 0;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.08);
  cursor: grab;
}
.map-box:active {
  cursor: grabbing;
}
.error {
  color: #e53935;
  margin-bottom: 1rem;
}
.result {
  margin-top: 2rem;
  padding: 1rem;
  background: #f5f5f5;
  border-radius: 8px;
}
</style>