import * as THREE from 'three';
import { CONFIG, getLoopDifficulty, sampleRandomizedInterval } from './config.js';
import { buildOverlordBossModel } from './graphics/modelBuilder.js';

const DEFEAT_PILLAR_FALL_TIME = 2.4;
const DEFEAT_COLLAPSE_TIME = 4.4;
const DEFEAT_BOSS_FALL_TIME = 5.45;
const DEFEAT_BOSS_GONE_Y = -16.0;
const DEFEAT_TOTAL_DURATION = 9.6;

/**
 * ボスのスイッチ（リベットノード）接触・衝撃波・迫撃弾のインタラクションを判定する純粋関数
 */
export function checkBossInteractions(bossState, projectiles, playerPhysics) {
	if (!bossState || bossState.defeated) {
		return {
			activatedNodes: [],
			hitPlayer: false,
			jumpedOverWave: false,
			bossDefeatedNow: false
		};
	}

	const px = playerPhysics.x;
	const py = playerPhysics.y;
	const pCenterY = py + CONFIG.PLAYER.HEIGHT * 0.45;
	const pr = CONFIG.PLAYER.RADIUS * 0.85;
	const invincible = (playerPhysics.invincibleTimer || 0) > 0;

	const activatedNodes = [];
	let bossDefeatedNow = false;

	// 1. オーバーロードノード接触判定（未解放・非表示中のノードは作動しない）
	for (const node of bossState.nodes) {
		if (node.triggered || node.unlocked === false) {
			continue;
		}
		if (Math.abs(px - node.x) <= 0.95 && Math.abs(py - node.y) <= 1.25) {
			node.triggered = true;
			bossState.hp = Math.max(0, bossState.hp - 1);
			bossState.staggerTimer = 1.05;
			activatedNodes.push(node);

			if (bossState.hp <= 0) {
				bossState.defeated = true;
				bossState.floorsCollapsed = false;
				bossState.pillarsDetached = false;
				bossState.bossFallStarted = false;
				bossState.defeatExposure = 0;
				bossState.defeatTimer = DEFEAT_TOTAL_DURATION;
				bossDefeatedNow = true;
				break;
			}
		}
	}

	// ボス撃破シーケンス中は無敵（理不尽な相打ちミスを防止）
	if (bossState.defeated) {
		return {
			activatedNodes,
			hitPlayer: false,
			jumpedOverWave: false,
			bossDefeatedNow
		};
	}

	let hitPlayer = false;
	let jumpedOverWave = false;

	// 2a. ボス本体との直接衝突判定（撃破演出中・無敵中を除く）
	if (!invincible && Number.isFinite(bossState.x) && Number.isFinite(bossState.y)) {
		const dxBoss = Math.abs(px - bossState.x);
		const pBottom = py;
		const pTop = pBottom + 1.45;
		if (dxBoss < 1.55 && pBottom < bossState.y + 3.45 && pTop > bossState.y + 0.1) {
			hitPlayer = true;
		}
	}

	// 2b. 衝撃波・迫撃弾との判定
	for (const proj of projectiles) {
		if (!proj.alive) {
			continue;
		}
		if (proj.type === 'mortar' && proj.phase === 'telegraph') {
			continue;
		}

		const dist = Math.hypot(px - proj.x, pCenterY - proj.y);
		if (!invincible && dist < (proj.radius || 0.42) + pr) {
			hitPlayer = true;
		}

		if (
			proj.type === 'shockwave' &&
			!proj.jumpedOver &&
			!playerPhysics.grounded &&
			!playerPhysics.onLadder
		) {
			const dx = Math.abs(px - proj.x);
			const dy = py - proj.y;
			if (dx < 0.72 && dy > 0.1 && dy < 2.2) {
				proj.jumpedOver = true;
				jumpedOverWave = true;
			}
		}
	}

	return {
		activatedNodes,
		hitPlayer,
		jumpedOverWave,
		bossDefeatedNow
	};
}

/**
 * ボス弾（衝撃波・迫撃落下弾）の1ステップ物理更新（純粋関数）
 */
export function stepBossProjectiles(projectiles, arenaFloorY, bounds, dt) {
	const impacts = [];
	for (const proj of projectiles) {
		if (!proj.alive) {
			continue;
		}
		if (proj.type === 'shockwave') {
			proj.x += proj.vx * dt;
			proj.spin += dt * 10;
			if (proj.x < bounds.xMin - 1 || proj.x > bounds.xMax + 1) {
				proj.alive = false;
			}
		} else if (proj.type === 'mortar') {
			if (proj.phase === 'telegraph') {
				proj.timer -= dt;
				if (proj.timer <= 0) {
					proj.phase = 'falling';
					proj.vy = -4.0;
				}
			} else {
				proj.vy = Math.max(-18.0, proj.vy - 20.0 * dt);
				proj.y += proj.vy * dt;
				if (proj.y <= arenaFloorY + 0.35) {
					proj.alive = false;
					impacts.push({ x: proj.x, y: arenaFloorY });
				}
			}
		}
	}
	return impacts;
}

/**
 * STAGE 3 ボス「5階鉄骨掴み揺らし」ギミックのフェーズと振動蓄積判定を進める純粋関数
 * @param {object} bossState
 * @param {object} playerPhysics
 * @param {number} dt
 * @param {() => number} [rng]
 * @returns {{ quakeWindupNow: boolean, quakeIntensity: number, shakeOffPlayer: boolean }}
 */
