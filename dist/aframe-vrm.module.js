import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

// src/vrm/lookat.ts
var VRMLookAt = class {
  constructor(initCtx) {
    this.target = null;
    this.angleLimit = 60 * Math.PI / 180;
    this._identQ = new THREE.Quaternion();
    this._zV = new THREE.Vector3(0, 0, -1);
    this._tmpQ0 = new THREE.Quaternion();
    this._tmpV0 = new THREE.Vector3();
    this._bone = initCtx.nodes[initCtx.vrm.firstPerson.firstPersonBone];
  }
  update(t) {
    let target = this.target, bone = this._bone;
    if (target == null || bone == null)
      return;
    let targetDirection = bone.worldToLocal(this._tmpV0.setFromMatrixPosition(target.matrixWorld)).normalize(), rot = this._tmpQ0.setFromUnitVectors(this._zV, targetDirection), boneLimit = this.angleLimit, speedFactor = 0.08, angle = 2 * Math.acos(rot.w);
    angle > boneLimit * 1.5 ? (rot = this._identQ, speedFactor = 0.04) : angle > boneLimit && rot.setFromAxisAngle(this._tmpV0.set(rot.x, rot.y, rot.z).normalize(), boneLimit), bone.quaternion.slerp(rot, speedFactor);
  }
};

// src/vrm/blendshape.ts
var VRMBlendShapeUtil = class {
  constructor(avatar) {
    this._currentShape = {};
    this._avatar = avatar;
  }
  setBlendShapeWeight(name, value) {
    this._currentShape[name] = value, value == 0 && delete this._currentShape[name], this._updateBlendShape();
  }
  getBlendShapeWeight(name) {
    return this._currentShape[name] || 0;
  }
  resetBlendShape() {
    this._currentShape = {}, this._updateBlendShape();
  }
  startBlink(blinkInterval) {
    this.animatedMorph || (this.animatedMorph = {
      name: "BLINK",
      times: [0, blinkInterval - 0.2, blinkInterval - 0.1, blinkInterval],
      values: [0, 0, 1, 0]
    }, this._updateBlendShape());
  }
  startRaiseHandJoyAnimation() {
    this.animatedMorph && this.stopBlink(), this.animatedMorph = {
      name: "JOY",
      times: [0, 0.5, 1, 2, 4, 5, 5.5],
      values: [0, 0.3, 1, 1, 1, 0.4, 0.3]
    }, this._updateBlendShape();
  }
  startStandingGreetingJoyAnimation() {
    this.animatedMorph && this.stopBlink(), this.animatedMorph = {
      name: "JOY",
      times: [0, 1, 2, 2.5, 3, 5, 6.3],
      values: [0, 0, 0.3, 0.8, 1, 0.4, 0.3]
    }, this._updateBlendShape();
  }
  stopJoyAnimation() {
    this.animatedMorph = null, this._updateBlendShape();
  }
  startTalkingAnimation() {
    this.animatedMorph && this.stopBlink();
    let time1 = Math.random() * 0.5, time2 = Math.random() * 0.5 + 0.5, value2 = Math.min(Math.random() + 0.3, 1), value1 = Math.random() * value2;
    this.animatedMorph = {
      name: "O",
      times: [0, time1, 0.5, time2, 1],
      values: [0, value1, value2, 0.5, 0]
    }, this._updateBlendShape();
  }
  stopTalkingAnimation() {
    this.animatedMorph = null, this._updateBlendShape();
  }
  stopBlink() {
    this.animatedMorph = null, this._updateBlendShape();
  }
  _updateBlendShape() {
    let addWeights = (data, name, weights) => {
      let blend = this._avatar.blendShapes[name];
      blend && blend.binds.forEach((bind) => {
        let tname = bind.target.name, values = data[tname] || (data[tname] = new Array(bind.target.morphTargetInfluences.length * weights.length).fill(0));
        for (let t = 0; t < weights.length; t++) {
          let i = t * bind.target.morphTargetInfluences.length + bind.index;
          values[i] += Math.max(bind.weight * weights[t], values[i]);
        }
      });
    }, times = [0], trackdata = {};
    this.animatedMorph && (times = this.animatedMorph.times, addWeights(trackdata, this.animatedMorph.name, this.animatedMorph.values));
    for (let [name, value] of Object.entries(this._currentShape))
      this._avatar.blendShapes[name] && addWeights(trackdata, name, new Array(times.length).fill(value));
    let tracks = Object.entries(trackdata).map(([tname, values]) => new THREE.NumberKeyframeTrack(tname + ".morphTargetInfluences", times, values)), nextAction = null;
    if (tracks.length > 0) {
      let clip = new THREE.AnimationClip("morph", void 0, tracks);
      nextAction = this._avatar.mixer.clipAction(clip).setEffectiveWeight(1).play();
    }
    this.morphAction && this.morphAction.stop(), this.morphAction = nextAction;
  }
};

// src/vrm/firstperson.ts
var FirstPersonMeshUtil = class {
  constructor(initCtx) {
    this._firstPersonBone = initCtx.nodes[initCtx.vrm.firstPerson.firstPersonBone], this._annotatedMeshes = initCtx.vrm.firstPerson.meshAnnotations.map((ma) => ({ flag: ma.firstPersonFlag, mesh: initCtx.meshes[ma.mesh] }));
  }
  setFirstPerson(firstPerson) {
    this._annotatedMeshes.forEach((a) => {
      a.flag == "ThirdPersonOnly" ? a.mesh.visible = !firstPerson : a.flag == "FirstPersonOnly" ? a.mesh.visible = firstPerson : a.flag == "Auto" && this._firstPersonBone && (firstPerson ? this._genFirstPersonMesh(a.mesh) : this._resetFirstPersonMesh(a.mesh));
    });
  }
  _genFirstPersonMesh(mesh) {
    if (mesh.children.forEach((c) => this._genFirstPersonMesh(c)), !mesh.isSkinnedMesh)
      return;
    let firstPersonBones = {};
    this._firstPersonBone.traverse((b) => {
      firstPersonBones[b.uuid] = !0;
    });
    let skeletonBones = mesh.skeleton.bones, skinIndex = mesh.geometry.attributes.skinIndex, skinWeight = mesh.geometry.attributes.skinWeight, index = mesh.geometry.index, vertexErase = [], vcount = 0, fcount = 0;
    for (let i = 0; i < skinIndex.array.length; i++) {
      let b = skinIndex.array[i];
      skinWeight.array[i] > 0 && firstPersonBones[skeletonBones[b].uuid] && (vertexErase[i / skinIndex.itemSize | 0] || (vcount++, vertexErase[i / skinIndex.itemSize | 0] = !0));
    }
    let trinagleErase = [];
    for (let i = 0; i < index.count; i++)
      vertexErase[index.array[i]] && !trinagleErase[i / 3 | 0] && (trinagleErase[i / 3 | 0] = !0, fcount++);
    if (fcount != 0 && fcount * 3 == index.count) {
      mesh.visible = !1;
      return;
    }
  }
  _resetFirstPersonMesh(mesh) {
    mesh.children.forEach((c) => this._resetFirstPersonMesh(c)), mesh.visible = !0;
  }
};

