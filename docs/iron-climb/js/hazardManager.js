import * as THREE from 'three';
import { CONFIG, getLoopDifficulty } from './config.js';
import { textureFactory } from './graphics/textureFactory.js';
import { buildSpikedChaserBotModel } from './graphics/modelBuilder.js';
import {
	getPlatformSurfaceY,
	isWithinPlatformX,
	findSupportingPlatform
} from './collision.js';

/**
 * 移動足場・ベルトコンベア等の動的足場パラメータを更新する（描画更新より先に実行）
 * @param {Array<object>} platforms
 * @param {number} elapsed
 * @param {number} dt
 */
export function stepMovingPlatforms(platforms, elapsed, dt) {
	if (!Array.isArray(platforms)) {
		return;
	}
	for (const p of platforms) {
		if (!p.move) {
			continue;
		}
		if (p.baseXMin === undefined) {
			p.baseXMin = p.xMin;
			p.baseXMax = p.xMax;
			p.baseYStart = p.yStart;
			p.baseYEnd = p.yEnd;
		}

		const axis = p.move.axis || 'x';
		const amp = p.move.amplitude || 0;
		const speed = p.move.speed || 1;
		const phase = p.move.phase || 0;
		const offset = Math.sin(elapsed * speed + phase) * amp;

		if (axis === 'x') {
			const prevCenter = (p.xMin + p.xMax) * 0.5;
			p.xMin = p.baseXMin + offset;
			p.xMax = p.baseXMax + offset;
			const nextCenter = (p.xMin + p.xMax) * 0.5;
			p.vx = dt > 0 ? (nextCenter - prevCenter) / dt : 0;
			p.vy = 0;
		} else {
			const prevY = p.yStart;
			p.yStart = p.baseYStart + offset;
			p.yEnd = p.baseYEnd + offset;
			p.vy = dt > 0 ? (p.yStart - prevY) / dt : 0;
			p.vx = 0;
		}
	}
}

/**
 * 周期的に作動するトラップ（炎バーナー / 高圧電気アーク）の状態を判定する共通ヘルパー
 */
export function evaluateTimedCycle(item, elapsed) {
	const period = Math.max(0.5, item.period || 3.4);
	const phase = item.phase || 0;
	const activeStart = item.activeStart ?? 0.55;
	const activeEnd = item.activeEnd ?? 0.92;
	const warningLead = item.warningLead ?? 0.18;

	const cyclePos = (((elapsed + phase) % period) + period) % period;
	const u = cyclePos / period;

	if (u >= activeStart && u <= activeEnd) {
		return { state: 'active', ratio: (u - activeStart) / Math.max(0.01, activeEnd - activeStart) };
	}

	const warnStart = activeStart - warningLead;
	const inWarning = warnStart >= 0
		? (u >= warnStart && u < activeStart)
		: (u >= warnStart + 1 || u < activeStart);

	return { state: inWarning ? 'warning' : 'idle', ratio: 0 };
}

/**
 * 上下ピストンプレス機の位置と危険判定を評価する
 */
export function evaluatePressState(press, elapsed, prevSlammed = false) {
	const period = Math.max(0.8, press.period || 3.2);
	const phase = press.phase || 0;
	const cyclePos = (((elapsed + phase) % period) + period) % period;
	const u = cyclePos / period;

	const yOpen = press.yOpenBottom;
	const yClosed = press.yClosedBottom;
	let yBottomCurrent = yOpen;
	let warning = false;
	let active = false;

	if (u < 0.48) {
		// 上昇待機中（安全に通過可能）
		yBottomCurrent = yOpen;
	} else if (u < 0.65) {
		// 落下予告振動
		warning = true;
		yBottomCurrent = yOpen - Math.abs(Math.sin(elapsed * 42)) * 0.14;
	} else if (u < 0.74) {
		// 高速プレス落下
		const k = (u - 0.65) / 0.09;
		yBottomCurrent = yOpen + (yClosed - yOpen) * (k * k);
		active = k > 0.25;
	} else if (u < 0.85) {
		// 圧着維持（危険）
		yBottomCurrent = yClosed;
		active = true;
	} else {
		// ゆっくり復帰上昇
		const k = (u - 0.85) / 0.15;
		yBottomCurrent = yClosed + (yOpen - yClosed) * k;
	}

	const slammed = u >= 0.65 && u < 0.85 && yBottomCurrent <= yClosed + 0.06;

	return {
		yBottomCurrent,
		warning,
		active,
		slammed,
		justSlammed: !prevSlammed && slammed
	};
}

/**
 * チェイサースパークのAI状態（巡回 ↔ 追跡）を進行させる
 * 常時追跡による詰みを防ぐため、一定周期で非追跡の巡回時間を挟む
 */
function stepChaserAiState(chaser, dt) {
	const patrolDuration = chaser.patrolDuration ?? CONFIG.HAZARD.CHASER_PATROL_DURATION;
	const chaseDuration = chaser.chaseDuration ?? CONFIG.HAZARD.CHASER_CHASE_DURATION;

	if (!chaser.aiMode) {
		chaser.aiMode = 'patrol';
		chaser.aiTimer = chaser.initialAiDelay ?? patrolDuration;
	}

	chaser.aiTimer = (chaser.aiTimer ?? patrolDuration) - dt;
	// 梯子昇降の途中でAIが切り替わらないよう、プラットフォーム到達後に遷移させる
	if (chaser.aiTimer <= 0 && !chaser.onLadder) {
		if (chaser.aiMode === 'chase') {
			chaser.aiMode = 'patrol';
			chaser.aiTimer = patrolDuration;
		} else {
			chaser.aiMode = 'chase';
			chaser.aiTimer = chaseDuration;
		}
	}
}

/**
 * シームレスに隣接・連結している静的／コンベア足場を探索する
 * 同一階層を複数パーツで分割定義している箇所（コンベア境界など）で追従敵が分断されないようにする。
 * @param {object} platform
 * @param {'left'|'right'} side
 * @param {Array<object>} platforms
 * @returns {object|null}
 */
function findAdjacentConnectedPlatform(platform, side, platforms) {
	if (!platform || platform.move) {
		return null;
	}
	const targetX = side === 'left' ? platform.xMin : platform.xMax;
	const targetY = getPlatformSurfaceY(platform, targetX);
	const zBase = platform.zCenter ?? 0;

	for (const candidate of platforms) {
		if (!candidate || candidate === platform || candidate.move || candidate.collapsed || candidate.hidden) {
			continue;
		}
		if (Math.abs((candidate.zCenter ?? 0) - zBase) > 0.5) {
			continue;
		}
		const candEdgeX = side === 'left' ? candidate.xMax : candidate.xMin;
		if (Math.abs(candEdgeX - targetX) > 0.12) {
			continue;
		}
		const candEdgeY = getPlatformSurfaceY(candidate, candEdgeX);
		if (Math.abs(candEdgeY - targetY) <= 0.25) {
			return candidate;
		}
	}
	return null;
}

