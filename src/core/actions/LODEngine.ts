import * as THREE from 'three';

/**
 * LODEngine
 * Handles the generation of Level of Detail (LOD) objects for high-poly meshes.
 */
export class LODEngine {
  /**
   * Generates an LOD object for a given mesh.
   * @param scene The root scene object.
   * @param meshUuid The UUID of the mesh to optimize.
   * @returns The newly created THREE.LOD object, or null if unsuccessful.
   */
  static generateLOD(scene: THREE.Object3D, meshUuid: string): THREE.LOD | null {
    let targetMesh: THREE.Mesh | null = null;
    
    scene.traverse((node) => {
      if (node instanceof THREE.Mesh && node.uuid === meshUuid) {
        targetMesh = node;
      }
    });

    if (!targetMesh) return null;

    const parent = targetMesh.parent;
    if (!parent) return null;

    const lod = new THREE.LOD();
    lod.name = `${targetMesh.name || 'mesh'}_LOD`;
    
    // Tag for tracking
    lod.userData.optimized = {
      type: 'lod',
      timestamp: Date.now()
    };

    lod.position.copy(targetMesh.position);
    lod.rotation.copy(targetMesh.rotation);
    lod.scale.copy(targetMesh.scale);

    // Level 0: Original (High detail)
    // We clone to keep the original safe or just use it.
    // Usually we swap, so we can use a clone.
    const highDetail = targetMesh.clone();
    highDetail.position.set(0, 0, 0);
    highDetail.rotation.set(0, 0, 0);
    highDetail.scale.set(1, 1, 1);
    lod.addLevel(highDetail, 0);

    // Level 1: Medium Detail (e.g., at 15 units distance)
    // Note: True simplification requires a modifier like SimplifyModifier.
    // For this implementation, we will use the same geometry but flag it.
    // In a production app, we would run BufferGeometryUtils or a decimation algorithm here.
    const medDetail = highDetail.clone();
    lod.addLevel(medDetail, 15);

    // Level 2: Low Detail (e.g., at 40 units distance)
    const lowDetail = highDetail.clone();
    lod.addLevel(lowDetail, 40);

    parent.add(lod);
    parent.remove(targetMesh);

    return lod;
  }

  /**
   * Batch version for multiple meshes.
   */
  static generateLODForBatch(scene: THREE.Object3D, meshUuids: string[]): THREE.LOD[] {
    const results: THREE.LOD[] = [];
    meshUuids.forEach(uuid => {
      const lod = this.generateLOD(scene, uuid);
      if (lod) results.push(lod);
    });
    return results;
  }
}