// src/vrm/avatar.ts
var VRMLoader = class {
  constructor(gltfLoader) {
    this.gltfLoader = gltfLoader || new GLTFLoader(THREE.DefaultLoadingManager);
  }
  async load(url, moduleSpecs = []) {
    return new Promise((resolve, reject) => {
      this.gltfLoader.load(url, async (gltf) => {
        resolve(await new VRMAvatar(gltf).init(gltf, moduleSpecs));
      }, void 0, reject);
    });
  }
}, VRMAvatar = class {
  constructor(gltf) {
    this.bones = {};
    this.blendShapes = {};
    this.modules = {};
    this.meta = {};
    this.firstPersonBone = null;
    this._firstPersonMeshUtil = null;
    this.boneConstraints = {
      head: { type: "ball", limit: 60 * Math.PI / 180, twistAxis: new THREE.Vector3(0, 1, 0), twistLimit: 60 * Math.PI / 180 },
      neck: { type: "ball", limit: 30 * Math.PI / 180, twistAxis: new THREE.Vector3(0, 1, 0), twistLimit: 10 * Math.PI / 180 },
      leftUpperLeg: { type: "ball", limit: 170 * Math.PI / 180, twistAxis: new THREE.Vector3(0, -1, 0), twistLimit: Math.PI / 2 },
      rightUpperLeg: { type: "ball", limit: 170 * Math.PI / 180, twistAxis: new THREE.Vector3(0, -1, 0), twistLimit: Math.PI / 2 },
      leftLowerLeg: { type: "hinge", axis: new THREE.Vector3(1, 0, 0), min: -170 * Math.PI / 180, max: 0 * Math.PI / 180 },
      rightLowerLeg: { type: "hinge", axis: new THREE.Vector3(1, 0, 0), min: -170 * Math.PI / 180, max: 0 * Math.PI / 180 }
    };
    this.model = gltf.scene, this.mixer = new THREE.AnimationMixer(this.model), this.isVRM = (gltf.userData.gltfExtensions || {}).VRM != null, this.animations = gltf.animations || [], this._blendShapeUtil = new VRMBlendShapeUtil(this);
  }
  async init(gltf, moduleSpecs) {
    if (!this.isVRM)
      return this;
    let vrmExt = gltf.userData.gltfExtensions.VRM, bones = this.bones, nodes = await gltf.parser.getDependencies("node"), meshes = await gltf.parser.getDependencies("mesh"), initCtx = { nodes, meshes, vrm: vrmExt, gltf };
    this.meta = vrmExt.meta, Object.values(vrmExt.humanoid.humanBones).forEach((humanBone) => {
      bones[humanBone.bone] = nodes[humanBone.node];
    }), vrmExt.firstPerson && (vrmExt.firstPerson.firstPersonBone && (this.firstPersonBone = nodes[vrmExt.firstPerson.firstPersonBone], this.modules.lookat = new VRMLookAt(initCtx)), vrmExt.firstPerson.meshAnnotations && (this._firstPersonMeshUtil = new FirstPersonMeshUtil(initCtx))), this.model.skeleton = new THREE.Skeleton(Object.values(bones)), this._fixBoundingBox(), vrmExt.blendShapeMaster && this._initBlendShapes(initCtx);
    for (let spec of moduleSpecs) {
      let mod = spec.instantiate(this, initCtx);
      mod && (this.modules[spec.name] = mod);
    }
    return this;
  }
  _initBlendShapes(ctx) {
    this.blendShapes = (ctx.vrm.blendShapeMaster.blendShapeGroups || []).reduce((blendShapes, bg) => {
      let binds = bg.binds.flatMap((bind) => {
        let meshObj = ctx.meshes[bind.mesh];
        return (meshObj.isSkinnedMesh ? [meshObj] : meshObj.children.filter((obj) => obj.isSkinnedMesh)).map((obj) => ({ target: obj, index: bind.index, weight: bind.weight / 100 }));
      });
      return blendShapes[(bg.presetName || bg.name).toUpperCase()] = { name: bg.name, binds }, blendShapes;
    }, {});
  }
  _fixBoundingBox() {
    let bones = this.bones;
    if (!bones.hips)
      return;
    let tmpV = new THREE.Vector3(), center = bones.hips.getWorldPosition(tmpV).clone();
    this.model.traverse((obj) => {
      let mesh = obj;
      if (mesh.isSkinnedMesh) {
        let pos = mesh.getWorldPosition(tmpV).sub(center).multiplyScalar(-1), r = pos.clone().sub(mesh.geometry.boundingSphere.center).length() + mesh.geometry.boundingSphere.radius;
        mesh.geometry.boundingSphere.center.copy(pos), mesh.geometry.boundingSphere.radius = r, mesh.geometry.boundingBox.min.set(pos.x - r, pos.y - r, pos.z - r), mesh.geometry.boundingBox.max.set(pos.x + r, pos.y + r, pos.z + r);
      }
    });
  }
  update(timeDelta) {
    this.mixer.update(timeDelta);
    for (let m of Object.values(this.modules))
      m.update(timeDelta);
  }
  setModule(name, module) {
    this.removeModule(name), this.modules[name] = module;
  }
  removeModule(name) {
    let module = this.modules[name];
    module && module.dispose && module.dispose(), delete this.modules[name];
  }
  dispose() {
    for (let m of Object.keys(this.modules))
      this.removeModule(m);
    this.model.traverse((obj) => {
      let mesh = obj;
      mesh.isMesh && (mesh.geometry.dispose(), mesh.material.map?.dispose()), obj.skeleton && obj.skeleton.dispose();
    });
  }
  get lookAtTarget() {
    let lookat = this.modules.lookat;
    return lookat ? lookat.target : null;
  }
  set lookAtTarget(v) {
    let lookat = this.modules.lookat;
    lookat && (lookat.target = v);
  }
  setBlendShapeWeight(name, value) {
    this._blendShapeUtil.setBlendShapeWeight(name, value);
  }
  getBlendShapeWeight(name) {
    return this._blendShapeUtil.getBlendShapeWeight(name);
  }
  resetBlendShape() {
    this._blendShapeUtil.resetBlendShape();
  }
  startBlink(blinkInterval) {
    this._blendShapeUtil.startBlink(blinkInterval);
  }
  startRaiseHandJoyAnimation() {
    this._blendShapeUtil.startRaiseHandJoyAnimation();
  }
  startStandingGreetingJoyAnimation() {
    this._blendShapeUtil.startStandingGreetingJoyAnimation();
  }
  stopJoyAnimation() {
    this._blendShapeUtil.stopJoyAnimation();
  }
  startTalkingAnimation() {
    this._blendShapeUtil.startTalkingAnimation();
  }
  stopTalkingAnimation() {
    this._blendShapeUtil.stopTalkingAnimation();
  }
  stopBlink() {
    this._blendShapeUtil.stopBlink();
  }
  getPose(exportMorph) {
    let poseData = {
      bones: Object.keys(this.bones).map((name) => ({ name, q: this.bones[name].quaternion.toArray() }))
    };
    return exportMorph && (poseData.blendShape = Object.keys(this.blendShapes).map((name) => ({ name, value: this.getBlendShapeWeight(name) }))), poseData;
  }
  setPose(pose) {
    if (pose.bones)
      for (let boneParam of pose.bones)
        this.bones[boneParam.name] && this.bones[boneParam.name].quaternion.fromArray(boneParam.q);
    if (pose.blendShape)
      for (let morph of pose.blendShape)
        this.setBlendShapeWeight(morph.name, morph.value);
  }
  restPose() {
    for (let b of Object.values(this.bones))
      b.quaternion.set(0, 0, 0, 1);
  }
  setFirstPerson(firstPerson) {
    this._firstPersonMeshUtil && this._firstPersonMeshUtil.setFirstPerson(firstPerson);
  }
};

