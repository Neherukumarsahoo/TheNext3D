import * as THREE from 'three';
import { DebugRenderMode } from '@/types/model';
import { TextureHeatmapEngine } from './TextureHeatmapEngine';
import { OverdrawEngine } from './OverdrawEngine';
import { GPUCostAnalyzer } from './GPUCostAnalyzer';

/**
 * DebugMaterialEngine
 * Handles non-destructive material overrides for scene debugging.
 */
export class DebugMaterialEngine {
  private static uvMaterial: THREE.ShaderMaterial | null = null;

  /**
   * Applies a debug render mode to the scene.
   */
  static applyMode(scene: THREE.Object3D, mode: DebugRenderMode) {
    if (!scene) return;

    if (mode === 'none') {
      this.restoreOriginals(scene);
      return;
    }

    if (mode === 'heatmap') {
      TextureHeatmapEngine.applyHeatmap(scene);
      return;
    }

    if (mode === 'overdraw') {
      OverdrawEngine.applyOverdraw(scene);
      return;
    }

    if (mode === 'gpu_cost') {
      GPUCostAnalyzer.applyCostHeatmap(scene);
      return;
    }

    scene.traverse((node) => {
      if (node instanceof THREE.Mesh) {
        // Cache original material if not already cached
        if (!node.userData.originalMaterial) {
          node.userData.originalMaterial = node.material;
        }

        const debugMat = this.getDebugMaterial(node, mode);
        if (debugMat) {
          node.material = debugMat;
        }
      }
    });
  }

  /**
   * Restores original materials from cache.
   */
  static restoreOriginals(scene: THREE.Object3D) {
    scene.traverse((node) => {
      if (node instanceof THREE.Mesh && node.userData.originalMaterial) {
        node.material = node.userData.originalMaterial;
        // We keep the cache so we can toggle modes quickly without re-caching
      }
    });
  }

  /**
   * Factory for debug materials.
   */
  private static getDebugMaterial(mesh: THREE.Mesh, mode: DebugRenderMode): THREE.Material | THREE.Material[] | null {
    const original = mesh.userData.originalMaterial;
    
    if (Array.isArray(original)) {
      return original.map(m => this.createDebugMaterial(m, mode));
    }
    
    return this.createDebugMaterial(original, mode);
  }

  private static createDebugMaterial(original: THREE.Material, mode: DebugRenderMode): THREE.Material {
    switch (mode) {
      case 'wireframe':
        return new THREE.MeshBasicMaterial({ 
          color: 0x7c6af7, 
          wireframe: true,
          transparent: true,
          opacity: 0.8
        });

      case 'normals':
        return new THREE.MeshNormalMaterial({ flatShading: false });

      case 'uv':
        return this.getUVMaterial();

      case 'depth':
        return new THREE.MeshDepthMaterial();

      case 'flat':
        if (original instanceof THREE.MeshStandardMaterial || original instanceof THREE.MeshPhongMaterial) {
          const flat = original.clone();
          (flat as any).flatShading = true;
          flat.needsUpdate = true;
          return flat;
        }
        return new THREE.MeshStandardMaterial({ color: 0x888888, flatShading: true });

      case 'albedo':
        if (original instanceof THREE.MeshStandardMaterial) {
          return new THREE.MeshStandardMaterial({
            color: original.color,
            map: original.map,
            side: original.side,
            transparent: original.transparent,
            opacity: original.opacity,
          });
        }
        return new THREE.MeshStandardMaterial({ color: 0x888888 });

      case 'no_lighting':
        if (original instanceof THREE.MeshStandardMaterial) {
          return new THREE.MeshBasicMaterial({
            color: original.color,
            map: original.map,
            side: original.side,
            transparent: original.transparent,
            opacity: original.opacity,
          });
        }
        // Fallback for non-standard materials
        return new THREE.MeshBasicMaterial({ 
          color: (original as any).color || 0x888888,
          map: (original as any).map || null,
          transparent: original.transparent,
          opacity: original.opacity
        });

      default:
        return original;
    }
  }

  private static getUVMaterial(): THREE.ShaderMaterial {
    if (!this.uvMaterial) {
      this.uvMaterial = new THREE.ShaderMaterial({
        uniforms: {},
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          varying vec2 vUv;
          void main() {
            // Visualizing UV coordinates as R and G channels
            gl_FragColor = vec4(vUv.x, vUv.y, 0.5, 1.0);
            
            // Add a grid for better visualization
            float grid = step(0.95, fract(vUv.x * 10.0)) + step(0.95, fract(vUv.y * 10.0));
            gl_FragColor.rgb += grid * 0.2;
          }
        `
      });
    }
    return this.uvMaterial;
  }
}
