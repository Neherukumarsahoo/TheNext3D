import * as THREE from 'three';

export interface TextureInfo {
  name: string;
  uuid: string;
  wrapS: string;
  wrapT: string;
  minFilter: string;
  magFilter: string;
  flipY: boolean;
  image?: {
    width: number;
    height: number;
  };
}

export interface MaterialInfo {
  uuid: string;
  name: string;
  type: string;
  opacity: number;
  transparent: boolean;
  side: string;
  depthWrite: boolean;
  blending: string;
  color?: string;
  emissive?: string;
  emissiveIntensity?: number;
  metalness?: number;
  roughness?: number;
  wireframe?: boolean;
  map?: TextureInfo | null;
  normalMap?: TextureInfo | null;
  roughnessMap?: TextureInfo | null;
  metalnessMap?: TextureInfo | null;
  emissiveMap?: TextureInfo | null;
  aoMap?: TextureInfo | null;
  alphaMap?: TextureInfo | null;
  envMap?: TextureInfo | null;
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

export type DebugRenderMode = 'none' | 'wireframe' | 'normals' | 'uv' | 'depth' | 'flat' | 'albedo' | 'no_lighting' | 'heatmap' | 'overdraw' | 'gpu_cost';

export interface TextureUsageStats {
  count: number;
  totalMemory: number;
  largestRes: number;
  isOverkill: boolean;
  resolutionMap: {
    '4K+': number;
    '2K': number;
    '1K': number;
    '512': number;
    '<256': number;
  };
}

export interface PerformanceStats {
  drawCalls: number;
  triangles: number;
  vertices: number;
  fps: number;
  frameTime: number;
  programs: number;
  textures: number;
  geometries: number;
  memory: {
    geometries: number;
    textures: number;
  };
}

export interface PerformanceWarning {
  level: 'moderate' | 'heavy';
  message: string;
}

export type LightingPresetId = 'studio' | 'sunset' | 'dawn' | 'night' | 'warehouse';

export interface RawSceneData {
  meshCount: number;
  totalTriangles: number;
  totalVertices: number;
  geometries: Set<string>;
  materials: Set<string>;
  textures: Set<string>;
  meshDetails: MeshDetail[];
}

export interface MeshDetail {
  uuid: string;
  name: string;
  triangleCount: number;
  vertexCount: number;
  materialUuid: string;
  geometryUuid: string;
  isStatic: boolean;
}

export type OptimizationState = 'idle' | 'preview' | 'applied' | 'dismissed';

export interface StructuralIssue {
  id: string;
  type: 'duplicate_geometry' | 'material_fragmentation' | 'texture_overkill' | 'mesh_density' | 'lod_needed' | 'static_merge';
  severity: 'low' | 'medium' | 'high';
  title: string;
  description: string;
  count?: number;
  affectedUuids?: string[];
  canAutoOptimize?: boolean;
  state?: OptimizationState;
  optimizationMetadata?: {
    action: 'convert_to_instanced' | 'merge_static' | 'generate_lod';
    geometryUuid?: string;
    materialUuid?: string;
    meshes?: { uuid: string; triangleCount: number }[];
    estimatedDrawCallReduction?: number;
    estimatedTriangleReduction?: string;
    metrics?: {
      before: number;
      after: number;
      unit: 'Draw Calls' | 'Triangles';
    };
  };
}

export interface SceneAnalysisReport {
  score: number;
  status: 'optimized' | 'improvable' | 'heavy';
  issues: StructuralIssue[];
  timestamp: string;
  sceneVersion: number;
  stats: {
    instancingPotential: number;
    mergePotential: number;
    meshCount: number;
    drawCalls: number;
    materialReuseRatio?: number;
  };
}

export type ToneMappingMode = 'NoToneMapping' | 'Linear' | 'Reinhard' | 'Cineon' | 'ACESFilmic';

export interface PostProcessingConfig {
  enabled: boolean;
  bloom: {
    enabled: boolean;
    intensity: number;
    radius: number;
    threshold: number;
  };
  ssao: {
    enabled: boolean;
    intensity: number;
    radius: number;
  };
  dof: {
    enabled: boolean;
    focusDistance: number;
    focalLength: number;
    bokehScale: number;
  };
  chromaticAberration: {
    enabled: boolean;
    offset: [number, number];
  };
  vignette: {
    enabled: boolean;
    offset: number;
    darkness: number;
  };
  noise: {
    enabled: boolean;
    opacity: number;
  };
  colorGrading: {
    brightness: number;
    contrast: number;
    saturation: number;
  };
}

export interface LightingConfig {
  preset: string;
  ambientIntensity: number;
  directionalIntensity: number;
  showGrid: boolean;
  showAxes: boolean;
  showShadows: boolean;
  toneMapping: ToneMappingMode;
  exposure: number;
  environmentRotation: number;
  postProcessing: PostProcessingConfig;
}

export interface OptimizationEvent {
  id: string;
  type: 'instancing' | 'merge' | 'lod';
  timestamp: Date;
  title: string;
  details: string;
  gainDescription: string;
  impact: 'low' | 'medium' | 'high';
}

export interface SceneNode {
  uuid: string;
  name: string;
  type: 'Mesh' | 'Group' | 'Object3D' | 'Light' | 'Camera' | 'Scene' | string;
  visible: boolean;
  children: SceneNode[];
  isInstanced?: boolean;
  isMerged?: boolean;
  hasLOD?: boolean;
  triangleCount?: number;
}

export interface AnimationClipInfo {
  name: string;
  duration: number;
  tracks: number;
}

export interface PlaybackConfig {
  playing: boolean;
  currentTime: number;
  duration: number;
  speed: number;
  loop: boolean;
  selectedIndex: number;
}

export interface GPUStressStats {
  stressScore: number;
  transparentMaterials: number;
  doubleSidedMaterials: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
}
