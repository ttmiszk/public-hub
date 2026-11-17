import { CONFIG } from './config.js';

/**
 * プラットフォーム（水平・傾斜スロープ）および梯子・壁の衝突判定ユーティリティ
 * 描画オブジェクトに依存しない純粋計算とし、単体テスト容易性と安定性を確保する。
 */

/**
 * 指定 X 座標における足場上面の Y 座標を算出する（傾斜スロープ対応）
 * @param {object} platform
 * @param {number} x
 * @returns {number}
 */
export function getPlatformSurfaceY(platform, x) {
	const span = platform.xMax - platform.xMin;
	if (span <= 0.0001) {
		return platform.yStart;
	}
	const t = Math.max(0, Math.min(1, (x - platform.xMin) / span));
	return platform.yStart + (platform.yEnd - platform.yStart) * t;
}

/**
 * 指定 X 座標における足場の傾き角度（ラジアン）を返す
 * @param {object} platform
 * @returns {number}
 */
export function getPlatformSlopeAngle(platform) {
	const span = platform.xMax - platform.xMin;
	if (span <= 0.0001) {
		return 0;
	}
	return Math.atan2(platform.yEnd - platform.yStart, span);
}

/**
 * 足場の X 範囲内にプレイヤー足元が入っているかを判定する
 * @param {object} platform
 * @param {number} x
 * @param {number} footMargin
 * @returns {boolean}
 */
export function isWithinPlatformX(platform, x, footMargin = CONFIG.PLAYER.FOOT_MARGIN) {
	return x >= platform.xMin - footMargin && x <= platform.xMax + footMargin;
}

/**
 * 前フレームと今フレームの Y 座標から、着地・支持可能な足場を探索する（高速落下時のすり抜け防止）
 * @param {number} x 現在の X 座標
 * @param {number} prevY 前フレームの足元 Y 座標
 * @param {number} nextY 今フレームの足元 Y 座標
 * @param {Array<object>} platforms 足場配列
 * @param {object} [options]
 * @param {number} [options.footMargin]
 * @param {number} [options.stepUpTolerance] スロープ登坂や段差吸収の許容高さ
 * @param {number} [options.snapTolerance] 接地吸着の微小許容範囲
 * @returns {{ platform: object, surfaceY: number } | null}
 */
export function findSupportingPlatform(x, prevY, nextY, platforms, options = {}) {
	const footMargin = options.footMargin ?? CONFIG.PLAYER.FOOT_MARGIN;
	const stepUpTolerance = options.stepUpTolerance ?? 0.35;
	const snapTolerance = options.snapTolerance ?? 0.06;

	let bestMatch = null;
	let bestSurfaceY = -Infinity;

	for (const platform of platforms) {
		if (platform.collapsed || platform.hidden) {
			continue;
		}
		if (!isWithinPlatformX(platform, x, footMargin)) {
			continue;
		}
		const surfaceY = getPlatformSurfaceY(platform, x);

		// 前フレームで上面より上（または許容段差内）にあり、今フレームで上面以下に到達しているか
		const wasAbove = prevY >= surfaceY - stepUpTolerance;
		const reachedSurface = nextY <= surfaceY + snapTolerance;

		if (wasAbove && reachedSurface && surfaceY > bestSurfaceY) {
			bestSurfaceY = surfaceY;
			bestMatch = { platform, surfaceY };
		}
	}

	return bestMatch;
}

/**
 * 上昇中に頭頂が足場下面（天井）へ衝突するかを判定する（突き抜け防止）
 * @param {number} x
 * @param {number} prevY 前フレームの足元 Y
 * @param {number} nextY 今フレームの足元 Y
 * @param {number} playerHeight
 * @param {Array<object>} platforms
 * @param {number} [headMargin]
 * @returns {{ platform: object, bottomY: number } | null}
 */