export function stepBossQuakeState(bossState, playerPhysics, dt, rng = Math.random) {
	if (!bossState || bossState.defeated) {
		return { quakeWindupNow: false, quakeIntensity: 0, shakeOffPlayer: false };
	}

	let quakeWindupNow = false;
	let quakeIntensity = 0;
	let shakeOffPlayer = false;

	if (bossState.quakeState === 'windup') {
		bossState.quakeTimer -= dt;
		quakeIntensity = 0.22;
		if (bossState.quakeTimer <= 0) {
			bossState.quakeState = 'shaking';
			const minD = CONFIG.BOSS.QUAKE_DURATION_MIN;
			const maxD = CONFIG.BOSS.QUAKE_DURATION_MAX;
			bossState.quakeTimer = minD + rng() * (maxD - minD);
			bossState.quakeExposure = 0;
			bossState.shakenOffThisCycle = false;
		}
		return { quakeWindupNow, quakeIntensity, shakeOffPlayer };
	}

	if (bossState.quakeState === 'shaking') {
		quakeIntensity = 1.0;
		// 床への接地だけでなく、梯子を上っている/掴まっている最中も同様に振動を受ける（ジャンプ中のみ回避）
		const exposedToFloor = Boolean(playerPhysics.grounded || playerPhysics.onLadder);
		if (exposedToFloor) {
			bossState.quakeExposure = (bossState.quakeExposure || 0) + dt;
		} else {
			// ジャンプして空中に浮くことで振動蓄積を回避・リセット寄りへ減衰させる
			bossState.quakeExposure = Math.max(0, (bossState.quakeExposure || 0) - dt * 1.6);
		}

		if (
			bossState.quakeExposure >= CONFIG.BOSS.QUAKE_EXPOSURE_LIMIT &&
			(playerPhysics.y || 0) > 0.8
		) {
			// 下の階へ振り落とされたタイミングで蓄積カウントを即座にクリアする
			bossState.quakeExposure = 0;
			bossState.shakenOffThisCycle = true;
			shakeOffPlayer = true;
		}

		bossState.quakeTimer -= dt;
		if (bossState.quakeTimer <= 0) {
			bossState.quakeState = 'idle';
			bossState.quakeExposure = 0;
			const intervalScale = bossState.intervalScale ?? 1;
			const minC = CONFIG.BOSS.QUAKE_COOLDOWN_MIN * intervalScale;
			const maxC = CONFIG.BOSS.QUAKE_COOLDOWN_MAX * intervalScale;
			bossState.quakeCooldown = minC + rng() * (maxC - minC);
		}
		return { quakeWindupNow, quakeIntensity, shakeOffPlayer };
	}

	// idle 中：不定期の鉄骨揺らしクールダウンを計測
	bossState.quakeCooldown -= dt;
	if (bossState.quakeCooldown <= 0) {
		bossState.quakeState = 'windup';
		bossState.quakeTimer = CONFIG.BOSS.QUAKE_WINDUP_TIME;
		bossState.quakeExposure = 0;
		bossState.shakenOffThisCycle = false;
		quakeWindupNow = true;
	}

	return { quakeWindupNow, quakeIntensity, shakeOffPlayer };
}

/**
 * STAGE 3 最終ボス「OVERLORD MK-III」の3Dモデル・攻撃パターン・ノード破壊演出を管理するクラス
 */
export class BossManager {
	/**
	 * @param {THREE.Scene} scene
	 * @param {() => number} [rng]
	 */
	constructor(scene, rng = Math.random) {
		this.scene = scene;
		this._rng = typeof rng === 'function' ? rng : Math.random;
		this.group = new THREE.Group();
		this.scene.add(this.group);

		this._geometries = [];
		this._materials = [];
		this._active = false;
		this._elapsed = 0;

		this.state = null;
		this._projectiles = [];
		this._waveTimer = 2.0;
		this._mortarTimer = 2.6;
		this._waveDirToggle = 1;
		this._tireTimer = 1.6;
		this._tireHandToggle = 1;
		this._tireAnimTimer = 0;
		this._tireAnimSide = 1;
		this._bounds = { xMin: -15.5, xMax: 15.5 };
		this._arenaFloorY = 17.6;
		this._loopScaling = getLoopDifficulty(1);

		this._model = null;
		this._nodeVisuals = [];
		this._bridgePieces = [];
		this._defeatElapsed = 0;
		this._defeatBossPhys = null;
		this._beamLine = null;
		this._beamTimer = 0;
	}

	_geo(g) {
		this._geometries.push(g);
		return g;
	}

	_mat(m) {
		this._materials.push(m);
		return m;
	}

	get isActive() {
		return this._active;
	}

	load(bossDef, bounds, loopScaling = null) {
		this.clear();
		if (!bossDef) {
			return;
		}
		this.group.visible = true;
		this._active = true;
		this._elapsed = 0;
		this._defeatElapsed = 0;
		this._bounds = bounds || { xMin: -15.5, xMax: 15.5 };
		this._arenaFloorY = bossDef.arenaFloorY ?? 17.6;
		this._loopScaling = loopScaling || getLoopDifficulty(1);

		this.state = {
			x: bossDef.x ?? 0,
			y: bossDef.y ?? 19.2,
			z: bossDef.z ?? -1.35,
			hp: CONFIG.BOSS.MAX_HP,
			maxHp: CONFIG.BOSS.MAX_HP,
			engaged: false,
			staggerTimer: 0,
			defeated: false,
			floorsCollapsed: false,
			pillarsDetached: false,
			bossFallStarted: false,
			defeatExposure: 0,
			defeatTimer: 0,
			quakeState: 'idle',
			quakeTimer: 0,
			intervalScale: this._loopScaling.intervalScale,
			quakeCooldown: 6.5 * this._loopScaling.intervalScale,
			quakeExposure: 0,
			shakenOffThisCycle: false,
			nodes: (bossDef.nodes || []).map((n) => ({
				...n,
				unlocked: n.unlocked !== false,
				triggered: false
			}))
		};
		this._tireTimer = sampleRandomizedInterval(1.1, 2.2, this._loopScaling.intervalScale, this._rng, 0, 0);
		this._waveTimer = sampleRandomizedInterval(1.4, 2.4, this._loopScaling.intervalScale, this._rng, 0, 0);
		this._mortarTimer = sampleRandomizedInterval(2.0, 3.1, this._loopScaling.intervalScale, this._rng, 0, 0);
		this._tireHandToggle = 1;
		this._tireAnimTimer = 0;

		this._buildBossModel();
		this._buildNodes();
	}

