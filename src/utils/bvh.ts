import { Bone } from 'three';
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
                    window.VRM_ANIMATIONS[cacheKey] = { clip: result.clip.clone(), bones: result.skeleton.bones };
                    resolve(this.fixTracks(result.clip, avatar, result.skeleton.bones, options));
                });
            } else {
                const { clip, bones } = window.VRM_ANIMATIONS[cacheKey];
                resolve(this.fixTracks(clip.clone(), avatar,  bones, options));
            }
        });
    }

    protected fixTracks(clip: THREE.AnimationClip, avatar: VRMAvatar, motionBones: Bone[], options): THREE.AnimationClip {
        if (options.convertBone) {
          this.fixTrackName(clip, avatar, motionBones);
        }
        clip.tracks = this.isLegacyMotionSkeleton(motionBones)
        ? clip.tracks.filter(t => !t.name.match(/position/))
        : clip.tracks.filter(t => !t.name.match(/position/) || t.name.match(avatar.bones.hips.name));        

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

    protected isLegacyMotionSkeleton(motionBones: Bone[]): boolean {
        return motionBones.filter(b => b.name == "hips" || b.name == "upperChest").length != 2;
    }    

    protected fixTrackName(clip: THREE.AnimationClip, avatar: VRMAvatar, motionBones: Bone[]): void {
        const _vec3 = new THREE.Vector3();
        const motionHipsHeight = (motionBones.find(b => b.name == "hips")?.position.y || 0) * 2.005; // TODO: should try to figure out the root cause of the magic number 2.005
        const vrmHipsY = avatar.bones.hips?.getWorldPosition(_vec3).y;
        const vrmRootY = avatar.model.getWorldPosition(_vec3).y;
        const vrmHipsHeight = Math.abs( vrmHipsY - vrmRootY );
        const hipsPositionScale = (!this.isLegacyMotionSkeleton(motionBones)) ? (vrmHipsHeight / motionHipsHeight) : 0.09;

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
                t.values = t.values.map((v, i) => (i % 3 === 1 ? v : -v) * hipsPositionScale);
            }
        });
        clip.tracks = clip.tracks.filter(t => !t.name.match(/NODE_NOT_FOUND/));
    }
}
