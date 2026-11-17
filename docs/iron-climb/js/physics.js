import { CONFIG } from './config.js';
import {
	findCeilingPlatform,
	findClimbableLadder,
	findGroundBelow,
	findSupportingPlatform,
	getPlatformSurfaceY,
	isWithinPlatformX,
	resolvePlatformSideCollisions,
	resolveSolidBoxes
} from './collision.js';

/**
 * プレイヤー物理状態の初期オブジェクトを生成する
 * @param {object} [spawn]
 * @returns {object}
 */
export function createPlayerPhysicsState(spawn = {}) {
	return {
		x: spawn.x ?? 0,
		y: spawn.y ?? 0,
		z: spawn.z ?? 0,
		vx: 0,
		vy: 0,
		grounded: false,
		onLadder: false,
		activeLadder: null,
		currentPlatform: null,
		facingDir: 1, // +1: 右向き, -1: 左向き
		coyoteTimer: 0,
		jumpBufferTimer: 0,
		invincibleTimer: 0,
		dropThroughPlatform: null,
		dropThroughTimer: 0,
		groundBelow: null
	};
}

function approach(current, target, maxDelta) {
	if (current < target) {
		return Math.min(target, current + maxDelta);
	}
	if (current > target) {
		return Math.max(target, current - maxDelta);
	}
	return target;
}

/**
 * プレイヤーの1フレーム分の物理移動・ジャンプ・スロープ追従・梯子昇降・衝突解決を行う
 * @param {object} state createPlayerPhysicsState で生成した状態
 * @param {object} input InputManager 互換の入力値
 * @param {object} levelGeometry { platforms, ladders, solidBoxes, bounds }
 * @param {number} dt 経過時間（秒）
 * @returns {{ justJumped: boolean, justLanded: boolean, landImpactSpeed: number, fellOut: boolean }}
 */
export function stepPlayerPhysics(state, input, levelGeometry, dt) {
	const platforms = levelGeometry.platforms || [];
	const ladders = levelGeometry.ladders || [];
	const solidBoxes = levelGeometry.solidBoxes || [];
	const bounds = levelGeometry.bounds || { xMin: -20, xMax: 20, deathY: CONFIG.PLAYER.FALL_DEATH_Y };

	const events = {
		justJumped: false,
		justLanded: false,
		landImpactSpeed: 0,
		fellOut: false
	};

	const wasGrounded = state.grounded;
	const prevVy = state.vy;

	// 足場や梯子が崩落（collapsed）した場合は即座に掴まり／接地を解除して落下させる
	if (state.onLadder && state.activeLadder?.collapsed) {
		state.onLadder = false;
		state.activeLadder = null;
		state.z = 0;
	}
	if (state.grounded && state.currentPlatform?.collapsed) {
		state.grounded = false;
		state.currentPlatform = null;
		state.coyoteTimer = 0;
	}

	if (state.invincibleTimer > 0) {
		state.invincibleTimer = Math.max(0, state.invincibleTimer - dt);
	}
	if (state.dropThroughTimer > 0) {
		state.dropThroughTimer = Math.max(0, state.dropThroughTimer - dt);
		if (state.dropThroughTimer <= 0) {
			state.dropThroughPlatform = null;
		}
	}

	// ジャンプ先行入力バッファ（着地直前の入力を取りこぼさない）
	if (input.jumpJustPressed) {
		state.jumpBufferTimer = CONFIG.PLAYER.JUMP_BUFFER_TIME;
	} else {
		state.jumpBufferTimer = Math.max(0, state.jumpBufferTimer - dt);
	}

	// コヨーテタイマー更新（足場を離れた直後の極短いジャンプ猶予）
	if (state.grounded) {
		state.coyoteTimer = CONFIG.PLAYER.COYOTE_TIME;
	} else {
		state.coyoteTimer = Math.max(0, state.coyoteTimer - dt);
	}

	// 梯子掴まり開始判定
	if (!state.onLadder && Math.abs(input.moveY) >= 0.35) {
		const ladder = findClimbableLadder(state.x, state.y, input.moveY, ladders);
		if (ladder) {
			state.onLadder = true;
			state.activeLadder = ladder;
			state.grounded = false;
			state.currentPlatform = null;
			state.vx = 0;
			state.vy = 0;
			state.coyoteTimer = 0;
			state.jumpBufferTimer = 0;
			// 上端から降り始める場合はわずかに足場下へ寄せて引っかかりを防止（通常梯子のみ）
			if (input.moveY < 0 && !ladder.broken && state.y >= ladder.yTop - 0.05) {
				state.y = ladder.yTop - 0.08;
			}
		}
	}

	if (state.onLadder && state.activeLadder) {
		_stepOnLadder(state, input, levelGeometry, dt, events);
	} else {
		_stepFreeMovement(state, input, platforms, solidBoxes, bounds, dt, events);
	}

	// 空中から着地した瞬間のイベント通知
	if (!wasGrounded && state.grounded) {
		events.justLanded = true;
		events.landImpactSpeed = Math.abs(prevVy);
	}

	// 足元直下の足場情報を更新（着地ターゲットリング・カメラ基準用）
	state.groundBelow = findGroundBelow(state.x, state.y, platforms);

	// 落下ミス判定
	const deathY = bounds.deathY ?? CONFIG.PLAYER.FALL_DEATH_Y;
	if (state.y < deathY) {
		events.fellOut = true;
	}

	return events;
}