// src/utils/physics-cannon.ts
var VRMPhysicsCannonJS = class {
  constructor(initctx) {
    this.collisionGroup = 2;
    this.enable = !1;
    this.binds = [];
    this.fixedBinds = [];
    this.bodies = [];
    this.constraints = [];
    this._tmpQ0 = new THREE.Quaternion();
    this._tmpV0 = new THREE.Vector3();
    this._tmpV1 = new THREE.Vector3();
    this.world = null;
    this.internalWorld = !1;
    this.springBoneSystem = this._springBoneSystem(), this._init(initctx);
  }
  _init(initctx) {
    if (!initctx.vrm.secondaryAnimation)
      return;
    let nodes = initctx.nodes, secondaryAnimation = initctx.vrm.secondaryAnimation, allColliderGroupsMask = 0, colliderMarginFactor = 0.9;
    (secondaryAnimation.colliderGroups || []).forEach((cc, i) => {
      let node = nodes[cc.node];
      for (let collider of cc.colliders) {
        let body = new CANNON.Body({ mass: 0, collisionFilterGroup: 1 << this.collisionGroup + i + 1, collisionFilterMask: -1 });
        body.addShape(new CANNON.Sphere(collider.radius * colliderMarginFactor), collider.offset), this.bodies.push(body), this.fixedBinds.push([node, body]), allColliderGroupsMask |= body.collisionFilterGroup;
      }
    });
    for (let bg of secondaryAnimation.boneGroups || []) {
      let gravity = new CANNON.Vec3().copy(bg.gravityDir || { x: 0, y: -1, z: 0 }).scale(bg.gravityPower || 0), radius = bg.hitRadius || 0.05, collisionFilterMask = ~(this.collisionGroup | allColliderGroupsMask);
      for (let g of bg.colliderGroups || [])
        collisionFilterMask |= 1 << this.collisionGroup + g + 1;
      for (let b of bg.bones) {
        let root = new CANNON.Body({ mass: 0, collisionFilterGroup: 0, collisionFilterMask: 0 });
        root.position.copy(nodes[b].parent.getWorldPosition(this._tmpV0)), this.bodies.push(root), this.fixedBinds.push([nodes[b].parent, root]);
        let add = (parentBody, node) => {
          let c = node.getWorldPosition(this._tmpV0), wpos = c.clone(), n = node.children.length + 1;
          node.children.length > 0 ? node.children.forEach((n2) => {
            c.add(n2.getWorldPosition(this._tmpV1));
          }) : (c.add(node.parent.getWorldPosition(this._tmpV1).sub(c).normalize().multiplyScalar(-0.1).add(c)), n = 2), c.multiplyScalar(1 / n);
          let body = new CANNON.Body({
            mass: 0.5,
            linearDamping: Math.max(bg.dragForce || 0, 1e-4),
            angularDamping: Math.max(bg.dragForce || 0, 1e-4),
            collisionFilterGroup: this.collisionGroup,
            collisionFilterMask,
            position: new CANNON.Vec3().copy(c)
          });
          body.addShape(new CANNON.Sphere(radius)), this.bodies.push(body);
          let o = new CANNON.Vec3().copy(this._tmpV1.copy(wpos).sub(c)), d = new CANNON.Vec3().copy(wpos.sub(parentBody.position)), joint = new CANNON.PointToPointConstraint(body, o, parentBody, d);
          this.constraints.push(joint);
          let l = body.position.distanceTo(parentBody.position);
          this.binds.push([node, body]), this.springBoneSystem.objects.push({ body, parentBody, force: gravity, boneGroup: bg, size: radius, distanceToParent: l }), node.children.forEach((n2) => n2.isBone && add(body, n2));
        };
        add(root, nodes[b]);
      }
    }
  }
  _springBoneSystem() {
    let _q0 = new CANNON.Quaternion(), _q1 = new CANNON.Quaternion(), _v0 = new CANNON.Vec3();
    return {
      world: null,
      objects: [],
      update() {
        let g = this.world.gravity, dt = this.world.dt, avlimit = 0.1, stiffnessScale = 1600;
        for (let b of this.objects) {
          let body = b.body, parent = b.parentBody, f = body.force, m = body.mass, g2 = b.force;
          f.x += m * (-g.x + g2.x), f.y += m * (-g.y + g2.y), f.z += m * (-g.z + g2.z);
          let d = body.position.distanceTo(parent.position);
          Math.abs(d - b.distanceToParent) > 0.01 && d > 0 && parent.position.lerp(body.position, b.distanceToParent / d, body.position);
          let av = body.angularVelocity.length();
          av > avlimit && body.angularVelocity.scale(avlimit / av, body.angularVelocity);
          let approxInertia = b.size * b.size * m, rot = body.quaternion.mult(parent.quaternion.inverse(_q0), _q1), [axis, angle] = rot.toAxisAngle(_v0);
          angle = angle - Math.PI * 2 * Math.floor((angle + Math.PI) / (Math.PI * 2));
          let tf = angle * b.boneGroup.stiffiness * stiffnessScale;
          Math.abs(tf) > Math.abs(angle / dt / dt * 0.5) && (tf = angle / dt / dt * 0.5);
          let af = axis.scale(-tf * approxInertia, axis);
          body.torque.vadd(af, body.torque);
        }
      }
    };
  }
  attach(world) {
    this.detach(), this.internalWorld = world == null, this.world = world || new CANNON.World(), this.springBoneSystem.world = this.world, this.world.subsystems.push(this.springBoneSystem), this.bodies.forEach((b) => this.world.addBody(b)), this.constraints.forEach((c) => this.world.addConstraint(c)), this.reset(), this.enable = !0, this.world.bodies.forEach((b) => {
      b.collisionFilterGroup == 1 && b.collisionFilterMask == 1 && (b.collisionFilterMask = -1);
    });
  }
  detach() {
    !this.world || (this.world.subsystems = this.world.subsystems.filter((s) => s != this.springBoneSystem), this.world.constraints = this.world.constraints.filter((c) => !this.constraints.includes(c)), this.world.bodies = this.world.bodies.filter((b) => !this.bodies.includes(b)), this.world = null, this.enable = !1);
  }
  reset() {
    this.fixedBinds.forEach(([node, body]) => {
      node.updateWorldMatrix(!0, !1), body.position.copy(node.getWorldPosition(this._tmpV0)), body.quaternion.copy(node.parent.getWorldQuaternion(this._tmpQ0));
    }), this.binds.forEach(([node, body]) => {
      node.updateWorldMatrix(!0, !1), body.position.copy(node.getWorldPosition(this._tmpV0)), body.quaternion.copy(node.getWorldQuaternion(this._tmpQ0));
    });
  }
  update(timeDelta) {
    !this.enable || (this.fixedBinds.forEach(([node, body]) => {
      body.position.copy(node.getWorldPosition(this._tmpV0)), body.quaternion.copy(node.getWorldQuaternion(this._tmpQ0));
    }), this.internalWorld && this.world.step(1 / 60, timeDelta), this.binds.forEach(([node, body]) => {
      node.quaternion.copy(body.quaternion).premultiply(node.parent.getWorldQuaternion(this._tmpQ0).invert());
    }));
  }
  dispose() {
    this.detach();
  }
};

// src/utils/simpleik.ts
var IKNode = class {
  constructor(position, constraint, userData) {
    this.quaternion = new THREE.Quaternion();
    this.worldMatrix = new THREE.Matrix4();
    this.worldPosition = new THREE.Vector3();
    this.position = position, this.constraint = constraint, this.userData = userData;
  }
}, IKSolver = class {
  constructor() {
    this.iterationLimit = 50;
    this.thresholdSq = 1e-4;
    this._iv = new THREE.Vector3(1, 1, 1);
    this._tmpV0 = new THREE.Vector3();
    this._tmpV1 = new THREE.Vector3();
    this._tmpV2 = new THREE.Vector3();
    this._tmpQ0 = new THREE.Quaternion();
    this._tmpQ1 = new THREE.Quaternion();
  }
  _updateChain(bones, parentMat) {
    for (let bone of bones)
      bone.worldMatrix.compose(bone.position, bone.quaternion, this._iv).premultiply(parentMat), bone.worldPosition.setFromMatrixPosition(bone.worldMatrix), parentMat = bone.worldMatrix;
  }
  solve(bones, target, boneSpaceMat) {
    this._updateChain(bones, boneSpaceMat);
    let endPosition = bones[bones.length - 1].worldPosition, startDistance = endPosition.distanceToSquared(target), targetDir = this._tmpV2, endDir = this._tmpV1, rotation = this._tmpQ1;
    for (let i = 0; i < this.iterationLimit && !(endPosition.distanceToSquared(target) < this.thresholdSq); i++) {
      let currentTarget = this._tmpV0.copy(target);
      for (let j = bones.length - 2; j >= 0; j--) {
        let bone = bones[j], endPos = bones[j + 1].position;
        bone.worldMatrix.decompose(this._tmpV1, this._tmpQ0, this._tmpV2), targetDir.copy(currentTarget).sub(this._tmpV1).applyQuaternion(rotation.copy(this._tmpQ0).invert()).normalize(), endDir.copy(endPos).normalize(), rotation.setFromUnitVectors(endDir, targetDir), bone.quaternion.multiply(rotation);
        let v = endDir.copy(endPos).applyQuaternion(this._tmpQ0.multiply(rotation));
        bone.constraint && (rotation.copy(bone.quaternion).invert(), bone.constraint.apply(bone) && (rotation.premultiply(bone.quaternion), v.copy(endPos).applyQuaternion(this._tmpQ0.multiply(rotation)))), currentTarget.sub(v);
      }
      this._updateChain(bones, boneSpaceMat);
    }
    return endPosition.distanceToSquared(target) < startDistance;
  }
};

