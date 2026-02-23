import * as THREE from 'three';

export interface RawSceneData {
  meshCount: number;
  geometries: Map<string, { count: number; vertexCount: number; affectedUuids: string[] }>;
  materials: Map<string, { count: number; affectedUuids: string[]; hasTextures: boolean }>;
  textures: { uuid: string; width: number; height: number; affectedUuids: string[] }[];
  meshDetails: {
    uuid: string;
    geometryUuid: string;
    materialUuid: string;
    volume: number;
    vertexCount: number;
    triangleCount: number;
    isStatic: boolean;
    textureMaxRes: number;
  }[];
}

export class SceneAnalyzer {
  static analyze(scene: THREE.Object3D): RawSceneData {
    const data: RawSceneData = {
      meshCount: 0,
      geometries: new Map(),
      materials: new Map(),
      textures: [],
      meshDetails: []
    };

    const textureMap = new Map<string, any>();

    scene.traverse((child) => {
      // Skip objects that have already been optimized by our engine to prevent reappearance of suggestions
      if (child.userData?.optimized) return;

      if (child instanceof THREE.Mesh) {
        data.meshCount++;
        const mesh = child;
        const geometry = mesh.geometry;
        const material = mesh.material;

        // 1. Geometry tracking
        const geomEntry = data.geometries.get(geometry.uuid) || { count: 0, vertexCount: 0, affectedUuids: [] };
        geomEntry.count++;
        geomEntry.vertexCount = geometry.attributes.position ? geometry.attributes.position.count : 0;
        geomEntry.affectedUuids.push(mesh.uuid);
        data.geometries.set(geometry.uuid, geomEntry);

        // 2. Material tracking
        const mats = Array.isArray(material) ? material : [material];
        let maxTexRes = 0;
        let hasTextures = false;

        mats.forEach(mat => {
          const matEntry = data.materials.get(mat.uuid) || { count: 0, affectedUuids: [], hasTextures: false };
          matEntry.count++;
          matEntry.affectedUuids.push(mesh.uuid);

          // Track textures in material
          const maps = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap'] as const;
          maps.forEach(mapName => {
            const map = (mat as any)[mapName];
            if (map && map.image) {
              hasTextures = true;
              matEntry.hasTextures = true;
              maxTexRes = Math.max(maxTexRes, map.image.width, map.image.height);
              if (!textureMap.has(map.uuid)) {
                textureMap.set(map.uuid, {
                  uuid: map.uuid,
                  width: map.image.width,
                  height: map.image.height,
                  affectedUuids: [mesh.uuid]
                });
              } else {
                textureMap.get(map.uuid).affectedUuids.push(mesh.uuid);
              }
            }
          });
          data.materials.set(mat.uuid, matEntry);
        });

        // 3. Mesh Details & Volume calculation
        geometry.computeBoundingBox();
        const box = geometry.boundingBox || new THREE.Box3();
        const size = new THREE.Vector3();
        box.getSize(size);
        const volume = size.x * size.y * size.z || 0.000001; // Avoid div by zero

        data.meshDetails.push({
          uuid: mesh.uuid,
          geometryUuid: geometry.uuid,
          materialUuid: Array.isArray(material) ? material[0].uuid : material.uuid,
          volume,
          vertexCount: geomEntry.vertexCount,
          triangleCount: (geometry.index ? geometry.index.count : geomEntry.vertexCount) / 3,
          isStatic: !mesh.skeleton && (!mesh.morphTargetInfluences || mesh.morphTargetInfluences.length === 0),
          textureMaxRes: maxTexRes
        });
      }
    });

    data.textures = Array.from(textureMap.values());
    return data;
  }
}
