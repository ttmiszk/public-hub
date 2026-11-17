import * as THREE from 'three';
import { CONFIG, getLoopDifficulty, sampleRandomizedInterval } from './config.js';
import { findSupportingPlatform, getPlatformSurfaceY, isWithinPlatformX } from './collision.js';
import { textureFactory } from './graphics/textureFactory.js';
import { buildFactoryBossModel, buildIronKongModel } from './graphics/modelBuilder.js';

/**
 * 樽1個分の純粋物理ステップ（放物線投擲・着地バウンド・梯子落下・端落下対応）
 * @param {object} barrel
 * @param {object} levelGeometry
 * @param {number} dt
 * @param {() => number} [rng]
 * @param {number} [speedScale]
 * @returns {{ bounced: boolean }}
 */
export function stepBarrelPhysics(barrel, levelGeometry, dt, rng = Math.random, speedScale = 1) {
	const result = { bounced: false };
	if (!barrel.alive) {
		return result;
	}

	const platforms = levelGeometry.platforms || [];
	const ladders = levelGeometry.ladders || [];
	const destroyZones = levelGeometry.barrelDestroyZones || [];
	const deathY = levelGeometry.bounds?.deathY ?? CONFIG.PLAYER.FALL_DEATH_Y;
	const r = barrel.radius;

	// 梯子落下中
	if (barrel.onLadder && barrel.activeLadder) {
		const ladder = barrel.activeLadder;
		barrel.y += barrel.vy * dt;
		barrel.rollAngle += dt * 10.0;

		if (barrel.y - r <= ladder.yBottom) {
			barrel.y = ladder.yBottom + r;
			barrel.vy = 0;
			barrel.onLadder = false;
			barrel.activeLadder = null;
			const support = findSupportingPlatform(barrel.x, barrel.y - r + 0.2, barrel.y - r - 0.05, platforms);
			barrel.currentPlatform = support ? support.platform : null;
			if (barrel.currentPlatform) {
				barrel.vx = _resolveRollVelocity(barrel.currentPlatform, barrel.fast, barrel.vx, speedScale);
			}
			result.bounced = true;
		}
		return result;
	}

	// 足場上を転がる処理
	if (barrel.currentPlatform) {
		const plat = barrel.currentPlatform;
		barrel.vx = _resolveRollVelocity(plat, barrel.fast, barrel.vx, speedScale);
		barrel.x += barrel.vx * dt;
		barrel.rollAngle -= (barrel.vx * dt) / r;

		if (isWithinPlatformX(plat, barrel.x, 0.06)) {
			barrel.y = getPlatformSurfaceY(plat, barrel.x) + r;

			// 梯子真上を通過する際の落下分岐チェック
			for (const ladder of ladders) {
				if (ladder.broken || barrel.checkedLadders.has(ladder.id)) {
					continue;
				}
				if (Math.abs(barrel.x - ladder.x) <= 0.22 && Math.abs((barrel.y - r) - ladder.yTop) <= 0.34) {
					barrel.checkedLadders.add(ladder.id);
					const baseChance = barrel.fast
						? Math.min(0.7, CONFIG.ENEMY.BARREL_LADDER_DROP_CHANCE * 1.38)
						: CONFIG.ENEMY.BARREL_LADDER_DROP_CHANCE;
					const chance = barrel.kind === 'tire'
						? Math.min(0.76, baseChance * 1.55)
						: baseChance;
					if (rng() < chance) {
						barrel.onLadder = true;
						barrel.activeLadder = ladder;
						barrel.currentPlatform = null;
						barrel.x = ladder.x;
						barrel.vx = 0;
						barrel.vy = -5.6;
						return result;
					}
				}
			}
		} else {
			// 足場端を外れた瞬間：下の階を飛び越さないよう水平速度を減衰させて落下開始
			barrel.currentPlatform = null;
			barrel.vx *= CONFIG.ENEMY.BARREL_EDGE_VX_DAMP;
			barrel.canBounceOnLand = true;
		}
	} else {
		// 空中移動（放物線投擲または階層間落下）
		barrel.vy = Math.max(
			-CONFIG.ENEMY.BARREL_MAX_FALL_SPEED,
			barrel.vy - CONFIG.ENEMY.BARREL_GRAVITY * dt
		);
		const prevFootY = barrel.y - r;
		barrel.x += barrel.vx * dt;
		const nextFootY = barrel.y + barrel.vy * dt - r;
		barrel.rollAngle -= (barrel.vx * dt) / r;

		if (barrel.vy <= 0) {
			const support = findSupportingPlatform(barrel.x, prevFootY, nextFootY, platforms, { footMargin: 0.06 });
			if (support) {
				barrel.y = support.surfaceY + r;
				const impactSpeed = Math.abs(barrel.vy);

				if (barrel.canBounceOnLand && impactSpeed >= 5.0) {
					// 着地時に軽く跳ねて勢いを演出（以降は下の階の傾斜向きへ転がる）
					barrel.canBounceOnLand = false;
					barrel.vy = Math.min(CONFIG.ENEMY.BARREL_BOUNCE_VY, impactSpeed * 0.34);
					barrel.vx = _resolveRollVelocity(support.platform, barrel.fast, barrel.vx, speedScale) * 0.72;
					barrel.currentPlatform = null;
					result.bounced = true;
				} else {
					barrel.vy = 0;
					barrel.currentPlatform = support.platform;
					barrel.vx = _resolveRollVelocity(support.platform, barrel.fast, barrel.vx, speedScale);
					if (impactSpeed >= 3.5) {
						result.bounced = true;
					}
				}
			} else {
				barrel.y = nextFootY + r;
			}
		} else {
			barrel.y = nextFootY + r;
		}
	}

	// 燃焼ピットや画面外に到達したら消滅
	for (const zone of destroyZones) {
		if (
			barrel.x >= zone.xMin &&
			barrel.x <= zone.xMax &&
			barrel.y - r <= zone.yMax &&
			barrel.y + r >= zone.yMin
		) {
			barrel.alive = false;
			return result;
		}
	}

	if (barrel.y < deathY) {
		barrel.alive = false;
	}
	return result;
}

