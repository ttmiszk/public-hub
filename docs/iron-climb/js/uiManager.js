import { CONFIG, GAME_STATES, STAGES } from './config.js';

/**
 * 画面オーバーレイとHUDの描画更新・メニューインタラクションを担うクラス
 */
export class UIManager {
	/**
	 * @param {object} handlers
	 * @param {() => void} handlers.onStartGame
	 * @param {() => void} [handlers.onRetryGame]
	 * @param {() => void} handlers.onResume
	 * @param {() => void} handlers.onRestart
	 * @param {() => void} handlers.onCycleCamera
	 * @param {() => void} handlers.onToggleMute
	 * @param {(scale: number) => void} [handlers.onChangeBgmVolume]
	 * @param {(scale: number) => void} [handlers.onChangeSeVolume]
	 * @param {() => void} handlers.onCycleQuality
	 * @param {(stageId: number) => void} handlers.onTestStagePreview
	 * @param {() => void} handlers.onNextLoop
	 * @param {() => void} handlers.onReturnToTitle
	 */
	constructor(handlers) {
		this._handlers = handlers;
		this._titleIndex = 0;
		this._controlsModalOpen = false;
		this._pauseIndex = 0;
		this._gameOverIndex = 0;
		this._lastPointerX = null;
		this._lastPointerY = null;
		this._fadeTimerId = 0;
		this._fadeRafId = 0;
		this._displayedScore = 0;
		this._devPanelOpen = false;
		this._devStageIndex = 0;
		this._devLives = CONFIG.PLAYER.INITIAL_LIVES;
		this._devLoop = 1;
		this._devInvincible = false;
		this._secretClicks = 0;
		this._secretClickTimer = 0;

		const doc = typeof document !== 'undefined' ? document : null;
		this._el = doc ? {
			cinematicBars: doc.getElementById('cinematic-bars'),
			hud: doc.getElementById('hud'),
			hudScoreCard: doc.getElementById('hud-score-card'),
			hudScore: doc.getElementById('hud-score'),
			hudHighScore: doc.getElementById('hud-highscore'),
			hudNewBestDot: doc.getElementById('hud-new-best-dot'),
			hudLoopPill: doc.getElementById('hud-loop-pill'),
			hudStageName: doc.getElementById('hud-stage-name'),
			hudStageSub: doc.getElementById('hud-stage-sub'),
			hudLives: doc.getElementById('hud-lives'),
			hudBonusPips: Array.from(doc.querySelectorAll('#hud-bonus-pips .bonus-pip')),
			hudBonusProgress: doc.getElementById('hud-bonus-progress'),
			hudInvincibleBadge: doc.getElementById('hud-invincible-badge'),
			hudGamepadBadge: doc.getElementById('hud-gamepad-badge'),
			hudHammerWrap: doc.getElementById('hud-hammer-wrap'),
			hudHammerFill: doc.getElementById('hud-hammer-fill'),
			hudHammerTime: doc.getElementById('hud-hammer-time'),
			hudBossWrap: doc.getElementById('hud-boss-bar-wrap'),
			hudBossTrail: doc.getElementById('hud-boss-trail'),
			hudBossFill: doc.getElementById('hud-boss-fill'),
			hudBossHpText: doc.getElementById('hud-boss-hp-text'),
			hudToastLayer: doc.getElementById('hud-toast-layer'),

			screenTitle: doc.getElementById('screen-title'),
			screenIntro: doc.getElementById('screen-intro'),
			screenNotice: doc.getElementById('screen-notice'),
			screenPause: doc.getElementById('screen-pause'),
			screenGameOver: doc.getElementById('screen-gameover'),
			screenEnding: doc.getElementById('screen-ending'),
			screenFade: doc.getElementById('screen-fade'),

			titleHighScore: doc.getElementById('title-highscore'),
			introStageNum: doc.getElementById('intro-stage-num'),
			introStageTitle: doc.getElementById('intro-stage-title'),
			introStageDesc: doc.getElementById('intro-stage-desc'),

			noticeKicker: doc.getElementById('notice-kicker'),
			noticeTitle: doc.getElementById('notice-title'),
			noticeSub: doc.getElementById('notice-sub'),
			noticeBonusPill: doc.getElementById('notice-bonus-pill'),
			btnNoticeNextLoop: doc.getElementById('btn-notice-next-loop'),
			btnNoticeNextLoopLabel: doc.getElementById('btn-notice-next-loop-label'),

			titlePadStatus: doc.getElementById('title-gamepad-status'),
			gameOverReached: doc.getElementById('gameover-reached'),
			gameOverNewRecord: doc.getElementById('gameover-new-record'),
			gameOverScore: doc.getElementById('gameover-score'),
			gameOverHighScore: doc.getElementById('gameover-highscore'),
			gameOverButtons: Array.from(doc.querySelectorAll('#screen-gameover .gameover-item')),
			btnGameOverRetry: doc.getElementById('btn-gameover-retry'),
			btnGameOverTitle: doc.getElementById('btn-gameover-title'),

			endingScore: doc.getElementById('ending-score'),
			endingHighScore: doc.getElementById('ending-highscore'),

			btnStart: doc.getElementById('btn-start'),
			btnControls: doc.getElementById('btn-controls'),
			titleMenuButtons: Array.from(doc.querySelectorAll('#screen-title .title-menu-item')),
			controlsModal: doc.getElementById('screen-controls-modal'),
			btnControlsClose: doc.getElementById('btn-controls-close'),
			btnEndingTitle: doc.getElementById('btn-ending-title'),
			btnHudCamera: doc.getElementById('btn-hud-camera'),
			btnHudMute: doc.getElementById('btn-hud-mute'),
			btnPauseCamera: doc.getElementById('btn-pause-camera'),
			btnPauseMute: doc.getElementById('btn-pause-mute'),
			pauseBgmSlider: doc.getElementById('pause-bgm-slider'),
			pauseBgmVal: doc.getElementById('pause-bgm-val'),
			pauseSeSlider: doc.getElementById('pause-se-slider'),
			pauseSeVal: doc.getElementById('pause-se-val'),
			btnPauseQuality: doc.getElementById('btn-pause-quality'),
			pauseButtons: Array.from(doc.querySelectorAll('#screen-pause .menu-item')),

			titleSecretTrigger: doc.getElementById('title-secret-trigger'),
			titleTestBadge: doc.getElementById('title-test-badge'),
			devPanel: doc.getElementById('title-dev-panel'),
			devStageButtons: Array.from(doc.querySelectorAll('#dev-stage-buttons .dev-chip')),
			devStageDesc: doc.getElementById('dev-stage-desc'),
			devLivesMinus: doc.getElementById('dev-lives-minus'),
			devLivesPlus: doc.getElementById('dev-lives-plus'),
			devLivesValue: doc.getElementById('dev-lives-value'),
			devLivesPresets: Array.from(doc.querySelectorAll('#dev-lives-presets .dev-chip')),
			devLoopButtons: Array.from(doc.querySelectorAll('#dev-loop-buttons .dev-chip')),
			devInvincibleButtons: Array.from(doc.querySelectorAll('#dev-invincible-buttons .dev-chip')),
			devBtnPlay: doc.getElementById('dev-btn-play'),
			devBtnReset: doc.getElementById('dev-btn-reset'),
			devBtnClose: doc.getElementById('dev-btn-close')
		} : {};

		this._bindClicks();
		this._syncDevPanelUi();
	}

