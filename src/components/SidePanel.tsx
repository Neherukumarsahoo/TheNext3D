'use client';

import React, { useMemo, useState, useCallback, useEffect } from 'react';
import * as THREE from 'three';
import type {
  MeshInfo, MaterialInfo, ModelStats, PerformanceStats,
  PerformanceWarning, SceneAnalysisReport, StructuralIssue,
  LightingConfig, LightingPresetId, TextureUsageStats, OptimizationState, OptimizationEvent,
  SceneNode
} from '@/types/model';
import { TextureAnalyzer } from '@/core/debug/TextureAnalyzer';
import { GPUCostAnalyzer } from '@/core/debug/GPUCostAnalyzer';
import { SceneExplorerPanel } from './SceneExplorerPanel';

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────
function fmtNum(n: number) { return n.toLocaleString(); }
function fmtBytes(bytes: number) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function ColorDot({ hex }: { hex?: string }) {
  if (!hex) return null;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <span className="color-swatch" style={{ background: hex }} />
      <span>{hex}</span>
    </span>
  );
}

function BoolChip({ value }: { value: boolean }) {
  return (
    <span className="prop-val" style={{ color: value ? 'var(--success)' : 'var(--text-secondary)' }}>
      {value ? 'Yes' : 'No'}
    </span>
  );
}

