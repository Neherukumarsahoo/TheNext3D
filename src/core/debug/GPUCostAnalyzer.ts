import * as THREE from 'three';

/**
 * GPUCostAnalyzer
 * Estimates rendering cost of meshes based on triangle count and material complexity.
 * Visualizes the cost as a heatmap from Green (Cheap) to Red (Expensive).
 */
export class GPUCostAnalyzer {
  /**
   * Calculates a heuristic GPU cost for a mesh.
   */
  static calculateCost(mesh: THREE.Mesh): number {
    const geometry = mesh.geometry;
    const material = mesh.material;

    // 1. Triangle complexity
    const triCount = geometry.index
      ? geometry.index.count / 3
      : geometry.attributes.position.count / 3;

    // 2. Material complexity weight
    let materialWeight = 1.0;
    
    const mats = Array.isArray(material) ? material : [material];
    
    mats.forEach(mat => {
      // PBR maps increase fragment cost
      if ((mat as any).map) materialWeight += 0.5;
      if ((mat as any).normalMap) materialWeight += 1.0;
      if ((mat as any).roughnessMap) materialWeight += 0.5;
      if ((mat as any).metalnessMap) materialWeight += 0.5;
      
      // Transparency is very expensive due to blending
      if (mat.transparent) materialWeight += 2.0;
      
      // Double sided doubles the fragment work in many cases
      if (mat.side === THREE.DoubleSide) materialWeight += 1.5;
      
      // Advanced properties
      if ((mat as any).transmission > 0) materialWeight += 3.0;
      if ((mat as any).clearcoat > 0) materialWeight += 1.0;
    });

    // Score = triangle count weighted by shader complexity
    // We log transform it so the range is manageable
    return Math.log10(triCount + 1) * materialWeight;
  }

  /**
   * Applies the cost heatmap to the scene.
   */
  static applyCostHeatmap(scene: THREE.Object3D) {
    if (!scene) return;

    const costs: { mesh: THREE.Mesh; cost: number }[] = [];
    let maxCost = 0.1;

    scene.traverse((node) => {
      if (node instanceof THREE.Mesh) {
        // Cache original material
        if (!node.userData.originalMaterial) {
          node.userData.originalMaterial = node.material;
        }
        
        const cost = this.calculateCost(node);
        costs.push({ mesh: node, cost });
        maxCost = Math.max(maxCost, cost);
      }
    });

    // Apply heatmap colors
    costs.forEach(({ mesh, cost }) => {
      const normalized = cost / maxCost;
      
      // Green (0, 1, 0) to Red (1, 0, 0)
      const color = new THREE.Color().setHSL((1 - normalized) * 0.35, 1, 0.5);
      
      mesh.material = new THREE.MeshBasicMaterial({
        color: color,
        side: (mesh.userData.originalMaterial as any).side || THREE.FrontSide,
        transparent: (mesh.userData.originalMaterial as any).transparent || false,
        opacity: (mesh.userData.originalMaterial as any).opacity || 1.0,
      });
    });
  }

  /**
   * Returns a summary report of GPU rendering risk.
   */
  static getSceneGPUReport(scene: THREE.Object3D) {
    let totalScore = 0;
    let transparentCount = 0;
    let doubleSideCount = 0;
    let meshCount = 0;

    scene.traverse((node) => {
      if (node instanceof THREE.Mesh) {
        meshCount++;
        totalScore += this.calculateCost(node);
        
        const mats = Array.isArray(node.material) ? node.material : [node.material];
        mats.forEach(m => {
          if (m.transparent) transparentCount++;
          if (m.side === THREE.DoubleSide) doubleSideCount++;
        });
      }
    });

    const avgStress = meshCount > 0 ? (totalScore / meshCount) * 10 : 0;

    return {
      stressScore: Math.min(100, Math.round(avgStress)),
      transparentMaterials: transparentCount,
      doubleSidedMaterials: doubleSideCount,
      riskLevel: avgStress > 70 ? 'HIGH' : avgStress > 40 ? 'MEDIUM' : 'LOW'
    };
  }
}