	_bindClicks() {
		this._el.btnStart?.addEventListener('click', (e) => {
			e.currentTarget?.blur?.();
			this._handlers.onStartGame?.();
		});

		this._el.btnControls?.addEventListener('click', (e) => {
			e.currentTarget?.blur?.();
			this.setTitleSelection(1);
			this.setControlsModalOpen(true);
		});

		this._el.btnControlsClose?.addEventListener('click', (e) => {
			e.currentTarget?.blur?.();
			this.setControlsModalOpen(false);
		});

		this._el.controlsModal?.addEventListener('click', (e) => {
			if (e.target === this._el.controlsModal) {
				this.setControlsModalOpen(false);
			}
		});

		this._el.titleMenuButtons?.forEach((btn, idx) => {
			btn.addEventListener('pointermove', (e) => {
				if (this._didPointerMove(e)) {
					this.setTitleSelection(idx);
				}
			});
		});

		this._el.btnGameOverRetry?.addEventListener('click', () => {
			this._handlers.onRetryGame?.();
		});

		this._el.btnGameOverTitle?.addEventListener('click', () => {
			this._handlers.onReturnToTitle?.();
		});

		this._el.gameOverButtons?.forEach((btn, idx) => {
			btn.addEventListener('pointermove', (e) => {
				if (this._didPointerMove(e)) {
					this.setGameOverSelection(idx);
				}
			});
		});

		this._el.btnEndingTitle?.addEventListener('click', () => {
			this._handlers.onReturnToTitle?.();
		});

		this._el.btnNoticeNextLoop?.addEventListener('click', () => {
			this._handlers.onNextLoop?.();
		});

		this._el.btnHudCamera?.addEventListener('click', (e) => {
			e.currentTarget?.blur?.();
			this._handlers.onCycleCamera?.();
		});

		this._el.btnHudMute?.addEventListener('click', (e) => {
			e.currentTarget?.blur?.();
			this._handlers.onToggleMute?.();
		});

		this._el.pauseButtons?.forEach((btn, idx) => {
			btn.addEventListener('pointermove', (e) => {
				if (this._didPointerMove(e)) {
					this.setPauseSelection(idx);
				}
			});
			if (btn.dataset.action !== 'bgmVolume' && btn.dataset.action !== 'seVolume') {
				btn.addEventListener('click', (e) => {
					e.currentTarget?.blur?.();
					this.setPauseSelection(idx);
					this.activatePauseSelection();
				});
			}
		});

		for (const slider of [this._el.pauseBgmSlider, this._el.pauseSeSlider]) {
			slider?.addEventListener('keydown', (e) => {
				if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Enter'].includes(e.code)) {
					e.preventDefault();
					e.target?.blur?.();
				}
			});
		}

