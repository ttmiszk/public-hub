import * as THREE from 'three';
import { CAMERA_MODES, CONFIG } from './config.js';

function expDamp(current, target, stiffness, dt) {
	return current + (target - current) * (1 - Math.exp(-stiffness * dt));
}

const CAMERA_MODE_ORDER = [
	CAMERA_MODES.IMMERSIVE,
	CAMERA_MODES.FOLLOW,
	CAMERA_MODES.OVERVIEW
];

const CAMERA_MODE_LABELS = Object.freeze({
	[CAMERA_MODES.FOLLOW]: { badge: 'CAM: FOLLOW [C]', menu: 'CAM: FOLLOW', toast: 'VIEW: FOLLOW' },
	[CAMERA_MODES.OVERVIEW]: { badge: 'CAM: OVERVIEW [C]', menu: 'CAM: OVERVIEW', toast: 'VIEW: STAGE OVERVIEW' },
	[CAMERA_MODES.IMMERSIVE]: { badge: 'CAM: BEHIND [C]', menu: 'CAM: BEHIND', toast: 'VIEW: BEHIND ANGLE' }
});

/**
 * 動的視点切替（通常追従 / ステージ全体俯瞰 / 斜め後ろ遠景ビュー）を制御するカメラマネージャー
 */
export class CameraManager {
	/**
	 * @param {THREE.PerspectiveCamera} camera
	 */
	constructor(camera) {
		this.camera = camera;
		this._mode = CAMERA_MODES.IMMERSIVE;
		this._anchorY = 0;
		this._lookAheadX = 0;
		this._smoothFacingDir = 1;
		this._currentFov = CONFIG.RENDER.FOV;
		this._currentPos = new THREE.Vector3(0, 5, 13);
		this._currentLook = new THREE.Vector3(0, 1.5, 0);
		this._shakeIntensity = 0;
		this._shakeTime = 0;
	}

	setShakeIntensity(intensity) {
		this._shakeIntensity = Math.max(0, intensity || 0);
	}

	getMode() {
		return this._mode;
	}

	/**
	 * カメラ視点モードを設定する
	 * @param {string} mode
	 */
	setMode(mode) {
		this._mode = CAMERA_MODE_ORDER.includes(mode) ? mode : CAMERA_MODES.IMMERSIVE;
		return this._mode;
	}

	/**
	 * カメラ視点モードを順番に切り替える（BEHIND → FOLLOW → OVERVIEW）
	 */
	cycleMode() {
		const idx = CAMERA_MODE_ORDER.indexOf(this._mode);
		const nextMode = CAMERA_MODE_ORDER[(idx + 1) % CAMERA_MODE_ORDER.length];
		this.setMode(nextMode);
		return nextMode;
	}

	getDisplayLabels() {
		return CAMERA_MODE_LABELS[this._mode] || CAMERA_MODE_LABELS[CAMERA_MODES.IMMERSIVE];
	}

