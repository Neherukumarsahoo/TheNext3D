import * as THREE from 'three';
import { SceneNode } from '@/types/model';

export class SceneGraphBuilder {
  /**
   * Traverses a THREE.js object and builds a serializable SceneNode tree
   */
  static build(object: THREE.Object3D): SceneNode {
    const node: SceneNode = {
      uuid: object.uuid,
      name: object.name || `${object.type} (${object.uuid.slice(0, 4)})`,
      type: object.type,
      visible: object.visible,
      children: [],
    };

    // Extract mesh-specific intelligence
    if (object instanceof THREE.Mesh) {
      if (object.geometry) {
        const triCount = object.geometry.index 
          ? object.geometry.index.count / 3 
          : object.geometry.attributes.position.count / 3;
        node.triangleCount = Math.round(triCount);
      }
      
      // Intelligence Badges (Metadata from our optimization engines)
      if ((object as any).isInstancedMesh) {
        node.isInstanced = true;
      }
      
      if (object.userData.merged) {
        node.isMerged = true;
      }

      if (object.parent && object.parent.type === 'LOD') {
        node.hasLOD = true;
      }
    }

    // Recursive traversal
    if (object.children && object.children.length > 0) {
      // Sort children: groups first, then meshes, then lights/cameras? 
      // Or just keep original order for fidelity.
      node.children = object.children.map(child => this.build(child));
    }

    return node;
  }
}
