import * as THREE from 'three';

/**
 * OverdrawEngine
 * Visualizes fragment overdraw using additive blending.
 * Brighter areas indicate more overlapping transparent fragments.
 */
export class OverdrawEngine {
  private static overdrawMaterial: THREE.MeshBasicMaterial | null = null;

  /**
   * Applies the overdraw visualization material to all meshes in the scene.
   */
  static applyOverdraw(scene: THREE.Object3D) {
    if (!scene) return;

    const overdrawMat = this.getOverdrawMaterial();

    scene.traverse((node) => {
      if (node instanceof THREE.Mesh) {
        // Cache original material if not already cached
        if (!node.userData.originalMaterial) {
          node.userData.originalMaterial = node.material;
        }
        node.material = overdrawMat;
      }
    });
  }

  private static getOverdrawMaterial(): THREE.MeshBasicMaterial {
    if (!this.overdrawMaterial) {
      this.overdrawMaterial = new THREE.MeshBasicMaterial({
        color: 0x222222, // Low brightness per fragment
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        side: THREE.DoubleSide,
      });
    }
    return this.overdrawMaterial;
  }
}
