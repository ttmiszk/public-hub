import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { CONFIG, GAME_STATES, STAGES, getLoopDifficulty } from './config.js';
import { GameState } from './gameState.js';
import { InputManager } from './inputManager.js';
import { UIManager } from './uiManager.js';
import { Player } from './player.js';
import { forceDropOneFloor } from './physics.js';
import { CameraManager } from './cameraManager.js';
import { StageManager } from './stageManager.js';
import { BarrelManager } from './enemy.js';
import { EffectManager } from './effectManager.js';
import { textureFactory } from './graphics/textureFactory.js';
import { QualityManager } from './graphics/qualityManager.js';
import { AudioManager } from './audioManager.js';
import { AttractDemoController } from './attractDemo.js';
import { createStage1Definition } from './stages/stage1.js';
import { createStage2Definition } from './stages/stage2.js';
import { createStage3Definition } from './stages/stage3.js';

/**
 * IRON CLIMB のメインゲームコントローラ
 * Three.js の描画基盤、ゲームループ、ステージ進行・敵・状態別更新を統括する。
 */
export class Game {
	/**
	 * @param {HTMLCanvasElement} canvas
	 */
	constructor(canvas) {
		this.canvas = canvas;
		this.renderer = this._createRenderer(canvas);
		this.scene = new THREE.Scene();
		this.camera = new THREE.PerspectiveCamera(
			CONFIG.RENDER.FOV,
			window.innerWidth / window.innerHeight,
			CONFIG.RENDER.NEAR,
			CONFIG.RENDER.FAR
		);

		this.audio = new AudioManager();
		this.state = new GameState();
		this.input = new InputManager(window);
		this.ui = new UIManager({
			onStartGame: () => this._startNewGame(),
			onRetryGame: () => this._retryFromGameOver(),
			onResume: () => {
				this.audio.playSe('uiCancel');
				this.state.togglePause();
			},
			onRestart: () => this._restartStage(),
			onCycleCamera: () => this._cycleCameraMode(),
			onToggleMute: () => this._toggleAudioMute(),
			onChangeBgmVolume: (scale) => {
				const applied = this.audio.setBgmVolume(scale);
				this.ui.updateVolumeControls(applied, undefined);
			},
			onChangeSeVolume: (scale) => {
				const applied = this.audio.setSeVolume(scale);
				this.ui.updateVolumeControls(undefined, applied);
				this.audio.playSe('uiMove');
			},
			onCycleQuality: () => this._cycleQualityMode(),
			onTestStagePreview: (stageId) => {
				if (this.state.currentState === GAME_STATES.TITLE) {
					this.audio.playSe('uiMove');
					this.attractDemo.reset();
					this._loadStage(stageId);
				}
			},
			onNextLoop: () => {
				if (this.state.currentState === GAME_STATES.STAGE_CLEAR && this.state.isFinalStageOfLoop()) {
					this.audio.playSe('uiConfirm');
					this.ui.triggerFadePulse();
					this.state.advanceAfterStageClear();
				}
			},
			onReturnToTitle: () => this._returnToTitle()
		});

		this.qualityManager = new QualityManager(this.renderer, (profile, reason) => {
			this._applyQualityProfile(profile, reason);
		});
		this.composer = null;
		this.bloomPass = null;
		this._initPostProcessing();

		this.cameraManager = new CameraManager(this.camera);
		this.stageManager = new StageManager(this.scene);
		this.barrelManager = new BarrelManager(this.scene);
		this.effects = new EffectManager(this.scene);
		this.player = new Player(this.scene);
		this.attractDemo = new AttractDemoController();

		this._rafId = 0;
		this._prevTime = 0;
		this._backdropTime = 0;
		this._gameOverElapsed = 0;
		this._emberTimer = 0;
		this._quakeIntensity = 0;
		this._loadedStageId = 0;

		this._onResize = this._handleResize.bind(this);
		this._onLoop = this._loop.bind(this);
		this._onAudioUnlock = () => this.audio.unlock();

		this._applyQualityProfile(this.qualityManager.getProfile(), 'init');
		this.ui.updateCameraLabels(this.cameraManager.getDisplayLabels());
		this.ui.updateMuteLabels(this.audio.isMuted(), this.audio.getAudioSettings());
		this._loadStage(1);
		this._bindSubscriptions();
	}