function _stepOnLadder(state, input, levelGeometry, dt, events) {
	const ladder = state.activeLadder;
	const platforms = levelGeometry.platforms || [];

	// 梯子中心 X へ滑らかに引き寄せる
	const snapAlpha = Math.min(1, CONFIG.PLAYER.LADDER_SNAP_SPEED * dt);
	state.x += (ladder.x - state.x) * snapAlpha;
	if (ladder.z !== undefined) {
		state.z += (ladder.z - state.z) * snapAlpha;
	}

	// 梯子昇降中にジャンプが押された場合は梯子離脱ジャンプを許可
	if (input.jumpJustPressed) {
		state.onLadder = false;
		state.activeLadder = null;
		state.vy = CONFIG.PLAYER.JUMP_VELOCITY * 0.85;
		state.vx = input.moveX * CONFIG.PLAYER.MOVE_SPEED * CONFIG.PLAYER.AIR_CONTROL_RATE;
		if (Math.abs(input.moveX) > 0.1) {
			state.facingDir = Math.sign(input.moveX);
		}
		events.justJumped = true;
		return;
	}

	const climbDir = Math.abs(input.moveY) > 0.2 ? input.moveY : 0;
	const prevY = state.y;
	state.vy = climbDir * CONFIG.PLAYER.CLIMB_SPEED;
	state.y += state.vy * dt;

	const maxClimbY = ladder.climbMaxY ?? ladder.yTop;

	// 途切れ梯子など登頂上限がある場合は、天井めり込みと上限の両方で止める
	if (ladder.broken) {
		if (state.vy > 0) {
			const ceiling = findCeilingPlatform(ladder.x, prevY, state.y, CONFIG.PLAYER.HEIGHT, platforms);
			if (ceiling) {
				state.y = ceiling.bottomY - CONFIG.PLAYER.HEIGHT;
				state.vy = 0;
			}
		}
		if (state.y > maxClimbY) {
			state.y = maxClimbY;
			state.vy = 0;
		}
	}

	// 梯子上端到達：上の足場へ自動着地
	if (!ladder.broken && state.y >= ladder.yTop) {
		state.y = ladder.yTop;
		state.vy = 0;
		state.onLadder = false;
		state.activeLadder = null;
		state.grounded = true;
		const support = findSupportingPlatform(state.x, state.y + 0.1, state.y, platforms);
		state.currentPlatform = support ? support.platform : null;
		return;
	}

	// 梯子下端到達：下の足場へ自動着地
	if (state.y <= ladder.yBottom) {
		state.y = ladder.yBottom;
		state.vy = 0;
		state.onLadder = false;
		state.activeLadder = null;
		state.grounded = true;
		const support = findSupportingPlatform(state.x, state.y + 0.1, state.y, platforms);
		state.currentPlatform = support ? support.platform : null;
		return;
	}

	// 上下端ごく近傍でのみ横移動で自然離脱を許可（中段での不自然な落下を防ぐ）
	const nearBottom = Math.abs(state.y - ladder.yBottom) <= 0.22;
	const nearTop = !ladder.broken && Math.abs(state.y - ladder.yTop) <= 0.22;
	if ((nearBottom || nearTop) && Math.abs(input.moveX) > 0.6) {
		state.onLadder = false;
		state.activeLadder = null;
		state.facingDir = Math.sign(input.moveX);
	}
}