/**
 * プレイヤーを追跡する障害物（チェイサースパーク）の1ステップ物理更新
 */
export function stepChaserPhysics(chaser, levelDef, playerPhysics, dt) {
	if (!chaser.alive) {
		return;
	}
	const platforms = levelDef.platforms || [];
	const ladders = levelDef.ladders || [];
	const r = chaser.radius || CONFIG.HAZARD.CHASER_RADIUS;

	chaser.ladderCooldown = Math.max(0, (chaser.ladderCooldown || 0) - dt);
	stepChaserAiState(chaser, dt);

	if (chaser.onLadder && chaser.activeLadder) {
		const ladder = chaser.activeLadder;
		const climbTargetY = chaser.climbDir >= 0 ? ladder.yTop : ladder.yBottom;
		const snapAlpha = Math.min(1, 14 * dt);
		chaser.x += (ladder.x - chaser.x) * snapAlpha;
		const targetZ = ladder.z ?? 1.52;
		chaser.z = (chaser.z ?? 0) + (targetZ - (chaser.z ?? 0)) * snapAlpha;
		chaser.y += chaser.climbDir * (chaser.climbSpeed || CONFIG.HAZARD.CHASER_CLIMB_SPEED) * dt;

		if ((chaser.climbDir > 0 && chaser.y >= climbTargetY) || (chaser.climbDir < 0 && chaser.y <= climbTargetY)) {
			chaser.y = climbTargetY + r;
			chaser.onLadder = false;
			chaser.activeLadder = null;
			chaser.ladderCooldown = 1.1;
			const support = findSupportingPlatform(chaser.x, chaser.y, chaser.y - r - 0.1, platforms);
			chaser.currentPlatform = support ? support.platform : null;
		}
		return;
	}

	// 足場上・空中では奥行 Z を基準ライン（0）へ滑らかに戻す
	chaser.z = (chaser.z ?? 0) + (0 - (chaser.z ?? 0)) * Math.min(1, 10 * dt);

	const isChasing = chaser.aiMode === 'chase';
	const baseSpeed = chaser.speed || CONFIG.HAZARD.CHASER_SPEED;
	const speed = isChasing ? baseSpeed : baseSpeed * CONFIG.HAZARD.CHASER_PATROL_SPEED_RATE;
	const dxPlayer = playerPhysics.x - chaser.x;
	const dyPlayer = playerPhysics.y - (chaser.y - r);

	// 追跡フェーズのみプレイヤー方向へ反転（巡回フェーズはそのまま直進・端折り返し）
	if (isChasing && Math.abs(dxPlayer) > 0.5) {
		chaser.dir = Math.sign(dxPlayer);
	}

	if (chaser.currentPlatform) {
		let p = chaser.currentPlatform;
		const carryVx = (p.conveyorSpeed || 0) + (p.vx || 0);
		chaser.vx = chaser.dir * speed + carryVx * 0.45;
		chaser.x += chaser.vx * dt;

		// 個体ごとの明示的な移動上限／下限が指定されている場合は先に折り返す
		if (chaser.minX != null && chaser.x < chaser.minX) {
			chaser.x = chaser.minX;
			chaser.dir = 1;
		} else if (chaser.maxX != null && chaser.x > chaser.maxX) {
			chaser.x = chaser.maxX;
			chaser.dir = -1;
		}

		// 同一階層の隣接足場へは境目で折り返さず、そのまま乗り移って横断させる
		for (let hop = 0; hop < platforms.length; hop += 1) {
			if (chaser.x < p.xMin) {
				const leftNext = findAdjacentConnectedPlatform(p, 'left', platforms);
				if (!leftNext) {
					break;
				}
				p = leftNext;
				chaser.currentPlatform = p;
			} else if (chaser.x > p.xMax) {
				const rightNext = findAdjacentConnectedPlatform(p, 'right', platforms);
				if (!rightNext) {
					break;
				}
				p = rightNext;
				chaser.currentPlatform = p;
			} else {
				break;
			}
		}

		// 連結端（隣接足場が存在しない落下端）では落ちずに折り返す
		if (!findAdjacentConnectedPlatform(p, 'left', platforms)) {
			const minEdge = p.xMin + r + 0.15;
			if (chaser.x < minEdge) {
				chaser.x = minEdge;
				chaser.dir = 1;
			}
		}
		if (!findAdjacentConnectedPlatform(p, 'right', platforms)) {
			const maxEdge = p.xMax - r - 0.15;
			if (chaser.x > maxEdge) {
				chaser.x = maxEdge;
				chaser.dir = -1;
			}
		}

		const surfY = getPlatformSurfaceY(p, chaser.x);
		chaser.y = surfY + r;
		chaser.vy = 0;

		// 追跡フェーズかつ階層が異なる場合のみ、近い通常梯子を使って昇降追跡する
		if (chaser.allowLadders !== false && isChasing && chaser.ladderCooldown <= 0 && Math.abs(dyPlayer) > 1.4) {
			for (const ladder of ladders) {
				if (ladder.broken) {
					continue;
				}
				if (Math.abs(chaser.x - ladder.x) > 0.45) {
					continue;
				}
				const nearBottom = Math.abs(surfY - ladder.yBottom) < 0.35;
				const nearTop = Math.abs(surfY - ladder.yTop) < 0.35;
				if (dyPlayer > 1.0 && nearBottom) {
					chaser.onLadder = true;
					chaser.activeLadder = ladder;
					chaser.climbDir = 1;
					chaser.x = ladder.x;
					chaser.y = ladder.yBottom;
					return;
				}
				if (chaser.allowLadderDescend !== false && dyPlayer < -1.0 && nearTop) {
					chaser.onLadder = true;
					chaser.activeLadder = ladder;
					chaser.climbDir = -1;
					chaser.x = ladder.x;
					chaser.y = ladder.yTop;
					return;
				}
			}
		}
	} else {
		// 空中落下時の着地処理
		chaser.vy = Math.max(-CONFIG.HAZARD.FALLING_MAX_SPEED, (chaser.vy || 0) - CONFIG.HAZARD.CHASER_GRAVITY * dt);
		const prevFootY = chaser.y - r;
		chaser.y += chaser.vy * dt;
		const support = findSupportingPlatform(chaser.x, prevFootY, chaser.y - r, platforms);
		if (support) {
			chaser.y = support.surfaceY + r;
			chaser.vy = 0;
			chaser.currentPlatform = support.platform;
		}
	}
}

/**
 * 落下障害物のスポナー・落下更新（STAGE 3 鉄骨・機械塔落下物用）
 */
