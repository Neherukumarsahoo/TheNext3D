import * as THREE from 'three';
import { AnimationClipInfo } from '@/types/model';

export class AnimationEngine {
  private static mixer: THREE.AnimationMixer | null = null;
  private static actions: THREE.AnimationAction[] = [];
  private static currentAction: THREE.AnimationAction | null = null;
  private static clips: THREE.AnimationClip[] = [];

  static init(root: THREE.Object3D, clips: THREE.AnimationClip[]) {
    // Cleanup old mixer
    if (this.mixer) {
      this.mixer.stopAllAction();
      this.mixer = null;
    }

    this.clips = clips;
    this.mixer = new THREE.AnimationMixer(root);
    this.actions = clips.map(clip => this.mixer!.clipAction(clip));
    this.currentAction = null;
  }

  static update(delta: number): number {
    if (this.mixer) {
      this.mixer.update(delta);
      if (this.currentAction) {
        return this.currentAction.time;
      }
    }
    return 0;
  }

  static play(index: number, loop: boolean = true) {
    if (!this.mixer || !this.actions[index]) return;

    if (this.currentAction && this.currentAction !== this.actions[index]) {
      this.currentAction.fadeOut(0.3);
    }

    const action = this.actions[index];
    action.reset();
    action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    action.clampWhenFinished = !loop;
    action.fadeIn(0.3);
    action.play();
    
    this.currentAction = action;
  }

  static pause() {
    if (this.currentAction) {
      this.currentAction.paused = true;
    }
  }

  static resume() {
    if (this.currentAction) {
      this.currentAction.paused = false;
      this.currentAction.play();
    }
  }

  static stop() {
    if (this.mixer) {
      this.mixer.stopAllAction();
      this.currentAction = null;
    }
  }

  static setTime(time: number) {
    if (this.currentAction) {
      this.currentAction.time = time;
    }
  }

  static setSpeed(speed: number) {
    if (this.mixer) {
      this.mixer.timeScale = speed;
    }
  }

  static getClipsInfo(): AnimationClipInfo[] {
    return this.clips.map(clip => ({
      name: clip.name || 'Unnamed',
      duration: clip.duration,
      tracks: clip.tracks.length
    }));
  }

  static getDuration(index: number): number {
    return this.clips[index]?.duration || 0;
  }

  static isPlaying(): boolean {
    return this.currentAction ? !this.currentAction.paused && this.currentAction.isRunning() : false;
  }
}
