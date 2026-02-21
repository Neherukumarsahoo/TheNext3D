'use client';

import React, { useMemo, useState, useCallback } from 'react';
import type { MeshInfo, MaterialInfo, ModelStats } from '@/types/model';

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────
function fmtNum(n: number) { return n.toLocaleString(); }

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
function StatsPanel({ stats }: { stats: ModelStats }) {
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
}: {
  mesh: MeshInfo;
  onColorChange: (o: ColorOverride) => void;
  onScaleChange: (s: ScaleOverride) => void;
  colorOverrides: ColorOverride[];
  scaleOverride: ScaleOverride;
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
    </div>
  );
}

// ──────────────────────────────────────────────
// Main SidePanel export
// ──────────────────────────────────────────────
type Tab = 'meshes' | 'details' | 'stats';

interface SidePanelProps {
  meshes: MeshInfo[];
  stats: ModelStats | null;
  selectedMeshUuid: string | null;
  onSelectMesh: (uuid: string | null) => void;
  onColorChange: (o: ColorOverride) => void;
  colorOverrides: ColorOverride[];
  onScaleChange: (s: ScaleOverride) => void;
  scaleOverrides: ScaleOverride[];
}

export default function SidePanel({
  meshes, stats, selectedMeshUuid, onSelectMesh,
  onColorChange, colorOverrides, onScaleChange, scaleOverrides,
}: SidePanelProps) {
  const [tab, setTab] = useState<Tab>('meshes');
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

  return (
    <div style={{
      width: 300, minWidth: 260, maxWidth: 340, height: '100%',
      display: 'flex', flexDirection: 'column',
      background: 'var(--bg-panel)', borderLeft: '1px solid var(--border)', overflow: 'hidden',
    }}>
      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
        {(['meshes', 'details', 'stats'] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{
            flex: 1, padding: '10px 0', fontSize: '0.72rem', fontWeight: 600,
            letterSpacing: '0.06em', textTransform: 'uppercase',
            background: 'none', border: 'none',
            borderBottom: `2px solid ${tab === t ? 'var(--accent)' : 'transparent'}`,
            color: tab === t ? 'var(--accent)' : 'var(--text-secondary)',
            cursor: 'pointer', transition: 'all 0.15s',
          }}>
            {t}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* MESHES TAB */}
        {tab === 'meshes' && (
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
                  setTab('details');
                }}
              />
            ))}
          </div>
        )}

        {/* DETAILS TAB */}
        {tab === 'details' && (
          <div>
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
          </div>
        )}

        {/* STATS TAB */}
        {tab === 'stats' && (
          <div>
            {stats ? <StatsPanel stats={stats} /> : (
              <div style={{ padding: 30, color: 'var(--text-secondary)', fontSize: '0.82rem', textAlign: 'center' }}>
                Load a model to see stats
              </div>
            )}
          </div>
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