export function stepFallingHazard(item, playerPhysics, bounds, dt) {
	const r = item.radius || CONFIG.HAZARD.FALLING_RADIUS;

	if (item.phaseState === 'cooldown') {
		item.timer -= dt;
		if (item.timer <= 0) {
			item.phaseState = 'telegraph';
			item.timer = item.telegraphDuration ?? 0.8;
			if (item.trackPlayerX) {
				const minX = (item.xRange?.[0] ?? bounds.xMin + 1.5);
				const maxX = (item.xRange?.[1] ?? bounds.xMax - 1.5);
				item.x = Math.max(minX, Math.min(maxX, playerPhysics.x));
			} else {
				item.x = item.baseX;
			}
			item.y = item.spawnY;
			item.vy = 0;
			item.jumpedOver = false;
		}
		return null;
	}

	if (item.phaseState === 'telegraph') {
		item.timer -= dt;
		if (item.timer <= 0) {
			item.phaseState = 'falling';
			item.vy = -1.5;
		}
		return null;
	}

	// falling 中
	item.vy = Math.max(-CONFIG.HAZARD.FALLING_MAX_SPEED, item.vy - CONFIG.HAZARD.FALLING_GRAVITY * dt);
	item.y += item.vy * dt;

	const floorLimit = item.despawnY ?? (bounds.deathY ?? -6);
	if (item.y - r <= floorLimit) {
		item.phaseState = 'cooldown';
		item.timer = item.cooldownDuration ?? 2.2;
		return { impacted: true, x: item.x, y: floorLimit };
	}

	return null;
}

/**
 * 全ギミック・追跡敵・落下障害物とプレイヤーの当たり判定を一括評価する（純粋関数）
 */
export function checkAllHazardInteractions(snapshot, playerPhysics, hasHammer = false) {
	const px = playerPhysics.x;
	const pyBottom = playerPhysics.y + 0.08;
	const pyTop = playerPhysics.y + CONFIG.PLAYER.HEIGHT * 0.92;
	const pr = CONFIG.PLAYER.RADIUS * 0.85;
	const invincible = (playerPhysics.invincibleTimer || 0) > 0;

	let hitPlayer = false;
	const smashedTargets = [];
	const jumpedOverTargets = [];

	const playerBoxOverlap = (minX, maxX, minY, maxY) => {
		return (px + pr) > minX && (px - pr) < maxX && pyTop > minY && pyBottom < maxY;
	};

	if (!invincible) {
		// 1. 上下ピストンプレス機
		for (const press of snapshot.presses || []) {
			if (!press.active) {
				continue;
			}
			const hw = (press.width || 1.8) * 0.5 - CONFIG.HAZARD.PRESS_HIT_HALF_W_MARGIN;
			const pressHeight = press.height || 1.6;
			if (playerBoxOverlap(press.x - hw, press.x + hw, press.yBottomCurrent, press.yBottomCurrent + pressHeight)) {
				hitPlayer = true;
			}
		}

		// 2. 噴出炎バーナー
		for (const burner of snapshot.burners || []) {
			if (burner.state !== 'active') {
				continue;
			}
			const len = burner.length || 2.5;
			const dirX = burner.dirX ?? 0;
			const dirY = burner.dirY ?? 1;
			const xEnd = burner.x + dirX * len;
			const yEnd = burner.y + dirY * len;
			const pad = 0.28;
			const minX = Math.min(burner.x, xEnd) - (Math.abs(dirY) > 0.5 ? 0.34 : pad);
			const maxX = Math.max(burner.x, xEnd) + (Math.abs(dirY) > 0.5 ? 0.34 : pad);
			const minY = Math.min(burner.y, yEnd) - (Math.abs(dirX) > 0.5 ? 0.34 : 0.05);
			const maxY = Math.max(burner.y, yEnd) + (Math.abs(dirX) > 0.5 ? 0.34 : 0.05);
			if (playerBoxOverlap(minX, maxX, minY, maxY)) {
				hitPlayer = true;
			}
		}

		// 3. 高圧電気ショックアーク
		for (const arc of snapshot.electricTraps || []) {
			if (arc.state !== 'active') {
				continue;
			}
			const minX = Math.min(arc.x1, arc.x2) - 0.24;
			const maxX = Math.max(arc.x1, arc.x2) + 0.24;
			const minY = Math.min(arc.y1, arc.y2) - 0.24;
			const maxY = Math.max(arc.y1, arc.y2) + 0.24;
			if (playerBoxOverlap(minX, maxX, minY, maxY)) {
				hitPlayer = true;
			}
		}

		// 3b. 常時燃焼ピット炎（各ステージ左下スタート地点の燃焼台上の炎）
		for (const fire of snapshot.pitFires || []) {
			if (playerBoxOverlap(fire.xMin, fire.xMax, fire.yMin, fire.yMax)) {
				hitPlayer = true;
			}
		}
	}

	// 4. 追跡障害物（チェイサースパーク）
	const pCenterY = playerPhysics.y + CONFIG.PLAYER.HEIGHT * 0.45;
	const hammerActive = Boolean(hasHammer && !playerPhysics.onLadder);
	const facingDir = playerPhysics.facingDir || 1;
	const hX1 = px - facingDir * 0.48;
	const hX2 = px + facingDir * 1.55;
	const hammerMinX = Math.min(hX1, hX2);
	const hammerMaxX = Math.max(hX1, hX2);
	const hammerMinY = playerPhysics.y - 0.25;
	const hammerMaxY = playerPhysics.y + CONFIG.PLAYER.HEIGHT + 0.55;

	for (const chaser of snapshot.chasers || []) {
		if (!chaser.alive) {
			continue;
		}
		const r = chaser.radius || CONFIG.HAZARD.CHASER_RADIUS;
		// 前方ハンマー掃引判定を本体接触判定より先に評価し、すり抜け被弾を防ぐ
		const hitsHammerZone = hammerActive &&
			chaser.x + r >= hammerMinX &&
			chaser.x - r <= hammerMaxX &&
			chaser.y + r >= hammerMinY &&
			chaser.y - r <= hammerMaxY;
		const dist = Math.hypot(px - chaser.x, pCenterY - chaser.y);
		if (hitsHammerZone || (dist < r + pr + 0.08 && hasHammer)) {
			chaser.alive = false;
			chaser.respawnTimer = 4.5;
			smashedTargets.push({ x: chaser.x, y: chaser.y });
			continue;
		}
		if (dist < r + pr + 0.08) {
			if (!invincible) {
				hitPlayer = true;
			}
		}

		// 飛び越えボーナス（+100）
		if (!chaser.jumpedOver && !playerPhysics.grounded && !playerPhysics.onLadder) {
			const dx = Math.abs(px - chaser.x);
			const dy = playerPhysics.y - chaser.y;
			if (dx < 0.72 && dy > 0.15 && dy < 2.2) {
				chaser.jumpedOver = true;
				jumpedOverTargets.push({ x: chaser.x, y: chaser.y });
			}
		}
		if (playerPhysics.grounded && Math.abs(px - chaser.x) > 2.2) {
			chaser.jumpedOver = false;
		}
	}

	// 5. 落下障害物
	for (const faller of snapshot.fallingHazards || []) {
		if (faller.phaseState !== 'falling') {
			continue;
		}
		const r = faller.radius || CONFIG.HAZARD.FALLING_RADIUS;
		const dist = Math.hypot(px - faller.x, pCenterY - faller.y);
		if (dist < r + pr + 0.04) {
			if (hasHammer) {
				faller.phaseState = 'cooldown';
				faller.timer = faller.cooldownDuration ?? 2.2;
				smashedTargets.push({ x: faller.x, y: faller.y });
				continue;
			}
			if (!invincible) {
				hitPlayer = true;
			}
		}
	}

	return {
		hitPlayer,
		smashedTargets,
		jumpedOverTargets
	};
}