		this._el.pauseBgmSlider?.addEventListener('input', (e) => {
			const val = Number.parseFloat(e.target.value) / 100;
			const idx = this._el.pauseButtons?.findIndex((b) => b.dataset?.action === 'bgmVolume') ?? -1;
			if (idx >= 0) {
				this.setPauseSelection(idx);
			}
			this._handlers.onChangeBgmVolume?.(val);
		});
		this._el.pauseBgmSlider?.addEventListener('change', (e) => {
			e.target?.blur?.();
		});

		this._el.pauseSeSlider?.addEventListener('input', (e) => {
			const val = Number.parseFloat(e.target.value) / 100;
			const idx = this._el.pauseButtons?.findIndex((b) => b.dataset?.action === 'seVolume') ?? -1;
			if (idx >= 0) {
				this.setPauseSelection(idx);
			}
			this._handlers.onChangeSeVolume?.(val);
		});
		this._el.pauseSeSlider?.addEventListener('change', (e) => {
			e.target?.blur?.();
		});

		// 開発テスト用隠しメニュー（タイトルロゴ3回クリック または バッジクリック）
		this._el.titleSecretTrigger?.addEventListener('click', () => {
			this._secretClicks += 1;
			if (this._secretClickTimer) {
				window.clearTimeout(this._secretClickTimer);
			}
			this._secretClickTimer = window.setTimeout(() => {
				this._secretClicks = 0;
				this._secretClickTimer = 0;
			}, 1400);
			if (this._secretClicks >= 3) {
				this._secretClicks = 0;
				this.toggleDevPanel();
			}
		});

		this._el.titleTestBadge?.addEventListener('click', () => {
			this.setDevPanelOpen(true);
		});

		this._el.devStageButtons?.forEach((btn) => {
			btn.addEventListener('click', () => {
				const idx = Number.parseInt(btn.dataset.stageIndex, 10);
				if (Number.isInteger(idx)) {
					this._devStageIndex = Math.max(0, Math.min(STAGES.length - 1, idx));
					this._syncDevPanelUi();
					this._handlers.onTestStagePreview?.(STAGES[this._devStageIndex].id);
				}
			});
		});

		this._el.devLivesMinus?.addEventListener('click', () => {
			this._setDevLives(this._devLives - 1);
		});

		this._el.devLivesPlus?.addEventListener('click', () => {
			this._setDevLives(this._devLives + 1);
		});

		this._el.devLivesPresets?.forEach((btn) => {
			btn.addEventListener('click', () => {
				const val = Number.parseInt(btn.dataset.lives, 10);
				if (Number.isFinite(val)) {
					this._setDevLives(val);
				}
			});
		});

		this._el.devBtnPlay?.addEventListener('click', () => {
			this.setDevPanelOpen(false);
			this._handlers.onStartGame?.();
		});

		this._el.devLoopButtons?.forEach((btn) => {
			btn.addEventListener('click', () => {
				this._devLoop = Number.parseInt(btn.dataset.loop, 10) || 1;
				this._syncDevPanelUi();
			});
		});

		this._el.devInvincibleButtons?.forEach((btn) => {
			btn.addEventListener('click', () => {
				this._devInvincible = btn.dataset.invincible === 'true';
				this._syncDevPanelUi();
			});
		});

		this._el.devBtnReset?.addEventListener('click', () => {
			this._devStageIndex = 0;
			this._devLives = CONFIG.PLAYER.INITIAL_LIVES;
			this._devLoop = 1;
			this._devInvincible = false;
			this._syncDevPanelUi();
			this._handlers.onTestStagePreview?.(STAGES[0].id);
		});