	_computeModeTargets(physicsState) {
		const camCfg = CONFIG.CAMERA;
		const px = physicsState.x || 0;
		const pz = physicsState.z || 0;
		const anchorY = this._anchorY;

		if (this._mode === CAMERA_MODES.OVERVIEW) {
			const relY = anchorY - 10.0;
			return {
				posX: camCfg.OVERVIEW_CENTER_X + px * camCfg.OVERVIEW_PARALLAX_X,
				posY: camCfg.OVERVIEW_CENTER_Y + relY * camCfg.OVERVIEW_PARALLAX_Y,
				posZ: pz + camCfg.OVERVIEW_Z,
				lookX: camCfg.OVERVIEW_CENTER_X + px * (camCfg.OVERVIEW_PARALLAX_X + 0.04),
				lookY: (camCfg.OVERVIEW_CENTER_Y - 1.0) + relY * (camCfg.OVERVIEW_PARALLAX_Y + 0.02),
				lookZ: pz,
				fov: camCfg.OVERVIEW_FOV,
				stiffnessX: 4.5,
				stiffnessY: 4.5
			};
		}

		if (this._mode === CAMERA_MODES.IMMERSIVE) {
			// 斜め後ろ遠景ビュー：上層階や背後も含めステージ全体が見渡せる距離から、浅い斜め角度でプレイヤー背後を捉える
			const dir = this._smoothFacingDir;
			const baseX = px * camCfg.IMMERSIVE_CENTER_BLEND_X;
			const baseY = camCfg.IMMERSIVE_CENTER_Y + (anchorY - camCfg.IMMERSIVE_CENTER_Y) * camCfg.IMMERSIVE_BLEND_Y;
			return {
				posX: baseX - dir * camCfg.IMMERSIVE_BACK_OFFSET,
				posY: baseY + camCfg.IMMERSIVE_HEIGHT_OFFSET,
				posZ: pz + camCfg.IMMERSIVE_Z_OFFSET,
				lookX: baseX + dir * camCfg.IMMERSIVE_LOOK_AHEAD,
				lookY: baseY + camCfg.IMMERSIVE_LOOK_Y,
				lookZ: pz,
				fov: camCfg.IMMERSIVE_FOV,
				stiffnessX: 4.5,
				stiffnessY: 4.8
			};
		}

		// デフォルト: プレイヤー近接・斜め上追従ビュー
		const heightRatio = Math.max(0, Math.min(1, anchorY / 16));
		return {
			posX: px + this._lookAheadX + camCfg.OFFSET_X * 0.85,
			posY: anchorY + camCfg.OFFSET_Y + heightRatio * 0.6,
			posZ: pz + camCfg.OFFSET_Z + heightRatio * 1.4,
			lookX: px + this._lookAheadX * 0.55,
			lookY: anchorY + camCfg.LOOK_OFFSET_Y,
			lookZ: pz,
			fov: CONFIG.RENDER.FOV,
			stiffnessX: camCfg.FOLLOW_STIFFNESS_X,
			stiffnessY: camCfg.FOLLOW_STIFFNESS_Y
		};
	}

	_syncCameraFov(targetFov, dt, instant = false) {
		this._currentFov = instant ? targetFov : expDamp(this._currentFov, targetFov, 6.0, dt);
		if (Math.abs(this.camera.fov - this._currentFov) > 0.02) {
			this.camera.fov = this._currentFov;
			this.camera.updateProjectionMatrix?.();
		}
	}

	/**
	 * プレイヤー位置へ即座にカメラをリセットする（現在の選択視点に合わせる）
	 * @param {{ x: number, y: number, z?: number, facingDir?: number }} targetPos
	 */
	snapToPlayer(targetPos) {
		const desiredDir = (targetPos.facingDir ?? 1) >= 0 ? 1 : -1;
		this._anchorY = targetPos.y || 0;
		this._smoothFacingDir = desiredDir;
		this._lookAheadX = desiredDir * (CONFIG.CAMERA.LOOK_AHEAD_X * 0.45);

		const t = this._computeModeTargets(targetPos);
		this._currentPos.set(t.posX, t.posY, t.posZ);
		this._currentLook.set(t.lookX, t.lookY, t.lookZ);

		this._syncCameraFov(t.fov, 1, true);
		this.camera.position.copy(this._currentPos);
		this.camera.lookAt(this._currentLook);
	}