/**
 * ハザード判定結果の空オブジェクトを生成する（崩壊演出中などギミック停止時の型安全用）
 */
export function createEmptyHazardResult() {
	return {
		hitPlayer: false,
		smashedTargets: [],
		jumpedOverTargets: [],
		pressSlams: [],
		fallingImpacts: [],
		activeBurners: [],
		activeArcs: [],
		burnerIgnites: [],
		arcDischarges: []
	};
}

/**
 * STAGE 2 / 3 の動的ギミック・追跡敵・落下障害物の 3D 描画と更新を統括するクラス
 */
export class HazardManager {
	/**
	 * @param {THREE.Scene} scene
	 */
	constructor(scene) {
		this.scene = scene;
		this.group = new THREE.Group();
		this.scene.add(this.group);

		this._geometries = [];
		this._materials = [];

		this._presses = [];
		this._burners = [];
		this._electricTraps = [];
		this._chasers = [];
		this._fallingHazards = [];
		this._pitFires = [];
		this._elapsed = 0;
		this._trapElapsed = 0;
		this._loopScaling = getLoopDifficulty(1);
	}

	_geo(g) {
		this._geometries.push(g);
		return g;
	}

	_mat(m) {
		this._materials.push(m);
		return m;
	}

	load(levelDef, loopScaling = null) {
		this.clear();
		if (!levelDef) {
			return;
		}
		this.group.visible = true;
		this._elapsed = 0;
		this._trapElapsed = 0;
		this._loopScaling = loopScaling || getLoopDifficulty(1);

		this._buildPresses(levelDef.presses || []);
		this._buildBurners(levelDef.burners || []);
		this._buildElectricTraps(levelDef.electricTraps || []);
		this._buildChasers(levelDef.chasers || []);
		this._buildFallingHazards(levelDef.fallingHazards || []);
		this._pitFires = (levelDef.pitFires || []).map((f) => ({ ...f }));
	}

	_buildPresses(pressDefs) {
		const housingMat = this._mat(new THREE.MeshStandardMaterial({
			color: 0x334155,
			metalness: 0.85,
			roughness: 0.34
		}));
		const chromeMat = this._mat(new THREE.MeshStandardMaterial({
			color: 0xcbd5e1,
			metalness: 0.94,
			roughness: 0.16
		}));
		const headMat = this._mat(new THREE.MeshStandardMaterial({
			color: 0xd9480f,
			metalness: 0.65,
			roughness: 0.36
		}));
		const hazardBandMat = this._mat(new THREE.MeshStandardMaterial({
			color: 0xffb703,
			metalness: 0.5,
			roughness: 0.35
		}));

		for (const def of pressDefs) {
			const w = def.width || 1.8;
			const h = def.height || 1.25;
			const zPos = def.z ?? 0;
			const mountY = def.mountY ?? (def.yOpenBottom + h + 0.85);
			const cornerX = w * 0.44;
			const cornerZ = 1.68; // 鉄骨床（z=[-1.5, 1.5]）の外側を通し、プレイヤーや床と重ならないようにする

			// 固定上部油圧駆動ユニット（上階床下面または背面フレームアームへ固定）
			const driveMount = new THREE.Group();
			driveMount.position.set(def.x, mountY, zPos);

			const driveBox = new THREE.Mesh(
				this._geo(new THREE.BoxGeometry(w + 0.46, 0.44, 3.84)),
				housingMat
			);
			driveBox.position.y = -0.22;
			driveBox.castShadow = true;
			driveMount.add(driveBox);

			// 背面フレーム・壁面へ繋がるガントリー支持アーム（宙浮き感を防ぐ機械構造）
			const armGeo = this._geo(new THREE.BoxGeometry(0.32, 0.36, 2.35));
			const flangeGeo = this._geo(new THREE.BoxGeometry(0.62, 0.72, 0.22));
			for (const ax of [-cornerX * 0.8, cornerX * 0.8]) {
				const arm = new THREE.Mesh(armGeo, housingMat);
				arm.position.set(ax, -0.22, -2.95);
				driveMount.add(arm);

				const wallFlange = new THREE.Mesh(flangeGeo, headMat);
				wallFlange.position.set(ax, -0.22, -4.05);
				driveMount.add(wallFlange);
			}

			// 4隅の固定油圧シリンダーバレル（伸縮ロッドを内部に格納・ガイドする）
			const barrelGeo = this._geo(new THREE.CylinderGeometry(0.155, 0.165, 0.62, 10));
			for (const sx of [-cornerX, cornerX]) {
				for (const sz of [-cornerZ, cornerZ]) {
					const barrel = new THREE.Mesh(barrelGeo, housingMat);
					barrel.position.set(sx, -0.44, sz);
					driveMount.add(barrel);
				}
			}
			this.group.add(driveMount);

			// テレスコピック伸縮クロームロッド（4隅外側：常に上部駆動ユニットとプレスヘッド間を繋ぐ）
			const unitRodGeo = this._geo(new THREE.CylinderGeometry(0.085, 0.085, 1.0, 10));
			const rods = [];
			for (const sx of [-cornerX, cornerX]) {
				for (const sz of [-cornerZ, cornerZ]) {
					const rod = new THREE.Mesh(unitRodGeo, chromeMat);
					rod.position.set(def.x + sx, mountY - 0.5, zPos + sz);
					rod.castShadow = true;
					this.group.add(rod);
					rods.push(rod);
				}
			}

			const root = new THREE.Group();
			root.position.set(def.x, def.yOpenBottom, zPos);

			// プレス本体ブロック
			const block = new THREE.Mesh(
				this._geo(new THREE.BoxGeometry(w, h, 2.48)),
				headMat
			);
			block.position.y = h * 0.5;
			block.castShadow = true;
			block.receiveShadow = true;
			root.add(block);

			// 床幅を超える上部クロスヘッド・ヨーク（4隅の外側ロッドを支持）
			const yoke = new THREE.Mesh(
				this._geo(new THREE.BoxGeometry(w + 0.36, 0.22, 3.72)),
				housingMat
			);
			yoke.position.y = h + 0.04;
			yoke.castShadow = true;
			root.add(yoke);

			const bossGeo = this._geo(new THREE.CylinderGeometry(0.15, 0.17, 0.16, 10));
			for (const sx of [-cornerX, cornerX]) {
				for (const sz of [-cornerZ, cornerZ]) {
					const boss = new THREE.Mesh(bossGeo, chromeMat);
					boss.position.set(sx, h + 0.18, sz);
					root.add(boss);
				}
			}

			const bumper = new THREE.Mesh(
				this._geo(new THREE.BoxGeometry(w + 0.1, 0.22, 2.56)),
				hazardBandMat
			);
			bumper.position.y = 0.11;
			root.add(bumper);

			// 前後警告灯
			const lampMat = this._mat(new THREE.MeshStandardMaterial({
				color: 0x451a03,
				emissive: 0xff9f1c,
				emissiveIntensity: 0.1
			}));
			for (const lz of [-1.28, 1.28]) {
				const lamp = new THREE.Mesh(this._geo(new THREE.SphereGeometry(0.18, 10, 8)), lampMat);
				lamp.position.set(0, 0.46, lz);
				root.add(lamp);
			}

			this.group.add(root);

			const pressEntry = {
				...def,
				height: h,
				mountY,
				yBottomCurrent: def.yOpenBottom,
				active: false,
				slammed: false,
				warning: false,
				root,
				rods,
				lampMat
			};
			this._syncPressRods(pressEntry);
			this._presses.push(pressEntry);
		}
	}

