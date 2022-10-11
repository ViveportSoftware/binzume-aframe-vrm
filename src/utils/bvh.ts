import { VRMAvatar } from '../vrm/avatar';

export class BVHLoaderWrapper {
    public async load(url: string, avatar: VRMAvatar, options: any): Promise<THREE.AnimationClip> {
        /** @ts-ignore */
        let { BVHLoader } = await import('https://threejs.org/examples/jsm/loaders/BVHLoader.js');
        return await new Promise((resolve, reject) => {
            /**
             * Viveport Note:
             * Date: 2022/08/12
             * Description:
             *  The following is content of not doing cache-bvh
             */
            // new BVHLoader().load(url, result => {
            //   if (options.convertBone) {
            //     this.fixTrackName(result.clip, avatar);
            //   }
            //   const newClip = {
            //     ...result.clip,
            //     tracks: result.clip.tracks.filter(t => !t.name.match(/position/))
            //   };
            //   resolve(newClip);
            // });
            const cacheKey = url;
            window.VRM_ANIMATIONS = window.VRM_ANIMATIONS || {};
            if (!window.VRM_ANIMATIONS[cacheKey]) {
                new BVHLoader().load(url, (result: any) => {
                    window.VRM_ANIMATIONS[cacheKey] = result.clip.clone();
                    resolve(this.fixTracks(result.clip, avatar, options));
                });
            } else {
                resolve(this.fixTracks(window.VRM_ANIMATIONS[cacheKey].clone(), avatar, options));
            }
        });
    }

    protected fixTracks(clip: THREE.AnimationClip, avatar: VRMAvatar, options): THREE.AnimationClip {
        if (options.convertBone) {
          this.fixTrackName(clip, avatar);
        }
        /**
         * Viveport Note:
         * Date: 2022/08/12
         * Description:
         *  Because there is only walking animation at present, the Y-axis should not be affected,
         *  so remove the BVH position information of the walking animation
         * TODO::
         *  If we want to expand the positional actions that affect hips,
         *  such as jumping or flying, we need to do additional processing for `newClip`
         *  ex: `clip.tracks = clip.tracks.filter(t => !t.name.match(/position/) || t.name.match(avatar.bones.hips.name));`
         */
         console.log("%c aframe-vrm log: turn-off-clip-track-postion:", "color: #F05365", options.removeClipTracksPositionData);
        if (options.removeClipTracksPositionData) {
            clip.tracks = clip.tracks.filter(t => !t.name.match(/position/));
        } else {
            clip.tracks = clip.tracks.filter((t) => !t.name.match(/position/) || t.name.match(avatar.bones.hips.name))
        }
        return clip;
    }

    protected convertBoneName(name: string): string {
        name = name.replace('Spin1', 'Spin');
        name = name.replace('Chest1', 'Chest');
        name = name.replace('Chest2', 'UpperChest');
        name = name.replace('UpLeg', 'UpperLeg');
        name = name.replace('LeftLeg', 'LeftLowerLeg');
        name = name.replace('RightLeg', 'RightLowerLeg');
        name = name.replace('ForeArm', 'UpperArm');
        name = name.replace('LeftArm', 'LeftLowerArm');
        name = name.replace('RightArm', 'RightLowerArm');
        name = name.replace('Collar', 'Shoulder');
        name = name.replace('Elbow', 'LowerArm');
        name = name.replace('Wrist', 'Hand');
        name = name.replace('LeftHip', 'LeftUpperLeg');
        name = name.replace('RightHip', 'RightUpperLeg');
        name = name.replace('Knee', 'LowerLeg');
        name = name.replace('Ankle', 'Foot');
        return name.charAt(0).toLowerCase() + name.slice(1);
    }

    protected fixTrackName(clip: THREE.AnimationClip, avatar: VRMAvatar): void {
        clip.tracks.forEach(t => {
            // '.bones[Chest].quaternion'
            t.name = t.name.replace(/bones\[(\w+)\]/, (m, name) => {
                let bone = avatar.bones[this.convertBoneName(name)];
                return 'bones[' + (bone != null ? bone.name : 'NODE_NOT_FOUND') + ']';
            });
            t.name = t.name.replace('ToeBase', 'Foot');
            if (t.name.match(/quaternion/)) {
                t.values = t.values.map((v, i) => i % 2 === 0 ? -v : v);
            }
            if (t.name.match(/position/)) {
                t.values = t.values.map((v, i) => (i % 3 === 1 ? v : -v) * 0.09); // TODO
            }
        });
        clip.tracks = clip.tracks.filter(t => !t.name.match(/NODE_NOT_FOUND/));
    }
}