export function findCeilingPlatform(
	x,
	prevY,
	nextY,
	playerHeight,
	platforms,
	headMargin = CONFIG.PLAYER.RADIUS * 0.75
) {
	const prevHeadY = prevY + playerHeight;
	const nextHeadY = nextY + playerHeight;

	let bestMatch = null;
	let lowestBottomY = Infinity;

	for (const platform of platforms) {
		if (platform.collapsed || platform.hidden || platform.oneWay) {
			continue;
		}
		if (x < platform.xMin - headMargin || x > platform.xMax + headMargin) {
			continue;
		}
		const thickness = platform.thickness ?? 0.45;
		const surfaceY = getPlatformSurfaceY(platform, x);
		const bottomY = surfaceY - thickness;

		// 直前まで天井下面付近以下にあり、今フレームで下面を突き上げ、かつ上面よりは下にいる場合
		const wasBelowCeiling = prevHeadY <= bottomY + 0.16;
		const hitCeiling = nextHeadY > bottomY && nextY < surfaceY - 0.05;

		if (wasBelowCeiling && hitCeiling && bottomY < lowestBottomY) {
			lowestBottomY = bottomY;
			bestMatch = { platform, bottomY };
		}
	}

	return bestMatch;
}

/**
 * 足場側面や傾斜スロープ下の狭い空間へのめり込みを水平方向から押し戻す
 * @param {number} prevX
 * @param {number} x
 * @param {number} y
 * @param {number} vx
 * @param {number} radius
 * @param {number} height
 * @param {Array<object>} platforms
 * @returns {{ x: number, vx: number }}
 */
export function resolvePlatformSideCollisions(
	prevX,
	x,
	y,
	vx,
	radius,
	height,
	platforms,
	currentPlatform = null,
	stepUpTolerance = 0.3
) {
	let outX = x;
	let outVx = vx;

	for (const platform of platforms) {
		if (platform.collapsed || platform.hidden || platform.oneWay || platform === currentPlatform) {
			continue;
		}
		if (outX + radius <= platform.xMin || outX - radius >= platform.xMax) {
			continue;
		}

		// プレイヤー水平範囲と足場が重なる区間での上面・下面を算出
		const sampleX = Math.max(platform.xMin, Math.min(platform.xMax, outX));
		const surfaceY = getPlatformSurfaceY(platform, sampleX);
		const thickness = platform.thickness ?? 0.45;
		const bottomY = surfaceY - thickness;

		// すでに足場上面に立っている／スロープを無理なく乗り越えられる高さなら干渉しない
		if (y >= surfaceY - stepUpTolerance) {
			continue;
		}

		// 体（足元+0.2 〜 頭頂-0.05）が足場下面より上に侵入していれば側面・スロープ下ブロック対象
		const playerHeadY = y + height - 0.04;
		if (playerHeadY <= bottomY + 0.02) {
			continue;
		}

		// 横側面から侵入した場合、またはスロープ下の狭い三角領域へ入り込んだ場合のみ水平押し戻しを行う
		// （水平足場の真下/真上から重なったケースで足場端へ長距離ワープするのを防ぐ）
		if (prevX <= platform.xMin) {
			outX = platform.xMin - radius;
			if (outVx > 0) {
				outVx = 0;
			}
		} else if (prevX >= platform.xMax) {
			outX = platform.xMax + radius;
			if (outVx < 0) {
				outVx = 0;
			}
		} else if (Math.abs(platform.yEnd - platform.yStart) > 0.01) {
			// 傾斜スロープ下の狭い三角領域へ入り込んだ場合は、高い側の方向（前フレーム位置）へ押し戻す
			outX = prevX;
			outVx = 0;
		}
	}

	return { x: outX, vx: outVx };
}

/**
 * 指定位置の直下にある最も高い足場表面を返す（着地ターゲットリング投影用）
 * @param {number} x
 * @param {number} y
 * @param {Array<object>} platforms
 * @returns {{ platform: object, surfaceY: number, slopeAngle: number } | null}
 */
export function findGroundBelow(x, y, platforms) {
	let best = null;
	let bestY = -Infinity;

	for (const platform of platforms) {
		if (platform.collapsed || platform.hidden) {
			continue;
		}
		if (!isWithinPlatformX(platform, x, CONFIG.PLAYER.FOOT_MARGIN)) {
			continue;
		}
		const surfaceY = getPlatformSurfaceY(platform, x);
		if (surfaceY <= y + 0.15 && surfaceY > bestY) {
			bestY = surfaceY;
			best = {
				platform,
				surfaceY,
				slopeAngle: getPlatformSlopeAngle(platform)
			};
		}
	}

	return best;
}