	_buildBossModel() {
		const { x, y, z } = this.state;
		const tracker = {
			geo: (g) => this._geo(g),
			mat: (m) => this._mat(m)
		};
		const model = buildOverlordBossModel(tracker);
		model.root.position.set(x, y, z);
		this.group.add(model.root);
		this._model = model;

		const chromeMat = this._mat(new THREE.MeshStandardMaterial({
			color: 0xdbeafe,
			metalness: 0.94,
			roughness: 0.16
		}));
		const makeMesh = (g, m) => {
			const mesh = new THREE.Mesh(g, m);
			mesh.castShadow = true;
			mesh.receiveShadow = true;
			return mesh;
		};

		// ボスの足元を支える分離式・金属鉄骨ブリッジ（全リベット解除時に多パーツが連鎖破断して下層床でバウンドしながら崩落する）
		const bridgeBeamMat = this._mat(new THREE.MeshStandardMaterial({
			color: 0x64748b,
			metalness: 0.88,
			roughness: 0.24
		}));
		const braceSteelMat = this._mat(new THREE.MeshStandardMaterial({
			color: 0x94a3b8,
			metalness: 0.9,
			roughness: 0.22
		}));
		const rivetBoltMat = this._mat(new THREE.MeshStandardMaterial({
			color: 0xf59e0b,
			metalness: 0.78,
			roughness: 0.3
		}));
		const pieceSpecs = [
			// メイン水平桁（6パーツ：中央から外側へ順に破断）
			{ pos: [-0.85, this._arenaFloorY - 0.14, z], rot: [0, 0, 0], size: [1.65, 0.3, 2.25], vx: -1.6, vy: 1.4, vz: 0.55, vrx: 2.2, vry: -1.1, vrz: 3.6, delay: 0.0, restitution: 0.44, mat: bridgeBeamMat },
			{ pos: [0.85, this._arenaFloorY - 0.14, z], rot: [0, 0, 0], size: [1.65, 0.3, 2.25], vx: 1.7, vy: 1.5, vz: -0.45, vrx: -2.0, vry: 1.2, vrz: -3.5, delay: 0.03, restitution: 0.42, mat: bridgeBeamMat },
			{ pos: [-2.45, this._arenaFloorY - 0.14, z], rot: [0, 0, 0], size: [1.6, 0.3, 2.25], vx: -3.1, vy: 2.1, vz: 0.85, vrx: 1.8, vry: 1.5, vrz: 4.1, delay: 0.09, restitution: 0.46, mat: bridgeBeamMat },
			{ pos: [2.45, this._arenaFloorY - 0.14, z], rot: [0, 0, 0], size: [1.6, 0.3, 2.25], vx: 3.0, vy: 1.9, vz: 0.75, vrx: -1.7, vry: -1.4, vrz: -4.2, delay: 0.11, restitution: 0.45, mat: bridgeBeamMat },
			{ pos: [-1.75, this._arenaFloorY - 0.54, z], rot: [0, 0, 0], size: [2.4, 0.24, 1.45], vx: -2.2, vy: 0.2, vz: 1.2, vrx: 2.8, vry: 0.9, vrz: 4.8, delay: 0.06, restitution: 0.38, mat: bridgeBeamMat },
			{ pos: [1.75, this._arenaFloorY - 0.54, z], rot: [0, 0, 0], size: [2.4, 0.24, 1.45], vx: 2.3, vy: 0.3, vz: -1.0, vrx: -2.9, vry: -0.8, vrz: -4.6, delay: 0.08, restitution: 0.38, mat: bridgeBeamMat },
			// クロスブレース斜材（4パーツ）
			{ pos: [-1.2, this._arenaFloorY - 0.38, z + 0.75], rot: [0, 0, 0.48], size: [1.9, 0.14, 0.18], vx: -1.2, vy: 2.6, vz: 1.8, vrx: 3.5, vry: 2.2, vrz: 5.2, delay: 0.14, restitution: 0.5, mat: braceSteelMat },
			{ pos: [1.2, this._arenaFloorY - 0.38, z + 0.75], rot: [0, 0, -0.48], size: [1.9, 0.14, 0.18], vx: 1.3, vy: 2.5, vz: 1.9, vrx: -3.2, vry: -2.1, vrz: -5.1, delay: 0.15, restitution: 0.5, mat: braceSteelMat },
			{ pos: [-2.3, this._arenaFloorY - 0.38, z - 0.7], rot: [0, 0, -0.45], size: [1.7, 0.14, 0.18], vx: -3.6, vy: 1.6, vz: -1.3, vrx: 2.6, vry: -2.5, vrz: 4.4, delay: 0.18, restitution: 0.46, mat: braceSteelMat },
			{ pos: [2.3, this._arenaFloorY - 0.38, z - 0.7], rot: [0, 0, 0.45], size: [1.7, 0.14, 0.18], vx: 3.5, vy: 1.7, vz: -1.4, vrx: -2.7, vry: 2.4, vrz: -4.5, delay: 0.2, restitution: 0.46, mat: braceSteelMat },
			// リベットガセット＆ボルト金具（6パーツ：先行して勢いよく弾け飛ぶ）
			{ pos: [-3.15, this._arenaFloorY - 0.15, z + 0.85], rot: [0, 0, 0], size: [0.36, 0.32, 0.36], vx: -4.8, vy: 4.2, vz: 2.1, vrx: 6.2, vry: 4.0, vrz: 7.4, delay: 0.0, restitution: 0.58, mat: rivetBoltMat },
			{ pos: [3.15, this._arenaFloorY - 0.15, z + 0.85], rot: [0, 0, 0], size: [0.36, 0.32, 0.36], vx: 4.9, vy: 4.1, vz: 2.0, vrx: -6.1, vry: -4.2, vrz: -7.5, delay: 0.02, restitution: 0.58, mat: rivetBoltMat },
			{ pos: [-1.55, this._arenaFloorY - 0.18, z + 1.05], rot: [0, 0, 0], size: [0.3, 0.28, 0.3], vx: -2.4, vy: 5.0, vz: 2.6, vrx: 7.0, vry: -5.1, vrz: 8.2, delay: 0.04, restitution: 0.55, mat: rivetBoltMat },
			{ pos: [1.55, this._arenaFloorY - 0.18, z + 1.05], rot: [0, 0, 0], size: [0.3, 0.28, 0.3], vx: 2.5, vy: 4.8, vz: 2.5, vrx: -7.2, vry: 5.0, vrz: -8.0, delay: 0.05, restitution: 0.55, mat: rivetBoltMat },
			{ pos: [-0.2, this._arenaFloorY - 0.3, z + 0.95], rot: [0, 0, 0], size: [0.42, 0.24, 0.34], vx: -0.9, vy: 3.7, vz: 2.8, vrx: 5.5, vry: 3.8, vrz: 6.1, delay: 0.01, restitution: 0.52, mat: chromeMat },
			{ pos: [0.2, this._arenaFloorY - 0.3, z + 0.95], rot: [0, 0, 0], size: [0.42, 0.24, 0.34], vx: 1.0, vy: 3.9, vz: 2.9, vrx: -5.6, vry: -3.9, vrz: -6.3, delay: 0.02, restitution: 0.52, mat: chromeMat }
		];
		for (const spec of pieceSpecs) {
			const mesh = makeMesh(this._geo(new THREE.BoxGeometry(spec.size[0], spec.size[1], spec.size[2])), spec.mat);
			mesh.position.set(spec.pos[0], spec.pos[1], spec.pos[2]);
			mesh.rotation.set(spec.rot[0], spec.rot[1], spec.rot[2]);
			this.group.add(mesh);
			this._bridgePieces.push({
				mesh,
				basePos: spec.pos,
				baseRot: spec.rot,
				halfH: spec.size[1] * 0.5,
				x: spec.pos[0],
				y: spec.pos[1],
				z: spec.pos[2],
				vx: spec.vx,
				vy: spec.vy,
				vz: spec.vz,
				initVx: spec.vx,
				initVy: spec.vy,
				initVz: spec.vz,
				rx: spec.rot[0],
				ry: spec.rot[1],
				rz: spec.rot[2],
				vrx: spec.vrx,
				vry: spec.vry,
				vrz: spec.vrz,
				initVrx: spec.vrx,
				initVry: spec.vry,
				initVrz: spec.vrz,
				delay: spec.delay,
				restitution: spec.restitution,
				bouncedDecks: new Set()
			});
		}
		this._resetCollapsePhysics();
	}

