'use client';

import React, { useRef, useCallback, useEffect, useState } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import {
  OrbitControls,
  Grid,
  GizmoHelper,
  GizmoViewport,
  ContactShadows,
  Environment,
} from '@react-three/drei';
import {
  EffectComposer,
  Bloom,
  SSAO,
  DepthOfField,
  ChromaticAberration,
  Vignette,
  Noise,
  BrightnessContrast,
  HueSaturation
} from '@react-three/postprocessing';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { extractMeshes, computeModelStats } from '@/utils/modelExtractor';
import type {
  MeshInfo,
  ModelStats,
  PerformanceStats,
  SceneAnalysisReport,
  LightingConfig,
  DebugRenderMode,
  AnimationClipInfo,
  PlaybackConfig
} from '@/types/model';
import { useSceneIntelligence } from '@/hooks/useSceneIntelligence';
import { DebugMaterialEngine } from '@/core/debug/DebugMaterialEngine';
import { AnimationEngine } from '@/core/animation/AnimationEngine';

// ──────────────────────────────────────────────
// Highlight selected mesh with a BoxHelper outline
// (avoids touching shared materials – the emissive
//  approach turned the whole GLTF model blue because
//  meshes share material instances)
// ──────────────────────────────────────────────
function SelectionBox({
  scene,
  selectedMeshUuid,
  highlightedUuids = [],
}: {
  scene: THREE.Object3D | null;
  selectedMeshUuid: string | null;
    highlightedUuids?: string[];
}) {
  const helpersRef = useRef<THREE.BoxHelper[]>([]);
  const { scene: threeScene, invalidate } = useThree();

  useEffect(() => {
    // Clear previous helpers
    helpersRef.current.forEach(h => {
      threeScene.remove(h);
      h.dispose();
    });
    helpersRef.current = [];

    if (!scene) { invalidate(); return; }

    const targets = new Set<string>();
    if (selectedMeshUuid) targets.add(selectedMeshUuid);
    highlightedUuids.forEach(id => targets.add(id));

    if (targets.size === 0) { invalidate(); return; }

    scene.traverse((node) => {
      if (node instanceof THREE.Mesh && targets.has(node.uuid)) {
        const color = node.uuid === selectedMeshUuid ? 0x7c6af7 : 0x22d3a3;
        const helper = new THREE.BoxHelper(node, color);
        (helper.material as THREE.LineBasicMaterial).linewidth = 2;
        threeScene.add(helper);
        helpersRef.current.push(helper);
      }
    });

    invalidate();

    return () => {
      helpersRef.current.forEach(h => {
        threeScene.remove(h);
        h.dispose();
      });
      helpersRef.current = [];
    };
  }, [selectedMeshUuid, highlightedUuids, scene, threeScene, invalidate]);

  // Keep the boxes updated if meshes move
  useEffect(() => {
    if (helpersRef.current.length === 0) return;
    const interval = setInterval(() => {
      helpersRef.current.forEach(h => h.update());
    }, 100);
    return () => clearInterval(interval);
  }, [selectedMeshUuid, highlightedUuids]);

  return null;
}

// ──────────────────────────────────────────────
// Auto-fit camera to bounding box of model
// ──────────────────────────────────────────────
function AutoFitCamera({ scene }: { scene: THREE.Object3D | null }) {
  const { camera, invalidate } = useThree();

  useEffect(() => {
    if (!scene) return;
    const box = new THREE.Box3().setFromObject(scene);
    if (!isFinite(box.min.x)) return;
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = (camera as THREE.PerspectiveCamera).fov ?? 50;
    const distance = (maxDim / (2 * Math.tan((fov * Math.PI) / 360))) * 1.6;
    const spherical = new THREE.Spherical(distance, Math.PI / 3.5, Math.PI / 4);
    const newPos = new THREE.Vector3().setFromSpherical(spherical).add(center);
    camera.position.copy(newPos);
    camera.lookAt(center);
    invalidate();
  }, [scene, camera, invalidate]);

  return null;
}