		this._el.devBtnClose?.addEventListener('click', () => {
			this.setDevPanelOpen(false);
		});
	}

	_setDevLives(nextLives) {
		this._devLives = Math.max(1, Math.min(99, Math.floor(nextLives)));
		this._syncDevPanelUi();
	}

	_syncDevPanelUi() {
		const stage = STAGES[this._devStageIndex] || STAGES[0];
		this._el.devStageButtons?.forEach((btn) => {
			const idx = Number.parseInt(btn.dataset.stageIndex, 10);
			btn.classList.toggle('is-active', idx === this._devStageIndex);
		});
		if (this._el.devStageDesc) {
			this._el.devStageDesc.textContent = `${stage.name} - ${stage.subtitle} (${stage.description})`;
		}
		if (this._el.devLivesValue) {
			this._el.devLivesValue.textContent = String(this._devLives);
		}
		this._el.devLivesPresets?.forEach((btn) => {
			const val = Number.parseInt(btn.dataset.lives, 10);
			btn.classList.toggle('is-active', val === this._devLives);
		});
		this._el.devLoopButtons?.forEach((btn) => {
			const val = Number.parseInt(btn.dataset.loop, 10);
			btn.classList.toggle('is-active', val === this._devLoop);
		});
		this._el.devInvincibleButtons?.forEach((btn) => {
			const enabled = btn.dataset.invincible === 'true';
			btn.classList.toggle('is-active', enabled === this._devInvincible);
		});

		const isOverride = this._devStageIndex !== 0
			|| this._devLives !== CONFIG.PLAYER.INITIAL_LIVES
			|| this._devLoop !== 1
			|| this._devInvincible;
		if (this._el.titleTestBadge) {
			this._el.titleTestBadge.classList.toggle('is-hidden', !isOverride);
			if (isOverride) {
				const loopPrefix = this._devLoop > 1 ? `LOOP ${this._devLoop} / ` : '';
				const invSuffix = this._devInvincible ? ' / INVINCIBLE' : '';
				this._el.titleTestBadge.textContent = `TEST OVERRIDE: ${loopPrefix}${stage.name} / LIVES ${this._devLives}${invSuffix}`;
			}
		}
	}

	isDevPanelOpen() {
		return this._devPanelOpen;
	}

	setDevPanelOpen(open) {
		this._devPanelOpen = Boolean(open);
		this._el.devPanel?.classList.toggle('is-hidden', !this._devPanelOpen);
	}

	toggleDevPanel() {
		this.setDevPanelOpen(!this._devPanelOpen);
	}

	getTestLaunchOptions() {
		return {
			stageIndex: this._devStageIndex,
			lives: this._devLives,
			loop: this._devLoop,
			devInvincible: this._devInvincible
		};
	}

	_formatScore(value) {
		return String(Math.max(0, Math.floor(value))).padStart(6, '0');
	}

	/**
	 * 状態遷移時に表示スクリーンを切り替える
	 * @param {string} currentState
	 * @param {import('./gameState.js').GameState} gameState
	 */
	syncState(currentState, gameState) {
		const showHud = [
			GAME_STATES.STAGE_INTRO,
			GAME_STATES.PLAYING,
			GAME_STATES.PAUSED,
			GAME_STATES.PLAYER_MISS,
			GAME_STATES.STAGE_CLEAR
		].includes(currentState);

		this._el.cinematicBars?.classList.toggle('is-open', currentState === GAME_STATES.STAGE_INTRO);
		this._el.hud?.classList.toggle('is-hidden', !showHud);
		this._el.screenTitle?.classList.toggle('is-hidden', currentState !== GAME_STATES.TITLE);
		this._el.screenIntro?.classList.toggle('is-hidden', currentState !== GAME_STATES.STAGE_INTRO);
		this._el.screenPause?.classList.toggle('is-hidden', currentState !== GAME_STATES.PAUSED);
		this._el.screenGameOver?.classList.toggle('is-hidden', currentState !== GAME_STATES.GAME_OVER);
		this._el.screenEnding?.classList.toggle('is-hidden', currentState !== GAME_STATES.ENDING);

		if (currentState === GAME_STATES.TITLE || currentState === GAME_STATES.STAGE_INTRO) {
			this._displayedScore = gameState.score || 0;
		}

		if (this._el.titleHighScore) {
			this._el.titleHighScore.textContent = this._formatScore(gameState.highScore);
		}

		const showNotice = currentState === GAME_STATES.PLAYER_MISS || currentState === GAME_STATES.STAGE_CLEAR;
		this._el.screenNotice?.classList.toggle('is-hidden', !showNotice);
		this._el.screenNotice?.classList.toggle('is-clear-banner', currentState === GAME_STATES.STAGE_CLEAR);
		this._el.btnNoticeNextLoop?.classList.add('is-hidden');
		this._el.noticeBonusPill?.classList.add('is-hidden');

		const stage = gameState.getCurrentStageInfo();
		const loop = gameState.loop || 1;
		const stageLabel = loop > 1 ? `LOOP ${loop} · ${stage.name}` : stage.name;
		const { scoreMultiplier } = gameState.getLoopDifficulty();
		if (currentState === GAME_STATES.STAGE_INTRO) {
			if (this._el.introStageNum) {
				this._el.introStageNum.textContent = stageLabel;
			}
			if (this._el.introStageTitle) {
				this._el.introStageTitle.textContent = stage.subtitle;
			}
			if (this._el.introStageDesc) {
				this._el.introStageDesc.textContent = loop > 1
					? `${stage.description}（難易度UP / SCORE ×${scoreMultiplier.toFixed(1)}）`
					: stage.description;
			}
		}

		if (currentState === GAME_STATES.PLAYER_MISS) {
			if (this._el.noticeKicker) {
				this._el.noticeKicker.textContent = stageLabel;
			}
			if (this._el.noticeTitle) {
				this._el.noticeTitle.textContent = 'MISS!';
			}
			if (this._el.noticeSub) {
				this._el.noticeSub.textContent = gameState.lives > 0 ? `残り残機: ${gameState.lives}` : '残機がなくなりました';
			}
		}

		if (currentState === GAME_STATES.STAGE_CLEAR) {
			const isFinalStageOfLoop = gameState.isFinalStageOfLoop();
			const clearBonus = Math.round(CONFIG.SCORE.STAGE_CLEAR_BASE * (gameState.stageIndex + 1) * scoreMultiplier);
			if (this._el.noticeKicker) {
				this._el.noticeKicker.textContent = stageLabel;
			}
			if (this._el.noticeTitle) {
				this._el.noticeTitle.textContent = isFinalStageOfLoop ? `LOOP ${loop} CLEAR!` : 'STAGE CLEAR!';
			}
			if (this._el.noticeSub) {
				this._el.noticeSub.textContent = isFinalStageOfLoop
					? `NEXT: LOOP ${loop + 1}`
					: stage.subtitle;
			}
			if (this._el.noticeBonusPill) {
				this._el.noticeBonusPill.textContent = `STAGE BONUS +${clearBonus}`;
				this._el.noticeBonusPill.classList.remove('is-hidden');
			}
			if (isFinalStageOfLoop && this._el.btnNoticeNextLoop) {
				if (this._el.btnNoticeNextLoopLabel) {
					this._el.btnNoticeNextLoopLabel.textContent = `START LOOP ${loop + 1} (STAGE 1)`;
				}
				this._el.btnNoticeNextLoop.classList.remove('is-hidden');
			}
		}

		if (currentState === GAME_STATES.TITLE) {
			this._lastPointerX = null;
			this._lastPointerY = null;
			this._clearResidualFocus();
			this.setControlsModalOpen(false);
			this.setTitleSelection(0);
		}

		if (currentState === GAME_STATES.PAUSED) {
			this._lastPointerX = null;
			this._lastPointerY = null;
			this._clearResidualFocus();
			this.setPauseSelection(0);
		}

		if (currentState === GAME_STATES.GAME_OVER) {
			this._lastPointerX = null;
			this._lastPointerY = null;
			this._clearResidualFocus();
			this.setGameOverSelection(0);
			if (this._el.gameOverReached) {
				this._el.gameOverReached.textContent = loop > 1 ? `LOOP ${loop} · ${stage.name}` : stage.name;
			}
			if (this._el.gameOverScore) {
				this._el.gameOverScore.textContent = this._formatScore(gameState.score);
			}
			if (this._el.gameOverHighScore) {
				this._el.gameOverHighScore.textContent = this._formatScore(gameState.highScore);
			}
			const isRecord = gameState.score > 0 && gameState.score >= gameState.highScore;
			this._el.gameOverNewRecord?.classList.toggle('is-hidden', !isRecord);
		}

		if (currentState === GAME_STATES.ENDING) {
			if (this._el.endingScore) {
				this._el.endingScore.textContent = this._formatScore(gameState.score);
			}
			if (this._el.endingHighScore) {
				this._el.endingHighScore.textContent = this._formatScore(gameState.highScore);
			}
		}

		this.updateHud(gameState);
	}

	/**
	 * 毎フレームの演出更新（スコアロールアップ・ハンマー残時間バー）
	 * @param {number} dt
	 * @param {import('./gameState.js').GameState} gameState
	 * @param {import('./player.js').Player} [player]
	 */
	update(dt, gameState, player = null) {
		const targetScore = gameState.score || 0;
		const diff = targetScore - this._displayedScore;
		let isRolling = false;
		if (Math.abs(diff) <= 1) {
			this._displayedScore = targetScore;
		} else {
			const step = Math.max(Math.abs(diff) * Math.min(1, dt * 16), 420 * dt);
			this._displayedScore = diff > 0
				? Math.min(targetScore, this._displayedScore + step)
				: Math.max(targetScore, this._displayedScore - step);
			isRolling = true;
		}
		if (this._el.hudScore) {
			this._el.hudScore.textContent = this._formatScore(this._displayedScore);
			this._el.hudScore.classList.toggle('is-rolling', isRolling);
		}

		// POWER HAMMER 残り時間バー更新
		if (this._el.hudHammerWrap && this._el.hudHammerFill && this._el.hudHammerTime) {
			const hammerTimer = player?.hammerTimer ?? 0;
			const active = hammerTimer > 0 && gameState.currentState === GAME_STATES.PLAYING;
			this._el.hudHammerWrap.classList.toggle('is-hidden', !active);
			if (active) {
				const maxDur = CONFIG.ENEMY.HAMMER_DURATION || 6.5;
				const ratio = Math.max(0, Math.min(1, hammerTimer / maxDur));
				this._el.hudHammerFill.style.width = `${ratio * 100}%`;
				this._el.hudHammerTime.textContent = `${hammerTimer.toFixed(1)}s`;
				this._el.hudHammerWrap.classList.toggle('is-low', hammerTimer < 1.8);
			}
		}
	}

	/**
	 * HUD数値を毎フレームまたは変化時に更新する
	 * @param {import('./gameState.js').GameState} gameState
	 */
	updateHud(gameState) {
		const stage = gameState.getCurrentStageInfo();
		if (this._el.hudScore && Math.abs((gameState.score || 0) - this._displayedScore) < 1) {
			this._el.hudScore.textContent = this._formatScore(gameState.score);
		}
		if (this._el.hudHighScore) {
			this._el.hudHighScore.textContent = this._formatScore(gameState.highScore);
		}
		const isNewBest = gameState.score > 0 && gameState.score >= gameState.highScore;
		this._el.hudNewBestDot?.classList.toggle('is-hidden', !isNewBest);
		this._el.hudScoreCard?.nextElementSibling?.classList.toggle('is-new-best', isNewBest);

		const loop = gameState.loop || 1;
		if (this._el.hudLoopPill) {
			this._el.hudLoopPill.classList.toggle('is-hidden', loop <= 1);
			this._el.hudLoopPill.textContent = `LOOP ${loop}`;
		}
		if (this._el.hudStageName) {
			this._el.hudStageName.textContent = stage.name;
		}
		if (this._el.hudStageSub) {
			const { scoreMultiplier } = gameState.getLoopDifficulty();
			this._el.hudStageSub.textContent = loop > 1
				? `${stage.subtitle} · SCORE ×${scoreMultiplier.toFixed(1)}`
				: stage.subtitle;
		}
		if (this._el.hudLives) {
			this._el.hudLives.textContent = `× ${gameState.lives}`;
		}
		if (this._el.hudBonusProgress) {
			const threshold = CONFIG.SCORE.BONUS_ITEMS_PER_1UP || 5;
			const progress = (gameState.bonusItemCount || 0) % threshold;
			this._el.hudBonusProgress.textContent = `BONUS ${progress}/${threshold}`;
			this._el.hudBonusPips?.forEach((pip, idx) => {
				pip.classList.toggle('is-filled', idx < progress);
			});
		}
		if (this._el.hudInvincibleBadge) {
			this._el.hudInvincibleBadge.classList.toggle('is-hidden', !gameState.devInvincible);
		}

		if (this._el.hudBossWrap && this._el.hudBossFill) {
			this._el.hudBossWrap.classList.toggle('is-hidden', !gameState.bossVisible);
			if (gameState.bossVisible) {
				const ratio = Math.max(0, Math.min(1, gameState.bossHp / gameState.bossMaxHp));
				const pct = `${ratio * 100}%`;
				this._el.hudBossFill.style.width = pct;
				if (this._el.hudBossTrail) {
					this._el.hudBossTrail.style.width = pct;
				}
				if (this._el.hudBossHpText) {
					this._el.hudBossHpText.textContent = `${gameState.bossHp} / ${gameState.bossMaxHp}`;
				}
			}
		}
	}

	/**
	 * ゲームパッドの接続表示を更新する
	 * @param {{ connected: boolean, count: number, primaryName: string }} status
	 */
	updateGamepadStatus(status) {
		if (this._el.hudGamepadBadge) {
			this._el.hudGamepadBadge.textContent = status.connected ? 'PAD: ON' : 'PAD: OFF';
			this._el.hudGamepadBadge.classList.toggle('is-connected', status.connected);
			this._el.hudGamepadBadge.classList.toggle('is-disconnected', !status.connected);
		}

		if (this._el.titlePadStatus) {
			if (status.connected) {
				this._el.titlePadStatus.textContent = `ゲームパッド接続中: ${status.primaryName}`;
				this._el.titlePadStatus.classList.add('is-connected');
			} else {
				this._el.titlePadStatus.textContent = 'ゲームパッド未接続（キーボードでプレイ可能）';
				this._el.titlePadStatus.classList.remove('is-connected');
			}
		}
	}

	_didPointerMove(e) {
		if (!e || !Number.isFinite(e.clientX) || !Number.isFinite(e.clientY)) {
			return false;
		}
		if (this._lastPointerX === e.clientX && this._lastPointerY === e.clientY) {
			return false;
		}
		this._lastPointerX = e.clientX;
		this._lastPointerY = e.clientY;
		return true;
	}

	_clearResidualFocus() {
		if (typeof document === 'undefined') {
			return;
		}
		const active = document.activeElement;
		if (active && typeof active.blur === 'function' && active !== document.body) {
			active.blur();
		}
	}

	isControlsModalOpen() {
		return this._controlsModalOpen;
	}

	setControlsModalOpen(open) {
		this._controlsModalOpen = Boolean(open);
		this._el.controlsModal?.classList.toggle('is-hidden', !this._controlsModalOpen);
		if (!this._controlsModalOpen) {
			this._clearResidualFocus();
		}
	}

	toggleControlsModal() {
		this.setControlsModalOpen(!this._controlsModalOpen);
	}

	moveTitleSelection(delta) {
		const count = this._el.titleMenuButtons?.length || 0;
		if (count === 0) {
			return;
		}
		this._clearResidualFocus();
		const next = (this._titleIndex + delta + count) % count;
		this.setTitleSelection(next);
	}

	setTitleSelection(index) {
		const count = this._el.titleMenuButtons?.length || 0;
		const safeIndex = count > 0 ? ((index % count) + count) % count : 0;
		this._titleIndex = safeIndex;
		this._el.titleMenuButtons?.forEach((btn, idx) => {
			btn.classList?.toggle('is-selected', idx === safeIndex);
		});
	}

	activateTitleSelection() {
		const activeBtn = this._el.titleMenuButtons?.[this._titleIndex];
		const action = activeBtn?.dataset?.action;
		if (action === 'controls') {
			this.setControlsModalOpen(true);
			return 'controls';
		}
		this._handlers.onStartGame?.();
		return 'start';
	}

	/**
	 * ポーズメニューの選択インデックスを上下移動する
	 * @param {number} delta -1 (上) または +1 (下)
	 */
	movePauseSelection(delta) {
		const count = this._el.pauseButtons?.length || 0;
		if (count === 0) {
			return;
		}
		this._clearResidualFocus();
		const next = (this._pauseIndex + delta + count) % count;
		this.setPauseSelection(next);
	}

	setPauseSelection(index) {
		const count = this._el.pauseButtons?.length || 0;
		const safeIndex = count > 0 ? ((index % count) + count) % count : 0;
		this._pauseIndex = safeIndex;
		this._el.pauseButtons?.forEach((btn, idx) => {
			btn.classList?.toggle('is-selected', idx === safeIndex);
		});
	}

	/**
	 * ポーズメニュー選択中の項目を左右キーで調整する（音量・視点・ミュート・品質）
	 * @param {number} delta -1 (左) または +1 (右)
	 * @returns {boolean} 何か設定を変更した場合 true
	 */
	adjustPauseSetting(delta) {
		const activeBtn = this._el.pauseButtons?.[this._pauseIndex];
		const action = activeBtn?.dataset.action;
		if (action === 'bgmVolume') {
			const cur = Number.parseFloat(this._el.pauseBgmSlider?.value ?? '100') / 100;
			const next = Math.max(0, Math.min(1, Math.round((cur + delta * 0.1) * 20) / 20));
			this._handlers.onChangeBgmVolume?.(next);
			return true;
		}
		if (action === 'seVolume') {
			const cur = Number.parseFloat(this._el.pauseSeSlider?.value ?? '100') / 100;
			const next = Math.max(0, Math.min(1, Math.round((cur + delta * 0.1) * 20) / 20));
			this._handlers.onChangeSeVolume?.(next);
			return true;
		}
		if (action === 'camera') {
			this._handlers.onCycleCamera?.();
			return true;
		}
		if (action === 'mute') {
			this._handlers.onToggleMute?.();
			return true;
		}
		if (action === 'quality') {
			this._handlers.onCycleQuality?.();
			return true;
		}
		return false;
	}

	activatePauseSelection() {
		const activeBtn = this._el.pauseButtons?.[this._pauseIndex];
		const action = activeBtn?.dataset.action;
		if (action === 'resume') {
			this._handlers.onResume?.();
		} else if (action === 'restart') {
			this._handlers.onRestart?.();
		} else if (action === 'camera') {
			this._handlers.onCycleCamera?.();
		} else if (action === 'mute') {
			this._handlers.onToggleMute?.();
		} else if (action === 'bgmVolume' || action === 'seVolume') {
			this.adjustPauseSetting(1);
		} else if (action === 'quality') {
			this._handlers.onCycleQuality?.();
		} else if (action === 'title') {
			this._handlers.onReturnToTitle?.();
		}
	}

	/**
	 * ゲームオーバーメニューの選択インデックスを上下移動する
	 * @param {number} delta
	 */
	moveGameOverSelection(delta) {
		const count = this._el.gameOverButtons?.length || 0;
		if (count === 0) {
			return;
		}
		this._clearResidualFocus();
		const next = (this._gameOverIndex + delta + count) % count;
		this.setGameOverSelection(next);
	}

	setGameOverSelection(index) {
		const count = this._el.gameOverButtons?.length || 0;
		const safeIndex = count > 0 ? ((index % count) + count) % count : 0;
		this._gameOverIndex = safeIndex;
		this._el.gameOverButtons?.forEach((btn, idx) => {
			btn.classList?.toggle('is-selected', idx === safeIndex);
		});
	}

	activateGameOverSelection() {
		const activeBtn = this._el.gameOverButtons?.[this._gameOverIndex];
		const action = activeBtn?.dataset.action;
		if (action === 'retry') {
			this._handlers.onRetryGame?.();
		} else {
			this._handlers.onReturnToTitle?.();
		}
	}

	/**
	 * HUDバッジおよびポーズ画面のカメラ視点表示を更新する
	 * @param {{ badge: string, menu: string }} labels
	 */
	updateCameraLabels(labels) {
		if (this._el.btnHudCamera && labels?.badge) {
			this._el.btnHudCamera.textContent = labels.badge;
		}
		if (this._el.btnPauseCamera && labels?.menu) {
			this._el.btnPauseCamera.textContent = labels.menu;
		}
	}

	/**
	 * HUDバッジおよびポーズ画面のサウンド ON/OFF・音量表示を更新する
	 * @param {boolean} muted
	 * @param {{ bgmScale?: number, seScale?: number }} [volumes]
	 */
	updateMuteLabels(muted, volumes = null) {
		if (this._el.btnHudMute) {
			this._el.btnHudMute.textContent = muted ? 'SOUND: OFF [M]' : 'SOUND: ON [M]';
		}
		if (this._el.btnPauseMute) {
			this._el.btnPauseMute.textContent = muted ? 'SOUND: OFF' : 'SOUND: ON';
		}
		if (volumes) {
			this.updateVolumeControls(volumes.bgmScale, volumes.seScale);
		}
	}

	/**
	 * ポーズメニューの BGM / SE 音量スライダーと数値を同期する
	 * @param {number} [bgmScale]
	 * @param {number} [seScale]
	 */
	updateVolumeControls(bgmScale, seScale) {
		if (Number.isFinite(bgmScale)) {
			const pct = Math.round(bgmScale * 100);
			if (this._el.pauseBgmSlider) {
				this._el.pauseBgmSlider.value = String(pct);
			}
			if (this._el.pauseBgmVal) {
				this._el.pauseBgmVal.textContent = `${pct}%`;
			}
		}
		if (Number.isFinite(seScale)) {
			const pct = Math.round(seScale * 100);
			if (this._el.pauseSeSlider) {
				this._el.pauseSeSlider.value = String(pct);
			}
			if (this._el.pauseSeVal) {
				this._el.pauseSeVal.textContent = `${pct}%`;
			}
		}
	}

	/**
	 * ポーズ画面等のグラフィック品質表示を更新する
	 * @param {string} label
	 */
	updateQualityLabel(label) {
		if (this._el.btnPauseQuality) {
			this._el.btnPauseQuality.textContent = label;
		}
	}

	/**
	 * 状態遷移時のシネマティック暗転→明転フェード演出を再生する
	 */
	triggerFadePulse() {
		const fadeEl = this._el.screenFade;
		if (!fadeEl) {
			return;
		}
		if (this._fadeTimerId) {
			window.clearTimeout(this._fadeTimerId);
			this._fadeTimerId = 0;
		}
		if (this._fadeRafId && typeof window.cancelAnimationFrame === 'function') {
			window.cancelAnimationFrame(this._fadeRafId);
			this._fadeRafId = 0;
		}
		// 即座に黒幕を張ってから滑らかにフェードインさせ、画面切替の瞬間のブツ切り感を消す
		fadeEl.classList.add('is-instant', 'is-active');
		this._fadeTimerId = window.setTimeout(() => {
			this._fadeTimerId = 0;
			fadeEl.classList.remove('is-instant');
			if (typeof window.requestAnimationFrame === 'function') {
				this._fadeRafId = window.requestAnimationFrame(() => {
					this._fadeRafId = 0;
					fadeEl.classList.remove('is-active');
				});
			} else {
				fadeEl.classList.remove('is-active');
			}
		}, 90);
	}

	/**
	 * 次ステージ移行直前の連続フェードアウト制御（自動遷移と同期）
	 * @param {boolean} active
	 */
	setPreTransitionFade(active) {
		const fadeEl = this._el.screenFade;
		if (!fadeEl) {
			return;
		}
		if (!active && (this._fadeTimerId || this._fadeRafId)) {
			// triggerFadePulse() による暗転明転シーケンス中は上書きしない
			return;
		}
		fadeEl.classList.remove('is-instant');
		if (active) {
			fadeEl.classList.add('is-active');
		} else if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
			window.requestAnimationFrame(() => {
				if (!this._fadeTimerId) {
					fadeEl.classList.remove('is-active');
				}
			});
		} else {
			fadeEl.classList.remove('is-active');
		}
	}

	/**
	 * スコア加算やパワーアップの短いポップ通知を表示する
	 * @param {string} message
	 * @param {'score'|'power'} [variant]
	 */
	showEventToast(message, variant = 'score') {
		const layer = this._el.hudToastLayer;
		if (!layer || typeof document === 'undefined') {
			return;
		}
		// 過密にならないよう最大3件に抑制
		while (layer.children.length >= 3) {
			layer.removeChild(layer.firstChild);
		}
		const toast = document.createElement('div');
		toast.className = `hud-toast ${variant === 'power' ? 'is-power' : ''}`;
		toast.textContent = message;
		layer.appendChild(toast);
		window.setTimeout(() => {
			if (toast.parentNode === layer) {
				layer.removeChild(toast);
			}
		}, 920);
	}
}
