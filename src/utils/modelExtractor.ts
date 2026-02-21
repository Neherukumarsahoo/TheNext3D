import * as THREE from 'three';
import type {
  MeshInfo,
  GeometryInfo,
  MaterialInfo,
  TextureInfo,
  ModelStats,
} from '@/types/model';

// Side enum mapping
const SIDE_MAP: Record<number, string> = {
  [THREE.FrontSide]: 'FrontSide',
  [THREE.BackSide]: 'BackSide',
  [THREE.DoubleSide]: 'DoubleSide',
};

// Blending mapping
const BLEND_MAP: Record<number, string> = {
  [THREE.NoBlending]: 'NoBlending',
  [THREE.NormalBlending]: 'NormalBlending',
  [THREE.AdditiveBlending]: 'AdditiveBlending',
  [THREE.SubtractiveBlending]: 'SubtractiveBlending',
  [THREE.MultiplyBlending]: 'MultiplyBlending',
  [THREE.CustomBlending]: 'CustomBlending',
};

// Wrap mode mapping
const WRAP_MAP: Record<number, string> = {
  [THREE.RepeatWrapping]: 'Repeat',
  [THREE.ClampToEdgeWrapping]: 'ClampToEdge',
  [THREE.MirroredRepeatWrapping]: 'MirroredRepeat',
};

// Filter mapping
const FILTER_MAP: Record<number, string> = {
  [THREE.NearestFilter]: 'Nearest',
  [THREE.NearestMipmapNearestFilter]: 'NearestMipmapNearest',
  [THREE.NearestMipmapLinearFilter]: 'NearestMipmapLinear',
  [THREE.LinearFilter]: 'Linear',
  [THREE.LinearMipmapNearestFilter]: 'LinearMipmapNearest',
  [THREE.LinearMipmapLinearFilter]: 'LinearMipmapLinear',
};

function colorToHex(color: THREE.Color | undefined | null): string | undefined {
  if (!color) return undefined;
  return '#' + color.getHexString();
}

function extractTextureInfo(tex: THREE.Texture | null): TextureInfo | null {
  if (!tex) return null;
  const info: TextureInfo = {
    name: tex.name || '(unnamed)',
    uuid: tex.uuid,
    wrapS: WRAP_MAP[tex.wrapS] || String(tex.wrapS),
    wrapT: WRAP_MAP[tex.wrapT] || String(tex.wrapT),
    minFilter: FILTER_MAP[tex.minFilter] || String(tex.minFilter),
    magFilter: FILTER_MAP[tex.magFilter] || String(tex.magFilter),
    flipY: tex.flipY,
  };
  if (tex.image) {
    info.image = {
      width: tex.image.width || 0,
      height: tex.image.height || 0,
    };
  }
  return info;
}

function extractMaterialInfo(mat: THREE.Material): MaterialInfo {
  const info: MaterialInfo = {
    uuid: mat.uuid,
    name: mat.name || '(unnamed)',
    type: mat.type,
    opacity: mat.opacity,
    transparent: mat.transparent,
    side: SIDE_MAP[mat.side] || String(mat.side),
    depthWrite: mat.depthWrite,
    blending: BLEND_MAP[mat.blending] || String(mat.blending),
  };

  if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
    info.color = colorToHex(mat.color);
    info.emissive = colorToHex(mat.emissive);
    info.emissiveIntensity = mat.emissiveIntensity;
    info.metalness = mat.metalness;
    info.roughness = mat.roughness;
    info.wireframe = mat.wireframe;
    info.map = extractTextureInfo(mat.map);
    info.normalMap = extractTextureInfo(mat.normalMap);
    info.roughnessMap = extractTextureInfo(mat.roughnessMap);
    info.metalnessMap = extractTextureInfo(mat.metalnessMap);
    info.emissiveMap = extractTextureInfo(mat.emissiveMap);
    info.aoMap = extractTextureInfo(mat.aoMap);
    info.alphaMap = extractTextureInfo(mat.alphaMap);
    info.envMap = extractTextureInfo(mat.envMap);
  } else if (mat instanceof THREE.MeshBasicMaterial) {
    info.color = colorToHex(mat.color);
    info.wireframe = mat.wireframe;
    info.map = extractTextureInfo(mat.map);
    info.aoMap = extractTextureInfo(mat.aoMap);
    info.alphaMap = extractTextureInfo(mat.alphaMap);
    info.envMap = extractTextureInfo(mat.envMap);
  } else if (mat instanceof THREE.MeshPhongMaterial || mat instanceof THREE.MeshLambertMaterial) {
    info.color = colorToHex((mat as any).color);
    info.emissive = colorToHex((mat as any).emissive);
    info.wireframe = (mat as any).wireframe;
    info.map = extractTextureInfo((mat as any).map);
  }

  return info;
}

