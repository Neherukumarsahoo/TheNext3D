import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * MergeEngine
 * Handles merging multiple static THREE.Mesh objects into a single mesh to reduce draw calls.
 */
export class MergeEngine {
  /**
   * Merges a group of meshes that share the same material.
   * @param scene The root scene object.
   * @param meshUuids Array of mesh UUIDs to merge.
   * @returns The newly created merged Mesh, or null if unsuccessful.
   */
  static mergeMeshes(scene: THREE.Object3D, meshUuids: string[]): THREE.Mesh | null {
    if (meshUuids.length < 2) return null;

    const meshes: THREE.Mesh[] = [];
    scene.traverse((node) => {
      if (node instanceof THREE.Mesh && meshUuids.includes(node.uuid)) {
        meshes.push(node);
      }
    });

    if (meshes.length === 0) return null;

    // Use material from the first mesh
    const sharedMaterial = meshes[0].material;
    const parent = meshes[0].parent || scene;

    const geometries: THREE.BufferGeometry[] = [];

    meshes.forEach((mesh) => {
      // 1. Clone geometry to avoid modifying original
      const geom = mesh.geometry.clone();
      
      // 2. Bake world transform into geometry
      mesh.updateWorldMatrix(true, false);
      geom.applyMatrix4(mesh.matrixWorld);
      
      geometries.push(geom);
    });

    try {
      // 3. Merge all geometries into one
      const mergedGeometry = BufferGeometryUtils.mergeGeometries(geometries, false);
      if (!mergedGeometry) return null;

      // 4. Create new merged mesh
      // Since we baked world transforms, the new mesh should be at core (0,0,0) world.
      // We'll add it to the scene root or the first mesh's parent if we can transform it back.
      // Easiest is to add to scene root and set identity transform.
      const mergedMesh = new THREE.Mesh(mergedGeometry, sharedMaterial);
      mergedMesh.name = `merged_static_${meshUuids.length}`;
      
      // Tag for tracking
      mergedMesh.userData.optimized = {
        type: 'merge',
        timestamp: Date.now(),
        originalCount: meshUuids.length
      };

      // We need to convert world coordinates back to parent-local coordinates
      parent.updateWorldMatrix(true, false);
      const invParentMatrix = parent.matrixWorld.clone().invert();
      mergedMesh.applyMatrix4(invParentMatrix);

      parent.add(mergedMesh);

      // 5. Remove old meshes
      meshes.forEach((mesh) => {
        if (mesh.parent) {
          mesh.parent.remove(mesh);
        }
        // mesh.geometry.dispose(); // Optional, but good practice
      });

      return mergedMesh;
    } catch (error) {
      console.error('Failed to merge geometries:', error);
      return null;
    }
  }
}