function _stepFreeMovement(state, input, platforms, solidBoxes, bounds, dt, events) {
	// 進行方向の更新
	if (Math.abs(input.moveX) > 0.1) {
		state.facingDir = Math.sign(input.moveX);
	}

	// 接地時・空中時の水平加速
	const controlScale = state.grounded ? 1.0 : CONFIG.PLAYER.AIR_CONTROL_RATE;
	const targetVx = input.moveX * CONFIG.PLAYER.MOVE_SPEED * controlScale;
	const accel = state.grounded
		? (Math.abs(input.moveX) > 0.05 ? CONFIG.PLAYER.GROUND_ACCEL : CONFIG.PLAYER.GROUND_DECEL)
		: CONFIG.PLAYER.AIR_ACCEL;

	state.vx = approach(state.vx, targetVx, accel * dt);

	// 乗っている足場の搬送速度（コンベア・移動床）を加算
	let carryVx = 0;
	let carryVy = 0;
	if (state.grounded && state.currentPlatform) {
		carryVx = (state.currentPlatform.conveyorSpeed || 0) + (state.currentPlatform.vx || 0);
		carryVy = state.currentPlatform.vy || 0;
	}

	// ジャンプ実行判定（コヨーテタイム + 先行入力バッファ使用、かつボタン長押し再発火は禁止）
	if (state.jumpBufferTimer > 0 && state.coyoteTimer > 0) {
		state.vy = CONFIG.PLAYER.JUMP_VELOCITY;
		state.grounded = false;
		state.currentPlatform = null;
		state.coyoteTimer = 0;
		state.jumpBufferTimer = 0;
		events.justJumped = true;
	}

	// 重力積分
	if (!state.grounded) {
		state.vy = Math.max(
			-CONFIG.PLAYER.MAX_FALL_SPEED,
			state.vy - CONFIG.PLAYER.GRAVITY * dt
		);
	}

	const prevX = state.x;
	const prevY = state.y;
	state.x += (state.vx + carryVx) * dt;
	let nextY = state.y + (state.vy + carryVy) * dt;

	// ステージ水平境界クランプ
	const minBoundX = (bounds.xMin ?? -20) + CONFIG.PLAYER.RADIUS;
	const maxBoundX = (bounds.xMax ?? 20) - CONFIG.PLAYER.RADIUS;
	if (state.x < minBoundX) {
		state.x = minBoundX;
		if (state.vx < 0) {
			state.vx = 0;
		}
	} else if (state.x > maxBoundX) {
		state.x = maxBoundX;
		if (state.vx > 0) {
			state.vx = 0;
		}
	}

	const supportPlatforms = state.dropThroughPlatform
		? platforms.filter((p) => p !== state.dropThroughPlatform)
		: platforms;

	// 足場側面・スロープ下の狭い空間へのめり込みを水平押し戻し
	const sideResolved = resolvePlatformSideCollisions(
		prevX,
		state.x,
		prevY,
		state.vx,
		CONFIG.PLAYER.RADIUS,
		CONFIG.PLAYER.HEIGHT,
		supportPlatforms,
		state.currentPlatform
	);
	state.x = sideResolved.x;
	state.vx = sideResolved.vx;

	// SolidBox 上面に立っている間の接地維持（毎フレーム微小落下→押し戻しで justLanded が連打されるのを防ぐ）
	let onSolidBoxTop = false;
	if (state.grounded && !state.currentPlatform && state.vy <= 0) {
		const supportingBox = solidBoxes.find((box) => (
			!box.disabled
			&& !box.hidden
			&& state.x + CONFIG.PLAYER.RADIUS > box.xMin + 0.001
			&& state.x - CONFIG.PLAYER.RADIUS < box.xMax - 0.001
			&& Math.abs(state.y - box.yMax) <= 0.04
		));
		if (supportingBox) {
			state.y = supportingBox.yMax;
			state.vy = 0;
			onSolidBoxTop = true;
		} else {
			state.grounded = false;
		}
	}

	// スロープ歩行中の滑らかな追従（接地中かつジャンプしていない場合）
	if (onSolidBoxTop) {
		// SolidBox 上面で接地維持済み
	} else if (state.grounded && state.currentPlatform && state.vy <= 0) {
		const curPlat = state.currentPlatform;
		const strictlyInsideCurrent = state.x >= curPlat.xMin && state.x <= curPlat.xMax;
		const withinFootMargin = isWithinPlatformX(curPlat, state.x);

		// 同一ライン上により高い上りスロープや接続足場が自然段差内にある場合は乗り移る
		const stepUpCandidate = _findSeamlessAdjacentPlatform(state.x, state.y, curPlat, supportPlatforms, strictlyInsideCurrent);
		if (stepUpCandidate) {
			state.y = stepUpCandidate.surfaceY;
			state.vy = 0;
			state.currentPlatform = stepUpCandidate.platform;
		} else if (withinFootMargin) {
			nextY = getPlatformSurfaceY(curPlat, state.x);
			state.y = nextY;
			state.vy = 0;
		} else {
			// 足場端を外れた際、すぐ下に接続足場・下りスロープがあれば空中に浮かず吸着する
			const dropSnap = findSupportingPlatform(state.x, prevY, nextY - 0.28, supportPlatforms, {
				stepUpTolerance: 0.28,
				snapTolerance: 0.08
			});
			if (dropSnap) {
				state.y = dropSnap.surfaceY;
				state.vy = 0;
				state.currentPlatform = dropSnap.platform;
			} else {
				// 足場端から踏み外した場合は落下開始（このとき coyoteTimer が効く）
				state.grounded = false;
				state.currentPlatform = null;
				state.y = nextY;
			}
		}
	} else if (state.vy <= 0) {
		// 下降中：連続衝突判定で足場着地を確認
		const support = findSupportingPlatform(state.x, prevY, nextY, supportPlatforms);
		if (support) {
			state.y = support.surfaceY;
			state.vy = 0;
			state.grounded = true;
			state.currentPlatform = support.platform;
			state.dropThroughPlatform = null;
			state.dropThroughTimer = 0;
		} else {
			state.y = nextY;
			state.grounded = false;
			state.currentPlatform = null;
		}
	} else {
		// 上昇中：実体足場下面（天井）に頭が当たったら突き抜けず押し戻す
		const ceiling = findCeilingPlatform(state.x, prevY, nextY, CONFIG.PLAYER.HEIGHT, supportPlatforms);
		if (ceiling) {
			state.y = ceiling.bottomY - CONFIG.PLAYER.HEIGHT;
			state.vy = 0;
		} else {
			state.y = nextY;
		}
		state.grounded = false;
		state.currentPlatform = null;
	}

	// Z軸をステージ基準ライン（0）へ緩やかに戻す
	state.z += (0 - state.z) * Math.min(1, dt * 8);

	// 壁・ストッパー（SolidBox）との衝突解決
	if (solidBoxes.length > 0) {
		const resolved = resolveSolidBoxes(
			state.x,
			state.y,
			state.vx,
			state.vy,
			CONFIG.PLAYER.RADIUS,
			CONFIG.PLAYER.HEIGHT,
			solidBoxes
		);
		state.x = resolved.x;
		state.y = resolved.y;
		state.vx = resolved.vx;
		state.vy = resolved.vy;
		if (resolved.hitGround) {
			state.grounded = true;
		}
	}
}