	_syncPressRods(press) {
		const yokeTop = press.yBottomCurrent + press.height + 0.14;
		const anchorY = press.mountY - 0.2;
		const span = Math.max(0.08, anchorY - yokeTop);
		const midY = yokeTop + span * 0.5;
		for (const rod of press.rods) {
			rod.scale.y = span;
			rod.position.y = midY;
		}
	}

	_buildBurners(burnerDefs) {
		const nozzleMat = this._mat(new THREE.MeshStandardMaterial({
			color: 0x2b3444,
			metalness: 0.85,
			roughness: 0.35
		}));
		const brassMat = this._mat(new THREE.MeshStandardMaterial({
			color: 0xd97706,
			metalness: 0.78,
			roughness: 0.28
		}));
		const valveMat = this._mat(new THREE.MeshStandardMaterial({
			color: 0xdc2626,
			metalness: 0.45,
			roughness: 0.4
		}));

		for (const def of burnerDefs) {
			const len = def.length || 2.5;
			const dirX = def.dirX ?? 0;
			const dirY = def.dirY ?? 1;

			const root = new THREE.Group();
			root.position.set(def.x, def.y, def.z ?? 0);
			root.rotation.z = Math.atan2(dirY, dirX) - Math.PI * 0.5;

			const flange = new THREE.Mesh(
				this._geo(new THREE.CylinderGeometry(0.42, 0.46, 0.1, 14)),
				nozzleMat
			);
			flange.position.y = 0.05;
			root.add(flange);

			const nozzle = new THREE.Mesh(
				this._geo(new THREE.CylinderGeometry(0.24, 0.34, 0.36, 12)),
				nozzleMat
			);
			nozzle.position.y = 0.18;
			root.add(nozzle);

			const ring = new THREE.Mesh(this._geo(new THREE.TorusGeometry(0.27, 0.045, 8, 16)), brassMat);
			ring.rotation.x = Math.PI * 0.5;
			ring.position.y = 0.32;
			root.add(ring);

			const valveWheel = new THREE.Mesh(this._geo(new THREE.TorusGeometry(0.14, 0.032, 6, 12)), valveMat);
			valveWheel.position.set(0.32, 0.16, 0.2);
			root.add(valveWheel);

			const pilotMat = this._mat(new THREE.MeshStandardMaterial({
				color: 0xffb703,
				emissive: 0xff6b00,
				emissiveIntensity: 0.6
			}));
			const pilot = new THREE.Mesh(this._geo(new THREE.SphereGeometry(0.14, 10, 8)), pilotMat);
			pilot.position.y = 0.35;
			root.add(pilot);

			const outerMat = this._mat(textureFactory.createRealisticFlameMaterial({
				speed: 3.1,
				sway: 0.16,
				intensity: 1.32,
				seed: def.x * 0.7,
				coreBias: 0.0
			}));
			const coreMat = this._mat(textureFactory.createRealisticFlameMaterial({
				speed: 3.8,
				sway: 0.11,
				intensity: 1.65,
				seed: def.x * 0.7 + 2.1,
				coreBias: 0.85
			}));

			const outerGroup = new THREE.Group();
			const outerPlaneGeo = this._geo(new THREE.PlaneGeometry(1.18, len, 8, 16));
			outerPlaneGeo.translate(0, len * 0.5 + 0.16, 0);
			for (let i = 0; i < 3; i += 1) {
				const p = new THREE.Mesh(outerPlaneGeo, outerMat);
				p.rotation.y = (i * Math.PI) / 3;
				outerGroup.add(p);
			}
			outerGroup.visible = false;
			root.add(outerGroup);

			const coreGroup = new THREE.Group();
			const corePlaneGeo = this._geo(new THREE.PlaneGeometry(0.72, len * 0.78, 6, 12));
			corePlaneGeo.translate(0, len * 0.39 + 0.16, 0);
			for (let i = 0; i < 2; i += 1) {
				const p = new THREE.Mesh(corePlaneGeo, coreMat);
				p.rotation.y = Math.PI / 6 + (i * Math.PI) / 2;
				coreGroup.add(p);
			}
			coreGroup.visible = false;
			root.add(coreGroup);

			this.group.add(root);
			this._burners.push({
				...def,
				state: 'idle',
				root,
				pilotMat,
				outerCone: outerGroup,
				coreCone: coreGroup,
				outerMat,
				coreMat
			});
		}
	}