// src/utils/vmd.ts
var VMDLoaderWrapper = class {
  constructor() {
    this.boneMapping = [
      { bone: "hips", nodeNames: ["\u30BB\u30F3\u30BF\u30FC", "center"] },
      { bone: "spine", nodeNames: ["\u4E0A\u534A\u8EAB", "upper body"] },
      { bone: "chest", nodeNames: ["\u4E0A\u534A\u8EAB2", "upper body2"] },
      { bone: "neck", nodeNames: ["\u9996", "neck"] },
      { bone: "head", nodeNames: ["\u982D", "head"] },
      { bone: "leftShoulder", nodeNames: ["\u5DE6\u80A9", "shoulder_L"] },
      { bone: "leftUpperArm", nodeNames: ["\u5DE6\u8155", "arm_L"] },
      { bone: "leftLowerArm", nodeNames: ["\u5DE6\u3072\u3058", "elbow_L"] },
      { bone: "leftHand", nodeNames: ["\u5DE6\u624B\u9996", "wrist_L"] },
      { bone: "rightShoulder", nodeNames: ["\u53F3\u80A9", "shoulder_R"] },
      { bone: "rightUpperArm", nodeNames: ["\u53F3\u8155", "arm_R"] },
      { bone: "rightLowerArm", nodeNames: ["\u53F3\u3072\u3058", "elbow_R"] },
      { bone: "rightHand", nodeNames: ["\u53F3\u624B\u9996", "wrist_R"] },
      { bone: "leftUpperLeg", nodeNames: ["\u5DE6\u8DB3", "leg_L"] },
      { bone: "leftLowerLeg", nodeNames: ["\u5DE6\u3072\u3056", "knee_L"] },
      { bone: "leftFoot", nodeNames: ["\u5DE6\u8DB3\u9996", "ankle_L"] },
      { bone: "leftToes", nodeNames: ["\u5DE6\u3064\u307E\u5148", "L toe"] },
      { bone: "rightUpperLeg", nodeNames: ["\u53F3\u8DB3", "leg_R"] },
      { bone: "rightLowerLeg", nodeNames: ["\u53F3\u3072\u3056", "knee_R"] },
      { bone: "rightFoot", nodeNames: ["\u53F3\u8DB3\u9996", "ankle_R"] },
      { bone: "rightToes", nodeNames: ["\u53F3\u3064\u307E\u5148", "R toe"] },
      { bone: "leftEye", nodeNames: ["\u5DE6\u76EE", "eye_L"] },
      { bone: "rightEye", nodeNames: ["\u53F3\u76EE", "eye_R"] },
      { bone: "leftThumbProximal", nodeNames: ["\u5DE6\u89AA\u6307\uFF10", "thumb0_L"] },
      { bone: "leftThumbIntermediate", nodeNames: ["\u5DE6\u89AA\u6307\uFF11", "thumb1_L"] },
      { bone: "leftThumbDistal", nodeNames: ["\u5DE6\u89AA\u6307\uFF12", "thumb2_L"] },
      { bone: "leftIndexProximal", nodeNames: ["\u5DE6\u4EBA\u6307\uFF11", "fore1_L"] },
      { bone: "leftIndexIntermediate", nodeNames: ["\u5DE6\u4EBA\u6307\uFF12", "fore2_L"] },
      { bone: "leftIndexDistal", nodeNames: ["\u5DE6\u4EBA\u6307\uFF13", "fore3_L"] },
      { bone: "leftMiddleProximal", nodeNames: ["\u5DE6\u4E2D\u6307\uFF11", "middle1_L"] },
      { bone: "leftMiddleIntermediate", nodeNames: ["\u5DE6\u4E2D\u6307\uFF12", "middle2_L"] },
      { bone: "leftMiddleDistal", nodeNames: ["\u5DE6\u4E2D\u6307\uFF13", "middle3_L"] },
      { bone: "leftRingProximal", nodeNames: ["\u5DE6\u85AC\u6307\uFF11", "third1_L"] },
      { bone: "leftRingIntermediate", nodeNames: ["\u5DE6\u85AC\u6307\uFF12", "third2_L"] },
      { bone: "leftRingDistal", nodeNames: ["\u5DE6\u85AC\u6307\uFF13", "third3_L"] },
      { bone: "leftLittleProximal", nodeNames: ["\u5DE6\u5C0F\u6307\uFF11", "little1_L"] },
      { bone: "leftLittleIntermediate", nodeNames: ["\u5DE6\u5C0F\u6307\uFF12", "little2_L"] },
      { bone: "leftLittleDistal", nodeNames: ["\u5DE6\u5C0F\u6307\uFF13", "little3_L"] },
      { bone: "rightThumbProximal", nodeNames: ["\u53F3\u89AA\u6307\uFF10", "thumb0_R"] },
      { bone: "rightThumbIntermediate", nodeNames: ["\u53F3\u89AA\u6307\uFF11", "thumb1_R"] },
      { bone: "rightThumbDistal", nodeNames: ["\u53F3\u89AA\u6307\uFF12", "thumb2_R"] },
      { bone: "rightIndexProximal", nodeNames: ["\u53F3\u4EBA\u6307\uFF11", "fore1_R"] },
      { bone: "rightIndexIntermediate", nodeNames: ["\u53F3\u4EBA\u6307\uFF12", "fore2_R"] },
      { bone: "rightIndexDistal", nodeNames: ["\u53F3\u4EBA\u6307\uFF13", "fore3_R"] },
      { bone: "rightMiddleProximal", nodeNames: ["\u53F3\u4E2D\u6307\uFF11", "middle1_R"] },
      { bone: "rightMiddleIntermediate", nodeNames: ["\u53F3\u4E2D\u6307\uFF12", "middle2_R"] },
      { bone: "rightMiddleDistal", nodeNames: ["\u53F3\u4E2D\u6307\uFF13", "middle3_R"] },
      { bone: "rightRingProximal", nodeNames: ["\u53F3\u85AC\u6307\uFF11", "third1_R"] },
      { bone: "rightRingIntermediate", nodeNames: ["\u53F3\u85AC\u6307\uFF12", "third2_R"] },
      { bone: "rightRingDistal", nodeNames: ["\u53F3\u85AC\u6307\uFF13", "third3_R"] },
      { bone: "rightLittleProximal", nodeNames: ["\u53F3\u5C0F\u6307\uFF11", "little1_R"] },
      { bone: "rightLittleIntermediate", nodeNames: ["\u53F3\u5C0F\u6307\uFF12", "little2_R"] },
      { bone: "rightLittleDistal", nodeNames: ["\u53F3\u5C0F\u6307\uFF13", "little3_R"] }
    ];
    this.blendShapeMap = {
      A: "\u3042",
      I: "\u3044",
      U: "\u3046",
      E: "\u3048",
      O: "\u304A",
      BLINK: "\u307E\u3070\u305F\u304D"
    };
    this.rotationOffsets = {
      leftUpperArm: -38 * THREE.MathUtils.DEG2RAD,
      rightUpperArm: 38 * THREE.MathUtils.DEG2RAD
    };
    this.ikConfigs = [
      { target: "\u5DE6\u8DB3\uFF29\uFF2B", bones: ["leftFoot", "leftLowerLeg", "leftUpperLeg"] },
      { target: "\u53F3\u8DB3\uFF29\uFF2B", bones: ["rightFoot", "rightLowerLeg", "rightUpperLeg"] },
      { target: "\u5DE6\u3064\u307E\u5148\uFF29\uFF2B", parent: 0, bones: ["leftToes", "leftFoot"] },
      { target: "\u53F3\u3064\u307E\u5148\uFF29\uFF2B", parent: 1, bones: ["rightToes", "rightFoot"] }
    ];
    this.boneConstraints = {
      leftLowerLeg: { min: new THREE.Vector3(-175 * Math.PI / 180, 0, 0), max: new THREE.Vector3(0, 0, 0) },
      rightLowerLeg: { min: new THREE.Vector3(-175 * Math.PI / 180, 0, 0), max: new THREE.Vector3(0, 0, 0) },
      leftUpperLeg: { min: new THREE.Vector3(-Math.PI / 2, -Math.PI / 2, -Math.PI / 2), max: new THREE.Vector3(Math.PI, Math.PI / 2, Math.PI / 2) },
      rightUpperLeg: { min: new THREE.Vector3(-Math.PI / 2, -Math.PI / 2, -Math.PI / 2), max: new THREE.Vector3(Math.PI, Math.PI / 2, Math.PI / 2) }
    };
  }
  async load(url, vrm, options) {
    let { MMDLoader } = await import("three/examples/jsm/loaders/MMDLoader.js"), { CCDIKSolver } = await import("three/examples/jsm/animation/CCDIKSolver.js"), loader = new MMDLoader(), nameMap = {};
    for (let m of this.boneMapping) {
      let boneObj = vrm.bones[m.bone];
      if (boneObj)
        for (let name of m.nodeNames)
          nameMap[name] = boneObj.name;
    }
    let rotationOffsets = {}, boneTransforms = {};
    for (let [name, r] of Object.entries(this.rotationOffsets)) {
      let boneObj = vrm.bones[name];
      boneObj && (rotationOffsets[boneObj.name] = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), r), boneObj.traverse((o) => {
        boneTransforms[o.name] = [Math.cos(r), Math.sin(r)];
      }));
    }
    let morphTargetDictionary = {};
    for (let [name, morph] of Object.entries(this.blendShapeMap))
      vrm.blendShapes[name] && (morphTargetDictionary[morph] = name);
    vrm.model.morphTargetDictionary = morphTargetDictionary;
    let scale = 0.08, rotY = (p, t) => {
      [p[0], p[2]] = [
        p[0] * t[0] - p[2] * t[1],
        p[0] * t[1] + p[2] * t[0]
      ];
    }, rotZ = (p, t) => {
      [p[0], p[1]] = [
        p[0] * t[0] - p[1] * t[1],
        p[0] * t[1] + p[1] * t[0]
      ];
    }, rot = new THREE.Quaternion(), rot2 = new THREE.Quaternion();
    return await new Promise((resolve, reject) => {
      loader.loadVMD(url, async (vmd) => {
        let lowerBody = vmd.motions.filter((m) => m.boneName == "\u4E0B\u534A\u8EAB");
        if (lowerBody.length) {
          lowerBody.sort((a, b) => a.frameNum - b.frameNum);
          let update = (target, inv) => {
            target.sort((a, b) => a.frameNum - b.frameNum);
            let i = 0;
            for (let m of target) {
              for (; i < lowerBody.length - 1 && m.frameNum > lowerBody[i].frameNum; )
                i++;
              let r = rot2.fromArray(lowerBody[i].rotation);
              if (i > 0 && m.frameNum < lowerBody[i].frameNum) {
                let t = (m.frameNum - lowerBody[i - 1].frameNum) / (lowerBody[i].frameNum - lowerBody[i - 1].frameNum);
                r.slerp(rot.fromArray(lowerBody[i - 1].rotation), 1 - t);
              }
              inv && r.invert(), m.rotation = rot.fromArray(m.rotation).multiply(r).toArray();
            }
          };
          update(vmd.motions.filter((m) => m.boneName == "\u30BB\u30F3\u30BF\u30FC"), !1), update(vmd.motions.filter((m) => m.boneName == "\u4E0A\u534A\u8EAB"), !0), lowerBody.forEach((m) => m.rotation = [0, 0, 0, 1]);
        }
        for (let m of vmd.motions) {
          nameMap[m.boneName] && (m.boneName = nameMap[m.boneName]);
          let r = rotationOffsets[m.boneName];
          r && (m.rotation = rot.fromArray(m.rotation).premultiply(r).toArray()), m.position[0] *= scale, m.position[1] *= scale, m.position[2] *= scale, rotY(m.position, [-1, 0]), rotY(m.rotation, [-1, 0]);
          let t = boneTransforms[m.boneName];
          t && (rotZ(m.position, t), rotZ(m.rotation, t));
        }
        if (options.enableIK) {
          let skeletonBones = vrm.model.skeleton.bones, getTargetBone = (config) => {
            let targetIndex = skeletonBones.findIndex((b) => b.name == config.target);
            if (targetIndex >= 0)
              return targetIndex;
            let parentObj = config.parent != null ? skeletonBones[getTargetBone(this.ikConfigs[config.parent])] : vrm.model, dummyBone = new THREE.Bone();
            dummyBone.name = config.target, skeletonBones.push(dummyBone), parentObj.add(dummyBone), parentObj.updateMatrixWorld();
            let initPos = vrm.bones[config.bones[0]].getWorldPosition(new THREE.Vector3());
            return dummyBone.position.copy(initPos.applyMatrix4(parentObj.matrixWorld.clone().invert())), skeletonBones.length - 1;
          }, iks = [];
          for (let config of this.ikConfigs) {
            if (vmd.motions.find((m) => m.boneName == config.target) == null)
              continue;
            let boneIndex = (name) => skeletonBones.findIndex((b) => b == vrm.bones[name]), effectorIndex = boneIndex(config.bones[0]);
            if (effectorIndex < 0)
              continue;
            let links = [];
            config.bones.slice(1).forEach((name) => {
              let index = boneIndex(name);
              if (index >= 0) {
                let link = { index }, constraint = this.boneConstraints[name];
                constraint && (link.rotationMax = constraint.max, link.rotationMin = constraint.min), links.push(link);
              }
            });
            let ik = {
              target: getTargetBone(config),
              effector: effectorIndex,
              links,
              maxAngle: 1,
              iteration: 4
            };
            iks.push(ik);
          }
          if (iks.length > 0) {
            console.log(iks);
            let ikSolver = new CCDIKSolver(vrm.model, iks);
            vrm.setModule("MMDIK", { update: (t) => ikSolver.update() });
          }
        }
        let clip = loader.animationBuilder.build(vmd, vrm.model);
        clip.tracks.forEach((tr) => {
          let m = tr.name.match(/.morphTargetInfluences\[(\w+)\]/);
          if (m) {
            let b = vrm.blendShapes[m[1]];
            b && b.binds.length > 0 && (tr.name = b.binds[0].target.uuid + ".morphTargetInfluences[" + b.binds[0].index + "]");
          }
        }), resolve(clip);
      }, () => {
      }, reject);
    });
  }
};

