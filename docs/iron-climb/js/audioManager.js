import { CONFIG } from './config.js';
import { BGM_TRACKS } from './bgmTracks.js';

const STORAGE_KEY_MUTED = 'iron_climb_audio_muted_v1';
const STORAGE_KEY_VOLUMES = 'iron_climb_audio_volumes_v1';
const BGM_SCHEDULE_AHEAD_SEC = 0.14;
const BGM_LOOKAHEAD_INTERVAL_MS = 25;

/**
 * Web Audio API を用いたモダンアーケード品質のプロシージャル音響エンジン（SE＋BGM）
 * - Master コンプレッサー＋インダストリアル空間リバーブ＋ステレオパンニングにより、
 *   ファミコン的単音ビープではない厚み・臨場感・立体感のある音響を実現する。
 * - `file://` 完全オフライン動作（外部音声ファイル不使用）。
 */
export class AudioManager {
	/**
	 * @param {object} [options]
	 * @param {Function} [options.AudioContextClass]
	 * @param {Storage} [options.storage]
	 * @param {() => number} [options.now]
	 */
	constructor(options = {}) {
		this._AudioContextClass = options.AudioContextClass
			|| (typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null);
		this._storage = options.storage !== undefined ? options.storage : this._getDefaultStorage();
		this._nowFn = options.now || (() => (typeof performance !== 'undefined' ? performance.now() * 0.001 : Date.now() * 0.001));

		this._ctx = null;
		this._masterGain = null;
		this._compressor = null;
		this._bgmGain = null;
		this._seGain = null;
		this._reverbConvolver = null;
		this._reverbSend = null;
		this._reverbIrBuffer = null;
		this._bgmReverbSend = null;

		this._noiseBuffer = null;
		this._pinkNoiseBuffer = null;
		this._softClipCurve = null;

		this._muted = this._loadMutedFlag();
		const savedVolumes = this._loadVolumeScales();
		this._userMasterScale = savedVolumes.master;
		this._userBgmScale = savedVolumes.bgm;
		this._userSeScale = savedVolumes.se;
		this._masterVolume = CONFIG.AUDIO.MASTER_GAIN * this._userMasterScale;
		this._bgmVolume = CONFIG.AUDIO.BGM_GAIN * this._userBgmScale;
		this._seVolume = CONFIG.AUDIO.SE_GAIN * this._userSeScale;

		this._activeVoices = 0;
		this._cooldowns = new Map();
		this._climbHand = 1;
		this._wasQuakeShaking = false;
		this._quakeRattleTimer = 0;

		this._currentBgmTrackId = null;
		this._pendingBgmTrackId = null;
		this._bgmPaused = false;
		this._bgmCompleted = false;
		this._bgmTrackBus = null;
		this._bgmTrackRevSend = null;
		this._bgmStep = 0;
		this._bgmNextNoteTime = 0;
		this._bgmTimerId = null;

		this._disposed = false;
	}

	_getDefaultStorage() {
		try {
			return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
		} catch {
			return null;
		}
	}

	_loadMutedFlag() {
		if (!this._storage) {
			return false;
		}
		try {
			return this._storage.getItem(STORAGE_KEY_MUTED) === '1';
		} catch {
			return false;
		}
	}

	_saveMutedFlag() {
		if (!this._storage) {
			return;
		}
		try {
			this._storage.setItem(STORAGE_KEY_MUTED, this._muted ? '1' : '0');
		} catch {
			// ストレージ制限時は無視
		}
	}