function _resolveRollVelocity(platform, isFast, fallbackVx, speedScale = 1) {
	const speed = (isFast ? CONFIG.ENEMY.FAST_BARREL_SPEED : CONFIG.ENEMY.BARREL_SPEED) * speedScale;
	const dy = platform.yEnd - platform.yStart;
	if (Math.abs(dy) > 0.02) {
		return dy < 0 ? speed : -speed;
	}
	if (Math.abs(fallbackVx) > 0.1) {
		return Math.sign(fallbackVx) * speed;
	}
	return -speed;
}

/**
 * プレイヤーと全樽の衝突・飛び越え回避スコアを判定する
 */
export function checkBarrelInteractions(barrels, playerPhysics, hasHammer) {
	const result = {
		hitPlayer: false,
		smashedBarrels: [],
		jumpedOverBarrels: []
	};

	const px = playerPhysics.x;
	const pyMin = playerPhysics.y + 0.22;
	const pyMax = playerPhysics.y + CONFIG.PLAYER.HEIGHT - 0.15;
	const playerAirborne = !playerPhysics.grounded && !playerPhysics.onLadder;
	const hammerActive = Boolean(hasHammer && !playerPhysics.onLadder);
	const facingDir = playerPhysics.facingDir || 1;
	const hX1 = px - facingDir * 0.48;
	const hX2 = px + facingDir * 1.55;
	const hammerMinX = Math.min(hX1, hX2);
	const hammerMaxX = Math.max(hX1, hX2);
	const hammerMinY = playerPhysics.y - 0.25;
	const hammerMaxY = playerPhysics.y + CONFIG.PLAYER.HEIGHT + 0.55;

	for (const barrel of barrels) {
		if (!barrel.alive) {
			continue;
		}

		// 前方ハンマー振り下ろしゾーン：体に触れる前に正面からの樽を確実に粉砕する
		const br = barrel.radius;
		if (
			hammerActive &&
			barrel.x + br >= hammerMinX &&
			barrel.x - br <= hammerMaxX &&
			barrel.y + br >= hammerMinY &&
			barrel.y - br <= hammerMaxY
		) {
			barrel.alive = false;
			result.smashedBarrels.push(barrel);
			continue;
		}

		const clampedY = Math.max(pyMin, Math.min(pyMax, barrel.y));
		const dist = Math.hypot(px - barrel.x, clampedY - barrel.y);
		// 低い天井下でのジャンプ回避でも理不尽にならないよう、見た目より一回りコンパクトな当たり判定にする
		const hitDist = CONFIG.PLAYER.RADIUS * 0.68 + barrel.radius * 0.7;

		if (dist <= hitDist) {
			if (hasHammer) {
				barrel.alive = false;
				result.smashedBarrels.push(barrel);
			} else if (playerPhysics.invincibleTimer <= 0) {
				result.hitPlayer = true;
			}
			continue;
		}

		if (playerAirborne && !barrel.jumpedOver) {
			const dx = Math.abs(px - barrel.x);
			const clearance = playerPhysics.y - (barrel.y + barrel.radius);
			if (
				dx <= CONFIG.ENEMY.JUMP_OVER_RADIUS_X &&
				clearance >= -0.14 &&
				clearance <= CONFIG.ENEMY.JUMP_OVER_MAX_HEIGHT
			) {
				barrel.jumpedOver = true;
				result.jumpedOverBarrels.push(barrel);
			}
		}
	}

	return result;
}

