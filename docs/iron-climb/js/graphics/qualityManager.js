import * as THREE from 'three';

/**
 * グラフィック品質ティア別の描画パラメータ定義
 * GPU性能に余裕がある環境では Image 2 相当のリッチな PBR 反射・凹凸・ブルームを有効化し、
 * 低スペック環境や負荷上昇時は段階的にフォールバックして安定したフレームレートを維持する。
 */
export const QUALITY_PRESETS = Object.freeze({
	high: Object.freeze({
		id: 'high',
		label: 'HIGH',
		maxPixelRatio: 2.0,
		shadowMapSize: 2048,
		shadowType: THREE.PCFSoftShadowMap,
		enableEnvMap: true,
		envIntensity: 0.68,
		enableBumpMaps: true,
		enableBloom: true,
		bloomThreshold: 1.08,
		bloomStrength: 0.24,
		bloomRadius: 0.58,
		enableExtraLights: true,
		particleScale: 1.0
	}),
	medium: Object.freeze({
		id: 'medium',
		label: 'MEDIUM',
		maxPixelRatio: 1.5,
		shadowMapSize: 1024,
		shadowType: THREE.PCFSoftShadowMap,
		enableEnvMap: true,
		envIntensity: 0.52,
		enableBumpMaps: true,
		enableBloom: false,
		bloomThreshold: 0.95,
		bloomStrength: 0.2,
		bloomRadius: 0.3,
		enableExtraLights: true,
		particleScale: 0.75
	}),
	low: Object.freeze({
		id: 'low',
		label: 'LOW',
		maxPixelRatio: 1.0,
		shadowMapSize: 1024,
		shadowType: THREE.PCFShadowMap,
		enableEnvMap: false,
		envIntensity: 0.35,
		enableBumpMaps: false,
		enableBloom: false,
		bloomThreshold: 1.0,
		bloomStrength: 0.0,
		bloomRadius: 0.0,
		enableExtraLights: false,
		particleScale: 0.45
	})
});

const QUALITY_CYCLE_ORDER = ['auto', 'high', 'medium', 'low'];

/**
 * WebGL コンテキスト・デバイス情報から初期品質ティアを推定する
 * @param {THREE.WebGLRenderer} [renderer]
 * @returns {'high'|'medium'|'low'}
 */
export function detectInitialQualityTier(renderer) {
	try {
		const nav = typeof navigator !== 'undefined' ? navigator : {};
		if (typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 2) {
			return 'low';
		}
		if (typeof nav.hardwareConcurrency === 'number' && nav.hardwareConcurrency <= 2) {
			return 'low';
		}

		const gl = renderer?.getContext?.();
		if (gl) {
			const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
			if (debugInfo) {
				const rawRenderer = String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || '');
				if (/swiftshader|llvmpipe|software|microsoft basic render/i.test(rawRenderer)) {
					return 'low';
				}
				if (/intel.*(hd|uhd)\s*(4|5|6)\d{2}|mali-4|adreno\s*[234]/i.test(rawRenderer)) {
					return 'medium';
				}
			}
			const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
			if (typeof maxTex === 'number' && maxTex < 4096) {
				return 'medium';
			}
		}
	} catch {
		// 環境情報取得に失敗した場合は標準以上の構成を仮定し、実測FPSで調整する
	}
	return 'high';
}

/**
 * 工業設備・建設現場の金属質感（滑らかなハイライト＆暖寒対比）を引き出すプロシージャル環境マップを生成する
 * 四角い平面パネル反射や白飛びパッチを防ぐため、連続頂点カラー球面ドームを PMREMGenerator でベイクする。
 * @param {THREE.WebGLRenderer} renderer
 * @returns {THREE.WebGLRenderTarget}
 */
export function createIndustrialEnvTarget(renderer) {
	const pmrem = new THREE.PMREMGenerator(renderer);
	pmrem.compileEquirectangularShader();

	const envScene = new THREE.Scene();
	envScene.background = new THREE.Color(0x0b1220);

	// 連続的な全天球グラデーション（上空クールブルー ↔ 地平スチール ↔ 下層アンバーバウンス）
	const domeGeo = new THREE.SphereGeometry(30, 36, 24);
	const posAttr = domeGeo.attributes.position;
	const colors = new Float32Array(posAttr.count * 3);

	const skyTop = new THREE.Color(0x7aa9dc);
	const horizonCool = new THREE.Color(0x1f3554);
	const warmBounce = new THREE.Color(0x9a4d24);
	const deepGround = new THREE.Color(0x1a1210);
	const sideCyan = new THREE.Color(0x4b8ec4);
	const sideAmber = new THREE.Color(0xb8682c);
	const tmp = new THREE.Color();

	for (let i = 0; i < posAttr.count; i += 1) {
		const vx = posAttr.getX(i);
		const vy = posAttr.getY(i);
		const vz = posAttr.getZ(i);
		const len = Math.hypot(vx, vy, vz) || 1;
		const nx = vx / len;
		const ny = vy / len;
		const nz = vz / len;

		if (ny >= 0) {
			const upT = Math.pow(ny, 0.72);
			tmp.copy(horizonCool).lerp(skyTop, upT);
		} else {
			const downT = Math.pow(-ny, 0.75);
			tmp.copy(horizonCool).lerp(warmBounce, downT * 0.7).lerp(deepGround, Math.max(0, downT - 0.35));
		}

		// 左右・前後に滑らかな暖寒リム方向性をブレンド（エッジのないコサイン分布）
		const leftWeight = Math.pow(Math.max(0, -nx * 0.7 + ny * 0.4 + nz * 0.2), 2.0) * 0.38;
		const rightWarmWeight = Math.pow(Math.max(0, nx * 0.75 + nz * 0.45 - ny * 0.1), 2.0) * 0.42;
		tmp.lerp(sideCyan, leftWeight);
		tmp.lerp(sideAmber, rightWarmWeight);

		colors[i * 3] = tmp.r;
		colors[i * 3 + 1] = tmp.g;
		colors[i * 3 + 2] = tmp.b;
	}
	domeGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

	const domeMat = new THREE.MeshBasicMaterial({
		vertexColors: true,
		side: THREE.BackSide
	});
	const dome = new THREE.Mesh(domeGeo, domeMat);
	envScene.add(dome);

	const target = pmrem.fromScene(envScene, 0.14);

	domeGeo.dispose();
	domeMat.dispose();
	pmrem.dispose();
	return target;
}