	_buildNodes() {
		const baseMat = this._mat(new THREE.MeshStandardMaterial({
			color: 0x1e293b,
			metalness: 0.85,
			roughness: 0.3
		}));
		const collarMat = this._mat(new THREE.MeshStandardMaterial({
			color: 0xd97706,
			metalness: 0.72,
			roughness: 0.32
		}));

		for (const node of this.state.nodes) {
			const group = new THREE.Group();
			group.position.set(node.x, node.y, 0);

			// 鉄骨ロック固定フランジ座金
			const pad = new THREE.Mesh(this._geo(new THREE.CylinderGeometry(0.68, 0.82, 0.14, 16)), baseMat);
			pad.position.y = 0.07;
			group.add(pad);

			const collar = new THREE.Mesh(this._geo(new THREE.TorusGeometry(0.56, 0.055, 8, 22)), collarMat);
			collar.rotation.x = Math.PI * 0.5;
			collar.position.y = 0.14;
			group.add(collar);

			// 黄金の大径構造リベットピン（踏んで抜き落とすターゲット）
			const mat = this._mat(new THREE.MeshStandardMaterial({
				color: 0xfbbf24,
				emissive: 0xd97706,
				emissiveIntensity: 1.35,
				metalness: 0.65,
				roughness: 0.25
			}));
			const button = new THREE.Mesh(this._geo(new THREE.CylinderGeometry(0.42, 0.44, 0.3, 14)), mat);
			button.position.y = 0.26;
			group.add(button);

			// 頭上に浮かぶ回転ガイドリング（ロック解除前の視認性アイコン）
			const beacon = new THREE.Mesh(this._geo(new THREE.ConeGeometry(0.22, 0.38, 6)), mat);
			beacon.rotation.z = Math.PI;
			beacon.position.y = 1.08;
			group.add(beacon);

			const ring = new THREE.Mesh(this._geo(new THREE.TorusGeometry(0.6, 0.05, 8, 22)), mat);
			ring.rotation.x = Math.PI * 0.5;
			ring.position.y = 0.36;
			group.add(ring);

			group.visible = node.unlocked !== false;
			this.group.add(group);
			this._nodeVisuals.push({ node, group, button, beacon, ring, mat, unlockAnim: 0 });
		}
	}

	/**
	 * 非表示ロックされていたノード（中央オーバーロードノード等）を出現・有効化する
	 * @param {string} nodeId
	 * @returns {boolean}
	 */
	unlockNode(nodeId) {
		if (!this.state) {
			return false;
		}
		const target = this.state.nodes.find((n) => n.id === nodeId);
		if (!target || target.unlocked !== false) {
			return false;
		}
		target.unlocked = true;
		const nv = this._nodeVisuals.find((v) => v.node === target);
		if (nv) {
			nv.group.visible = true;
			nv.unlockAnim = 0.45;
		}
		return true;
	}

	/**
	 * 昇降する上段デッキ等に連動してノード3D表示の可視状態・Y座標を同期する
	 * @param {string} nodeId
	 * @param {{ visible?: boolean, y?: number }} opts
	 */
	setNodeVisualTransform(nodeId, opts = {}) {
		const nv = this._nodeVisuals.find((v) => v.node.id === nodeId);
		if (!nv) {
			return;
		}
		if (typeof opts.visible === 'boolean') {
			nv.group.visible = opts.visible;
		}
		if (Number.isFinite(opts.y)) {
			nv.group.position.y = opts.y;
		}
	}

	_spawnProjectileMesh(proj) {
		if (proj.type === 'shockwave') {
			const mat = this._mat(new THREE.MeshBasicMaterial({
				color: 0xff5400,
				transparent: true,
				opacity: 0.9
			}));
			const mesh = new THREE.Mesh(this._geo(new THREE.TorusGeometry(0.42, 0.14, 10, 18)), mat);
			mesh.position.set(proj.x, proj.y, 0);
			this.group.add(mesh);
			proj.mesh = mesh;
			proj.mat = mat;
		} else {
			const shellMat = this._mat(new THREE.MeshStandardMaterial({
				color: 0xff9f1c,
				emissive: 0xff3b00,
				emissiveIntensity: 1.6
			}));
			const mesh = new THREE.Mesh(this._geo(new THREE.SphereGeometry(0.38, 12, 10)), shellMat);
			mesh.visible = false;
			this.group.add(mesh);
			proj.mesh = mesh;

			const retMat = this._mat(new THREE.MeshBasicMaterial({
				color: 0xff3b30,
				transparent: true,
				opacity: 0.65,
				side: THREE.DoubleSide,
				depthWrite: false
			}));
			// 縦ビーム棒ではなく、床面の着弾予測ターゲットリングで示す
			const reticle = new THREE.Mesh(this._geo(new THREE.RingGeometry(0.32, 0.58, 22)), retMat);
			reticle.rotation.x = -Math.PI * 0.5;
			reticle.position.set(proj.x, this._arenaFloorY + 0.04, 0);
			this.group.add(reticle);
			proj.reticle = reticle;
			proj.retMat = retMat;
		}
	}

	_fireShockwave() {
		this._waveDirToggle *= -1;
		const dir = this._waveDirToggle;
		const speedBonus = (CONFIG.BOSS.MAX_HP - this.state.hp) * 0.9;
		const speedScale = this._loopScaling?.speedScale ?? 1;
		const proj = {
			type: 'shockwave',
			x: this.state.x + dir * 1.4,
			y: this._arenaFloorY + 0.45,
			vx: dir * (CONFIG.BOSS.SHOCKWAVE_SPEED + speedBonus) * speedScale,
			vy: 0,
			radius: 0.44,
			spin: 0,
			jumpedOver: false,
			alive: true
		};
		this._spawnProjectileMesh(proj);
		this._projectiles.push(proj);
	}