/**
 * STAGE 1 上部に陣取り樽を投げ出す重機ゴリラ型オリジナル敵「IRON KONG」
 */
export class BarrelThrower {
	/**
	 * @param {THREE.Scene} scene
	 * @param {{ x: number, y: number, z?: number, throwDir?: number }} config
	 */
	constructor(scene, config, loopScaling = null, rng = Math.random) {
		this.scene = scene;
		this.x = config.x;
		this.y = config.y;
		this.z = config.z ?? 0;
		this.throwDir = config.throwDir ?? -1;
		this.modelType = config.modelType || 'ironKong';
		this.projectileKind = config.projectileKind || 'barrel';
		this._loopScaling = loopScaling || getLoopDifficulty(1);
		this._rng = typeof rng === 'function' ? rng : Math.random;

		this._timer = 0;
		this._nextInterval = this._sampleInitialInterval();
		this._state = 'IDLE'; // IDLE | WINDUP | THROW
		this._stateTime = 0;
		this._animTime = 0;

		this._disposables = { geometries: [], materials: [] };
		this.root = new THREE.Group();
		this.root.position.set(this.x, this.y, this.z);
		this._parts = this._buildModel();
		this.scene.add(this.root);
	}

	_geo(g) {
		this._disposables.geometries.push(g);
		return g;
	}

	_mat(m) {
		this._disposables.materials.push(m);
		return m;
	}

	_buildModel() {
		const tracker = {
			geo: (g) => this._geo(g),
			mat: (m) => this._mat(m)
		};
		const isFactory = this.modelType === 'factoryBoss';
		const kong = isFactory
			? buildFactoryBossModel(tracker, this.throwDir)
			: buildIronKongModel(tracker, this.throwDir);
		this.root.add(kong.body);

		if (isFactory) {
			const drumBodyMat = this._mat(new THREE.MeshStandardMaterial({
				color: 0xd9480f,
				metalness: 0.65,
				roughness: 0.34
			}));
			const drumCapMat = this._mat(new THREE.MeshStandardMaterial({
				color: 0x334155,
				metalness: 0.85,
				roughness: 0.28
			}));
			const stackGeo = this._geo(new THREE.CylinderGeometry(0.36, 0.36, 0.68, 16));
			for (const [sx, sy, sz] of [
				[1.45, 0.36, -0.38],
				[1.45, 0.36, 0.34],
				[1.45, 0.98, -0.02]
			]) {
				const stack = new THREE.Mesh(stackGeo, [drumBodyMat, drumCapMat, drumCapMat]);
				stack.castShadow = true;
				stack.receiveShadow = true;
				stack.rotation.x = Math.PI * 0.5;
				stack.position.set(sx, sy, sz);
				this.root.add(stack);
			}
		} else {
			const barrelBodyMat = this._mat(new THREE.MeshStandardMaterial({
				map: textureFactory.getBarrelBodyTexture(false),
				metalness: 0.2,
				roughness: 0.68
			}));
			const barrelCapMat = this._mat(new THREE.MeshStandardMaterial({
				map: textureFactory.getBarrelCapTexture(false),
				metalness: 0.25,
				roughness: 0.65
			}));

			// 予備樽の積み上げ
			const stackGeo = this._geo(new THREE.CylinderGeometry(0.36, 0.36, 0.66, 16));
			for (const [sx, sy, sz] of [
				[1.45, 0.36, -0.38],
				[1.45, 0.36, 0.34],
				[1.45, 0.98, -0.02]
			]) {
				const stack = new THREE.Mesh(stackGeo, [barrelBodyMat, barrelCapMat, barrelCapMat]);
				stack.castShadow = true;
				stack.receiveShadow = true;
				stack.rotation.x = Math.PI * 0.5;
				stack.position.set(sx, sy, sz);
				this.root.add(stack);
			}
		}

		return {
			body: kong.body,
			torso: kong.torso,
			leftArm: kong.leftArm,
			rightArm: kong.rightArm,
			heldBarrel: kong.heldBarrel
		};
	}