	/**
	 * ステージイントロ中のシームレスな弧線カメラワーク
	 * 斜め上（ほぼ真上に近い上空遠景）から大きな弧を描いて横からの遠景を通り、
	 * 一度の連続運動で選択中のプレイ視点へ完全に一致させて着地する
	 * @param {{ x: number, y: number, z?: number, facingDir?: number }} targetPos
	 * @param {number} progress 0.0 〜 1.0
	 */
	updateIntro(targetPos, progress) {
		const camCfg = CONFIG.CAMERA;
		const t = Math.max(0, Math.min(1, progress));
		const desiredDir = (targetPos.facingDir ?? 1) >= 0 ? 1 : -1;

		// PLAYING 1フレーム目の updateFollow ターゲットと完全一致させて二重移動を防ぐ
		this._anchorY = targetPos.y || 0;
		this._smoothFacingDir = desiredDir;
		this._lookAheadX = desiredDir * (camCfg.LOOK_AHEAD_X * 0.45);
		const endTarget = this._computeModeTargets(targetPos);

		const endOffX = endTarget.posX - endTarget.lookX;
		const endOffY = endTarget.posY - endTarget.lookY;
		const endOffZ = endTarget.posZ - endTarget.lookZ;
		const endHoriz = Math.hypot(endOffX, endOffZ);
		const endRadius = Math.hypot(endHoriz, endOffY);
		const endElev = Math.atan2(endOffY, endHoriz);
		const endAzim = Math.atan2(endOffX, endOffZ);

		// 始点：ほぼ真上に近い斜め上空からステージ全体を見下ろす
		const startLookX = camCfg.OVERVIEW_CENTER_X;
		const startLookY = camCfg.OVERVIEW_CENTER_Y - 1.0;
		const startLookZ = 0;
		const startRadius = 37.5;
		const startElev = 1.18;
		const startAzim = -0.32;

		const u = t * t * (3 - 2 * t);
		const sinBump = Math.sin(Math.PI * u);

		// どのカメラモードでも中間（u=0.5）で必ずステージ全体を見渡せる横遠景距離を通る2次ベジェ半径
		const midRadius = 44.5 + Math.max(0, 36 - endRadius) * 0.55;
		const oneMinusU = 1 - u;
		const radius = oneMinusU * oneMinusU * startRadius + 2 * oneMinusU * u * midRadius + u * u * endRadius;
		const minSafeElev = Math.min(0.08, endElev);
		const elev = Math.max(minSafeElev, startElev + (endElev - startElev) * u - 0.52 * sinBump);
		const azim = startAzim + (endAzim - startAzim) * u + 0.56 * sinBump;

		const lookWeight = Math.pow(u, 1.25);
		const lookX = startLookX + (endTarget.lookX - startLookX) * lookWeight;
		const lookY = startLookY + (endTarget.lookY - startLookY) * lookWeight;
		const lookZ = startLookZ + (endTarget.lookZ - startLookZ) * lookWeight;

		const horiz = radius * Math.cos(elev);
		this._currentLook.set(lookX, lookY, lookZ);
		this._currentPos.set(
			lookX + horiz * Math.sin(azim),
			lookY + radius * Math.sin(elev),
			lookZ + horiz * Math.cos(azim)
		);

		const blendedFov = camCfg.OVERVIEW_FOV + (endTarget.fov - camCfg.OVERVIEW_FOV) * u;
		this._syncCameraFov(blendedFov, 0.016, true);
		this.camera.position.copy(this._currentPos);
		this.camera.lookAt(this._currentLook);
	}