	_buildElectricTraps(trapDefs) {
		const coilMat = this._mat(new THREE.MeshStandardMaterial({
			color: 0x3b4861,
			metalness: 0.85,
			roughness: 0.28
		}));
		const ceramicMat = this._mat(new THREE.MeshStandardMaterial({
			color: 0xdbeafe,
			metalness: 0.2,
			roughness: 0.25
		}));
		const ringMat = this._mat(new THREE.MeshStandardMaterial({
			color: 0x38bdf8,
			emissive: 0x0ea5e9,
			emissiveIntensity: 1.0
		}));

		for (const def of trapDefs) {
			const dx = def.x2 - def.x1;
			const dy = def.y2 - def.y1;
			const dist = Math.max(0.5, Math.hypot(dx, dy));
			const midX = (def.x1 + def.x2) * 0.5;
			const midY = (def.y1 + def.y2) * 0.5;
			const angle = Math.atan2(dy, dx) - Math.PI * 0.5;

			const root = new THREE.Group();
			root.position.set(midX, midY, def.z ?? 0);
			root.rotation.z = angle;

			for (const endSign of [-1, 1]) {
				const base = new THREE.Mesh(this._geo(new THREE.CylinderGeometry(0.22, 0.3, 0.28, 12)), coilMat);
				base.position.y = endSign * dist * 0.5;
				root.add(base);

				// 段付きセラミック高圧碍子ディスク
				for (const d of [0.16, 0.26]) {
					const disc = new THREE.Mesh(this._geo(new THREE.CylinderGeometry(0.22, 0.22, 0.05, 14)), ceramicMat);
					disc.position.y = endSign * (dist * 0.5 - d);
					root.add(disc);
				}

				const tip = new THREE.Mesh(this._geo(new THREE.TorusGeometry(0.2, 0.05, 8, 16)), ringMat);
				tip.rotation.x = Math.PI * 0.5;
				tip.position.y = endSign * (dist * 0.5 - 0.32);
				root.add(tip);
			}

			const arcMat = this._mat(new THREE.MeshBasicMaterial({
				color: 0x7dd3fc,
				transparent: true,
				opacity: 0.9,
				blending: THREE.AdditiveBlending,
				depthWrite: false
			}));
			const coreMat = this._mat(new THREE.MeshBasicMaterial({
				color: 0xffffff,
				transparent: true,
				opacity: 0.95,
				blending: THREE.AdditiveBlending,
				depthWrite: false
			}));

			const beam = new THREE.Mesh(this._geo(new THREE.CylinderGeometry(0.16, 0.16, dist - 0.2, 10)), arcMat);
			beam.visible = false;
			root.add(beam);

			const core = new THREE.Mesh(this._geo(new THREE.CylinderGeometry(0.06, 0.06, dist - 0.2, 8)), coreMat);
			core.visible = false;
			root.add(core);

			const warnMat = this._mat(new THREE.MeshBasicMaterial({
				color: 0x38bdf8,
				transparent: true,
				opacity: 0.25,
				depthWrite: false
			}));
			const warnLine = new THREE.Mesh(this._geo(new THREE.CylinderGeometry(0.03, 0.03, dist - 0.2, 6)), warnMat);
			warnLine.visible = false;
			root.add(warnLine);

			this.group.add(root);
			this._electricTraps.push({
				...def,
				state: 'idle',
				root,
				beam,
				core,
				warnLine,
				arcMat
			});
		}
	}

	_buildChasers(chaserDefs) {
		const tracker = {
			geo: (g) => this._geo(g),
			mat: (m) => this._mat(m)
		};
		for (const def of chaserDefs) {
			const r = def.radius || CONFIG.HAZARD.CHASER_RADIUS;
			const bot = buildSpikedChaserBotModel(tracker, r);
			const mesh = bot.root;
			const initDir = def.dir || 1;
			const initYaw = initDir >= 0 ? Math.PI * 0.42 : -Math.PI * 0.42;
			mesh.position.set(def.x, def.y, 0);
			mesh.rotation.y = initYaw;

			this.group.add(mesh);
			const speedScale = this._loopScaling?.speedScale ?? 1;
			const intervalScale = this._loopScaling?.intervalScale ?? 1;
			const scaledPatrol = (def.patrolDuration ?? CONFIG.HAZARD.CHASER_PATROL_DURATION) * intervalScale;
			const scaledInitDelay = (def.initialAiDelay ?? def.patrolDuration ?? CONFIG.HAZARD.CHASER_PATROL_DURATION) * intervalScale;
			this._chasers.push({
				...def,
				speed: (def.speed || CONFIG.HAZARD.CHASER_SPEED) * speedScale,
				climbSpeed: CONFIG.HAZARD.CHASER_CLIMB_SPEED * Math.min(1.5, speedScale),
				patrolDuration: scaledPatrol,
				initialAiDelay: scaledInitDelay,
				spawnX: def.x,
				spawnY: def.y,
				initialDir: initDir,
				radius: r,
				vx: 0,
				vy: 0,
				z: 0,
				dir: initDir,
				yaw: initYaw,
				aiMode: 'patrol',
				aiTimer: scaledInitDelay,
				alive: true,
				respawnTimer: 0,
				jumpedOver: false,
				onLadder: false,
				activeLadder: null,
				ladderCooldown: 0,
				currentPlatform: null,
				mesh,
				visualPivot: bot.visualPivot,
				visualScale: bot.visualScale,
				bodyGroup: bot.bodyGroup,
				eyeMat: bot.eyeMat,
				coreGlowMat: bot.coreGlowMat,
				leftArm: bot.leftArm,
				rightArm: bot.rightArm,
				leftClawTop: bot.leftClawTop,
				leftClawBottom: bot.leftClawBottom,
				rightClawTop: bot.rightClawTop,
				rightClawBottom: bot.rightClawBottom,
				leftWheel: bot.leftWheel,
				rightWheel: bot.rightWheel
			});
		}
	}

	_buildFallingHazards(fallDefs) {
		const bodyMat = this._mat(new THREE.MeshStandardMaterial({
			color: 0xff6b2c,
			emissive: 0xd9480f,
			emissiveIntensity: 1.15,
			metalness: 0.65,
			roughness: 0.3
		}));
		const capMat = this._mat(new THREE.MeshStandardMaterial({
			color: 0x334155,
			metalness: 0.85,
			roughness: 0.3
		}));

		for (const def of fallDefs) {
			const r = def.radius || CONFIG.HAZARD.FALLING_RADIUS;
			const mesh = new THREE.Group();
			mesh.visible = false;

			const pod = new THREE.Mesh(this._geo(new THREE.ConeGeometry(r * 0.95, r * 2.1, 10)), bodyMat);
			pod.rotation.z = Math.PI;
			pod.castShadow = true;
			mesh.add(pod);

			const cap = new THREE.Mesh(this._geo(new THREE.CylinderGeometry(r * 0.85, r * 0.95, r * 0.65, 10)), capMat);
			cap.position.y = r * 0.8;
			mesh.add(cap);

			this.group.add(mesh);

			// 落下ライン予告マーカー
			const reticleMat = this._mat(new THREE.MeshBasicMaterial({
				color: 0xff4d4d,
				transparent: true,
				opacity: 0.55,
				depthWrite: false
			}));
			const reticle = new THREE.Mesh(
				this._geo(new THREE.CylinderGeometry(0.05, 0.05, Math.max(4, def.spawnY - (def.despawnY ?? 0)), 6)),
				reticleMat
			);
			reticle.visible = false;
			this.group.add(reticle);

			this._fallingHazards.push({
				...def,
				baseX: def.x,
				x: def.x,
				y: def.spawnY,
				vy: 0,
				radius: r,
				phaseState: 'cooldown',
				timer: def.initialDelay ?? 1.0,
				jumpedOver: false,
				mesh,
				reticle,
				reticleMat
			});
		}
	}