	_sampleInitialInterval() {
		const intervalScale = this._loopScaling?.intervalScale ?? 1;
		return sampleRandomizedInterval(0.7, 1.8, intervalScale, this._rng, 0, 0);
	}

	_sampleNextThrowInterval() {
		const intervalScale = this._loopScaling?.intervalScale ?? 1;
		return sampleRandomizedInterval(
			CONFIG.ENEMY.BARREL_THROW_INTERVAL_MIN,
			CONFIG.ENEMY.BARREL_THROW_INTERVAL_MAX,
			intervalScale,
			this._rng,
			0.2,
			1.1
		);
	}

	reset() {
		this._timer = 0;
		this._nextInterval = this._sampleInitialInterval();
		this._state = 'IDLE';
		this._stateTime = 0;
		this._parts.heldBarrel.visible = false;
	}

	/**
	 * ボスキャラ（IRON KONG）本体へのプレイヤー接触判定
	 * @param {object} playerPhysics
	 * @returns {boolean}
	 */
	checkPlayerCollision(playerPhysics) {
		if ((playerPhysics.invincibleTimer || 0) > 0) {
			return false;
		}
		const dx = Math.abs(playerPhysics.x - this.x);
		const pBottom = playerPhysics.y;
		const pTop = pBottom + 1.45;
		return dx < 1.0 && pBottom < this.y + 1.95 && pTop > this.y + 0.1;
	}

	/**
	 * 更新し、投擲タイミングに達したら空中放物線用の初速付きスポーン情報を返す
	 */
	update(dt) {
		this._animTime += dt;
		this._stateTime += dt;
		const p = this._parts;
		let spawned = null;
		const intervalScale = this._loopScaling?.intervalScale ?? 1;
		const motionScale = Math.max(0.45, Math.sqrt(intervalScale));
		const windupDuration = 0.42 * motionScale;
		const throwDuration = 0.32 * motionScale;

		if (this._state === 'IDLE') {
			this._timer += dt;
			p.torso.position.y = 0.85 + Math.sin(this._animTime * 4.2) * 0.04;
			p.leftArm.rotation.x = Math.sin(this._animTime * 5) * 0.25;
			p.rightArm.rotation.x = -Math.sin(this._animTime * 5) * 0.25;
			p.heldBarrel.visible = false;

			if (this._timer >= this._nextInterval) {
				this._timer = 0;
				this._state = 'WINDUP';
				this._stateTime = 0;
			}
		} else if (this._state === 'WINDUP') {
			const t = Math.min(1, this._stateTime / windupDuration);
			p.leftArm.rotation.x = -2.45 * t;
			p.rightArm.rotation.x = -2.45 * t;
			p.heldBarrel.visible = true;
			p.heldBarrel.position.set(0, 1.25 + t * 0.7, 0.58 - t * 0.18);

			if (this._stateTime >= windupDuration) {
				this._state = 'THROW';
				this._stateTime = 0;
				p.heldBarrel.visible = false;
				const fastChance = Math.min(0.85, 0.28 + (this._loopScaling?.fastChanceBonus ?? 0));
				const isFast = this._rng() < fastChance;
				const throwSpeedScale = Math.min(1.28, this._loopScaling?.speedScale ?? 1);
				spawned = {
					kind: this.projectileKind,
					spawnX: this.x + this.throwDir * 1.15,
					spawnY: this.y + 1.55,
					vx: this.throwDir * (isFast ? CONFIG.ENEMY.BARREL_THROW_VX * 1.18 : CONFIG.ENEMY.BARREL_THROW_VX) * throwSpeedScale,
					vy: CONFIG.ENEMY.BARREL_THROW_VY,
					dir: this.throwDir,
					fast: isFast
				};
				this._nextInterval = this._sampleNextThrowInterval();
			}
		} else if (this._state === 'THROW') {
			const t = Math.min(1, this._stateTime / throwDuration);
			p.leftArm.rotation.x = -2.45 + t * 2.45;
			p.rightArm.rotation.x = -2.45 + t * 2.45;
			if (this._stateTime >= throwDuration) {
				this._state = 'IDLE';
				this._stateTime = 0;
			}
		}

		return spawned;
	}

