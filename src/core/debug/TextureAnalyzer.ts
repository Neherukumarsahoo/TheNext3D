import * as THREE from 'three';
import { TextureUsageStats } from '@/types/model';

/**
 * TextureAnalyzer
 * Calculates GPU memory footprint and identifies unoptimized texture usage.
 */
export class TextureAnalyzer {
  /**
   * Calculates texture statistics for a specific mesh.
   */
  static getMeshTextureStats(mesh: THREE.Mesh): TextureUsageStats {
    const maps = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap'] as const;
    const material = mesh.material;
    const mats = Array.isArray(material) ? material : [material];
    
    let totalMemory = 0;
    let count = 0;
    let largestRes = 0;
    const resolutionMap = {
      '4K+': 0, '2K': 0, '1K': 0, '512': 0, '<256': 0
    };

    const processedTextures = new Set<string>();

    mats.forEach(mat => {
      maps.forEach(mapName => {
        const map = (mat as any)[mapName] as THREE.Texture;
        if (map && map.image && !processedTextures.has(map.uuid)) {
          processedTextures.add(map.uuid);
          const w = map.image.width;
          const h = map.image.height;
          const mem = w * h * 4; // Raw RGBA assumption
          
          totalMemory += mem;
          count++;
          largestRes = Math.max(largestRes, w, h);

          if (w >= 4096) resolutionMap['4K+']++;
          else if (w >= 2048) resolutionMap['2K']++;
          else if (w >= 1024) resolutionMap['1K']++;
          else if (w >= 512) resolutionMap['512']++;
          else resolutionMap['<256']++;
        }
      });
    });

    // Overkill Detection Logic
    // Compute bounding box volume as a heuristic for world-space size
    mesh.geometry.computeBoundingBox();
    const size = new THREE.Vector3();
    mesh.geometry.boundingBox?.getSize(size);
    const volume = size.x * size.y * size.z;
    
    // Rule: If mesh is "small" (< 0.5 units cubed) but uses 4K or 2K texture
    const isOverkill = (volume < 0.1 && largestRes >= 2048) || (volume < 0.01 && largestRes >= 1024);

    return {
      count,
      totalMemory,
      largestRes,
      isOverkill,
      resolutionMap
    };
  }

  /**
   * Aggregates stats for the entire scene.
   */
  static getSceneTextureDistribution(scene: THREE.Object3D) {
    const sceneMap = {
      '4K+': 0, '2K': 0, '1K': 0, '512': 0, '<256': 0
    };
    const processedTextures = new Set<string>();

    scene.traverse(node => {
      if (node instanceof THREE.Mesh) {
        const stats = this.getMeshTextureStats(node);
        // We need to avoid double counting shared textures
        // (The above stats are per-mesh, so they count shared textures for that mesh's overhead)
        
        // This scene-level check should look at unique textures
        const mats = Array.isArray(node.material) ? node.material : [node.material];
        const mapNames = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap'] as const;
        
        mats.forEach(mat => {
          mapNames.forEach(name => {
            const map = (mat as any)[name];
            if (map && map.image && !processedTextures.has(map.uuid)) {
              processedTextures.add(map.uuid);
              const w = map.image.width;
              if (w >= 4096) sceneMap['4K+']++;
              else if (w >= 2048) sceneMap['2K']++;
              else if (w >= 1024) sceneMap['1K']++;
              else if (w >= 512) sceneMap['512']++;
              else sceneMap['<256']++;
            }
          });
        });
      }
    });

    return sceneMap;
  }

  static formatMemory(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}
