// Types for 3D model inspector
import * as THREE from 'three';

export interface MeshInfo {
  id: string;
  name: string;
  uuid: string;
  visible: boolean;
  geometry: GeometryInfo;
  material: MaterialInfo | MaterialInfo[];
  worldPosition: { x: number; y: number; z: number };
  worldScale: { x: number; y: number; z: number };
  castShadow: boolean;
  receiveShadow: boolean;
}

export interface GeometryInfo {
  type: string;
  vertexCount: number;
  triangleCount: number;
  hasUV: boolean;
  hasNormals: boolean;
  hasTangents: boolean;
  hasVertexColors: boolean;
  morphTargetsCount: number;
  boundingBox: {
    min: { x: number; y: number; z: number };
    max: { x: number; y: number; z: number };
    size: { x: number; y: number; z: number };
  } | null;
}

export interface MaterialInfo {
  uuid: string;
  name: string;
  type: string;
  color?: string;
  emissive?: string;
  emissiveIntensity?: number;
  metalness?: number;
  roughness?: number;
  opacity: number;
  transparent: boolean;
  wireframe?: boolean;
  side: string;
  depthWrite: boolean;
  blending: string;
  // Texture maps
  map?: TextureInfo | null;
  normalMap?: TextureInfo | null;
  roughnessMap?: TextureInfo | null;
  metalnessMap?: TextureInfo | null;
  emissiveMap?: TextureInfo | null;
  aoMap?: TextureInfo | null;
  alphaMap?: TextureInfo | null;
  envMap?: TextureInfo | null;
}

export interface TextureInfo {
  name: string;
  uuid: string;
  wrapS: string;
  wrapT: string;
  minFilter: string;
  magFilter: string;
  flipY: boolean;
  encoding?: string;
  image?: {
    width: number;
    height: number;
    src?: string;
  };
}

export interface ModelStats {
  totalMeshes: number;
  totalVertices: number;
  totalTriangles: number;
  totalMaterials: number;
  uniqueMaterials: number;
  hasAnimations: boolean;
  animationCount: number;
  boundingBox: {
    min: { x: number; y: number; z: number };
    max: { x: number; y: number; z: number };
    size: { x: number; y: number; z: number };
  } | null;
  fileSize?: string;
  fileName?: string;
  fileType?: string;
}

export type SelectedMesh = string | null; // mesh uuid