	dispose() {
		this.scene.remove(this.root);
		for (const g of this._disposables.geometries) {
			g.dispose();
		}
		for (const m of this._disposables.materials) {
			m.dispose();
		}
		this._disposables.geometries.length = 0;
		this._disposables.materials.length = 0;
	}
}

/**
 * ステージ内の樽障害物を管理・描画するマネージャー
 */
export class BarrelManager {
	/**
	 * @param {THREE.Scene} scene
	 */
	constructor(scene) {
		this.scene = scene;
		this.barrels = [];
		this._speedScale = 1.0;

		const r = CONFIG.ENEMY.BARREL_RADIUS;
		this._sharedGeo = {
			// 中央が膨らんだ樽胴（3パーツ組み）＋突出フープ＋凹み側面キャップ
			midDrum: new THREE.CylinderGeometry(r * 1.02, r * 1.02, 0.38, 20),
			endDrum: new THREE.CylinderGeometry(r * 0.96, r * 1.0, 0.18, 20),
			capDisc: new THREE.CircleGeometry(r * 0.9, 20),
			rimTorus: new THREE.TorusGeometry(r * 0.94, 0.045, 8, 20),
			hoop: new THREE.CylinderGeometry(r * 1.05, r * 1.05, 0.065, 20),
			// STAGE 2 用鋼鉄ドラム缶（溶接ビードリブ＋危険警戒ストライプ＋側面栓）
			drumShell: new THREE.CylinderGeometry(r * 0.99, r * 0.99, 0.72, 20),
			drumStripe: new THREE.CylinderGeometry(r * 1.005, r * 1.005, 0.16, 20),
			drumRib: new THREE.TorusGeometry(r * 0.99, 0.036, 8, 20),
			drumCap: new THREE.CircleGeometry(r * 0.94, 20),
			drumBung: new THREE.CylinderGeometry(0.055, 0.055, 0.06, 8),
			// STAGE 3 用重機タイヤ（暗い背景でも輪郭・回転がくっきり見えるトレッド＋サイドウォール＋ホイール）
			tireRubber: new THREE.TorusGeometry(r * 0.72, r * 0.28, 12, 22),
			tireTread: new THREE.CylinderGeometry(r * 1.0, r * 1.0, 0.34, 18),
			tireSideBand: new THREE.TorusGeometry(r * 0.78, 0.032, 8, 22),
			tireLug: new THREE.BoxGeometry(0.11, 0.09, 0.36),
			tireRim: new THREE.CylinderGeometry(r * 0.56, r * 0.56, 0.38, 14),
			tireHub: new THREE.CylinderGeometry(r * 0.24, r * 0.24, 0.44, 10),
			tireBolt: new THREE.CylinderGeometry(0.036, 0.036, 0.41, 6)
		};

		this._sharedMat = {
			drumSteelMat: new THREE.MeshStandardMaterial({
				color: 0xd9480f,
				metalness: 0.62,
				roughness: 0.34
			}),
			drumFastSteelMat: new THREE.MeshStandardMaterial({
				color: 0x0284c7,
				emissive: 0x0369a1,
				emissiveIntensity: 0.65,
				metalness: 0.72,
				roughness: 0.24
			}),
			drumCapMat: new THREE.MeshStandardMaterial({
				color: 0x334155,
				metalness: 0.82,
				roughness: 0.3
			}),
			drumStripeMat: new THREE.MeshStandardMaterial({
				color: 0xfbbf24,
				emissive: 0x92400e,
				emissiveIntensity: 0.35,
				metalness: 0.45,
				roughness: 0.35
			}),
			drumFastStripeMat: new THREE.MeshStandardMaterial({
				color: 0x67e8f9,
				emissive: 0x22d3ee,
				emissiveIntensity: 1.15,
				metalness: 0.5,
				roughness: 0.22
			}),
			woodBody: new THREE.MeshStandardMaterial({
				map: textureFactory.getBarrelBodyTexture(false),
				metalness: 0.18,
				roughness: 0.68
			}),
			woodCap: new THREE.MeshStandardMaterial({
				map: textureFactory.getBarrelCapTexture(false),
				metalness: 0.22,
				roughness: 0.65
			}),
			fastBody: new THREE.MeshStandardMaterial({
				map: textureFactory.getBarrelBodyTexture(true),
				metalness: 0.55,
				roughness: 0.32,
				emissive: 0x0b6e82,
				emissiveIntensity: 0.45
			}),
			fastCap: new THREE.MeshStandardMaterial({
				map: textureFactory.getBarrelCapTexture(true),
				metalness: 0.6,
				roughness: 0.28,
				emissive: 0x0077b6,
				emissiveIntensity: 0.5
			}),
			ironBand: new THREE.MeshStandardMaterial({
				color: 0x2f3642,
				metalness: 0.88,
				roughness: 0.28
			}),
			fastBand: new THREE.MeshStandardMaterial({
				color: 0x4cc9f0,
				metalness: 0.78,
				roughness: 0.2,
				emissive: 0x00b4d8,
				emissiveIntensity: 0.9
			}),
			tireRubberMat: new THREE.MeshStandardMaterial({
				color: 0x475569,
				metalness: 0.28,
				roughness: 0.48
			}),
			tireLugMat: new THREE.MeshStandardMaterial({
				color: 0x94a3b8,
				metalness: 0.45,
				roughness: 0.4
			}),
			tireRimMat: new THREE.MeshStandardMaterial({
				color: 0xe2e8f0,
				metalness: 0.9,
				roughness: 0.22
			}),
			tireAccentMat: new THREE.MeshStandardMaterial({
				color: 0xff6b35,
				emissive: 0xd9480f,
				emissiveIntensity: 1.05,
				metalness: 0.45,
				roughness: 0.3
			}),
			tireFastAccentMat: new THREE.MeshStandardMaterial({
				color: 0x38bdf8,
				emissive: 0x0ea5e9,
				emissiveIntensity: 1.45,
				metalness: 0.55,
				roughness: 0.22
			})
		};
	}

