import { RawSceneData } from './SceneAnalyzer';
import { SceneAnalysisReport, StructuralIssue } from '@/types/model';

export class OptimizationEngine {
  static evaluate(data: RawSceneData): SceneAnalysisReport {
    const issues: StructuralIssue[] = [];
    let score = 100;

    // 1. Duplicate Geometry Detection (Instancing Opportunity)
    // Group meshes by (geometryUUID + materialUUID)
    const instancingGroups = new Map<string, { geometryUuid: string; materialUuid: string; affectedUuids: string[] }>();
    
    data.meshDetails.forEach(mesh => {
      if (!mesh.isStatic) return; // Skip dynamic meshes for now as per rules
      
      const key = `${mesh.geometryUuid}_${mesh.materialUuid}`;
      const group = instancingGroups.get(key) || { 
        geometryUuid: mesh.geometryUuid, 
        materialUuid: mesh.materialUuid, 
        affectedUuids: [] 
      };
      group.affectedUuids.push(mesh.uuid);
      instancingGroups.set(key, group);
    });

    instancingGroups.forEach((group, key) => {
      const geometryUuid = group.geometryUuid;
      const materialUuid = group.materialUuid;
      const count = group.affectedUuids.length;

      if (count > 1) {
        score -= Math.min(10, count * 2);
        issues.push({
          id: `instancing-${geometryUuid}-${materialUuid}`,
          type: 'duplicate_geometry',
          severity: 'high',
          title: 'Geometry Instancing Proposal',
          description: `${count} objects share identical geometry. Converting to InstancedMesh will batch them into a single draw call.`,
          count: count,
          affectedUuids: group.affectedUuids,
          canAutoOptimize: true,
          state: 'idle',
          optimizationMetadata: {
            action: 'convert_to_instanced',
            geometryUuid,
            materialUuid,
            estimatedDrawCallReduction: count - 1,
            metrics: {
              before: count,
              after: 1,
              unit: 'Draw Calls'
            }
          }
        });
      }
    });

    // 2. Static Mesh Merge Opportunity
    // Different geometries, same material.
    const materialGroups = new Map<string, string[]>();
    data.meshDetails.forEach(mesh => {
      if (!mesh.isStatic) return;
      
      const matGroup = materialGroups.get(mesh.materialUuid) || [];
      matGroup.push(mesh.uuid);
      materialGroups.set(mesh.materialUuid, matGroup);
    });

    materialGroups.forEach((meshUuids, matUuid) => {
      // Only merge if we have at least a few meshes to make it worth it.
      if (meshUuids.length > 5) {
        issues.push({
          id: `static-merge-${matUuid}`,
          type: 'static_merge',
          severity: 'medium',
          title: 'Static Mesh Merge Proposal',
          description: `${meshUuids.length} static meshes share the same material. Merging them into a single buffer will maximize GPU batching efficiency.`,
          count: meshUuids.length,
          affectedUuids: meshUuids,
          canAutoOptimize: true,
          state: 'idle',
          optimizationMetadata: {
            action: 'merge_static',
            materialUuid: matUuid,
            estimatedDrawCallReduction: meshUuids.length - 1,
            metrics: {
              before: meshUuids.length,
              after: 1,
              unit: 'Draw Calls'
            }
          }
        });
      }
    });

    // 3. Material Fragmentation
    const uniqueMats = data.materials.size;
    if (uniqueMats > 10 && uniqueMats > data.meshCount * 0.5) {
      score -= 10;
      issues.push({
        id: 'mat-fragmentation',
        type: 'material_fragmentation',
        severity: 'medium',
        title: 'Material Fragmentation',
        description: `${uniqueMats} unique materials for ${data.meshCount} meshes. Consider merging materials into an atlas to reduce GPU state changes.`,
        count: uniqueMats
      });
    }

    // 3. Texture Overkill Detection
    data.textures.forEach(tex => {
      // Find meshes using this texture
      const textureArea = tex.width * tex.height;
      if (textureArea > 2048 * 2048) {
        // High res. Check volumes of affected meshes.
        const overkillUuids: string[] = [];
        data.meshDetails.forEach(mesh => {
          if (tex.affectedUuids.includes(mesh.uuid)) {
            // Heuristic: if volume is very small but texture is 4K+
            if (mesh.volume < 0.1 && textureArea >= 4096 * 4096) {
              overkillUuids.push(mesh.uuid);
            }
          }
        });

        if (overkillUuids.length > 0) {
          score -= 5;
          issues.push({
            id: `tex-overkill-${tex.uuid}`,
            type: 'texture_overkill',
            severity: 'medium',
            title: 'Texture Overkill',
            description: `4K+ texture used on very small mesh (${overkillUuids.length} instances). Downscaling to 1K would save significant VRAM with no visual loss.`,
            affectedUuids: overkillUuids
          });
        }
      }
    });

    // 4. Mesh Density Analyzer (Over-tessellation)
    const highDensityMeshes: string[] = [];
    data.meshDetails.forEach(mesh => {
      const density = mesh.vertexCount / mesh.volume;
      if (density > 50000 && mesh.vertexCount > 5000) {
        highDensityMeshes.push(mesh.uuid);
      }
    });

    if (highDensityMeshes.length > 0) {
      score -= 10;
      issues.push({
        id: 'high-density',
        type: 'high_density',
        severity: 'medium',
        title: 'High Mesh Density',
        description: `${highDensityMeshes.length} meshes have extreme vertex density for their size. Decimation (Simplification) is recommended.`,
        affectedUuids: highDensityMeshes
      });
    }

    // 6. LOD Opportunity (Enhanced)
    const lodCandidates = data.meshDetails.filter(m => m.triangleCount > 50000 && m.isStatic);
    if (lodCandidates.length > 0) {
      const totalTris = lodCandidates.reduce((sum, m) => sum + m.triangleCount, 0);
      issues.push({
        id: 'lod-proposal',
        type: 'lod_needed',
        severity: 'low',
        title: 'Level of Detail (LOD) Proposal',
        description: `${lodCandidates.length} high-poly static meshes detected. Implementing LOD will dynamically reduce triangle count for distant views.`,
        affectedUuids: lodCandidates.map(m => m.uuid),
        canAutoOptimize: true,
        state: 'idle',
        optimizationMetadata: {
          action: 'generate_lod',
          meshes: lodCandidates.map(m => ({ uuid: m.uuid, triangleCount: m.triangleCount })),
          estimatedTriangleReduction: '75%',
          metrics: {
            before: totalTris,
            after: Math.round(totalTris * 0.25),
            unit: 'Triangles'
          }
        }
      });
    }

    // Determine overall status
    const status = score > 85 ? 'optimized' : score > 60 ? 'improvable' : 'heavy';

    return {
      score: Math.max(0, score),
      status,
      issues,
      timestamp: new Date().toISOString(),
      sceneVersion: 0,
      stats: {
        instancingPotential: issues.filter(i => i.type === 'duplicate_geometry').length,
        mergePotential: issues.filter(i => i.type === 'static_merge').length,
        meshCount: data.meshCount,
        drawCalls: data.meshCount, // Simplified
        materialReuseRatio: uniqueMats / data.meshCount,
        avgVertexDensity: data.meshDetails.reduce((acc, m) => acc + (m.vertexCount / m.volume), 0) / data.meshCount,
        textureVramUsage: data.textures.reduce((acc, t) => acc + (t.width * t.height * 4), 0),
        geometryVramUsage: Array.from(data.geometries.values()).reduce((acc, g) => acc + (g.vertexCount * 12), 0)
      }
    };
  }
}