/**
 * プレイヤーの現在位置と上下入力に応じて掴まれる梯子を検索する
 * @param {number} x
 * @param {number} y
 * @param {number} moveY (+1: 上入力, -1: 下入力)
 * @param {Array<object>} ladders
 * @returns {object | null}
 */
export function findClimbableLadder(x, y, moveY, ladders) {
	if (Math.abs(moveY) < 0.35) {
		return null;
	}

	let bestLadder = null;
	let minDistX = Infinity;

	for (const ladder of ladders) {
		if (ladder.collapsed) {
			continue;
		}
		const halfW = ladder.halfWidth ?? CONFIG.PLAYER.LADDER_GRAB_HALF_WIDTH;
		const distX = Math.abs(x - ladder.x);
		if (distX > halfW) {
			continue;
		}

		// 上方向入力: 下端付近〜登頂上限の少し手前まで掴める
		const effectiveTop = ladder.broken ? (ladder.climbMaxY ?? ladder.yTop) : ladder.yTop;
		if (moveY > 0) {
			if (y >= ladder.yBottom - 0.35 && y < effectiveTop - 0.08) {
				if (distX < minDistX) {
					minDistX = distX;
					bestLadder = ladder;
				}
			}
			continue;
		}

		// 下方向入力: 通常梯子は上端足場上からも掴めるが、途切れ梯子は上階から床を突き抜けて掴めない
		if (moveY < 0) {
			const topGrabMargin = ladder.broken ? 0.15 : 0.45;
			if (y > ladder.yBottom + 0.12 && y <= effectiveTop + topGrabMargin) {
				if (distX < minDistX) {
					minDistX = distX;
					bestLadder = ladder;
				}
			}
		}
	}

	return bestLadder;
}

/**
 * 壁・ストッパー（SolidBox）との AABB 衝突を解決し、めり込みを押し戻す
 * @param {number} x プレイヤー中心 X
 * @param {number} y プレイヤー足元 Y
 * @param {number} vx
 * @param {number} vy
 * @param {number} radius
 * @param {number} height
 * @param {Array<object>} solidBoxes
 * @returns {{ x: number, y: number, vx: number, vy: number, hitGround: boolean, hitCeiling: boolean }}
 */
export function resolveSolidBoxes(x, y, vx, vy, radius, height, solidBoxes) {
	let outX = x;
	let outY = y;
	let outVx = vx;
	let outVy = vy;
	let hitGround = false;
	let hitCeiling = false;

	for (const box of solidBoxes) {
		if (box.disabled || box.hidden) {
			continue;
		}
		const overlapLeft = (outX + radius) - box.xMin;
		const overlapRight = box.xMax - (outX - radius);
		const overlapBottom = (outY + height) - box.yMin;
		const overlapTop = box.yMax - outY;

		if (overlapLeft <= 0 || overlapRight <= 0 || overlapBottom <= 0 || overlapTop <= 0) {
			continue;
		}

		// 最小貫通軸に沿って押し戻す
		const minX = Math.min(overlapLeft, overlapRight);
		const minY = Math.min(overlapBottom, overlapTop);

		if (minX <= minY) {
			if (overlapLeft < overlapRight) {
				outX -= overlapLeft;
				if (outVx > 0) {
					outVx = 0;
				}
			} else {
				outX += overlapRight;
				if (outVx < 0) {
					outVx = 0;
				}
			}
		} else if (overlapTop <= overlapBottom) {
			outY += overlapTop;
			if (outVy < 0) {
				outVy = 0;
			}
			hitGround = true;
		} else {
			outY -= overlapBottom;
			if (outVy > 0) {
				outVy = 0;
			}
			hitCeiling = true;
		}
	}

	return {
		x: outX,
		y: outY,
		vx: outVx,
		vy: outVy,
		hitGround,
		hitCeiling
	};
}
