'use client';

import React, { useRef, useCallback, useEffect, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import {
  OrbitControls,
  Grid,
  GizmoHelper,
  GizmoViewport,
  ContactShadows,
} from '@react-three/drei';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { extractMeshes, computeModelStats } from '@/utils/modelExtractor';
import type { MeshInfo, ModelStats } from '@/types/model';

// ──────────────────────────────────────────────
// Highlight selected mesh with a BoxHelper outline
// (avoids touching shared materials – the emissive
//  approach turned the whole GLTF model blue because
//  meshes share material instances)
// ──────────────────────────────────────────────
function SelectionBox({
  scene,
  selectedMeshUuid,
}: {
  scene: THREE.Object3D | null;
  selectedMeshUuid: string | null;
}) {
  const boxHelperRef = useRef<THREE.BoxHelper | null>(null);
  const { scene: threeScene, invalidate } = useThree();

  useEffect(() => {
    // Remove previous helper
    if (boxHelperRef.current) {
      threeScene.remove(boxHelperRef.current);
      boxHelperRef.current.dispose();
      boxHelperRef.current = null;
    }

    if (!scene || !selectedMeshUuid) { invalidate(); return; }

    // Find the selected mesh
    let found: THREE.Object3D | null = null;
    scene.traverse((node) => {
      if (node instanceof THREE.Mesh && node.uuid === selectedMeshUuid) found = node;
    });

    if (found) {
      const helper = new THREE.BoxHelper(found, 0x7c6af7); // accent purple
      (helper.material as THREE.LineBasicMaterial).linewidth = 2;
      threeScene.add(helper);
      boxHelperRef.current = helper;
    }

    invalidate();

    return () => {
      if (boxHelperRef.current) {
        threeScene.remove(boxHelperRef.current);
        boxHelperRef.current.dispose();
        boxHelperRef.current = null;
      }
    };
  }, [selectedMeshUuid, scene, threeScene, invalidate]);

  // Keep the box updated if the mesh moves/scales
  useEffect(() => {
    if (!boxHelperRef.current) return;
    const interval = setInterval(() => {
      boxHelperRef.current?.update();
    }, 100);
    return () => clearInterval(interval);
  }, [selectedMeshUuid]);

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
}

export default function ModelViewer({
  file,
  onModelLoaded,
  selectedMeshUuid,
  onSelectMesh,
  onLoadNew,
  colorOverrides,
}: ViewerProps) {
  const [model, setModel] = useState<THREE.Object3D | null>(null);
  const sceneRef = useRef<THREE.Object3D | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showGrid, setShowGrid] = useState(true);
  const [showShadows, setShowShadows] = useState(true);
  const [showWireframe, setShowWireframe] = useState(false);
  const [resetSignal, setResetSignal] = useState(0);
  const [exporting, setExporting] = useState(false);

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
          showGrid={showGrid} onToggleGrid={() => setShowGrid((v) => !v)}
          showShadows={showShadows} onToggleShadows={() => setShowShadows((v) => !v)}
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
        camera={{ fov: 50, near: 0.001, far: 10000, position: [5, 5, 5] }}
        style={{ background: 'linear-gradient(180deg, #0d0d18 0%, #0a0a12 100%)' }}
        onPointerMissed={() => onSelectMesh(null)}
      >
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 15, 10]} intensity={1.2} castShadow shadow-mapSize={[2048, 2048]} />
        <directionalLight position={[-10, 5, -5]} intensity={0.4} />
        <hemisphereLight args={['#b9d5ff', '#080820', 0.3]} />

        {model && (
          <>
            <ModelObject
              model={model}
              onMeshClick={onSelectMesh}
            />
            <SelectionBox scene={model} selectedMeshUuid={selectedMeshUuid} />
            <WireframeController scene={model} enabled={showWireframe} />
            <AutoFitCamera scene={model} key={model.uuid} />
          </>
        )}

        {showGrid && (
          <Grid
            args={[40, 40]}
            cellSize={0.5} cellThickness={0.5} cellColor="#1e1e30"
            sectionSize={2} sectionThickness={1} sectionColor="#2e2e48"
            fadeDistance={35} fadeStrength={1}
            followCamera={false} infiniteGrid
          />
        )}

        {showShadows && model && (
          <ContactShadows position={[0, -0.01, 0]} opacity={0.35} scale={25} blur={2.5} far={12} color="#000020" />
        )}

        <OrbitControls makeDefault enableDamping dampingFactor={0.05} minDistance={0.05} maxDistance={1000} />

        <GizmoHelper alignment="bottom-right" margin={[60, 60]}>
          <GizmoViewport axisColors={['#e05050', '#50e050', '#5080e0']} labelColor="white" />
        </GizmoHelper>
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