// ──────────────────────────────────────────────
// Wireframe controller
// ──────────────────────────────────────────────
function WireframeController({
  scene,
  enabled,
}: {
  scene: THREE.Object3D | null;
  enabled: boolean;
}) {
  useEffect(() => {
    if (!scene) return;
    scene.traverse((node) => {
      if (node instanceof THREE.Mesh) {
        const mats = Array.isArray(node.material) ? node.material : [node.material];
        mats.forEach((mat: any) => {
          if (mat.wireframe !== undefined) mat.wireframe = enabled;
        });
      }
    });
  }, [scene, enabled]);
  return null;
}

// ──────────────────────────────────────────────
// Model primitive + click
// ──────────────────────────────────────────────
function ModelObject({
  model,
  onMeshClick,
}: {
  model: THREE.Object3D;
  onMeshClick: (uuid: string) => void;
}) {
  return (
    <primitive
      object={model}
      onClick={(e: any) => {
        e.stopPropagation();
        if (e.object instanceof THREE.Mesh) onMeshClick(e.object.uuid);
      }}
    />
  );
}

// ──────────────────────────────────────────────
// Performance Monitor Component
// ──────────────────────────────────────────────
function PerformanceMonitor({
  onUpdate,
}: {
  onUpdate: (stats: PerformanceStats) => void;
}) {
  const { gl } = useThree();
  const lastTime = useRef(performance.now());
  const frames = useRef(0);
  const lastUpdate = useRef(0);

  useFrame((state) => {
    frames.current++;
    const now = performance.now();
    const frameTime = now - state.clock.oldTime;

    // Pulse update every 500ms for heavy stats
    if (now >= lastUpdate.current + 500) {
      const elapsed = now - lastTime.current;
      const fps = Math.round((frames.current * 1000) / elapsed);

      // Memory estimation
      let geometryMemory = 0;
      let textureMemory = 0;

      // renderer.info.memory is more reliable/global in Three.js
      // than traversing every frame.
      // But for specific breakdown, we'd need traversal.
      // We'll use renderer.info + some heuristics if needed.

      const stats: PerformanceStats = {
        fps,
        frameTime: Math.min(frameTime * 1000, 1000), // ms
        drawCalls: gl.info.render.calls,
        triangles: gl.info.render.triangles,
        vertices: 0, // Not directly available from gl.info, would need to sum attributes
        geometries: gl.info.memory.geometries,
        textures: gl.info.memory.textures,
        programs: gl.info.programs ? gl.info.programs.length : 0,
        memory: {
          geometries: gl.info.memory.geometries * 1024 * 100, // Heuristic: avg 100kb per geometry
          textures: gl.info.memory.textures * 1024 * 512, // Heuristic: avg 512kb per texture
        },
      };

      // Reset counters
      frames.current = 0;
      lastTime.current = now;
      lastUpdate.current = now;

      onUpdate(stats);
    }
  });

  return null;
}

function SuccessPulse({ pulseKey, scene }: { pulseKey: number; scene: THREE.Object3D | null }) {
  const [active, setActive] = useState(false);
  const opacity = useRef(0);

  useEffect(() => {
    if (pulseKey > 1) { // 0 is initial, 1 is first load, >1 is optimization
      setActive(true);
      const timer = setTimeout(() => setActive(false), 1000);
      return () => clearTimeout(timer);
    }
  }, [pulseKey]);

  useFrame((state) => {
    if (!active || !scene) return;
    const time = state.clock.getElapsedTime() * 10;
    opacity.current = (Math.sin(time) + 1) * 0.5;

    scene.traverse((node) => {
      if (node instanceof THREE.Mesh) {
        const mats = Array.isArray(node.material) ? node.material : [node.material];
        mats.forEach((m: any) => {
          if (m.emissive) {
            m.emissive.set(0x22d3a3).multiplyScalar(opacity.current * 0.4);
          }
        });
      }
    });
  });

  useEffect(() => {
    if (!active && scene) {
      scene.traverse((node) => {
        if (node instanceof THREE.Mesh) {
          const mats = Array.isArray(node.material) ? node.material : [node.material];
          mats.forEach((m: any) => {
            if (m.emissive) m.emissive.set(0x000000);
          });
        }
      });
    }
  }, [active, scene]);

  return null;
}

