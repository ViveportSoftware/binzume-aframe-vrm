import { VRMAvatar } from "./avatar" // TODO: remove circular dependency

export class VRMBlendShapeUtil {
    private readonly _avatar: VRMAvatar;
    private _currentShape: any = {};
    private animatedMorph: any;
    private morphAction: any;

    constructor(avatar: VRMAvatar) {
        this._avatar = avatar;
    }

    public setBlendShapeWeight(name: string, value: number): void {
        this._currentShape[name] = value;
        if (value == 0) {
            delete this._currentShape[name];
        }
        this._updateBlendShape()
    }

    public getBlendShapeWeight(name: string): number {
        return this._currentShape[name] || 0;
    }

    public resetBlendShape() {
        this._currentShape = {};
        this._updateBlendShape();
    }

    public startBlink(blinkInterval: number): void {
        if (this.animatedMorph) {
            return;
        }
        this.animatedMorph = {
            name: 'BLINK',
            times: [0, blinkInterval - 0.2, blinkInterval - 0.1, blinkInterval],
            values: [0, 0, 1, 0]
        };
        this._updateBlendShape();
    }

    public startRaiseHandJoyAnimation(): void {
        if (this.animatedMorph) {
            this.stopBlink();
        }
        this.animatedMorph = {
            name: "JOY",
            times: [0, 0.5, 1, 2, 4, 5, 5.5],
            values: [0, 0.3, 1, 1, 1, 0.4, 0.3]
        };
        this._updateBlendShape();
    }

    public startStandingGreetingJoyAnimation(): void {
        if (this.animatedMorph) {
          this.stopBlink();
        }
        this.animatedMorph = {
          name: "JOY",
          times: [0, 1, 2, 2.5, 3, 5, 6.3],
          values: [0, 0, 0.3, 0.8, 1, 0.4, 0.3]
        };
        this._updateBlendShape();
    }

    public stopJoyAnimation(): void {
        this.animatedMorph = null;
        this._updateBlendShape();
    }

    public startTalkingAnimation(): void {
        if (this.animatedMorph) {
          this.stopBlink();
        }
        const time1 = Math.random() * 0.5;
        const time2 = Math.random() * 0.5 + 0.5;
        const value2 = Math.min(Math.random() + 0.3, 1);
        const value1 = Math.random() * value2;

        this.animatedMorph = {
          name: "O",
          times: [0, time1, 0.5, time2, 1],
          values: [0, value1, value2, 0.5, 0]
        };
        this._updateBlendShape();
    }

    public stopTalkingAnimation(): void {
        this.animatedMorph = null;
        this._updateBlendShape();
    }

    public stopBlink(): void {
        this.animatedMorph = null;
        this._updateBlendShape();
    }

    private _updateBlendShape(): void {
        // TODO: refactoring. use THREE.AnimationBlendMode.
        let addWeights = (data: Record<string, any>, name: string, weights: number[]) => {
            let blend = this._avatar.blendShapes[name];
            blend && blend.binds.forEach(bind => {
                let tname = bind.target.name;
                let values = data[tname] || (data[tname] = new Array(bind.target.morphTargetInfluences.length * weights.length).fill(0));
                for (let t = 0; t < weights.length; t++) {
                    let i = t * bind.target.morphTargetInfluences.length + bind.index;
                    values[i] += Math.max(bind.weight * weights[t], values[i]); // blend func : max
                }
            });
        };
        let times = [0], trackdata: Record<string, any[]> = {};
        if (this.animatedMorph) {
            times = this.animatedMorph.times;
            addWeights(trackdata, this.animatedMorph.name, this.animatedMorph.values);
        }
        for (let [name, value] of Object.entries(this._currentShape)) {
            if (this._avatar.blendShapes[name]) {
                addWeights(trackdata, name, new Array(times.length).fill(value));
            }
        }
        let tracks = Object.entries(trackdata).map(([tname, values]) =>
            new THREE.NumberKeyframeTrack(tname + '.morphTargetInfluences', times, values));
        let nextAction = null;
        if (tracks.length > 0) {
            let clip = new THREE.AnimationClip('morph', undefined, tracks);
            nextAction = this._avatar.mixer.clipAction(clip).setEffectiveWeight(1.0).play();
        }
        this.morphAction && this.morphAction.stop();
        this.morphAction = nextAction;
    }
}