function extractGeometryInfo(geo: THREE.BufferGeometry): GeometryInfo {
  const posAttr = geo.getAttribute('position');
  const vertexCount = posAttr ? posAttr.count : 0;
  const indexCount = geo.index ? geo.index.count : vertexCount;
  const triangleCount = Math.floor(indexCount / 3);

  let boundingBox = null;
  if (posAttr) {
    geo.computeBoundingBox();
    const bb = geo.boundingBox;
    if (bb) {
      const size = new THREE.Vector3();
      bb.getSize(size);
      boundingBox = {
        min: { x: +bb.min.x.toFixed(4), y: +bb.min.y.toFixed(4), z: +bb.min.z.toFixed(4) },
        max: { x: +bb.max.x.toFixed(4), y: +bb.max.y.toFixed(4), z: +bb.max.z.toFixed(4) },
        size: { x: +size.x.toFixed(4), y: +size.y.toFixed(4), z: +size.z.toFixed(4) },
      };
    }
  }

  return {
    type: geo.type,
    vertexCount,
    triangleCount,
    hasUV: !!geo.getAttribute('uv'),
    hasNormals: !!geo.getAttribute('normal'),
    hasTangents: !!geo.getAttribute('tangent'),
    hasVertexColors: !!geo.getAttribute('color'),
    morphTargetsCount: geo.morphAttributes.position
      ? geo.morphAttributes.position.length
      : 0,
    boundingBox,
  };
}

export function extractMeshes(scene: THREE.Object3D): MeshInfo[] {
  const meshes: MeshInfo[] = [];
  let index = 0;

  scene.traverse((node) => {
    if (node instanceof THREE.Mesh) {
      const worldPos = new THREE.Vector3();
      const worldScale = new THREE.Vector3();
      node.getWorldPosition(worldPos);
      node.getWorldScale(worldScale);

      const materialRaw = Array.isArray(node.material)
        ? node.material
        : node.material;

      const material = Array.isArray(materialRaw)
        ? materialRaw.map(extractMaterialInfo)
        : extractMaterialInfo(materialRaw as THREE.Material);

      meshes.push({
        id: `mesh-${index++}`,
        name: node.name || `Mesh_${index}`,
        uuid: node.uuid,
        visible: node.visible,
        geometry: extractGeometryInfo(node.geometry),
        material,
        worldPosition: {
          x: +worldPos.x.toFixed(4),
          y: +worldPos.y.toFixed(4),
          z: +worldPos.z.toFixed(4),
        },
        worldScale: {
          x: +worldScale.x.toFixed(4),
          y: +worldScale.y.toFixed(4),
          z: +worldScale.z.toFixed(4),
        },
        castShadow: node.castShadow,
        receiveShadow: node.receiveShadow,
      });
    }
  });

  return meshes;
}

export function computeModelStats(
  scene: THREE.Object3D,
  meshes: MeshInfo[],
  animations: THREE.AnimationClip[],
  fileName?: string,
  fileSize?: number,
): ModelStats {
  const totalVertices = meshes.reduce((s, m) => s + m.geometry.vertexCount, 0);
  const totalTriangles = meshes.reduce((s, m) => s + m.geometry.triangleCount, 0);

  const matUUIDs = new Set<string>();
  meshes.forEach((m) => {
    if (Array.isArray(m.material)) {
      m.material.forEach((mat) => matUUIDs.add(mat.uuid));
    } else {
      matUUIDs.add((m.material as MaterialInfo).uuid);
    }
  });

  // Overall bounding box
  const box = new THREE.Box3().setFromObject(scene);
  const size = new THREE.Vector3();
  box.getSize(size);
  const isInfinite = !isFinite(box.min.x);

  return {
    totalMeshes: meshes.length,
    totalVertices,
    totalTriangles,
    totalMaterials: meshes.reduce(
      (s, m) => s + (Array.isArray(m.material) ? m.material.length : 1),
      0,
    ),
    uniqueMaterials: matUUIDs.size,
    hasAnimations: animations.length > 0,
    animationCount: animations.length,
    boundingBox: isInfinite
      ? null
      : {
          min: { x: +box.min.x.toFixed(3), y: +box.min.y.toFixed(3), z: +box.min.z.toFixed(3) },
          max: { x: +box.max.x.toFixed(3), y: +box.max.y.toFixed(3), z: +box.max.z.toFixed(3) },
          size: { x: +size.x.toFixed(3), y: +size.y.toFixed(3), z: +size.z.toFixed(3) },
        },
    fileSize: fileSize
      ? fileSize < 1024 * 1024
        ? `${(fileSize / 1024).toFixed(1)} KB`
        : `${(fileSize / 1024 / 1024).toFixed(2)} MB`
      : undefined,
    fileName,
    fileType: fileName ? fileName.split('.').pop()?.toUpperCase() : undefined,
  };
}