/**
 * 接地歩行中に現在足場から隣接スロープ・段差足場へ途切れなく乗り移る候補を探す
 */
function _findSeamlessAdjacentPlatform(x, currentY, currentPlatform, platforms, strictlyInsideCurrent) {
	const currentSurfaceY = getPlatformSurfaceY(currentPlatform, x);
	let best = null;
	let bestScoreY = currentSurfaceY;

	for (const p of platforms) {
		if (p === currentPlatform) {
			continue;
		}
		// 接続元足場の実体を完全に抜けた場合はマージンあり、実体内の場合は厳密範囲内でのみ乗り上げ判定
		const inRange = strictlyInsideCurrent
			? (x >= p.xMin && x <= p.xMax)
			: isWithinPlatformX(p, x);
		if (!inRange) {
			continue;
		}

		const candidateY = getPlatformSurfaceY(p, x);
		const diff = candidateY - currentY;

		// 上りスロープ・小段差への乗り上げ（最大 0.25u）
		if (candidateY > currentSurfaceY + 0.005 && diff <= 0.25) {
			if (candidateY > bestScoreY) {
				bestScoreY = candidateY;
				best = { platform: p, surfaceY: candidateY };
			}
			continue;
		}

		// 現在足場の実体端を超えた張り出しゾーンでは、下りスロープへの乗り継ぎも許可
		if (!strictlyInsideCurrent && diff <= 0.05 && diff >= -0.25) {
			if (!best || candidateY > best.surfaceY) {
				best = { platform: p, surfaceY: candidateY };
			}
		}
	}

	return best;
}