/**
 * 実行環境の GPU 性能と実測フレーム時間に応じて品質ティアを自動制御するマネージャ
 */
export class QualityManager {
	/**
	 * @param {THREE.WebGLRenderer} renderer
	 * @param {(profile: object, reason: string) => void} [onProfileChange]
	 */
	constructor(renderer, onProfileChange = null) {
		this._renderer = renderer;
		this._onProfileChange = onProfileChange;
		this._mode = 'auto';
		this._detectedTier = detectInitialQualityTier(renderer);
		this._activeTier = this._detectedTier;
		this._envTarget = null;

		// オート降格監視用カウンタ（連続2ウィンドウで38fps未満なら1段階降格）
		this._frameCount = 0;
		this._accumTime = 0;
		this._lowFpsStreak = 0;
	}

	get mode() {
		return this._mode;
	}

	get activeTier() {
		return this._activeTier;
	}

	getProfile() {
		return QUALITY_PRESETS[this._activeTier] || QUALITY_PRESETS.high;
	}

	getDisplayLabel() {
		const tierLabel = this.getProfile().label;
		return this._mode === 'auto' ? `GFX: AUTO (${tierLabel})` : `GFX: ${tierLabel}`;
	}

	/**
	 * 現在の品質設定に必要なプロシージャル環境マップを取得（必要時のみ生成）
	 */
	getEnvironmentTexture() {
		if (!this.getProfile().enableEnvMap || !this._renderer) {
			return null;
		}
		if (!this._envTarget) {
			this._envTarget = createIndustrialEnvTarget(this._renderer);
		}
		return this._envTarget.texture;
	}

	/**
	 * 品質モードを順番に切り替える（auto -> high -> medium -> low）
	 */
	cycleMode() {
		const idx = QUALITY_CYCLE_ORDER.indexOf(this._mode);
		const nextMode = QUALITY_CYCLE_ORDER[(idx + 1) % QUALITY_CYCLE_ORDER.length];
		this.setMode(nextMode);
		return this._mode;
	}

	/**
	 * @param {'auto'|'high'|'medium'|'low'} mode
	 */
	setMode(mode) {
		this._mode = QUALITY_CYCLE_ORDER.includes(mode) ? mode : 'auto';
		this._frameCount = 0;
		this._accumTime = 0;
		this._lowFpsStreak = 0;

		const nextTier = this._mode === 'auto' ? this._detectedTier : this._mode;
		if (nextTier !== this._activeTier) {
			this._activeTier = nextTier;
			this._onProfileChange?.(this.getProfile(), 'manual');
		} else {
			this._onProfileChange?.(this.getProfile(), 'mode');
		}
	}

	/**
	 * 毎フレームの描画時間を監視し、'auto' 時に低フレームレートが続けば安全に品質を降格する
	 * @param {number} dt
	 */
	recordFrame(dt) {
		if (this._mode !== 'auto' || this._activeTier === 'low') {
			return;
		}
		if (dt <= 0 || dt >= 0.049) {
			return;
		}
		this._frameCount += 1;
		this._accumTime += dt;

		if (this._frameCount >= 90) {
			const avgFps = this._frameCount / Math.max(this._accumTime, 0.001);
			this._frameCount = 0;
			this._accumTime = 0;

			if (avgFps < 38) {
				this._lowFpsStreak += 1;
				if (this._lowFpsStreak >= 2) {
					this._lowFpsStreak = 0;
					this._activeTier = this._activeTier === 'high' ? 'medium' : 'low';
					this._onProfileChange?.(this.getProfile(), 'auto-downgrade');
				}
			} else {
				this._lowFpsStreak = 0;
			}
		}
	}

	dispose() {
		if (this._envTarget) {
			this._envTarget.dispose();
			this._envTarget = null;
		}
	}
}
