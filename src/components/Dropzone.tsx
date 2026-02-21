'use client';

import React, { useCallback, useState } from 'react';

interface DropzoneProps {
  onFileSelected: (file: File) => void;
}

const ACCEPTED = ['.glb', '.gltf', '.obj', '.fbx'];

export default function Dropzone({ onFileSelected }: DropzoneProps) {
  const [dragging, setDragging] = useState(false);

  const handleFile = useCallback(
    (file: File) => {
      const ext = '.' + file.name.split('.').pop()?.toLowerCase();
      if (!ACCEPTED.includes(ext)) {
        alert(`Unsupported format: ${ext}. Supported: ${ACCEPTED.join(', ')}`);
        return;
      }
      onFileSelected(file);
    },
    [onFileSelected],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  };

  const onDragLeave = () => setDragging(false);

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  return (
    <div className="absolute inset-0 flex items-center justify-center z-10">
      <div
        className={`dropzone ${dragging ? 'active' : ''} flex flex-col items-center justify-center gap-6 p-12 max-w-md w-full mx-8 text-center`}
        style={{ background: 'var(--bg-panel)' }}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
      >
        {/* Icon */}
        <div
          className="relative flex items-center justify-center"
          style={{ width: 80, height: 80 }}
        >
          <div
            className="absolute inset-0 rounded-full loading-pulse"
            style={{ background: 'var(--accent-dim)', filter: 'blur(10px)' }}
          />
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            style={{ color: 'var(--accent)', position: 'relative' }}
          >
            <path
              d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <polyline
              points="17 8 12 3 7 8"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <line
              x1="12"
              y1="3"
              x2="12"
              y2="15"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </div>

        <div>
          <p style={{ color: 'var(--text-primary)', fontSize: '1.1rem', fontWeight: 600 }}>
            Drop your 3D model here
          </p>
          <p
            className="mt-1"
            style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}
          >
            or click to browse files
          </p>
        </div>

        <label
          className="cursor-pointer"
          style={{
            background: 'var(--accent)',
            color: '#fff',
            padding: '10px 28px',
            borderRadius: 8,
            fontWeight: 600,
            fontSize: '0.85rem',
            letterSpacing: '0.02em',
            display: 'inline-block',
            transition: 'opacity 0.15s',
          }}
          onMouseEnter={(e) => ((e.target as HTMLElement).style.opacity = '0.85')}
          onMouseLeave={(e) => ((e.target as HTMLElement).style.opacity = '1')}
        >
          Browse Files
          <input
            type="file"
            accept=".glb,.gltf,.obj,.fbx"
            style={{ display: 'none' }}
            onChange={onInputChange}
          />
        </label>

        <div className="flex flex-wrap gap-2 justify-center">
          {ACCEPTED.map((ext) => (
            <span key={ext} className="tag tag-geo">
              {ext.toUpperCase()}
            </span>
          ))}
        </div>

        <p style={{ color: 'var(--text-secondary)', fontSize: '0.72rem' }}>
          Supports GLB, GLTF, OBJ formats
        </p>
      </div>
    </div>
  );
}
