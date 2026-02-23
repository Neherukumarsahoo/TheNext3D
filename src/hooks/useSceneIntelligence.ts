import { useState, useEffect } from 'react';
import * as THREE from 'three';
import { SceneAnalyzer } from '../core/analysis/SceneAnalyzer';
import { OptimizationEngine } from '../core/analysis/OptimizationEngine';
import { SceneAnalysisReport } from '@/types/model';

export function useSceneIntelligence(scene: THREE.Object3D | null, refreshKey: number = 0) {
  const [report, setReport] = useState<SceneAnalysisReport | null>(null);

  useEffect(() => {
    if (!scene) {
      setReport(null);
      return;
    }

    const timer = setTimeout(() => {
      console.time('SceneAnalysis');
      const rawData = SceneAnalyzer.analyze(scene);
      const assessment = OptimizationEngine.evaluate(rawData);
      console.timeEnd('SceneAnalysis');
      
      setReport(assessment);
    }, 500);

    return () => clearTimeout(timer);
  }, [scene, refreshKey]);

  return report;
}