	_loadVolumeScales() {
		const defaults = { master: 1.0, bgm: 1.0, se: 1.0 };
		if (!this._storage) {
			return defaults;
		}
		try {
			const raw = this._storage.getItem(STORAGE_KEY_VOLUMES);
			if (!raw) {
				return defaults;
			}
			const parsed = JSON.parse(raw);
			const clamp01 = (v, fallback) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : fallback);
			return {
				master: clamp01(parsed?.master, 1.0),
				bgm: clamp01(parsed?.bgm, 1.0),
				se: clamp01(parsed?.se, 1.0)
			};
		} catch {
			return defaults;
		}
	}

	_saveVolumeScales() {
		if (!this._storage) {
			return;
		}
		try {
			this._storage.setItem(STORAGE_KEY_VOLUMES, JSON.stringify({
				master: this._userMasterScale,
				bgm: this._userBgmScale,
				se: this._userSeScale
			}));
		} catch {
			// ストレージ制限時は無視
		}
	}

	getAudioSettings() {
		return {
			muted: this._muted,
			masterScale: this._userMasterScale,
			bgmScale: this._userBgmScale,
			seScale: this._userSeScale
		};
	}

	setMasterVolume(scale) {
		const clamped = Number.isFinite(scale) ? Math.max(0, Math.min(1, scale)) : 1.0;
		this._userMasterScale = clamped;
		this._masterVolume = CONFIG.AUDIO.MASTER_GAIN * clamped;
		this._saveVolumeScales();
		this._syncMasterGain();
		return clamped;
	}

	setBgmVolume(scale) {
		const clamped = Number.isFinite(scale) ? Math.max(0, Math.min(1, scale)) : 1.0;
		this._userBgmScale = clamped;
		this._bgmVolume = CONFIG.AUDIO.BGM_GAIN * clamped;
		this._saveVolumeScales();
		this._syncChannelGains();
		return clamped;
	}

	setSeVolume(scale) {
		const clamped = Number.isFinite(scale) ? Math.max(0, Math.min(1, scale)) : 1.0;
		this._userSeScale = clamped;
		this._seVolume = CONFIG.AUDIO.SE_GAIN * clamped;
		this._saveVolumeScales();
		this._syncChannelGains();
		return clamped;
	}

	_syncChannelGains() {
		if (!this._ctx) {
			return;
		}
		const t = this._ctx.currentTime;
		const setSmooth = (node, value) => {
			if (!node || !node.gain) {
				return;
			}
			if (typeof node.gain.setTargetAtTime === 'function') {
				node.gain.setTargetAtTime(value, t, 0.012);
			} else {
				node.gain.value = value;
			}
		};
		setSmooth(this._bgmGain, this._bgmVolume);
		setSmooth(this._seGain, this._seVolume);
		setSmooth(this._reverbSend, CONFIG.AUDIO.REVERB_WET_GAIN * this._seVolume);
		setSmooth(this._bgmReverbSend, 0.2 * this._bgmVolume);
	}

	isMuted() {
		return this._muted;
	}

	setMuted(muted) {
		this._muted = Boolean(muted);
		this._saveMutedFlag();
		if (this._muted) {
			this.stopContinuousEffects();
		}
		this._syncMasterGain();
		return this._muted;
	}

	toggleMute() {
		return this.setMuted(!this._muted);
	}

	_syncMasterGain() {
		if (!this._ctx || !this._masterGain) {
			return;
		}
		const target = this._muted ? 0 : this._masterVolume;
		const t = this._ctx.currentTime;
		if (typeof this._masterGain.gain.setTargetAtTime === 'function') {
			this._masterGain.gain.setTargetAtTime(target, t, 0.012);
		} else {
			this._masterGain.gain.value = target;
		}
	}

	/**
	 * ユーザー操作タイミングで AudioContext を初期化・アンロックする
	 * @returns {boolean} 音声再生可能な状態なら true
	 */
	unlock() {
		if (this._disposed || !this._AudioContextClass) {
			return false;
		}
		if (!this._ctx) {
			try {
				this._initContext();
			} catch {
				return false;
			}
		}
		if (this._ctx && this._ctx.state === 'suspended' && typeof this._ctx.resume === 'function') {
			try {
				const maybePromise = this._ctx.resume();
				if (maybePromise && typeof maybePromise.catch === 'function') {
					maybePromise.catch(() => {});
				}
			} catch {
				// ユーザー操作外での resume 拒否は無視
			}
		}
		this._startPendingBgmIfReady();
		return Boolean(this._ctx);
	}

	_initContext() {
		const ctx = new this._AudioContextClass();
		this._ctx = ctx;

		// マスター段：ダイナミクスコンプレッサーでパンチ感を揃え、音割れを防止する
		const masterGain = ctx.createGain();
		masterGain.gain.value = this._muted ? 0 : this._masterVolume;
		masterGain.connect(ctx.destination);
		this._masterGain = masterGain;

		let postBus = masterGain;
		if (typeof ctx.createDynamicsCompressor === 'function') {
			const comp = ctx.createDynamicsCompressor();
			comp.threshold.value = -14;
			comp.knee.value = 12;
			comp.ratio.value = 4;
			comp.attack.value = 0.003;
			comp.release.value = 0.14;
			comp.connect(masterGain);
			this._compressor = comp;
			postBus = comp;
		}

		const bgmGain = ctx.createGain();
		bgmGain.gain.value = this._bgmVolume;
		bgmGain.connect(postBus);
		this._bgmGain = bgmGain;

		const seGain = ctx.createGain();
		seGain.gain.value = this._seVolume;
		seGain.connect(postBus);
		this._seGain = seGain;

		this._buildSharedDspAssets(ctx, postBus);
	}

	_buildSharedDspAssets(ctx, postBus) {
		const rate = ctx.sampleRate || 44100;
		const len = Math.floor(rate * 1.4);

		// ホワイトノイズ＆ウォームピンクノイズバッファを事前生成
		if (typeof ctx.createBuffer === 'function') {
			const white = ctx.createBuffer(2, len, rate);
			const pink = ctx.createBuffer(2, len, rate);
			for (let ch = 0; ch < 2; ch += 1) {
				const wd = white.getChannelData(ch);
				const pd = pink.getChannelData(ch);
				let b0 = 0;
				let b1 = 0;
				let b2 = 0;
				for (let i = 0; i < len; i += 1) {
					const r = Math.random() * 2 - 1;
					wd[i] = r;
					b0 = 0.997 * b0 + r * 0.029;
					b1 = 0.985 * b1 + r * 0.032;
					b2 = 0.950 * b2 + r * 0.048;
					pd[i] = Math.max(-1, Math.min(1, (b0 + b1 + b2 + r * 0.16) * 2.2));
				}
				// ループ接続部のクリックノイズを防ぐための境界クロスフェード
				const fade = Math.min(2048, Math.floor(len * 0.08));
				for (let i = 0; i < fade; i += 1) {
					const mix = i / fade;
					const tailIdx = len - fade + i;
					wd[tailIdx] = wd[tailIdx] * (1 - mix) + wd[i] * mix;
					pd[tailIdx] = pd[tailIdx] * (1 - mix) + pd[i] * mix;
				}
			}
			this._noiseBuffer = white;
			this._pinkNoiseBuffer = pink;

			// 工場・鉄骨タワーの奥行きを演出する短めステレオ・インダストリアル空間リバーブ
			if (typeof ctx.createConvolver === 'function') {
				try {
					const irLen = Math.floor(rate * 0.34);
					const ir = ctx.createBuffer(2, irLen, rate);
					for (let ch = 0; ch < 2; ch += 1) {
						const data = ir.getChannelData(ch);
						let lp = 0;
						for (let i = 0; i < irLen; i += 1) {
							const norm = i / irLen;
							const env = Math.pow(1 - norm, 2.8);
							const raw = (Math.random() * 2 - 1) * env;
							// 高域を程よく減衰させて耳障りにならない金属ホール響きにする
							lp = lp * 0.62 + raw * 0.38;
							// 初期反射のスパイクを少し強調
							const early = (i === Math.floor(rate * 0.012) || i === Math.floor(rate * 0.027)) ? 0.55 : 1.0;
							data[i] = lp * early;
						}
					}
					// SE・BGM で共有する単一の空間リバーブ（独立センドゲインで音量を分離制御）
					const convolver = ctx.createConvolver();
					convolver.buffer = ir;
					convolver.connect(postBus);
					this._reverbIrBuffer = ir;
					this._reverbConvolver = convolver;

					const reverbSend = ctx.createGain();
					reverbSend.gain.value = CONFIG.AUDIO.REVERB_WET_GAIN * this._seVolume;
					reverbSend.connect(convolver);
					this._reverbSend = reverbSend;

					const bgmReverbSend = ctx.createGain();
					bgmReverbSend.gain.value = 0.2 * this._bgmVolume;
					bgmReverbSend.connect(convolver);
					this._bgmReverbSend = bgmReverbSend;
				} catch {
					this._reverbIrBuffer = null;
					this._reverbConvolver = null;
					this._reverbSend = null;
					this._bgmReverbSend = null;
				}
			}
		}

		// アナログサチュレーション（ソフトクリッパー）カーブ
		const curveLen = 256;
		const curve = new Float32Array(curveLen);
		for (let i = 0; i < curveLen; i += 1) {
			const x = (i * 2) / (curveLen - 1) - 1;
			curve[i] = Math.tanh(x * 2.4);
		}
		this._softClipCurve = curve;
	}

	_canPlayCooldown(key, minIntervalSec) {
		if (!minIntervalSec || minIntervalSec <= 0) {
			return true;
		}
		const now = this._nowFn();
		const prev = this._cooldowns.get(key) ?? -Infinity;
		if (now - prev < minIntervalSec) {
			return false;
		}
		this._cooldowns.set(key, now);
		return true;
	}

	_panForX(worldX) {
		if (!Number.isFinite(worldX)) {
			return 0;
		}
		return Math.max(-0.78, Math.min(0.78, worldX / 17));
	}

	_acquireVoiceSlot(durationSec) {
		if (this._activeVoices >= CONFIG.AUDIO.MAX_ACTIVE_VOICES) {
			return false;
		}
		this._activeVoices += 1;
		const releaseMs = Math.max(40, Math.ceil((durationSec + 0.06) * 1000));
		const timer = setTimeout(() => {
			this._activeVoices = Math.max(0, this._activeVoices - 1);
		}, releaseMs);
		if (typeof timer.unref === 'function') {
			timer.unref();
		}
		return true;
	}

	_createVoiceBus(pan = 0, wetMix = 0.16, drive = false) {
		const ctx = this._ctx;
		const dry = ctx.createGain();
		dry.gain.value = 1.0;

		let head = dry;
		if (drive && this._softClipCurve && typeof ctx.createWaveShaper === 'function') {
			const shaper = ctx.createWaveShaper();
			shaper.curve = this._softClipCurve;
			shaper.oversample = '2x';
			shaper.connect(dry);
			head = shaper;
		}

		if (typeof ctx.createStereoPanner === 'function') {
			const panner = ctx.createStereoPanner();
			panner.pan.value = Math.max(-1, Math.min(1, pan));
			dry.connect(panner);
			panner.connect(this._seGain);
			if (this._reverbSend && wetMix > 0) {
				const wet = ctx.createGain();
				wet.gain.value = wetMix;
				panner.connect(wet);
				wet.connect(this._reverbSend);
			}
		} else {
			dry.connect(this._seGain);
			if (this._reverbSend && wetMix > 0) {
				const wet = ctx.createGain();
				wet.gain.value = wetMix;
				dry.connect(wet);
				wet.connect(this._reverbSend);
			}
		}

		return head;
	}

	_playTone(bus, {
		type = 'sine',
		startFreq,
		endFreq = startFreq,
		delay = 0,
		duration = 0.12,
		attack = 0.004,
		gain = 0.2,
		filterType = null,
		filterStartFreq = 2400,
		filterEndFreq = filterStartFreq,
		filterQ = 1.0,
		exponentialPitch = true
	}) {
		const ctx = this._ctx;
		const t0 = ctx.currentTime + delay;
		const t1 = t0 + Math.max(0.015, duration);

		const osc = ctx.createOscillator();
		osc.type = type;
		const safeStart = Math.max(20, startFreq);
		const safeEnd = Math.max(20, endFreq);
		osc.frequency.setValueAtTime(safeStart, t0);
		if (safeEnd !== safeStart) {
			if (exponentialPitch) {
				osc.frequency.exponentialRampToValueAtTime(safeEnd, t1);
			} else {
				osc.frequency.linearRampToValueAtTime(safeEnd, t1);
			}
		}

		const amp = ctx.createGain();
		amp.gain.setValueAtTime(0.0001, t0);
		amp.gain.linearRampToValueAtTime(Math.max(0.0002, gain), t0 + Math.min(attack, duration * 0.4));
		amp.gain.exponentialRampToValueAtTime(0.0001, t1);

		if (filterType && typeof ctx.createBiquadFilter === 'function') {
			const filter = ctx.createBiquadFilter();
			filter.type = filterType;
			filter.Q.value = filterQ;
			filter.frequency.setValueAtTime(Math.max(30, filterStartFreq), t0);
			if (filterEndFreq !== filterStartFreq) {
				filter.frequency.exponentialRampToValueAtTime(Math.max(30, filterEndFreq), t1);
			}
			osc.connect(filter);
			filter.connect(amp);
		} else {
			osc.connect(amp);
		}

		amp.connect(bus);
		osc.start(t0);
		osc.stop(t1 + 0.02);
	}

	/**
	 * 2オペレータ FM 合成ヒット（金属打音・ドラム缶・近代的シンセプラック用）
	 */
	_playFmHit(bus, {
		carrierStart,
		carrierEnd = carrierStart,
		modRatio = 1.414,
		modDepthStart = 240,
		modDepthEnd = 10,
		carrierType = 'sine',
		modType = 'sine',
		delay = 0,
		duration = 0.16,
		gain = 0.2
	}) {
		const ctx = this._ctx;
		const t0 = ctx.currentTime + delay;
		const t1 = t0 + Math.max(0.02, duration);

		const carrier = ctx.createOscillator();
		carrier.type = carrierType;
		carrier.frequency.setValueAtTime(Math.max(25, carrierStart), t0);
		if (carrierEnd !== carrierStart) {
			carrier.frequency.exponentialRampToValueAtTime(Math.max(25, carrierEnd), t1);
		}

		const mod = ctx.createOscillator();
		mod.type = modType;
		mod.frequency.setValueAtTime(Math.max(20, carrierStart * modRatio), t0);

		const modGain = ctx.createGain();
		modGain.gain.setValueAtTime(Math.max(1, modDepthStart), t0);
		modGain.gain.exponentialRampToValueAtTime(Math.max(0.5, modDepthEnd), t1);

		const amp = ctx.createGain();
		amp.gain.setValueAtTime(0.0001, t0);
		amp.gain.linearRampToValueAtTime(Math.max(0.0002, gain), t0 + 0.003);
		amp.gain.exponentialRampToValueAtTime(0.0001, t1);

		mod.connect(modGain);
		modGain.connect(carrier.frequency);
		carrier.connect(amp);
		amp.connect(bus);

		mod.start(t0);
		carrier.start(t0);
		mod.stop(t1 + 0.02);
		carrier.stop(t1 + 0.02);
	}

	_playNoise(bus, {
		pink = true,
		delay = 0,
		duration = 0.12,
		attack = 0.004,
		gain = 0.15,
		filterType = 'bandpass',
		startFreq = 1200,
		endFreq = startFreq,
		q = 1.2
	}) {
		const buffer = pink ? (this._pinkNoiseBuffer || this._noiseBuffer) : this._noiseBuffer;
		if (!buffer) {
			return;
		}
		const ctx = this._ctx;
		const t0 = ctx.currentTime + delay;
		const t1 = t0 + Math.max(0.015, duration);

		const src = ctx.createBufferSource();
		src.buffer = buffer;

		const filter = ctx.createBiquadFilter();
		filter.type = filterType;
		filter.Q.value = q;
		filter.frequency.setValueAtTime(Math.max(40, startFreq), t0);
		if (endFreq !== startFreq) {
			filter.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), t1);
		}

		const amp = ctx.createGain();
		amp.gain.setValueAtTime(0.0001, t0);
		amp.gain.linearRampToValueAtTime(Math.max(0.0002, gain), t0 + Math.min(attack, duration * 0.4));
		amp.gain.exponentialRampToValueAtTime(0.0001, t1);

		src.connect(filter);
		filter.connect(amp);
		amp.connect(bus);

		src.start(t0, Math.random() * 0.4, duration + 0.03);
		src.stop(t1 + 0.02);
	}

	/**
	 * 効果音を種別に応じてプロシージャル生成・再生する
	 * @param {string} type SE識別子
	 * @param {object} [options] x座標パン・種類・衝撃速度など
	 * @returns {boolean} 発音を実行した場合 true
	 */
	playSe(type, options = {}) {
		if (this._disposed || this._muted) {
			return false;
		}
		if (!this.unlock() || !this._ctx || !this._seGain) {
			return false;
		}
		// 一度でもアンロック前にキューが溜まって再生が詰まらないよう、完全停止中以外の要求を受け付ける
		const pan = this._panForX(options.x);

		switch (type) {
			case 'jump':
				return this._seJump(pan);
			case 'land':
				return this._seLand(pan, options.impactSpeed ?? 8);
			case 'step':
				return this._seStep(pan);
			case 'climb':
				return this._seClimb(pan);
			case 'barrelThrow':
			case 'obstacleMove':
				return this._seThrow(pan, options.kind || 'barrel');
			case 'barrelBounce':
				return this._seBounce(pan, options.kind || 'barrel', options.fast);
			case 'pressSlam':
				return this._sePressSlam(pan);
			case 'burnerIgnite':
				return this._seBurnerIgnite(pan);
			case 'arcDischarge':
				return this._seArcDischarge(pan);
			case 'smash':
			case 'obstacleHit':
				return this._seSmash(pan);
			case 'jumpOver':
				return this._seJumpOver(pan);
			case 'itemBonus':
			case 'item':
				return this._seItemBonus();
			case 'extraLife':
				return this._seExtraLife();
			case 'hammerPickup':
				return this._seHammerPickup();
			case 'nodeActivate':
				return this._seNodeActivate(pan);
			case 'nodeUnlock':
				return this._seNodeUnlock();
			case 'cageShatter':
				return this._seCageShatter(pan);
			case 'mechDescend':
				return this._seMechDescend();
			case 'quakeWindup':
				return this._seQuakeWindup();
			case 'girderRattle':
			case 'girderShake':
				return this._seGirderRattle(pan);
			case 'shakeOff':
				return this._seShakeOff(pan);
			case 'mortarImpact':
				return this._seMortarImpact(pan);
			case 'shieldDeflect':
				return this._seShieldDeflect(pan);
			case 'damage':
				return this._seDamage();
			case 'miss':
				return this._seMiss();
			case 'bossDefeat':
				return this._seBossDefeat();
			case 'collapseStart':
				return this._seCollapseStart();
			case 'collapseImpact':
				return this._seCollapseImpact(pan, Boolean(options.heavy));
			case 'stageClear':
				return this._seStageClear();
			case 'uiMove':
				return this._seUiMove();
			case 'uiConfirm':
				return this._seUiConfirm();
			case 'uiCancel':
				return this._seUiCancel();
			case 'cameraSwitch':
				return this._seCameraSwitch();
			default:
				return false;
		}
	}

	_seJump(pan) {
		if (!this._acquireVoiceSlot(0.18)) {
			return false;
		}
		const bus = this._createVoiceBus(pan, 0.14);
		this._playTone(bus, { type: 'sine', startFreq: 138, endFreq: 365, duration: 0.105, gain: 0.24 });
		this._playTone(bus, {
			type: 'triangle',
			startFreq: 270,
			endFreq: 740,
			duration: 0.14,
			gain: 0.14,
			filterType: 'lowpass',
			filterStartFreq: 2400,
			filterEndFreq: 950
		});
		this._playNoise(bus, { pink: false, duration: 0.06, gain: 0.08, filterType: 'highpass', startFreq: 1700, q: 0.8 });
		return true;
	}

	_seLand(pan, impactSpeed) {
		if (!this._acquireVoiceSlot(0.16)) {
			return false;
		}
		const scale = Math.max(0.4, Math.min(1.25, impactSpeed / 14));
		const bus = this._createVoiceBus(pan, 0.22, true);
		this._playTone(bus, { type: 'sine', startFreq: 118, endFreq: 42, duration: 0.11, gain: 0.26 * scale });
		this._playFmHit(bus, {
			carrierStart: 245,
			carrierEnd: 135,
			modRatio: 1.56,
			modDepthStart: 190 * scale,
			duration: 0.085,
			gain: 0.13 * scale
		});
		this._playNoise(bus, { pink: true, duration: 0.055, gain: 0.11 * scale, filterType: 'bandpass', startFreq: 1350, endFreq: 680 });
		return true;
	}

	_seStep(pan) {
		if (!this._canPlayCooldown('step', CONFIG.AUDIO.STEP_COOLDOWN) || !this._acquireVoiceSlot(0.05)) {
			return false;
		}
		const jitter = 0.93 + Math.random() * 0.14;
		const bus = this._createVoiceBus(pan, 0.08);
		this._playTone(bus, { type: 'sine', startFreq: 162 * jitter, endFreq: 68 * jitter, duration: 0.038, gain: 0.085 });
		this._playNoise(bus, { pink: true, duration: 0.026, gain: 0.05, filterType: 'bandpass', startFreq: 1900 * jitter, q: 1.5 });
		return true;
	}

	_seClimb(pan) {
		if (!this._canPlayCooldown('climb', CONFIG.AUDIO.CLIMB_COOLDOWN) || !this._acquireVoiceSlot(0.09)) {
			return false;
		}
		this._climbHand *= -1;
		const pitch = this._climbHand > 0 ? 1.0 : 1.14;
		const bus = this._createVoiceBus(pan, 0.18);
		this._playFmHit(bus, {
			carrierStart: 720 * pitch,
			carrierEnd: 690 * pitch,
			modRatio: 1.414,
			modDepthStart: 260,
			duration: 0.075,
			gain: 0.085
		});
		this._playNoise(bus, { pink: true, duration: 0.032, gain: 0.045, filterType: 'bandpass', startFreq: 1250 });
		return true;
	}

	_seThrow(pan, kind) {
		if (!this._acquireVoiceSlot(0.24)) {
			return false;
		}
		const bus = this._createVoiceBus(pan, 0.22, kind === 'drum');
		if (kind === 'drum') {
			this._playTone(bus, { type: 'triangle', startFreq: 210, endFreq: 460, duration: 0.14, gain: 0.14 });
			this._playFmHit(bus, { carrierStart: 320, carrierEnd: 240, modRatio: 1.54, modDepthStart: 220, duration: 0.16, gain: 0.15 });
			this._playNoise(bus, { pink: false, duration: 0.12, gain: 0.09, filterType: 'bandpass', startFreq: 1900, endFreq: 850 });
		} else if (kind === 'tire') {
			this._playTone(bus, { type: 'sine', startFreq: 145, endFreq: 295, duration: 0.15, gain: 0.17 });
			this._playNoise(bus, { pink: true, duration: 0.16, gain: 0.11, filterType: 'lowpass', startFreq: 750, endFreq: 300 });
		} else {
			this._playTone(bus, { type: 'triangle', startFreq: 185, endFreq: 95, duration: 0.1, gain: 0.13 });
			this._playNoise(bus, { pink: true, duration: 0.18, gain: 0.12, filterType: 'bandpass', startFreq: 320, endFreq: 760, q: 1.1 });
		}
		return true;
	}

	_seBounce(pan, kind, fast) {
		if (!this._canPlayCooldown(`bounce:${kind}`, CONFIG.AUDIO.BOUNCE_COOLDOWN) || !this._acquireVoiceSlot(0.24)) {
			return false;
		}
		const bus = this._createVoiceBus(pan, 0.26, kind === 'drum');
		const fastPitch = fast ? 1.12 : 1.0;
		if (kind === 'drum') {
			this._playTone(bus, { type: 'sine', startFreq: 122 * fastPitch, endFreq: 54, duration: 0.14, gain: 0.18 });
			this._playFmHit(bus, {
				carrierStart: 188 * fastPitch,
				carrierEnd: 172 * fastPitch,
				modRatio: 1.58,
				modDepthStart: 290,
				duration: 0.22,
				gain: 0.16
			});
		} else if (kind === 'tire') {
			this._playTone(bus, { type: 'sine', startFreq: 96 * fastPitch, endFreq: 42, duration: 0.17, gain: 0.22 });
			this._playTone(bus, {
				type: 'triangle',
				startFreq: 320,
				endFreq: 195,
				duration: 0.075,
				gain: 0.09,
				filterType: 'bandpass',
				filterStartFreq: 480
			});
		} else {
			this._playTone(bus, { type: 'triangle', startFreq: 175 * fastPitch, endFreq: 76, duration: 0.11, gain: 0.18 });
			this._playFmHit(bus, {
				carrierStart: 420 * fastPitch,
				carrierEnd: 330 * fastPitch,
				modRatio: 1.38,
				modDepthStart: 160,
				duration: 0.10,
				gain: 0.11
			});
		}
		return true;
	}

	_sePressSlam(pan) {
		if (!this._canPlayCooldown('pressSlam', 0.09) || !this._acquireVoiceSlot(0.36)) {
			return false;
		}
		// プレス機接地時の重低音「ドンっ」衝撃（超低音サブキック＋重鉄塊の鈍い着底音）
		const bus = this._createVoiceBus(pan, 0.28, true);
		this._playTone(bus, { type: 'sine', startFreq: 92, endFreq: 24, duration: 0.30, gain: 0.42 });
		this._playTone(bus, { type: 'triangle', startFreq: 72, endFreq: 28, duration: 0.22, gain: 0.24 });
		this._playFmHit(bus, {
			carrierStart: 135,
			carrierEnd: 42,
			modRatio: 1.48,
			modDepthStart: 180,
			modDepthEnd: 20,
			duration: 0.22,
			gain: 0.20
		});
		this._playNoise(bus, { pink: true, duration: 0.18, gain: 0.18, filterType: 'lowpass', startFreq: 680, endFreq: 130, q: 1.0 });
		return true;
	}

	_seBurnerIgnite(pan) {
		if (!this._canPlayCooldown('burnerIgnite', 0.16) || !this._acquireVoiceSlot(0.18)) {
			return false;
		}
		// 炎が出る瞬間のみ鳴る、短く低めで乾いた「ボォッ」音（複数バーナーでも連続過多にしない）
		const bus = this._createVoiceBus(pan, 0.02, false);
		this._playNoise(bus, { pink: true, duration: 0.14, gain: 0.16, filterType: 'bandpass', startFreq: 185, endFreq: 300, q: 0.8 });
		this._playNoise(bus, { pink: false, duration: 0.10, gain: 0.065, filterType: 'bandpass', startFreq: 620, endFreq: 820, q: 0.75 });
		return true;
	}

	_seArcDischarge(pan) {
		if (!this._canPlayCooldown('arcDischarge', 0.14) || !this._acquireVoiceSlot(0.22)) {
			return false;
		}
		const bus = this._createVoiceBus(pan, 0.24, true);
		this._playTone(bus, { type: 'sawtooth', startFreq: 120, endFreq: 116, duration: 0.16, gain: 0.1, filterType: 'lowpass', filterStartFreq: 680 });
		this._playFmHit(bus, {
			carrierStart: 1240,
			carrierEnd: 680,
			modRatio: 2.31,
			modDepthStart: 950,
			carrierType: 'triangle',
			duration: 0.15,
			gain: 0.12
		});
		this._playNoise(bus, { pink: false, duration: 0.16, gain: 0.13, filterType: 'bandpass', startFreq: 2800, endFreq: 1600, q: 1.8 });
		return true;
	}

	_seSmash(pan) {
		if (!this._acquireVoiceSlot(0.28)) {
			return false;
		}
		const bus = this._createVoiceBus(pan, 0.28, true);
		this._playTone(bus, { type: 'sine', startFreq: 168, endFreq: 46, duration: 0.18, gain: 0.3 });
		this._playFmHit(bus, {
			carrierStart: 620,
			carrierEnd: 310,
			modRatio: 1.47,
			modDepthStart: 640,
			duration: 0.19,
			gain: 0.18
		});
		this._playNoise(bus, { pink: false, duration: 0.14, gain: 0.15, filterType: 'bandpass', startFreq: 1600, endFreq: 620 });
		this._playTone(bus, { type: 'triangle', startFreq: 587.33, endFreq: 880, delay: 0.025, duration: 0.19, gain: 0.13 });
		return true;
	}

	_seJumpOver(pan) {
		if (!this._acquireVoiceSlot(0.22)) {
			return false;
		}
		const bus = this._createVoiceBus(pan, 0.22);
		this._playTone(bus, { type: 'triangle', startFreq: 659.25, duration: 0.11, gain: 0.14 });
		this._playTone(bus, { type: 'sine', startFreq: 1318.5, duration: 0.11, gain: 0.06 });
		this._playTone(bus, { type: 'triangle', startFreq: 987.77, delay: 0.042, duration: 0.16, gain: 0.15 });
		this._playTone(bus, { type: 'sine', startFreq: 1975.5, delay: 0.042, duration: 0.16, gain: 0.06 });
		return true;
	}

	_seItemBonus() {
		if (!this._acquireVoiceSlot(0.36)) {
			return false;
		}
		const notes = [523.25, 659.25, 783.99, 1046.5];
		const bus = this._createVoiceBus(0, 0.32);
		notes.forEach((freq, idx) => {
			const delay = idx * 0.044;
			this._playTone(bus, { type: 'triangle', startFreq: freq, delay, duration: 0.18, gain: 0.15 });
			this._playTone(bus, { type: 'sine', startFreq: freq * 2, delay, duration: 0.18, gain: 0.065 });
		});
		return true;
	}

	_seExtraLife() {
		if (!this._acquireVoiceSlot(0.65)) {
			return false;
		}
		// 1UP達成を祝う明るいアーケード風上昇ファンファーレチャイム
		const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98];
		const bus = this._createVoiceBus(0, 0.36, true);
		notes.forEach((freq, idx) => {
			const delay = idx * 0.055;
			const isLast = idx === notes.length - 1;
			const dur = isLast ? 0.36 : 0.16;
			this._playTone(bus, { type: 'triangle', startFreq: freq, delay, duration: dur, gain: isLast ? 0.2 : 0.16 });
			this._playTone(bus, { type: 'sine', startFreq: freq * 2, delay, duration: dur, gain: 0.08 });
		});
		return true;
	}

	_seHammerPickup() {
		if (!this._acquireVoiceSlot(0.58)) {
			return false;
		}
		const bus = this._createVoiceBus(0, 0.34, true);
		this._playTone(bus, { type: 'sine', startFreq: 68, endFreq: 136, duration: 0.26, gain: 0.24 });
		const chord = [261.63, 392.0, 523.25, 659.25];
		chord.forEach((freq, idx) => {
			this._playTone(bus, {
				type: 'sawtooth',
				startFreq: freq,
				delay: idx * 0.048,
				duration: 0.34,
				gain: 0.11,
				filterType: 'lowpass',
				filterStartFreq: 950,
				filterEndFreq: 3200
			});
			this._playTone(bus, { type: 'triangle', startFreq: freq * 1.004, delay: idx * 0.048, duration: 0.34, gain: 0.09 });
		});
		return true;
	}

	_seNodeActivate(pan) {
		if (!this._acquireVoiceSlot(0.45)) {
			return false;
		}
		const bus = this._createVoiceBus(pan, 0.32, true);
		this._playTone(bus, { type: 'sine', startFreq: 140, endFreq: 38, duration: 0.24, gain: 0.3 });
		this._playFmHit(bus, {
			carrierStart: 920,
			carrierEnd: 185,
			modRatio: 1.62,
			modDepthStart: 540,
			duration: 0.34,
			gain: 0.18
		});
		this._playTone(bus, { type: 'triangle', startFreq: 880, endFreq: 1318.5, delay: 0.08, duration: 0.26, gain: 0.14 });
		return true;
	}

	_seNodeUnlock() {
		if (!this._acquireVoiceSlot(0.42)) {
			return false;
		}
		const bus = this._createVoiceBus(0, 0.3);
		[440, 554.37, 659.25, 880, 1318.5].forEach((freq, idx) => {
			this._playTone(bus, { type: 'triangle', startFreq: freq, delay: idx * 0.045, duration: 0.2, gain: 0.13 });
		});
		return true;
	}

	_seCageShatter(pan = 0) {
		if (!this._acquireVoiceSlot(0.65)) {
			return false;
		}
		// 檻の鉄格子が粉砕されて金属棒が四散する複合破砕音＋解除チャイム
		const bus = this._createVoiceBus(pan, 0.44, true);
		this._playTone(bus, { type: 'sine', startFreq: 132, endFreq: 34, duration: 0.26, gain: 0.34 });
		this._playNoise(bus, {
			pink: false,
			duration: 0.22,
			gain: 0.28,
			filterType: 'bandpass',
			startFreq: 2400,
			endFreq: 750,
			q: 1.4
		});
		[
			[0.0, 960, 290],
			[0.055, 1340, 420],
			[0.12, 820, 240],
			[0.18, 1520, 480],
			[0.25, 1080, 310]
		].forEach(([delay, cStart, cEnd]) => {
			this._playFmHit(bus, {
				carrierStart: cStart,
				carrierEnd: cEnd,
				modRatio: 1.47,
				modDepthStart: 420,
				duration: 0.16,
				delay,
				gain: 0.14
			});
		});
		[523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
			this._playTone(bus, {
				type: 'triangle',
				startFreq: freq,
				delay: 0.08 + idx * 0.045,
				duration: 0.22,
				gain: 0.11
			});
		});
		return true;
	}

	_seMechDescend() {
		if (!this._acquireVoiceSlot(0.45)) {
			return false;
		}
		const bus = this._createVoiceBus(0, 0.28);
		this._playTone(bus, {
			type: 'sawtooth',
			startFreq: 92,
			endFreq: 146,
			duration: 0.4,
			gain: 0.14,
			filterType: 'lowpass',
			filterStartFreq: 480,
			filterEndFreq: 920
		});
		this._playFmHit(bus, { carrierStart: 280, carrierEnd: 240, modRatio: 1.5, modDepthStart: 180, duration: 0.28, gain: 0.11 });
		return true;
	}

	_seQuakeWindup() {
		if (!this._acquireVoiceSlot(0.5)) {
			return false;
		}
		const bus = this._createVoiceBus(0, 0.36, true);
		this._playFmHit(bus, {
			carrierStart: 58,
			carrierEnd: 46,
			modRatio: 1.72,
			modDepthStart: 120,
			carrierType: 'sawtooth',
			duration: 0.46,
			gain: 0.22
		});
		this._playTone(bus, { type: 'triangle', startFreq: 340, endFreq: 160, duration: 0.32, gain: 0.12 });
		this._playNoise(bus, { pink: true, duration: 0.44, gain: 0.16, filterType: 'lowpass', startFreq: 420, endFreq: 180 });
		return true;
	}

	_seGirderRattle(pan = 0) {
		if (!this._acquireVoiceSlot(0.24)) {
			return false;
		}
		// 鉄骨が激しく揺さぶられる重い低音のガシャガシャ音（高い金属軋み音は入れない）
		const pitchVar = 0.86 + Math.random() * 0.24;
		const bus = this._createVoiceBus(pan, 0.24, true);
		this._playTone(bus, { type: 'sine', startFreq: 62 * pitchVar, endFreq: 24, duration: 0.14, gain: 0.26 });
		this._playFmHit(bus, {
			carrierStart: 68 * pitchVar,
			carrierEnd: 30 * pitchVar,
			modRatio: 1.58,
			modDepthStart: 105,
			modDepthEnd: 18,
			carrierType: 'triangle',
			duration: 0.15,
			gain: 0.20
		});
		this._playNoise(bus, {
			pink: true,
			duration: 0.11,
			gain: 0.19,
			filterType: 'lowpass',
			startFreq: 480 * pitchVar,
			endFreq: 210 * pitchVar,
			q: 1.0
		});
		this._playNoise(bus, {
			pink: true,
			duration: 0.09,
			gain: 0.11,
			filterType: 'bandpass',
			startFreq: 320 * pitchVar,
			endFreq: 440 * pitchVar,
			q: 1.2
		});
		this._playFmHit(bus, {
			carrierStart: 86 * pitchVar,
			carrierEnd: 36 * pitchVar,
			modRatio: 1.71,
			modDepthStart: 115,
			modDepthEnd: 22,
			carrierType: 'triangle',
			delay: 0.055,
			duration: 0.13,
			gain: 0.16
		});
		this._playNoise(bus, {
			pink: true,
			duration: 0.11,
			delay: 0.05,
			gain: 0.14,
			filterType: 'bandpass',
			startFreq: 410 * pitchVar,
			endFreq: 220 * pitchVar,
			q: 1.3
		});
		return true;
	}

	_seShakeOff(pan) {
		if (!this._acquireVoiceSlot(0.28)) {
			return false;
		}
		const bus = this._createVoiceBus(pan, 0.28, true);
		this._playTone(bus, { type: 'sawtooth', startFreq: 330, endFreq: 68, duration: 0.24, gain: 0.18, filterType: 'lowpass', filterStartFreq: 1600, filterEndFreq: 320 });
		this._playNoise(bus, { pink: true, duration: 0.2, gain: 0.14, filterType: 'bandpass', startFreq: 980, endFreq: 280 });
		return true;
	}

	_seMortarImpact(pan) {
		if (!this._acquireVoiceSlot(0.38)) {
			return false;
		}
		const bus = this._createVoiceBus(pan, 0.36, true);
		this._playTone(bus, { type: 'sine', startFreq: 94, endFreq: 24, duration: 0.32, gain: 0.34 });
		this._playNoise(bus, { pink: true, duration: 0.34, gain: 0.22, filterType: 'lowpass', startFreq: 1150, endFreq: 130 });
		this._playFmHit(bus, { carrierStart: 290, carrierEnd: 95, modRatio: 1.43, modDepthStart: 420, duration: 0.22, gain: 0.15 });
		return true;
	}

	_seShieldDeflect(pan) {
		if (!this._canPlayCooldown('shieldDeflect', 0.1) || !this._acquireVoiceSlot(0.24)) {
			return false;
		}
		const bus = this._createVoiceBus(pan, 0.28);
		this._playFmHit(bus, {
			carrierStart: 880,
			carrierEnd: 1240,
			modRatio: 1.62,
			modDepthStart: 420,
			duration: 0.2,
			gain: 0.16
		});
		this._playNoise(bus, { pink: false, duration: 0.14, gain: 0.08, filterType: 'bandpass', startFreq: 2200, endFreq: 800, q: 2.2 });
		return true;
	}

	_seDamage() {
		if (!this._acquireVoiceSlot(0.24)) {
			return false;
		}
		const bus = this._createVoiceBus(0, 0.24, true);
		this._playTone(bus, { type: 'sawtooth', startFreq: 195, endFreq: 66, duration: 0.18, gain: 0.22, filterType: 'lowpass', filterStartFreq: 1400, filterEndFreq: 280 });
		this._playNoise(bus, { pink: false, duration: 0.12, gain: 0.14, filterType: 'bandpass', startFreq: 1400, endFreq: 420 });
		return true;
	}

	_seMiss() {
		if (!this._acquireVoiceSlot(0.65)) {
			return false;
		}
		const bus = this._createVoiceBus(0, 0.3, true);
		this._playTone(bus, { type: 'sine', startFreq: 118, endFreq: 32, duration: 0.34, gain: 0.32 });
		this._playTone(bus, {
			type: 'sawtooth',
			startFreq: 420,
			endFreq: 86,
			duration: 0.56,
			gain: 0.16,
			filterType: 'lowpass',
			filterStartFreq: 2400,
			filterEndFreq: 240
		});
		this._playTone(bus, {
			type: 'sawtooth',
			startFreq: 424,
			endFreq: 87,
			duration: 0.56,
			gain: 0.14,
			filterType: 'lowpass',
			filterStartFreq: 2400,
			filterEndFreq: 240
		});
		this._playNoise(bus, { pink: false, duration: 0.16, gain: 0.16, filterType: 'bandpass', startFreq: 1600, endFreq: 380 });
		return true;
	}

	_seBossDefeat() {
		if (!this._acquireVoiceSlot(0.95)) {
			return false;
		}
		const bus = this._createVoiceBus(0, 0.4, true);
		for (const [delay, panFreq] of [[0, 96], [0.15, 82], [0.32, 72]]) {
			this._playTone(bus, { type: 'sine', startFreq: panFreq, endFreq: 22, delay, duration: 0.36, gain: 0.3 });
			this._playNoise(bus, { pink: true, delay, duration: 0.34, gain: 0.2, filterType: 'lowpass', startFreq: 1300, endFreq: 140 });
			this._playFmHit(bus, { carrierStart: 320, carrierEnd: 85, modRatio: 1.48, modDepthStart: 560, delay, duration: 0.24, gain: 0.14 });
		}
		// 撃破の解放感を演出する壮大なシンセパワーコード
		[261.63, 392.0, 523.25, 783.99].forEach((freq) => {
			this._playTone(bus, {
				type: 'sawtooth',
				startFreq: freq,
				delay: 0.24,
				duration: 0.65,
				gain: 0.085,
				filterType: 'lowpass',
				filterStartFreq: 700,
				filterEndFreq: 3400
			});
		});
		return true;
	}

	_seCollapseStart() {
		if (!this._acquireVoiceSlot(0.6)) {
			return false;
		}
		const bus = this._createVoiceBus(0, 0.38, true);
		this._playFmHit(bus, { carrierStart: 940, carrierEnd: 320, modRatio: 1.41, modDepthStart: 780, duration: 0.18, gain: 0.18 });
		this._playTone(bus, { type: 'sine', startFreq: 72, endFreq: 22, duration: 0.54, gain: 0.3 });
		this._playNoise(bus, { pink: true, duration: 0.52, gain: 0.2, filterType: 'lowpass', startFreq: 850, endFreq: 160 });
		return true;
	}

	_seCollapseImpact(pan, heavy) {
		if (!this._canPlayCooldown('collapseImpact', CONFIG.AUDIO.IMPACT_COOLDOWN) || !this._acquireVoiceSlot(0.28)) {
			return false;
		}
		const gainScale = heavy ? 1.0 : 0.55;
		const bus = this._createVoiceBus(pan, heavy ? 0.35 : 0.22, heavy);
		this._playTone(bus, { type: 'sine', startFreq: heavy ? 88 : 130, endFreq: 28, duration: heavy ? 0.24 : 0.14, gain: 0.26 * gainScale });
		this._playFmHit(bus, {
			carrierStart: heavy ? 360 : 520,
			carrierEnd: heavy ? 160 : 280,
			modRatio: 1.414,
			modDepthStart: heavy ? 460 : 240,
			duration: heavy ? 0.22 : 0.12,
			gain: 0.16 * gainScale
		});
		return true;
	}

	_seStageClear() {
		if (!this._acquireVoiceSlot(1.2)) {
			return false;
		}
		const bus = this._createVoiceBus(0, 0.36);
		const sequence = [
			{ delay: 0.0, freqs: [392.0, 523.25], dur: 0.18 },
			{ delay: 0.13, freqs: [440.0, 587.33], dur: 0.18 },
			{ delay: 0.26, freqs: [493.88, 659.25], dur: 0.18 },
			{ delay: 0.40, freqs: [523.25, 659.25, 783.99, 1046.5], dur: 0.72 }
		];
		for (const step of sequence) {
			for (const freq of step.freqs) {
				this._playTone(bus, {
					type: 'sawtooth',
					startFreq: freq,
					delay: step.delay,
					duration: step.dur,
					gain: 0.085,
					filterType: 'lowpass',
					filterStartFreq: 1100,
					filterEndFreq: 3600
				});
				this._playTone(bus, {
					type: 'triangle',
					startFreq: freq * 1.003,
					delay: step.delay,
					duration: step.dur,
					gain: 0.075
				});
			}
		}
		this._playTone(bus, { type: 'sine', startFreq: 130.81, delay: 0.4, duration: 0.65, gain: 0.22 });
		return true;
	}

	_seUiMove() {
		if (!this._acquireVoiceSlot(0.06)) {
			return false;
		}
		const bus = this._createVoiceBus(0, 0.1);
		this._playTone(bus, { type: 'triangle', startFreq: 960, endFreq: 1240, duration: 0.042, gain: 0.095 });
		return true;
	}

	_seUiConfirm() {
		if (!this._acquireVoiceSlot(0.22)) {
			return false;
		}
		const bus = this._createVoiceBus(0, 0.2);
		this._playTone(bus, { type: 'triangle', startFreq: 523.25, duration: 0.1, gain: 0.14 });
		this._playTone(bus, { type: 'triangle', startFreq: 783.99, delay: 0.045, duration: 0.16, gain: 0.16 });
		this._playTone(bus, { type: 'sine', startFreq: 1567.98, delay: 0.045, duration: 0.16, gain: 0.06 });
		return true;
	}

	_seUiCancel() {
		if (!this._acquireVoiceSlot(0.14)) {
			return false;
		}
		const bus = this._createVoiceBus(0, 0.16);
		this._playTone(bus, { type: 'triangle', startFreq: 620, endFreq: 340, duration: 0.11, gain: 0.12 });
		return true;
	}

	_seCameraSwitch() {
		if (!this._acquireVoiceSlot(0.14)) {
			return false;
		}
		const bus = this._createVoiceBus(0, 0.14);
		this._playNoise(bus, { pink: false, duration: 0.08, gain: 0.07, filterType: 'bandpass', startFreq: 650, endFreq: 1950, q: 1.6 });
		this._playTone(bus, { type: 'sine', startFreq: 1046.5, endFreq: 1318.5, duration: 0.055, gain: 0.09 });
		return true;
	}

	/**
	 * ボス鉄骨揺らし中などの継続系効果音をフレーム同期で更新する
	 * @param {{ quakeShaking?: boolean }} state
	 * @param {number} dt
	 */
	updateContinuousEffects(state = {}, dt = 0) {
		if (this._disposed || this._muted || !this._ctx || !this._seGain) {
			this.stopContinuousEffects();
			return;
		}

		// STAGE 3 ボス鉄骨揺らし中：重く低いガシャガシャ音を連続発生
		const quakeShaking = Boolean(state.quakeShaking);
		if (quakeShaking) {
			if (!this._wasQuakeShaking) {
				this._wasQuakeShaking = true;
				this._quakeRattleTimer = 0;
			}
			this._quakeRattleTimer -= dt;
			if (this._quakeRattleTimer <= 0) {
				const rattlePan = (Math.random() * 2 - 1) * 0.35;
				this._seGirderRattle(rattlePan);
				this._quakeRattleTimer = 0.125 + Math.random() * 0.065;
			}
		} else {
			this._wasQuakeShaking = false;
			this._quakeRattleTimer = 0;
		}
	}

	/**
	 * 継続中の鉄骨揺らし効果音を即座に停止する
	 */
	stopContinuousEffects() {
		this._wasQuakeShaking = false;
		this._quakeRattleTimer = 0;
	}

	/**
	 * 指定IDの BGM を再生する（track.loop === false のジングルは1回再生後に自然終了）
	 * @param {string} trackId
	 * @param {object} [options]
	 * @param {boolean} [options.restart=false]
	 * @returns {boolean} 即時にスケジューラを開始できた場合 true
	 */
	playBgm(trackId, options = {}) {
		if (this._disposed || !trackId || !BGM_TRACKS[trackId]) {
			return false;
		}
		if (this._currentBgmTrackId === trackId && !options.restart && !this._bgmCompleted && this._bgmTrackBus) {
			if (this._bgmPaused) {
				this.setBgmPaused(false);
			}
			return true;
		}

		this._pendingBgmTrackId = trackId;
		this._bgmPaused = false;
		this._bgmCompleted = false;
		this._inPlayBgm = true;
		try {
			this.unlock();
		} finally {
			this._inPlayBgm = false;
		}

		if (!this._ctx || !this._bgmGain) {
			return false;
		}
		this._pendingBgmTrackId = null;
		this._beginBgmPlayback(trackId);
		return true;
	}

	/**
	 * 再生中の BGM を即座に停止してリセットする
	 */
	stopBgm() {
		this._pendingBgmTrackId = null;
		this._currentBgmTrackId = null;
		this._bgmPaused = false;
		this._bgmCompleted = false;
		this._bgmStep = 0;
		this._bgmNextNoteTime = 0;
		this._stopBgmTimer();
		this._teardownBgmTrackBuses();
	}

	/**
	 * BGM を現在ステップ位置を保持したまま一時停止・再開する
	 * @param {boolean} paused
	 */
	setBgmPaused(paused) {
		const nextPaused = Boolean(paused);
		if (this._bgmPaused === nextPaused || !this._currentBgmTrackId || this._bgmCompleted) {
			this._bgmPaused = nextPaused;
			return;
		}
		this._bgmPaused = nextPaused;
		if (nextPaused) {
			this._stopBgmTimer();
			this._teardownBgmTrackBuses();
			return;
		}
		if (!this._ctx || !this._bgmGain || this._disposed) {
			return;
		}
		this._createBgmTrackBuses();
		this._bgmNextNoteTime = this._ctx.currentTime + 0.025;
		this._startBgmTimer();
		this.updateBgm();
	}

	/**
	 * @returns {string|null}
	 */
	getCurrentBgmTrack() {
		return this._currentBgmTrackId;
	}

	/**
	 * @returns {boolean}
	 */
	isBgmPlaying() {
		return Boolean(this._currentBgmTrackId && !this._bgmPaused && !this._bgmCompleted && this._bgmTrackBus);
	}

	/**
	 * @returns {boolean}
	 */
	isBgmPaused() {
		return this._bgmPaused;
	}

	/**
	 * 先読みウェーブスケジューラを 1 ティック進める（タイマーおよび描画ループ双方から安全に呼べる）
	 */
	updateBgm() {
		if (this._disposed || !this._ctx || !this._currentBgmTrackId || this._bgmPaused || this._bgmCompleted || !this._bgmTrackBus) {
			return;
		}
		const track = BGM_TRACKS[this._currentBgmTrackId];
		if (!track) {
			return;
		}
		const stepDur = 60 / track.bpm / (track.stepsPerBeat || 4);
		const now = this._ctx.currentTime;

		// タブ休止等で大幅な遅延が起きた場合は大量同時発音を防ぎつつステップ位置を進める
		if (now - this._bgmNextNoteTime > 2.0) {
			const skippedSteps = Math.floor((now - this._bgmNextNoteTime) / stepDur);
			if (track.loop === false && this._bgmStep + skippedSteps >= track.totalSteps) {
				this._bgmCompleted = true;
				this._stopBgmTimer();
				return;
			}
			this._bgmStep = (this._bgmStep + skippedSteps) % track.totalSteps;
			this._bgmNextNoteTime = now;
		}

		while (this._bgmNextNoteTime < now + BGM_SCHEDULE_AHEAD_SEC) {
			this._scheduleBgmStep(track, this._bgmStep, this._bgmNextNoteTime, stepDur);
			this._bgmNextNoteTime += stepDur;
			if (this._bgmStep + 1 >= track.totalSteps) {
				if (track.loop === false) {
					// ワンショットジングルは最終音の余韻が鳴りきるまでバスを切らず、スケジューラのみ完了する
					this._bgmStep = track.totalSteps;
					this._bgmCompleted = true;
					this._stopBgmTimer();
					break;
				}
				this._bgmStep = 0;
			} else {
				this._bgmStep += 1;
			}
		}
	}

	_startPendingBgmIfReady() {
		if (this._inPlayBgm || !this._pendingBgmTrackId || this._currentBgmTrackId || !this._ctx || !this._bgmGain) {
			return;
		}
		const pending = this._pendingBgmTrackId;
		this._pendingBgmTrackId = null;
		this._beginBgmPlayback(pending);
	}

	_beginBgmPlayback(trackId) {
		this._stopBgmTimer();
		this._teardownBgmTrackBuses();
		this._currentBgmTrackId = trackId;
		this._bgmPaused = false;
		this._bgmCompleted = false;
		this._bgmStep = 0;
		this._bgmNextNoteTime = this._ctx.currentTime + 0.02;
		this._createBgmTrackBuses();
		this._startBgmTimer();
		this.updateBgm();
	}

	_createBgmTrackBuses() {
		const ctx = this._ctx;
		if (!ctx || !this._bgmGain) {
			return;
		}
		const trackBus = ctx.createGain();
		trackBus.gain.value = 1.0;
		trackBus.connect(this._bgmGain);
		this._bgmTrackBus = trackBus;

		if (this._bgmReverbSend) {
			const trackRev = ctx.createGain();
			trackRev.gain.value = 1.0;
			trackRev.connect(this._bgmReverbSend);
			this._bgmTrackRevSend = trackRev;
		} else {
			this._bgmTrackRevSend = null;
		}
	}

	_teardownBgmTrackBuses() {
		if (this._bgmTrackBus) {
			try {
				if (this._ctx) {
					this._bgmTrackBus.gain.setValueAtTime(0, this._ctx.currentTime);
				}
				this._bgmTrackBus.disconnect();
			} catch {
				// 無視
			}
			this._bgmTrackBus = null;
		}
		if (this._bgmTrackRevSend) {
			try {
				if (this._ctx) {
					this._bgmTrackRevSend.gain.setValueAtTime(0, this._ctx.currentTime);
				}
				this._bgmTrackRevSend.disconnect();
			} catch {
				// 無視
			}
			this._bgmTrackRevSend = null;
		}
	}

	_startBgmTimer() {
		if (this._bgmTimerId !== null) {
			return;
		}
		const id = setInterval(() => {
			this.updateBgm();
		}, BGM_LOOKAHEAD_INTERVAL_MS);
		if (id && typeof id.unref === 'function') {
			id.unref();
		}
		this._bgmTimerId = id;
	}

	_stopBgmTimer() {
		if (this._bgmTimerId !== null) {
			clearInterval(this._bgmTimerId);
			this._bgmTimerId = null;
		}
	}

	_createBgmVoiceTarget(pan = 0, wetMix = 0) {
		const ctx = this._ctx;
		const dryBus = this._bgmTrackBus;
		let target = dryBus;
		if (typeof ctx.createStereoPanner === 'function') {
			const panner = ctx.createStereoPanner();
			panner.pan.value = Math.max(-1, Math.min(1, pan));
			panner.connect(dryBus);
			target = panner;
		}
		if (wetMix > 0 && this._bgmTrackRevSend) {
			const wet = ctx.createGain();
			wet.gain.value = wetMix;
			target.connect(wet);
			wet.connect(this._bgmTrackRevSend);
		}
		return target;
	}

	_scheduleBgmStep(track, stepIdx, time, stepDur) {
		const profile = track.profile || {};
		const bassEntry = track.bass[stepIdx];
		if (bassEntry) {
			const notes = Array.isArray(bassEntry) ? bassEntry : [bassEntry];
			for (const bassNote of notes) {
				this._bgmPlayBass(bassNote.freq, bassNote.dur * stepDur, bassNote.vel ?? 1.0, time, profile);
			}
		}
		const leadEntry = track.lead[stepIdx];
		if (leadEntry) {
			const notes = Array.isArray(leadEntry) ? leadEntry : [leadEntry];
			for (const leadNote of notes) {
				this._bgmPlayLead(leadNote.freq, leadNote.dur * stepDur, leadNote.vel ?? 1.0, time, profile);
			}
		}
		const arpEntry = track.arp[stepIdx];
		if (arpEntry) {
			const notes = Array.isArray(arpEntry) ? arpEntry : [arpEntry];
			const arpPan = stepIdx % 2 === 0 ? -0.24 : 0.24;
			for (const arpNote of notes) {
				this._bgmPlayArp(arpNote.freq, arpNote.dur * stepDur, arpNote.vel ?? 0.7, arpPan, time, profile);
			}
		}
		const drumHits = track.drums[stepIdx];
		if (Array.isArray(drumHits)) {
			for (const hit of drumHits) {
				this._bgmPlayDrum(hit, time, profile);
			}
		}
	}

	_bgmPlayBass(freq, durSec, vel, time, profile = {}) {
		const ctx = this._ctx;
		const target = this._createBgmVoiceTarget(0, 0.03);
		const filter = ctx.createBiquadFilter();
		filter.type = 'lowpass';
		filter.Q.value = 1.8;
		filter.frequency.setValueAtTime(profile.bassCutoffStart ?? 680, time);
		filter.frequency.exponentialRampToValueAtTime(profile.bassCutoffEnd ?? 145, time + Math.min(0.2, durSec * 0.8));

		const amp = ctx.createGain();
		const peak = (profile.bassGain ?? 0.31) * vel;
		const endTime = time + Math.max(0.08, durSec);
		amp.gain.setValueAtTime(0.0001, time);
		amp.gain.linearRampToValueAtTime(peak, time + 0.009);
		amp.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * 0.55), endTime - 0.025);
		amp.gain.exponentialRampToValueAtTime(0.0001, endTime + 0.03);

		filter.connect(amp);
		amp.connect(target);

		// 太く丸みのある Triangle + 控えめ Saw + 深い Sine サブで重厚なベースを主役にする
		const tri = ctx.createOscillator();
		tri.type = 'triangle';
		tri.frequency.setValueAtTime(freq, time);
		tri.connect(filter);
		tri.start(time);
		tri.stop(endTime + 0.04);

		const saw = ctx.createOscillator();
		saw.type = 'sawtooth';
		saw.frequency.setValueAtTime(freq, time);
		const sawGain = ctx.createGain();
		sawGain.gain.setValueAtTime(0.45, time);
		saw.connect(sawGain);
		sawGain.connect(filter);
		saw.start(time);
		saw.stop(endTime + 0.04);

		const sub = ctx.createOscillator();
		sub.type = 'sine';
		sub.frequency.setValueAtTime(freq, time);
		const subGain = ctx.createGain();
		subGain.gain.setValueAtTime(0.68, time);
		sub.connect(subGain);
		subGain.connect(amp);
		sub.start(time);
		sub.stop(endTime + 0.04);
	}

	_bgmPlayLead(freq, durSec, vel, time, profile = {}) {
		const ctx = this._ctx;
		const isBright = Boolean(profile.brightBrass);
		const isArcade = Boolean(profile.arcadeLead);
		const target = this._createBgmVoiceTarget(isBright ? 0.04 : (isArcade ? -0.06 : 0.12), isBright ? 0.42 : (isArcade ? 0.34 : 0.36));

		const filter = ctx.createBiquadFilter();
		filter.type = 'lowpass';
		filter.Q.value = isBright ? 2.1 : (isArcade ? 1.6 : 1.1);
		filter.frequency.setValueAtTime(profile.leadCutoffStart ?? 1350, time);
		filter.frequency.exponentialRampToValueAtTime(
			profile.leadCutoffEnd ?? 480,
			time + Math.min(isBright ? 0.36 : (isArcade ? 0.24 : 0.28), durSec * 0.9)
		);

		const amp = ctx.createGain();
		const peak = (profile.leadGain ?? 0.092) * vel;
		const noteEnd = time + Math.max(0.1, durSec);
		const releaseEnd = noteEnd + (isBright ? 0.16 : (isArcade ? 0.095 : 0.075));
		amp.gain.setValueAtTime(0.0001, time);
		amp.gain.linearRampToValueAtTime(peak, time + (isBright || isArcade ? 0.008 : 0.024));
		amp.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * (isBright ? 0.8 : 0.74)), Math.max(time + 0.03, noteEnd - 0.02));
		amp.gain.exponentialRampToValueAtTime(0.0001, releaseEnd);

		filter.connect(amp);
		amp.connect(target);

		if (isBright || isArcade) {
			// 華やかなステレオ・アーケードシンセブラス／リード（デチューンSaw×2 + コアSquare/Triangle）
			const detuneRatios = isBright ? [0.9965, 1.0035] : [0.9975, 1.0025];
			for (const ratio of detuneRatios) {
				const brassSaw = ctx.createOscillator();
				brassSaw.type = 'sawtooth';
				brassSaw.frequency.setValueAtTime(freq * ratio, time);
				const g = ctx.createGain();
				g.gain.setValueAtTime(isBright ? 0.42 : 0.38, time);
				brassSaw.connect(g);
				g.connect(filter);
				brassSaw.start(time);
				brassSaw.stop(releaseEnd + 0.02);
			}
			const coreOsc = ctx.createOscillator();
			coreOsc.type = isArcade ? 'square' : 'triangle';
			coreOsc.frequency.setValueAtTime(freq, time);
			const coreGain = ctx.createGain();
			coreGain.gain.setValueAtTime(isBright ? 0.55 : 0.26, time);
			coreOsc.connect(coreGain);
			coreGain.connect(filter);
			coreOsc.start(time);
			coreOsc.stop(releaseEnd + 0.02);
			return;
		}

		// シックなミュートホーン／ウォームローブラス質感（派手な高域デチューンを抑制）
		const tri = ctx.createOscillator();
		tri.type = 'triangle';
		tri.frequency.setValueAtTime(freq, time);
		tri.connect(filter);
		tri.start(time);
		tri.stop(releaseEnd + 0.02);

		const warmSaw = ctx.createOscillator();
		warmSaw.type = 'sawtooth';
		warmSaw.frequency.setValueAtTime(freq * 1.002, time);
		const sawGain = ctx.createGain();
		sawGain.gain.setValueAtTime(0.32, time);
		warmSaw.connect(sawGain);
		sawGain.connect(filter);
		warmSaw.start(time);
		warmSaw.stop(releaseEnd + 0.02);
	}

	_bgmPlayArp(freq, durSec, vel, pan, time, profile = {}) {
		const ctx = this._ctx;
		const isBell = Boolean(profile.bellArp);
		const target = this._createBgmVoiceTarget(pan, isBell ? 0.44 : 0.3);

		const filter = ctx.createBiquadFilter();
		filter.type = 'lowpass';
		filter.Q.value = isBell ? 1.2 : 0.9;
		filter.frequency.setValueAtTime(profile.arpCutoffStart ?? 1050, time);
		filter.frequency.exponentialRampToValueAtTime(profile.arpCutoffEnd ?? 360, time + Math.max(0.08, durSec));

		const amp = ctx.createGain();
		const peak = (profile.arpGain ?? 0.068) * vel;
		const endTime = time + Math.max(0.08, durSec);
		const tailSec = isBell ? 0.24 : 0.06;
		amp.gain.setValueAtTime(0.0001, time);
		amp.gain.linearRampToValueAtTime(peak, time + (isBell ? 0.003 : 0.01));
		amp.gain.exponentialRampToValueAtTime(0.0001, endTime + tailSec);

		filter.connect(amp);
		amp.connect(target);

		if (isBell) {
			// クリアジングル向けの煌びやかなグロッケン／クリスタルベル・アルペジオ
			const bellCore = ctx.createOscillator();
			bellCore.type = 'sine';
			bellCore.frequency.setValueAtTime(freq, time);
			bellCore.connect(filter);
			bellCore.start(time);
			bellCore.stop(endTime + tailSec + 0.02);

			const over2 = ctx.createOscillator();
			over2.type = 'triangle';
			over2.frequency.setValueAtTime(freq * 2, time);
			const g2 = ctx.createGain();
			g2.gain.setValueAtTime(0.36, time);
			over2.connect(g2);
			g2.connect(filter);
			over2.start(time);
			over2.stop(endTime + tailSec + 0.02);

			const shimmer = ctx.createOscillator();
			shimmer.type = 'sine';
			shimmer.frequency.setValueAtTime(freq * 3, time);
			const g3 = ctx.createGain();
			g3.gain.setValueAtTime(0.16, time);
			g3.gain.exponentialRampToValueAtTime(0.005, time + 0.11);
			shimmer.connect(g3);
			g3.connect(filter);
			shimmer.start(time);
			shimmer.stop(time + 0.14);
			return;
		}

		// ウォーム・エレピ系の控えめなコンピング（ギラつく Saw は使わない）
		const body = ctx.createOscillator();
		body.type = 'sine';
		body.frequency.setValueAtTime(freq, time);
		body.connect(filter);
		body.start(time);
		body.stop(endTime + 0.07);

		const tine = ctx.createOscillator();
		tine.type = 'triangle';
		tine.frequency.setValueAtTime(freq * 2, time);
		const tineGain = ctx.createGain();
		tineGain.gain.setValueAtTime(0.14, time);
		tine.connect(tineGain);
		tineGain.connect(filter);
		tine.start(time);
		tine.stop(endTime + 0.07);
	}

	_bgmPlayDrum(kind, time, profile = {}) {
		const ctx = this._ctx;
		if (kind === 'K') {
			const target = this._createBgmVoiceTarget(0, 0.02);
			const amp = ctx.createGain();
			amp.gain.setValueAtTime(0.0001, time);
			amp.gain.linearRampToValueAtTime(0.28, time + 0.005);
			amp.gain.exponentialRampToValueAtTime(0.0001, time + 0.16);
			amp.connect(target);

			const body = ctx.createOscillator();
			body.type = 'sine';
			body.frequency.setValueAtTime(122, time);
			body.frequency.exponentialRampToValueAtTime(38, time + 0.13);
			body.connect(amp);
			body.start(time);
			body.stop(time + 0.18);
			return;
		}
		if (kind === 'S') {
			const target = this._createBgmVoiceTarget(0, 0.14);
			const bodyAmp = ctx.createGain();
			bodyAmp.gain.setValueAtTime(0.0001, time);
			bodyAmp.gain.linearRampToValueAtTime(0.11, time + 0.005);
			bodyAmp.gain.exponentialRampToValueAtTime(0.0001, time + 0.1);
			bodyAmp.connect(target);

			const body = ctx.createOscillator();
			body.type = 'triangle';
			body.frequency.setValueAtTime(162, time);
			body.frequency.exponentialRampToValueAtTime(88, time + 0.08);
			body.connect(bodyAmp);
			body.start(time);
			body.stop(time + 0.11);

			const brushBuf = (profile.brightDrums ? this._noiseBuffer : null) || this._pinkNoiseBuffer || this._noiseBuffer;
			if (brushBuf) {
				const src = ctx.createBufferSource();
				src.buffer = brushBuf;
				const bp = ctx.createBiquadFilter();
				bp.type = 'bandpass';
				bp.frequency.setValueAtTime(profile.brightDrums ? 2100 : 1150, time);
				bp.Q.value = profile.brightDrums ? 0.9 : 0.75;
				const nAmp = ctx.createGain();
				nAmp.gain.setValueAtTime(0.0001, time);
				nAmp.gain.linearRampToValueAtTime(profile.brightDrums ? 0.135 : 0.095, time + 0.004);
				nAmp.gain.exponentialRampToValueAtTime(0.0001, time + (profile.brightDrums ? 0.15 : 0.11));
				src.connect(bp);
				bp.connect(nAmp);
				nAmp.connect(target);
				src.start(time);
				src.stop(time + 0.16);
			}
			return;
		}
		if (kind === 'C' && (this._noiseBuffer || this._pinkNoiseBuffer)) {
			// ファンファーレの節目・フィナーレを彩る煌びやかなクラッシュシンバル
			const target = this._createBgmVoiceTarget(0.14, 0.34);
			const src = ctx.createBufferSource();
			src.buffer = this._noiseBuffer || this._pinkNoiseBuffer;
			const hp = ctx.createBiquadFilter();
			hp.type = 'highpass';
			hp.frequency.setValueAtTime(3600, time);
			const amp = ctx.createGain();
			amp.gain.setValueAtTime(0.0001, time);
			amp.gain.linearRampToValueAtTime(0.135, time + 0.006);
			amp.gain.exponentialRampToValueAtTime(0.018, time + 0.24);
			amp.gain.exponentialRampToValueAtTime(0.0001, time + 0.62);
			src.connect(hp);
			hp.connect(amp);
			amp.connect(target);
			src.start(time);
			src.stop(time + 0.65);
			return;
		}
		if ((kind === 'H' || kind === 'O') && (this._pinkNoiseBuffer || this._noiseBuffer)) {
			const isOpen = kind === 'O';
			const target = this._createBgmVoiceTarget(-0.18, isOpen ? 0.12 : 0.03);
			const src = ctx.createBufferSource();
			src.buffer = this._pinkNoiseBuffer || this._noiseBuffer;
			const hp = ctx.createBiquadFilter();
			hp.type = 'highpass';
			hp.frequency.setValueAtTime(isOpen ? 4600 : 5000, time);
			const amp = ctx.createGain();
			const dur = isOpen ? 0.14 : 0.038;
			amp.gain.setValueAtTime(0.0001, time);
			amp.gain.linearRampToValueAtTime(isOpen ? 0.048 : 0.032, time + 0.003);
			amp.gain.exponentialRampToValueAtTime(0.0001, time + dur);
			src.connect(hp);
			hp.connect(amp);
			amp.connect(target);
			src.start(time);
			src.stop(time + dur + 0.02);
			return;
		}
		if (kind === 'A') {
			// 大人向けシックに抑えた、低めのインダストリアル・リム／鉄骨打音
			const target = this._createBgmVoiceTarget(0.28, 0.22);
			const lp = ctx.createBiquadFilter();
			lp.type = 'lowpass';
			lp.frequency.setValueAtTime(920, time);
			const amp = ctx.createGain();
			amp.gain.setValueAtTime(0.0001, time);
			amp.gain.linearRampToValueAtTime(0.042, time + 0.003);
			amp.gain.exponentialRampToValueAtTime(0.0001, time + 0.095);
			lp.connect(amp);
			amp.connect(target);

			const carrier = ctx.createOscillator();
			carrier.type = 'triangle';
			carrier.frequency.setValueAtTime(profile.anvilFreq ?? 320, time);
			const mod = ctx.createOscillator();
			mod.type = 'sine';
			mod.frequency.setValueAtTime(profile.anvilModFreq ?? 480, time);
			const modGain = ctx.createGain();
			modGain.gain.setValueAtTime(65, time);
			modGain.gain.exponentialRampToValueAtTime(4, time + 0.075);
			mod.connect(modGain);
			modGain.connect(carrier.frequency);
			carrier.connect(lp);
			carrier.start(time);
			mod.start(time);
			carrier.stop(time + 0.11);
			mod.stop(time + 0.11);
		}
	}

	dispose() {
		this._disposed = true;
		this.stopBgm();
		this.stopContinuousEffects();
		if (this._ctx && typeof this._ctx.close === 'function') {
			try {
				const maybePromise = this._ctx.close();
				if (maybePromise && typeof maybePromise.catch === 'function') {
					maybePromise.catch(() => {});
				}
			} catch {
				// 無視
			}
		}
		this._ctx = null;
		this._masterGain = null;
		this._compressor = null;
		this._bgmGain = null;
		this._seGain = null;
		this._reverbIrBuffer = null;
		this._reverbConvolver = null;
		this._reverbSend = null;
		this._bgmReverbSend = null;
		this._noiseBuffer = null;
		this._pinkNoiseBuffer = null;
		this._cooldowns.clear();
	}
}