	/**
	 * 通常プレイ中の滑らかな追従更新（視点変更時は新視点へ滑らかに補間遷移）
	 * @param {object} physicsState Player.physics
	 * @param {number} dt
	 */
	updateFollow(physicsState, dt) {
		const camCfg = CONFIG.CAMERA;

		// 進行方向への先読みオフセット＆斜め後ろ視点（BEHIND）用の滑らかで緩やかな向き補間
		const desiredDir = (physicsState.facingDir ?? 1) >= 0 ? 1 : -1;
		this._smoothFacingDir = expDamp(
			this._smoothFacingDir,
			desiredDir,
			camCfg.IMMERSIVE_TURN_STIFFNESS,
			dt
		);

		const desiredLookAhead = Math.abs(physicsState.vx || 0) > 0.5
			? Math.sign(physicsState.vx) * camCfg.LOOK_AHEAD_X
			: desiredDir * (camCfg.LOOK_AHEAD_X * 0.45);
		this._lookAheadX = expDamp(this._lookAheadX, desiredLookAhead, 3.2, dt);

		// ジャンプ中の過剰なカメラ上下揺れを防ぐ Y デッドゾーン制御
		if (physicsState.grounded || physicsState.onLadder) {
			this._anchorY = expDamp(this._anchorY, physicsState.y, camCfg.FOLLOW_STIFFNESS_Y, dt);
		} else {
			const diffY = physicsState.y - this._anchorY;
			if (Math.abs(diffY) > camCfg.AIR_Y_DEADZONE) {
				const excess = diffY - Math.sign(diffY) * camCfg.AIR_Y_DEADZONE;
				this._anchorY = expDamp(this._anchorY, this._anchorY + excess, camCfg.FOLLOW_STIFFNESS_Y * 0.85, dt);
			}
		}

		const t = this._computeModeTargets(physicsState);
		this._currentPos.x = expDamp(this._currentPos.x, t.posX, t.stiffnessX, dt);
		this._currentPos.y = expDamp(this._currentPos.y, t.posY, t.stiffnessY, dt);
		this._currentPos.z = expDamp(this._currentPos.z, t.posZ, t.stiffnessX, dt);

		this._currentLook.x = expDamp(this._currentLook.x, t.lookX, t.stiffnessX * 1.2, dt);
		this._currentLook.y = expDamp(this._currentLook.y, t.lookY, t.stiffnessY * 1.2, dt);
		this._currentLook.z = expDamp(this._currentLook.z, t.lookZ, t.stiffnessX, dt);

		this._syncCameraFov(t.fov, dt, false);
		this._shakeTime += dt;
		const sx = this._shakeIntensity > 0 ? Math.sin(this._shakeTime * 54) * 0.14 * this._shakeIntensity : 0;
		const sy = this._shakeIntensity > 0 ? Math.cos(this._shakeTime * 68) * 0.11 * this._shakeIntensity : 0;
		this.camera.position.set(this._currentPos.x + sx, this._currentPos.y + sy, this._currentPos.z);
		this.camera.lookAt(this._currentLook.x + sx * 0.5, this._currentLook.y + sy * 0.5, this._currentLook.z);
	}

	/**
	 * ボス撃破時のクライマックス演出用カメラ（最上段の姫＆ハートと崩落するボスを1画面に収める）
	 * @param {number} focusX
	 * @param {number} focusY
	 * @param {number} dt
	 */
	updateClimaxView(focusX, focusY, dt) {
		this._currentPos.x = expDamp(this._currentPos.x, focusX, 3.2, dt);
		this._currentPos.y = expDamp(this._currentPos.y, focusY + 1.5, 3.0, dt);
		this._currentPos.z = expDamp(this._currentPos.z, 35.5, 2.8, dt);

		this._currentLook.x = expDamp(this._currentLook.x, focusX, 3.5, dt);
		this._currentLook.y = expDamp(this._currentLook.y, focusY - 1.6, 3.2, dt);
		this._currentLook.z = expDamp(this._currentLook.z, 0, 3.5, dt);

		this._syncCameraFov(48, dt, false);
		this.camera.position.copy(this._currentPos);
		this.camera.lookAt(this._currentLook);
	}

	/**
	 * ボス撃破後、支柱倒壊〜鉄骨崩落〜ボス落下を見届けるボス追従カメラ
	 * @param {number} bossX
	 * @param {number} bossY
	 * @param {number} dt
	 */
	updateBossFallView(bossX, bossY, dt) {
		const targetPosX = bossX * 0.45 + 3.2;
		const targetPosY = Math.max(-2.5, bossY + 6.5);
		const targetPosZ = 25.5;
		const targetLookY = bossY + 1.0;

		this._currentPos.x = expDamp(this._currentPos.x, targetPosX, 2.4, dt);
		this._currentPos.y = expDamp(this._currentPos.y, targetPosY, 2.8, dt);
		this._currentPos.z = expDamp(this._currentPos.z, targetPosZ, 2.4, dt);

		this._currentLook.x = expDamp(this._currentLook.x, bossX * 0.65, 3.2, dt);
		this._currentLook.y = expDamp(this._currentLook.y, targetLookY, 3.4, dt);
		this._currentLook.z = expDamp(this._currentLook.z, 0, 3.2, dt);

		this._syncCameraFov(48, dt, false);
		this.camera.position.copy(this._currentPos);
		this.camera.lookAt(this._currentLook);
	}

