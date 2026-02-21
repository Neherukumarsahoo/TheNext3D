'use client';

import { useState, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import type { MeshInfo, ModelStats } from '@/types/model';
import type { ColorOverride, ScaleOverride } from '@/components/SidePanel';
import Dropzone from '@/components/Dropzone';
import SidePanel from '@/components/SidePanel';
import * as THREE from 'three';

// ModelViewer must be client-only (Three.js / canvas)
const ModelViewer = dynamic(() => import('@/components/ModelViewer'), { ssr: false });

export default function ViewerPage() {
  const [file, setFile] = useState<File | null>(null);
  const [meshes, setMeshes] = useState<MeshInfo[]>([]);
  const [stats, setStats] = useState<ModelStats | null>(null);
  const [selectedMeshUuid, setSelectedMeshUuid] = useState<string | null>(null);
  const [colorOverrides, setColorOverrides] = useState<ColorOverride[]>([]);
  const [scaleOverrides, setScaleOverrides] = useState<ScaleOverride[]>([]);
  const sceneRef = useRef<THREE.Object3D | null>(null);

  const handleModelLoaded = useCallback(
    (m: MeshInfo[], s: ModelStats, scene: THREE.Object3D) => {
      setMeshes(m);
      setStats(s);
      setSelectedMeshUuid(null);
      setColorOverrides([]);
      setScaleOverrides([]);
      sceneRef.current = scene;
    },
    [],
  );

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

  const handleLoadNew = useCallback(() => {
    setFile(null);
    setMeshes([]);
    setStats(null);
    setSelectedMeshUuid(null);
    setColorOverrides([]);
    setScaleOverrides([]);
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
            />
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
        />
      </div>
    </main>
  );
}