	_fireMortar(playerPhysics) {
		const targetX = Math.max(this._bounds.xMin + 1.5, Math.min(this._bounds.xMax - 1.5, playerPhysics.x));
		const intervalScale = this._loopScaling?.intervalScale ?? 1;
		const telegraphTime = Math.max(0.55, CONFIG.BOSS.MORTAR_TELEGRAPH_TIME * Math.sqrt(intervalScale));
		const proj = {
			type: 'mortar',
			phase: 'telegraph',
			timer: telegraphTime,
			x: targetX,
			y: this._arenaFloorY + 8.6,
			vy: 0,
			radius: 0.4,
			alive: true
		};
		this._spawnProjectileMesh(proj);
		this._projectiles.push(proj);
	}

	_resetCollapsePhysics() {
		if (this.state) {
			this._defeatBossPhys = {
				x: this.state.x,
				y: this.state.y,
				z: this.state.z,
				vx: 0.45,
				vy: 0.6,
				rotZ: 0,
				rotX: 0,
				vRotZ: 7.4,
				vRotX: 1.2,
				bouncedDecks: new Set()
			};
		}
		for (const p of this._bridgePieces) {
			p.x = p.basePos[0];
			p.y = p.basePos[1];
			p.z = p.basePos[2];
			p.vx = p.initVx;
			p.vy = p.initVy;
			p.vz = p.initVz;
			p.rx = p.baseRot[0];
			p.ry = p.baseRot[1];
			p.rz = p.baseRot[2];
			p.vrx = p.initVrx;
			p.vry = p.initVry;
			p.vrz = p.initVrz;
			p.bouncedDecks.clear();
			p.mesh.position.set(p.x, p.y, p.z);
			p.mesh.rotation.set(p.rx, p.ry, p.rz);
		}
	}

	reset() {
		if (!this.state) {
			return;
		}
		this.state.hp = CONFIG.BOSS.MAX_HP;
		this.state.engaged = false;
		this.state.staggerTimer = 0;
		this.state.defeated = false;
		this.state.floorsCollapsed = false;
		this.state.pillarsDetached = false;
		this.state.bossFallStarted = false;
		this.state.defeatExposure = 0;
		this.state.defeatTimer = 0;
		this.state.quakeState = 'idle';
		this.state.quakeTimer = 0;
		const intervalScale = this._loopScaling?.intervalScale ?? 1;
		this.state.quakeCooldown = 6.5 * intervalScale;
		this.state.quakeExposure = 0;
		this.state.shakenOffThisCycle = false;
		this._defeatElapsed = 0;
		this._tireTimer = sampleRandomizedInterval(1.1, 2.2, intervalScale, this._rng, 0, 0);
		this._tireAnimTimer = 0;
		if (this._model) {
			this._model.root.position.set(this.state.x, this.state.y, this.state.z);
			this._model.root.rotation.set(0, 0, 0);
			this._model.root.scale.setScalar(1);
			this._model.coreMat.emissive.setHex(0xff2a1f);
		}
		this._resetCollapsePhysics();
		for (const n of this.state.nodes) {
			n.triggered = false;
			n.unlocked = !n.requiresOtherNodes;
		}
		for (const nv of this._nodeVisuals) {
			nv.mat.color.setHex(0xfbbf24);
			nv.mat.emissive.setHex(0xd97706);
			nv.mat.emissiveIntensity = 1.35;
			nv.button.position.y = 0.26;
			nv.beacon.visible = true;
			nv.ring.visible = true;
			nv.unlockAnim = 0;
			nv.group.scale.setScalar(1);
			nv.group.visible = nv.node.unlocked !== false;
		}
		this._clearProjectiles();
		this._waveTimer = sampleRandomizedInterval(1.4, 2.4, intervalScale, this._rng, 0, 0);
		this._mortarTimer = sampleRandomizedInterval(2.0, 3.1, intervalScale, this._rng, 0, 0);
	}

	_clearProjectiles() {
		for (const proj of this._projectiles) {
			if (proj.mesh) {
				this.group.remove(proj.mesh);
			}
			if (proj.reticle) {
				this.group.remove(proj.reticle);
			}
		}
		this._projectiles = [];
	}

