/**
 * タイトル画面のライブ3Dデモ用アトラクトAIコントローラ
 * プレイヤーの移動・小休止・障害物/トラップ予測ジャンプを擬似入力として生成し、
 * 実物理・アニメーションで生き生きとしたデモ演技を再生する。
 */

const STAGE_PATROL_BOUNDS = Object.freeze({
	1: { minX: -12.4, maxX: 9.6 },
	2: { minX: -12.2, maxX: 1.8 },
	3: { minX: -12.5, maxX: 11.0 }
});

/**
 * ステージ1Fの安全巡回範囲を返す
 * @param {number} stageId
 * @returns {{ minX: number, maxX: number }}
 */
export function getAttractPatrolBounds(stageId) {
	return STAGE_PATROL_BOUNDS[stageId] || STAGE_PATROL_BOUNDS[1];
}

export class AttractDemoController {
	constructor() {
		this._dir = 1;
		this._phaseTimer = 0;
		this._pauseTimer = 0;
		this._nextPauseDelay = 4.2;
		this._jumpCooldown = 0;
		this._jumpHoldTimer = 0;
	}

	reset() {
		this._dir = 1;
		this._phaseTimer = 0;
		this._pauseTimer = 0;
		this._nextPauseDelay = 4.0;
		this._jumpCooldown = 0;
		this._jumpHoldTimer = 0;
	}

	/**
	 * 1フレーム分のデモ用擬似入力オブジェクトを生成する
	 * @param {object} playerPhysics
	 * @param {object|null} level
	 * @param {Array<object>} barrels
	 * @param {Array<object>} chasers
	 * @param {number} dt
	 * @returns {{ moveX: number, moveY: number, jumpHeld: boolean, jumpJustPressed: boolean }}
	 */
	buildInput(playerPhysics, level, barrels = [], chasers = [], dt = 0.016) {
		const stageId = level?.id ?? 1;
		const bounds = getAttractPatrolBounds(stageId);
		const px = playerPhysics?.x ?? 0;
		const py = playerPhysics?.y ?? 0;

		this._jumpCooldown = Math.max(0, this._jumpCooldown - dt);
		this._jumpHoldTimer = Math.max(0, this._jumpHoldTimer - dt);

		// 巡回端での方向転換
		if (px <= bounds.minX) {
			this._dir = 1;
		} else if (px >= bounds.maxX) {
			this._dir = -1;
		}

		// 自然な小休止リズム（障害物が直前に迫っている時は休まない）
		const dangerIncoming = this._shouldJumpForThreats(px, py, this._dir, level, barrels, chasers);

		if (this._pauseTimer > 0) {
			if (dangerIncoming) {
				this._pauseTimer = 0;
			} else {
				this._pauseTimer = Math.max(0, this._pauseTimer - dt);
			}
		} else {
			this._phaseTimer += dt;
			if (this._phaseTimer >= this._nextPauseDelay && !dangerIncoming && playerPhysics?.grounded) {
				this._phaseTimer = 0;
				this._pauseTimer = 0.95;
				this._nextPauseDelay = 3.8 + (Math.abs(Math.sin(px * 1.7)) * 2.4);
			}
		}

		const moveX = this._pauseTimer > 0 ? 0 : this._dir;

		let jumpJustPressed = false;
		if (dangerIncoming && this._jumpCooldown <= 0 && playerPhysics?.grounded) {
			jumpJustPressed = true;
			this._jumpCooldown = 0.72;
			this._jumpHoldTimer = 0.24;
		}

		return {
			moveX,
			moveY: 0,
			jumpJustPressed,
			jumpHeld: jumpJustPressed || this._jumpHoldTimer > 0
		};
	}

	_shouldJumpForThreats(px, py, dir, level, barrels, chasers) {
		// 1. 転がってくる樽・ドラム缶・タイヤを予測してジャンプ回避
		for (const b of barrels) {
			if (!b || b.destroyed) {
				continue;
			}
			const dy = Math.abs((b.y ?? 0) - py);
			if (dy > 2.3) {
				continue;
			}
			const dx = (b.x ?? 0) - px;
			const dist = Math.abs(dx);
			const approaching = dist > 0.2 && ((b.vx ?? 0) * dx <= 0.1 || Math.sign(dx) === dir);
			if (approaching && dist >= 0.45 && dist <= 2.7) {
				return true;
			}
		}

		// 2. 追跡スパークボットを検知してジャンプ回避
		for (const c of chasers) {
			if (!c || c.destroyed) {
				continue;
			}
			if (Math.abs((c.y ?? 0) - py) > 1.8) {
				continue;
			}
			const dx = (c.x ?? 0) - px;
			const dist = Math.abs(dx);
			if (dist >= 0.4 && dist <= 2.4 && Math.sign(dx) === dir) {
				return true;
			}
		}

		// 3. 1F上の床設置トラップ（炎バーナー・電気ショック）を進行方向手前で飛び越える
		for (const b of level?.burners || []) {
			if (Math.abs((b.y ?? 0) - py) > 1.5) {
				continue;
			}
			const ahead = (b.x - px) * dir;
			if (ahead >= 0.45 && ahead <= 1.85) {
				return true;
			}
		}
		for (const e of level?.electricTraps || []) {
			const trapY = Math.min(e.y1 ?? 0, e.y2 ?? 0);
			if (Math.abs(trapY - py) > 1.5) {
				continue;
			}
			const trapX = ((e.x1 ?? 0) + (e.x2 ?? 0)) * 0.5;
			const ahead = (trapX - px) * dir;
			if (ahead >= 0.45 && ahead <= 1.85) {
				return true;
			}
		}

		return false;
	}
}
