import * as THREE from 'three';
import { CONFIG } from './config.js';
import { createPlayerPhysicsState, stepPlayerPhysics } from './physics.js';
import { buildHeroWorkerModel } from './graphics/modelBuilder.js';

export const PLAYER_ANIM = Object.freeze({
	IDLE: 'IDLE',
	WALK: 'WALK',
	RUN: 'RUN',
	JUMP: 'JUMP',
	FALL: 'FALL',
	CLIMB_UP: 'CLIMB_UP',
	CLIMB_DOWN: 'CLIMB_DOWN',
	DAMAGE: 'DAMAGE',
	MISS: 'MISS'
});

function damp(current, target, lambda, dt) {
	return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

function dampAngle(current, target, lambda, dt) {
	let diff = (target - current + Math.PI) % (Math.PI * 2) - Math.PI;
	if (diff < -Math.PI) {
		diff += Math.PI * 2;
	}
	return current + diff * (1 - Math.exp(-lambda * dt));
}

/**
 * プレイヤーキャラクターの3Dモデル・アニメーション・物理状態統合クラス
 */
export class Player {
	/**
	 * @param {THREE.Scene} scene
	 */
	constructor(scene) {
		this.scene = scene;
		this.physics = createPlayerPhysicsState();
		this.animState = PLAYER_ANIM.IDLE;

		this._animTime = 0;
		this._climbPhase = 0;
		this._lastStepCycle = -1;
		this._lastClimbRung = 0;
		this._damageTimer = 0;
		this._invincibleHitTimer = 0;
		this._celebrateSide = 0;
		this._celebrateSynced = false;
		this._celebrateJumpPhase = 0;
		this._basePelvisY = 0.62;
		this._missMode = false;
		this._missTime = 0;
		this._yaw = Math.PI * 0.5;
		this.hammerTimer = 0;

		this._disposables = {
			geometries: [],
			materials: []
		};

		this.root = new THREE.Group();
		this.visual = new THREE.Group();
		this.root.add(this.visual);

		this._joints = this._buildCharacterModel();
		this._characterMaterials = this._disposables.materials.map((mat) => ({
			mat,
			baseTransparent: Boolean(mat.transparent),
			baseOpacity: Number.isFinite(mat.opacity) ? mat.opacity : 1.0
		}));
		this._landingIndicator = this._buildLandingIndicator();

		this.scene.add(this.root);
		this.scene.add(this._landingIndicator.group);
	}

	_trackGeo(geo) {
		this._disposables.geometries.push(geo);
		return geo;
	}

	_trackMat(mat) {
		this._disposables.materials.push(mat);
		return mat;
	}

	/**
	 * マイクラ風3頭身ブロック・ワーカーヒーロー3Dモデル（肘・膝2関節可動）を構築する
	 */
	_buildCharacterModel() {
		const tracker = {
			geo: (g) => this._trackGeo(g),
			mat: (m) => this._trackMat(m)
		};
		const built = buildHeroWorkerModel(tracker);
		this._basePelvisY = built.basePelvisY ?? 0.62;
		this.visual.add(built.root);
		return {
			pelvis: built.pelvis,
			torso: built.torso,
			head: built.head,
			leftArm: built.leftArm,
			rightArm: built.rightArm,
			leftElbow: built.leftElbow,
			rightElbow: built.rightElbow,
			leftLeg: built.leftLeg,
			rightLeg: built.rightLeg,
			leftKnee: built.leftKnee,
			rightKnee: built.rightKnee,
			hammerGroup: built.hammerGroup,
			scarfTailLeft: built.scarfTailLeft,
			scarfTailRight: built.scarfTailRight
		};
	}

	/**
	 * 3D空間での着地ズレを防ぐ足元ターゲットリング＆影を構築する
	 */
	_buildLandingIndicator() {
		const group = new THREE.Group();

		const shadowMat = this._trackMat(new THREE.MeshBasicMaterial({
			color: 0x000000,
			transparent: true,
			opacity: 0.42,
			depthWrite: false
		}));
		const shadowDisc = new THREE.Mesh(
			this._trackGeo(new THREE.CircleGeometry(0.38, 24)),
			shadowMat
		);
		shadowDisc.rotation.x = -Math.PI * 0.5;
		group.add(shadowDisc);

		const ringMat = this._trackMat(new THREE.MeshBasicMaterial({
			color: 0xffb703,
			transparent: true,
			opacity: 0.8,
			depthWrite: false,
			side: THREE.DoubleSide
		}));
		const ring = new THREE.Mesh(
			this._trackGeo(new THREE.RingGeometry(0.36, 0.46, 28)),
			ringMat
		);
		ring.rotation.x = -Math.PI * 0.5;
		ring.position.y = 0.005;
		group.add(ring);

		return { group, shadowDisc, shadowMat, ring, ringMat };
	}

	/**
	 * プレイヤーを指定位置にリセットする
	 * @param {{ x: number, y: number, z?: number }} spawn
	 */
	reset(spawn) {
		this.physics = createPlayerPhysicsState(spawn);
		this.animState = PLAYER_ANIM.IDLE;
		this._animTime = 0;
		this._climbPhase = 0;
		this._lastStepCycle = -1;
		this._lastClimbRung = 0;
		this._damageTimer = 0;
		this._invincibleHitTimer = 0;
		this._celebrateSide = 0;
		this._celebrateSynced = false;
		this._celebrateJumpPhase = 0;
		this.physics.celebrateSynced = false;
		this.physics.celebrateJumpPhase = 0;
		this._missMode = false;
		this._missTime = 0;
		this._yaw = Math.PI * 0.5;
		this.hammerTimer = 0;
		this.visual.visible = true;
		this._applyCharacterOpacity(1.0);
		this.visual.rotation.set(0, this._yaw, 0);
		this.visual.position.set(0, 0, 0);
		if (this._joints?.pelvis) {
			this._joints.pelvis.position.y = this._basePelvisY;
		}
		if (this._joints?.hammerGroup) {
			this._joints.hammerGroup.visible = false;
		}
		this._syncTransform();
	}

	get hasHammer() {
		return this.hammerTimer > 0;
	}

	activateHammer(duration = CONFIG.ENEMY.HAMMER_DURATION) {
		this.hammerTimer = duration;
	}

	triggerDamage(invincibleDuration = 1.4) {
		if (this.physics.invincibleTimer > 0 || this._missMode) {
			return false;
		}
		this.physics.invincibleTimer = invincibleDuration;
		this._damageTimer = 0.4;
		return true;
	}

	/**
	 * 開発無敵モード中の敵・ギミック接触時にプレイヤーを半透明状態にする
	 * @param {number} [duration]
	 * @returns {boolean} 今回新たに接触状態へ入った場合 true
	 */
	triggerInvincibleHit(duration = 1.0) {
		if (this._missMode) {
			return false;
		}
		const wasActive = this._invincibleHitTimer > 0;
		this._invincibleHitTimer = Math.max(this._invincibleHitTimer, duration);
		this._applyCharacterOpacity(0.36);
		return !wasActive;
	}

	_applyCharacterOpacity(alpha) {
		if (!this._characterMaterials) {
			return;
		}
		const isTranslucent = alpha < 0.999;
		for (const entry of this._characterMaterials) {
			const mat = entry.mat;
			if (isTranslucent) {
				mat.transparent = true;
				mat.opacity = Math.min(entry.baseOpacity, alpha);
			} else {
				mat.transparent = entry.baseTransparent;
				mat.opacity = entry.baseOpacity;
			}
		}
	}

	triggerMiss() {
		this._invincibleHitTimer = 0;
		this._applyCharacterOpacity(1.0);
		this._missMode = true;
		this._missTime = 0;
		this.animState = PLAYER_ANIM.MISS;
	}

	/**
	 * 1フレーム分の物理更新とアニメーション更新を実行する
	 */
	update(input, levelGeometry, dt) {
		if (this._missMode) {
			this._updateMissAnimation(dt);
			return { justJumped: false, justLanded: false, justStepped: false, justClimbed: false, landImpactSpeed: 0, fellOut: false };
		}

		if (this.hammerTimer > 0) {
			this.hammerTimer = Math.max(0, this.hammerTimer - dt);
		}
		if (this._invincibleHitTimer > 0) {
			this._invincibleHitTimer = Math.max(0, this._invincibleHitTimer - dt);
		}
		const events = stepPlayerPhysics(this.physics, input, levelGeometry, dt);
		this._updateAnimationState(input, dt);
		this._applyJointAnimation(dt);
		this._applyCharacterOpacity(this._invincibleHitTimer > 0 ? 0.36 : 1.0);
		this._syncTransform();

		let justStepped = false;
		if (this.physics.grounded && (this.animState === PLAYER_ANIM.WALK || this.animState === PLAYER_ANIM.RUN)) {
			const freq = this.animState === PLAYER_ANIM.RUN ? 14.0 : 9.5;
			const stepCycle = Math.floor((this._animTime * freq) / Math.PI);
			if (this._lastStepCycle !== -1 && stepCycle !== this._lastStepCycle) {
				justStepped = true;
			}
			this._lastStepCycle = stepCycle;
		} else {
			this._lastStepCycle = -1;
		}

		let justClimbed = false;
		if (this.physics.onLadder && Math.abs(this.physics.vy) > 0.2) {
			const climbRung = Math.floor(this._climbPhase / (Math.PI * 0.45));
			if (climbRung !== this._lastClimbRung) {
				justClimbed = true;
			}
			this._lastClimbRung = climbRung;
		} else if (!this.physics.onLadder) {
			this._lastClimbRung = Math.floor(this._climbPhase / (Math.PI * 0.45));
		}

		return { ...events, justStepped, justClimbed };
	}

	/**
	 * ステージクリア時の自動接近→姫と向かい合い→両手を繋いで同時ジャンプで喜び合う演出を更新する
	 * @param {{ x: number, y?: number, z?: number } | number} goalTarget
	 * @param {number} dt
	 */
	updateCelebration(goalTarget, dt) {
		this._animTime += dt;
		this._invincibleHitTimer = 0;
		this._applyCharacterOpacity(1.0);
		this.hammerTimer = 0;

		const goalX = typeof goalTarget === 'number' ? goalTarget : (goalTarget?.x ?? this.physics.x);
		const goalY = typeof goalTarget === 'number' ? this.physics.y : (goalTarget?.y ?? this.physics.y);
		const goalZ = typeof goalTarget === 'number' ? 0 : (goalTarget?.z ?? 0);

		if (this._celebrateSide === 0) {
			this._celebrateSide = this.physics.x >= goalX - 0.05 ? 1 : -1;
		}
		// 互いに顔・頭・ドレスが干渉せず、両腕を伸ばしてぴったり手を繋げる距離（0.65u）
		const targetX = goalX + this._celebrateSide * 0.65;
		const dx = targetX - this.physics.x;
		const dist = Math.abs(dx);

		// 最上段床高さ・奥行（z=goal.z）へ確実に揃える（梯子昇降直後のZズレを防止）
		this.physics.y = damp(this.physics.y, goalY, 14, dt);
		this.physics.z = damp(this.physics.z, goalZ, 14, dt);
		const zDist = Math.abs(this.physics.z - goalZ);
		this.physics.vy = 0;
		this.physics.vx = 0;
		this.physics.onLadder = false;
		this.physics.grounded = true;

		const j = this._joints;
		const t = this._animTime;
		j.hammerGroup.visible = false;
		this._landingIndicator.group.visible = false;

		if (dist > 0.04 || zDist > 0.05) {
			// 姫のすぐ隣（両手を繋げる距離・同一Zライン）まで歩く
			this._celebrateSynced = false;
			this._celebrateJumpPhase = 0;
			this.physics.celebrateSynced = false;
			this.physics.celebrateJumpPhase = 0;

			const moveDir = dx >= 0 ? 1 : -1;
			if (dist > 0.04) {
				const walkStep = Math.min(dist, 3.4 * dt);
				this.physics.x += moveDir * walkStep;
				this.physics.facingDir = moveDir;
			} else {
				this.physics.x = targetX;
			}
			this.animState = PLAYER_ANIM.WALK;

			const walkYaw = dist > 0.04 ? moveDir * Math.PI * 0.5 : (goalX >= targetX ? 1 : -1) * Math.PI * 0.5;
			this._yaw = dampAngle(this._yaw, walkYaw, 16, dt);
			this.visual.rotation.y = this._yaw;

			const walkPhase = t * 11.5;
			const walkSwing = Math.sin(walkPhase);
			j.pelvis.position.y = this._basePelvisY + Math.abs(walkSwing) * 0.045;
			j.torso.rotation.set(0.08, 0, 0);
			j.head.rotation.set(0, 0, 0);
			j.leftArm.rotation.set(walkSwing * 0.55, 0, 0.12);
			j.rightArm.rotation.set(-walkSwing * 0.55, 0, -0.12);
			j.leftLeg.rotation.set(-walkSwing * 0.65, 0, 0);
			j.rightLeg.rotation.set(walkSwing * 0.65, 0, 0);
			if (j.leftElbow && j.rightElbow) {
				j.leftElbow.rotation.x = -0.35 - Math.max(0, -walkSwing) * 0.35;
				j.rightElbow.rotation.x = -0.35 - Math.max(0, walkSwing) * 0.35;
			}
			if (j.leftKnee && j.rightKnee) {
				j.leftKnee.rotation.x = 0.1 + Math.max(0, -walkSwing) * 0.55;
				j.rightKnee.rotation.x = 0.1 + Math.max(0, walkSwing) * 0.55;
			}
		} else {
			// 到着：姫と向き合い、両手を前方に伸ばして手を繋ぎ、完全同期した位相で一緒にジャンプする
			this.physics.x = targetX;
			this.physics.z = goalZ;
			const facePrincess = goalX >= targetX ? 1 : -1;
			this.physics.facingDir = facePrincess;
			this.animState = PLAYER_ANIM.IDLE;

			this._yaw = dampAngle(this._yaw, facePrincess * Math.PI * 0.5, 16, dt);
			this.visual.rotation.y = this._yaw;

			this._celebrateSynced = true;
			this._celebrateJumpPhase += dt * 3.0;
			this.physics.celebrateSynced = true;
			this.physics.celebrateJumpPhase = this._celebrateJumpPhase;

			const hop = Math.abs(Math.sin(this._celebrateJumpPhase)) * 0.028;
			const armLift = Math.sin(this._celebrateJumpPhase) * 0.045;
			j.pelvis.position.y = this._basePelvisY + hop;
			j.torso.rotation.set(0.05, 0, 0);
			j.head.rotation.set(-0.04, 0, Math.sin(this._celebrateJumpPhase * 0.5) * 0.035);
			// 両手を前方水平に差し出して角度を僅かに内側へ寄せ、姫の両手と高さ・左右幅を合わせる
			j.leftArm.rotation.set(-1.62 + armLift, 0, 0.15);
			j.rightArm.rotation.set(-1.62 + armLift, 0, -0.15);
			j.leftLeg.rotation.set(0, 0, 0);
			j.rightLeg.rotation.set(0, 0, 0);
			if (j.leftElbow && j.rightElbow) {
				j.leftElbow.rotation.x = -0.15;
				j.rightElbow.rotation.x = -0.15;
			}
			if (j.leftKnee && j.rightKnee) {
				const hopBend = Math.abs(Math.sin(this._celebrateJumpPhase)) * 0.12;
				j.leftKnee.rotation.x = hopBend;
				j.rightKnee.rotation.x = hopBend;
			}
		}

		this._syncTransform();
	}

	_updateMissAnimation(dt) {
		this._missTime += dt;
		this.visual.rotation.y += dt * 11.0;
		this.visual.rotation.z = Math.min(Math.PI * 0.5, this._missTime * 4.5);
		this.visual.position.y = Math.sin(Math.min(1, this._missTime / 0.5) * Math.PI) * 1.1 - Math.max(0, this._missTime - 0.35) * 6.0;
		this._landingIndicator.group.visible = false;
	}

	_updateAnimationState(input, dt) {
		this._animTime += dt;

		if (this._damageTimer > 0) {
			this._damageTimer = Math.max(0, this._damageTimer - dt);
			this.animState = PLAYER_ANIM.DAMAGE;
			return;
		}

		if (this.physics.onLadder) {
			const climbSpeed = Math.abs(this.physics.vy);
			if (climbSpeed > 0.2) {
				this._climbPhase += this.physics.vy * dt * 2.6;
				this.animState = this.physics.vy >= 0 ? PLAYER_ANIM.CLIMB_UP : PLAYER_ANIM.CLIMB_DOWN;
			} else {
				this.animState = PLAYER_ANIM.CLIMB_UP;
			}
			return;
		}

		if (!this.physics.grounded) {
			this.animState = this.physics.vy >= 0 ? PLAYER_ANIM.JUMP : PLAYER_ANIM.FALL;
			return;
		}

		const absVx = Math.abs(this.physics.vx);
		if (absVx > CONFIG.PLAYER.MOVE_SPEED * 0.65) {
			this.animState = PLAYER_ANIM.RUN;
		} else if (absVx > 0.35 || Math.abs(input.moveX) > 0.15) {
			this.animState = PLAYER_ANIM.WALK;
		} else {
			this.animState = PLAYER_ANIM.IDLE;
		}
	}

	_applyJointAnimation(dt) {
		const j = this._joints;

		// 無敵中の点滅表現
		if (this.physics.invincibleTimer > 0) {
			this.visual.visible = Math.floor(this._animTime * 20) % 2 === 0;
		} else {
			this.visual.visible = true;
		}

		// キャラクター向きの補間（梯子中は奥向き、通常時は進行方向）
		const targetYaw = this.physics.onLadder
			? Math.PI * 0.92
			: (this.physics.facingDir >= 0 ? Math.PI * 0.5 : -Math.PI * 0.5);
		this._yaw = dampAngle(this._yaw, targetYaw, 16, dt);
		this.visual.rotation.y = this._yaw;

		const basePelvisY = this._basePelvisY;
		let pelvisY = basePelvisY;
		let torsoPitch = 0;
		let headPitch = 0;
		let headTilt = 0;
		let lArmX = 0;
		let rArmX = 0;
		let lArmZ = 0.12;
		let rArmZ = -0.12;
		let lElbowX = -0.2;
		let rElbowX = -0.2;
		let lLegX = 0;
		let rLegX = 0;
		let lKneeX = 0.06;
		let rKneeX = 0.06;

		if (this.animState === PLAYER_ANIM.IDLE) {
			pelvisY = basePelvisY + Math.sin(this._animTime * 3.2) * 0.018;
			headTilt = Math.sin(this._animTime * 1.4) * 0.06;
			lArmX = Math.sin(this._animTime * 2.0) * 0.05;
			rArmX = -lArmX;
			lElbowX = -0.24;
			rElbowX = -0.24;
		} else if (this.animState === PLAYER_ANIM.WALK || this.animState === PLAYER_ANIM.RUN) {
			const isRun = this.animState === PLAYER_ANIM.RUN;
			const freq = isRun ? 14.0 : 9.5;
			const amp = isRun ? 0.85 : 0.52;
			const swing = Math.sin(this._animTime * freq) * amp;
			const normSwing = Math.sin(this._animTime * freq);
			pelvisY = basePelvisY + Math.abs(normSwing) * (isRun ? 0.055 : 0.032);
			torsoPitch = isRun ? 0.16 : 0.08;
			headPitch = isRun ? -0.08 : -0.03;
			lLegX = swing;
			rLegX = -swing;
			lArmX = -swing * 0.9;
			rArmX = swing * 0.9;
			// 肘と膝の自然な屈伸（振り上げ時に曲げ、着地時に伸ばす）
			const elbowBase = isRun ? -0.92 : -0.42;
			lElbowX = elbowBase - Math.max(0, normSwing) * (isRun ? 0.35 : 0.22);
			rElbowX = elbowBase - Math.max(0, -normSwing) * (isRun ? 0.35 : 0.22);
			lKneeX = 0.08 + Math.max(0, normSwing) * (isRun ? 0.85 : 0.45);
			rKneeX = 0.08 + Math.max(0, -normSwing) * (isRun ? 0.85 : 0.45);
		} else if (this.animState === PLAYER_ANIM.JUMP) {
			torsoPitch = -0.08;
			headPitch = -0.14;
			lArmX = -2.0;
			rArmX = -1.45;
			lElbowX = -0.65;
			rElbowX = -0.85;
			lLegX = -0.58;
			rLegX = 0.22;
			lKneeX = 0.92;
			rKneeX = 0.35;
		} else if (this.animState === PLAYER_ANIM.FALL) {
			torsoPitch = 0.12;
			headPitch = 0.12;
			lArmZ = 0.75;
			rArmZ = -0.75;
			lArmX = -0.55;
			rArmX = -0.55;
			lElbowX = -0.45;
			rElbowX = -0.45;
			lLegX = 0.22;
			rLegX = -0.22;
			lKneeX = 0.45;
			rKneeX = 0.25;
		} else if (this.animState === PLAYER_ANIM.CLIMB_UP || this.animState === PLAYER_ANIM.CLIMB_DOWN) {
			const c = Math.sin(this._climbPhase * 2.2);
			torsoPitch = 0.08;
			headPitch = -0.12;
			lArmX = -1.65 + c * 0.65;
			rArmX = -1.65 - c * 0.65;
			lElbowX = -0.75 - c * 0.25;
			rElbowX = -0.75 + c * 0.25;
			lLegX = -c * 0.52;
			rLegX = c * 0.52;
			lKneeX = 0.22 + Math.max(0, -c) * 0.55;
			rKneeX = 0.22 + Math.max(0, c) * 0.55;
		} else if (this.animState === PLAYER_ANIM.DAMAGE) {
			torsoPitch = -0.34;
			headPitch = -0.22;
			lArmZ = 0.8;
			rArmZ = -0.8;
			lElbowX = -0.55;
			rElbowX = -0.55;
			lKneeX = 0.35;
			rKneeX = 0.35;
		}

		// パワーハンマー装備中は腕を前に伸ばして床スレスレまで大きく上下に振り下ろす（残り1.8秒で点滅警告）
		let rightArmReachZ = 0;
		if (j.hammerGroup) {
			const showHammer = this.hasHammer && !this.physics.onLadder;
			if (!showHammer) {
				j.hammerGroup.visible = false;
			} else if (this.hammerTimer < 1.8) {
				j.hammerGroup.visible = Math.floor(this._animTime * 16) % 2 === 0;
			} else {
				j.hammerGroup.visible = true;
			}
			if (showHammer) {
				const swingWave = Math.sin(this._animTime * 18);
				torsoPitch = 0.14 + Math.max(0, swingWave) * 0.1;
				rightArmReachZ = 0.18;
				rArmX = -1.35 + swingWave * 1.02;
				rElbowX = -0.32;
				lArmX = 0.45 - swingWave * 0.45;
			}
		}

		const k = 16;
		j.pelvis.position.y = damp(j.pelvis.position.y, pelvisY, k, dt);
		j.torso.rotation.x = damp(j.torso.rotation.x, torsoPitch, k, dt);
		if (j.head) {
			j.head.rotation.x = damp(j.head.rotation.x, headPitch, k, dt);
			j.head.rotation.z = damp(j.head.rotation.z, headTilt, k, dt);
		}
		j.leftArm.rotation.x = damp(j.leftArm.rotation.x, lArmX, k, dt);
		j.leftArm.rotation.y = damp(j.leftArm.rotation.y, 0, k, dt);
		j.rightArm.rotation.x = damp(j.rightArm.rotation.x, rArmX, k, dt);
		j.rightArm.rotation.y = damp(j.rightArm.rotation.y, 0, k, dt);
		j.rightArm.position.z = damp(j.rightArm.position.z, rightArmReachZ, k, dt);
		j.leftArm.rotation.z = damp(j.leftArm.rotation.z, lArmZ, k, dt);
		j.rightArm.rotation.z = damp(j.rightArm.rotation.z, rArmZ, k, dt);
		if (j.leftElbow && j.rightElbow) {
			j.leftElbow.rotation.x = damp(j.leftElbow.rotation.x, lElbowX, k, dt);
			j.rightElbow.rotation.x = damp(j.rightElbow.rotation.x, rElbowX, k, dt);
		}
		j.leftLeg.rotation.x = damp(j.leftLeg.rotation.x, lLegX, k, dt);
		j.rightLeg.rotation.x = damp(j.rightLeg.rotation.x, rLegX, k, dt);
		if (j.leftKnee && j.rightKnee) {
			j.leftKnee.rotation.x = damp(j.leftKnee.rotation.x, lKneeX, k, dt);
			j.rightKnee.rotation.x = damp(j.rightKnee.rotation.x, rKneeX, k, dt);
		}

		// 背中のスカーフ尻尾を移動速度・落下に連動してなびかせる
		if (j.scarfTailLeft && j.scarfTailRight) {
			const moveRate = Math.min(1, Math.abs(this.physics.vx) / CONFIG.PLAYER.MOVE_SPEED);
			const airLift = !this.physics.grounded ? Math.max(-0.35, Math.min(0.45, -this.physics.vy * 0.04)) : 0;
			const flutter = Math.sin(this._animTime * (6 + moveRate * 12)) * (0.06 + moveRate * 0.14);
			const baseLift = 0.1 + moveRate * 0.38 + airLift;
			j.scarfTailLeft.rotation.x = damp(j.scarfTailLeft.rotation.x, baseLift + flutter, 12, dt);
			j.scarfTailRight.rotation.x = damp(j.scarfTailRight.rotation.x, baseLift - flutter, 12, dt);
		}
	}

	_syncTransform() {
		this.root.position.set(this.physics.x, this.physics.y, this.physics.z);

		// 足元着地ターゲットリングを真下の足場表面に投影
		const groundBelow = this.physics.groundBelow;
		if (!groundBelow) {
			this._landingIndicator.group.visible = false;
			return;
		}

		this._landingIndicator.group.visible = true;
		const heightAbove = Math.max(0, this.physics.y - groundBelow.surfaceY);
		this._landingIndicator.group.position.set(
			this.physics.x,
			groundBelow.surfaceY + 0.02,
			this.physics.z
		);
		this._landingIndicator.group.rotation.z = groundBelow.slopeAngle;

		// 空中に上がるほどリングを目立たせ、影を薄くして高度感を伝える
		const scale = Math.max(0.55, 1.0 - heightAbove * 0.08);
		this._landingIndicator.shadowDisc.scale.setScalar(scale);
		this._landingIndicator.shadowMat.opacity = Math.max(0.14, 0.45 - heightAbove * 0.06);

		const ringVisibleFactor = this.physics.grounded ? 0.32 : 0.9;
		this._landingIndicator.ringMat.opacity = ringVisibleFactor;
		const ringScale = this.physics.grounded ? 0.92 : 1.05 + Math.sin(this._animTime * 8) * 0.06;
		this._landingIndicator.ring.scale.setScalar(ringScale);
	}

	dispose() {
		this.scene.remove(this.root);
		this.scene.remove(this._landingIndicator.group);
		for (const geo of this._disposables.geometries) {
			geo.dispose();
		}
		for (const mat of this._disposables.materials) {
			mat.dispose();
		}
		this._disposables.geometries.length = 0;
		this._disposables.materials.length = 0;
	}
}