// src/utils/bvh.ts
var BVHLoaderWrapper = class {
  constructor() {
    this.existsPreviousThumbName = !1;
  }
  async load(url, avatar, options) {
    this.existsPreviousThumbName = avatar.bones.leftThumbIntermediate != null || avatar.bones.rightThumbIntermediate != null;
    let { BVHLoader } = await import("three/examples/jsm/loaders/BVHLoader.js");
    return await new Promise((resolve, reject) => {
      let cacheKey = url;
      if (window.VRM_ANIMATIONS = window.VRM_ANIMATIONS || {}, !window.VRM_ANIMATIONS[cacheKey])
        new BVHLoader().load(url, (result) => {
          window.VRM_ANIMATIONS[cacheKey] = { clip: result.clip.clone(), bones: result.skeleton.bones }, resolve(this.fixTracks(result.clip, avatar, result.skeleton.bones, options));
        });
      else {
        let { clip, bones } = window.VRM_ANIMATIONS[cacheKey];
        resolve(this.fixTracks(clip.clone(), avatar, bones, options));
      }
    });
  }
  fixTracks(clip, avatar, motionBones, options) {
    return options.convertBone && this.fixTrackName(clip, avatar, motionBones), clip.tracks = this.isLegacyMotionSkeleton(motionBones) ? clip.tracks.filter((t) => !t.name.match(/position/)) : clip.tracks.filter((t) => !t.name.match(/position/) || t.name.match(avatar.bones.hips.name)), clip;
  }
  convertBoneName(name) {
    return name = name.replace("Spin1", "Spin"), name = name.replace("Chest1", "Chest"), name = name.replace("Chest2", "UpperChest"), name = name.replace("UpLeg", "UpperLeg"), name = name.replace("LeftLeg", "LeftLowerLeg"), name = name.replace("RightLeg", "RightLowerLeg"), name = name.replace("ForeArm", "UpperArm"), name = name.replace("LeftArm", "LeftLowerArm"), name = name.replace("RightArm", "RightLowerArm"), name = name.replace("Collar", "Shoulder"), name = name.replace("Elbow", "LowerArm"), name = name.replace("Wrist", "Hand"), name = name.replace("LeftHip", "LeftUpperLeg"), name = name.replace("RightHip", "RightUpperLeg"), name = name.replace("Knee", "LowerLeg"), name = name.replace("Ankle", "Foot"), this.existsPreviousThumbName && (name = name.replace("leftThumbMetacarpal", "leftThumbProximal"), name = name.replace("leftThumbProximal", "leftThumbIntermediate"), name = name.replace("rightThumbMetacarpal", "rightThumbProximal"), name = name.replace("rightThumbProximal", "rightThumbIntermediate")), name.charAt(0).toLowerCase() + name.slice(1);
  }
  isLegacyMotionSkeleton(motionBones) {
    return motionBones.filter((b) => b.name == "hips" || b.name == "upperChest").length != 2;
  }
  fixTrackName(clip, avatar, motionBones) {
    let _vec3 = new THREE.Vector3(), motionHipsHeight = (motionBones.find((b) => b.name == "hips")?.position.y || 0) * 2.005, vrmHipsY = avatar.bones.hips?.getWorldPosition(_vec3).y, vrmRootY = avatar.model.getWorldPosition(_vec3).y, vrmHipsHeight = Math.abs(vrmHipsY - vrmRootY), hipsPositionScale = this.isLegacyMotionSkeleton(motionBones) ? 0.09 : vrmHipsHeight / motionHipsHeight;
    clip.tracks.forEach((t) => {
      t.name = t.name.replace(/bones\[(\w+)\]/, (m, name) => {
        let bone = avatar.bones[this.convertBoneName(name)];
        return "bones[" + (bone != null ? bone.name : "NODE_NOT_FOUND") + "]";
      }), t.name = t.name.replace("ToeBase", "Foot"), t.name.match(/quaternion/) && (t.values = t.values.map((v, i) => i % 2 == 0 ? -v : v)), t.name.match(/position/) && (t.values = t.values.map((v, i) => (i % 3 == 1 ? v : -v) * hipsPositionScale));
    }), clip.tracks = clip.tracks.filter((t) => !t.name.match(/NODE_NOT_FOUND/));
  }
};