function TextureRow({ label, tex }: { label: string; tex: any }) {
  return (
    <div className="prop-row">
      <span className="prop-key">{label}</span>
      {tex ? (
        <span className="prop-val" style={{ display: 'flex', alignItems: 'center', gap: 5, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <span className="texture-pill">
            ✓ {tex.name !== '(unnamed)' ? tex.name : 'Texture'}
            {tex.image?.width ? ` (${tex.image.width}×${tex.image.height})` : ''}
          </span>
        </span>
      ) : (
        <span className="prop-val"><span className="texture-pill missing">—</span></span>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────
// Accordion
// ──────────────────────────────────────────────
function Accordion({
  title, badge, children, defaultOpen = false,
}: {
  title: string; badge?: string | number; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ borderBottom: '1px solid var(--border)' }}>
      <div className="accordion-header" onClick={() => setOpen(!open)}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {title}
          {badge !== undefined && (
            <span className="tag tag-mesh" style={{ fontSize: '0.6rem', padding: '1px 6px' }}>{badge}</span>
          )}
        </span>
        <svg className={`chevron ${open ? 'open' : ''}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>
      {open && <div>{children}</div>}
    </div>
  );
}

// ──────────────────────────────────────────────
// Progress bar
// ──────────────────────────────────────────────
function ValBar({ value, color }: { value: number; color: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{
        width: 48, height: 4, borderRadius: 2,
        background: 'var(--border)', display: 'inline-block', overflow: 'hidden',
      }}>
        <span style={{ display: 'block', width: `${value * 100}%`, height: '100%', background: color, borderRadius: 2 }} />
      </span>
      {value.toFixed(2)}
    </span>
  );
}

// ──────────────────────────────────────────────
// Color Override Picker (per material slot)
// ──────────────────────────────────────────────
export interface ColorOverride {
  meshUuid: string;
  matIndex: number;
  color: string;
}

interface ColorPickerRowProps {
  label: string;
  matIndex: number;
  meshUuid: string;
  currentColor: string;
  onColorChange: (override: ColorOverride) => void;
}

function ColorPickerRow({ label, matIndex, meshUuid, currentColor, onColorChange }: ColorPickerRowProps) {
  const [hex, setHex] = useState(currentColor);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setHex(e.target.value);
    onColorChange({ meshUuid, matIndex, color: e.target.value });
  };

  return (
    <div className="prop-row" style={{ gap: 6 }}>
      <span className="prop-key" style={{ color: 'var(--success)', fontSize: '0.75rem' }}>
        🎨 {label}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <label style={{
          width: 26, height: 26, borderRadius: 6, overflow: 'hidden',
          border: '2px solid var(--border-bright)', cursor: 'pointer', display: 'block', flexShrink: 0,
        }}>
          <input
            type="color"
            value={hex}
            onChange={handleChange}
            style={{ width: 40, height: 40, border: 'none', padding: 0, cursor: 'pointer', marginLeft: -6, marginTop: -6 }}
          />
        </label>
        <span className="prop-val" style={{ fontSize: '0.7rem' }}>{hex.toUpperCase()}</span>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// Scale Controls (per-mesh)
// ──────────────────────────────────────────────
export interface ScaleOverride {
  meshUuid: string;
  x: number; y: number; z: number;
}

function ScaleControls({
  meshUuid,
  onScaleChange,
  currentScale,
}: {
  meshUuid: string;
  onScaleChange: (s: ScaleOverride) => void;
  currentScale: ScaleOverride;
}) {
  const [linked, setLinked] = useState(true);
  const [vals, setVals] = useState({ x: currentScale.x, y: currentScale.y, z: currentScale.z });

  const update = (axis: 'x' | 'y' | 'z', raw: string) => {
    const v = parseFloat(raw) || 0.01;
    const next = linked ? { x: v, y: v, z: v } : { ...vals, [axis]: v };
    setVals(next);
    onScaleChange({ meshUuid, ...next });
  };

  const axisColor: Record<string, string> = { x: '#e05050', y: '#50e050', z: '#5080e0' };

  return (
    <div style={{ padding: '6px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
        <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Scale (World)</span>
        <button
          onClick={() => setLinked((l) => !l)}
          style={{
            background: linked ? 'var(--accent-dim)' : 'var(--bg-card)',
            border: `1px solid ${linked ? 'var(--accent)' : 'var(--border)'}`,
            borderRadius: 5, padding: '1px 7px', fontSize: '0.62rem',
            color: linked ? 'var(--accent)' : 'var(--text-secondary)', cursor: 'pointer',
          }}
        >
          {linked ? '🔗 Linked' : '⛓ Free'}
        </button>
      </div>

      {(['x', 'y', 'z'] as const).map((axis) => (
        <div key={axis} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 12, fontWeight: 700, fontSize: '0.7rem', color: axisColor[axis] }}>
            {axis.toUpperCase()}
          </span>
          <input
            type="number"
            step="0.1"
            min="0.001"
            value={vals[axis]}
            onChange={(e) => update(axis, e.target.value)}
            style={{
              flex: 1, background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: 5, padding: '4px 8px', color: 'var(--text-primary)',
              fontSize: '0.75rem', outline: 'none', fontFamily: 'JetBrains Mono, monospace',
            }}
          />
        </div>
      ))}

      <button
        onClick={() => {
          const reset = { x: 1, y: 1, z: 1 };
          setVals(reset);
          onScaleChange({ meshUuid, ...reset });
        }}
        style={{
          marginTop: 2, background: 'none', border: '1px solid var(--border)',
          borderRadius: 5, padding: '3px 8px', fontSize: '0.65rem',
          color: 'var(--text-secondary)', cursor: 'pointer', alignSelf: 'flex-start',
        }}
      >
        Reset to 1
      </button>
    </div>
  );
}

// ──────────────────────────────────────────────
// Material block
// ──────────────────────────────────────────────
function MaterialBlock({
  mat,
  index,
  meshUuid,
  onColorChange,
  overrideColor,
}: {
  mat: MaterialInfo;
  index?: number;
  meshUuid: string;
  onColorChange: (o: ColorOverride) => void;
  overrideColor?: string;
}) {
  const matIndex = index ?? 0;
  const baseColor = overrideColor ?? mat.color ?? '#888888';

  return (
    <div style={{ borderBottom: index !== undefined ? '1px solid var(--border)' : 'none' }}>
      <div className="prop-row" style={{ background: 'rgba(124,106,247,0.05)' }}>
        <span className="prop-key" style={{ color: 'var(--accent)', fontWeight: 600 }}>
          {index !== undefined ? `Material [${index}]` : 'Material'}
        </span>
        <span className="tag tag-mat">{mat.type}</span>
      </div>

      <div className="prop-row">
        <span className="prop-key">Name</span>
        <span className="prop-val">{mat.name}</span>
      </div>

      {/* Color override picker */}
      <ColorPickerRow
        label="Override Color"
        matIndex={matIndex}
        meshUuid={meshUuid}
        currentColor={baseColor}
        onColorChange={onColorChange}
      />

      {mat.color !== undefined && (
        <div className="prop-row">
          <span className="prop-key">Original Color</span>
          <span className="prop-val"><ColorDot hex={mat.color} /></span>
        </div>
      )}

      {mat.emissive !== undefined && (
        <div className="prop-row">
          <span className="prop-key">Emissive</span>
          <span className="prop-val">
            <ColorDot hex={mat.emissive} />
            {mat.emissiveIntensity !== undefined && ` × ${mat.emissiveIntensity}`}
          </span>
        </div>
      )}

      {mat.metalness !== undefined && (
        <div className="prop-row">
          <span className="prop-key">Metalness</span>
          <span className="prop-val"><ValBar value={mat.metalness} color="linear-gradient(90deg,#a695f8,#d4c9ff)" /></span>
        </div>
      )}

      {mat.roughness !== undefined && (
        <div className="prop-row">
          <span className="prop-key">Roughness</span>
          <span className="prop-val"><ValBar value={mat.roughness} color="#22d3a3" /></span>
        </div>
      )}

      <div className="prop-row">
        <span className="prop-key">Opacity</span>
        <span className="prop-val">{mat.opacity.toFixed(2)}</span>
      </div>

      <div className="prop-row">
        <span className="prop-key">Transparent</span>
        <BoolChip value={mat.transparent} />
      </div>

      <div className="prop-row">
        <span className="prop-key">Side</span>
        <span className="prop-val">{mat.side}</span>
      </div>

      <div className="prop-row">
        <span className="prop-key">Blending</span>
        <span className="prop-val">{mat.blending}</span>
      </div>

      {/* Textures */}
      <div className="section-header">Texture Maps</div>
      <TextureRow label="Albedo (map)" tex={mat.map} />
      {mat.normalMap !== undefined && <TextureRow label="Normal Map" tex={mat.normalMap} />}
      {mat.roughnessMap !== undefined && <TextureRow label="Roughness Map" tex={mat.roughnessMap} />}
      {mat.metalnessMap !== undefined && <TextureRow label="Metalness Map" tex={mat.metalnessMap} />}
      {mat.emissiveMap !== undefined && <TextureRow label="Emissive Map" tex={mat.emissiveMap} />}
      {mat.aoMap !== undefined && <TextureRow label="AO Map" tex={mat.aoMap} />}
      {mat.alphaMap !== undefined && <TextureRow label="Alpha Map" tex={mat.alphaMap} />}
      {mat.envMap !== undefined && <TextureRow label="Env Map" tex={mat.envMap} />}
    </div>
  );
}

// ──────────────────────────────────────────────
// Stats Panel
// ──────────────────────────────────────────────
function StatsPanel({ stats, scene }: { stats: ModelStats; scene: THREE.Object3D | null }) {
  const distribution = useMemo(() => {
    if (!scene) return null;
    return TextureAnalyzer.getSceneTextureDistribution(scene);
  }, [scene]);

  const cards = [
    { label: 'Meshes', value: fmtNum(stats.totalMeshes), color: 'var(--accent)' },
    { label: 'Vertices', value: fmtNum(stats.totalVertices), color: '#a3e7fa' },
    { label: 'Triangles', value: fmtNum(stats.totalTriangles), color: 'var(--warning)' },
    { label: 'Materials', value: fmtNum(stats.uniqueMaterials), color: 'var(--success)' },
  ];
  return (
    <div style={{ padding: 10 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {cards.map((c) => (
          <div key={c.label} className="stat-card">
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: c.color, fontFamily: 'JetBrains Mono,monospace' }}>{c.value}</div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginTop: 2 }}>{c.label}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 10 }}>
        {stats.fileName && (
          <div className="prop-row">
            <span className="prop-key">File</span>
            <span className="prop-val" title={stats.fileName}>
              {stats.fileName.length > 22 ? stats.fileName.slice(0, 19) + '…' : stats.fileName}
            </span>
          </div>
        )}
        {stats.fileSize && (
          <div className="prop-row"><span className="prop-key">Size</span><span className="prop-val">{stats.fileSize}</span></div>
        )}
        {stats.fileType && (
          <div className="prop-row">
            <span className="prop-key">Format</span>
            <span className="prop-val"><span className="tag tag-geo">{stats.fileType}</span></span>
          </div>
        )}
        {stats.hasAnimations && (
          <div className="prop-row">
            <span className="prop-key">Animations</span>
            <span className="prop-val" style={{ color: 'var(--accent)' }}>{stats.animationCount} clip(s)</span>
          </div>
        )}
        {stats.boundingBox && (
          <>
            <div className="section-header">Bounding Box</div>
            <div className="prop-row"><span className="prop-key">Width (X)</span><span className="prop-val">{stats.boundingBox.size.x}</span></div>
            <div className="prop-row"><span className="prop-key">Height (Y)</span><span className="prop-val">{stats.boundingBox.size.y}</span></div>
            <div className="prop-row"><span className="prop-key">Depth (Z)</span><span className="prop-val">{stats.boundingBox.size.z}</span></div>
          </>
        )}
      </div>

      {distribution && (
        <>
          <div className="section-header">Texture Distribution</div>
          <div style={{ padding: '4px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {Object.entries(distribution).map(([res, count]) => (
              count > 0 && (
                <div key={res} className="prop-row" style={{ padding: 0 }}>
                  <span className="prop-key">{res}</span>
                  <span style={{
                    display: 'flex', alignItems: 'center', gap: 8, flex: 1, justifyContent: 'flex-end'
                  }}>
                    <div style={{
                      height: 4, flex: 1, maxWidth: 80, background: 'var(--border)', borderRadius: 2, overflow: 'hidden'
                    }}>
                      <div style={{
                        height: '100%',
                        width: `${Math.min(100, (count / 10) * 100)}%`,
                        background: res === '4K+' ? 'var(--error)' : res === '2K' ? 'var(--warning)' : 'var(--success)'
                      }} />
                    </div>
                    <span className="prop-val">{count} maps</span>
                  </span>
                </div>
              )
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────
// Performance Panel
// ──────────────────────────────────────────────
function MetricRow({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="prop-row" style={{ padding: '8px 10px' }}>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <span className="prop-key" style={{ fontSize: '0.72rem' }}>{label}</span>
        {sub && <span style={{ fontSize: '0.62rem', color: 'var(--text-secondary)' }}>{sub}</span>}
      </div>
      <span className="prop-val" style={{
        color: color || 'var(--text-primary)',
        fontFamily: 'JetBrains Mono, monospace',
        fontWeight: 700,
        fontSize: '0.82rem'
      }}>
        {value}
      </span>
    </div>
  );
}

function PerformancePanel({ stats }: { stats: PerformanceStats }) {
  const warnings = useMemo(() => {
    const list: PerformanceWarning[] = [];
    if (stats.fps < 30) list.push({ level: 'heavy', message: 'Low frame rate detected' });
    if (stats.triangles > 100000) list.push({ level: 'moderate', message: 'High triangle count (>100k)' });
    if (stats.drawCalls > 25) list.push({ level: 'moderate', message: 'High draw call count (>25)' });
    if (stats.textures > 10) list.push({ level: 'moderate', message: 'Many individual textures (>10)' });
    if (stats.memory.geometries + stats.memory.textures > 100 * 1024 * 1024) {
      list.push({ level: 'heavy', message: 'VRAM usage > 100MB' });
    }
    return list;
  }, [stats]);

  const fpsColor = stats.fps >= 50 ? 'var(--success)' : stats.fps >= 30 ? 'var(--warning)' : 'var(--error)';

  return (
    <div style={{ padding: 10 }}>
      {/* FPS Gauge */}
      <div className="stat-card" style={{ textAlign: 'center', padding: '15px 10px', marginBottom: 10 }}>
        <div style={{ fontSize: '2rem', fontWeight: 800, color: fpsColor, fontFamily: 'JetBrains Mono, monospace', lineHeight: 1 }}>
          {stats.fps}
        </div>
        <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: 4, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          Frames Per Second
        </div>
        <div style={{ marginTop: 10, height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{
            width: `${Math.min(100, (stats.fps / 60) * 100)}%`,
            height: '100%',
            background: fpsColor,
            transition: 'width 0.3s ease, background 0.3s ease'
          }} />
        </div>
      </div>

      <Accordion title="Render Stats" defaultOpen>
        <MetricRow label="Frame Time" value={`${stats.frameTime.toFixed(1)} ms`} color={stats.frameTime > 20 ? 'var(--warning)' : undefined} />
        <MetricRow label="Draw Calls" value={stats.drawCalls} sub="Active this frame" />
        <MetricRow label="Triangles" value={fmtNum(stats.triangles)} sub="Rendered this frame" />
        <MetricRow label="Programs" value={stats.programs} sub="Active shaders" />
      </Accordion>

      <Accordion title="Memory (Estimated)" defaultOpen>
        <MetricRow label="Texture Memory" value={fmtBytes(stats.memory.textures)} />
        <MetricRow label="Geometry Memory" value={fmtBytes(stats.memory.geometries)} />
        <MetricRow label="Active Textures" value={stats.textures} />
        <MetricRow label="Active Geometries" value={stats.geometries} />
      </Accordion>

      {/* Warnings */}
      {warnings.length > 0 && (
        <div style={{ marginTop: 15 }}>
          <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 6, paddingLeft: 4 }}>
            Performance Warnings
          </div>
          {warnings.map((w, i) => (
            <div key={i} style={{
              background: w.level === 'heavy' ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)',
              border: `1px solid ${w.level === 'heavy' ? 'rgba(239,68,68,0.3)' : 'rgba(245,158,11,0.3)'}`,
              borderRadius: 8,
              padding: '6px 10px',
              marginBottom: 5,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: '0.72rem',
              color: w.level === 'heavy' ? '#fca5a5' : '#fcd34d'
            }}>
              <span>{w.level === 'heavy' ? '🔴' : '🟡'}</span>
              <span>{w.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────
// Analysis Panel
// ──────────────────────────────────────────────
// ──────────────────────────────────────────────
// Analysis Panel
// ──────────────────────────────────────────────
interface AnalysisPanelProps {
  assessment: SceneAnalysisReport;
  onHighlightMeshes?: (uuids: string[]) => void;
  onOptimize?: (issue: StructuralIssue) => void;
  onDismiss?: (issue: StructuralIssue) => void;
}

function AnimatedScore({ value, color }: { value: number; color: string }) {
  const [displayValue, setDisplayValue] = useState(value);

  useEffect(() => {
    let start = displayValue;
    const end = value;
    const duration = 1000;
    const startTime = performance.now();

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const current = Math.round(start + (end - start) * progress);
      setDisplayValue(current);
      if (progress < 1) requestAnimationFrame(animate);
    };

    requestAnimationFrame(animate);
  }, [value]);

  return <span style={{ fontSize: '3.2rem', fontWeight: 900, color: color, lineHeight: 1 }}>{displayValue}</span>;
}

export function AnalysisPanel({
  assessment,
  onHighlightMeshes,
  onOptimize,
  onDismiss,
  scene
}: AnalysisPanelProps & { scene: THREE.Object3D | null }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (!assessment) return (
    <div style={{ padding: 10, color: 'var(--text-secondary)', textAlign: 'center' }}>
      No analysis data available.
    </div>
  );

  const scoreColor = assessment.status === 'optimized' ? 'var(--success)' : assessment.status === 'improvable' ? 'var(--warning)' : 'var(--error)';
  const statusLabel = assessment.status === 'optimized' ? 'Highly Optimized' : assessment.status === 'improvable' ? 'Improvable Structure' : 'Structural Debt Detected';

  const gpuReport = scene ? GPUCostAnalyzer.getSceneGPUReport(scene) : null;

  return (
    <div style={{ padding: 10 }}>
      {/* Structural Health Score */}
      <div className="stat-card" style={{ marginBottom: 15, textAlign: 'center', padding: '24px 10px', background: 'var(--bg-secondary)' }}>
        <div style={{ fontSize: '0.62rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 8, fontWeight: 700 }}>
          Scene Intelligence Score
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 4 }}>
          <AnimatedScore value={assessment.score} color={scoreColor} />
          <span style={{ fontSize: '1.2rem', color: 'var(--text-secondary)', fontWeight: 600 }}>/ 100</span>
        </div>
        <div style={{
          marginTop: 14, display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '5px 14px', borderRadius: 20, background: `${scoreColor}15`,
          border: `1px solid ${scoreColor}30`, color: scoreColor, fontSize: '0.72rem', fontWeight: 800
        }}>
          {statusLabel}
        </div>
      </div>

      {/* GPU Rendering Risk */}
      {gpuReport && (
        <div style={{
          background: 'rgba(124,106,247,0.05)', border: '1px solid var(--border)', borderRadius: 12,
          padding: '12px 14px', marginBottom: 20
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>GPU Rendering Risk</span>
            <span style={{
              fontSize: '0.65rem', fontWeight: 800, padding: '2px 6px', borderRadius: 4,
              background: gpuReport.riskLevel === 'HIGH' ? 'rgba(244,63,94,0.15)' : gpuReport.riskLevel === 'MEDIUM' ? 'rgba(245,158,11,0.15)' : 'rgba(34,211,163,0.15)',
              color: gpuReport.riskLevel === 'HIGH' ? 'var(--error)' : gpuReport.riskLevel === 'MEDIUM' ? 'var(--warning)' : 'var(--success)'
            }}>
              {gpuReport.riskLevel}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Fragment Stress Score</span>
              <span style={{ fontSize: '0.75rem', fontWeight: 700 }}>{gpuReport.stressScore}/100</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Transparency Depth</span>
              <span style={{ fontSize: '0.75rem', fontWeight: 700 }}>{gpuReport.transparentMaterials} layers</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Double-Sided Mats</span>
              <span style={{ fontSize: '0.75rem', fontWeight: 700 }}>{gpuReport.doubleSidedMaterials}</span>
            </div>
          </div>
        </div>
      )}

      {/* Structural Stats Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 15 }}>
        <div className="stat-card" style={{ padding: '8px 10px' }}>
          <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--accent)' }}>
            {((assessment.stats.materialReuseRatio || 0) * 100).toFixed(0)}%
          </div>
          <div style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', marginTop: 2 }}>Mat Fragmentation</div>
        </div>
        <div className="stat-card" style={{ padding: '8px 10px' }}>
          <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--warning)' }}>{assessment.stats.instancingPotential}</div>
          <div style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', marginTop: 2 }}>Instancing Ops</div>
        </div>
      </div>

      <div style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 10, paddingLeft: 4, letterSpacing: '0.05em' }}>
        Structural Intelligence ({assessment.issues.length})
      </div>

      {assessment.issues.length === 0 ? (
        <div style={{
          padding: 30, textAlign: 'center', background: 'rgba(34,211,163,0.05)',
          borderRadius: 12, border: '1px dashed var(--success)', color: 'var(--success)', fontSize: '0.75rem'
        }}>
          🧠 No structural issues found. The scene architecture is clean.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {assessment.issues.map((issue) => {
            const isExpanded = expandedId === issue.id;
            const isApplied = issue.state === 'applied';

            return (
              <div
                key={issue.id}
                onMouseEnter={() => issue.affectedUuids && onHighlightMeshes?.(issue.affectedUuids)}
                onMouseLeave={() => onHighlightMeshes?.([])}
                onClick={() => setExpandedId(isExpanded ? null : issue.id)}
                style={{
                  background: isApplied ? 'rgba(34,211,163,0.08)' : 'var(--bg-card)',
                  border: isApplied ? '1px solid var(--success)' : isExpanded ? '1px solid var(--accent)' : '1px solid var(--border)',
                  borderRadius: 12, overflow: 'hidden', cursor: 'pointer',
                  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                  boxShadow: isExpanded ? '0 10px 20px rgba(0,0,0,0.2)' : 'none',
                  transform: isExpanded ? 'scale(1.02)' : 'none',
                  zIndex: isExpanded ? 10 : 1
                }}
              >
                <div style={{
                  padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10,
                  borderBottom: isExpanded ? '1px solid var(--border)' : '1px solid transparent',
                  background: isExpanded ? 'rgba(255,255,255,0.03)' : 'transparent'
                }}>
                  <div style={{
                    width: 10, height: 10, borderRadius: '2px',
                    background: isApplied ? 'var(--success)' : issue.severity === 'high' ? 'var(--error)' : issue.severity === 'medium' ? 'var(--warning)' : 'var(--accent)',
                    boxShadow: isApplied ? '0 0 10px var(--success)' : 'none'
                  }} />
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, flex: 1, color: isApplied ? 'var(--success)' : 'white' }}>
                    {isApplied && '✓ '}{issue.title}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {isApplied ? (
                      <span style={{ fontSize: '0.6rem', fontWeight: 800, color: 'var(--success)', letterSpacing: '0.05em' }}>APPLIED</span>
                    ) : (
                      <span style={{
                        fontSize: '0.58rem', fontWeight: 800, textTransform: 'uppercase',
                        color: issue.severity === 'high' ? 'var(--error)' : 'var(--text-secondary)'
                      }}>{issue.severity}</span>
                    )}
                    <svg
                      width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
                      style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
                    >
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </div>
                </div>

                {isExpanded && (
                  <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ fontSize: '0.72rem', lineHeight: 1.5, color: 'var(--text-secondary)' }}>
                      {issue.description}
                    </div>

                    {issue.canAutoOptimize && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {issue.optimizationMetadata?.metrics && (
                          <div style={{
                            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10,
                            padding: '10px', background: 'rgba(0,0,0,0.2)', borderRadius: 8,
                            border: '1px solid rgba(255,255,255,0.05)'
                          }}>
                            <div>
                              <div style={{ fontSize: '0.55rem', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 4 }}>Before</div>
                              <div style={{ fontSize: '0.8rem', fontWeight: 700 }}>
                                {issue.optimizationMetadata.metrics.before.toLocaleString()}
                                <span style={{ fontSize: '0.6rem', fontWeight: 400, marginLeft: 4, opacity: 0.6 }}>{issue.optimizationMetadata.metrics.unit}</span>
                              </div>
                            </div>
                            <div>
                              <div style={{ fontSize: '0.55rem', color: 'var(--success)', textTransform: 'uppercase', marginBottom: 4 }}>After</div>
                              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--success)' }}>
                                {issue.optimizationMetadata.metrics.after.toLocaleString()}
                                <span style={{ fontSize: '0.6rem', fontWeight: 400, marginLeft: 4, opacity: 0.8 }}>{issue.optimizationMetadata.metrics.unit}</span>
                              </div>
                            </div>
                          </div>
                        )}

                        {!isApplied ? (
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button
                              onClick={(e) => { e.stopPropagation(); onOptimize?.(issue); }}
                              style={{
                                flex: 1, padding: '10px', borderRadius: 8, border: 'none',
                                background: 'var(--accent)', color: 'white', fontSize: '0.7rem',
                                fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center',
                                justifyContent: 'center', gap: 8, transition: 'filter 0.2s'
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.filter = 'brightness(1.1)'}
                              onMouseLeave={(e) => e.currentTarget.style.filter = 'none'}
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                <path d="M21 2v6h-6" /><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M3 22v-6h6" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
                              </svg>
                              ⚙ Apply Refactor
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); onDismiss?.(issue); }}
                              style={{
                                padding: '10px', borderRadius: 8, border: '1px solid var(--border)',
                                background: 'transparent', color: 'var(--text-secondary)', fontSize: '0.7rem',
                                fontWeight: 600, cursor: 'pointer'
                              }}
                            >
                              Dismiss
                            </button>
                          </div>
                        ) : (
                          <div style={{
                            padding: '10px', background: 'rgba(34,211,163,0.1)',
                            borderRadius: 8, textAlign: 'center', fontSize: '0.7rem',
                            color: 'var(--success)', fontWeight: 600, border: '1px solid rgba(34,211,163,0.2)'
                          }}>
                            ✓ Structural Refactor Successfully Applied
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────
// History Panel
// ──────────────────────────────────────────────

function HistoryPanel({ history }: { history: OptimizationEvent[] }) {
  if (history.length === 0) {
    return (
      <div style={{
        padding: 40, textAlign: 'center', color: 'var(--text-secondary)',
        display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center'
      }}>
        <div style={{ fontSize: '2rem', opacity: 0.2 }}>📜</div>
        <div style={{ fontSize: '0.75rem' }}>No optimizations applied yet. Your history will appear here.</div>
      </div>
    );
  }

  return (
    <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 4, paddingLeft: 4 }}>
        Optimization Timeline
      </div>
      {history.map((event, i) => (
        <div key={event.id} style={{
          position: 'relative', paddingLeft: 20,
          borderLeft: i === history.length - 1 ? 'none' : '2px solid var(--border)'
        }}>
          {/* Timeline Dot */}
          <div style={{
            position: 'absolute', left: -6, top: 0, width: 10, height: 10,
            borderRadius: '50%', background: 'var(--success)', border: '2px solid var(--bg-card)',
            boxShadow: '0 0 8px var(--success)'
          }} />

          <div style={{
            background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: '10px 12px',
            border: '1px solid var(--border)', marginBottom: 15
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--success)' }}>{event.title}</span>
              <span style={{ fontSize: '0.6rem', color: 'var(--text-secondary)' }}>
                {event.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', lineHeight: 1.4, marginBottom: 8 }}>
              {event.details}
            </div>
            <div style={{
              fontSize: '0.65rem', fontWeight: 700, background: 'rgba(34,211,163,0.1)',
              padding: '4px 8px', borderRadius: 4, color: 'var(--success)', display: 'inline-block'
            }}>
              ⚡ GAIN: {event.gainDescription}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ──────────────────────────────────────────────
// Debug Panel
// ──────────────────────────────────────────────

function DebugPanel({
  currentMode,
  onChange
}: {
  currentMode: DebugRenderMode;
  onChange: (m: DebugRenderMode) => void
}) {
  const modes: { id: DebugRenderMode; label: string; icon: string; desc: string }[] = [
    { id: 'none', label: 'Default View', icon: '🎨', desc: 'Restore original materials and lighting.' },
    { id: 'wireframe', label: 'Topology', icon: '🕸', desc: 'Visualize geometry wireframe/mesh flow.' },
    { id: 'normals', label: 'Normals', icon: '🌈', desc: 'Detect flipped faces or smoothing artifacts.' },
    { id: 'uv', label: 'UV Mapping', icon: '🗺', desc: 'Check for texture stretching or overlaps.' },
    { id: 'depth', label: 'Depth View', icon: '📏', desc: 'Visualize object distance (depth buffer).' },
    { id: 'flat', label: 'Flat Shading', icon: '💎', desc: 'Detect polygon structure without smoothing.' },
    { id: 'albedo', label: 'Albedo Only', icon: '🔳', desc: 'Ignore PBR maps (rough, metal, normal).' },
    { id: 'no_lighting', label: 'No Lighting', icon: '🌑', desc: 'Unlit view: Is it a light or texture issue?' },
    { id: 'heatmap', label: 'Texture Heatmap', icon: '🔥', desc: 'Visualize GPU memory pressure per mesh.' },
    { id: 'overdraw', label: 'Overdraw Mode', icon: '叠加', desc: 'Identify fragment waste and transparency stacking.' },
    { id: 'gpu_cost', label: 'GPU Cost Heatmap', icon: '💸', desc: 'Estimate rendering cost per mesh (Green to Red).' },
  ];

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 4, letterSpacing: '0.05em' }}>
        Rendering Lab Modes
      </div>
      {modes.map((m) => {
        const isActive = currentMode === m.id;
        return (
          <button
            key={m.id}
            onClick={() => onChange(m.id)}
            style={{
              padding: '12px 14px', borderRadius: 12, border: `1px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
              background: isActive ? 'rgba(124,106,247,0.1)' : 'var(--bg-card)',
              color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
              cursor: 'pointer', transition: 'all 0.2s',
              display: 'flex', gap: 12, alignItems: 'center', textAlign: 'left',
              position: 'relative', overflow: 'hidden'
            }}
          >
            {isActive && (
              <div style={{
                position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: 'var(--accent)'
              }} />
            )}
            <span style={{ fontSize: '1.2rem' }}>{m.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.75rem', fontWeight: isActive ? 800 : 600, color: isActive ? 'var(--accent)' : 'var(--text-primary)' }}>
                {m.label}
              </div>
              <div style={{ fontSize: '0.6rem', opacity: 0.7, marginTop: 2 }}>
                {m.desc}
              </div>
            </div>
            {isActive && (
              <div style={{ color: 'var(--accent)', fontSize: '0.8rem' }}>●</div>
            )}
          </button>
        );
      })}

      <div style={{
        marginTop: 20, padding: 14, borderRadius: 12, background: 'rgba(255,255,255,0.03)',
        border: '1px solid var(--border)', fontSize: '0.65rem', color: 'var(--text-secondary)',
        lineHeight: 1.5
      }}>
        <div style={{ fontWeight: 800, color: 'var(--text-primary)', marginBottom: 4, textTransform: 'uppercase' }}>
          💡 Debugging Tip
        </div>
        Use <b>No Lighting</b> to confirm if a mesh is dark because of scene lights or because the material properties are incorrect.
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// Lighting Panel
// ──────────────────────────────────────────────
function LightingPanel({
  config, onChange
}: {
  config: LightingConfig;
  onChange: (c: LightingConfig) => void
}) {
  const toneMappingModes: ToneMappingMode[] = ['NoToneMapping', 'Linear', 'Reinhard', 'Cineon', 'ACESFilmic'];
  const presets: { id: LightingPresetId; label: string; icon: string; bg: string }[] = [
    { id: 'studio', label: 'Studio', icon: '📸', bg: 'linear-gradient(135deg, #444, #111)' },
    { id: 'sunset', label: 'Sunset', icon: '🌅', bg: 'linear-gradient(135deg, #ff8c00, #4b0082)' },
    { id: 'dawn', label: 'Dawn', icon: '🌄', bg: 'linear-gradient(135deg, #1e90ff, #00008b)' },
    { id: 'warehouse', label: 'Inspect', icon: '🔍', bg: 'linear-gradient(135deg, #ccc, #777)' },
    { id: 'night', label: 'Neon', icon: '🌃', bg: 'linear-gradient(135deg, #0000a0, #000)' },
  ];

  return (
    <div style={{ padding: 12 }}>
      <div style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 12, letterSpacing: '0.05em' }}>
        Environment Presets
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20 }}>
        {presets.map((p) => (
          <button
            key={p.id}
            onClick={() => onChange({ ...config, preset: p.id })}
            style={{
              padding: '12px 8px', borderRadius: 10, border: `2px solid ${config.preset === p.id ? 'var(--accent)' : 'var(--border)'}`,
              background: p.bg, color: 'white', cursor: 'pointer', transition: 'all 0.2s',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              boxShadow: config.preset === p.id ? '0 0 12px rgba(124,106,247,0.3)' : 'none'
            }}
          >
            <span style={{ fontSize: '1.2rem' }}>{p.icon}</span>
            <span style={{ fontSize: '0.65rem', fontWeight: 700 }}>{p.label}</span>
          </button>
        ))}
      </div>

      <div style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 12, letterSpacing: '0.05em' }}>
        Intensity Overrides
      </div>

      <div style={{ marginBottom: 15 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Ambient</span>
          <span style={{ fontSize: '0.72rem', fontWeight: 700 }}>{config.ambientIntensity.toFixed(1)}</span>
        </div>
        <input type="range" min="0" max="2" step="0.1" value={config.ambientIntensity}
          onChange={(e) => onChange({ ...config, ambientIntensity: parseFloat(e.target.value) })}
          style={{ width: '100%', accentColor: 'var(--accent)' }} />
      </div>

      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Directional</span>
          <span style={{ fontSize: '0.72rem', fontWeight: 700 }}>{config.directionalIntensity.toFixed(1)}</span>
        </div>
        <input type="range" min="0" max="5" step="0.1" value={config.directionalIntensity}
          onChange={(e) => onChange({ ...config, directionalIntensity: parseFloat(e.target.value) })}
          style={{ width: '100%', accentColor: 'var(--accent)' }} />
      </div>

      <div style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 12, letterSpacing: '0.05em' }}>
        Scene Helpers
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          onClick={() => onChange({ ...config, showGrid: !config.showGrid })}
          style={{
            flex: 1, padding: '8px', borderRadius: 8, border: '1px solid var(--border)',
            background: config.showGrid ? 'var(--accent-dim)' : 'var(--bg-card)',
            color: config.showGrid ? 'var(--accent)' : 'var(--text-secondary)',
            fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer'
          }}
        >
          {config.showGrid ? '✓ Grid' : 'Grid'}
        </button>
        <button
          onClick={() => onChange({ ...config, showAxes: !config.showAxes })}
          style={{
            flex: 1, padding: '8px', borderRadius: 8, border: '1px solid var(--border)',
            background: config.showAxes ? 'var(--accent-dim)' : 'var(--bg-card)',
            color: config.showAxes ? 'var(--accent)' : 'var(--text-secondary)',
            fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer'
          }}
        >
          {config.showAxes ? '✓ Axes' : 'Axes'}
        </button>
        <button
          onClick={() => onChange({ ...config, showShadows: !config.showShadows })}
          style={{
            flex: 1, padding: '8px', borderRadius: 8, border: '1px solid var(--border)',
            background: config.showShadows ? 'var(--accent-dim)' : 'var(--bg-card)',
            color: config.showShadows ? 'var(--accent)' : 'var(--text-secondary)',
            fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer'
          }}
        >
          {config.showShadows ? '✓ Shadows' : 'Shadows'}
        </button>
      </div>

      <div style={{ margin: '20px 0', borderTop: '1px solid var(--border)', paddingTop: 20 }}>
        <div style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 12, letterSpacing: '0.05em' }}>
          Render Pipeline (Lab)
        </div>

        <div style={{ marginBottom: 15 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Tone Mapping</span>
          </div>
          <select
            value={config.toneMapping}
            onChange={(e) => onChange({ ...config, toneMapping: e.target.value as ToneMappingMode })}
            style={{
              width: '100%', background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: 6, padding: '6px', color: 'var(--text-primary)', fontSize: '0.72rem', outline: 'none'
            }}
          >
            {toneMappingModes.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        <div style={{ marginBottom: 15 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Exposure</span>
            <span style={{ fontSize: '0.72rem', fontWeight: 700 }}>{config.exposure.toFixed(2)}</span>
          </div>
          <input type="range" min="0" max="4" step="0.01" value={config.exposure}
            onChange={(e) => onChange({ ...config, exposure: parseFloat(e.target.value) })}
            style={{ width: '100%', accentColor: 'var(--accent)' }} />
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>HDR Rotation</span>
            <span style={{ fontSize: '0.72rem', fontWeight: 700 }}>{Math.round(config.environmentRotation * (180 / Math.PI))}°</span>
          </div>
          <input type="range" min="0" max={Math.PI * 2} step="0.01" value={config.environmentRotation}
            onChange={(e) => onChange({ ...config, environmentRotation: parseFloat(e.target.value) })}
            style={{ width: '100%', accentColor: 'var(--accent)' }} />
        </div>

        {/* Post Processing Toggle */}
        <div
          onClick={() => onChange({ ...config, postProcessing: { ...config.postProcessing, enabled: !config.postProcessing.enabled } })}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px',
            background: config.postProcessing.enabled ? 'rgba(124,106,247,0.1)' : 'var(--bg-card)',
            border: `1px solid ${config.postProcessing.enabled ? 'var(--accent)' : 'var(--border)'}`,
            borderRadius: 8, cursor: 'pointer', transition: 'all 0.2s', marginBottom: 15
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '1rem' }}>🎥</span>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: config.postProcessing.enabled ? 'var(--accent)' : 'var(--text-primary)' }}>
              POST-PROCESSING {config.postProcessing.enabled ? 'ON' : 'OFF'}
            </span>
          </div>
          <div style={{
            width: 32, height: 18, borderRadius: 9, background: config.postProcessing.enabled ? 'var(--accent)' : 'var(--border)',
            position: 'relative', transition: 'background 0.2s'
          }}>
            <div style={{
              width: 14, height: 14, borderRadius: '50%', background: 'white', position: 'absolute', top: 2,
              left: config.postProcessing.enabled ? 16 : 2, transition: 'left 0.2s'
            }} />
          </div>
        </div>

        {config.postProcessing.enabled && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <PostProcessAccordion
              title="Bloom (Glow)"
              enabled={config.postProcessing.bloom.enabled}
              onToggle={(v) => onChange({ ...config, postProcessing: { ...config.postProcessing, bloom: { ...config.postProcessing.bloom, enabled: v } } })}
            >
              <ControlRow label="Intensity" value={config.postProcessing.bloom.intensity} min={0} max={5} step={0.1}
                onChange={v => onChange({ ...config, postProcessing: { ...config.postProcessing, bloom: { ...config.postProcessing.bloom, intensity: v } } })} />
              <ControlRow label="Radius" value={config.postProcessing.bloom.radius} min={0} max={1} step={0.01}
                onChange={v => onChange({ ...config, postProcessing: { ...config.postProcessing, bloom: { ...config.postProcessing.bloom, radius: v } } })} />
              <ControlRow label="Threshold" value={config.postProcessing.bloom.threshold} min={0} max={1} step={0.01}
                onChange={v => onChange({ ...config, postProcessing: { ...config.postProcessing, bloom: { ...config.postProcessing.bloom, threshold: v } } })} />
            </PostProcessAccordion>

            <PostProcessAccordion
              title="SSAO (Contact Shadows)"
              enabled={config.postProcessing.ssao.enabled}
              onToggle={(v) => onChange({ ...config, postProcessing: { ...config.postProcessing, ssao: { ...config.postProcessing.ssao, enabled: v } } })}
            >
              <ControlRow label="Intensity" value={config.postProcessing.ssao.intensity} min={0} max={5} step={0.1}
                onChange={v => onChange({ ...config, postProcessing: { ...config.postProcessing, ssao: { ...config.postProcessing.ssao, intensity: v } } })} />
              <ControlRow label="Radius" value={config.postProcessing.ssao.radius} min={0} max={0.5} step={0.01}
                onChange={v => onChange({ ...config, postProcessing: { ...config.postProcessing, ssao: { ...config.postProcessing.ssao, radius: v } } })} />
            </PostProcessAccordion>

            <PostProcessAccordion
              title="Depth of Field"
              enabled={config.postProcessing.dof.enabled}
              onToggle={(v) => onChange({ ...config, postProcessing: { ...config.postProcessing, dof: { ...config.postProcessing.dof, enabled: v } } })}
            >
              <ControlRow label="Focus Dist" value={config.postProcessing.dof.focusDistance} min={0} max={100} step={1}
                onChange={v => onChange({ ...config, postProcessing: { ...config.postProcessing, dof: { ...config.postProcessing.dof, focusDistance: v } } })} />
              <ControlRow label="Focal Length" value={config.postProcessing.dof.focalLength} min={10} max={100} step={1}
                onChange={v => onChange({ ...config, postProcessing: { ...config.postProcessing, dof: { ...config.postProcessing.dof, focalLength: v } } })} />
              <ControlRow label="Bokeh Scale" value={config.postProcessing.dof.bokehScale} min={0} max={10} step={0.1}
                onChange={v => onChange({ ...config, postProcessing: { ...config.postProcessing, dof: { ...config.postProcessing.dof, bokehScale: v } } })} />
            </PostProcessAccordion>

            <PostProcessAccordion
              title="Lens & Film"
              enabled={true} // Hybrid group
              noToggle
            >
              <div style={{ marginBottom: 10 }}>
                <ControlToggle label="Chromatic Aberration" value={config.postProcessing.chromaticAberration.enabled}
                  onChange={v => onChange({ ...config, postProcessing: { ...config.postProcessing, chromaticAberration: { ...config.postProcessing.chromaticAberration, enabled: v } } })} />
                {config.postProcessing.chromaticAberration.enabled && (
                  <ControlRow label="Offset" value={config.postProcessing.chromaticAberration.offset[0]} min={0} max={0.05} step={0.001}
                    onChange={v => onChange({ ...config, postProcessing: { ...config.postProcessing, chromaticAberration: { ...config.postProcessing.chromaticAberration, offset: [v, v] } } })} />
                )}
              </div>
              <div style={{ marginBottom: 10 }}>
                <ControlToggle label="Vignette" value={config.postProcessing.vignette.enabled}
                  onChange={v => onChange({ ...config, postProcessing: { ...config.postProcessing, vignette: { ...config.postProcessing.vignette, enabled: v } } })} />
                {config.postProcessing.vignette.enabled && (
                  <>
                    <ControlRow label="Offset" value={config.postProcessing.vignette.offset} min={0} max={1} step={0.01}
                      onChange={v => onChange({ ...config, postProcessing: { ...config.postProcessing, vignette: { ...config.postProcessing.vignette, offset: v } } })} />
                    <ControlRow label="Darkness" value={config.postProcessing.vignette.darkness} min={0} max={1} step={0.01}
                      onChange={v => onChange({ ...config, postProcessing: { ...config.postProcessing, vignette: { ...config.postProcessing.vignette, darkness: v } } })} />
                  </>
                )}
              </div>
              <ControlToggle label="Film Grain" value={config.postProcessing.noise.enabled}
                onChange={v => onChange({ ...config, postProcessing: { ...config.postProcessing, noise: { ...config.postProcessing.noise, enabled: v } } })} />
              {config.postProcessing.noise.enabled && (
                <ControlRow label="Opacity" value={config.postProcessing.noise.opacity} min={0} max={0.2} step={0.01}
                  onChange={v => onChange({ ...config, postProcessing: { ...config.postProcessing, noise: { ...config.postProcessing.noise, opacity: v } } })} />
              )}
            </PostProcessAccordion>

            <PostProcessAccordion title="Color Grading" enabled={true} noToggle>
              <ControlRow label="Brightness" value={config.postProcessing.colorGrading.brightness} min={-0.5} max={0.5} step={0.01}
                onChange={v => onChange({ ...config, postProcessing: { ...config.postProcessing, colorGrading: { ...config.postProcessing.colorGrading, brightness: v } } })} />
              <ControlRow label="Contrast" value={config.postProcessing.colorGrading.contrast} min={-0.5} max={0.5} step={0.01}
                onChange={v => onChange({ ...config, postProcessing: { ...config.postProcessing, colorGrading: { ...config.postProcessing.colorGrading, contrast: v } } })} />
              <ControlRow label="Saturation" value={config.postProcessing.colorGrading.saturation} min={-1} max={1} step={0.01}
                onChange={v => onChange({ ...config, postProcessing: { ...config.postProcessing, colorGrading: { ...config.postProcessing.colorGrading, saturation: v } } })} />
            </PostProcessAccordion>
          </div>
        )}
      </div>
    </div>
  );
}

