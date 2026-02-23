'use client';

import React, { useState } from 'react';
import { SceneNode } from '@/types/model';

interface SceneExplorerPanelProps {
  sceneTree: SceneNode | null;
  selectedUuid: string | null;
  onSelect: (uuid: string | null) => void;
  onToggleVisibility: (uuid: string, visible: boolean) => void;
  onFocus: (uuid: string) => void;
  onIsolate: (uuid: string) => void;
}

export function SceneExplorerPanel({
  sceneTree,
  selectedUuid,
  onSelect,
  onToggleVisibility,
  onFocus,
  onIsolate,
}: SceneExplorerPanelProps) {
  const [search, setSearch] = useState('');

  if (!sceneTree) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
        <div style={{ fontSize: '2rem', marginBottom: 16, opacity: 0.3 }}>🧊</div>
        No hierarchy data available.<br/>Load a model to explore the scene graph.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-primary)' }}>
      <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
        <input 
          type="text" 
          placeholder="Search hierarchy..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width: '100%', background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 7, padding: '6px 10px', color: 'var(--text-primary)',
            fontSize: '0.78rem', outline: 'none',
          }}
        />
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <TreeNode 
          node={sceneTree} 
          depth={0} 
          selectedUuid={selectedUuid}
          onSelect={onSelect}
          onToggleVisibility={onToggleVisibility}
          onFocus={onFocus}
          onIsolate={onIsolate}
          search={search}
        />
      </div>
    </div>
  );
}

function TreeNode({ node, depth, selectedUuid, onSelect, onToggleVisibility, onFocus, onIsolate, search }: any) {
  const [expanded, setExpanded] = useState(depth < 2); // Auto-expand top levels
  const isSelected = selectedUuid === node.uuid;
  const hasChildren = node.children && node.children.length > 0;
  
  // Icon based on type
  const getIcon = (type: string) => {
    if (type.includes('Mesh')) return '🧊';
    if (type === 'Group') return '📦';
    if (type.includes('Light')) return '💡';
    if (type.includes('Camera')) return '🎥';
    if (type === 'Scene') return '🌐';
    if (type === 'LOD') return '📉';
    if (type === 'Bone') return '🦴';
    return '⚪';
  };

  // Search logic: Match if name contains search or any child matches
  const matchesSearch = (n: SceneNode, s: string): boolean => {
    if (!s) return true;
    if (n.name.toLowerCase().includes(s.toLowerCase())) return true;
    return n.children.some(child => matchesSearch(child, s));
  };

  if (!matchesSearch(node, search)) return null;

  return (
    <div style={{ marginLeft: depth > 0 ? 0 : 0 }}>
      <div 
        onClick={() => onSelect(node.uuid)}
        className="tree-node-row"
        style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '3px 8px', 
          paddingLeft: 8 + depth * 14, cursor: 'pointer',
          background: isSelected ? 'rgba(34,211,163,0.12)' : 'transparent',
          borderLeft: `2px solid ${isSelected ? 'var(--accent)' : 'transparent'}`,
          color: node.visible ? 'var(--text-primary)' : 'var(--text-secondary)',
          opacity: node.visible ? 1 : 0.6,
          transition: 'background 0.15s',
          userSelect: 'none',
          minHeight: 28
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = isSelected ? 'rgba(34,211,163,0.18)' : 'rgba(255,255,255,0.03)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = isSelected ? 'rgba(34,211,163,0.12)' : 'transparent')}
      >
        <div 
          onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
          style={{ width: 12, display: 'flex', alignItems: 'center', opacity: hasChildren ? 0.6 : 0, fontSize: '0.5rem' }}
        >
          {hasChildren && (
            <span style={{ 
              transform: expanded ? 'rotate(90deg)' : 'none', 
              transition: 'transform 0.1s', 
              display: 'inline-block' 
            }}>▶</span>
          )}
        </div>
        
        <span style={{ fontSize: '0.85rem' }}>{getIcon(node.type)}</span>
        <span style={{ 
          flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          fontSize: '0.74rem', fontWeight: isSelected ? 700 : 400
        }} title={node.name}>
          {node.name}
        </span>

        {/* Badges */}
        <div style={{ display: 'flex', gap: 3, marginRight: 6 }}>
          {node.isInstanced && <span title="Instanced" style={{ fontSize: '0.5rem', padding: '0 3px', background: 'var(--accent)', color: 'white', borderRadius: 2, fontWeight: 800 }}>I</span>}
          {node.isMerged && <span title="Merged" style={{ fontSize: '0.5rem', padding: '0 3px', background: 'var(--success)', color: 'white', borderRadius: 2, fontWeight: 800 }}>M</span>}
          {node.hasLOD && <span title="LOD Active" style={{ fontSize: '0.5rem', padding: '0 3px', background: '#f59e0b', color: 'white', borderRadius: 2, fontWeight: 800 }}>L</span>}
        </div>

        {/* Actions */}
        <div className="node-actions" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button 
            title={node.visible ? 'Hide' : 'Show'}
            onClick={(e) => { e.stopPropagation(); onToggleVisibility(node.uuid, !node.visible); }}
            style={{ 
              background: 'none', border: 'none', cursor: 'pointer', outline: 'none',
              fontSize: '0.75rem', padding: 0, opacity: 0.5, transition: 'opacity 0.2s'
            }}
            onMouseEnter={e => e.currentTarget.style.opacity = '1'}
            onMouseLeave={e => e.currentTarget.style.opacity = '0.5'}
          >
            {node.visible ? '👁️' : '🕶️'}
          </button>
          
          {depth > 0 && node.type === 'Mesh' && (
            <button 
              title="Focus Camera"
              onClick={(e) => { e.stopPropagation(); onFocus(node.uuid); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem', padding: 0 }}
            >
              🎯
            </button>
          )}
        </div>
      </div>
      
      {hasChildren && expanded && (
        <div style={{ borderLeft: '1px solid rgba(255,255,255,0.05)', marginLeft: 14 + depth * 0 }}>
          {node.children.map((child: SceneNode) => (
            <TreeNode 
              key={child.uuid} 
              node={child} 
              depth={depth + 1} 
              selectedUuid={selectedUuid}
              onSelect={onSelect}
              onToggleVisibility={onToggleVisibility}
              onFocus={onFocus}
              onIsolate={onIsolate}
              search={search}
            />
          ))}
        </div>
      )}
    </div>
  );
}