	update(playerPhysics, dt) {
		if (!this._active || !this.state) {
			return {
				engaged: false,
				activatedNodes: [],
				hitPlayer: false,
				jumpedOverWave: false,
				bossDefeatedNow: false,
				bossCleared: false,
				collapseTriggeredNow: false,
				floorsCollapsed: false,
				mortarImpacts: [],
				collapseImpacts: [],
				spawnedTire: null,
				quakeState: 'idle',
				quakeWindupNow: false,
				quakeIntensity: 0,
				shakeOffPlayer: false,
				hp: 0,
				maxHp: 3
			};
		}

		this._elapsed += dt;

		// プレイヤーが上部アリーナ付近に到達したらボス戦アクティブ化（HUD表示＋攻撃開始）
		if (!this.state.engaged && playerPhysics.y >= this._arenaFloorY - 3.6) {
			this.state.engaged = true;
		}

		let bossCleared = false;
		if (this.state.defeated) {
			this.state.defeatTimer = Math.max(0, this.state.defeatTimer - dt);
			this._defeatElapsed += dt;
			this._clearProjectiles();

			// 1. 0〜2.4s：大振動＆接地プレイヤー振り落とし判定
			let defeatQuakeIntensity = 0;
			let defeatShakeOffPlayer = false;
			if (this._defeatElapsed < DEFEAT_PILLAR_FALL_TIME) {
				defeatQuakeIntensity = 1.0;
				const exposed = Boolean(playerPhysics.grounded || playerPhysics.onLadder);
				if (exposed) {
					this.state.defeatExposure = (this.state.defeatExposure || 0) + dt;
				} else {
					this.state.defeatExposure = Math.max(0, (this.state.defeatExposure || 0) - dt * 1.6);
				}
				if (this.state.defeatExposure >= CONFIG.BOSS.QUAKE_EXPOSURE_LIMIT && (playerPhysics.y || 0) > 0.8) {
					this.state.defeatExposure = 0;
					defeatShakeOffPlayer = true;
				}
			} else if (this._defeatElapsed < DEFEAT_COLLAPSE_TIME) {
				defeatQuakeIntensity = 0.45;
			}

			// 2. 2.4s：中央2本の支柱が外れて倒れ始める
			let pillarFallTriggeredNow = false;
			if (!this.state.pillarsDetached && this._defeatElapsed >= DEFEAT_PILLAR_FALL_TIME) {
				this.state.pillarsDetached = true;
				pillarFallTriggeredNow = true;
			}

			// 3. 4.4s：支柱完全倒壊後に、姫デッキ以外の全鉄骨がバラバラに崩壊開始
			let collapseTriggeredNow = false;
			if (!this.state.floorsCollapsed && this._defeatElapsed >= DEFEAT_COLLAPSE_TIME) {
				this.state.floorsCollapsed = true;
				collapseTriggeredNow = true;
			}

			// 4. 5.45s：足場を失ったボスが最後に落下開始
			let bossFallStartedNow = false;
			if (!this.state.bossFallStarted && this._defeatElapsed >= DEFEAT_BOSS_FALL_TIME) {
				this.state.bossFallStarted = true;
				bossFallStartedNow = true;
			}

			const collapseImpacts = this._animateBossDefeat(dt);
			const bp = this._defeatBossPhys;
			const bossFallVisible = bp ? bp.y > DEFEAT_BOSS_GONE_Y : (this._defeatElapsed < DEFEAT_BOSS_FALL_TIME + 2.2);
			if (this._defeatElapsed >= DEFEAT_TOTAL_DURATION) {
				bossCleared = true;
			}
			return {
				engaged: true,
				activatedNodes: [],
				hitPlayer: false,
				jumpedOverWave: false,
				bossDefeatedNow: false,
				bossCleared,
				defeatElapsed: this._defeatElapsed,
				pillarFallTriggeredNow,
				collapseTriggeredNow,
				bossFallStartedNow,
				bossFallPos: bp ? { x: bp.x, y: bp.y, z: bp.z } : { x: this.state.x, y: this.state.y, z: this.state.z },
				bossFallVisible,
				defeatQuakeIntensity,
				defeatShakeOffPlayer,
				floorsCollapsed: this.state.floorsCollapsed,
				mortarImpacts: [],
				collapseImpacts,
				spawnedTire: null,
				quakeState: 'idle',
				quakeWindupNow: false,
				quakeIntensity: 0,
				shakeOffPlayer: false,
				hp: 0,
				maxHp: this.state.maxHp
			};
		}

		if (this.state.staggerTimer > 0) {
			this.state.staggerTimer = Math.max(0, this.state.staggerTimer - dt);
		}
		if (this._tireAnimTimer > 0) {
			this._tireAnimTimer = Math.max(0, this._tireAnimTimer - dt);
		}

		// 不定期の「5階鉄骨両手掴み振動」ギミック評価
		const quakeRes = this.state.staggerTimer <= 0
			? stepBossQuakeState(this.state, playerPhysics, dt, this._rng)
			: { quakeWindupNow: false, quakeIntensity: 0, shakeOffPlayer: false };

		const speedScale = this._loopScaling?.speedScale ?? 1;
		const intervalScale = this._loopScaling?.intervalScale ?? 1;
		const fastBonus = this._loopScaling?.fastChanceBonus ?? 0;

		// 左右の手を使って左右方向へタイヤを投げて転がす攻撃（ステージ開始時から稼働、鉄骨揺らし中は休止）
		let spawnedTire = null;
		if (this.state.quakeState === 'idle' && this.state.staggerTimer <= 0) {
			this._tireTimer -= dt;
			if (this._tireTimer <= 0) {
				this._tireHandToggle *= -1;
				const dir = this._tireHandToggle;
				const baseFastChance = this.state.hp <= 2 ? 0.34 : 0.2;
				const isFast = this._rng() < Math.min(0.85, baseFastChance + fastBonus);
				this._tireAnimSide = dir;
				this._tireAnimTimer = 0.52;
				spawnedTire = {
					kind: 'tire',
					spawnX: this.state.x + dir * 2.1,
					spawnY: this._arenaFloorY + 1.5,
					vx: dir * (isFast ? CONFIG.BOSS.TIRE_THROW_VX * 1.18 : CONFIG.BOSS.TIRE_THROW_VX) * Math.min(1.3, speedScale),
					vy: CONFIG.BOSS.TIRE_THROW_VY,
					dir,
					fast: isFast
				};
				this._tireTimer = sampleRandomizedInterval(
					CONFIG.BOSS.TIRE_INTERVAL_MIN,
					CONFIG.BOSS.TIRE_INTERVAL_MAX,
					intervalScale,
					this._rng,
					0.2,
					1.1
				);
			}
		}

		// アリーナ交戦中の追加攻撃（衝撃波・迫撃弾、鉄骨揺らし中は休止）
		if (this.state.engaged && this.state.staggerTimer <= 0 && this.state.quakeState === 'idle') {
			this._waveTimer -= dt;
			if (this._waveTimer <= 0) {
				this._fireShockwave();
				const hpFactor = this.state.hp === 1 ? 1.55 : (this.state.hp === 2 ? 1.85 : 2.35);
				this._waveTimer = sampleRandomizedInterval(
					hpFactor * 0.72,
					hpFactor * 1.42,
					intervalScale,
					this._rng,
					0.15,
					0.65
				);
			}

			this._mortarTimer -= dt;
			if (this._mortarTimer <= 0) {
				this._fireMortar(playerPhysics);
				const mortarBase = this.state.hp <= 2 ? 2.4 : 3.2;
				this._mortarTimer = sampleRandomizedInterval(
					mortarBase * 0.72,
					mortarBase * 1.42,
					intervalScale,
					this._rng,
					0.15,
					0.7
				);
			}
		}

		const mortarImpacts = stepBossProjectiles(this._projectiles, this._arenaFloorY, this._bounds, dt);
		for (let i = this._projectiles.length - 1; i >= 0; i -= 1) {
			const proj = this._projectiles[i];
			if (!proj.alive) {
				if (proj.mesh) {
					this.group.remove(proj.mesh);
				}
				if (proj.reticle) {
					this.group.remove(proj.reticle);
				}
				this._projectiles.splice(i, 1);
				continue;
			}
			if (proj.type === 'shockwave' && proj.mesh) {
				proj.mesh.position.set(proj.x, proj.y, 0);
				proj.mesh.rotation.z = proj.spin;
			} else if (proj.type === 'mortar') {
				if (proj.phase === 'telegraph') {
					proj.reticle.visible = true;
					proj.retMat.opacity = 0.25 + 0.4 * Math.abs(Math.sin(this._elapsed * 24));
				} else {
					proj.reticle.visible = false;
					proj.mesh.visible = true;
					proj.mesh.position.set(proj.x, proj.y, 0);
				}
			}
		}

		const interact = checkBossInteractions(this.state, this._projectiles, playerPhysics);
		for (const hitNode of interact.activatedNodes) {
			const nv = this._nodeVisuals.find((v) => v.node === hitNode);
			if (nv) {
				nv.mat.color.setHex(0x475569);
				nv.mat.emissive.setHex(0x1e293b);
				nv.mat.emissiveIntensity = 0.15;
				nv.button.position.y = 0.04;
				nv.beacon.visible = false;
				nv.ring.visible = false;
			}
		}

		this._animateBossIdleAndNodes(dt);

		return {
			engaged: this.state.engaged,
			...interact,
			bossCleared,
			collapseTriggeredNow: false,
			floorsCollapsed: false,
			mortarImpacts,
			collapseImpacts: [],
			spawnedTire,
			quakeState: this.state.quakeState,
			quakeWindupNow: quakeRes.quakeWindupNow,
			quakeIntensity: quakeRes.quakeIntensity,
			shakeOffPlayer: quakeRes.shakeOffPlayer,
			hp: this.state.hp,
			maxHp: this.state.maxHp
		};
	}