	/**
	 * ボスがステージ下部へ消えた後、姫とプレイヤーのいる頂上デッキへゆっくり移動するカメラ
	 * @param {number} focusX
	 * @param {number} focusY
	 * @param {number} dt
	 */
	updateSlowReturnToDeck(focusX, focusY, dt) {
		this._currentPos.x = expDamp(this._currentPos.x, focusX + 0.25, 1.55, dt);
		this._currentPos.y = expDamp(this._currentPos.y, focusY + 0.75, 1.55, dt);
		this._currentPos.z = expDamp(this._currentPos.z, 9.2, 1.45, dt);

		this._currentLook.x = expDamp(this._currentLook.x, focusX, 1.85, dt);
		this._currentLook.y = expDamp(this._currentLook.y, focusY + 0.05, 1.85, dt);
		this._currentLook.z = expDamp(this._currentLook.z, 0, 1.85, dt);

		this._syncCameraFov(40, dt, false);
		this.camera.position.copy(this._currentPos);
		this.camera.lookAt(this._currentLook);
	}

	/**
	 * ステージクリア時に姫とプレイヤーを手繋ぎの周囲を滑らかに回り込みながら寄る映画風シネマカメラ
	 * @param {number} focusX
	 * @param {number} focusY
	 * @param {number} dt
	 * @param {number} [elapsed]
	 * @param {number} [sideSign]
	 */
	updateClearZoom(focusX, focusY, dt, elapsed = 0, sideSign = 1) {
		const dir = sideSign >= 0 ? 1 : -1;
		const t = Math.max(0, elapsed);
		const dollyWave = 1 - Math.exp(-t * 1.45);
		// 手前側（+Z）の ±54° 範囲をテンポよく横断し、寄り・引き・俯瞰から仰ぎへの変化を動的に演出する
		const azimuth = dir * 0.94 * Math.sin(t * 0.96 - 0.28);
		const radius = 7.4 - 3.1 * dollyWave - Math.sin(t * 1.25) * 0.72;
		const elev = 1.55 - 1.35 * dollyWave + Math.sin(t * 1.05 + 0.4) * 0.34;

		const targetPosX = focusX + Math.sin(azimuth) * radius;
		const targetPosY = focusY + elev;
		const targetPosZ = Math.cos(azimuth) * radius;

		this._currentPos.x = expDamp(this._currentPos.x, targetPosX, 3.8, dt);
		this._currentPos.y = expDamp(this._currentPos.y, targetPosY, 3.8, dt);
		this._currentPos.z = expDamp(this._currentPos.z, targetPosZ, 3.8, dt);

		const targetLookX = focusX + Math.sin(azimuth) * 0.12;
		const targetLookY = focusY + 0.05 - 0.08 * dollyWave;
		this._currentLook.x = expDamp(this._currentLook.x, targetLookX, 4.5, dt);
		this._currentLook.y = expDamp(this._currentLook.y, targetLookY, 4.5, dt);
		this._currentLook.z = expDamp(this._currentLook.z, 0, 4.5, dt);

		this._syncCameraFov(43 - 7.5 * dollyWave + Math.sin(t * 0.9) * 1.5, dt, false);
		this.camera.position.copy(this._currentPos);
		this.camera.lookAt(this._currentLook);
	}

