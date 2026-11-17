/**
 * IRON CLIMB 全体設定・定数定義
 * マジックナンバーを排除し、状態定義・ステージ情報・物理・描画・UI設定を一元管理する。
 */

export const GAME_STATES = Object.freeze({
	TITLE: 'TITLE',
	STAGE_INTRO: 'STAGE_INTRO',
	PLAYING: 'PLAYING',
	PAUSED: 'PAUSED',
	PLAYER_MISS: 'PLAYER_MISS',
	STAGE_CLEAR: 'STAGE_CLEAR',
	GAME_OVER: 'GAME_OVER',
	ENDING: 'ENDING'
});

export const CAMERA_MODES = Object.freeze({
	FOLLOW: 'FOLLOW',
	OVERVIEW: 'OVERVIEW',
	IMMERSIVE: 'IMMERSIVE'
});

export const STAGES = Object.freeze([
	{
		id: 1,
		name: 'STAGE 1',
		subtitle: 'CONSTRUCTION SITE',
		description: '巨大な建設現場'
	},
	{
		id: 2,
		name: 'STAGE 2',
		subtitle: 'INDUSTRIAL FACTORY',
		description: '巨大な工場'
	},
	{
		id: 3,
		name: 'STAGE 3',
		subtitle: 'FINAL TOWER',
		description: '巨大な機械塔'
	}
]);

export const CONFIG = Object.freeze({
	GAME_TITLE: 'IRON CLIMB',
	VERSION: '0.1.0',
	HIGH_SCORE_STORAGE_KEY: 'iron_climb_high_score_v1',

	// 描画・パフォーマンス設定
	RENDER: {
		MAX_PIXEL_RATIO: 2,
		SHADOW_MAP_SIZE: 2048,
		FOV: 45,
		NEAR: 0.1,
		FAR: 300,
		TONE_MAPPING_EXPOSURE: 1.1
	},

	// ゲームループ制御
	LOOP: {
		// タブ非アクティブ復帰時の異常なタイムステップ飛びを防ぐ上限（秒）
		MAX_DELTA_TIME: 0.05
	},

	// 各状態演出の所要時間（秒）
	TIMING: {
		STAGE_INTRO_DURATION: 2.65,
		PLAYER_MISS_DURATION: 1.6,
		STAGE_CLEAR_DURATION: 4.7
	},

	// プレイヤー基本設定
	PLAYER: {
		INITIAL_LIVES: 3,
		RADIUS: 0.34,
		FOOT_MARGIN: 0.22,
		HEIGHT: 1.55,
		MOVE_SPEED: 6.8,
		GROUND_ACCEL: 56.0,
		GROUND_DECEL: 48.0,
		AIR_ACCEL: 32.0,
		AIR_CONTROL_RATE: 0.78,
		CLIMB_SPEED: 4.4,
		LADDER_GRAB_HALF_WIDTH: 0.5,
		LADDER_SNAP_SPEED: 14.0,
		JUMP_VELOCITY: 11.6,
		GRAVITY: 28.5,
		MAX_FALL_SPEED: 22.0,
		COYOTE_TIME: 0.08,
		JUMP_BUFFER_TIME: 0.1,
		FALL_DEATH_Y: -8.0
	},

	// 斜め3D追従・動的切替カメラ設定
	CAMERA: {
		OFFSET_X: 2.2,
		OFFSET_Y: 4.8,
		OFFSET_Z: 12.8,
		LOOK_AHEAD_X: 1.6,
		LOOK_OFFSET_Y: 1.3,
		FOLLOW_STIFFNESS_X: 6.5,
		FOLLOW_STIFFNESS_Y: 5.5,
		AIR_Y_DEADZONE: 1.4,
		INTRO_HEIGHT_OFFSET: 5.0,
		INTRO_Z_OFFSET: 6.0,
		OVERVIEW_CENTER_X: 0,
		OVERVIEW_CENTER_Y: 11.4,
		OVERVIEW_Z: 34.5,
		OVERVIEW_PARALLAX_X: 0.14,
		OVERVIEW_PARALLAX_Y: 0.12,
		OVERVIEW_FOV: 46,
		IMMERSIVE_BACK_OFFSET: 8.5,
		IMMERSIVE_HEIGHT_OFFSET: 4.4,
		IMMERSIVE_Z_OFFSET: 25.5,
		IMMERSIVE_LOOK_AHEAD: 2.0,
		IMMERSIVE_LOOK_Y: 0.4,
		IMMERSIVE_CENTER_BLEND_X: 0.65,
		IMMERSIVE_CENTER_Y: 10.6,
		IMMERSIVE_BLEND_Y: 0.38,
		IMMERSIVE_TURN_STIFFNESS: 1.25,
		IMMERSIVE_FOV: 50
	},

	// 入力設定
	INPUT: {
		GAMEPAD_DEADZONE: 0.25,
		STICK_DIGITAL_THRESHOLD: 0.5
	},

	// サウンド設定（Web Audio API）
	AUDIO: {
		MASTER_GAIN: 0.85,
		BGM_GAIN: 0.55,
		SE_GAIN: 0.9,
		REVERB_WET_GAIN: 0.24,
		MAX_ACTIVE_VOICES: 20,
		STEP_COOLDOWN: 0.08,
		CLIMB_COOLDOWN: 0.16,
		BOUNCE_COOLDOWN: 0.075,
		IMPACT_COOLDOWN: 0.065
	},

	// スコア設定
	SCORE: {
		JUMP_OVER_OBSTACLE: 100,
		ITEM_BONUS: 300,
		BONUS_ITEMS_PER_1UP: 5,
		ENEMY_DEFEAT: 500,
		STAGE_CLEAR_BASE: 1000
	},

	// 敵・障害物・パワーアップ設定
	ENEMY: {
		BARREL_RADIUS: 0.44,
		BARREL_SPEED: 5.6,
		FAST_BARREL_SPEED: 7.1,
		BARREL_GRAVITY: 26.0,
		BARREL_MAX_FALL_SPEED: 18.0,
		BARREL_LADDER_DROP_CHANCE: 0.38,
		BARREL_THROW_INTERVAL_MIN: 1.15,
		BARREL_THROW_INTERVAL_MAX: 3.35,
		BARREL_THROW_VX: 4.4,
		BARREL_THROW_VY: 3.6,
		BARREL_BOUNCE_VY: 3.4,
		BARREL_EDGE_VX_DAMP: 0.22,
		JUMP_OVER_RADIUS_X: 0.72,
		JUMP_OVER_MAX_HEIGHT: 2.2,
		HAMMER_DURATION: 6.5
	},

	// STAGE 2 / 3 ギミック・追跡敵・落下障害物設定
	HAZARD: {
		CHASER_SPEED: 3.1,
		CHASER_PATROL_SPEED_RATE: 0.72,
		CHASER_PATROL_DURATION: 3.2,
		CHASER_CHASE_DURATION: 2.8,
		CHASER_CLIMB_SPEED: 2.9,
		CHASER_RADIUS: 0.36,
		CHASER_GRAVITY: 24.0,
		FALLING_GRAVITY: 18.0,
		FALLING_MAX_SPEED: 14.0,
		FALLING_RADIUS: 0.34,
		PRESS_HIT_HALF_W_MARGIN: 0.08
	},

	// STAGE 3 最終ボス「OVERLORD MK-III」設定
	BOSS: {
		MAX_HP: 3,
		SCORE_NODE_HIT: 500,
		SCORE_DEFEAT: 3000,
		SHOCKWAVE_SPEED: 6.2,
		MORTAR_TELEGRAPH_TIME: 0.85,
		TIRE_INTERVAL_MIN: 1.55,
		TIRE_INTERVAL_MAX: 4.05,
		TIRE_THROW_VX: 4.5,
		TIRE_THROW_VY: 3.5,
		QUAKE_COOLDOWN_MIN: 7.5,
		QUAKE_COOLDOWN_MAX: 12.0,
		QUAKE_WINDUP_TIME: 1.15,
		QUAKE_DURATION_MIN: 2.2,
		QUAKE_DURATION_MAX: 5.0,
		QUAKE_EXPOSURE_LIMIT: 1.15
	},

	// 周回ループ難易度＆スコア係数設定
	// Loop 2 で敵速度・出現頻度の向上をはっきり実感でき、Loop 4 以降で高難度アーケードバランスへ到達させる
	LOOP_DIFFICULTY: {
		SPEED_LINEAR: 0.1,
		SPEED_QUAD: 0.016,
		MAX_SPEED_SCALE: 2.0,
		FREQ_LINEAR: 0.24,
		FREQ_QUAD: 0.055,
		MAX_FREQ_SCALE: 2.85,
		FAST_CHANCE_PER_LOOP: 0.085,
		MAX_FAST_CHANCE_BONUS: 0.45,
		SCORE_MULTIPLIER_PER_LOOP: 0.5
	}
});