	spawn(spawnInfo) {
		const r = CONFIG.ENEMY.BARREL_RADIUS;
		const kind = spawnInfo.kind || 'barrel';
		let mesh;
		if (kind === 'tire') {
			mesh = this._createTireMesh(Boolean(spawnInfo.fast));
		} else if (kind === 'drum') {
			mesh = this._createDrumMesh(Boolean(spawnInfo.fast));
		} else {
			mesh = this._createBarrelMesh(Boolean(spawnInfo.fast));
		}
		this.scene.add(mesh);

		const barrel = {
			kind,
			x: spawnInfo.spawnX,
			y: spawnInfo.spawnY,
			z: 0,
			vx: spawnInfo.vx ?? ((spawnInfo.dir ?? -1) * CONFIG.ENEMY.BARREL_THROW_VX),
			vy: spawnInfo.vy ?? CONFIG.ENEMY.BARREL_THROW_VY,
			radius: r,
			fast: Boolean(spawnInfo.fast),
			onLadder: false,
			activeLadder: null,
			currentPlatform: null, // 空中放物線から入り、着地時にバウンドする
			canBounceOnLand: true,
			rollAngle: 0,
			jumpedOver: false,
			alive: true,
			checkedLadders: new Set(),
			mesh
		};

		mesh.position.set(barrel.x, barrel.y, barrel.z);
		this.barrels.push(barrel);
		return barrel;
	}

