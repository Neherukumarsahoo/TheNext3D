import * as THREE from 'three';
import { TextureAnalyzer } from './TextureAnalyzer';

/**
 * TextureHeatmapEngine
 * Generates visual heatmaps based on per-mesh texture memory usage.
 */
export class TextureHeatmapEngine {
  /**
   * Applies a color-coded heatmap to the scene based on texture memory.
   */
  static applyHeatmap(scene: THREE.Object3D) {
    if (!scene) return;

    let maxMemory = 0;
    const meshStats = new Map<string, number>();

    // 1. First pass: Find max memory usage in scene
    scene.traverse(node => {
      if (node instanceof THREE.Mesh) {
        const stats = TextureAnalyzer.getMeshTextureStats(node);
        meshStats.set(node.uuid, stats.totalMemory);
        if (stats.totalMemory > maxMemory) maxMemory = stats.totalMemory;
      }
    });

    // Avoid division by zero if no textures
    const safeMax = maxMemory || 1;

    // 2. Second pass: Apply normalized heat colors
    scene.traverse(node => {
      if (node instanceof THREE.Mesh) {
        const memory = meshStats.get(node.uuid) || 0;
        const normalized = Math.min(memory / safeMax, 1);
        
        // Map 0-1 to Green-Yellow-Red
        const hue = (1 - normalized) * 0.33; // 0.33 is green, 0 is red
        const color = new THREE.Color().setHSL(hue, 1, 0.5);

        // Cache original material
        if (!node.userData.originalMaterial) {
          node.userData.originalMaterial = node.material;
        }

        // Apply heatmap material
        node.material = new THREE.MeshBasicMaterial({ 
          color,
          transparent: normalized < 0.1,
          opacity: normalized < 0.1 ? 0.3 : 0.9,
          wireframe: normalized < 0.05
        });
      }
    });
  }
}