/**
 * 現在の周回数（1始まり）に対する敵速度・ギミック出現頻度・獲得スコア倍率を返す純粋関数
 * @param {number} [loop]
 * @returns {{ loop: number, speedScale: number, frequencyScale: number, intervalScale: number, fastChanceBonus: number, scoreMultiplier: number }}
 */
export function getLoopDifficulty(loop = 1) {
	const safeLoop = Number.isFinite(loop) ? Math.max(1, Math.min(99, Math.floor(loop))) : 1;
	const extraLoops = safeLoop - 1;
	const cfg = CONFIG.LOOP_DIFFICULTY;

	const speedScale = Math.min(
		cfg.MAX_SPEED_SCALE,
		1 + cfg.SPEED_LINEAR * extraLoops + cfg.SPEED_QUAD * extraLoops * extraLoops
	);
	const frequencyScale = Math.min(
		cfg.MAX_FREQ_SCALE,
		1 + cfg.FREQ_LINEAR * extraLoops + cfg.FREQ_QUAD * extraLoops * extraLoops
	);
	const fastChanceBonus = Math.min(cfg.MAX_FAST_CHANCE_BONUS, extraLoops * cfg.FAST_CHANCE_PER_LOOP);
	const scoreMultiplier = 1 + cfg.SCORE_MULTIPLIER_PER_LOOP * extraLoops;

	return {
		loop: safeLoop,
		speedScale,
		frequencyScale,
		intervalScale: 1 / frequencyScale,
		fastChanceBonus,
		scoreMultiplier
	};
}

/**
 * 投擲・攻撃間隔にランダム性と時折の間合い（スキ）を持たせて単調化・詰み重なりを防ぐ共通ヘルパー
 * @param {number} minBase
 * @param {number} maxBase
 * @param {number} [intervalScale]
 * @param {() => number} [rng]
 * @param {number} [breatherChance]
 * @param {number} [breatherMaxBonus]
 * @returns {number}
 */
export function sampleRandomizedInterval(
	minBase,
	maxBase,
	intervalScale = 1,
	rng = Math.random,
	breatherChance = 0.2,
	breatherMaxBonus = 1.0
) {
	const base = minBase + rng() * Math.max(0, maxBase - minBase);
	const breather = rng() < breatherChance ? (0.45 + rng() * 0.55) * breatherMaxBonus : 0;
	return (base + breather) * intervalScale;
}
