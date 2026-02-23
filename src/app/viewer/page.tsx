'use client';

import { useState, useCallback, useRef, useMemo } from 'react';
import dynamic from 'next/dynamic';
import type {
  MeshInfo,
  ModelStats,
  PerformanceStats,
  LightingConfig,
  SceneAnalysisReport,
  StructuralIssue,
  DebugRenderMode,
  OptimizationEvent,
  OptimizationState,
  SceneNode,
  AnimationClipInfo,
  PlaybackConfig
} from '@/types/model';
import type { ColorOverride, ScaleOverride } from '@/components/SidePanel';
import Dropzone from '@/components/Dropzone';
import SidePanel from '@/components/SidePanel';
import * as THREE from 'three';
import { InstancingEngine } from '@/core/actions/InstancingEngine';
import { MergeEngine } from '@/core/actions/MergeEngine';
import { LODEngine } from '@/core/actions/LODEngine';
import { SceneGraphBuilder } from '@/core/scene/SceneGraphBuilder';

// ModelViewer must be client-only (Three.js / canvas)
const ModelViewer = dynamic(() => import('@/components/ModelViewer'), { ssr: false });

export default function ViewerPage() {
  const [file, setFile] = useState<File | null>(null);
  const [meshes, setMeshes] = useState<MeshInfo[]>([]);
  const [stats, setStats] = useState<ModelStats | null>(null);
  const [selectedMeshUuid, setSelectedMeshUuid] = useState<string | null>(null);
  const [colorOverrides, setColorOverrides] = useState<ColorOverride[]>([]);
  const [scaleOverrides, setScaleOverrides] = useState<ScaleOverride[]>([]);
  const [performanceStats, setPerformanceStats] = useState<PerformanceStats | null>(null);
  const [sceneAnalysis, setSceneAnalysis] = useState<SceneAnalysisReport | null>(null);
  const [highlightedUuids, setHighlightedUuids] = useState<string[]>([]);
  const [analysisRefreshKey, setAnalysisRefreshKey] = useState(0);
  const [sceneVersion, setSceneVersion] = useState(1);
  const [appliedIssueIds, setAppliedIssueIds] = useState<Set<string>>(new Set());
  const [dismissedIssueIds, setDismissedIssueIds] = useState<Set<string>>(new Set());
  const [optimizationHistory, setOptimizationHistory] = useState<OptimizationEvent[]>([]);
  const [notification, setNotification] = useState<{ message: string; sub: string } | null>(null);
  const [debugMode, setDebugMode] = useState<DebugRenderMode>('none');
  const [lightingConfig, setLightingConfig] = useState<LightingConfig>({
    preset: 'studio',
    ambientIntensity: 0.5,
    directionalIntensity: 1,
    showGrid: true,
    showAxes: true,
    showShadows: true,
    toneMapping: 'ACESFilmic',
    exposure: 1.0,
    environmentRotation: 0,
    postProcessing: {
      enabled: false,
      bloom: { enabled: true, intensity: 1.0, radius: 0.4, threshold: 0.9 },
      ssao: { enabled: true, intensity: 1.0, radius: 0.1 },
      dof: { enabled: false, focusDistance: 10, focalLength: 35, bokehScale: 2 },
      chromaticAberration: { enabled: false, offset: [0.002, 0.002] },
      vignette: { enabled: false, offset: 0.5, darkness: 0.5 },
      noise: { enabled: false, opacity: 0.05 },
      colorGrading: { brightness: 0, contrast: 0, saturation: 0 },
    },
  });
  const [clips, setClips] = useState<AnimationClipInfo[]>([]);
  const [playbackConfig, setPlaybackConfig] = useState<PlaybackConfig>({
    playing: false,
    currentTime: 0,
    duration: 0,
    speed: 1.0,
    loop: true,
    selectedIndex: 0,
  });
  const sceneRef = useRef<THREE.Object3D | null>(null);

  const sceneTree = useMemo(() => {
    if (!sceneRef.current) return null;
    return SceneGraphBuilder.build(sceneRef.current);
  }, [sceneVersion, meshes]);

  const handleModelLoaded = useCallback(
    (m: MeshInfo[], s: ModelStats, scene: THREE.Object3D) => {
      setMeshes(m);
      setStats(s);
      setSelectedMeshUuid(null);
      setColorOverrides([]);
      setScaleOverrides([]);
      setClips([]);
      setPlaybackConfig(prev => ({ ...prev, playing: false, currentTime: 0, duration: 0, selectedIndex: 0 }));
      sceneRef.current = scene;
    },
    [],
  );

  const handleAnimationsLoaded = useCallback((c: AnimationClipInfo[]) => {
    setClips(c);
    if (c.length > 0) {
      setPlaybackConfig(prev => ({
        ...prev,
        duration: c[0].duration,
        selectedIndex: 0
      }));
    }
  }, []);

  const handlePlaybackUpdate = useCallback((time: number) => {
    setPlaybackConfig(prev => ({ ...prev, currentTime: time }));
  }, []);

  const handlePlaybackConfigChange = useCallback((config: Partial<PlaybackConfig>) => {
    setPlaybackConfig(prev => {
      const next = { ...prev, ...config };
      // If index changed, update duration
      if (config.selectedIndex !== undefined && clips[config.selectedIndex]) {
        next.duration = clips[config.selectedIndex].duration;
        next.currentTime = 0;
      }
      return next;
    });
  }, [clips]);

  const handleColorChange = useCallback((override: ColorOverride) => {
    setColorOverrides((prev) => {
      const idx = prev.findIndex(
        (o) => o.meshUuid === override.meshUuid && o.matIndex === override.matIndex,
      );
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = override;
        return next;
      }
      return [...prev, override];
    });
  }, []);

  const handleScaleChange = useCallback((s: ScaleOverride) => {
    setScaleOverrides((prev) => {
      const idx = prev.findIndex((o) => o.meshUuid === s.meshUuid);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = s;
        return next;
      }
      return [...prev, s];
    });

    // Apply scale directly to the Three.js object
    if (sceneRef.current) {
      sceneRef.current.traverse((node) => {
        if (node instanceof THREE.Mesh && node.uuid === s.meshUuid) {
          node.scale.set(s.x, s.y, s.z);
        }
      });
    }
  }, []);

  const handleOptimize = useCallback((issue: StructuralIssue) => {
    if (!sceneRef.current || !issue.optimizationMetadata) return;

    const metadata = issue.optimizationMetadata;
    const action = metadata.action;
    let result = false;

    if (action === 'convert_to_instanced') {
      const res = InstancingEngine.convertToInstanced(
        sceneRef.current,
        issue.affectedUuids || []
      );
      result = !!res;
    } else if (action === 'merge_static') {
      const res = MergeEngine.mergeMeshes(
        sceneRef.current,
        issue.affectedUuids || []
      );
      result = !!res;
    } else if (action === 'generate_lod') {
      const res = LODEngine.generateLODForBatch(
        sceneRef.current,
        issue.affectedUuids || []
      );
      result = res.length > 0;
    }

    if (result) {
      // Mark as applied
      setAppliedIssueIds(prev => new Set(prev).add(issue.id));

      // Increment scene version
      setSceneVersion(v => v + 1);

      // Record in history
      const newEvent: OptimizationEvent = {
        id: Math.random().toString(36).substr(2, 9),
        type: action === 'convert_to_instanced' ? 'instancing' : action === 'merge_static' ? 'merge' : 'lod',
        timestamp: new Date(),
        title: issue.title,
        details: issue.description,
        gainDescription: action === 'generate_lod'
          ? `Triangles reduced by ${metadata.estimatedTriangleReduction}`
          : `Draw calls reduced by ${metadata.estimatedDrawCallReduction}`,
        impact: issue.severity
      };
      setOptimizationHistory(prev => [newEvent, ...prev]);

      // Trigger notification
      setNotification({
        message: 'Optimization Applied',
        sub: newEvent.gainDescription
      });
      setTimeout(() => setNotification(null), 3000);

      // Trigger a re-analysis
      setAnalysisRefreshKey(prev => prev + 1);
      // Clear highlights
      setHighlightedUuids([]);
    }
  }, [appliedIssueIds, dismissedIssueIds, sceneVersion]);

  const handleDismiss = useCallback((issue: StructuralIssue) => {
    setDismissedIssueIds(prev => new Set(prev).add(issue.id));
    setAnalysisRefreshKey(prev => prev + 1);
  }, []);

  const handleToggleVisibility = useCallback((uuid: string, visible: boolean) => {
    if (!sceneRef.current) return;
    sceneRef.current.traverse(node => {
      if (node.uuid === uuid) {
        node.visible = visible;
      }
    });
    setSceneVersion(v => v + 1);
  }, []);

  const handleFocus = useCallback((uuid: string) => {
    setSelectedMeshUuid(uuid);
    // Future: Add camera lerp in ModelViewer
  }, []);

  const handleIsolate = useCallback((uuid: string) => {
    if (!sceneRef.current) return;
    sceneRef.current.traverse(node => {
      if (node.type === 'Mesh' || node.type === 'Group') {
        node.visible = (node.uuid === uuid);
      }
    });
    setSceneVersion(v => v + 1);
  }, []);

  const handleLoadNew = useCallback(() => {
    setFile(null);
    setMeshes([]);
    setStats(null);
    setSelectedMeshUuid(null);
    setColorOverrides([]);
    setScaleOverrides([]);
    setPerformanceStats(null);
    setSceneAnalysis(null);
    setHighlightedUuids([]);
    setDebugMode('none');
    setLightingConfig({
      preset: 'studio',
      ambientIntensity: 0.5,
      directionalIntensity: 1,
      showGrid: true,
      showAxes: true,
      showShadows: true,
      toneMapping: 'ACESFilmic',
      exposure: 1.0,
      environmentRotation: 0,
      postProcessing: {
        enabled: false,
        bloom: { enabled: true, intensity: 1.0, radius: 0.4, threshold: 0.9 },
        ssao: { enabled: true, intensity: 1.0, radius: 0.1 },
        dof: { enabled: false, focusDistance: 10, focalLength: 35, bokehScale: 2 },
        chromaticAberration: { enabled: false, offset: [0.002, 0.002] },
        vignette: { enabled: false, offset: 0.5, darkness: 0.5 },
        noise: { enabled: false, opacity: 0.05 },
        colorGrading: { brightness: 0, contrast: 0, saturation: 0 },
      },
    });
  }, []);

  return (
    <main
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-primary)',
        overflow: 'hidden',
      }}
    >
      {/* Top Header */}
      <header
        style={{
          height: 48,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 20px',
          background: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
          zIndex: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Logo */}
          <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 7,
                background: 'linear-gradient(135deg, #7c6af7, #a695f8)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                <polygon points="12 2 2 7 12 12 22 7 12 2" />
                <polyline points="2 17 12 22 22 17" />
                <polyline points="2 12 12 17 22 12" />
              </svg>
            </div>
            <span
              style={{
                fontWeight: 700,
                fontSize: '0.95rem',
                color: 'var(--text-primary)',
                letterSpacing: '-0.01em',
              }}
            >
              TheNext3D
            </span>
          </a>
          {stats && (
            <span
              style={{
                fontSize: '0.68rem',
                color: 'var(--text-secondary)',
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 5,
                padding: '2px 8px',
                fontFamily: 'JetBrains Mono, monospace',
              }}
            >
              {stats.fileName}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {stats && (
            <div style={{ display: 'flex', gap: 14, fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
              <span>
                <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{stats.totalMeshes}</span> meshes
              </span>
              <span>
                <span style={{ color: '#a3e7fa', fontWeight: 700 }}>
                  {stats.totalVertices.toLocaleString()}
                </span>{' '}
                verts
              </span>
              <span>
                <span style={{ color: 'var(--warning)', fontWeight: 700 }}>
                  {stats.totalTriangles.toLocaleString()}
                </span>{' '}
                tris
              </span>
              <span>
                <span style={{ color: 'var(--success)', fontWeight: 700 }}>
                  {stats.uniqueMaterials}
                </span>{' '}
                materials
              </span>
            </div>
          )}
        </div>
      </header>

      {/* Body: Canvas + Panel */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Canvas area */}
        <div style={{ flex: 1, position: 'relative' }}>
          {!file ? (
            <Dropzone onFileSelected={setFile} />
          ) : (
            <ModelViewer
              file={file}
              onModelLoaded={handleModelLoaded}
              selectedMeshUuid={selectedMeshUuid}
              onSelectMesh={setSelectedMeshUuid}
              onLoadNew={handleLoadNew}
              colorOverrides={colorOverrides}
                onPerformanceUpdate={setPerformanceStats}
                onAnalysisUpdate={(report) => {
                  const updatedIssues = report.issues.map(issue => ({
                    ...issue,
                    state: (appliedIssueIds.has(issue.id) ? 'applied' :
                      dismissedIssueIds.has(issue.id) ? 'dismissed' : 'idle') as OptimizationState
                  })) as StructuralIssue[];
                  setSceneAnalysis({ ...report, issues: updatedIssues, sceneVersion });
                }}
                lightingConfig={lightingConfig}
                onLightingConfigUpdate={setLightingConfig}
                highlightedUuids={highlightedUuids}
                analysisRefreshKey={analysisRefreshKey}
                debugMode={debugMode}
                clips={clips}
                playbackConfig={playbackConfig}
                onPlaybackUpdate={handlePlaybackUpdate}
                onAnimationsLoaded={handleAnimationsLoaded}
              />
          )}

          {/* Notification Toast */}
          {notification && (
            <div style={{
              position: 'absolute', top: 20, right: 20, zIndex: 100,
              background: 'var(--bg-card)', border: '1px solid var(--success)',
              borderRadius: 12, padding: '12px 20px', boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
              display: 'flex', flexDirection: 'column', gap: 4,
              animation: 'slideIn 0.3s ease-out'
            }}>
              <style>{`
                @keyframes slideIn {
                  from { transform: translateX(100%); opacity: 0; }
                  to { transform: translateX(0); opacity: 1; }
                }
              `}</style>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '1rem' }}>✓</span> {notification.message}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{notification.sub}</div>
            </div>
          )}
        </div>

        {/* Side panel */}
        <SidePanel
          meshes={meshes}
          stats={stats}
          selectedMeshUuid={selectedMeshUuid}
          onSelectMesh={setSelectedMeshUuid}
          onColorChange={handleColorChange}
          colorOverrides={colorOverrides}
          onScaleChange={handleScaleChange}
          scaleOverrides={scaleOverrides}
          performanceStats={performanceStats}
          lightingConfig={lightingConfig}
          onLightingChange={setLightingConfig}
          sceneAnalysis={sceneAnalysis}
          onHighlightMeshes={setHighlightedUuids}
          onOptimize={handleOptimize}
          onDismiss={handleDismiss}
          optimizationHistory={optimizationHistory}
          debugMode={debugMode}
          onDebugModeChange={setDebugMode}
          scene={sceneRef.current}
          sceneTree={sceneTree}
          onToggleVisibility={handleToggleVisibility}
          onFocus={handleFocus}
          onIsolate={handleIsolate}
        />
      </div>
    </main>
  );
}