	/**
	 * タイトル画面のライブ3Dデモ用シネマティック・カメラワーク
	 * ヒーロー仰角フォロー → ステージ全域対角スウィープ → 上層ボス＆姫クライマックスを滑らかに周回する
	 * @param {{ x?: number, y?: number, z?: number }} playerPos
	 * @param {number} elapsed
	 * @param {number} dt
	 */
	updateTitleShowcase(playerPos, elapsed, dt) {
		const px = playerPos?.x ?? -4.0;
		const py = playerPos?.y ?? 0.5;
		const cycle = 20.0;
		const tNorm = ((elapsed % cycle) + cycle) % cycle / cycle;

		// 3区間の連続キーフレームをサイン／コサイン重みでシームレス補間
		const frames = [
			// 0: 1Fのヒーローをやや斜めローアングルから捉え、背後の鉄骨と上層を見上げる
			{
				posX: Math.max(-10, Math.min(8, px * 0.55 + 4.8)),
				posY: py + 4.4,
				posZ: 15.8,
				lookX: px * 0.45,
				lookY: py + 4.6,
				lookZ: 0,
				fov: 48
			},
			// 1: 左側斜めからのダイナミック全景スウィープ（Z字の樽や背景設備を強調）
			{
				posX: -16.5,
				posY: 13.8,
				posZ: 28.5,
				lookX: 1.5,
				lookY: 10.8,
				lookZ: 0,
				fov: 46
			},
			// 2: 上層ボス＆姫付近へのドラマチック・クレインショット
			{
				posX: 13.5,
				posY: 18.8,
				posZ: 21.5,
				lookX: 0.5,
				lookY: 15.8,
				lookZ: 0,
				fov: 45
			},
			// 3: 右側引き俯瞰（ヒーローの1Fへ戻る前の壮大なワイドショット）
			{
				posX: 17.5,
				posY: 11.2,
				posZ: 30.0,
				lookX: -1.5,
				lookY: 9.2,
				lookZ: 0,
				fov: 47
			}
		];

		const segCount = frames.length;
		const scaled = tNorm * segCount;
		const idxA = Math.floor(scaled) % segCount;
		const idxB = (idxA + 1) % segCount;
		const localT = scaled - Math.floor(scaled);
		// Quintic smoothstep で加速度の変化まで滑らかに
		const u = localT * localT * localT * (localT * (localT * 6 - 15) + 10);

		const a = frames[idxA];
		const b = frames[idxB];
		const targetPosX = a.posX + (b.posX - a.posX) * u;
		const targetPosY = a.posY + (b.posY - a.posY) * u;
		const targetPosZ = a.posZ + (b.posZ - a.posZ) * u;
		const targetLookX = a.lookX + (b.lookX - a.lookX) * u;
		const targetLookY = a.lookY + (b.lookY - a.lookY) * u;
		const targetLookZ = a.lookZ + (b.lookZ - a.lookZ) * u;
		const targetFov = a.fov + (b.fov - a.fov) * u;

		this._currentPos.x = expDamp(this._currentPos.x, targetPosX, 2.4, dt);
		this._currentPos.y = expDamp(this._currentPos.y, targetPosY, 2.4, dt);
		this._currentPos.z = expDamp(this._currentPos.z, targetPosZ, 2.4, dt);

		this._currentLook.x = expDamp(this._currentLook.x, targetLookX, 2.8, dt);
		this._currentLook.y = expDamp(this._currentLook.y, targetLookY, 2.8, dt);
		this._currentLook.z = expDamp(this._currentLook.z, targetLookZ, 2.8, dt);

		this._syncCameraFov(targetFov, dt, false);
		this.camera.position.copy(this._currentPos);
		this.camera.lookAt(this._currentLook);
	}

	/**
	 * ゲームオーバー時のドラマチックなドリーアウト＆緩やかな俯瞰カメラ
	 * @param {number} focusX
	 * @param {number} focusY
	 * @param {number} elapsed
	 * @param {number} dt
	 */
	updateGameOverView(focusX, focusY, elapsed, dt) {
		const pull = Math.min(1, elapsed / 4.5);
		const drift = Math.sin(elapsed * 0.25) * 3.2;
		const targetPosX = focusX * 0.4 + drift;
		const targetPosY = Math.max(6.5, focusY * 0.55 + 6.5) + pull * 5.2;
		const targetPosZ = 18.0 + pull * 16.0;

		const targetLookX = focusX * 0.25;
		const targetLookY = Math.max(4.0, focusY * 0.5 + 3.0);

		this._currentPos.x = expDamp(this._currentPos.x, targetPosX, 1.5, dt);
		this._currentPos.y = expDamp(this._currentPos.y, targetPosY, 1.5, dt);
		this._currentPos.z = expDamp(this._currentPos.z, targetPosZ, 1.5, dt);

		this._currentLook.x = expDamp(this._currentLook.x, targetLookX, 2.0, dt);
		this._currentLook.y = expDamp(this._currentLook.y, targetLookY, 2.0, dt);
		this._currentLook.z = expDamp(this._currentLook.z, 0, 2.0, dt);

		this._syncCameraFov(44 + pull * 4, dt, false);
		this.camera.position.copy(this._currentPos);
		this.camera.lookAt(this._currentLook);
	}
}