// src/aframe-vrm.js
var VRM_POSE_A = {
  bones: [
    {
      name: "hips",
      q: [0, 0, 0, 1]
    },
    {
      name: "leftUpperLeg",
      q: [0, 0, 0, 1]
    },
    {
      name: "rightUpperLeg",
      q: [0, 0, 0, 1]
    },
    {
      name: "leftLowerLeg",
      q: [0, 0, 0, 1]
    },
    {
      name: "rightLowerLeg",
      q: [0, 0, 0, 1]
    },
    {
      name: "leftFoot",
      q: [0, 0, 0, 1]
    },
    {
      name: "rightFoot",
      q: [0, 0, 0, 1]
    },
    {
      name: "spine",
      q: [0, 0, 0, 1]
    },
    {
      name: "chest",
      q: [0, 0, 0, 1]
    },
    {
      name: "neck",
      q: [0, 0, 0, 1]
    },
    {
      name: "head",
      q: [0.06085100730464933, -0.02202995606372791, 0, 0.9979037207796351]
    },
    {
      name: "leftShoulder",
      q: [0, 0, 0, 1]
    },
    {
      name: "rightShoulder",
      q: [0, 0, 0, 1]
    },
    {
      name: "leftUpperArm",
      q: [-0.0039010895844694173, -0.1543204839727681, 0.539642514262409, 0.8276206416752847]
    },
    {
      name: "rightUpperArm",
      q: [0.009326220145646762, 0.1736606185406724, -0.5211727795846239, 0.8355441011735436]
    },
    {
      name: "leftLowerArm",
      q: [0.056406304529277126, -0.017647952075557537, 0.005438403159162174, 0.9982370972709678]
    },
    {
      name: "rightLowerArm",
      q: [0.054974313124661875, 0.02083301559003829, 0.0050595917092329966, 0.9982575874440588]
    },
    {
      name: "leftHand",
      q: [0, 0, 0, 1]
    },
    {
      name: "rightHand",
      q: [0, 0, 0, 1]
    },
    {
      name: "leftToes",
      q: [0, 0, 0, 1]
    },
    {
      name: "rightToes",
      q: [0, 0, 0, 1]
    },
    {
      name: "leftEye",
      q: [0, 0, 0, 1]
    },
    {
      name: "rightEye",
      q: [0, 0, 0, 1]
    },
    {
      name: "jaw",
      q: [0, 0, 0, 1]
    },
    {
      name: "leftThumbProximal",
      q: [0, 0, 0, 1]
    },
    {
      name: "leftThumbIntermediate",
      q: [0, 0, 0, 1]
    },
    {
      name: "leftThumbDistal",
      q: [0, 0, 0, 1]
    },
    {
      name: "leftIndexProximal",
      q: [0, 0, 0, 1]
    },
    {
      name: "leftIndexIntermediate",
      q: [0, 0, 0, 1]
    },
    {
      name: "leftIndexDistal",
      q: [0, 0, 0, 1]
    },
    {
      name: "leftMiddleProximal",
      q: [0, 0, 0, 1]
    },
    {
      name: "leftMiddleIntermediate",
      q: [0, 0, 0, 1]
    },
    {
      name: "leftMiddleDistal",
      q: [0, 0, 0, 1]
    },
    {
      name: "leftRingProximal",
      q: [0, 0, 0, 1]
    },
    {
      name: "leftRingIntermediate",
      q: [0, 0, 0, 1]
    },
    {
      name: "leftRingDistal",
      q: [0, 0, 0, 1]
    },
    {
      name: "leftLittleProximal",
      q: [0, 0, 0, 1]
    },
    {
      name: "leftLittleIntermediate",
      q: [0, 0, 0, 1]
    },
    {
      name: "leftLittleDistal",
      q: [0, 0, 0, 1]
    },
    {
      name: "rightThumbProximal",
      q: [0, 0, 0, 1]
    },
    {
      name: "rightThumbIntermediate",
      q: [0, 0, 0, 1]
    },
    {
      name: "rightThumbDistal",
      q: [0, 0, 0, 1]
    },
    {
      name: "rightIndexProximal",
      q: [0, 0, 0, 1]
    },
    {
      name: "rightIndexIntermediate",
      q: [0, 0, 0, 1]
    },
    {
      name: "rightIndexDistal",
      q: [0, 0, 0, 1]
    },
    {
      name: "rightMiddleProximal",
      q: [0, 0, 0, 1]
    },
    {
      name: "rightMiddleIntermediate",
      q: [0, 0, 0, 1]
    },
    {
      name: "rightMiddleDistal",
      q: [0, 0, 0, 1]
    },
    {
      name: "rightRingProximal",
      q: [0, 0, 0, 1]
    },
    {
      name: "rightRingIntermediate",
      q: [0, 0, 0, 1]
    },
    {
      name: "rightRingDistal",
      q: [0, 0, 0, 1]
    },
    {
      name: "rightLittleProximal",
      q: [0, 0, 0, 1]
    },
    {
      name: "rightLittleIntermediate",
      q: [0, 0, 0, 1]
    },
    {
      name: "rightLittleDistal",
      q: [0, 0, 0, 1]
    },
    {
      name: "upperChest",
      q: [0, 0, 0, 1]
    }
  ],
  blendShape: [
    {
      name: "NEUTRAL",
      value: 0
    },
    {
      name: "A",
      value: 0
    },
    {
      name: "I",
      value: 0
    },
    {
      name: "U",
      value: 0
    },
    {
      name: "E",
      value: 0
    },
    {
      name: "O",
      value: 0
    },
    {
      name: "BLINK",
      value: 0
    },
    {
      name: "JOY",
      value: 0
    },
    {
      name: "ANGRY",
      value: 0
    },
    {
      name: "SORROW",
      value: 0
    },
    {
      name: "FUN",
      value: 0
    },
    {
      name: "LOOKUP",
      value: 0
    },
    {
      name: "LOOKDOWN",
      value: 0
    },
    {
      name: "LOOKLEFT",
      value: 0
    },
    {
      name: "LOOKRIGHT",
      value: 0
    },
    {
      name: "BLINK_L",
      value: 0
    },
    {
      name: "BLINK_R",
      value: 0
    }
  ]
};
AFRAME.registerComponent("vrm", {
  schema: {
    src: { default: "" },
    firstPerson: { default: !1 },
    blink: { default: !0 },
    blinkInterval: { default: 5 },
    lookAt: { type: "selector" },
    enablePhysics: { default: !1 }
  },
  init() {
    this.avatar = null;
  },
  update(oldData) {
    this.data.src !== oldData.src && (this.remove(), this._loadAvatar()), this._updateAvatar();
  },
  tick(time, timeDelta) {
    if (!this.avatar) {
      this.pause();
      return;
    }
    this.avatar.update(timeDelta / 1e3);
  },
  remove() {
    this.avatar && (this.el.removeObject3D("avatar"), this.avatar.dispose());
  },
  async _loadAvatar() {
    let el = this.el, url = this.data.src;
    if (!!url)
      try {
        let moduleSpecs = [];
        globalThis.CANNON && moduleSpecs.push({ name: "physics", instantiate: (a, ctx) => new VRMPhysicsCannonJS(ctx) });
        let avatar = await new VRMLoader().load(url, moduleSpecs);
        if (url != this.data.src) {
          avatar.dispose();
          return;
        }
        this.avatar = avatar, el.setObject3D("avatar", avatar.model), this._updateAvatar(), this.play(), el.emit("model-loaded", { format: "vrm", model: avatar.model, avatar }, !1);
      } catch (e) {
        console.error("vrm model-error", e), el.emit("model-error", { format: "vrm", src: url, cause: e }, !1);
      }
  },
  _updateAvatar() {
    if (!this.avatar)
      return;
    let data = this.data;
    this.avatar.setFirstPerson(data.firstPerson), data.lookAt ? data.lookAt.tagName == "A-CAMERA" ? this.avatar.lookAtTarget = this.el.sceneEl.camera : this.avatar.lookAtTarget = data.lookAt.object3D : this.avatar.lookAtTarget = null, data.blink ? this.avatar.startBlink(data.blinkInterval) : this.avatar.stopBlink();
    let physics = this.avatar.modules.physics;
    if (physics) {
      if (data.enablePhysics && physics.world == null) {
        let engine = this.el.sceneEl.systems.physics;
        physics.attach(engine && engine.driver && engine.driver.world);
      }
      physics.enable = data.enablePhysics;
    }
  }
});
AFRAME.registerComponent("vrm-anim", {
  schema: {
    src: { default: "" },
    format: { default: "" },
    loop: { default: !0 },
    enableIK: { default: !0 },
    convertBone: { default: !0 },
    defaultMotion: { default: "" }
  },
  init() {
    this.avatar = null, this.el.components.vrm && this.el.components.vrm.avatar && (this.avatar = this.el.components.vrm.avatar), this.onVrmLoaded = (ev) => {
      this.avatar = ev.detail.avatar, this.data.src != "" ? this._loadClip(this.data.src) : this.avatar.animations.length > 0 ? this.playClip(this.avatar.animations[0]) : this.playTestMotion();
    }, this.el.addEventListener("model-loaded", this.onVrmLoaded);
  },
  update(oldData) {
    oldData.src != this.data.src && this.avatar && this._loadClip(this.data.src);
  },
  async _loadClip(url) {
    if (this.stopAnimation(), this.avatar.setPose(VRM_POSE_A), url === "")
      return;
    let loop = this.data.loop ? THREE.LoopRepeat : THREE.LoopOnce, clip = await ((this.data.format || (url.toLowerCase().endsWith(".bvh") ? "bvh" : "")) == "bvh" ? new BVHLoaderWrapper() : new VMDLoaderWrapper()).load(url, this.avatar, this.data);
    !this.avatar || this.playClip(clip);
  },
  stopAnimation() {
    this.animation && (this.animation.stop(), this.avatar.removeModule("MMDIK"), this.animation = null);
  },
  playTestMotion() {
    if (this.data.defaultMotion) {
      this._loadClip(this.data.defaultMotion);
      return;
    }
    let q = (x, y, z) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x * Math.PI / 180, y * Math.PI / 180, z * Math.PI / 180)), tracks = {
      leftUpperArm: {
        keys: [
          { rot: q(0, 0, 65), time: 0 },
          { rot: q(0, 0, 63), time: 1 },
          { rot: q(0, 0, 65), time: 2 }
        ]
      },
      rightUpperArm: {
        keys: [
          { rot: q(0, 0, -65), time: 0 },
          { rot: q(0, 0, -60), time: 1 },
          { rot: q(0, 0, -65), time: 2 }
        ]
      },
      spine: {
        keys: [
          { rot: q(0, 2, 0), time: 0 },
          { rot: q(2, 0, -2), time: 1 },
          { rot: q(2, -2, 0), time: 2 },
          { rot: q(0, 0, 2), time: 3 },
          { rot: q(0, 2, 0), time: 4 }
        ]
      }
    }, clip = THREE.AnimationClip.parseAnimation({
      name: "testAnimation",
      hierarchy: Object.values(tracks)
    }, Object.keys(tracks).map((k) => this.avatar.bones[k] || { name: k }));
    this.playClip(clip);
  },
  playClip(clip) {
    let loop = this.data.loop ? THREE.LoopRepeat : THREE.LoopOnce;
    this.stopAnimation(), this.clip = clip, this.animation = this.avatar.mixer.clipAction(clip).setLoop(loop).setEffectiveWeight(1).play(), this.animation.clampWhenFinished = !0;
  },
  remove() {
    this.el.removeEventListener("model-loaded", this.onVrmLoaded), this.stopAnimation(), this.avatar = null;
  }
});
AFRAME.registerComponent("vrm-skeleton", {
  schema: {
    physicsOffset: { type: "vec3", default: { x: 0, y: 0, z: 0 } }
  },
  init() {
    this.physicsBodies = [], this.sceneObj = this.el.sceneEl.object3D, this.el.components.vrm && this.el.components.vrm.avatar && this._onAvatarUpdated(this.el.components.vrm.avatar), this.onVrmLoaded = (ev) => this._onAvatarUpdated(ev.detail.avatar), this.el.addEventListener("model-loaded", this.onVrmLoaded);
  },
  _onAvatarUpdated(avatar) {
    this.helper && this.sceneObj.remove(this.helper), this.helper = new THREE.SkeletonHelper(avatar.model), this.sceneObj.add(this.helper), this._updatePhysicsBody(avatar);
  },
  _updatePhysicsBody(avatar) {
    this._clearPhysicsBody();
    let physics = avatar.modules.physics;
    if (!physics || !physics.world)
      return;
    let geometry = new THREE.SphereGeometry(1, 6, 3), material = new THREE.MeshBasicMaterial({ color: new THREE.Color("red"), wireframe: !0, depthTest: !1 });
    physics.bodies.forEach((body) => {
      let obj = new THREE.Group();
      body.shapes.forEach((shape, i) => {
        let sphere = new THREE.Mesh(geometry, material);
        sphere.position.copy(body.shapeOffsets[i]), sphere.scale.multiplyScalar(shape.boundingSphereRadius || 0.01), obj.add(sphere);
      }), this.sceneObj.add(obj), this.physicsBodies.push([body, obj]);
    });
  },
  _clearPhysicsBody() {
    this.physicsBodies.forEach(([body, obj]) => obj.parent.remove(obj)), this.physicsBodies = [];
  },
  tick() {
    this.physicsBodies.forEach(([body, obj]) => {
      obj.position.copy(body.position).add(this.data.physicsOffset), obj.quaternion.copy(body.quaternion);
    });
  },
  remove() {
    this.el.removeEventListener("model-loaded", this.onVrmLoaded), this._clearPhysicsBody(), this.helper && this.sceneObj.remove(this.helper);
  }
});
AFRAME.registerComponent("vrm-poser", {
  schema: {
    color: { default: "#00ff00" },
    enableConstraints: { default: !0 }
  },
  init() {
    this.binds = [], this._tmpV0 = new THREE.Vector3(), this._tmpV1 = new THREE.Vector3(), this._tmpQ0 = new THREE.Quaternion(), this._tmpQ1 = new THREE.Quaternion(), this._tmpM0 = new THREE.Matrix4(), this.el.components.vrm && this.el.components.vrm.avatar && this._onAvatarUpdated(this.el.components.vrm.avatar), this.onVrmLoaded = (ev) => this._onAvatarUpdated(ev.detail.avatar), this.el.addEventListener("model-loaded", this.onVrmLoaded);
  },
  remove() {
    this.el.removeEventListener("model-loaded", this.onVrmLoaded), this._removeHandles();
  },
  getPoseData(exportMorph) {
    if (!!this.avatar)
      return this.avatar.getPose(exportMorph);
  },
  setPoseData(pose) {
    !this.avatar || (this.avatar.setPose(pose), this._updateHandlePosition());
  },
  _onAvatarUpdated(avatar) {
    this._removeHandles(), this.avatar = avatar;
    let geometry = new THREE.BoxGeometry(1, 1, 1), material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(this.data.color),
      transparent: !0,
      opacity: 0.4,
      depthTest: !1
    }), _v0 = this._tmpV0, _v1 = this._tmpV1, _m = this._tmpM0, _q = this._tmpQ0, rootNode = avatar.bones.hips, boneNameByUUID = {};
    for (let name of Object.keys(avatar.bones)) {
      let bone = avatar.bones[name], isRoot = bone == rootNode, cube = new THREE.Mesh(geometry, material), targetEl = document.createElement("a-entity");
      targetEl.classList.add("collidable"), targetEl.setAttribute("xy-drag-control", {}), targetEl.setObject3D("handle", cube);
      let targetObject = targetEl.object3D, minDist = bone.children.reduce((d, b) => Math.min(d, b.position.length()), bone.position.length());
      targetObject.scale.multiplyScalar(Math.max(Math.min(minDist / 2, 0.05), 0.01)), boneNameByUUID[bone.uuid] = name, targetEl.addEventListener("mousedown", (ev) => {
        this.el.emit("vrm-poser-select", { name, node: bone });
      });
      let parentBone = bone.parent;
      for (; !boneNameByUUID[parentBone.uuid] && parentBone.parent && parentBone.parent.isBone; )
        parentBone = parentBone.parent;
      targetEl.addEventListener("xy-drag", (ev) => {
        if (isRoot) {
          let d = targetObject.parent.worldToLocal(bone.getWorldPosition(_v0)).sub(targetObject.position);
          avatar.model.position.sub(d);
        }
        parentBone.updateMatrixWorld(!1), targetObject.updateMatrixWorld(!1), _m.getInverse(parentBone.matrixWorld).multiply(targetObject.matrixWorld).decompose(_v1, _q, _v0), bone.quaternion.copy(this._applyConstraintQ(name, _q)), _q.setFromUnitVectors(_v0.copy(bone.position).normalize(), _v1.normalize()), parentBone.children.length == 1 && (parentBone.quaternion.multiply(_q), this._applyConstraintQ(boneNameByUUID[parentBone.uuid], parentBone.quaternion)), this._updateHandlePosition(isRoot ? null : bone);
      }), targetEl.addEventListener("xy-dragend", (ev) => {
        this._updateHandlePosition(), console.log(parentBone.name, name);
      }), this.el.appendChild(targetEl), this.binds.push([bone, targetObject]);
    }
    this._updateHandlePosition();
  },
  _applyConstraintQ(name, q) {
    if (!this.data.enableConstraints)
      return q;
    let _q = this._tmpQ1, _v = this._tmpV0, constraint = this.avatar.boneConstraints[name];
    if (constraint && constraint.type == "ball") {
      let angle = 2 * Math.acos(q.w);
      if (constraint.twistAxis) {
        let tangle = angle * Math.acos(q.w) * _v.copy(q).normalize().dot(constraint.twistAxis);
        if (tangle = this._normalizeAngle(tangle), Math.abs(tangle) > constraint.twistLimit) {
          let e = tangle < 0 ? tangle + constraint.twistLimit : tangle - constraint.twistLimit;
          q.multiply(_q.setFromAxisAngle(constraint.twistAxis, -e)), angle = 2 * Math.acos(q.w);
        }
      }
      Math.abs(this._normalizeAngle(angle)) > constraint.limit && q.setFromAxisAngle(_v.copy(q).normalize(), constraint.limit);
    } else if (constraint && constraint.type == "hinge") {
      let m = (constraint.min + constraint.max) / 2, angle = 2 * Math.acos(q.w) * _v.copy(q).normalize().dot(constraint.axis);
      angle = THREE.MathUtils.clamp(this._normalizeAngle(angle - m), constraint.min - m, constraint.max - m), q.setFromAxisAngle(constraint.axis, angle + m);
    }
    return q;
  },
  _normalizeAngle(angle) {
    return angle - Math.PI * 2 * Math.floor((angle + Math.PI) / (Math.PI * 2));
  },
  _removeHandles() {
    this.binds.forEach(([b, t]) => {
      this.el.removeChild(t.el);
      let obj = t.el.getObject3D("handle");
      obj && (obj.material.dispose(), obj.geometry.dispose()), t.el.destroy();
    }), this.binds = [];
  },
  _updateHandlePosition(skipNode) {
    let _v = this._tmpV0, container = this.el.object3D;
    container.updateMatrixWorld(!1);
    let base = container.matrixWorld.clone().invert();
    this.binds.forEach(([node, target]) => {
      let pos = node == skipNode ? _v : target.position;
      node.updateMatrixWorld(!1), target.matrix.copy(node.matrixWorld).premultiply(base).decompose(pos, target.quaternion, _v);
    });
  }
});
AFRAME.registerComponent("vrm-mimic", {
  schema: {
    leftHandTarget: { type: "selector", default: "" },
    leftHandOffsetPosition: { type: "vec3" },
    leftHandOffsetRotation: { type: "vec3", default: { x: 0, y: -Math.PI / 2, z: 0 } },
    rightHandTarget: { type: "selector", default: "" },
    rightHandOffsetPosition: { type: "vec3" },
    rightHandOffsetRotation: { type: "vec3", default: { x: 0, y: Math.PI / 2, z: 0 } },
    leftLegTarget: { type: "selector", default: "" },
    rightLegTarget: { type: "selector", default: "" },
    headTarget: { type: "selector", default: "" },
    avatarOffset: { type: "vec3", default: { x: 0, y: 0, z: 0 } }
  },
  init() {
    this._tmpV0 = new THREE.Vector3(), this._tmpV1 = new THREE.Vector3(), this._tmpQ0 = new THREE.Quaternion(), this._tmpQ1 = new THREE.Quaternion(), this._tmpM0 = new THREE.Matrix4(), this.targetEls = [], this.el.components.vrm && this.el.components.vrm.avatar && this._onAvatarUpdated(this.el.components.vrm.avatar), this.onVrmLoaded = (ev) => this._onAvatarUpdated(ev.detail.avatar), this.el.addEventListener("model-loaded", this.onVrmLoaded);
  },
  update() {
    this.data.headTarget ? this.data.headTarget.tagName == "A-CAMERA" ? this.headTarget = this.el.sceneEl.camera : this.headTarget = this.data.headTarget.object3D : this.headTarget = null, this.rightHandOffset = new THREE.Matrix4().compose(this.data.rightHandOffsetPosition, new THREE.Quaternion().setFromEuler(new THREE.Euler().setFromVector3(this.data.rightHandOffsetRotation)), new THREE.Vector3(1, 1, 1)), this.leftHandOffset = new THREE.Matrix4().compose(this.data.leftHandOffsetPosition, new THREE.Quaternion().setFromEuler(new THREE.Euler().setFromVector3(this.data.leftHandOffsetRotation)), new THREE.Vector3(1, 1, 1));
  },
  _onAvatarUpdated(avatar) {
    this.avatar = avatar;
    for (let el of this.targetEls)
      this.el.removeChild(el);
    this.targetEls = [], this.update(), this.startAvatarIK_simpleIK(avatar);
  },
  startAvatarIK_simpleIK(avatar) {
    let solver = new IKSolver();
    this.qbinds = [];
    let setupIkChain = (boneNames, targetEl, offset) => {
      targetEl == null && (targetEl = document.createElement("a-box"), targetEl.classList.add("collidable"), targetEl.setAttribute("xy-drag-control", {}), targetEl.setAttribute("geometry", { width: 0.05, depth: 0.05, height: 0.05 }), targetEl.setAttribute("material", { color: "blue", depthTest: !1, transparent: !0, opacity: 0.4 }), this.el.appendChild(targetEl), this.targetEls.push(targetEl));
      let pos = (b, p) => p.worldToLocal(b.getWorldPosition(new THREE.Vector3()));
      boneNames = boneNames.filter((name) => avatar.bones[name]);
      let boneList = boneNames.map((name) => avatar.bones[name]), bones = boneList.map((b, i) => {
        let position = i == 0 ? b.position : pos(b, boneList[i - 1]), constraintConf = avatar.boneConstraints[boneNames[i]], constraint = constraintConf ? {
          apply: (ikbone) => this._applyConstraintQ(constraintConf, ikbone.quaternion)
        } : null;
        return new IKNode(position, constraint, b);
      });
      return this.qbinds.push([boneList[boneList.length - 1], targetEl.object3D, offset]), { root: boneList[0], ikbones: bones, bones: boneList, target: targetEl.object3D };
    };
    this.chains = [
      setupIkChain(["leftUpperArm", "leftLowerArm", "leftHand"], this.data.leftHandTarget, this.leftHandOffset),
      setupIkChain(["rightUpperArm", "rightLowerArm", "rightHand"], this.data.rightHandTarget, this.rightHandOffset),
      setupIkChain(["leftUpperLeg", "leftLowerLeg", "leftFoot"], this.data.leftLegTarget),
      setupIkChain(["rightUpperLeg", "rightLowerLeg", "rightFoot"], this.data.rightLegTarget)
    ], this.simpleIK = solver;
  },
  _applyConstraintQ(constraint, q) {
    let _q = this._tmpQ1, _v = this._tmpV0, fixed = !1;
    if (constraint && constraint.type == "ball") {
      let angle = 2 * Math.acos(q.w);
      if (constraint.twistAxis) {
        let tangle = angle * Math.acos(q.w) * _v.copy(q).normalize().dot(constraint.twistAxis);
        if (tangle = this._normalizeAngle(tangle), Math.abs(tangle) > constraint.twistLimit) {
          let e = tangle < 0 ? tangle + constraint.twistLimit : tangle - constraint.twistLimit;
          q.multiply(_q.setFromAxisAngle(constraint.twistAxis, -e)), angle = 2 * Math.acos(q.w), fixed = !0;
        }
      }
      Math.abs(this._normalizeAngle(angle)) > constraint.limit && (q.setFromAxisAngle(_v.copy(q).normalize(), constraint.limit), fixed = !0);
    } else if (constraint && constraint.type == "hinge") {
      let m = (constraint.min + constraint.max) / 2, dot = _v.copy(q).normalize().dot(constraint.axis), angle = 2 * Math.acos(q.w) * dot;
      angle = THREE.MathUtils.clamp(this._normalizeAngle(angle - m), constraint.min - m, constraint.max - m), q.setFromAxisAngle(constraint.axis, angle + m), fixed = !0;
    }
    return fixed;
  },
  _normalizeAngle(angle) {
    return angle - Math.PI * 2 * Math.floor((angle + Math.PI) / (Math.PI * 2));
  },
  tick(time, timeDelta) {
    if (!!this.avatar) {
      if (this.headTarget) {
        let position = this._tmpV0, headRot = this._tmpQ0;
        this.headTarget.matrixWorld.decompose(position, headRot, this._tmpV1), position.y = 0, this.avatar.model.position.copy(position.add(this.data.avatarOffset));
        let head = this.avatar.firstPersonBone;
        if (head) {
          let r = this._tmpQ1.setFromRotationMatrix(head.parent.matrixWorld).invert();
          head.quaternion.copy(headRot.premultiply(r));
        }
      }
      if (this.simpleIK) {
        let pm = this.el.object3D.matrixWorld.clone().invert();
        for (let chain of this.chains) {
          let baseMat = chain.root.parent.matrixWorld.clone().premultiply(pm);
          this.simpleIK.solve(chain.ikbones, chain.target.position, baseMat), chain.ikbones.forEach((ikbone, i) => {
            if (i == chain.ikbones.length - 1)
              return;
            let a = ikbone.userData.quaternion.angleTo(ikbone.quaternion);
            a > 0.2 ? ikbone.userData.quaternion.slerp(ikbone.quaternion, 0.2 / a) : ikbone.userData.quaternion.copy(ikbone.quaternion);
          });
        }
        this.qbinds.forEach(([bone, t, offset]) => {
          let m = offset ? t.matrixWorld.clone().multiply(offset) : t.matrixWorld, r = this._tmpQ0.setFromRotationMatrix(bone.parent.matrixWorld).invert();
          bone.quaternion.copy(this._tmpQ1.setFromRotationMatrix(m).premultiply(r));
        });
      }
    }
  },
  remove() {
    this.el.removeEventListener("model-loaded", this.onVrmLoaded);
    for (let el of this.targetEls)
      this.el.removeChild(el);
  }
});
export {
  BVHLoaderWrapper,
  IKNode,
  IKSolver,
  VMDLoaderWrapper,
  VRMAvatar,
  VRMPhysicsCannonJS
};
//# sourceMappingURL=aframe-vrm.module.js.map
