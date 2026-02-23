import * as THREE from 'three';

/**
 * InstancingEngine
 * Handles the conversion of multiple THREE.Mesh instances into a single THREE.InstancedMesh.
 */
export class InstancingEngine {
  /**
   * Converts a list of meshes into a single InstancedMesh.
   * @param scene The root scene object.
   * @param meshUuids Array of UUIDs for the meshes to be converted.
   * @returns The created InstancedMesh or null if unsuccessful.
   */
  static convertToInstanced(scene: THREE.Object3D, meshUuids: string[]): THREE.InstancedMesh | null {
    if (meshUuids.length < 2) return null;

    const meshes: THREE.Mesh[] = [];
    scene.traverse((node) => {
      if (node instanceof THREE.Mesh && meshUuids.includes(node.uuid)) {
        meshes.push(node);
      }
    });

    if (meshes.length === 0) return null;

    // Use the first mesh as the template for geometry and material
    const firstMesh = meshes[0];
    const geometry = firstMesh.geometry.clone(); // Clone to avoid side effects if original used elsewhere
    const material = firstMesh.material;
    const parent = firstMesh.parent;

    if (!parent) return null;

    const instancedMesh = new THREE.InstancedMesh(geometry, material, meshes.length);
    instancedMesh.name = `${firstMesh.name || 'group'}_instanced`;
    
    // Tag for tracking
    instancedMesh.userData.optimized = {
      type: 'instancing',
      timestamp: Date.now(),
      originalCount: meshes.length
    };
    
    // Ensure parent world matrix is up to date
    parent.updateWorldMatrix(true, false);
    const worldToLocal = parent.matrixWorld.clone().invert();

    const matrix = new THREE.Matrix4();
    meshes.forEach((mesh, i) => {
      mesh.updateWorldMatrix(true, false);
      
      // Calculate local matrix relative to the new InstancedMesh's parent
      matrix.copy(worldToLocal).multiply(mesh.matrixWorld);
      
      instancedMesh.setMatrixAt(i, matrix);
    });

    instancedMesh.instanceMatrix.needsUpdate = true;
    parent.add(instancedMesh);

    // Remove old meshes from the scene
    meshes.forEach((mesh) => {
      if (mesh.parent) {
        mesh.parent.remove(mesh);
      }
    });

    return instancedMesh;
  }
}