	reset() {
		this._elapsed = 0;
		this._trapElapsed = 0;
		// STAGE 3 崩落などで非表示化したグループを復帰させ、各種トラップも待機状態へ戻す
		this.group.visible = true;
		for (const c of this._chasers) {
			c.x = c.spawnX;
			c.y = c.spawnY;
			c.vx = 0;
			c.vy = 0;
			c.dir = c.initialDir;
			c.aiMode = 'patrol';
			c.aiTimer = c.initialAiDelay ?? c.patrolDuration ?? CONFIG.HAZARD.CHASER_PATROL_DURATION;
			c.ladderCooldown = 0;
			c.alive = true;
			c.respawnTimer = 0;
			c.jumpedOver = false;
			c.onLadder = false;
			c.activeLadder = null;
			c.currentPlatform = null;
			c.mesh.visible = true;
			c.mesh.scale.setScalar(1);
		}
		for (const f of this._fallingHazards) {
			f.phaseState = 'cooldown';
			f.timer = f.initialDelay ?? 1.0;
			f.mesh.visible = false;
			f.reticle.visible = false;
		}
		for (const press of this._presses) {
			const st = evaluatePressState(press, 0, false);
			press.yBottomCurrent = st.yBottomCurrent;
			press.active = st.active;
			press.slammed = st.slammed;
			press.warning = st.warning;
			press.root.position.y = st.yBottomCurrent;
			this._syncPressRods(press);
			press.lampMat.emissiveIntensity = 0.12;
		}
		for (const burner of this._burners) {
			burner.state = 'idle';
			burner.outerCone.visible = false;
			burner.coreCone.visible = false;
			burner.pilotMat.emissiveIntensity = 0.25;
		}
		for (const arc of this._electricTraps) {
			arc.state = 'idle';
			arc.beam.visible = false;
			arc.core.visible = false;
			arc.warnLine.visible = false;
		}
	}