// ──────────────────────────────────────────────
// Luminance Analyzer (Exposure Analysis)
// ──────────────────────────────────────────────
function LuminanceAnalyzer({ active }: { active: boolean }) {
  const { gl, scene, camera } = useThree();
  const [stats, setStats] = useState({ avg: 0, highlights: 0, shadows: 0 });
  const target = useRef(new THREE.WebGLRenderTarget(64, 64)); // Small target for sampling
  const buffer = useRef(new Uint8Array(64 * 64 * 4));

  useFrame(() => {
    if (!active || !scene || !camera) return;

    // Render a small version of the scene to sample
    const currentTarget = gl.getRenderTarget();
    gl.setRenderTarget(target.current);
    gl.render(scene, camera);
    gl.readRenderTargetPixels(target.current, 0, 0, 64, 64, buffer.current);
    gl.setRenderTarget(currentTarget);

    let totalLuminance = 0;
    let highCount = 0;
    let lowCount = 0;
    const pixels = buffer.current;

    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i] / 255;
      const g = pixels[i + 1] / 255;
      const b = pixels[i + 2] / 255;

      // Relative luminance formula
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      totalLuminance += l;

      if (l > 0.95) highCount++;
      if (l < 0.05) lowCount++;
    }

    const count = 64 * 64;
    setStats({
      avg: totalLuminance / count,
      highlights: (highCount / count) * 100,
      shadows: (lowCount / count) * 100
    });
  }, 1); // Order 1 so it's after main render? Or just occasionally? 
  // Actually, we should throttle this to avoid massive overhead.

  if (!active) return null;

  return (
    <div style={{
      position: 'absolute', bottom: 60, right: 12,
      background: 'rgba(10,10,18,0.85)', backdropFilter: 'blur(8px)',
      border: '1px solid var(--border)', borderRadius: 12,
      padding: '10px 14px', pointerEvents: 'none', zIndex: 10,
      display: 'flex', flexDirection: 'column', gap: 6, minWidth: 160
    }}>
      <div style={{ fontSize: '0.6rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Exposure Analysis
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>Avg Luminance</span>
        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: stats.avg > 0.7 ? 'var(--warning)' : 'var(--text-primary)' }}>
          {stats.avg.toFixed(2)}
        </span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>Highlight Clipping</span>
        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: stats.highlights > 10 ? 'var(--error)' : 'var(--text-primary)' }}>
          {stats.highlights.toFixed(1)}%
        </span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>Shadow Clipping</span>
        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: stats.shadows > 20 ? 'var(--warning)' : 'var(--text-primary)' }}>
          {stats.shadows.toFixed(1)}%
        </span>
      </div>
      {(stats.highlights > 15 || stats.avg > 0.8) && (
        <div style={{ fontSize: '0.55rem', color: 'var(--error)', marginTop: 2, padding: '4px 6px', background: 'rgba(244,63,94,0.1)', borderRadius: 4 }}>
          ⚠️ OVEREXPOSED: Adjust Exposure or High Intensity Lights
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────
// Canvas Toolbar (overlaid)
// ──────────────────────────────────────────────
function CanvasToolbar({
  showGrid,
  onToggleGrid,
  showShadows,
  onToggleShadows,
  showWireframe,
  onToggleWireframe,
  onReset,
  onLoadNew,
  onExport,
  exporting,
}: {
  showGrid: boolean;
  onToggleGrid: () => void;
  showShadows: boolean;
  onToggleShadows: () => void;
  showWireframe: boolean;
  onToggleWireframe: () => void;
  onReset: () => void;
  onLoadNew: () => void;
  onExport: () => void;
  exporting: boolean;
}) {
  return (
    <div
      style={{
        position: 'absolute',
        top: 12,
        left: 12,
        display: 'flex',
        gap: 6,
        zIndex: 5,
        flexWrap: 'wrap',
      }}
    >
      <button
        className={`toolbar-btn ${showGrid ? 'active' : ''}`}
        title="Toggle Grid"
        onClick={onToggleGrid}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
        </svg>
      </button>

      <button
        className={`toolbar-btn ${showWireframe ? 'active' : ''}`}
        title="Toggle Wireframe"
        onClick={onToggleWireframe}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polygon points="12 2 22 20 2 20" />
          <line x1="12" y1="2" x2="12" y2="20" />
          <line x1="7" y1="11" x2="17" y2="11" />
        </svg>
      </button>

      <button
        className={`toolbar-btn ${showShadows ? 'active' : ''}`}
        title="Toggle Shadows"
        onClick={onToggleShadows}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="5" />
          <ellipse cx="12" cy="20.5" rx="6" ry="1.5" />
        </svg>
      </button>

      <div style={{ width: 1, background: 'var(--border)', margin: '0 2px' }} />

      <button className="toolbar-btn" title="Reset Camera" onClick={onReset}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="23 4 23 10 17 10" />
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
        </svg>
      </button>

      <button className="toolbar-btn" title="Load New Model" onClick={onLoadNew}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
      </button>

      <div style={{ width: 1, background: 'var(--border)', margin: '0 2px' }} />

      {/* Export GLB */}
      <button
        className="toolbar-btn"
        title="Export as GLB"
        onClick={onExport}
        disabled={exporting}
        style={{
          background: exporting ? 'var(--bg-hover)' : 'rgba(34,211,163,0.15)',
          borderColor: 'rgba(34,211,163,0.4)',
          color: '#22d3a3',
          gap: 5,
          width: 'auto',
          padding: '0 12px',
          fontWeight: 600,
          fontSize: '0.72rem',
          letterSpacing: '0.04em',
        }}
      >
        {exporting ? (
          '⏳ Exporting…'
        ) : (
          <>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export GLB
          </>
        )}
      </button>
    </div>
  );
}

// ──────────────────────────────────────────────
// Loading overlay
// ──────────────────────────────────────────────
function LoadingOverlay({ progress }: { progress: number }) {
  return (
    <div
      style={{
        position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: 'rgba(10,10,15,0.88)', zIndex: 20,
        backdropFilter: 'blur(6px)', gap: 16,
      }}
    >
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{
        width: 50, height: 50,
        border: '3px solid var(--border)',
        borderTop: '3px solid var(--accent)',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }} />
      <div style={{ fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: 600 }}>
        Loading model…
      </div>
      {progress > 0 && (
        <div style={{ width: 200, height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ width: `${progress}%`, height: '100%', background: 'var(--accent)', transition: 'width 0.2s ease' }} />
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────
// Main Viewer Component
// ──────────────────────────────────────────────
export interface ColorOverride {
  meshUuid: string;
  matIndex: number; // which material slot
  color: string; // hex
}

interface ViewerProps {
  file: File | null;
  onModelLoaded: (meshes: MeshInfo[], stats: ModelStats, scene: THREE.Object3D) => void;
  selectedMeshUuid: string | null;
  onSelectMesh: (uuid: string | null) => void;
  onLoadNew: () => void;
  colorOverrides: ColorOverride[];
  onPerformanceUpdate?: (stats: PerformanceStats) => void;
  onAnalysisUpdate?: (report: SceneAnalysisReport) => void;
  lightingConfig: LightingConfig;
  onLightingConfigUpdate?: (config: LightingConfig) => void;
  highlightedUuids?: string[];
  analysisRefreshKey?: number;
  debugMode?: DebugRenderMode;
  clips?: AnimationClipInfo[];
  playbackConfig?: PlaybackConfig;
  onPlaybackUpdate?: (time: number) => void;
  onAnimationsLoaded?: (clips: AnimationClipInfo[]) => void;
}

export default function ModelViewer({
  file,
  onModelLoaded,
  selectedMeshUuid,
  onSelectMesh,
  onLoadNew,
  colorOverrides,
  onPerformanceUpdate,
  onAnalysisUpdate,
  lightingConfig,
  onLightingConfigUpdate,
  highlightedUuids = [],
  analysisRefreshKey = 0,
  debugMode = 'none',
  clips = [],
  playbackConfig,
  onPlaybackUpdate,
  onAnimationsLoaded,
}: ViewerProps) {
  const [model, setModel] = useState<THREE.Object3D | null>(null);
  const sceneRef = useRef<THREE.Object3D | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showWireframe, setShowWireframe] = useState(false);
  const [resetSignal, setResetSignal] = useState(0);
  const [exporting, setExporting] = useState(false);

  const analysisReport = useSceneIntelligence(model, analysisRefreshKey);

  useEffect(() => {
    if (analysisReport && onAnalysisUpdate) {
      onAnalysisUpdate(analysisReport);
    }
  }, [analysisReport, onAnalysisUpdate]);

  // Load model
  useEffect(() => {
    if (!file) return;
    setLoading(true);
    setLoadProgress(0);
    setError(null);
    setModel(null);

    const url = URL.createObjectURL(file);
    const ext = file.name.split('.').pop()?.toLowerCase();

    const onProgress = (e: ProgressEvent) => {
      if (e.total) setLoadProgress((e.loaded / e.total) * 100);
    };

    if (ext === 'glb' || ext === 'gltf') {
      new GLTFLoader().load(
        url,
        (gltf) => {
          gltf.scene.traverse((node) => {
            if (node instanceof THREE.Mesh) {
              node.castShadow = true;
              node.receiveShadow = true;
            }
          });
          const meshes = extractMeshes(gltf.scene);
          const stats = computeModelStats(gltf.scene, meshes, gltf.animations, file.name, file.size);
          sceneRef.current = gltf.scene;
          setModel(gltf.scene);
          onModelLoaded(meshes, stats, gltf.scene);

          if (gltf.animations && gltf.animations.length > 0) {
            AnimationEngine.init(gltf.scene, gltf.animations);
            if (onAnimationsLoaded) {
              onAnimationsLoaded(AnimationEngine.getClipsInfo());
            }
          }

          setLoading(false);
          URL.revokeObjectURL(url);
        },
        onProgress,
        (err) => { setError(String(err)); setLoading(false); URL.revokeObjectURL(url); },
      );
    } else if (ext === 'obj') {
      new OBJLoader().load(
        url,
        (obj) => {
          obj.traverse((node) => {
            if (node instanceof THREE.Mesh) {
              node.castShadow = true;
              node.receiveShadow = true;
            }
          });
          const meshes = extractMeshes(obj);
          const stats = computeModelStats(obj, meshes, [], file.name, file.size);
          sceneRef.current = obj;
          setModel(obj);
          onModelLoaded(meshes, stats, obj);
          AnimationEngine.stop(); // OBJ typically doesn't have animations
          setLoading(false);
          URL.revokeObjectURL(url);
        },
        onProgress,
        (err) => { setError(String(err)); setLoading(false); URL.revokeObjectURL(url); },
      );
    } else {
      setError(`Unsupported format: .${ext}`);
      setLoading(false);
      URL.revokeObjectURL(url);
    }
  }, [file]);

  // Apply color overrides to live scene
  useEffect(() => {
    if (!model) return;
    colorOverrides.forEach(({ meshUuid, matIndex, color }) => {
      model.traverse((node) => {
        if (node instanceof THREE.Mesh && node.uuid === meshUuid) {
          const mats = Array.isArray(node.material) ? node.material : [node.material];
          const mat = mats[matIndex] as any;
          if (mat && mat.color) {
            // Restore emissive cache before colour change
            mat.color.set(color);
            mat.needsUpdate = true;
          }
        }
      });
    });
  }, [colorOverrides, model]);

  // Animation State Control
  useEffect(() => {
    if (!playbackConfig || !model) return;

    if (playbackConfig.playing) {
      AnimationEngine.play(playbackConfig.selectedIndex, playbackConfig.loop);
      AnimationEngine.resume();
    } else {
      AnimationEngine.pause();
    }

    AnimationEngine.setSpeed(playbackConfig.speed);
    AnimationEngine.setTime(playbackConfig.currentTime);
  }, [playbackConfig, model]);

  // Animation Update loop
  useFrame((state, delta) => {
    if (playbackConfig?.playing) {
      const time = AnimationEngine.update(delta);
      if (onPlaybackUpdate) {
        onPlaybackUpdate(time);
      }
    }
  });

  // Apply Debug Mode
  useEffect(() => {
    if (!model) return;
    DebugMaterialEngine.applyMode(model, debugMode);
  }, [debugMode, model]);

  // Export as GLB
  const handleExport = useCallback(() => {
    if (!model) return;
    setExporting(true);
    const exporter = new GLTFExporter();
    exporter.parse(
      model,
      (result) => {
        const blob = new Blob([result as ArrayBuffer], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = (sceneRef.current?.userData?.fileName ?? 'model_modified') + '.glb';
        a.click();
        URL.revokeObjectURL(url);
        setExporting(false);
      },
      (err) => { console.error('Export error', err); setExporting(false); },
      { binary: true },
    );
  }, [model]);

  return (
    <div style={{ position: 'relative', flex: 1, height: '100%', overflow: 'hidden' }}>
      {model && (
        <CanvasToolbar
          showGrid={lightingConfig.showGrid}
          onToggleGrid={() => onLightingConfigUpdate?.({ ...lightingConfig, showGrid: !lightingConfig.showGrid })}
          showShadows={lightingConfig.showShadows}
          onToggleShadows={() => onLightingConfigUpdate?.({ ...lightingConfig, showShadows: !lightingConfig.showShadows })}
          showWireframe={showWireframe} onToggleWireframe={() => setShowWireframe((v) => !v)}
          onReset={() => setResetSignal((v) => v + 1)}
          onLoadNew={onLoadNew}
          onExport={handleExport}
          exporting={exporting}
        />
      )}

      {loading && <LoadingOverlay progress={loadProgress} />}

      {error && (
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
          background: 'var(--bg-card)', border: '1px solid var(--error)', borderRadius: 12,
          padding: '20px 28px', color: 'var(--error)', zIndex: 20, textAlign: 'center', maxWidth: 320,
        }}>
          <div style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 6 }}>Failed to load</div>
          <div style={{ fontSize: '0.8rem', opacity: 0.8 }}>{error}</div>
        </div>
      )}

      <Canvas
        key={resetSignal}
        shadows
        gl={{
          antialias: false,
          stencil: false,
          depth: true,
          toneMapping: lightingConfig.toneMapping === 'NoToneMapping' ? THREE.NoToneMapping :
            lightingConfig.toneMapping === 'Linear' ? THREE.LinearToneMapping :
              lightingConfig.toneMapping === 'Reinhard' ? THREE.ReinhardToneMapping :
                lightingConfig.toneMapping === 'Cineon' ? THREE.CineonToneMapping :
                  THREE.ACESFilmicToneMapping,
          toneMappingExposure: lightingConfig.exposure
        }}
        camera={{ fov: 50, near: 0.001, far: 10000, position: [5, 5, 5] }}
        style={{ background: lightingConfig.preset === 'night' ? '#050510' : 'linear-gradient(180deg, #0d0d18 0%, #0a0a12 100%)' }}
        onPointerMissed={() => onSelectMesh(null)}
      >
        <ambientLight intensity={lightingConfig.ambientIntensity} />
        <directionalLight
          position={[10, 15, 10]}
          intensity={lightingConfig.directionalIntensity}
          castShadow
          shadow-mapSize={[2048, 2048]}
        />
        {lightingConfig.preset === 'studio' ? (
          <directionalLight position={[-10, 5, -5]} intensity={0.4} />
        ) : <></>}
        {lightingConfig.preset === 'sunset' ? (
          <hemisphereLight args={['#ff8c00', '#200020', 0.6]} />
        ) : <></>}
        {lightingConfig.preset === 'night' ? (
          <pointLight position={[0, 5, 0]} color="#44aaff" intensity={2} />
        ) : <></>}

        <Environment
          preset={lightingConfig.preset === 'dawn' ? 'dawn' :
            lightingConfig.preset === 'sunset' ? 'sunset' :
              lightingConfig.preset === 'night' ? 'night' :
                lightingConfig.preset === 'warehouse' ? 'warehouse' :
                  'studio'}
          rotation={[0, lightingConfig.environmentRotation, 0]}
        />

        {lightingConfig.showAxes ? <primitive object={new THREE.AxesHelper(5)} /> : <></>}

        {model && (
          <>
            <ModelObject
              model={model}
              onMeshClick={onSelectMesh}
            />
            <SelectionBox
              scene={model}
              selectedMeshUuid={selectedMeshUuid}
              highlightedUuids={highlightedUuids}
            />
            <WireframeController scene={model} enabled={showWireframe} />
            <AutoFitCamera scene={model} key={model.uuid} />
            {onPerformanceUpdate && (
              <PerformanceMonitor onUpdate={onPerformanceUpdate} />
            )}
            <SuccessPulse pulseKey={analysisRefreshKey} scene={model} />
            <LuminanceAnalyzer active={lightingConfig.postProcessing.enabled} />

            {/* Bloom Badge */}
            {lightingConfig.postProcessing.enabled && lightingConfig.postProcessing.bloom.enabled && (
              <div style={{
                position: 'absolute', top: 20, left: '50%', transform: 'translateX(-50%)',
                background: 'rgba(34,211,163,0.15)', border: '1px solid var(--accent)',
                borderRadius: 20, padding: '4px 12px', color: 'var(--accent)',
                fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase',
                pointerEvents: 'none', display: 'flex', alignItems: 'center', gap: 6,
                boxShadow: '0 0 15px rgba(34,211,163,0.3)', zIndex: 100
              }}>
                <span className="pulse-dot"></span>
                Bloom Active (Int: {lightingConfig.postProcessing.bloom.intensity.toFixed(1)})
              </div>
            )}
          </>
        )}

        {lightingConfig.showGrid ? (
          <Grid
            args={[40, 40]}
            cellSize={0.5} cellThickness={0.5} cellColor="#1e1e30"
            sectionSize={2} sectionThickness={1} sectionColor="#2e2e48"
            fadeDistance={35} fadeStrength={1}
            followCamera={false} infiniteGrid
          />
        ) : <></>}

        {lightingConfig.showShadows && model ? (
          <ContactShadows position={[0, -0.01, 0]} opacity={0.35} scale={25} blur={2.5} far={12} color="#000020" />
        ) : <></>}

        <OrbitControls makeDefault enableDamping dampingFactor={0.05} minDistance={0.05} maxDistance={1000} />

        <GizmoHelper alignment="bottom-right" margin={[60, 60]}>
          <GizmoViewport axisColors={['#e05050', '#50e050', '#5080e0']} labelColor="white" />
        </GizmoHelper>

        {/* Post Processing Lab */}
        {lightingConfig.postProcessing.enabled ? (
          <EffectComposer disableNormalPass>
            {lightingConfig.postProcessing.ssao.enabled ? (
              <SSAO
                intensity={lightingConfig.postProcessing.ssao.intensity}
                radius={lightingConfig.postProcessing.ssao.radius}
                luminanceInfluence={0.5}
                color={new THREE.Color(0x000000)}
              />
            ) : <></>}
            {lightingConfig.postProcessing.bloom.enabled ? (
              <Bloom
                intensity={lightingConfig.postProcessing.bloom.intensity}
                radius={lightingConfig.postProcessing.bloom.radius}
                luminanceThreshold={lightingConfig.postProcessing.bloom.threshold}
                mipmapBlur
              />
            ) : <></>}
            {lightingConfig.postProcessing.dof.enabled ? (
              <DepthOfField
                focusDistance={lightingConfig.postProcessing.dof.focusDistance / 100}
                focalLength={lightingConfig.postProcessing.dof.focalLength / 1000}
                bokehScale={lightingConfig.postProcessing.dof.bokehScale}
              />
            ) : <></>}
            {lightingConfig.postProcessing.chromaticAberration.enabled ? (
              <ChromaticAberration
                offset={new THREE.Vector2(...lightingConfig.postProcessing.chromaticAberration.offset)}
              />
            ) : <></>}
            {lightingConfig.postProcessing.vignette.enabled ? (
              <Vignette
                offset={lightingConfig.postProcessing.vignette.offset}
                darkness={lightingConfig.postProcessing.vignette.darkness}
              />
            ) : <></>}
            {lightingConfig.postProcessing.noise.enabled ? (
              <Noise opacity={lightingConfig.postProcessing.noise.opacity} />
            ) : <></>}
            <BrightnessContrast
              brightness={lightingConfig.postProcessing.colorGrading.brightness}
              contrast={lightingConfig.postProcessing.colorGrading.contrast}
            />
            <HueSaturation
              saturation={lightingConfig.postProcessing.colorGrading.saturation}
            />
          </EffectComposer>
        ) : <></>}
      </Canvas>

      {model && !loading && (
        <div style={{
          position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(10,10,18,0.75)', backdropFilter: 'blur(8px)',
          border: '1px solid var(--border)', borderRadius: 20,
          padding: '5px 18px', fontSize: '0.67rem', color: 'var(--text-secondary)',
          display: 'flex', gap: 12, alignItems: 'center', whiteSpace: 'nowrap',
        }}>
          <span>🖱 Drag: Rotate</span><span>·</span>
          <span>Right drag: Pan</span><span>·</span>
          <span>Scroll: Zoom</span><span>·</span>
          <span>Click: Select mesh</span>
        </div>
      )}
    </div>
  );
}