	_createRenderer(canvas) {
		const renderer = new THREE.WebGLRenderer({
			canvas,
			antialias: true,
			powerPreference: 'high-performance'
		});
		renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, CONFIG.RENDER.MAX_PIXEL_RATIO));
		renderer.setSize(window.innerWidth, window.innerHeight, false);
		renderer.outputColorSpace = THREE.SRGBColorSpace;
		renderer.toneMapping = THREE.ACESFilmicToneMapping;
		renderer.toneMappingExposure = CONFIG.RENDER.TONE_MAPPING_EXPOSURE;
		renderer.shadowMap.enabled = true;
		renderer.shadowMap.type = THREE.PCFSoftShadowMap;
		return renderer;
	}

	_initPostProcessing() {
		try {
			const width = Math.max(1, window.innerWidth);
			const height = Math.max(1, window.innerHeight);
			const composer = new EffectComposer(this.renderer);
			const renderPass = new RenderPass(this.scene, this.camera);
			const bloomPass = new UnrealBloomPass(
				new THREE.Vector2(width, height),
				0.26,
				0.62,
				1.08
			);
			const outputPass = new OutputPass();

			composer.addPass(renderPass);
			composer.addPass(bloomPass);
			composer.addPass(outputPass);
			this.composer = composer;
			this.bloomPass = bloomPass;
		} catch {
			// 環境によりレンダーターゲット生成に失敗した場合は直接描画へフォールバック
			this.composer = null;
			this.bloomPass = null;
		}
	}

	_applyQualityProfile(profile, reason = '') {
		const dpr = Math.min(window.devicePixelRatio || 1, profile.maxPixelRatio);
		const width = Math.max(1, window.innerWidth);
		const height = Math.max(1, window.innerHeight);

		this.renderer.setPixelRatio(dpr);
		this.renderer.setSize(width, height, false);
		if (this.renderer.shadowMap.type !== profile.shadowType) {
			this.renderer.shadowMap.type = profile.shadowType;
			this.renderer.shadowMap.needsUpdate = true;
		}

		// 金属・工業設備の鏡面ハイライトを支えるプロシージャル環境マップを切り替え
		const envTex = profile.enableEnvMap ? this.qualityManager.getEnvironmentTexture() : null;
		this.scene.environment = envTex;
		this.scene.environmentIntensity = profile.envIntensity ?? 0.75;

		if (this.composer && this.bloomPass) {
			this.composer.setPixelRatio(dpr);
			this.composer.setSize(width, height);
			this.bloomPass.enabled = Boolean(profile.enableBloom);
			this.bloomPass.strength = profile.bloomStrength;
			this.bloomPass.radius = profile.bloomRadius;
			this.bloomPass.threshold = profile.bloomThreshold;
		}

		if (this.effects) {
			this.effects.setQualityScale(profile.particleScale);
		}

		this.ui.updateQualityLabel(this.qualityManager.getDisplayLabel());
		if (reason === 'auto-downgrade') {
			this.ui.showEventToast(`AUTO ${this.qualityManager.getDisplayLabel()}`);
		}
	}

	_cycleQualityMode() {
		this.audio.playSe('uiMove');
		this.qualityManager.cycleMode();
		this.ui.updateQualityLabel(this.qualityManager.getDisplayLabel());
	}

	_toggleAudioMute() {
		const muted = this.audio.toggleMute();
		this.ui.updateMuteLabels(muted);
		this.ui.showEventToast(muted ? 'SOUND: OFF' : 'SOUND: ON');
		if (!muted) {
			this.audio.playSe('uiConfirm');
		}
	}

	/**
	 * カメラ視点を順番に切り替え、HUD・ポーズ表示とトーストを更新する
	 */
	_cycleCameraMode() {
		this.audio.playSe('cameraSwitch');
		this.cameraManager.cycleMode();
		const labels = this.cameraManager.getDisplayLabels();
		this.ui.updateCameraLabels(labels);
		this.ui.showEventToast(labels.toast);
		if (this.state.currentState === GAME_STATES.PAUSED && this.stageManager.currentLevel) {
			this.cameraManager.snapToPlayer(this.player.physics);
		}
	}

	_createStageDefinition(stageId) {
		if (stageId === 2) {
			return createStage2Definition();
		}
		if (stageId === 3) {
			return createStage3Definition();
		}
		return createStage1Definition();
	}

	_loadStage(stageId, loop = 1) {
		this._quakeIntensity = 0;
		this.cameraManager.setShakeIntensity(0);
		this.barrelManager.clear();
		this.effects.clear();
		this.state.hideBossHp();
		const difficulty = getLoopDifficulty(loop);
		this.barrelManager.setDifficulty(difficulty);
		const levelDef = this._createStageDefinition(stageId);
		this.stageManager.load(levelDef, this.qualityManager.getProfile(), difficulty);
		this._loadedStageId = stageId;
		this.player.reset(levelDef.spawn);
		this.cameraManager.snapToPlayer(levelDef.spawn);
	}

	_getBgmTrackForStage(stageId) {
		const map = {
			1: 'STAGE1',
			2: 'STAGE2',
			3: 'STAGE3'
		};
		return map[stageId] || null;
	}

	_bindSubscriptions() {
		this.state.subscribe((nextState, prevState) => {
			if (nextState === GAME_STATES.STAGE_INTRO) {
				this.ui.setPreTransitionFade(false);
				const targetStageId = this.state.getCurrentStageInfo().id;
				if (prevState === GAME_STATES.PLAYER_MISS && this._loadedStageId === targetStageId) {
					this.ui.triggerFadePulse();
					// ミスからの復帰時は通常ボーナス取得状態を維持し、樽・敵・ハンマー・ギミック・ボスのみ初期化
					this.barrelManager.clear();
					this.effects.clear();
					this.state.hideBossHp();
					this.stageManager.resetStageEntities({ keepBonusCollected: true });
					this.player.reset(this.stageManager.currentLevel.spawn);
					this.cameraManager.snapToPlayer(this.stageManager.currentLevel.spawn);
				} else {
					this._loadStage(targetStageId, this.state.loop);
				}
				this.cameraManager.updateIntro(this.stageManager.currentLevel.spawn, 0);
				// 遠景カメラの導入ジングルを再生し、PLAYING 遷移後にステージ本編 BGM を開始する
				this.audio.playBgm('STAGE_INTRO', { restart: true });
			} else if (nextState === GAME_STATES.PLAYING) {
				if (prevState === GAME_STATES.PAUSED) {
					this.audio.setBgmPaused(false);
				} else {
					const bgmTrack = this._getBgmTrackForStage(this._loadedStageId);
					if (bgmTrack) {
						this.audio.playBgm(bgmTrack, { restart: true });
					}
				}
			} else if (nextState === GAME_STATES.PAUSED) {
				this.audio.setBgmPaused(true);
			} else if (nextState === GAME_STATES.STAGE_CLEAR) {
				this.ui.setPreTransitionFade(false);
				this.audio.playBgm('STAGE_CLEAR', { restart: true });
			} else if (nextState === GAME_STATES.GAME_OVER) {
				this._gameOverElapsed = 0;
				this.ui.setPreTransitionFade(false);
				this.audio.playBgm('GAME_OVER', { restart: true });
			} else if (nextState === GAME_STATES.PLAYER_MISS || nextState === GAME_STATES.ENDING) {
				this.audio.stopBgm();
			} else if (nextState === GAME_STATES.TITLE) {
				this.ui.setPreTransitionFade(false);
				this.audio.stopBgm();
				this.attractDemo.reset();
				const opts = this.ui.getTestLaunchOptions();
				const previewId = (STAGES[opts.stageIndex] || STAGES[0]).id;
				this._loadStage(previewId, opts.loop || 1);
			}
			this.ui.syncState(nextState, this.state);
		});

		this._onSecretKeyDown = (event) => {
			if (this.state.currentState !== GAME_STATES.TITLE) {
				return;
			}
			if (event.code === 'F9' || (event.shiftKey && event.code === 'KeyD')) {
				event.preventDefault();
				this.ui.setControlsModalOpen(false);
				this.ui.toggleDevPanel();
			} else if (event.code === 'KeyH' && !this.ui.isDevPanelOpen()) {
				event.preventDefault();
				this.audio.playSe(this.ui.isControlsModalOpen() ? 'uiCancel' : 'uiConfirm');
				this.ui.toggleControlsModal();
			} else if (event.code === 'Escape' && this.ui.isControlsModalOpen()) {
				event.preventDefault();
				this.audio.playSe('uiCancel');
				this.ui.setControlsModalOpen(false);
			} else if (event.code === 'Escape' && this.ui.isDevPanelOpen()) {
				event.preventDefault();
				this.ui.setDevPanelOpen(false);
			}
		};
		window.addEventListener('keydown', this._onSecretKeyDown);

		this.input.onGamepadChange((padStatus) => {
			this.ui.updateGamepadStatus(padStatus);
		});

		window.addEventListener('resize', this._onResize);
		window.addEventListener('pointerdown', this._onAudioUnlock, { passive: true });
		window.addEventListener('keydown', this._onAudioUnlock);
		window.addEventListener('touchstart', this._onAudioUnlock, { passive: true });
	}

	_startNewGame() {
		this.audio.unlock();
		this.audio.playSe('uiConfirm');
		this.ui.setDevPanelOpen(false);
		this.ui.triggerFadePulse();
		this.state.startNewGame(this.ui.getTestLaunchOptions());
	}

	_retryFromGameOver() {
		this.audio.unlock();
		this.audio.playSe('uiConfirm');
		this.ui.triggerFadePulse();
		this._loadedStageId = 0;
		this.state.startNewGame(this.ui.getTestLaunchOptions());
	}

	_restartStage() {
		this.audio.playSe('uiConfirm');
		this.ui.triggerFadePulse();
		this._loadedStageId = 0; // STAGE_INTRO 遷移時に強制フルリロードさせる
		this.state.restartCurrentStage();
	}

	_returnToTitle() {
		this.audio.playSe('uiCancel');
		this.ui.triggerFadePulse();
		this.state.returnToTitle();
	}

	start() {
		this.ui.syncState(this.state.currentState, this.state);
		this._prevTime = performance.now();
		this._rafId = requestAnimationFrame(this._onLoop);
	}

	_handleResize() {
		const width = window.innerWidth;
		const height = window.innerHeight;
		if (width <= 0 || height <= 0) {
			return;
		}
		const profile = this.qualityManager.getProfile();
		const dpr = Math.min(window.devicePixelRatio || 1, profile.maxPixelRatio);
		this.camera.aspect = width / height;
		this.camera.updateProjectionMatrix();
		this.renderer.setPixelRatio(dpr);
		this.renderer.setSize(width, height, false);
		if (this.composer) {
			this.composer.setPixelRatio(dpr);
			this.composer.setSize(width, height);
		}
	}

	_loop(now) {
		const rawDt = (now - this._prevTime) / 1000;
		this._prevTime = now;
		const dt = Math.min(Math.max(rawDt, 0), CONFIG.LOOP.MAX_DELTA_TIME);

		this.input.update();
		if (this.input.anyInteractionJustPressed) {
			this.audio.unlock();
		}
		this.audio.updateBgm();
		this._updateByState(dt);
		this.ui.update(dt, this.state, this.player);
		this.qualityManager.recordFrame(rawDt);

		if (this.composer && this.qualityManager.getProfile().enableBloom) {
			this.composer.render();
		} else {
			this.renderer.render(this.scene, this.camera);
		}

		this._rafId = requestAnimationFrame(this._onLoop);
	}

	_updateByState(dt) {
		const current = this.state.currentState;
		const level = this.stageManager.currentLevel;

		if (this.input.muteJustPressed && !(current === GAME_STATES.TITLE && this.ui.isDevPanelOpen())) {
			this._toggleAudioMute();
		}
		if (current !== GAME_STATES.PLAYING) {
			this.audio.stopContinuousEffects();
		}

		if (current === GAME_STATES.TITLE) {
			this._updateTitleShowcase(dt);
			if (this.ui.isDevPanelOpen()) {
				return;
			}
			if (this.ui.isControlsModalOpen()) {
				if (this.input.confirmJustPressed || this.input.pauseJustPressed) {
					this.audio.playSe('uiCancel');
					this.ui.setControlsModalOpen(false);
				}
				return;
			}
			if (this.input.menuUpJustPressed) {
				this.audio.playSe('uiMove');
				this.ui.moveTitleSelection(-1);
			} else if (this.input.menuDownJustPressed) {
				this.audio.playSe('uiMove');
				this.ui.moveTitleSelection(1);
			} else if (this.input.confirmJustPressed) {
				const chosen = this.ui.activateTitleSelection();
				if (chosen === 'controls') {
					this.audio.playSe('uiConfirm');
				}
			}
			return;
		}

		if (current === GAME_STATES.PAUSED) {
			// ポーズ中は物理・敵・アニメーション・ゲーム時間を完全停止し、メニュー操作のみ受け付ける
			if (this.input.pauseJustPressed) {
				this.audio.playSe('uiCancel');
				this.state.togglePause();
				return;
			}
			if (this.input.cameraSwitchJustPressed) {
				this._cycleCameraMode();
			}
			if (this.input.menuUpJustPressed) {
				this.audio.playSe('uiMove');
				this.ui.movePauseSelection(-1);
			} else if (this.input.menuDownJustPressed) {
				this.audio.playSe('uiMove');
				this.ui.movePauseSelection(1);
			} else if (this.input.menuLeftJustPressed) {
				if (this.ui.adjustPauseSetting(-1)) {
					this.audio.playSe('uiMove');
				}
			} else if (this.input.menuRightJustPressed) {
				if (this.ui.adjustPauseSetting(1)) {
					this.audio.playSe('uiMove');
				}
			} else if (this.input.confirmJustPressed) {
				this.ui.activatePauseSelection();
			}
			return;
		}

		if (current === GAME_STATES.GAME_OVER) {
			this._gameOverElapsed += dt;
			if (level) {
				this.stageManager.updateDynamics(dt * 0.35, 0);
				this.stageManager.update({ x: 999, y: -999, grounded: true, onLadder: false }, dt * 0.35, false);
				this.effects.update(dt * 0.6);
				this.cameraManager.updateGameOverView(this.player.physics.x, this.player.physics.y, this._gameOverElapsed, dt);
			}
			if (this.input.menuUpJustPressed) {
				this.audio.playSe('uiMove');
				this.ui.moveGameOverSelection(-1);
			} else if (this.input.menuDownJustPressed) {
				this.audio.playSe('uiMove');
				this.ui.moveGameOverSelection(1);
			} else if (this.input.confirmJustPressed) {
				this.ui.activateGameOverSelection();
			}
			return;
		}

		if (current === GAME_STATES.ENDING) {
			this._updateTitleShowcase(dt * 0.5);
			if (this.input.confirmJustPressed) {
				this._returnToTitle();
			}
			return;
		}

		if (current === GAME_STATES.STAGE_INTRO) {
			if (this.input.cameraSwitchJustPressed) {
				this._cycleCameraMode();
			}
			this.state.update(dt);
			this.effects.update(dt);
			// state.update(dt) で PLAYING へ遷移した瞬間は stateTimer が 0 へ戻るため、必ず progress=1 で終端にスナップする
			const introCompleted = this.state.currentState !== GAME_STATES.STAGE_INTRO;
			const progress = introCompleted
				? 1
				: Math.min(1, this.state.stateTimer / CONFIG.TIMING.STAGE_INTRO_DURATION);
			this.cameraManager.updateIntro(this.player.physics, progress);
			this.ui.updateHud(this.state);
			return;
		}

		if (current === GAME_STATES.PLAYER_MISS) {
			this._quakeIntensity = 0;
			this.cameraManager.setShakeIntensity(0);
			this.player.update(this.input, level, dt);
			this.effects.update(dt);
			this.state.update(dt);
			this.ui.updateHud(this.state);
			return;
		}

		if (current === GAME_STATES.STAGE_CLEAR) {
			this._quakeIntensity = 0;
			this.cameraManager.setShakeIntensity(0);
			this.stageManager.updateDynamics(dt * 0.4, 0);
			if (level?.goal) {
				this.player.updateCelebration(level.goal, dt);
				this.stageManager.update(this.player.physics, dt * 0.4, false);
				const focusX = (level.goal.x + this.player.physics.x) * 0.5;
				const focusY = level.goal.y + 0.85;
				const sideSign = this.player.physics.x >= level.goal.x ? 1 : -1;
				this.cameraManager.updateClearZoom(focusX, focusY, dt, this.state.stateTimer, sideSign);
			} else {
				this.stageManager.update(this.player.physics, dt * 0.4, false);
			}
			this.effects.update(dt);
			if (this.state.isFinalStageOfLoop()
				&& this.state.stateTimer >= 0.45
				&& (this.input.confirmJustPressed || this.input.jumpJustPressed)) {
				this.audio.playSe('uiConfirm');
				this.ui.triggerFadePulse();
				this.state.advanceAfterStageClear();
				return;
			}
			// STAGE 1 / 2 の次ステージ自動遷移直前に滑らかなフェードアウトを開始
			if (!this.state.isFinalStageOfLoop()
				&& this.state.stateTimer >= CONFIG.TIMING.STAGE_CLEAR_DURATION - 0.34) {
				this.ui.setPreTransitionFade(true);
			}
			this.state.update(dt);
			this.ui.updateHud(this.state);
			return;
		}

		if (current === GAME_STATES.PLAYING) {
			if (this.input.pauseJustPressed) {
				this.audio.stopContinuousEffects();
				this.audio.playSe('uiCancel');
				this.state.togglePause();
				return;
			}
			if (this.input.cameraSwitchJustPressed) {
				this._cycleCameraMode();
			}

			// 移動足場・コンベアベルト・鉄骨振動を先に進めてからプレイヤーの搬送と物理を更新
			this.stageManager.updateDynamics(dt, this._quakeIntensity);

			const playerEvents = this.player.update(this.input, level, dt);
			if (playerEvents.justJumped) {
				this.effects.emitDust(this.player.physics.x, this.player.physics.y, 6);
				this.audio.playSe('jump', { x: this.player.physics.x });
			}
			if (playerEvents.justLanded) {
				this.effects.emitDust(this.player.physics.x, this.player.physics.y, 7);
				this.audio.playSe('land', {
					x: this.player.physics.x,
					impactSpeed: playerEvents.landImpactSpeed,
				});
			}
			if (playerEvents.justStepped) {
				this.audio.playSe('step', { x: this.player.physics.x });
			}
			if (playerEvents.justClimbed) {
				this.audio.playSe('climb', { x: this.player.physics.x });
			}

			const stageEvents = this.stageManager.update(this.player.physics, dt, this.player.hasHammer);

			if (stageEvents.spawnedBarrel) {
				this.barrelManager.spawn(stageEvents.spawnedBarrel);
				this.audio.playSe('barrelThrow', {
					kind: stageEvents.spawnedBarrel.kind,
					x: stageEvents.spawnedBarrel.spawnX,
				});
			}
			if (stageEvents.bossResult?.spawnedTire) {
				this.barrelManager.spawn(stageEvents.bossResult.spawnedTire);
				this.audio.playSe('barrelThrow', {
					kind: 'tire',
					x: stageEvents.bossResult.spawnedTire.spawnX,
				});
			}

			for (const item of stageEvents.collectedItems) {
				if (item.type === 'hammer') {
					this.player.activateHammer();
					this.effects.emitSparks(item.x, item.y + 0.5, 0xffd166, 14);
					this.ui.showEventToast('POWER HAMMER!', 'power');
					this.audio.playSe('hammerPickup', { x: item.x });
				} else {
					const awarded = this.state.addScore(CONFIG.SCORE.ITEM_BONUS);
					const bonusRes = this.state.collectBonusItem();
					this.effects.emitBonusPickup(item.x, item.y + 0.5, bonusRes.extraLifeEarned);
					if (bonusRes.extraLifeEarned) {
						this.ui.showEventToast(`1UP! +${awarded} BONUS!`, 'power');
						this.audio.playSe('extraLife');
					} else {
						this.ui.showEventToast(`+${awarded} BONUS! (${bonusRes.progress}/${bonusRes.threshold})`);
						this.audio.playSe('itemBonus', { x: item.x });
					}
				}
			}

			const barrelResult = this.barrelManager.update(level, this.player.physics, this.player.hasHammer, dt);

			for (const bounce of barrelResult.bounces) {
				this.effects.emitSparks(bounce.x, bounce.y, bounce.fast ? 0x60a5fa : 0xf59e0b, 7);
				this.audio.playSe('barrelBounce', {
					kind: bounce.kind,
					x: bounce.x,
					fast: bounce.fast,
				});
			}

			if (barrelResult.smashedBarrels.length > 0) {
				for (const barrel of barrelResult.smashedBarrels) {
					this.effects.emitBarrelSmash(barrel.x, barrel.y, barrel.fast);
				}
				const basePts = CONFIG.SCORE.ENEMY_DEFEAT * barrelResult.smashedBarrels.length;
				const awarded = this.state.addScore(basePts);
				this.ui.showEventToast(`+${awarded} SMASH!`, 'power');
				this.audio.playSe('smash', { x: barrelResult.smashedBarrels[0].x });
			}

			if (barrelResult.jumpedOverBarrels.length > 0) {
				const basePts = CONFIG.SCORE.JUMP_OVER_OBSTACLE * barrelResult.jumpedOverBarrels.length;
				const awarded = this.state.addScore(basePts);
				this.ui.showEventToast(`+${awarded} JUMP OVER!`);
				this.audio.playSe('jumpOver', { x: this.player.physics.x });
			}

			// STAGE 2/3 動的ギミックイベント処理
			const hazardResult = stageEvents.hazardResult;
			for (const slam of hazardResult.pressSlams) {
				this.effects.emitSparks(slam.x, slam.y + 0.1, 0xff9f1c, 8);
				this.effects.emitSteamPuff(slam.x, slam.y + 0.2, 4);
				this.audio.playSe('pressSlam', { x: slam.x });
			}
			for (const imp of hazardResult.fallingImpacts) {
				this.effects.emitDust(imp.x, imp.y, 7);
				this.audio.playSe('land', { x: imp.x, impactSpeed: 14 });
			}
			for (const burner of hazardResult.burnerIgnites || []) {
				this.audio.playSe('burnerIgnite', { x: burner.x });
			}
			for (const arc of hazardResult.arcDischarges || []) {
				this.audio.playSe('arcDischarge', { x: arc.x });
			}
			for (const arc of hazardResult.activeArcs || []) {
				if (Math.random() < 0.35) {
					this.effects.emitElectricArc(arc.x1, arc.y1, arc.x2, arc.y2);
				}
			}
			if (hazardResult.smashedTargets.length > 0) {
				for (const t of hazardResult.smashedTargets) {
					this.effects.emitBarrelSmash(t.x, t.y, true);
				}
				const basePts = CONFIG.SCORE.ENEMY_DEFEAT * hazardResult.smashedTargets.length;
				const awarded = this.state.addScore(basePts);
				this.ui.showEventToast(`+${awarded} SMASH!`, 'power');
				this.audio.playSe('smash', { x: hazardResult.smashedTargets[0].x });
			}
			if (hazardResult.jumpedOverTargets.length > 0) {
				const basePts = CONFIG.SCORE.JUMP_OVER_OBSTACLE * hazardResult.jumpedOverTargets.length;
				const awarded = this.state.addScore(basePts);
				this.ui.showEventToast(`+${awarded} JUMP OVER!`);
				this.audio.playSe('jumpOver', { x: this.player.physics.x });
			}

			// STAGE 3 ボス「OVERLORD MK-III」イベント処理
			const bossResult = stageEvents.bossResult;
			if (bossResult.engaged) {
				this.state.setBossHp(bossResult.hp, bossResult.maxHp);
			}
			for (const imp of bossResult.mortarImpacts) {
				this.effects.emitSparks(imp.x, imp.y + 0.2, 0xff5400, 12);
				this.audio.playSe('mortarImpact', { x: imp.x });
			}
			for (const node of bossResult.activatedNodes) {
				this.effects.emitSparks(node.x, node.y + 0.6, 0x38bdf8, 16);
				this.audio.playSe('nodeActivate', { x: node.x });
				const nodeAward = this.state.addScore(CONFIG.BOSS.SCORE_NODE_HIT);
				if (node.pillarTarget === 'left') {
					this.effects.emitSparks(-14.8, 17.6, 0xfbbf24, 18);
					this.ui.showEventToast(`LEFT PILLAR DETACHED! +${nodeAward}`, 'power');
				} else if (node.pillarTarget === 'right') {
					this.effects.emitSparks(14.8, 17.6, 0xfbbf24, 18);
					this.ui.showEventToast(`RIGHT PILLAR DETACHED! +${nodeAward}`, 'power');
				} else {
					if (level.boss) {
						this.effects.emitSparks(level.boss.x, level.boss.y + 2.0, 0xff5400, 20);
					}
					this.ui.showEventToast(`FINAL OVERLOAD! TOWER SHAKING! +${nodeAward}`, 'power');
				}
			}
			if (stageEvents.cageSwitchUnlockedNow && stageEvents.cageSwitchPos) {
				this.effects.emitSparks(
					stageEvents.cageSwitchPos.x,
					stageEvents.cageSwitchPos.y + 0.55,
					0x38bdf8,
					20
				);
				this.audio.playSe('nodeUnlock', { x: stageEvents.cageSwitchPos.x });
			}
			if (stageEvents.cageBumpNow) {
				const edgeX = (this.player.physics.x >= 0 ? 1 : -1) * 5.2;
				this.effects.emitSparks(edgeX, 22.8, 0xf87171, 10);
				this.ui.showEventToast('CAGE LOCKED! HIT 3F MOVING SWITCH!', 'power');
				this.audio.playSe('shieldDeflect', { x: this.player.physics.x });
			}
			if (stageEvents.cageVibrateStartedNow) {
				if (stageEvents.cageSwitchPos) {
					this.effects.emitSparks(
						stageEvents.cageSwitchPos.x,
						stageEvents.cageSwitchPos.y + 0.45,
						0x34d399,
						18
					);
				}
				this.ui.showEventToast('CAGE OVERLOAD! TOWER SHAKING!', 'power');
				this.audio.playSe('nodeActivate', { x: stageEvents.cageSwitchPos?.x ?? 0 });
				this.audio.playSe('quakeWindup');
			}
			if (stageEvents.cageShakeOffPlayer && !this.state.devInvincible) {
				const dropped = forceDropOneFloor(this.player.physics, level.platforms);
				if (dropped) {
					this.effects.emitDust(this.player.physics.x, this.player.physics.y, 10);
					this.effects.emitSparks(this.player.physics.x, this.player.physics.y, 0xff9f1c, 10);
					this.ui.showEventToast('SHAKEN OFF! DROPPED 1 FLOOR!');
					this.audio.playSe('shakeOff', { x: this.player.physics.x });
				}
			}
			if (stageEvents.cageShatteredNow) {
				const cy = stageEvents.cagePos?.y ?? 22.0;
				this.effects.emitBarrelSmash(-3.6, cy + 1.2);
				this.effects.emitBarrelSmash(0, cy + 1.5);
				this.effects.emitBarrelSmash(3.6, cy + 1.2);
				this.effects.emitSparks(0, cy + 1.3, 0x94a3b8, 26);
				this.ui.showEventToast('CAGE SHATTERED! CLIMB TO TOP!', 'power');
				this.audio.playSe('cageShatter', { x: 0 });
			}
			if (stageEvents.upperDeckDescendingNow) {
				this.ui.showEventToast(
					stageEvents.cageSwitchUnlockedNow
						? 'CAGED DECK DESCENDING! HIT 3F SWITCH!'
						: 'PRINCESS DECK DESCENDING!',
					'power'
				);
				this.audio.playSe('mechDescend');
			}
			if (stageEvents.unlockedTopNodeNow && !stageEvents.cageShatteredNow) {
				const topNode = level.boss?.nodes?.find((n) => n.id === 's3-node-top');
				if (topNode) {
					this.effects.emitSparks(topNode.x, topNode.y + 0.8, 0xfbbf24, 22);
				}
				this.ui.showEventToast('CENTRAL OVERLOAD NODE UNLOCKED!', 'power');
				this.audio.playSe('nodeUnlock');
			}
			if (bossResult.jumpedOverWave) {
				const awarded = this.state.addScore(CONFIG.SCORE.JUMP_OVER_OBSTACLE);
				this.ui.showEventToast(`+${awarded} JUMP OVER!`);
				this.audio.playSe('jumpOver', { x: this.player.physics.x });
			}
			if (bossResult.quakeWindupNow) {
				this.ui.showEventToast('BOSS GRABBING GIRDERS! JUMP!', 'power');
				this.audio.playSe('quakeWindup');
			}
			this._quakeIntensity = Math.max(
				bossResult.quakeIntensity || 0,
				bossResult.defeatQuakeIntensity || 0,
				stageEvents.cageQuakeIntensity || 0
			);
			this.cameraManager.setShakeIntensity(this._quakeIntensity);
			if (bossResult.shakeOffPlayer) {
				const dropped = forceDropOneFloor(this.player.physics, level.platforms);
				if (dropped) {
					this.effects.emitDust(this.player.physics.x, this.player.physics.y, 10);
					this.effects.emitSparks(this.player.physics.x, this.player.physics.y, 0xff9f1c, 10);
					this.ui.showEventToast('SHAKEN OFF! DROPPED 1 FLOOR!');
					this.audio.playSe('shakeOff', { x: this.player.physics.x });
				}
			}
			if (bossResult.defeatShakeOffPlayer && !this.state.devInvincible) {
				const dropped = forceDropOneFloor(this.player.physics, level.platforms);
				if (dropped) {
					this.effects.emitDust(this.player.physics.x, this.player.physics.y, 10);
					this.effects.emitSparks(this.player.physics.x, this.player.physics.y, 0xff9f1c, 10);
					this.ui.showEventToast('SHAKEN OFF! DROPPED 1 FLOOR!');
					this.audio.playSe('shakeOff', { x: this.player.physics.x });
				}
			}
			if (bossResult.bossDefeatedNow) {
				if (level.boss) {
					this.effects.emitSparks(level.boss.x - 2.0, level.boss.y + 1.0, 0xfbbf24, 18);
					this.effects.emitSparks(level.boss.x + 2.0, level.boss.y + 1.0, 0xfbbf24, 18);
				}
				this.state.addScore(CONFIG.BOSS.SCORE_DEFEAT);
				this.audio.playSe('quakeWindup');
			}
			if (bossResult.pillarFallTriggeredNow) {
				this.effects.emitSparks(-4.2, 16.5, 0xfbbf24, 18);
				this.effects.emitSparks(4.2, 16.5, 0xfbbf24, 18);
				this.ui.showEventToast('CENTRAL PILLARS DETACHED!', 'power');
				this.audio.playSe('collapseImpact', { x: 0, heavy: true });
			}
			if (bossResult.collapseTriggeredNow) {
				this.barrelManager.clear();
				if (level.boss) {
					this.effects.emitSparks(level.boss.x, level.boss.y, 0xfbbf24, 24);
					this.effects.emitDust(level.boss.x, level.boss.y, 18);
				}
				this.ui.showEventToast('TOWER COLLAPSING!', 'power');
				this.audio.playSe('collapseStart');
			}
			if (bossResult.bossFallStartedNow) {
				if (level.boss) {
					this.effects.emitBarrelSmash(level.boss.x, level.boss.y + 1.2, false);
					this.effects.emitSparks(level.boss.x - 2.2, level.boss.y, 0xfbbf24, 20);
					this.effects.emitSparks(level.boss.x + 2.2, level.boss.y, 0xfbbf24, 20);
				}
				this.ui.showEventToast('OVERLORD MK-III FALLING!', 'power');
				this.audio.playSe('bossDefeat');
			}
			if (bossResult.collapseImpacts && bossResult.collapseImpacts.length > 0) {
				for (const imp of bossResult.collapseImpacts) {
					this.effects.emitSparks(imp.x, imp.y, imp.heavy ? 0xfbbf24 : 0xfb923c, imp.heavy ? 18 : 8);
					this.effects.emitDust(imp.x, imp.y, imp.heavy ? 14 : 6);
					this.audio.playSe('collapseImpact', { x: imp.x, heavy: imp.heavy });
				}
			}

			const quakeShaking = (bossResult.quakeState === 'shaking' && !this.stageManager.bossManager.state?.defeated)
				|| this._quakeIntensity > 0.1;
			this.audio.updateContinuousEffects({ quakeShaking }, dt);

			this._emitEnvironmentEmbers(level, dt);
			this.effects.update(dt);
			if (this.stageManager.bossManager.state?.defeated) {
				const defeatElapsed = bossResult.defeatElapsed ?? 0;
				if (defeatElapsed < 2.4) {
					this.cameraManager.updateFollow(this.player.physics, dt);
				} else if (bossResult.bossFallVisible) {
					const bx = bossResult.bossFallPos?.x ?? (level.boss?.x ?? 0);
					const by = bossResult.bossFallPos?.y ?? (level.boss?.y ?? 14.2);
					this.cameraManager.updateBossFallView(bx, by, dt);
				} else if (level?.goal) {
					const focusX = (level.goal.x + this.player.physics.x) * 0.5;
					const focusY = level.goal.y + 0.95;
					this.cameraManager.updateSlowReturnToDeck(focusX, focusY, dt);
				}
			} else {
				this.cameraManager.updateFollow(this.player.physics, dt);
			}

			const rawEnemyOrHazardHit = stageEvents.hitPlayer || barrelResult.hitPlayer || hazardResult.hitPlayer || bossResult.hitPlayer;
			if (this.state.devInvincible && rawEnemyOrHazardHit) {
				if (this.player.triggerInvincibleHit(1.0)) {
					this.effects.emitSparks(this.player.physics.x, this.player.physics.y + 0.7, 0x38bdf8, 10);
					this.audio.playSe('shieldDeflect', { x: this.player.physics.x });
				}
			}
			const enemyOrHazardHit = !this.state.devInvincible && rawEnemyOrHazardHit;
			if (enemyOrHazardHit || playerEvents.fellOut) {
				const isCollapseDeath = Boolean(stageEvents.floorsCollapsed && playerEvents.fellOut);
				this.audio.stopContinuousEffects();
				this.effects.emitSparks(this.player.physics.x, this.player.physics.y + 0.6, 0xef4444, 16);
				this.audio.playSe('miss');
				this.player.triggerMiss();
				this.state.triggerPlayerMiss({ forceGameOver: isCollapseDeath });
				return;
			}

			const playerSafeFromCollapse = !stageEvents.floorsCollapsed || this.stageManager.isPlayerSafeOnGoalDeck(this.player.physics);
			if (stageEvents.reachedGoal || (bossResult.bossCleared && playerSafeFromCollapse)) {
				const clearSpot = level.goal || level.boss || this.player.physics;
				this.audio.stopContinuousEffects();
				this.stageManager.triggerGoalCelebration();
				this.effects.emitSparks(clearSpot.x, clearSpot.y + 1.0, 0xfbbf24, 24);
				this.barrelManager.clear();
				this.state.triggerStageClear();
				return;
			}
		}

		this.state.update(dt);
		this.ui.updateHud(this.state);
	}

	_emitEnvironmentEmbers(level, dt) {
		if (!level || !level.pitEmitterPos) {
			return;
		}
		this._emberTimer += dt;
		if (this._emberTimer >= 0.14) {
			this._emberTimer = 0;
			this.effects.emitEmber(level.pitEmitterPos.x, level.pitEmitterPos.y);
		}
	}

	_updateTitleShowcase(dt) {
		this._backdropTime += dt;
		const level = this.stageManager.currentLevel;
		if (level) {
			this.stageManager.updateDynamics(dt);
			const stageEvents = this.stageManager.update({ x: 999, y: -999, grounded: true, onLadder: false }, dt, false);
			if (stageEvents.spawnedBarrel) {
				this.barrelManager.spawn(stageEvents.spawnedBarrel);
			}
			if (stageEvents.bossResult?.spawnedTire) {
				this.barrelManager.spawn(stageEvents.bossResult.spawnedTire);
			}
			// タイトルライブデモ：プレイヤー自身の自律ジャンプ＆パトロール演技（無敵・SEなし）
			const demoInput = this.attractDemo.buildInput(
				this.player.physics,
				level,
				this.barrelManager.barrels,
				this.stageManager.hazardManager.chasers,
				dt
			);
			const playerEvents = this.player.update(demoInput, level, dt);
			if (playerEvents.justJumped) {
				this.effects.emitDust(this.player.physics.x, this.player.physics.y, 5);
			}
			if (playerEvents.justLanded) {
				this.effects.emitDust(this.player.physics.x, this.player.physics.y, 6);
			}
			if (playerEvents.fellOut && level.spawn) {
				this.player.reset(level.spawn);
			}

			// タイトル背景デモ中の樽転がり演出（プレイヤー接触判定は無効化）
			const barrelResult = this.barrelManager.update(level, { x: 999, y: -999, grounded: true, onLadder: false, invincibleTimer: 99 }, false, dt);
			for (const bounce of barrelResult.bounces) {
				this.effects.emitSparks(bounce.x, bounce.y, bounce.fast ? 0x60a5fa : 0xf59e0b, 6);
			}
			this._emitEnvironmentEmbers(level, dt);
			this.effects.update(dt);
		}

		this.cameraManager.updateTitleShowcase(this.player.physics, this._backdropTime, dt);
	}

	dispose() {
		if (this._rafId) {
			cancelAnimationFrame(this._rafId);
		}
		window.removeEventListener('resize', this._onResize);
		if (this._onSecretKeyDown) {
			window.removeEventListener('keydown', this._onSecretKeyDown);
		}
		if (this._onAudioUnlock) {
			window.removeEventListener('pointerdown', this._onAudioUnlock);
			window.removeEventListener('keydown', this._onAudioUnlock);
			window.removeEventListener('touchstart', this._onAudioUnlock);
		}
		this.barrelManager.dispose();
		this.effects.dispose();
		this.stageManager.unload();
		this.stageManager.hazardManager.dispose();
		this.stageManager.bossManager.dispose();
		if (this.composer) {
			this.composer.dispose();
		}
		this.qualityManager.dispose();
		textureFactory.disposeAll();
		this.player.dispose();
		this.input.dispose();
		this.audio.dispose();
		this.renderer.dispose();
	}
}
