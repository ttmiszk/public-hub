import { CONFIG, GAME_STATES, STAGES, getLoopDifficulty } from './config.js';

/**
 * ゲーム全体の進行状態・スコア・残機・ステージ進行を一元管理するクラス
 */
export class GameState {
	/**
	 * @param {object} [options]
	 * @param {Storage|null} [options.storage] テスト用に差し替え可能なストレージ
	 */
	constructor(options = {}) {
		this._storage = options.storage !== undefined ? options.storage : this._resolveSafeStorage();
		this.currentState = GAME_STATES.TITLE;
		this.previousState = null;
		this.stageIndex = 0;
		this.loop = 1;
		this.score = 0;
		this.stageStartScore = 0;
		this.bonusItemCount = 0;
		this.stageStartBonusItemCount = 0;
		this.highScore = this._loadHighScore();
		this.lives = CONFIG.PLAYER.INITIAL_LIVES;
		this.devInvincible = false;
		this.stateTimer = 0;
		this.elapsedPlayTime = 0;

		// ボスHUD表示用ステータス（STAGE 3 ボス戦で使用）
		this.bossVisible = false;
		this.bossHp = 0;
		this.bossMaxHp = 3;

		this._listeners = new Set();
	}

	/**
	 * file:// 環境等で localStorage が制限された場合にもクラッシュしないよう安全に解決する
	 */
	_resolveSafeStorage() {
		try {
			if (typeof window !== 'undefined' && window.localStorage) {
				return window.localStorage;
			}
		} catch (_err) {
			// セキュリティポリシーでアクセス不可の場合はメモリ保持のみとする
		}
		return null;
	}

	_loadHighScore() {
		if (!this._storage) {
			return 0;
		}
		try {
			const raw = this._storage.getItem(CONFIG.HIGH_SCORE_STORAGE_KEY);
			const parsed = Number.parseInt(raw, 10);
			return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
		} catch (_err) {
			return 0;
		}
	}

	_saveHighScore() {
		if (!this._storage) {
			return;
		}
		try {
			this._storage.setItem(CONFIG.HIGH_SCORE_STORAGE_KEY, String(this.highScore));
		} catch (_err) {
			// 書き込み禁止環境では無言でフォールバック
		}
	}

	/**
	 * 状態変化の購読者を登録する
	 * @param {(nextState: string, prevState: string|null, state: GameState) => void} listener
	 * @returns {() => void} 解除関数
	 */
	subscribe(listener) {
		this._listeners.add(listener);
		return () => this._listeners.delete(listener);
	}

	_notify(prevState) {
		for (const listener of this._listeners) {
			listener(this.currentState, prevState, this);
		}
	}

	/**
	 * 現在のステージメタ情報を取得する
	 */
	getCurrentStageInfo() {
		return STAGES[this.stageIndex] || STAGES[0];
	}

	/**
	 * 現在の周回における最終ステージ（STAGE 3）かどうかを返す
	 * @returns {boolean}
	 */
	isFinalStageOfLoop() {
		return this.stageIndex + 1 >= STAGES.length;
	}

	/**
	 * 現在の周回数に応じた難易度・スコア係数を取得する
	 */
	getLoopDifficulty() {
		return getLoopDifficulty(this.loop);
	}

	/**
	 * 状態を遷移する
	 * @param {string} nextState
	 */
	setState(nextState) {
		if (this.currentState === nextState) {
			return;
		}
		const prevState = this.currentState;
		this.previousState = prevState;
		this.currentState = nextState;
		this.stateTimer = 0;
		this._notify(prevState);
	}

	/**
	 * 新規ゲームを開始する（デフォルトは STAGE 1・初期残機・Loop 1、開発用テスト指定も受け付ける）
	 * @param {{ stageIndex?: number, lives?: number, loop?: number, devInvincible?: boolean }} [options]
	 */
	startNewGame(options = {}) {
		const rawStage = Number.isInteger(options.stageIndex) ? options.stageIndex : 0;
		const clampedStage = Math.max(0, Math.min(STAGES.length - 1, rawStage));
		const rawLives = Number.isFinite(options.lives) ? Math.floor(options.lives) : CONFIG.PLAYER.INITIAL_LIVES;
		const clampedLives = Math.max(1, Math.min(99, rawLives));
		const rawLoop = Number.isFinite(options.loop) ? Math.floor(options.loop) : 1;
		const clampedLoop = Math.max(1, Math.min(99, rawLoop));

		this.stageIndex = clampedStage;
		this.loop = clampedLoop;
		this.score = 0;
		this.stageStartScore = 0;
		this.bonusItemCount = 0;
		this.stageStartBonusItemCount = 0;
		this.lives = clampedLives;
		this.devInvincible = Boolean(options.devInvincible);
		this.elapsedPlayTime = 0;
		this.hideBossHp();
		this.setState(GAME_STATES.STAGE_INTRO);
	}

	/**
	 * 現在のステージを最初からやり直す（ポーズメニューの RESTART 用）
	 */
	restartCurrentStage() {
		// スコア・1UP進捗稼ぎループを防ぐため、ステージ開始時点の値へ巻き戻す
		this.score = this.stageStartScore;
		this.bonusItemCount = this.stageStartBonusItemCount;
		this.hideBossHp();
		this.setState(GAME_STATES.STAGE_INTRO);
	}