	_animateBossIdleAndNodes(dt) {
		if (this._model) {
			const m = this._model;
			const stagger = this.state.staggerTimer > 0;
			const qState = this.state.quakeState;

			let bob = Math.sin(this._elapsed * 2.4) * 0.16;
			let bodyX = 0;
			let chassisRotX = 0;

			if (stagger) {
				bob = Math.sin(this._elapsed * 45) * 0.14;
				bodyX = Math.sin(this._elapsed * 52) * 0.18;
			} else if (qState === 'windup') {
				bob = Math.sin(this._elapsed * 14) * 0.1;
				chassisRotX = 0.24;
			} else if (qState === 'shaking') {
				bob = -0.35 + Math.sin(this._elapsed * 46) * 0.24;
				bodyX = Math.cos(this._elapsed * 40) * 0.22;
				chassisRotX = 0.44;
			}

			m.chassis.position.y = 1.9 + bob;
			m.chassis.position.x = bodyX;
			m.chassis.rotation.x = chassisRotX;

			const corePulse = 1.6 + Math.sin(this._elapsed * (stagger || qState === 'shaking' ? 22 : 5)) * 0.8;
			m.coreMat.emissiveIntensity = stagger ? 3.5 : (qState === 'shaking' ? 3.0 : corePulse);
			m.coreRing.rotation.z += dt * (4 - this.state.hp) * 1.4;

			for (let i = 0; i < m.turbines.length; i += 1) {
				m.turbines[i].rotation.z += dt * (i === 0 ? 4.5 : -4.5);
			}
			for (let i = 0; i < m.arms.length; i += 1) {
				const side = i === 0 ? -1 : 1;
				if (stagger) {
					m.arms[i].rotation.x = -0.7 + Math.sin(this._elapsed * 18) * 0.35;
					m.arms[i].rotation.z = 0;
				} else if (qState === 'windup') {
					// 鉄骨を掴みにいく予備動作：両腕を大きく振り上げ
					m.arms[i].rotation.x = -2.05;
					m.arms[i].rotation.z = side * 0.22;
				} else if (qState === 'shaking') {
					// 5階鉄骨を両手でガシッと掴んで上下に揺さぶるポーズ
					m.arms[i].rotation.x = -0.82 + Math.sin(this._elapsed * 44) * 0.28;
					m.arms[i].rotation.z = -side * 0.16;
				} else if (this._tireAnimTimer > 0 && side === this._tireAnimSide) {
					// タイヤ投擲側の腕を大きく振り下ろす
					const p = 1 - this._tireAnimTimer / 0.52;
					m.arms[i].rotation.x = -2.2 + p * 2.0;
					m.arms[i].rotation.z = side * 0.35;
				} else {
					m.arms[i].rotation.x = -0.2 + Math.sin(this._elapsed * 3.1 + side) * 0.25;
					m.arms[i].rotation.z = 0;
				}
			}
		}

		for (const nv of this._nodeVisuals) {
			if (nv.unlockAnim > 0) {
				nv.unlockAnim = Math.max(0, nv.unlockAnim - dt);
				const p = 1 - nv.unlockAnim / 0.45;
				const pop = p < 0.7 ? (0.1 + (p / 0.7) * 1.1) : (1.2 - ((p - 0.7) / 0.3) * 0.2);
				nv.group.scale.setScalar(pop);
			}
			if (!nv.node.triggered && nv.node.unlocked !== false) {
				nv.beacon.rotation.y += dt * 3.2;
				nv.beacon.position.y = 1.05 + Math.sin(this._elapsed * 4 + nv.node.x) * 0.12;
				nv.ring.scale.setScalar(1 + Math.sin(this._elapsed * 5) * 0.08);
			}
		}
	}