/**
 * 鉄骨振動攻撃などでプレイヤーを現在の足場（または梯子）から1つ下の階へ強制的に振り落とす
 * @param {object} state PlayerPhysicsState
 * @param {Array<object>} platforms
 * @returns {boolean} 振り落としが発動したら true
 */
export function forceDropOneFloor(state, platforms = []) {
	if (!state || (!state.grounded && !state.onLadder)) {
		return false;
	}
	const curPlat = state.currentPlatform;
	const curY = state.y;

	// 今いる位置より下にある足場を探す（最下層では振り落とさない）
	const lowerPlatforms = [];
	for (const p of platforms) {
		if (p === curPlat || p.collapsed || p.hidden) {
			continue;
		}
		const clampedX = Math.max(p.xMin, Math.min(p.xMax, state.x));
		const sy = getPlatformSurfaceY(p, clampedX);
		if (sy < curY - 0.65) {
			lowerPlatforms.push({ p, clampedX, sy });
		}
	}
	if (lowerPlatforms.length === 0) {
		return false;
	}

	// 1つ下の階層で真下に足場がない隙間だった場合は、最寄り下階足場方向へ水平誘導して安全に着地させる
	const directBelow = lowerPlatforms.some((c) => state.x >= c.p.xMin + 0.15 && state.x <= c.p.xMax - 0.15);
	if (!directBelow) {
		lowerPlatforms.sort((a, b) => Math.abs(a.clampedX - state.x) - Math.abs(b.clampedX - state.x));
		const nearest = lowerPlatforms[0];
		const safeX = Math.max(nearest.p.xMin + 0.55, Math.min(nearest.p.xMax - 0.55, nearest.clampedX));
		const dir = Math.sign(safeX - state.x) || 1;
		state.vx = dir * Math.min(4.8, Math.max(2.4, Math.abs(safeX - state.x) * 3.0));
	}

	// 梯子掴まり中だった場合は梯子から手を離して下の階へ落とす
	if (state.onLadder) {
		state.onLadder = false;
		state.activeLadder = null;
		state.z = 0;
	}

	if (curPlat) {
		state.dropThroughPlatform = curPlat;
		state.dropThroughTimer = 0.55;
		state.y -= 0.14;
	}
	state.grounded = false;
	state.currentPlatform = null;
	state.coyoteTimer = 0;
	state.vy = -4.2;
	return true;
}