	/**
	 * 全ギミックを更新し、発生イベントとプレイヤー当たり判定結果を返す
	 */
	update(levelDef, playerPhysics, hasHammer, dt) {
		this._elapsed += dt;
		this._trapElapsed += dt * (this._loopScaling?.frequencyScale ?? 1);
		const bounds = levelDef?.bounds || { xMin: -16, xMax: 16, deathY: -8 };
		const platforms = levelDef?.platforms || [];

		const pressSlams = [];
		const fallingImpacts = [];
		const activeBurners = [];
		const activeArcs = [];
		const burnerIgnites = [];
		const arcDischarges = [];

		// 1. プレス機
		for (const press of this._presses) {
			const prevSlammed = Boolean(press.slammed);
			const st = evaluatePressState(press, this._trapElapsed, prevSlammed);
			press.yBottomCurrent = st.yBottomCurrent;
			press.active = st.active;
			press.slammed = st.slammed;
			press.warning = st.warning;
			press.root.position.y = st.yBottomCurrent;
			this._syncPressRods(press);
			press.lampMat.emissiveIntensity = st.warning ? 2.4 : (st.active ? 1.6 : 0.12);
			if (st.justSlammed) {
				pressSlams.push({ x: press.x, y: press.yClosedBottom });
			}
		}

		// 2. 噴出炎
		for (const burner of this._burners) {
			const prevState = burner.state;
			const st = evaluateTimedCycle(burner, this._trapElapsed);
			burner.state = st.state;
			if (st.state === 'active') {
				if (prevState !== 'active') {
					burnerIgnites.push({ x: burner.x, y: burner.y });
				}
				burner.outerCone.visible = true;
				burner.coreCone.visible = true;
				burner.outerMat.uniforms.uTime.value = this._elapsed;
				burner.coreMat.uniforms.uTime.value = this._elapsed;
				burner.pilotMat.emissiveIntensity = 2.6;
				activeBurners.push({
					x: burner.x,
					y: burner.y,
					dirX: burner.dirX ?? 0,
					dirY: burner.dirY ?? 1
				});
			} else if (st.state === 'warning') {
				burner.outerCone.visible = false;
				burner.coreCone.visible = false;
				burner.pilotMat.emissiveIntensity = 1.6 + Math.sin(this._elapsed * 30) * 0.9;
			} else {
				burner.outerCone.visible = false;
				burner.coreCone.visible = false;
				burner.pilotMat.emissiveIntensity = 0.25;
			}
		}

		// 3. 電気アーク
		for (const arc of this._electricTraps) {
			const prevState = arc.state;
			const st = evaluateTimedCycle(arc, this._trapElapsed);
			arc.state = st.state;
			if (st.state === 'active') {
				if (prevState !== 'active') {
					arcDischarges.push({ x: (arc.x1 + arc.x2) * 0.5, y: (arc.y1 + arc.y2) * 0.5 });
				}
				arc.beam.visible = true;
				arc.core.visible = true;
				arc.warnLine.visible = false;
				const jitter = 0.75 + Math.random() * 0.65;
				arc.beam.scale.set(jitter, 1, jitter);
				arc.arcMat.opacity = 0.72 + Math.random() * 0.28;
				activeArcs.push({
					x1: arc.x1,
					y1: arc.y1,
					x2: arc.x2,
					y2: arc.y2
				});
			} else if (st.state === 'warning') {
				arc.beam.visible = false;
				arc.core.visible = false;
				arc.warnLine.visible = Math.sin(this._elapsed * 32) > 0;
			} else {
				arc.beam.visible = false;
				arc.core.visible = false;
				arc.warnLine.visible = false;
			}
		}

		// 4. 追跡障害物
		for (const chaser of this._chasers) {
			if (!chaser.alive) {
				chaser.mesh.visible = false;
				chaser.respawnTimer -= dt;
				if (chaser.respawnTimer <= 0) {
					chaser.x = chaser.spawnX;
					chaser.y = chaser.spawnY;
					chaser.z = 0;
					chaser.vy = 0;
					chaser.dir = chaser.initialDir;
					chaser.yaw = chaser.initialDir >= 0 ? Math.PI * 0.42 : -Math.PI * 0.42;
					chaser.aiMode = 'patrol';
					chaser.aiTimer = chaser.patrolDuration ?? CONFIG.HAZARD.CHASER_PATROL_DURATION;
					chaser.ladderCooldown = 0;
					chaser.onLadder = false;
					chaser.activeLadder = null;
					chaser.currentPlatform = null;
					chaser.alive = true;
					chaser.mesh.visible = true;
				}
				continue;
			}

			if (!chaser.currentPlatform && !chaser.onLadder) {
				const sup = findSupportingPlatform(chaser.x, chaser.y, chaser.y - chaser.radius - 0.15, platforms);
				if (sup) {
					chaser.currentPlatform = sup.platform;
				}
			}

			stepChaserPhysics(chaser, levelDef, playerPhysics, dt);
			const isChasing = chaser.aiMode === 'chase';
			chaser.mesh.visible = true;
			chaser.mesh.position.set(chaser.x, chaser.y, chaser.z ?? 0);

			// 進行方向（カメラからも凶悪な顔が見える斜め前向き ±75°）または梯子時は奥向きへ滑らかに旋回
			const targetYaw = chaser.onLadder
				? Math.PI * 0.92
				: (chaser.dir >= 0 ? Math.PI * 0.42 : -Math.PI * 0.42);
			let yawDiff = (targetYaw - (chaser.yaw ?? targetYaw) + Math.PI) % (Math.PI * 2) - Math.PI;
			if (yawDiff < -Math.PI) {
				yawDiff += Math.PI * 2;
			}
			chaser.yaw = (chaser.yaw ?? targetYaw) + yawDiff * (1 - Math.exp(-12 * dt));
			chaser.mesh.rotation.y = chaser.yaw;

			// 足元の鋸歯車輪を移動速度に応じて回転させる
			const wheelSpin = chaser.onLadder
				? dt * 4.5
				: (Math.max(1.2, Math.abs(chaser.vx || 0)) * dt) / Math.max(0.1, chaser.radius * 0.42);
			if (chaser.leftWheel && chaser.rightWheel) {
				chaser.leftWheel.rotation.x += wheelSpin;
				chaser.rightWheel.rotation.x += wheelSpin;
			}

			// 巡回 / 追跡に応じた発光強度・前傾・ハサミクロー威嚇アニメーション
			const animFreq = isChasing ? 13.5 : 5.2;
			const armSwing = Math.sin(this._elapsed * animFreq) * (isChasing ? 0.42 : 0.18);
			const clawSnap = 0.22 + Math.abs(Math.sin(this._elapsed * (isChasing ? 11.0 : 4.0))) * (isChasing ? 0.34 : 0.14);
			if (chaser.leftArm && chaser.rightArm) {
				chaser.leftArm.rotation.x = (isChasing ? -0.35 : -0.1) + armSwing;
				chaser.rightArm.rotation.x = (isChasing ? -0.35 : -0.1) - armSwing;
			}
			if (chaser.leftClawTop && chaser.leftClawBottom && chaser.rightClawTop && chaser.rightClawBottom) {
				chaser.leftClawTop.rotation.x = Math.PI * 0.5 + clawSnap;
				chaser.leftClawBottom.rotation.x = Math.PI * 0.5 - clawSnap;
				chaser.rightClawTop.rotation.x = Math.PI * 0.5 + clawSnap;
				chaser.rightClawBottom.rotation.x = Math.PI * 0.5 - clawSnap;
			}
			if (chaser.bodyGroup) {
				chaser.bodyGroup.rotation.x = isChasing ? 0.14 : 0.04;
				chaser.bodyGroup.position.y = Math.abs(Math.sin(this._elapsed * animFreq)) * (isChasing ? 0.025 : 0.01);
			}

			const baseScale = chaser.visualScale ?? 1;
			if (isChasing) {
				chaser.eyeMat.emissiveIntensity = 3.2 + Math.sin(this._elapsed * 18) * 0.4;
				chaser.coreGlowMat.emissiveIntensity = 2.4 + Math.sin(this._elapsed * 14) * 0.45;
				const pulse = 1 + 0.05 * Math.abs(Math.sin(this._elapsed * 12));
				if (chaser.visualPivot) {
					const s = baseScale * pulse;
					chaser.visualPivot.scale.setScalar(s);
					chaser.visualPivot.position.y = chaser.radius * (s - 1);
				} else {
					chaser.mesh.scale.setScalar(pulse);
				}
			} else {
				chaser.eyeMat.emissiveIntensity = 1.65;
				chaser.coreGlowMat.emissiveIntensity = 1.05;
				if (chaser.visualPivot) {
					chaser.visualPivot.scale.setScalar(baseScale);
					chaser.visualPivot.position.y = chaser.radius * (baseScale - 1);
				} else {
					chaser.mesh.scale.setScalar(1);
				}
			}
		}

		// 5. 落下障害物
		for (const faller of this._fallingHazards) {
			const res = stepFallingHazard(faller, playerPhysics, bounds, dt);
			if (res?.impacted) {
				fallingImpacts.push(res);
			}
			if (faller.phaseState === 'telegraph') {
				faller.mesh.visible = false;
				faller.reticle.visible = true;
				const topY = faller.spawnY;
				const botY = faller.despawnY ?? 0;
				faller.reticle.position.set(faller.x, (topY + botY) * 0.5, 0);
				faller.reticleMat.opacity = 0.25 + 0.4 * Math.abs(Math.sin(this._elapsed * 24));
			} else if (faller.phaseState === 'falling') {
				faller.reticle.visible = false;
				faller.mesh.visible = true;
				faller.mesh.position.set(faller.x, faller.y, 0);
				faller.mesh.rotation.y += dt * 6;
			} else {
				faller.mesh.visible = false;
				faller.reticle.visible = false;
			}
		}

		const hitResult = checkAllHazardInteractions(
			{
				presses: this._presses,
				burners: this._burners,
				electricTraps: this._electricTraps,
				chasers: this._chasers,
				fallingHazards: this._fallingHazards,
				pitFires: this._pitFires
			},
			playerPhysics,
			hasHammer
		);

		return {
			...hitResult,
			pressSlams,
			fallingImpacts,
			activeBurners,
			activeArcs,
			burnerIgnites,
			arcDischarges
		};
	}

	clear() {
		while (this.group.children.length > 0) {
			this.group.remove(this.group.children[0]);
		}
		// ステージクリア時の崩落演出等で非表示になったまま次ステージ・次周回へ持ち越さないよう必ず可視状態へ戻す
		this.group.visible = true;
		this._elapsed = 0;
		this._trapElapsed = 0;
		for (const g of this._geometries) {
			g.dispose();
		}
		for (const m of this._materials) {
			m.dispose();
		}
		this._geometries = [];
		this._materials = [];
		this._presses = [];
		this._burners = [];
		this._electricTraps = [];
		this._chasers = [];
		this._fallingHazards = [];
		this._pitFires = [];
	}

	dispose() {
		this.clear();
		this.scene.remove(this.group);
	}
}