	_createTireMesh(isFast) {
		const group = new THREE.Group();
		const r = CONFIG.ENEMY.BARREL_RADIUS;
		const accentMat = isFast ? this._sharedMat.tireFastAccentMat : this._sharedMat.tireAccentMat;

		const rubberRing = new THREE.Mesh(this._sharedGeo.tireRubber, this._sharedMat.tireRubberMat);
		rubberRing.castShadow = true;
		rubberRing.receiveShadow = true;
		group.add(rubberRing);

		const treadBand = new THREE.Mesh(this._sharedGeo.tireTread, this._sharedMat.tireRubberMat);
		treadBand.rotation.x = Math.PI * 0.5;
		treadBand.castShadow = true;
		group.add(treadBand);

		// 暗闇背景に対してタイヤ輪郭を際立たせる外周トレッドブロック8個＋サイド発光トリム帯
		for (let i = 0; i < 8; i += 1) {
			const ang = (i / 8) * Math.PI * 2;
			const lug = new THREE.Mesh(this._sharedGeo.tireLug, this._sharedMat.tireLugMat);
			lug.position.set(Math.cos(ang) * (r * 0.96), Math.sin(ang) * (r * 0.96), 0);
			lug.rotation.z = ang + Math.PI * 0.5;
			group.add(lug);
		}
		for (const sz of [-0.17, 0.17]) {
			const sideBand = new THREE.Mesh(this._sharedGeo.tireSideBand, accentMat);
			sideBand.position.z = sz;
			group.add(sideBand);
		}

		const rim = new THREE.Mesh(this._sharedGeo.tireRim, this._sharedMat.tireRimMat);
		rim.rotation.x = Math.PI * 0.5;
		group.add(rim);

		const hub = new THREE.Mesh(this._sharedGeo.tireHub, accentMat);
		hub.rotation.x = Math.PI * 0.5;
		group.add(hub);

		// 回転が視認しやすい放射状ラグボルト6本
		for (let i = 0; i < 6; i += 1) {
			const angle = (i / 6) * Math.PI * 2;
			const bolt = new THREE.Mesh(this._sharedGeo.tireBolt, accentMat);
			bolt.rotation.x = Math.PI * 0.5;
			bolt.position.set(Math.cos(angle) * 0.16, Math.sin(angle) * 0.16, 0);
			group.add(bolt);
		}

		return group;
	}

	_createDrumMesh(isFast) {
		const group = new THREE.Group();
		const bodyMat = isFast ? this._sharedMat.drumFastSteelMat : this._sharedMat.drumSteelMat;
		const stripeMat = isFast ? this._sharedMat.drumFastStripeMat : this._sharedMat.drumStripeMat;
		const capMat = this._sharedMat.drumCapMat;
		const bandMat = isFast ? this._sharedMat.fastBand : this._sharedMat.ironBand;

		const shell = new THREE.Mesh(this._sharedGeo.drumShell, bodyMat);
		shell.rotation.x = Math.PI * 0.5;
		shell.castShadow = true;
		shell.receiveShadow = true;
		group.add(shell);

		const stripe = new THREE.Mesh(this._sharedGeo.drumStripe, stripeMat);
		stripe.rotation.x = Math.PI * 0.5;
		group.add(stripe);

		for (const sz of [-0.17, 0.17]) {
			const rib = new THREE.Mesh(this._sharedGeo.drumRib, bandMat);
			rib.position.z = sz;
			rib.castShadow = true;
			group.add(rib);
		}

		for (const side of [-1, 1]) {
			const cap = new THREE.Mesh(this._sharedGeo.drumCap, capMat);
			cap.position.z = side * 0.362;
			if (side < 0) {
				cap.rotation.y = Math.PI;
			}
			group.add(cap);

			const rim = new THREE.Mesh(this._sharedGeo.rimTorus, bandMat);
			rim.position.z = side * 0.36;
			rim.castShadow = true;
			group.add(rim);

			// 回転の視認性を高めるオフセンター蓋栓（バングプラグ）
			const bung = new THREE.Mesh(this._sharedGeo.drumBung, stripeMat);
			bung.rotation.x = Math.PI * 0.5;
			bung.position.set(0.18, 0.08, side * 0.375);
			group.add(bung);
		}

		return group;
	}

