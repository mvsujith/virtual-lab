import React, { useEffect, useRef, forwardRef, useImperativeHandle, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { TransformControls } from "three/examples/jsm/controls/TransformControls";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";

// Constants from the original project
const GRID_SIZE = 20;
const GRID_DIVISIONS = 20;
const CAMERA_POSITION = new THREE.Vector3(0, 10, 15);
const SHADOW_MAP_SIZE = 2048;

const WorkspaceCanvas = forwardRef((props, ref) => {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const controlsRef = useRef(null);
  const transformControlsRef = useRef(null);
  const animationFrameRef = useRef(null);
  const modelRef = useRef(null);
  const selectableRootsRef = useRef([]); // track all selectable root objects
  const selectedRootRef = useRef(null); // currently selected root object
  const baseRootsRef = useRef({}); // known base models by canonical name (ultrawide_monitor, monitor, hanging_monitor)
  const nameToRootRef = useRef(new Map()); // map of name -> root object
  const baseLoadsCountRef = useRef(0);
  const baseLoadsTargetRef = useRef(3); // ultrawide, monitor, hanging_monitor
  const groundPlaneMeshRef = useRef(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  const pointerRef = useRef(new THREE.Vector2());
  const [selected, setSelected] = useState(false);
  const [transformMode, setTransformMode] = useState("translate"); // translate | rotate | scale
  const gizmoActiveRef = useRef(false);
  const chartCanvasRef = useRef(null);
  const chartTextureRef = useRef(null);
  const screenMeshRef = useRef(null);
  const [priceTicks, setPriceTicks] = useState([]); // price labels to render in DOM on the right
  const [hoverStats, setHoverStats] = useState(null); // { o,h,l,c,chg,chgPct,vol,up }
  const [hoverMarker, setHoverMarker] = useState({ visible: false, price: null, y: 0 });
  const chartScaleRef = useRef({ pMin: 0, pMax: 1 });
  const screenBoundsRef = useRef(null); // { left, right, top, bottom, width, height }
  const [screenBounds, setScreenBounds] = useState(null);
  // Interaction state for in-screen chart
  const chartViewStartRef = useRef(0); // first visible candle index
  const chartViewCountRef = useRef(120); // number of visible candles
  const chartAutoFollowRef = useRef(true); // stick to the right edge while true
  const chartHoveringRef = useRef(false); // pointer currently over screen
  const [chartHovering, setChartHovering] = useState(false);
  const chartDraggingRef = useRef(false);
  const chartLastURef = useRef(null); // last pointer U coord on the screen [0..1]
  // View overlay removed; no state needed
  // Names to suppress from auto-spawn and remove if present
  const removedNamesRef = useRef(new Set());

  // Helpers available to both effects and JSX
  // -- Naming helpers to ensure unique model names --
  const baseNameFromPath = (path) => {
    if (!path) return "Model";
    const last = path.split("/").pop() || path;
    return last.replace(/\.(glb|gltf)$/i, "");
  };
  const getExistingNames = () =>
    (selectableRootsRef.current || [])
      .filter(Boolean)
      .map((r) => (r.name && r.name.trim()) || "")
      .filter(Boolean);
  const uniqueName = (desired) => {
    const existing = new Set(getExistingNames());
    let base = (desired && desired.trim()) || "Model";
    if (!existing.has(base)) return base;
    let i = 2;
    while (existing.has(`${base}_${i}`)) i++;
    return `${base}_${i}`;
  };
  const assignUniqueName = (object3d, suggestion) => {
    if (!object3d) return;
    const desired = suggestion || (object3d.name && object3d.name.trim()) || "Model";
    object3d.name = uniqueName(desired);
  };
  const duplicateUniqueName = (base) => uniqueName(`${base}_duplicated`);

  // -- Fixed transforms mapping (from provided screenshot) --
  // All angles are in degrees; they will be converted to radians when applied
  const TARGET_TRANSFORMS = {
    ultrawide_monitor: {
      pos: [0, 0.5, 11.664], rotDeg: [0, 0, 0], scale: [1, 1, 1],
    },
    ultrawide_monitor_2: {
      pos: [0, 4.249, 1.239], rotDeg: [0, 0, 0], scale: [1, 1, 1],
    },
    monitor: {
      pos: [4.764, -0.3, -5.492], rotDeg: [0, 0, 0], scale: [1, 1, 1],
    },
    monitor_2: {
      pos: [-12.078, -6.442, 3.067], rotDeg: [0, -26.677, 0], scale: [8.711, 11.422, 9.298],
    },
    hanging_monitor: {
      pos: [-0.054, 2.909, 11.52], rotDeg: [-0.001, 0.015, -0.145], scale: [15.893, 14.525, 14.525],
    },
    hanging_monitor_2: {
      pos: [-7.366, -0.0, 0.0], rotDeg: [0, 0, 0], scale: [1, 1, 1],
    },
    hanging_monitor_duplicated: {
      pos: [8.209, 2.86, 13.009], rotDeg: [-1.056, -24.729, -0.281], scale: [9.205, 15.273, 14.525],
    },
    monitor_2_duplicated: {
      pos: [-28.685, -6.409, 22.758], rotDeg: [0, 25.068, 0], scale: [8.711, 11.422, 9.298],
    },
    hanging_monitor_duplicated_duplicated: {
      pos: [-8.304, 2.86, 12.855], rotDeg: [-1.058, 24.992, 0.608], scale: [9.399, 14.018, 14.525],
    },
  };

  const applyNamedTransform = (obj, name) => {
    const t = TARGET_TRANSFORMS[name];
    if (!obj || !t) return;
    obj.position.set(...t.pos);
    const [rx, ry, rz] = t.rotDeg;
    obj.rotation.set(
      THREE.MathUtils.degToRad(rx),
      THREE.MathUtils.degToRad(ry),
      THREE.MathUtils.degToRad(rz)
    );
    obj.scale.set(...t.scale);
    obj.updateMatrixWorld(true);
  };

  const applyTransformsToAll = () => {
    const roots = selectableRootsRef.current || [];
    roots.forEach((r) => {
      if (!r || !r.name) return;
      if (TARGET_TRANSFORMS[r.name]) applyNamedTransform(r, r.name);
    });
  };

  // Determine which base root to clone for a given target name
  const getBaseKeyForName = (name) => {
    if (!name) return null;
    if (name.startsWith("ultrawide_monitor")) return "ultrawide_monitor";
    if (name.startsWith("hanging_monitor")) return "hanging_monitor";
    if (name.startsWith("monitor")) return "monitor";
    return null;
  };

  // Other helpers
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const computeStatsForIndex = (arr, idx) => {
    if (!arr || !arr.length) return null;
    idx = clamp(idx, 0, arr.length - 1);
    const d = arr[idx];
    const ref = arr[Math.max(0, idx - 1)] || d; // compare to previous close or open
    const chg = d.c - (ref ? ref.c : d.o);
    const base = (ref ? ref.c : d.o) || 1;
    const chgPct = (chg / base) * 100;
    return { o: d.o, h: d.h, l: d.l, c: d.c, chg, chgPct, vol: d.v, up: chg >= 0 };
  };
  const formatNumber = (n) => (Math.round(n * 100) / 100).toFixed(2);
  const formatPct = (n) => `${(Math.round(n * 100) / 100).toFixed(2)}%`;
  const formatVol = (v) => {
    if (v >= 1e9) return (v / 1e9).toFixed(1) + "B";
    if (v >= 1e6) return (v / 1e6).toFixed(1) + "M";
    if (v >= 1e3) return (v / 1e3).toFixed(1) + "K";
    return String(v);
  };

  // Initialize 3D scene - exact same setup as original
  useEffect(() => {
    // Initialize removed names from localStorage, and ensure ultrawide_monitor_2 is removed by default
    try {
      const saved = JSON.parse(localStorage.getItem("vlab.removedNames") || "[]");
      if (Array.isArray(saved)) saved.forEach((n) => removedNamesRef.current.add(String(n)));
    } catch {}
    removedNamesRef.current.add("ultrawide_monitor_2");
    removedNamesRef.current.add("hanging_monitor_2");
    removedNamesRef.current.add("monitor");
    const persistRemovedNames = () => {
      try { localStorage.setItem("vlab.removedNames", JSON.stringify(Array.from(removedNamesRef.current))); } catch {}
    };
    // Persist defaults so they survive subsequent reloads
    persistRemovedNames();
    // Simple restore helpers in dev console
    window.vlab = window.vlab || {};
    window.vlab.restore = (name) => { removedNamesRef.current.delete(name); persistRemovedNames(); ensureTargetsFromTable(); };
    window.vlab.restoreAll = () => { removedNamesRef.current.clear(); persistRemovedNames(); ensureTargetsFromTable(); };

    // Ensure that every entry in TARGET_TRANSFORMS exists in the scene. If not, clone from base.
    const ensureTargetsFromTable = (attempt = 0, maxAttempts = 8, delayMs = 300) => {
      const scene = sceneRef.current;
      if (!scene) return;
      let missingBase = false;
      // If base models aren't loaded yet, retry shortly
      if (baseLoadsCountRef.current < baseLoadsTargetRef.current) {
        if (attempt < maxAttempts) {
          setTimeout(() => ensureTargetsFromTable(attempt + 1, maxAttempts, delayMs), delayMs);
        }
        return;
      }
      Object.keys(TARGET_TRANSFORMS).forEach((targetName) => {
        // If name is marked as removed, ensure it's not in the scene and skip spawning
        if (removedNamesRef.current.has(targetName)) {
          const existing = nameToRootRef.current.get(targetName);
          if (existing) {
            transformControlsRef.current?.detach();
            scene.remove(existing);
            // Avoid disposing base root assets so we can still clone from them
            const baseKeyForExisting = getBaseKeyForName(targetName);
            const isBaseRoot = baseKeyForExisting && baseRootsRef.current[baseKeyForExisting] === existing;
            if (!isBaseRoot) {
              existing.traverse((child) => {
                if (child.isMesh) {
                  if (child.geometry && child.geometry.dispose) child.geometry.dispose();
                  const mats = Array.isArray(child.material) ? child.material : [child.material];
                  mats.forEach((m) => m && m.dispose && m.dispose());
                }
              });
            }
            const idx = selectableRootsRef.current.indexOf(existing);
            if (idx >= 0) selectableRootsRef.current.splice(idx, 1);
            if (existing.name) nameToRootRef.current.delete(existing.name);
            if (selectedRootRef.current === existing) {
              selectedRootRef.current = null;
              setSelected(false);
            }
          }
          return; // skip spawning this name
        }
        if (nameToRootRef.current.has(targetName)) return; // already exists
        const baseKey = getBaseKeyForName(targetName);
        const base = baseKey && baseRootsRef.current[baseKey];
        if (!base) {
          missingBase = true;
          return;
        }
        // Clone and name exactly as target
        const clone = base.clone(true);
        clone.name = targetName;
        clone.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            if (child.material && child.material.isMaterial) child.material = child.material.clone();
          }
        });
        scene.add(clone);
        selectableRootsRef.current.push(clone);
        nameToRootRef.current.set(targetName, clone);
        applyNamedTransform(clone, targetName);
      });
      // Ensure ultrawide clones also show the chart texture
      ensureChartOnUltrawides();
      if (missingBase && attempt < maxAttempts) {
        setTimeout(() => ensureTargetsFromTable(attempt + 1, maxAttempts, delayMs), delayMs);
      }
    };
    // Create scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);
    sceneRef.current = scene;

    // Create camera
    const camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    camera.position.copy(CAMERA_POSITION);
    cameraRef.current = camera;

    // Create renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      logarithmicDepthBuffer: true,
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Create orbit controls
    const orbitControls = new OrbitControls(camera, renderer.domElement);
    orbitControls.enableDamping = true;
    orbitControls.dampingFactor = 0.05;
    orbitControls.screenSpacePanning = true;
    orbitControls.minDistance = 5;
    orbitControls.maxDistance = 50;
    orbitControls.maxPolarAngle = Math.PI / 2;
    controlsRef.current = orbitControls;

  // Set default view as requested
  camera.position.set(-1.43, 3.43, 22.99);
  orbitControls.target.set(-0.15, 0.12, -0.03);
  camera.fov = 75.0;
  camera.updateProjectionMatrix();
  orbitControls.update();

    // View overlay removed; no controls change listener

    // Create grid - exact same as original
    const grid = new THREE.GridHelper(
      GRID_SIZE,
      GRID_DIVISIONS,
      0x888888,
      0x444444
    );
    grid.material.opacity = 0.5;
    grid.material.transparent = true;
    scene.add(grid);

    // Add a receiving plane to better place objects and receive shadows
    const planeGeo = new THREE.PlaneGeometry(GRID_SIZE, GRID_SIZE);
    const planeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
  const plane = new THREE.Mesh(planeGeo, planeMat);
    plane.rotation.x = -Math.PI / 2; // make it horizontal
    plane.position.y = 0; // y=0 ground
    plane.receiveShadow = true;
    scene.add(plane);
  groundPlaneMeshRef.current = plane;

  // Create lighting - exact same as original
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.9);
    directionalLight.position.set(5, 8, 5);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = SHADOW_MAP_SIZE;
    directionalLight.shadow.mapSize.height = SHADOW_MAP_SIZE;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 50;
    scene.add(directionalLight);

    // Add transform controls (selection-based transforms)
    const tControls = new TransformControls(camera, renderer.domElement);
    // Disable orbit controls while transforming
    tControls.addEventListener("dragging-changed", (event) => {
      if (controlsRef.current) controlsRef.current.enabled = !event.value;
    });
    // Track gizmo interaction to avoid deselecting while using handles
    tControls.addEventListener("mouseDown", () => {
      gizmoActiveRef.current = true;
    });
    tControls.addEventListener("mouseUp", () => {
      gizmoActiveRef.current = false;
    });
    // Relay transform changes upward if requested
    tControls.addEventListener("objectChange", () => {
      const obj = tControls.object;
      if (obj && props?.onTransform) {
        props.onTransform({
          position: obj.position.clone(),
          rotation: obj.rotation.clone(),
          scale: obj.scale.clone(),
        });
      }
    });
    scene.add(tControls);
    transformControlsRef.current = tControls;

    // Load and place the GLB model on the plane
    const loader = new GLTFLoader();
    loader.load(
      "/ultrawide_monitor.glb",
      (gltf) => {
        const model = gltf.scene;

        // Enable shadows
        model.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });

  // Assign a deterministic name for the primary model
  model.name = "ultrawide_monitor";
  nameToRootRef.current.set("ultrawide_monitor", model);
  scene.add(model);
  modelRef.current = model;
  // Track as a selectable root
  selectableRootsRef.current.push(model);
  // Save base root
  baseRootsRef.current["ultrawide_monitor"] = model;
  // Apply fixed transform if defined
  applyNamedTransform(model, model.name);
  // Count base load and maybe finalize
  baseLoadsCountRef.current += 1;

        // Notify parent about initial selection state (none) and position
        if (props?.onPositionChange) {
          const p = model.position;
          props.onPositionChange({ x: p.x, y: p.y, z: p.z });
        }

  // After model is placed, set up a live chart on the screen
        setupChartOnMonitor();

        // After the primary model, also load additional monitors and place them on the plane
        const loadAndPlace = (path, xOffset) => {
          loader.load(
            path,
            (g) => {
              const m = g.scene.clone();
              // Enable shadows
              m.traverse((child) => {
                if (child.isMesh) {
                  child.castShadow = true;
                  child.receiveShadow = true;
                }
              });
              // Assign deterministic names for base models
              const desired = baseNameFromPath(path);
              m.name = desired;
              nameToRootRef.current.set(desired, m);
              // Offset only when we don't have a fixed transform for this base
              const hasFixed = !!TARGET_TRANSFORMS[desired];
              if (!hasFixed) {
                // Normalize base to y=0 and center
                const box = new THREE.Box3().setFromObject(m);
                const center = box.getCenter(new THREE.Vector3());
                const minY = box.min.y;
                m.position.y -= minY; // place base on plane
                m.position.x -= center.x; // center
                m.position.z -= center.z;
                // Optional: scale down if huge
                const size = box.getSize(new THREE.Vector3());
                const maxDimension = Math.max(size.x, size.y, size.z);
                if (maxDimension > GRID_SIZE * 0.8) {
                  const scale = (GRID_SIZE * 0.5) / maxDimension;
                  m.scale.setScalar(scale);
                }
                // Offset on X beside the ultrawide monitor
                m.position.x += xOffset;
              }
              scene.add(m);
              // Track as selectable
              selectableRootsRef.current.push(m);
              // Save base roots by canonical file base
              const base = baseNameFromPath(path);
              baseRootsRef.current[base] = m;
              // Apply fixed transform if defined
              applyNamedTransform(m, m.name);
              // Count base load and maybe finalize
              baseLoadsCountRef.current += 1;
              if (baseLoadsCountRef.current >= baseLoadsTargetRef.current) {
                ensureTargetsFromTable();
                applyTransformsToAll();
              }
            },
            undefined,
            (err) => console.warn(`Failed to load ${path}:`, err)
          );
        };

        // Compute a side offset using the placed ultrawide monitor size
        const mainBox = new THREE.Box3().setFromObject(model);
        const mainSize = mainBox.getSize(new THREE.Vector3());
        const gap = 1.0; // 1 unit gap between models
        const side = (mainSize.x || 3) / 2 + gap;
        // Place a standard monitor on the right and a hanging monitor on the left
        loadAndPlace("/monitor.glb", +side + 1.0);
        loadAndPlace("/hanging_monitor.glb", -side - 1.0);

        // No timeout needed; we trigger ensureTargetsFromTable when all base models finish loading.
      },
      undefined,
      (err) => {
        console.error("Failed to load GLB:", err);
      }
    );

    // Helper: find the most likely screen mesh by name heuristics
    const findScreenMesh = (root) => {
      if (!root) return null;
      const nameRegex = /(screen|display|panel|monitor|lcd)/i;
      const exactNames = ["Screen", "Display", "Panel", "LCD", "Monitor", "ScreenSurface", "screen", "display", "panel", "lcd", "monitor", "Screen_Mat", "ScreenMesh"];
      let best = { mesh: null, score: -Infinity };

      root.traverse((child) => {
        if (!child.isMesh) return;
        // Exact name boost
        const isExact = child.name && exactNames.includes(child.name);
        const geom = child.geometry;
        const hasUV = !!(geom && geom.attributes && geom.attributes.uv);
        const box = new THREE.Box3().setFromObject(child);
        const size = new THREE.Vector3();
        box.getSize(size);
        const areaXY = size.x * size.y; // approximate front area

        // Base score by name + UVs + area
        let score = 0;
        if (isExact) score += 25;
        if (child.name && nameRegex.test(child.name)) score += 10;
        if (hasUV) score += 2;
        score += Math.min(areaXY, 1000) * 0.01; // dampen area influence

        // If the material already has a texture map with ultrawide aspect, boost heavily
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        let hasUltraWide = false;
        for (const m of mats) {
          const img = m && m.map && m.map.image;
          if (img && img.width && img.height) {
            const aspect = img.width / img.height;
            if (aspect >= 2.0) { // ultrawide-ish
              score += 20;
              hasUltraWide = true;
              break;
            }
          }
        }

        // Prefer relatively flat, wide, vertical-ish panels: x wide, y tall, z thin
        if (size.x > size.y && size.z < Math.min(size.x, size.y) * 0.2) score += 5;

        if (score > best.score) best = { mesh: child, score };
      });

      if (!best.mesh) return null;
      console.log("[VideoScreen] Selected screen mesh:", best.mesh.name || best.mesh.uuid, "score=", best.score);
      return best.mesh;
    };

    // Compute pixel bounds of the screen mesh on the canvas
    const computeScreenBounds = () => {
      const mesh = screenMeshRef.current;
      const renderer = rendererRef.current;
      const camera = cameraRef.current;
      if (!mesh || !renderer || !camera) return null;
      mesh.updateWorldMatrix(true, false);
      const geom = mesh.geometry;
      if (!geom.boundingBox) geom.computeBoundingBox();
      const bb = geom.boundingBox.clone(); // local space
      const corners = [
        new THREE.Vector3(bb.min.x, bb.min.y, bb.min.z),
        new THREE.Vector3(bb.min.x, bb.min.y, bb.max.z),
        new THREE.Vector3(bb.min.x, bb.max.y, bb.min.z),
        new THREE.Vector3(bb.min.x, bb.max.y, bb.max.z),
        new THREE.Vector3(bb.max.x, bb.min.y, bb.min.z),
        new THREE.Vector3(bb.max.x, bb.min.y, bb.max.z),
        new THREE.Vector3(bb.max.x, bb.max.y, bb.min.z),
        new THREE.Vector3(bb.max.x, bb.max.y, bb.max.z),
      ];
      const rect = renderer.domElement.getBoundingClientRect();
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const v of corners) {
        const wp = v.clone().applyMatrix4(mesh.matrixWorld).project(camera);
        const x = ((wp.x + 1) / 2) * rect.width;
        const y = (1 - (wp.y + 1) / 2) * rect.height;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      const bounds = { left: minX, right: maxX, top: minY, bottom: maxY, width: maxX - minX, height: maxY - minY };
      screenBoundsRef.current = bounds;
      setScreenBounds(bounds);
      return bounds;
    };

    // Apply existing chart texture to a screen mesh (used for duplicates)
    const applyChartTextureToMesh = (mesh) => {
      if (!mesh || !chartTextureRef.current) return;
      const mat = new THREE.MeshBasicMaterial({ map: chartTextureRef.current, toneMapped: false });
      mat.needsUpdate = true;
      if (Array.isArray(mesh.material)) {
        const newMats = mesh.material.slice();
        let replaced = false;
        for (let i = 0; i < newMats.length; i++) {
          const m = newMats[i];
          const hasMap = !!(m && m.map);
          const img = hasMap && m.map && m.map.image;
          const ultra = img && img.width && img.height && (img.width / img.height >= 1.6);
          if (ultra || hasMap) {
            newMats[i] = mat;
            replaced = true;
          }
        }
        mesh.material = replaced ? newMats : mat;
      } else {
        mesh.material = mat;
      }
    };

    const ensureChartOnRoot = (root) => {
      if (!root) return;
      const mesh = findScreenMesh(root);
      if (mesh) applyChartTextureToMesh(mesh);
    };

    const ensureChartOnUltrawides = () => {
      // Initialize chart once on the primary if not initialized
      if (!chartTextureRef.current) {
        setupChartOnMonitor();
      }
      const roots = selectableRootsRef.current || [];
      roots.forEach((r) => {
        if (!r || !r.name || !r.name.startsWith("ultrawide_monitor")) return;
        ensureChartOnRoot(r);
      });
    };

    // Helper: set up video texture and apply to found screen mesh
    const setupChartOnMonitor = () => {
      const model = modelRef.current;
      if (!model) return;
      let screenMesh = findScreenMesh(model);
      if (!screenMesh) {
        console.warn("[VideoScreen] No screen-like mesh found yet. Will retry after textures load...");
        // Retry once after a short delay (textures in GLB may still be decoding)
        setTimeout(() => {
          const retry = findScreenMesh(modelRef.current);
          if (!retry) {
            console.warn("[VideoScreen] Screen mesh not found. Consider naming the mesh 'Screen' in the GLB.");
            return;
          }
          applyChartToMesh(retry);
        }, 350);
        return;
      }
      screenMeshRef.current = screenMesh;
  // Compute initial bounds once screen is found
  computeScreenBounds();

  // Create offscreen canvas for chart
      const canvas = document.createElement("canvas");
      // Choose a resolution matching ultrawide monitor look
      canvas.width = 1600; // 20:9
      canvas.height = 720;
      chartCanvasRef.current = canvas;

  // Generate initial synthetic OHLCV data
  const ohlcv = generateOHLCWithVolume(120, 856.0);

  // Create CanvasTexture for three.js
      const ctex = new THREE.CanvasTexture(canvas);
      ctex.colorSpace = THREE.SRGBColorSpace;
      ctex.minFilter = THREE.LinearFilter;
      ctex.magFilter = THREE.LinearFilter;
      ctex.needsUpdate = true;
      chartTextureRef.current = ctex;

      const applyChartToMesh = (mesh) => {
        const mat = new THREE.MeshBasicMaterial({ map: ctex, toneMapped: false });
        mat.needsUpdate = true;
        if (Array.isArray(mesh.material)) {
          const newMats = mesh.material.slice();
          let replaced = false;
          for (let i = 0; i < newMats.length; i++) {
            const m = newMats[i];
            const hasMap = !!(m && m.map);
            const img = hasMap && m.map && m.map.image;
            const ultra = img && img.width && img.height && (img.width / img.height >= 1.6);
            if (ultra || hasMap) {
              newMats[i] = mat;
              replaced = true;
            }
          }
          mesh.material = replaced ? newMats : mat;
        } else {
          mesh.material = mat;
        }
      };

      applyChartToMesh(screenMesh);

      // Initialize view state
      chartViewCountRef.current = Math.min(120, ohlcv.length);
      chartViewStartRef.current = Math.max(0, ohlcv.length - chartViewCountRef.current);

      // Draw initial chart
      drawChart(canvas, ohlcv, chartViewStartRef.current, chartViewCountRef.current);
      ctex.needsUpdate = true;
  // Initialize hover stats to latest candle
  setHoverStats(computeStatsForIndex(ohlcv, Math.max(0, ohlcv.length - 1)));

      // Update the chart every second with a new candle and refresh the texture
      let tickId = 0;
      // Expose data to interaction handlers
      window.__ohlcv_data = ohlcv;
      window.__ohlcv_len = ohlcv.length;

      const updateLoop = () => {
        appendNextCandleArray(ohlcv);
        // keep a rolling window
        if (ohlcv.length > 360) ohlcv.shift();
        window.__ohlcv_len = ohlcv.length;
        // Maintain auto-follow if currently at right edge
        const viewCount = clamp(chartViewCountRef.current, 20, Math.max(20, ohlcv.length));
        let viewStart = chartViewStartRef.current;
        if (chartAutoFollowRef.current) {
          viewStart = Math.max(0, ohlcv.length - viewCount);
        } else {
          // Clamp after data changes
          viewStart = clamp(viewStart, 0, Math.max(0, ohlcv.length - viewCount));
        }
        chartViewStartRef.current = viewStart;
        chartViewCountRef.current = viewCount;

  drawChart(canvas, ohlcv, viewStart, viewCount);
        ctex.needsUpdate = true;
        // If not hovering the screen, keep stats on the latest candle
        if (!chartHoveringRef.current) {
          setHoverStats(computeStatsForIndex(ohlcv, Math.max(0, ohlcv.length - 1)));
        }
        tickId = window.setTimeout(updateLoop, 1000);
      };
      updateLoop();

      // Store timer id for cleanup
      canvas.dataset.__tick = String(tickId);
    };

    // Utilities: generate/append OHLC data
    const generateOHLCWithVolume = (n, start = 100) => {
      let t = Date.now() - n * 60000; // 1-min bars
      let price = start;
      const data = [];
      for (let i = 0; i < n; i++) {
        const open = price;
        const drift = (Math.random() - 0.5) * 1.8; // volatility
        let close = open + drift;
        const high = Math.max(open, close) + Math.random() * 0.9;
        const low = Math.min(open, close) - Math.random() * 0.9;
        const vol = Math.floor(10000 + Math.random() * 50000);
        data.push({ x: new Date(t), o: round2(open), h: round2(high), l: round2(low), c: round2(close), v: vol });
        price = close;
        t += 60000;
      }
      return data;
    };

    const appendNextCandleArray = (arr) => {
      const last = arr[arr.length - 1];
      const lastClose = last.c;
      const open = lastClose;
      const drift = (Math.random() - 0.5) * 1.8;
      const close = open + drift;
      const high = Math.max(open, close) + Math.random() * 0.9;
      const low = Math.min(open, close) - Math.random() * 0.9;
      const now = new Date(last.x.getTime() + 60000);
      const vol = Math.floor(10000 + Math.random() * 50000);
      arr.push({ x: now, o: round2(open), h: round2(high), l: round2(low), c: round2(close), v: vol });
    };

    const round2 = (x) => Math.round(x * 100) / 100;

    // Render a candlestick + volume chart into the canvas
    const drawChart = (canvas, data, viewStart = 0, viewCount = data.length) => {
      const ctx = canvas.getContext("2d");
      const W = canvas.width, H = canvas.height;
      ctx.save();
      // Background
      ctx.fillStyle = "#0b0f14"; // near black
      ctx.fillRect(0, 0, W, H);

      const margin = { l: 60, r: 20, t: 20, b: 28 };
      const volPaneH = Math.floor(H * 0.22);
      const pricePaneH = H - volPaneH - margin.t - margin.b;
      const priceTop = margin.t;
      const priceBottom = margin.t + pricePaneH;
      const volTop = priceBottom + 8;
      const volBottom = H - margin.b;

      // Slice visible window
      const n = Math.max(1, Math.min(viewCount, data.length));
      const start = clamp(viewStart, 0, Math.max(0, data.length - n));
      const end = Math.min(data.length, start + n);
      const view = data.slice(start, end);
      // x-position mapping across visible window
      const xs = (i) => margin.l + (i * (W - margin.l - margin.r)) / Math.max(1, n - 1);
      // Price scale
      let pMin = Infinity, pMax = -Infinity, vMax = 0;
      for (const d of view) {
        if (d.l < pMin) pMin = d.l;
        if (d.h > pMax) pMax = d.h;
        if (d.v > vMax) vMax = d.v;
      }
      chartScaleRef.current = { pMin, pMax };
      // add a bit of headroom
      const pad = (pMax - pMin) * 0.05;
      pMin -= pad; pMax += pad;
      const yPrice = (p) => priceBottom - ((p - pMin) / (pMax - pMin)) * (priceBottom - priceTop);
      const yVol = (v) => volBottom - (v / (vMax || 1)) * (volBottom - volTop);

      // Grid lines (horizontal)
      ctx.strokeStyle = "#1f2937"; // dark gray
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let g = 0; g <= 4; g++) {
        const y = priceTop + (g * (priceBottom - priceTop)) / 4;
        ctx.moveTo(margin.l, y);
        ctx.lineTo(W - margin.r, y);
      }
      ctx.stroke();

      // Candles
      const bodyW = Math.max(2, ((W - margin.l - margin.r) / Math.max(30, n)) * 0.8);
      for (let i = 0; i < n; i++) {
        const d = view[i];
        const x = xs(i);
        const up = d.c >= d.o;
        const col = up ? "#10b981" : "#ef4444";
        // wick
        ctx.strokeStyle = col;
        ctx.beginPath();
        ctx.moveTo(x, yPrice(d.h));
        ctx.lineTo(x, yPrice(d.l));
        ctx.stroke();
        // body
        const yO = yPrice(d.o);
        const yC = yPrice(d.c);
        const top = Math.min(yO, yC);
        const h = Math.max(1, Math.abs(yO - yC));
        ctx.fillStyle = col;
        ctx.fillRect(x - bodyW / 2, top, bodyW, h);
      }

      // Volume bars
      for (let i = 0; i < n; i++) {
        const d = view[i];
        const x = xs(i);
        const up = d.c >= d.o;
        ctx.fillStyle = up ? "rgba(16,185,129,0.5)" : "rgba(239,68,68,0.5)";
        const y = yVol(d.v);
        const w = Math.max(1, bodyW * 0.9);
        ctx.fillRect(x - w / 2, y, w, volBottom - y);
      }

      // Compute price ticks for DOM overlay (top -> bottom)
      const ticks = [];
      for (let g = 0; g <= 4; g++) {
        // top is pMax, bottom is pMin
        const p = pMax - (g * (pMax - pMin)) / 4;
        ticks.push(p.toFixed(2));
      }
      // Update state once per draw
      setPriceTicks(ticks);

      ctx.restore();
    };

    // Utility helpers moved to component scope above

    // Pointer helpers
    const getPointer = (event) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointerRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointerRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    };

    const setCursor = (value) => {
      renderer.domElement.style.cursor = value;
    };

    // Raycast against all selectable roots
    const intersectModel = () => {
      const roots = selectableRootsRef.current.filter(Boolean);
      if (!roots.length) return [];
      return raycasterRef.current.intersectObjects(roots, true);
    };

    const findSelectableRoot = (obj) => {
      if (!obj) return null;
      for (const root of selectableRootsRef.current) {
        if (!root) continue;
        if (root === obj) return root;
        if (root.getObjectById && root.getObjectById(obj.id)) return root;
      }
      return null;
    };

    const onPointerMove = (event) => {
      if (!camera || !renderer) return;
      getPointer(event);
      raycasterRef.current.setFromCamera(pointerRef.current, camera);

      // Hover feedback
      const hits = intersectModel();
      // Determine if hovering the screen mesh
      let overScreen = false;
      let screenHit = null;
      if (screenMeshRef.current) {
        screenHit = hits.find((h) => h.object === screenMeshRef.current);
        overScreen = !!screenHit;
      }

  chartHoveringRef.current = overScreen;
  setChartHovering(overScreen);
      // While hovering the screen, disable camera zoom so wheel only affects the chart
      if (controlsRef.current) {
        controlsRef.current.enableZoom = !overScreen;
      }
      if (chartDraggingRef.current) {
        // While dragging, pan chart using UV delta
        if (overScreen && screenHit && screenHit.uv) {
          const u = screenHit.uv.x; // [0..1]
          const v = screenHit.uv.y; // [0..1]
          if (chartLastURef.current == null) chartLastURef.current = u;
          let du = u - chartLastURef.current;
          // Negative du should move right (newer candles) and vice versa
          const viewCount = chartViewCountRef.current;
          let shift = Math.round(-du * viewCount);
          if (shift !== 0) {
            const maxStart = Math.max(0, (window.__ohlcv_len || 0) - viewCount);
            let start = clamp(chartViewStartRef.current + shift, 0, maxStart);
            // If user pans away from right edge, disable auto-follow
            chartAutoFollowRef.current = (start + viewCount >= (window.__ohlcv_len || 0) - 1);
            chartViewStartRef.current = start;
            chartLastURef.current = u;
            // Redraw
            if (chartCanvasRef.current) {
              drawChart(chartCanvasRef.current, window.__ohlcv_data || [], start, viewCount);
              if (chartTextureRef.current) chartTextureRef.current.needsUpdate = true;
            }
          }
          // Update hover stats during drag
          const data = window.__ohlcv_data || [];
          const count = chartViewCountRef.current;
          const start = chartViewStartRef.current;
          const idx = clamp(Math.round(start + u * (count - 1)), 0, Math.max(0, data.length - 1));
          setHoverStats(computeStatsForIndex(data, idx));
          // Update hover marker
          const { pMin, pMax } = chartScaleRef.current;
          const price = pMin + v * (pMax - pMin);
          if (renderer && camera && screenHit.point) {
            const p = screenHit.point.clone().project(camera);
            const rect = renderer.domElement.getBoundingClientRect();
            const yPx = (1 - (p.y + 1) / 2) * rect.height;
            setHoverMarker({ visible: true, price, y: yPx });
          }
        }
        setCursor("grabbing");
      } else {
        // Not dragging
        if (overScreen) {
          setCursor("grab");
          // Update hover stats based on cursor position
          const data = window.__ohlcv_data || [];
          if (data.length && screenHit && screenHit.uv) {
            const u = screenHit.uv.x;
            const v = screenHit.uv.y;
            const count = chartViewCountRef.current;
            const start = chartViewStartRef.current;
            const idx = clamp(Math.round(start + u * (count - 1)), 0, Math.max(0, data.length - 1));
            setHoverStats(computeStatsForIndex(data, idx));
            // Update marker
            const { pMin, pMax } = chartScaleRef.current;
            const price = pMin + v * (pMax - pMin);
            if (renderer && camera && screenHit.point) {
              const p = screenHit.point.clone().project(camera);
              const rect = renderer.domElement.getBoundingClientRect();
              const yPx = (1 - (p.y + 1) / 2) * rect.height;
              setHoverMarker({ visible: true, price, y: yPx });
            }
          }
        } else {
          // Outside screen, no selection cursor; keep default
          setCursor("default");
          // If leaving the screen, show latest candle stats
          const data = window.__ohlcv_data || [];
          if (data.length) {
            setHoverStats(computeStatsForIndex(data, data.length - 1));
          }
          setHoverMarker((m) => ({ ...m, visible: false }));
        }
      }
    };

    const onPointerDown = (event) => {
      if (!camera || !renderer) return;
      getPointer(event);
      raycasterRef.current.setFromCamera(pointerRef.current, camera);
      const hits = intersectModel();
      // Only allow chart drag when clicking on the screen; ignore other clicks
      if (screenMeshRef.current) {
        const screenHit = hits.find((h) => h.object === screenMeshRef.current);
        if (screenHit) {
          chartDraggingRef.current = true;
          chartLastURef.current = screenHit.uv ? screenHit.uv.x : null;
          if (controlsRef.current) controlsRef.current.enabled = false;
          setCursor("grabbing");
        }
      }
    };

    const onPointerUp = () => {
      // no-op; TransformControls handles dragging lifecycle
      if (props?.onPositionChange && selectedRootRef.current) {
        const p = selectedRootRef.current.position;
        props.onPositionChange({ x: p.x, y: p.y, z: p.z });
      }
      // Stop chart drag if active
      if (chartDraggingRef.current) {
        chartDraggingRef.current = false;
        chartLastURef.current = null;
        if (controlsRef.current) controlsRef.current.enabled = true;
        setCursor(chartHoveringRef.current ? "grab" : "default");
      }
    };

    // Mouse wheel zoom over screen
    const onWheel = (event) => {
      if (!camera || !renderer) return;
      if (!screenMeshRef.current) return;
      getPointer(event);
      raycasterRef.current.setFromCamera(pointerRef.current, camera);
      const hits = intersectModel();
  const screenHit = hits.find((h) => h.object === screenMeshRef.current);
      if (!screenHit) return; // only zoom when hovering the screen

      // Intercept so OrbitControls doesn't also zoom the camera
      event.preventDefault();
      if (event.stopPropagation) event.stopPropagation();
      if (event.stopImmediatePropagation) event.stopImmediatePropagation();
      const ohlcv = window.__ohlcv_data || [];
      if (!ohlcv.length) return;
  const u = screenHit.uv ? screenHit.uv.x : 0.5; // anchor position
  const v = screenHit.uv ? screenHit.uv.y : 0.5;
      const oldCount = chartViewCountRef.current;
      const minBars = 20;
      const maxBars = Math.max(minBars, ohlcv.length);
      const delta = Math.sign(event.deltaY); // 1 = zoom out, -1 = zoom in
      // Scale view count by 10% per wheel notch
      let newCount = Math.round(oldCount * (1 + delta * 0.1));
      newCount = clamp(newCount, minBars, maxBars);
      const oldStart = chartViewStartRef.current;
      const idxAtCursor = oldStart + u * oldCount;
      let newStart = Math.round(idxAtCursor - u * newCount);
      newStart = clamp(newStart, 0, Math.max(0, ohlcv.length - newCount));
      chartViewStartRef.current = newStart;
      chartViewCountRef.current = newCount;
      chartAutoFollowRef.current = (newStart + newCount >= ohlcv.length - 1);
      // Redraw
      if (chartCanvasRef.current) {
        drawChart(chartCanvasRef.current, ohlcv, newStart, newCount);
        if (chartTextureRef.current) chartTextureRef.current.needsUpdate = true;
      }
      // Update hover stats anchored at cursor after zoom
      const data = window.__ohlcv_data || [];
      if (data.length) {
        const idx = clamp(Math.round(newStart + u * (newCount - 1)), 0, data.length - 1);
        setHoverStats(computeStatsForIndex(data, idx));
        // Update marker
        const { pMin, pMax } = chartScaleRef.current;
        const price = pMin + v * (pMax - pMin);
        if (renderer && camera && screenHit.point) {
          const p = screenHit.point.clone().project(camera);
          const rect = renderer.domElement.getBoundingClientRect();
          const yPx = (1 - (p.y + 1) / 2) * rect.height;
          setHoverMarker({ visible: true, price, y: yPx });
        }
      }
    };

  renderer.domElement.addEventListener("pointermove", onPointerMove, { passive: true });
  renderer.domElement.addEventListener("pointerdown", onPointerDown);
  renderer.domElement.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("pointerup", onPointerUp);

    // Animation loop - exact same as original
    const animate = () => {
      animationFrameRef.current = requestAnimationFrame(animate);
      controlsRef.current?.update();
      // Continuously update screen bounds for alignment during camera movement
      if (screenMeshRef.current) computeScreenBounds();
      renderer.render(scene, camera);
    };
    animate();

    // Handle window resize
    const handleResize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
        // Recompute screen bounds on resize
        computeScreenBounds();
    };
    window.addEventListener("resize", handleResize);

    // Cleanup function
    return () => {
  // No overlay timers/listeners to clean up
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
  window.removeEventListener("pointerup", onPointerUp);
  // Ensure we restore OrbitControls zoom
  if (controlsRef.current) controlsRef.current.enableZoom = true;
  renderer.domElement.removeEventListener("wheel", onWheel);
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(animationFrameRef.current);
      controlsRef.current?.dispose();
      transformControlsRef.current?.dispose();
      // Cleanup chart resources
      try {
        if (chartTextureRef.current) {
          chartTextureRef.current.dispose();
        }
        if (chartCanvasRef.current?.dataset?.__tick) {
          const id = Number(chartCanvasRef.current.dataset.__tick);
          if (!Number.isNaN(id)) window.clearTimeout(id);
        }
      } catch {}
      if (mountRef.current?.contains(renderer.domElement)) {
        mountRef.current.removeChild(renderer.domElement);
      }
      scene.traverse((object) => {
        object.geometry?.dispose();
        if (object.material) {
          Array.isArray(object.material)
            ? object.material.forEach((m) => m.dispose())
            : object.material.dispose();
        }
      });
      renderer.dispose();
    };
  }, []);

  // Keep TransformControls mode in sync with UI
  useEffect(() => {
    if (transformControlsRef.current) {
      transformControlsRef.current.setMode(transformMode);
    }
  }, [transformMode]);

  // Keyboard shortcuts: T (translate), R (rotate), S (scale)
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.code === "KeyT") setTransformMode("translate");
      else if (e.code === "KeyR") setTransformMode("rotate");
      else if (e.code === "KeyS") setTransformMode("scale");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Expose important refs to parent components (if needed)
  useImperativeHandle(
    ref,
    () => ({
      sceneRef,
      cameraRef,
      rendererRef,
      transformControlsRef,
    }),
    []
  );

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      {/* Top stats bar overlay */}
      {chartHovering && (
      <div
        style={{
          position: "absolute",
          top: 8,
          left: 12,
          right: 12,
          zIndex: 11,
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "6px 10px",
          borderRadius: 8,
          background: "rgba(17,24,39,0.6)",
          color: "#e5e7eb",
          fontFamily: "sans-serif",
          fontSize: 13,
          lineHeight: 1.2,
          pointerEvents: "none",
        }}
      >
        <span style={{ fontWeight: 700, color: "#d1d5db" }}>SBIN</span>
        <span style={{ opacity: 0.9 }}>· 1 · NSE</span>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: 8,
            background: "#10b981",
            display: "inline-block",
          }}
        />
        {hoverStats && (
          <>
            <span style={{ color: "#34d399" }}>O {formatNumber(hoverStats.o)}</span>
            <span style={{ color: "#34d399" }}>H {formatNumber(hoverStats.h)}</span>
            <span style={{ color: "#34d399" }}>L {formatNumber(hoverStats.l)}</span>
            <span style={{ color: hoverStats.up ? "#34d399" : "#f87171" }}>
              C {formatNumber(hoverStats.c)}
            </span>
            <span style={{ color: hoverStats.up ? "#34d399" : "#f87171" }}>
              {hoverStats.up ? "+" : ""}
              {formatNumber(hoverStats.chg)}
            </span>
            <span style={{ color: hoverStats.up ? "#34d399" : "#f87171" }}>
              ({hoverStats.up ? "+" : ""}
              {formatPct(hoverStats.chgPct)})
            </span>
            <span style={{ color: "#60a5fa" }}>
              Volume {formatVol(hoverStats.vol)}
            </span>
          </>
        )}
  </div>
  )}
      <div
        ref={mountRef}
        className="workspace-canvas"
        style={{ width: "100%", height: "100%" }}
      />
      {/* Hover guideline and price pill */}
      {hoverMarker?.visible && screenBounds && (
        <>
          {/* dashed horizontal line */}
          <div
            style={{
              position: "absolute",
              left: screenBounds.left,
              width: screenBounds.width,
              top: Math.min(Math.max(hoverMarker.y, screenBounds.top), screenBounds.bottom) - 1,
              height: 0,
              borderTop: "2px dashed rgba(229,231,235,0.6)",
              pointerEvents: "none",
              zIndex: 11,
            }}
          />
          {/* right side price pill */}
          <div
            style={{
              position: "absolute",
              right: 12,
              top: Math.min(Math.max(hoverMarker.y, screenBounds.top), screenBounds.bottom) - 12,
              padding: "4px 8px",
              borderRadius: 6,
              background: "#6b7280",
              color: "#fff",
              fontSize: 12,
              fontFamily: "sans-serif",
              display: "flex",
              alignItems: "center",
              gap: 6,
              zIndex: 12,
              pointerEvents: "none",
            }}
          >
            <span
              style={{
                width: 16,
                height: 16,
                borderRadius: 16,
                border: "2px solid #e5e7eb",
                display: "inline-block",
                lineHeight: 0,
              }}
            />
            <span>{formatNumber(hoverMarker.price)}</span>
          </div>
        </>
      )}
      {/* Price labels on the right side of the website (aligned to screen vertical bounds) */}
      {chartHovering && (
      <div
        style={{
          position: "absolute",
          right: 12,
          top: screenBounds ? screenBounds.top : "50%",
          transform: screenBounds ? "none" : "translateY(-50%)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          gap: 6,
          height: screenBounds ? screenBounds.height : 240,
          padding: "8px 10px",
          borderRadius: 8,
          background: "rgba(17,24,39,0.6)",
          color: "#e5e7eb",
          pointerEvents: "none",
          fontFamily: "sans-serif",
        }}
      >
        {priceTicks.map((t, i) => (
          <span key={i} style={{ fontSize: 12 }}>{t}</span>
        ))}
      </div>
      )}
      {/* View overlay removed */}
      {/* No transform toolbar shown since models are fixed */}
    </div>
  );
});

WorkspaceCanvas.displayName = "WorkspaceCanvas";

export default WorkspaceCanvas;