	/**
	 * STAGE 3 クライマックス演出タイムライン：
	 * 0〜2.4s：大振動（ボスとブリッジが激しく震える）
	 * 2.4〜4.4s：中央2本の支柱が外れて倒れる間、さらに不安定に揺れ傾く
	 * 4.4〜5.45s：鉄骨が先に崩れ落ち始め、ボスが中央の残骸でジタバタ踏ん張る
	 * 5.45s〜：足場を完全に失ったボスが最後に逆さまになって落下し、下層へ墜落する
	 * @param {number} dt
	 * @returns {Array<{ x: number, y: number, heavy?: boolean }>}
	 */
	_animateBossDefeat(dt) {
		const impacts = [];
		if (!this._model) {
			return impacts;
		}
		const m = this._model;
		const t = this._defeatElapsed;

		// Phase 1〜2（0〜4.4s）：大振動 → 中央支柱倒壊中
		if (t < DEFEAT_COLLAPSE_TIME) {
			const isPillarPhase = t >= DEFEAT_PILLAR_FALL_TIME;
			const intensity = isPillarPhase ? 1.15 : Math.min(1.0, 0.45 + (t / DEFEAT_PILLAR_FALL_TIME) * 0.55);
			const shake = Math.sin(t * 72) * 0.24 * intensity;
			m.root.position.set(this.state.x + shake, this.state.y + Math.abs(Math.cos(t * 54)) * 0.14 * intensity, this.state.z);
			m.root.rotation.z = (isPillarPhase ? Math.sin(t * 28) * 0.14 : Math.sin(t * 36) * 0.08) * intensity;
			m.coreMat.emissive.setHex(0xfef08a);
			m.coreMat.emissiveIntensity = 2.8 + Math.sin(t * 26) * 0.8;
			for (const p of this._bridgePieces) {
				p.mesh.position.set(
					p.basePos[0] + Math.sin(t * 68 + p.basePos[0] * 1.3) * 0.11 * intensity,
					p.basePos[1] + Math.cos(t * 60 + p.basePos[0]) * 0.08 * intensity,
					p.basePos[2]
				);
			}
			for (let i = 0; i < m.arms.length; i += 1) {
				const side = i === 0 ? -1 : 1;
				m.arms[i].rotation.x = -0.6 + Math.sin(t * 20 + side) * 0.45;
			}
			return impacts;
		}

		// Phase 3〜4（4.4s 以降）：まず鉄骨＆ブリッジが崩れ落ち、続いて 5.45s でボスも落下開始
		const ft = t - DEFEAT_COLLAPSE_TIME;
		const grav = 17.5;
		const stepDt = Math.min(0.05, Math.max(0.001, dt));
		const bounceDecks = [
			{ y: 13.8, xMin: -14.2, xMax: 14.2 },
			{ y: 9.2, xMin: -15.2, xMax: 15.2 },
			{ y: 4.6, xMin: -15.2, xMax: 15.2 },
			{ y: 0.0, xMin: -15.5, xMax: 15.5 }
		];

		for (const p of this._bridgePieces) {
			if (ft < p.delay * 1.45) {
				p.mesh.position.set(
					p.basePos[0] + Math.sin(t * 85 + p.basePos[0]) * 0.14,
					p.basePos[1] - (ft / Math.max(0.05, p.delay * 1.45)) * 0.18,
					p.basePos[2]
				);
				p.mesh.rotation.z = p.baseRot[2] + Math.sin(t * 45) * 0.12;
				continue;
			}

			const prevY = p.y;
			p.vy -= grav * stepDt;
			p.x += p.vx * stepDt;
			p.y += p.vy * stepDt;
			p.z += p.vz * stepDt;
			p.rx += p.vrx * stepDt;
			p.ry += p.vry * stepDt;
			p.rz += p.vrz * stepDt;

			for (let di = 0; di < bounceDecks.length; di += 1) {
				const deck = bounceDecks[di];
				if (
					!p.bouncedDecks.has(di) &&
					p.vy < -2.2 &&
					prevY >= deck.y + p.halfH &&
					p.y < deck.y + p.halfH &&
					p.x >= deck.xMin &&
					p.x <= deck.xMax
				) {
					p.bouncedDecks.add(di);
					p.y = deck.y + p.halfH;
					p.vy = Math.abs(p.vy) * p.restitution + 1.4;
					p.vx = p.vx * 0.85 + (p.x >= 0 ? 1.15 : -1.15);
					p.vrz *= -0.78;
					p.vrx += 1.6;
					impacts.push({ x: p.x, y: deck.y, heavy: false });
					break;
				}
			}

			p.mesh.position.set(p.x, p.y, p.z);
			p.mesh.rotation.set(p.rx, p.ry, p.rz);
		}

		// ボスはまだ踏ん張って震えている（4.4〜5.45s）
		if (t < DEFEAT_BOSS_FALL_TIME) {
			const wobble = Math.sin(t * 58) * 0.28;
			m.root.position.set(this.state.x + wobble, this.state.y - 0.15 + Math.abs(Math.sin(t * 42)) * 0.18, this.state.z);
			m.root.rotation.set(0.08, 0, Math.sin(t * 24) * 0.22);
			for (let i = 0; i < m.arms.length; i += 1) {
				const side = i === 0 ? -1 : 1;
				m.arms[i].rotation.x = -1.1 + Math.sin(t * 28 + side) * 0.85;
			}
			return impacts;
		}

		// Phase 4（5.45s 以降）：足場を失ったボス本体の逆さま墜落
		if (!this._defeatBossPhys) {
			this._resetCollapsePhysics();
		}
		const bp = this._defeatBossPhys;
		const prevBossY = bp.y;
		bp.vy -= (grav * 0.88) * stepDt;
		bp.x += bp.vx * stepDt;
		bp.y += bp.vy * stepDt;
		if (bp.rotZ < Math.PI) {
			bp.rotZ = Math.min(Math.PI, bp.rotZ + bp.vRotZ * stepDt);
		}
		bp.rotX = Math.min(0.32, bp.rotX + bp.vRotX * stepDt);

		if (!bp.bouncedDecks.has(0) && bp.vy < -3.5 && prevBossY >= 13.6 && bp.y < 13.6) {
			bp.bouncedDecks.add(0);
			bp.vy = -1.2;
			bp.vx = -1.4;
			bp.vRotZ = 5.2;
			impacts.push({ x: bp.x, y: 13.4, heavy: true });
		}

		m.root.position.set(bp.x, bp.y, bp.z);
		const wobbleZ = bp.rotZ >= Math.PI ? Math.sin(t * 16) * 0.03 : 0;
		m.root.rotation.set(bp.rotX, 0, bp.rotZ + wobbleZ);
		m.chassis.position.x = 0;
		m.chassis.position.y = 1.9;
		m.coreMat.emissive.setHex(0xff5400);
		m.coreMat.emissiveIntensity = 2.4;

		for (let i = 0; i < m.arms.length; i += 1) {
			const side = i === 0 ? -1 : 1;
			m.arms[i].rotation.x = -0.8 + Math.sin(t * 24 + side) * 0.75;
		}

		return impacts;
	}

	clear() {
		this._active = false;
		this.group.visible = true;
		this._clearProjectiles();
		while (this.group.children.length > 0) {
			this.group.remove(this.group.children[0]);
		}
		for (const g of this._geometries) {
			g.dispose();
		}
		for (const m of this._materials) {
			m.dispose();
		}
		this._geometries = [];
		this._materials = [];
		this._nodeVisuals = [];
		this._bridgePieces = [];
		this._defeatElapsed = 0;
		this._defeatBossPhys = null;
		this._model = null;
		this.state = null;
	}

	dispose() {
		this.clear();
		this.scene.remove(this.group);
	}
}