function PostProcessAccordion({ title, enabled, onToggle, children, noToggle }: any) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 7, overflow: 'hidden' }}>
      <div
        onClick={() => setOpen(!open)}
        style={{
          padding: '8px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          cursor: 'pointer', background: open ? 'var(--bg-hover)' : 'transparent'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: '0.4rem', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.1s' }}>▶</span>
          <span style={{ fontSize: '0.68rem', fontWeight: 700, opacity: (noToggle || enabled) ? 1 : 0.5 }}>{title}</span>
        </div>
        {!noToggle && (
          <input
            type="checkbox"
            checked={enabled}
            onClick={e => e.stopPropagation()}
            onChange={e => onToggle(e.target.checked)}
          />
        )}
      </div>
      {open && <div style={{ padding: '8px 10px', borderTop: '1px solid var(--border)', background: 'rgba(0,0,0,0.1)' }}>{children}</div>}
    </div>
  );
}

function ControlRow({ label, value, min, max, step, onChange }: any) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: '0.6rem', color: 'var(--text-secondary)' }}>{label}</span>
        <span style={{ fontSize: '0.6rem', fontWeight: 600 }}>{value.toFixed(2)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ width: '100%', height: 3, accentColor: 'var(--accent)' }} />
    </div>
  );
}

function ControlToggle({ label, value, onChange }: any) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
      <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>{label}</span>
      <input type="checkbox" checked={value} onChange={e => onChange(e.target.checked)} />
    </div>
  );
}

