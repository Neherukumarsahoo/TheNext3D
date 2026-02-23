import { useMemo } from 'react';
import type { PerformanceStats, ModelStats, PerformanceAssessment, OptimizationSuggestion, MeshInfo } from '@/types/model';

export function useOptimizationEngine(
  perf: PerformanceStats | null,
  stats: ModelStats | null,
  meshes: MeshInfo[]
): PerformanceAssessment {
  return useMemo(() => {
    const suggestions: OptimizationSuggestion[] = [];
    let score = 100;

    if (!perf || !stats) {
      return { score: 100, status: 'optimized', suggestions: [] };
    }

    // 1. High Triangle Count
    if (perf.triangles > 100000) {
      score -= 15;
      suggestions.push({
        id: 'high-poly',
        title: 'High Triangle Count',
        description: `Model has ${Math.round(perf.triangles / 1000)}k triangles. This may cause sluggish performance on mobile devices.`,
        impact: 'high',
        category: 'geometry'
      });
    }

    // 2. Draw Call Overhead
    if (perf.drawCalls > 25) {
      score -= 15;
      suggestions.push({
        id: 'high-draw-calls',
        title: 'High Draw Call Count',
        description: `${perf.drawCalls} draw calls detected. High CPU overhead. Try merging static meshes with same materials.`,
        impact: 'high',
        category: 'bottleneck'
      });
    }

    // 3. Large Textures Rule
    let hasLargeTexture = false;
    meshes.forEach(m => {
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      mats.forEach(mat => {
        const maps = [mat.map, mat.normalMap, mat.roughnessMap, mat.metalnessMap, mat.emissiveMap];
        maps.forEach(map => {
          if (map?.image && (map.image.width > 2048 || map.image.height > 2048)) {
            hasLargeTexture = true;
          }
        });
      });
    });

    if (hasLargeTexture) {
      score -= 10;
      suggestions.push({
        id: 'large-textures',
        title: 'Oversized Textures (>2048px)',
        description: 'One or more textures exceed 2048px. This consumes significant VRAM. Downscale to 1024px for best web compatibility.',
        impact: 'medium',
        category: 'texture'
      });
    }

    // 4. Instancing Potential
    const meshCounts: Record<string, number> = {};
    meshes.forEach(m => {
      // Simple heuristic: same name + same vertex count usually means same geometry
      const key = `${m.name}-${m.geometry.vertexCount}`;
      meshCounts[key] = (meshCounts[key] || 0) + 1;
    });

    const repeatedMeshes = Object.values(meshCounts).filter(count => count > 5).length;
    if (repeatedMeshes > 0) {
      score -= 5;
      suggestions.push({
        id: 'instancing',
        title: 'Instancing Opportunity',
        description: 'Multiple identical meshes detected. Convert these to THREE.InstancedMesh to reduce draw calls to 1.',
        impact: 'low',
        category: 'batching'
      });
    }

    // 5. Material & Texture Counts
    if (stats.uniqueMaterials > 12) {
      score -= 10;
      suggestions.push({
        id: 'many-mats',
        title: 'High Material Count',
        description: `${stats.uniqueMaterials} materials detected. Consider material batching or texture atlasing.`,
        impact: 'medium',
        category: 'batching'
      });
    }

    // 6. FPS & VRAM
    const totalVram = perf.memory.geometries + perf.memory.textures;
    if (totalVram > 150 * 1024 * 1024) { // 150MB
      score -= 10;
      suggestions.push({
        id: 'vram-heavy',
        title: 'Heavy VRAM Usage',
        description: `Total VRAM usage is ~${(totalVram / (1024 * 1024)).toFixed(0)}MB. This exceeds many integrated GPU / Mobile budgets.`,
        impact: 'high',
        category: 'texture'
      });
    }

    if (perf.fps < 30 && perf.fps > 0) {
      score -= 20;
      suggestions.push({
        id: 'crit-fps',
        title: 'Crucritical Frame Drop',
        description: `Device is struggling to maintain 30 FPS. Immediate optimization required.`,
        impact: 'high',
        category: 'bottleneck'
      });
    }

    // Final calculations
    score = Math.max(0, Math.min(100, score));
    let status: 'optimized' | 'improvable' | 'heavy' = 'optimized';
    if (score < 60) status = 'heavy';
    else if (score < 85) status = 'improvable';

    return {
      score,
      status,
      suggestions: suggestions.sort((a, b) => {
        const impactMap = { high: 3, medium: 2, low: 1 };
        return impactMap[b.impact] - impactMap[a.impact];
      })
    };
  }, [perf, stats, meshes]);
}