	_createBarrelMesh(isFast) {
		const group = new THREE.Group();
		const bodyMat = isFast ? this._sharedMat.fastBody : this._sharedMat.woodBody;
		const capMat = isFast ? this._sharedMat.fastCap : this._sharedMat.woodCap;
		const bandMat = isFast ? this._sharedMat.fastBand : this._sharedMat.ironBand;

		const mid = new THREE.Mesh(this._sharedGeo.midDrum, bodyMat);
		mid.rotation.x = Math.PI * 0.5;
		mid.castShadow = true;
		mid.receiveShadow = true;
		group.add(mid);

		for (const side of [-1, 1]) {
			const end = new THREE.Mesh(this._sharedGeo.endDrum, bodyMat);
			end.rotation.x = side > 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
			end.position.z = side * 0.27;
			end.castShadow = true;
			end.receiveShadow = true;
			group.add(end);

			// 少し奥まった側面蓋（放射模様＆中心ハブで横から見ても回転と立体感がはっきり見える）
			const cap = new THREE.Mesh(this._sharedGeo.capDisc, capMat);
			cap.position.z = side * 0.345;
			if (side < 0) {
				cap.rotation.y = Math.PI;
			}
			group.add(cap);

			// 外周フープリム
			const rim = new THREE.Mesh(this._sharedGeo.rimTorus, bandMat);
			rim.position.z = side * 0.355;
			rim.castShadow = true;
			group.add(rim);

			const hoop = new THREE.Mesh(this._sharedGeo.hoop, bandMat);
			hoop.rotation.x = Math.PI * 0.5;
			hoop.position.z = side * 0.19;
			hoop.castShadow = true;
			group.add(hoop);
		}

		return group;
	}

	setDifficulty(loopScaling) {
		this._speedScale = loopScaling?.speedScale ?? 1.0;
	}

	update(levelGeometry, playerPhysics, hasHammer, dt) {
		const bounces = [];

		for (const barrel of this.barrels) {
			const stepRes = stepBarrelPhysics(barrel, levelGeometry, dt, Math.random, this._speedScale);
			if (stepRes.bounced && barrel.alive) {
				bounces.push({ x: barrel.x, y: barrel.y - barrel.radius, fast: barrel.fast, kind: barrel.kind });
			}
			if (barrel.alive && barrel.mesh) {
				barrel.mesh.position.set(barrel.x, barrel.y, barrel.onLadder ? 1.5 : 0);
				barrel.mesh.rotation.z = barrel.rollAngle;
				barrel.mesh.rotation.y = barrel.onLadder ? Math.PI * 0.5 : 0;
			}
		}

		const interactions = checkBarrelInteractions(this.barrels, playerPhysics, hasHammer);

		for (let i = this.barrels.length - 1; i >= 0; i -= 1) {
			if (!this.barrels[i].alive) {
				this.scene.remove(this.barrels[i].mesh);
				this.barrels.splice(i, 1);
			}
		}

		return { ...interactions, bounces };
	}

	clear() {
		for (const barrel of this.barrels) {
			this.scene.remove(barrel.mesh);
		}
		this.barrels.length = 0;
	}

	dispose() {
		this.clear();
		Object.values(this._sharedGeo).forEach((g) => g.dispose());
		Object.values(this._sharedMat).forEach((m) => m.dispose());
	}
}