// ──────────────────────────────────────────────
// Mesh list item
// ──────────────────────────────────────────────
function MeshListItem({
  mesh, selected, onClick,
}: { mesh: MeshInfo; selected: boolean; onClick: () => void }) {
  const matCount = Array.isArray(mesh.material) ? mesh.material.length : 1;
  return (
    <div
      className={`mesh-item ${selected ? 'selected' : ''}`}
      onClick={onClick}
      style={{ padding: '7px 10px 7px 14px', display: 'flex', flexDirection: 'column', gap: 3 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
        <span style={{
          fontSize: '0.78rem', fontWeight: selected ? 600 : 400,
          color: selected ? 'var(--accent)' : 'var(--text-primary)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 165,
        }} title={mesh.name}>{mesh.name}</span>
        <span className="tag tag-mat">{matCount} mat</span>
      </div>
      <div style={{ display: 'flex', gap: 8, fontSize: '0.67rem', color: 'var(--text-secondary)' }}>
        <span>{fmtNum(mesh.geometry.vertexCount)} vx</span>
        <span>·</span>
        <span>{fmtNum(mesh.geometry.triangleCount)} tri</span>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// Mesh detail + edit panel
// ──────────────────────────────────────────────
function MeshDetailPanel({
  mesh,
  onColorChange,
  onScaleChange,
  colorOverrides,
  scaleOverride,
  textureStats,
}: {
  mesh: MeshInfo;
  onColorChange: (o: ColorOverride) => void;
  onScaleChange: (s: ScaleOverride) => void;
  colorOverrides: ColorOverride[];
  scaleOverride: ScaleOverride;
    textureStats: TextureUsageStats | null;
}) {
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

  return (
    <div>
      {/* Scale */}
      <Accordion title="Scale Controls" defaultOpen>
        <ScaleControls
          meshUuid={mesh.uuid}
          onScaleChange={onScaleChange}
          currentScale={scaleOverride}
        />
      </Accordion>

      {/* Geometry */}
      <Accordion title="Geometry" defaultOpen>
        <div className="prop-row"><span className="prop-key">Type</span><span className="prop-val">{mesh.geometry.type}</span></div>
        <div className="prop-row"><span className="prop-key">Vertices</span><span className="prop-val">{fmtNum(mesh.geometry.vertexCount)}</span></div>
        <div className="prop-row"><span className="prop-key">Triangles</span><span className="prop-val">{fmtNum(mesh.geometry.triangleCount)}</span></div>
        <div className="prop-row"><span className="prop-key">UV Coords</span><BoolChip value={mesh.geometry.hasUV} /></div>
        <div className="prop-row"><span className="prop-key">Normals</span><BoolChip value={mesh.geometry.hasNormals} /></div>
        <div className="prop-row"><span className="prop-key">Tangents</span><BoolChip value={mesh.geometry.hasTangents} /></div>
        <div className="prop-row"><span className="prop-key">Vertex Colors</span><BoolChip value={mesh.geometry.hasVertexColors} /></div>
        {mesh.geometry.morphTargetsCount > 0 && (
          <div className="prop-row"><span className="prop-key">Morph Targets</span><span className="prop-val">{mesh.geometry.morphTargetsCount}</span></div>
        )}
        {mesh.geometry.boundingBox && (
          <>
            <div className="section-header">Bounding Box</div>
            <div className="prop-row"><span className="prop-key">W (X)</span><span className="prop-val">{mesh.geometry.boundingBox.size.x}</span></div>
            <div className="prop-row"><span className="prop-key">H (Y)</span><span className="prop-val">{mesh.geometry.boundingBox.size.y}</span></div>
            <div className="prop-row"><span className="prop-key">D (Z)</span><span className="prop-val">{mesh.geometry.boundingBox.size.z}</span></div>
          </>
        )}
      </Accordion>

      {/* Transform */}
      <Accordion title="World Transform">
        <div className="prop-row"><span className="prop-key">Pos X</span><span className="prop-val">{mesh.worldPosition.x}</span></div>
        <div className="prop-row"><span className="prop-key">Pos Y</span><span className="prop-val">{mesh.worldPosition.y}</span></div>
        <div className="prop-row"><span className="prop-key">Pos Z</span><span className="prop-val">{mesh.worldPosition.z}</span></div>
        <div className="prop-row"><span className="prop-key">Cast Shadow</span><BoolChip value={mesh.castShadow} /></div>
        <div className="prop-row"><span className="prop-key">Recv Shadow</span><BoolChip value={mesh.receiveShadow} /></div>
      </Accordion>

      {/* Materials */}
      <Accordion title="Materials" badge={mats.length} defaultOpen>
        {mats.map((mat, i) => (
          <MaterialBlock
            key={mat.uuid}
            mat={mat}
            index={mats.length > 1 ? i : undefined}
            meshUuid={mesh.uuid}
            onColorChange={onColorChange}
            overrideColor={colorOverrides.find((o) => o.meshUuid === mesh.uuid && o.matIndex === i)?.color}
          />
        ))}
      </Accordion>

      {/* Texture Intelligence */}
      {textureStats && (
        <Accordion title="GPU Texture Intelligence" defaultOpen>
          <div className="prop-row">
            <span className="prop-key">Maps</span>
            <span className="prop-val">{textureStats.count}</span>
          </div>
          <div className="prop-row">
            <span className="prop-key">VRAM usage</span>
            <span className="prop-val" style={{
              color: textureStats.totalMemory > 5 * 1024 * 1024 ? 'var(--warning)' : 'var(--text-primary)'
            }}>
              {TextureAnalyzer.formatMemory(textureStats.totalMemory)}
            </span>
          </div>
          <div className="prop-row">
            <span className="prop-key">Largest Res</span>
            <span className="prop-val" style={{
              color: textureStats.largestRes >= 2048 ? 'var(--error)' : 'var(--text-primary)'
            }}>
              {textureStats.largestRes}px
            </span>
          </div>
          {textureStats.isOverkill && (
            <div style={{
              padding: '8px 10px', background: 'rgba(244, 63, 94, 0.1)',
              border: '1px solid var(--error)', borderRadius: 8, marginTop: 4
            }}>
              <div style={{ fontSize: '0.65rem', color: 'var(--error)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                ⚠️ TEXTURE OVERKILL
              </div>
              <div style={{ fontSize: '0.58rem', color: 'var(--text-secondary)', marginTop: 2, lineHeight: 1.2 }}>
                Small mesh using {textureStats.largestRes}px textures. suggest downscaling to {textureStats.largestRes >= 4096 ? '1K' : '512px'}.
              </div>
            </div>
          )}
        </Accordion>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────
// Main SidePanel export
// ──────────────────────────────────────────────
interface SidePanelProps {
  meshes: MeshInfo[];
  stats: ModelStats | null;
  selectedMeshUuid: string | null;
  onSelectMesh: (uuid: string | null) => void;
  onColorChange: (o: ColorOverride) => void;
  colorOverrides: ColorOverride[];
  onScaleChange: (s: ScaleOverride) => void;
  scaleOverrides: ScaleOverride[];
  performanceStats: PerformanceStats | null;
  onLightingChange: (config: LightingConfig) => void;
  sceneAnalysis: SceneAnalysisReport | null;
  onHighlightMeshes?: (uuids: string[]) => void;
  onOptimize?: (issue: StructuralIssue) => void;
  onDismiss?: (issue: StructuralIssue) => void;
  optimizationHistory?: OptimizationEvent[];
  lightingConfig: LightingConfig;
  debugMode: DebugRenderMode;
  onDebugModeChange: (m: DebugRenderMode) => void;
  scene: THREE.Object3D | null;
  sceneTree: SceneNode | null;
  onToggleVisibility: (uuid: string, visible: boolean) => void;
  onFocus: (uuid: string) => void;
  onIsolate: (uuid: string) => void;
  clips: AnimationClipInfo[];
  playbackConfig: PlaybackConfig;
  onPlaybackConfigChange: (config: Partial<PlaybackConfig>) => void;
}

export default function SidePanel({
  meshes,
  stats,
  selectedMeshUuid,
  onSelectMesh,
  onColorChange,
  colorOverrides,
  onScaleChange,
  scaleOverrides,
  performanceStats,
  lightingConfig,
  onLightingChange,
  sceneAnalysis,
  onHighlightMeshes,
  onOptimize,
  onDismiss,
  optimizationHistory = [],
  debugMode,
  onDebugModeChange,
  scene,
  sceneTree,
  onToggleVisibility,
  onFocus,
  onIsolate,
}: SidePanelProps) {
  const [activeTab, setActiveTab] = useState<'info' | 'performance' | 'analysis' | 'lighting' | 'history' | 'debug' | 'scene' | 'animation'>('info');
  const [search, setSearch] = useState('');

  const selectedMesh = useMemo(
    () => meshes.find((m) => m.uuid === selectedMeshUuid) ?? null,
    [meshes, selectedMeshUuid],
  );

  const filteredMeshes = useMemo(
    () => meshes.filter((m) => m.name.toLowerCase().includes(search.toLowerCase())),
    [meshes, search],
  );

  const selectedScale = useMemo(
    () => scaleOverrides.find((s) => s.meshUuid === selectedMeshUuid) ?? { meshUuid: selectedMeshUuid ?? '', x: 1, y: 1, z: 1 },
    [scaleOverrides, selectedMeshUuid],
  );

  const meshTextureStats = useMemo(() => {
    if (!selectedMesh || !scene) return null;
    let target: THREE.Mesh | null = null;
    scene.traverse(node => {
      if (node instanceof THREE.Mesh && node.uuid === selectedMesh.uuid) {
        target = node;
      }
    });
    return target ? TextureAnalyzer.getMeshTextureStats(target) : null;
  }, [selectedMesh, scene]);

  return (
    <div style={{
      width: 300, minWidth: 260, maxWidth: 340, height: '100%',
      display: 'flex', flexDirection: 'column',
      background: 'var(--bg-panel)', borderLeft: '1px solid var(--border)', overflow: 'hidden',
    }}>
      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)', overflowX: 'auto', scrollbarWidth: 'none' }}>
        <button key="scene" onClick={() => setActiveTab('scene')} style={{
          flex: 1, minWidth: 60, padding: '10px 0', fontSize: '0.55rem', fontWeight: 700,
          letterSpacing: '0.01em', textTransform: 'uppercase',
          background: 'none', border: 'none',
          borderBottom: `2px solid ${activeTab === 'scene' ? 'var(--accent)' : 'transparent'}`,
          color: activeTab === 'scene' ? 'var(--accent)' : 'var(--text-secondary)',
          cursor: 'pointer', transition: 'all 0.15s',
          whiteSpace: 'nowrap',
        }}>
          Scene
        </button>
        <button key="info" onClick={() => setActiveTab('info')} style={{
          flex: 1, minWidth: 60, padding: '10px 0', fontSize: '0.55rem', fontWeight: 700,
          letterSpacing: '0.01em', textTransform: 'uppercase',
          background: 'none', border: 'none',
          borderBottom: `2px solid ${activeTab === 'info' ? 'var(--accent)' : 'transparent'}`,
          color: activeTab === 'info' ? 'var(--accent)' : 'var(--text-secondary)',
          cursor: 'pointer', transition: 'all 0.15s',
          whiteSpace: 'nowrap',
        }}>
          Info
        </button>
        <button key="performance" onClick={() => setActiveTab('performance')} style={{
          flex: 1, minWidth: 60, padding: '10px 0', fontSize: '0.55rem', fontWeight: 700,
          letterSpacing: '0.01em', textTransform: 'uppercase',
          background: 'none', border: 'none',
          borderBottom: `2px solid ${activeTab === 'performance' ? 'var(--accent)' : 'transparent'}`,
          color: activeTab === 'performance' ? 'var(--accent)' : 'var(--text-secondary)',
          cursor: 'pointer', transition: 'all 0.15s',
          whiteSpace: 'nowrap',
        }}>
          ⚡ Perf
        </button>
        <button key="analysis" onClick={() => setActiveTab('analysis')} style={{
          flex: 1, minWidth: 60, padding: '10px 0', fontSize: '0.55rem', fontWeight: 700,
          letterSpacing: '0.01em', textTransform: 'uppercase',
          background: 'none', border: 'none',
          borderBottom: `2px solid ${activeTab === 'analysis' ? 'var(--accent)' : 'transparent'}`,
          color: activeTab === 'analysis' ? 'var(--accent)' : 'var(--text-secondary)',
          cursor: 'pointer', transition: 'all 0.15s',
          whiteSpace: 'nowrap',
        }}>
          🧠 Analysis
          {sceneAnalysis && sceneAnalysis.issues.length > 0 && (
            <span style={{
              marginLeft: 5, background: 'var(--error)', color: 'white',
              borderRadius: '50%', width: 14, height: 14, fontSize: '0.55rem',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center'
            }}>
              {sceneAnalysis.issues.length}
            </span>
          )}
        </button>
        <button key="history" onClick={() => setActiveTab('history')} style={{
          flex: 1, minWidth: 60, padding: '10px 0', fontSize: '0.55rem', fontWeight: 700,
          letterSpacing: '0.01em', textTransform: 'uppercase',
          background: 'none', border: 'none',
          borderBottom: `2px solid ${activeTab === 'history' ? 'var(--accent)' : 'transparent'}`,
          color: activeTab === 'history' ? 'var(--accent)' : 'var(--text-secondary)',
          cursor: 'pointer', transition: 'all 0.15s',
          whiteSpace: 'nowrap',
        }}>
          History
          {optimizationHistory.length > 0 && (
            <span style={{
              marginLeft: 5, background: 'var(--success)', color: 'white',
              borderRadius: '50%', width: 14, height: 14, fontSize: '0.55rem',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center'
            }}>
              {optimizationHistory.length}
            </span>
          )}
        </button>
        <button key="lighting" onClick={() => setActiveTab('lighting')} style={{
          flex: 1, minWidth: 60, padding: '10px 0', fontSize: '0.55rem', fontWeight: 700,
          letterSpacing: '0.01em', textTransform: 'uppercase',
          background: 'none', border: 'none',
          borderBottom: `2px solid ${activeTab === 'lighting' ? 'var(--accent)' : 'transparent'}`,
          color: activeTab === 'lighting' ? 'var(--accent)' : 'var(--text-secondary)',
          cursor: 'pointer', transition: 'all 0.15s',
          whiteSpace: 'nowrap',
        }}>
          💡 Light
        </button>
        <button key="debug" onClick={() => setActiveTab('debug')} style={{
          flex: 1, minWidth: 60, padding: '10px 0', fontSize: '0.55rem', fontWeight: 700,
          letterSpacing: '0.01em', textTransform: 'uppercase',
          background: 'none', border: 'none',
          borderBottom: `2px solid ${activeTab === 'debug' ? 'var(--accent)' : 'transparent'}`,
          color: activeTab === 'debug' ? 'var(--accent)' : 'var(--text-secondary)',
          cursor: 'pointer', transition: 'all 0.15s',
          whiteSpace: 'nowrap',
        }}>
          🧪 Debug
          {debugMode !== 'none' && (
            <span style={{
              marginLeft: 5, background: 'var(--accent)', color: 'white',
              borderRadius: '50%', width: 8, height: 8, display: 'inline-block'
            }} />
          )}
        </button>
        <button key="animation" onClick={() => setActiveTab('animation')} style={{
          flex: 1, minWidth: 60, padding: '10px 0', fontSize: '0.55rem', fontWeight: 700,
          letterSpacing: '0.01em', textTransform: 'uppercase',
          background: 'none', border: 'none',
          borderBottom: `2px solid ${activeTab === 'animation' ? 'var(--accent)' : 'transparent'}`,
          color: activeTab === 'animation' ? 'var(--accent)' : 'var(--text-secondary)',
          cursor: 'pointer', transition: 'all 0.15s',
          whiteSpace: 'nowrap',
        }}>
          🎬 Anim
          {clips.length > 0 && (
            <span style={{
              marginLeft: 5, background: 'var(--accent)', color: 'white',
              borderRadius: '50%', width: 14, height: 14, fontSize: '0.55rem',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center'
            }}>
              {clips.length}
            </span>
          )}
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* SCENE TAB */}
        {activeTab === 'scene' && (
          <SceneExplorerPanel
            sceneTree={sceneTree}
            selectedUuid={selectedMeshUuid}
            onSelect={onSelectMesh}
            onToggleVisibility={onToggleVisibility}
            onFocus={onFocus}
            onIsolate={onIsolate}
          />
        )}

        {/* INFO TAB (meshes + details + stats) */}
        {activeTab === 'info' && (
          <>
            {stats && <StatsPanel stats={stats} scene={scene} />}
            <div>
              <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>
                <input
                  type="text"
                  placeholder="Search meshes…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{
                    width: '100%', background: 'var(--bg-card)', border: '1px solid var(--border)',
                    borderRadius: 7, padding: '6px 10px', color: 'var(--text-primary)',
                    fontSize: '0.78rem', outline: 'none',
                  }}
                />
              </div>
              {filteredMeshes.length === 0 && (
                <div style={{ padding: 20, color: 'var(--text-secondary)', fontSize: '0.78rem', textAlign: 'center' }}>
                  No meshes found
                </div>
              )}
              {filteredMeshes.map((mesh) => (
                <MeshListItem
                  key={mesh.uuid}
                  mesh={mesh}
                  selected={mesh.uuid === selectedMeshUuid}
                  onClick={() => {
                    onSelectMesh(mesh.uuid === selectedMeshUuid ? null : mesh.uuid);
                  }}
                />
              ))}
            </div>

            {selectedMesh ? (
              <>
                <div style={{
                  padding: '8px 12px', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)',
                }}>
                  <div style={{
                    fontSize: '0.88rem', fontWeight: 700, color: 'var(--accent)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }} title={selectedMesh.name}>{selectedMesh.name}</div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                    UUID: {selectedMesh.uuid.slice(0, 20)}…
                  </div>
                </div>
                <MeshDetailPanel
                  mesh={selectedMesh}
                  onColorChange={onColorChange}
                  onScaleChange={onScaleChange}
                  colorOverrides={colorOverrides}
                  scaleOverride={selectedScale}
                  textureStats={meshTextureStats}
                />
              </>
            ) : (
              <div style={{ padding: 30, color: 'var(--text-secondary)', fontSize: '0.82rem', textAlign: 'center', lineHeight: 1.6 }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
                  style={{ margin: '0 auto 10px', display: 'block', opacity: 0.35 }}>
                  <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
                  <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
                </svg>
                Select a mesh from the Meshes tab or click on the model
              </div>
            )}

            {/* Stats are shown at the top of info tab already */}
          </>
        )}

        {/* PERFORMANCE TAB */}
        {activeTab === 'performance' && (
          <div>
            {performanceStats ? <PerformancePanel stats={performanceStats} /> : (
              <div style={{ padding: 30, color: 'var(--text-secondary)', fontSize: '0.82rem', textAlign: 'center', lineHeight: 1.6 }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
                  style={{ margin: '0 auto 10px', display: 'block', opacity: 0.35 }}>
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                </svg>
                Real-time performance metrics will appear here once a model is active.
              </div>
            )}
          </div>
        )}

        {/* ANALYSIS TAB */}
        {activeTab === 'analysis' && (
          <>
            {sceneAnalysis ? (
              <AnalysisPanel
                assessment={sceneAnalysis}
                onHighlightMeshes={onHighlightMeshes}
                onOptimize={onOptimize}
                onDismiss={onDismiss}
              />
            ) : (
              <div style={{ padding: 40, color: 'var(--text-secondary)', fontSize: '0.82rem', textAlign: 'center', lineHeight: 1.6 }}>
                <div style={{ marginBottom: 15, opacity: 0.3 }}>🧠</div>
                Structural analysis initializing…
                </div>
            )}
          </>
        )}

        {/* HISTORY TAB */}
        {activeTab === 'history' && (
          <HistoryPanel history={optimizationHistory} />
        )}

        {/* LIGHTING TAB */}
        {activeTab === 'lighting' && (
          <LightingPanel config={lightingConfig} onChange={onLightingChange} />
        )}

        {/* DEBUG TAB */}
        {activeTab === 'debug' && (
          <DebugPanel currentMode={debugMode} onChange={onDebugModeChange} />
        )}

        {/* ANIMATION TAB */}
        {activeTab === 'animation' && (
          <AnimationPanel
            clips={clips}
            playbackConfig={playbackConfig}
            onChange={onPlaybackConfigChange}
          />
        )}
      </div>

      {/* Footer */}
      {meshes.length > 0 && (
        <div style={{
          padding: '8px 12px', borderTop: '1px solid var(--border)',
          fontSize: '0.68rem', color: 'var(--text-secondary)',
          display: 'flex', justifyContent: 'space-between',
        }}>
          <span>{meshes.length} meshes</span>
          {selectedMesh && (
            <button style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: '0.68rem', cursor: 'pointer' }}
              onClick={() => onSelectMesh(null)}>
              Deselect
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function AnimationPanel({ clips, playbackConfig, onChange }: { clips: AnimationClipInfo[]; playbackConfig: PlaybackConfig; onChange: (c: Partial<PlaybackConfig>) => void }) {
  if (clips.length === 0) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>
        <div style={{ fontSize: '2rem', marginBottom: 10 }}>🎬</div>
        <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>No Animations Found</div>
        <p style={{ fontSize: '0.65rem', marginTop: 4 }}>This model does not contain any animation clips.</p>
      </div>
    );
  }

  const selectedClip = clips[playbackConfig.selectedIndex];

  return (
    <div style={{ padding: 15 }}>
      {/* Clip Selector */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 8, letterSpacing: '0.05em' }}>
          Select Clip
        </div>
        <select
          value={playbackConfig.selectedIndex}
          onChange={(e) => onChange({ selectedIndex: parseInt(e.target.value) })}
          style={{
            width: '100%', background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '10px', color: 'var(--text-primary)', fontSize: '0.8rem',
            outline: 'none', cursor: 'pointer'
          }}
        >
          {clips.map((clip, i) => (
            <option key={i} value={i}>{clip.name} ({clip.duration.toFixed(2)}s)</option>
          ))}
        </select>
      </div>

      {/* Timeline Controls */}
      <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, padding: 15, border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => onChange({ playing: !playbackConfig.playing })}
              style={{
                width: 36, height: 36, borderRadius: '50%', border: 'none',
                background: playbackConfig.playing ? 'rgba(244, 63, 94, 0.2)' : 'var(--accent)',
                color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}
            >
              {playbackConfig.playing ? '⏸' : '▶'}
            </button>
            <button
              onClick={() => onChange({ currentTime: 0, playing: false })}
              style={{
                width: 36, height: 36, borderRadius: '50%', border: '1px solid var(--border)',
                background: 'var(--bg-card)', color: 'var(--text-primary)', cursor: 'pointer'
              }}
            >
              ⏹
            </button>
          </div>

          <button
            onClick={() => onChange({ loop: !playbackConfig.loop })}
            style={{
              padding: '4px 10px', borderRadius: 20, fontSize: '0.6rem', fontWeight: 800,
              background: playbackConfig.loop ? 'rgba(34, 211, 163, 0.15)' : 'var(--bg-card)',
              border: `1px solid ${playbackConfig.loop ? 'var(--success)' : 'var(--border)'}`,
              color: playbackConfig.loop ? 'var(--success)' : 'var(--text-secondary)',
              cursor: 'pointer'
            }}
          >
            {playbackConfig.loop ? 'LOOP: ON' : 'LOOP: OFF'}
          </button>
        </div>

        {/* Timeline Slider */}
        <div style={{ marginBottom: 15 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: '0.65rem', fontFamily: 'JetBrains Mono', color: 'var(--text-secondary)' }}>
              {playbackConfig.currentTime.toFixed(2)}s
            </span>
            <span style={{ fontSize: '0.65rem', fontFamily: 'JetBrains Mono', color: 'var(--text-secondary)' }}>
              {playbackConfig.duration.toFixed(2)}s
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={playbackConfig.duration}
            step={0.01}
            value={playbackConfig.currentTime}
            onChange={(e) => onChange({ currentTime: parseFloat(e.target.value), playing: false })}
            style={{ width: '100%', height: 4, accentColor: 'var(--accent)', cursor: 'pointer' }}
          />
        </div>

        {/* Playback Speed */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontWeight: 700 }}>PLAYBACK SPEED</span>
            <span style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--accent)' }}>{playbackConfig.speed.toFixed(1)}x</span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[0.5, 1.0, 1.5, 2.0].map(s => (
              <button
                key={s}
                onClick={() => onChange({ speed: s })}
                style={{
                  flex: 1, padding: '6px', borderRadius: 6, fontSize: '0.65rem', fontWeight: 700,
                  background: playbackConfig.speed === s ? 'var(--accent)' : 'var(--bg-card)',
                  color: playbackConfig.speed === s ? 'white' : 'var(--text-secondary)',
                  border: '1px solid var(--border)', cursor: 'pointer'
                }}
              >
                {s}x
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 20, padding: 12, borderRadius: 8, background: 'rgba(124, 106, 247, 0.05)', border: '1px solid rgba(124, 106, 247, 0.1)' }}>
        <div style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--accent)', marginBottom: 8 }}>CLIP METADATA</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Tracks</span>
            <span style={{ fontSize: '0.7rem', fontWeight: 700 }}>{selectedClip?.tracks} channels</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Duration</span>
            <span style={{ fontSize: '0.7rem', fontWeight: 700 }}>{selectedClip?.duration.toFixed(2)} seconds</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function DebugPanel({ currentMode, onChange }: { currentMode: DebugRenderMode; onChange: (m: DebugRenderMode) => void }) {
  return (
    <div style={{ padding: 12 }}>
      <div style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 12, letterSpacing: '0.05em' }}>
        Mesh Debug Modes
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <DebugModeButton mode="none" label="Default View" icon="🎨" current={currentMode} onClick={onChange} />
        <DebugModeButton mode="wireframe" label="Wireframe" icon="🕸️" current={currentMode} onClick={onChange} />
        <DebugModeButton mode="normals" label="Normals" icon="🌈" current={currentMode} onClick={onChange} />
        <DebugModeButton mode="uv" label="UV Checker" icon="🏁" current={currentMode} onClick={onChange} />
        <DebugModeButton mode="heatmap" label="Texture Density" icon="🌡️" current={currentMode} onClick={onChange} />
        <DebugModeButton mode="overdraw" label="Overdraw" icon="🔥" current={currentMode} onClick={onChange} />
        <DebugModeButton mode="gpu_cost" label="GPU Cost" icon="💸" current={currentMode} onClick={onChange} />
      </div>
    </div>
  );
}

function DebugModeButton({ mode, label, icon, current, onClick }: { mode: DebugRenderMode; label: string; icon: string; current: DebugRenderMode; onClick: (m: DebugRenderMode) => void }) {
  const active = current === mode;
  return (
    <button
      onClick={() => onClick(mode)}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '12px 8px', borderRadius: 10, border: active ? '1px solid var(--accent)' : '1px solid var(--border)',
        background: active ? 'var(--accent-dim)' : 'var(--bg-card)',
        cursor: 'pointer', transition: 'all 0.2s', gap: 6
      }}
    >
      <span style={{ fontSize: '1.2rem' }}>{icon}</span>
      <span style={{ fontSize: '0.6rem', fontWeight: 700, color: active ? 'var(--accent)' : 'var(--text-secondary)', textAlign: 'center' }}>
        {label}
      </span>
    </button>
  );
}