	/**
	 * タイトル画面へ戻る
	 */
	returnToTitle() {
		this.loop = 1;
		this.devInvincible = false;
		this.hideBossHp();
		this.setState(GAME_STATES.TITLE);
	}

	/**
	 * ポーズ切り替え
	 */
	togglePause() {
		if (this.currentState === GAME_STATES.PLAYING) {
			this.setState(GAME_STATES.PAUSED);
			return true;
		}
		if (this.currentState === GAME_STATES.PAUSED) {
			this.setState(GAME_STATES.PLAYING);
			return true;
		}
		return false;
	}

	/**
	 * 基本ポイントに現在の周回スコア倍率を掛けて加算し、実際に加算されたスコアを返す
	 * @param {number} points
	 * @returns {number}
	 */
	addScore(points) {
		if (!Number.isFinite(points) || points <= 0) {
			return 0;
		}
		const { scoreMultiplier } = this.getLoopDifficulty();
		const awarded = Math.max(1, Math.round(points * scoreMultiplier));
		this.score += awarded;
		if (this.score > this.highScore) {
			this.highScore = this.score;
			this._saveHighScore();
		}
		return awarded;
	}

	/**
	 * ボーナスアイテム獲得数を加算し、規定数達成時にライフを1つ増やす（1UP）
	 * @returns {{ count: number, progress: number, threshold: number, extraLifeEarned: boolean, lives: number }}
	 */
	collectBonusItem() {
		this.bonusItemCount += 1;
		const threshold = CONFIG.SCORE.BONUS_ITEMS_PER_1UP || 5;
		const remainder = this.bonusItemCount % threshold;
		const extraLifeEarned = remainder === 0;
		if (extraLifeEarned) {
			this.lives = Math.min(99, this.lives + 1);
		}
		return {
			count: this.bonusItemCount,
			progress: remainder,
			threshold,
			extraLifeEarned,
			lives: this.lives
		};
	}

	/**
	 * ミス発生時の処理（残機を消費してミス演出状態へ。崩壊死時は即時ゲームオーバー）
	 * @param {{ forceGameOver?: boolean }} [options]
	 */
	triggerPlayerMiss(options = {}) {
		if (this.currentState !== GAME_STATES.PLAYING) {
			return;
		}
		if (options.forceGameOver) {
			this.lives = 0;
		} else {
			this.lives = Math.max(0, this.lives - 1);
		}
		this.setState(GAME_STATES.PLAYER_MISS);
	}

	/**
	 * ステージクリア時の処理
	 */
	triggerStageClear() {
		if (this.currentState !== GAME_STATES.PLAYING) {
			return;
		}
		const stageClearBonus = CONFIG.SCORE.STAGE_CLEAR_BASE * (this.stageIndex + 1);
		this.addScore(stageClearBonus);
		this.setState(GAME_STATES.STAGE_CLEAR);
	}

	/**
	 * 経過タイマーを更新し、演出完了に応じた自動遷移を行う
	 * @param {number} dt
	 */
	update(dt) {
		if (this.currentState === GAME_STATES.PLAYING) {
			this.elapsedPlayTime += dt;
			return;
		}

		if (this.currentState === GAME_STATES.PAUSED) {
			// ポーズ中はタイマーを一切進めない
			return;
		}

		this.stateTimer += dt;

		if (this.currentState === GAME_STATES.STAGE_INTRO) {
			if (this.stateTimer >= CONFIG.TIMING.STAGE_INTRO_DURATION) {
				this.setState(GAME_STATES.PLAYING);
			}
			return;
		}

		if (this.currentState === GAME_STATES.PLAYER_MISS) {
			if (this.stateTimer >= CONFIG.TIMING.PLAYER_MISS_DURATION) {
				if (this.lives > 0) {
					this.setState(GAME_STATES.STAGE_INTRO);
				} else {
					this.setState(GAME_STATES.GAME_OVER);
				}
			}
			return;
		}

		if (this.currentState === GAME_STATES.STAGE_CLEAR) {
			// 最終ステージ（STAGE 3）クリア時は演出をじっくり眺められるよう自動周回せずボタン押下待ちにする
			if (!this.isFinalStageOfLoop() && this.stateTimer >= CONFIG.TIMING.STAGE_CLEAR_DURATION) {
				this.advanceAfterStageClear();
			}
		}
	}

	/**
	 * ステージクリア後に次ステージへ進む（STAGE 3 クリア後は難易度を上げて STAGE 1 へ周回ループ）
	 */
	advanceAfterStageClear() {
		if (this.stageIndex + 1 < STAGES.length) {
			this.stageIndex += 1;
		} else {
			this.loop += 1;
			this.stageIndex = 0;
		}
		this.stageStartScore = this.score;
		this.stageStartBonusItemCount = this.bonusItemCount;
		this.hideBossHp();
		this.setState(GAME_STATES.STAGE_INTRO);
	}

	setBossHp(hp, maxHp) {
		this.bossVisible = true;
		this.bossHp = Math.max(0, hp);
		this.bossMaxHp = Math.max(1, maxHp);
	}

	hideBossHp() {
		this.bossVisible = false;
		this.bossHp = 0;
	}
}
