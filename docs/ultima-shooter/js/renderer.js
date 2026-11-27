/**
 * @fileoverview renderer.js
 * レンダリング管理クラス。Three.js のシーン、カメラ、ライト、WebGLレンダラーの設定と、
 * リサイズ時の画面調整、ポストプロセッシング（Bloom, FXAA, ダメージフラッシュ, 歪み等）を担当する。
 */

/**
 * FXAA（Fast Approximate Anti-Aliasing）シェーダー
 * EffectComposer使用時のジャギーを防止
 */
const FXAAShader = {
    uniforms: {
        'tDiffuse': { value: null },
        'resolution': { value: new THREE.Vector2(1 / 1024, 1 / 512) }
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform vec2 resolution;
        varying vec2 vUv;
        void main() {
            vec2 r = resolution;
            vec4 color = texture2D(tDiffuse, vUv);
            vec4 colNW = texture2D(tDiffuse, vUv + vec2(-r.x, -r.y));
            vec4 colNE = texture2D(tDiffuse, vUv + vec2(r.x, -r.y));
            vec4 colSW = texture2D(tDiffuse, vUv + vec2(-r.x, r.y));
            vec4 colSE = texture2D(tDiffuse, vUv + vec2(r.x, r.y));
            vec3 luma = vec3(0.299, 0.587, 0.114);
            float lumaNW = dot(colNW.rgb, luma);
            float lumaNE = dot(colNE.rgb, luma);
            float lumaSW = dot(colSW.rgb, luma);
            float lumaSE = dot(colSE.rgb, luma);
            float lumaM  = dot(color.rgb, luma);
            float lumaMin = min(lumaM, min(min(lumaNW, lumaNE), min(lumaSW, lumaSE)));
            float lumaMax = max(lumaM, max(max(lumaNW, lumaNE), max(lumaSW, lumaSE)));
            vec2 dir = vec2(-((lumaNW + lumaNE) - (lumaSW + lumaSE)), ((lumaNW + lumaSW) - (lumaNE + lumaSE)));
            float dirReduce = max((lumaNW + lumaNE + lumaSW + lumaSE) * (0.25 * 0.0625), 0.0078125);
            float rcpDirMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirReduce);
            dir = min(vec2(8.0), max(vec2(-8.0), dir * rcpDirMin)) * resolution;
            vec3 rgbA = 0.5 * (
                texture2D(tDiffuse, vUv + dir * (1.0 / 3.0 - 0.5)).rgb +
                texture2D(tDiffuse, vUv + dir * (2.0 / 3.0 - 0.5)).rgb);
            vec3 rgbB = rgbA * 0.5 + 0.25 * (
                texture2D(tDiffuse, vUv + dir * -0.5).rgb +
                texture2D(tDiffuse, vUv + dir * 0.5).rgb);
            float lumaB = dot(rgbB, luma);
            if ((lumaB < lumaMin) || (lumaB > lumaMax)) {
                gl_FragColor = vec4(rgbA, color.a);
            } else {
                gl_FragColor = vec4(rgbB, color.a);
            }
        }
    `
};

/**
 * 画面エフェクト（ダメージフラッシュ、色収差、歪み）シェーダー
 */
const ScreenEffectsShader = {
    uniforms: {
        'tDiffuse': { value: null },
        'uTime': { value: 0.0 },
        'uDamageFlash': { value: 0.0 },
        'uChromaticAberration': { value: 0.0 },
        'uDistortion': { value: 0.0 }
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float uTime;
        uniform float uDamageFlash;
        uniform float uChromaticAberration;
        uniform float uDistortion;
        varying vec2 vUv;

        void main() {
            vec2 uv = vUv;
            
            // 空間歪み効果（画面中心からの波紋・ワープ）
            if (uDistortion > 0.001) {
                vec2 center = uv - 0.5;
                float dist = length(center);
                float wave = sin(dist * 25.0 - uTime * 8.0) * 0.012 * uDistortion;
                uv += center * wave;
            }

            // 色収差 (RGB Split)
            vec4 col;
            if (uChromaticAberration > 0.001) {
                float shift = uChromaticAberration * 0.015;
                float r = texture2D(tDiffuse, uv + vec2(shift, 0.0)).r;
                float g = texture2D(tDiffuse, uv).g;
                float b = texture2D(tDiffuse, uv - vec2(shift, 0.0)).b;
                float a = texture2D(tDiffuse, uv).a;
                col = vec4(r, g, b, a);
            } else {
                col = texture2D(tDiffuse, uv);
            }

            // 被弾ダメージフラッシュ（画面周囲の赤いヴィネット + 全体明光）
            if (uDamageFlash > 0.001) {
                vec2 distVec = (vUv - 0.5) * 2.0;
                float vignette = dot(distVec, distVec) * 0.6;
                vec3 flashColor = vec3(1.0, 0.08, 0.03);
                float flashFactor = uDamageFlash * (0.35 + vignette * 0.65);
                col.rgb = mix(col.rgb, flashColor, flashFactor * 0.75);
                col.rgb += flashColor * (uDamageFlash * 0.25);
            }

            gl_FragColor = col;
        }
    `
};

/**
 * レンダリング管理クラス
 * Three.jsのシーン、カメラ、レンダラー、ライト、ウィンドウリサイズなどを担当する。
 */
class Renderer {
    /**
     * @param {HTMLElement} container - レンダラーを追加する親要素
     */
    constructor(container) {
        this.container = container;
        
        /** @type {THREE.Scene} */
        this.scene = null;
        /** @type {THREE.PerspectiveCamera} */
        this.camera = null;
        /** @type {THREE.WebGLRenderer} */
        this.webGLRenderer = null;
        
		/** @type {THREE.AmbientLight} */
		this.ambientLight = null;
		/** @type {THREE.DirectionalLight} */
		this.dirLight = null;
		/** @type {THREE.DirectionalLight} */
		this.rimLight = null;
		/** @type {{texture: THREE.Texture, dispose: Function}|null} */
		this.envMapResource = null;

		/** @type {THREE.UnrealBloomPass} */
		this.bloomPass = null;
		/** @type {THREE.ShaderPass} */
		this.screenEffectsPass = null;
		/** @type {THREE.ShaderPass} */
		this.fxaaPass = null;

		// 動的画質調整（Adaptive Quality）パラメータ
		this.qualityLevel = 'HIGH'; // 'HIGH' | 'MEDIUM' | 'LOW'
		this.avgFrameMs = 16.67;
		this.lowFpsDuration = 0.0;
		this.highFpsDuration = 0.0;
		this.qualitySwitchCooldown = 0.0;

        // エフェクトパラメータ
        this.baseBloomStrength = 1.5;
        this.bloomBoostTimer = 0.0;
        this.bloomBoostDuration = 0.0;
        this.bloomBoostAmount = 0.0;

        this.damageFlashTimer = 0.0;
        this.damageFlashDuration = 0.0;

        this.chromaticAberrationTarget = 0.0;
        this.chromaticAberrationCurrent = 0.0;

        this.distortionTarget = 0.0;
        this.distortionCurrent = 0.0;

		this.elapsedTime = 0.0;

		// レスポンシブFOV設定（狭幅・縦長画面で水平視界が狭まりすぎないよう自動拡張）
		this.baseFov = 72;
		this.minReferenceAspect = 1.5;
		this.maxFov = 105;

		this.init();
    }

	/**
	 * 初期化処理
	 */
	init() {
		this.initScene();
		this.initCamera();
		this.initWebGLRenderer();
		this.initEnvironment();
		this.initPostProcessing();

		// --- 2. シーン構築 ---
		this.initLights();
		this.setupResizeHandler();
	}

	/**
	 * プロシージャル環境マップ（IBL）を初期化し、PBRマテリアルの金属反射を有効化する
	 */
	initEnvironment() {
		if (typeof MaterialLibrary === 'undefined' || !this.webGLRenderer || !this.scene) return;
		this.envMapResource = MaterialLibrary.createEnvironmentMap(this.webGLRenderer);
		if (this.envMapResource && this.envMapResource.texture) {
			this.scene.environment = this.envMapResource.texture;
		}
	}

    /**
     * シーン初期化 (フォグの追加による遠近感向上)
     */
    initScene() {
        this.scene = new THREE.Scene();
        
        // 宇宙をイメージした暗い背景
        const bgColor = 0x050510;
        this.scene.background = new THREE.Color(bgColor);
        
        // 指向性の高い FogExp2 を追加（密度: 0.015）
        this.scene.fog = new THREE.FogExp2(bgColor, 0.015);
    }

	/**
	 * カメラ初期化 (視野角 FOV: 72 基準、縦長画面では水平視界を保つよう自動補正)
	 */
	initCamera() {
		const width = Math.max(1, this.container.clientWidth);
		const height = Math.max(1, this.container.clientHeight);

		this.camera = new THREE.PerspectiveCamera(this.baseFov, width / height, 0.1, 1000);
		this.updateCameraProjection(width, height);

		// 初期位置
		this.camera.position.set(0, 7.5, 13.0);
		this.camera.lookAt(0, 0.5, -12.0);
	}

	/**
	 * ビューポートサイズに応じてアスペクト比と垂直FOVを更新する
	 * @param {number} width
	 * @param {number} height
	 */
	updateCameraProjection(width, height) {
		if (!this.camera || width <= 0 || height <= 0) return;

		const aspect = width / height;
		this.camera.aspect = aspect;

		// 基準アスペクト比より縦長の場合は水平視野角を維持するように垂直FOVを拡張する
		let fov = this.baseFov;
		if (aspect < this.minReferenceAspect) {
			const baseVRad = THREE.MathUtils.degToRad(this.baseFov);
			const expandedVRad = 2 * Math.atan(Math.tan(baseVRad / 2) * (this.minReferenceAspect / aspect));
			fov = Math.min(this.maxFov, THREE.MathUtils.radToDeg(expandedVRad));
		}

		this.camera.fov = fov;
		this.camera.updateProjectionMatrix();
	}

    /**
     * WebGLレンダラー初期化
     */
    initWebGLRenderer() {
        this.webGLRenderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
        this.webGLRenderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.webGLRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        
        // シャドウマップの有効化
        this.webGLRenderer.shadowMap.enabled = true;
        this.webGLRenderer.shadowMap.type = THREE.PCFSoftShadowMap; // ソフトシャドウ
        
        // コンテナに追加
        this.container.appendChild(this.webGLRenderer.domElement);
    }
    
    /**
     * ポストプロセッシング（Bloom, ScreenEffects, FXAA）の初期化
     */
    initPostProcessing() {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        
        // HDR対応のためにFloat型のレンダーターゲットを使用
        const renderTarget = new THREE.WebGLRenderTarget(width, height, {
            type: THREE.HalfFloatType,
            format: THREE.RGBAFormat,
        });
        
        this.composer = new THREE.EffectComposer(this.webGLRenderer, renderTarget);
        
        // 1. 通常のシーン描画パス
        const renderPass = new THREE.RenderPass(this.scene, this.camera);
        this.composer.addPass(renderPass);
        
        // 2. Bloomパス（発光効果）
        // UnrealBloomPass( resolution, strength, radius, threshold )
        this.bloomPass = new THREE.UnrealBloomPass(new THREE.Vector2(width, height), this.baseBloomStrength, 0.4, 2.0);
        this.composer.addPass(this.bloomPass);

        // 3. スクリーン画面演出パス (ダメージフラッシュ、色収差、空間歪み)
        this.screenEffectsPass = new THREE.ShaderPass(ScreenEffectsShader);
        this.composer.addPass(this.screenEffectsPass);

		// 4. FXAAパス (アンチエイリアス)
		const dpr = this.webGLRenderer.getPixelRatio();
		this.fxaaPass = new THREE.ShaderPass(FXAAShader);
		this.fxaaPass.uniforms['resolution'].value.set(1 / (width * dpr), 1 / (height * dpr));
		this.composer.addPass(this.fxaaPass);
    }

    /**
     * ライト（環境光、平行光源）の初期化
     */
    initLights() {
        // PBRマテリアルが周囲の空間（宇宙）を反射しているように見せるための半球ライト
        this.hemiLight = new THREE.HemisphereLight(0x777799, 0x111122, 0.8);
        this.scene.add(this.hemiLight);

        // 全体を均等に照らす環境光（少し弱め）
        this.ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
        this.scene.add(this.ambientLight);

        // 太陽や遠くの恒星からの強い光
        this.dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
        this.dirLight.position.set(15, 45, 10);
        
        // 影のキャストを有効化
        this.dirLight.castShadow = true;
        this.dirLight.shadow.mapSize.width = 2048;
        this.dirLight.shadow.mapSize.height = 2048;
        
        // 影カメラの範囲設定
        this.dirLight.shadow.camera.left = -60;
        this.dirLight.shadow.camera.right = 60;
        this.dirLight.shadow.camera.top = 140;
        this.dirLight.shadow.camera.bottom = -140;
        this.dirLight.shadow.camera.near = 0.5;
        this.dirLight.shadow.camera.far = 130;
        this.dirLight.shadow.bias = -0.0006;

		this.scene.add(this.dirLight);

		// 輪郭・ハードエッジを際立たせるクールブルー系リムライト（影なしで軽量）
		this.rimLight = new THREE.DirectionalLight(0x88ccff, 0.75);
		this.rimLight.position.set(-22, 18, -28);
		this.scene.add(this.rimLight);
	}

	/**
	 * ウィンドウリサイズ・画面回転対応
	 */
	setupResizeHandler() {
		this._onResize = () => this.handleResize();
		window.addEventListener('resize', this._onResize);
		window.addEventListener('orientationchange', () => {
			// モバイルブラウザの回転直後はクライアント寸法の確定が少し遅れるため遅延再計算を行う
			setTimeout(() => this.handleResize(), 120);
		});
	}

	/**
	 * 現在の画質レベルに応じたピクセル比上限を返す
	 * @returns {number}
	 */
	_getTargetPixelRatio() {
		const rawDpr = window.devicePixelRatio || 1;
		if (this.qualityLevel === 'LOW') return 1.0;
		if (this.qualityLevel === 'MEDIUM') return Math.min(rawDpr, 1.25);
		return Math.min(rawDpr, 2.0);
	}

	/**
	 * 動的画質レベルを適用する
	 * @param {'HIGH'|'MEDIUM'|'LOW'} level
	 */
	setQualityLevel(level) {
		if (this.qualityLevel === level) return;
		this.qualityLevel = level;
		this.qualitySwitchCooldown = 3.0;

		if (this.webGLRenderer) {
			this.webGLRenderer.shadowMap.enabled = (level !== 'LOW');
		}
		if (this.fxaaPass) {
			this.fxaaPass.enabled = (level !== 'LOW');
		}
		this.handleResize();
	}

	/**
	 * フレーム時間の移動平均から端末負荷を判定し、画質を段階的に自動調整する
	 * @param {number} deltaTime
	 */
	_updateAdaptiveQuality(deltaTime) {
		// タブ復帰や初回ロード直後の極端なスパイクは除外
		if (deltaTime <= 0 || deltaTime >= 0.095) return;

		const frameMs = deltaTime * 1000.0;
		this.avgFrameMs = this.avgFrameMs * 0.92 + frameMs * 0.08;

		if (this.qualitySwitchCooldown > 0) {
			this.qualitySwitchCooldown -= deltaTime;
			return;
		}

		// 負荷過多（約42fps未満が2.5秒継続）で1段階ダウン
		if (this.avgFrameMs > 24.0) {
			this.lowFpsDuration += deltaTime;
			this.highFpsDuration = 0.0;
			if (this.lowFpsDuration >= 2.5) {
				this.lowFpsDuration = 0.0;
				if (this.qualityLevel === 'HIGH') this.setQualityLevel('MEDIUM');
				else if (this.qualityLevel === 'MEDIUM') this.setQualityLevel('LOW');
			}
		} else if (this.avgFrameMs < 17.8 && this.qualityLevel !== 'HIGH') {
			// 十分な余裕（約56fps以上が6秒継続）で1段階復帰
			this.highFpsDuration += deltaTime;
			this.lowFpsDuration = 0.0;
			if (this.highFpsDuration >= 6.0) {
				this.highFpsDuration = 0.0;
				if (this.qualityLevel === 'LOW') this.setQualityLevel('MEDIUM');
				else if (this.qualityLevel === 'MEDIUM') this.setQualityLevel('HIGH');
			}
		} else {
			this.lowFpsDuration = Math.max(0.0, this.lowFpsDuration - deltaTime * 0.5);
			this.highFpsDuration = Math.max(0.0, this.highFpsDuration - deltaTime * 0.5);
		}
	}

	/**
	 * 現在のコンテナサイズに合わせてカメラ・レンダラー・ポストプロセスを再調整する
	 */
	handleResize() {
		if (!this.container || !this.webGLRenderer || !this.camera) return;

		const width = this.container.clientWidth;
		const height = this.container.clientHeight;
		if (width <= 0 || height <= 0) return;

		const dpr = this._getTargetPixelRatio();

		// カメラのアスペクト比・レスポンシブFOV更新
		this.updateCameraProjection(width, height);

		// レンダラーとポストプロセスの解像度更新
		this.webGLRenderer.setPixelRatio(dpr);
		this.webGLRenderer.setSize(width, height);

		if (this.composer) {
			if (typeof this.composer.setPixelRatio === 'function') {
				this.composer.setPixelRatio(dpr);
			}
			this.composer.setSize(width, height);
		}
		if (this.bloomPass && typeof this.bloomPass.setSize === 'function') {
			this.bloomPass.setSize(width, height);
		}
		if (this.fxaaPass) {
			this.fxaaPass.uniforms['resolution'].value.set(1 / (width * dpr), 1 / (height * dpr));
		}
	}

    /**
     * 被弾ダメージフラッシュの発動
     * @param {number} duration - 持続時間（秒）
     */
    triggerDamageFlash(duration = 0.35) {
        this.damageFlashDuration = duration;
        this.damageFlashTimer = duration;
    }

    /**
     * 一時的なBloom強度アップ（大爆発やハイパーモード用）
     * @param {number} boostAmount - 加算するBloom強度
     * @param {number} duration - 持続時間（秒）
     */
    triggerBloomBoost(boostAmount = 1.5, duration = 0.5) {
        this.bloomBoostAmount = boostAmount;
        this.bloomBoostDuration = duration;
        this.bloomBoostTimer = duration;
    }

    /**
     * 色収差の目標強度の設定
     * @param {number} targetAmount - 色収差強度 (0.0 〜 1.0)
     */
    setChromaticAberration(targetAmount) {
        this.chromaticAberrationTarget = targetAmount;
    }

    /**
     * 空間歪みの目標強度の設定
     * @param {number} targetAmount - 歪み強度 (0.0 〜 1.0)
     */
    setDistortion(targetAmount) {
        this.distortionTarget = targetAmount;
    }

    /**
     * ポストプロセスパラメータの更新
     * @param {number} deltaTime
     */
    updatePostProcessing(deltaTime) {
        this.elapsedTime += deltaTime;

        // 1. Bloom Boost
        let currentBloomStrength = this.baseBloomStrength;
        if (this.bloomBoostTimer > 0) {
            this.bloomBoostTimer -= deltaTime;
            const ratio = Math.max(0, this.bloomBoostTimer / this.bloomBoostDuration);
            currentBloomStrength += this.bloomBoostAmount * ratio;
        }
        if (this.bloomPass) {
            this.bloomPass.strength = currentBloomStrength;
        }

        // 2. Damage Flash
        let damageFlashVal = 0.0;
        if (this.damageFlashTimer > 0) {
            this.damageFlashTimer -= deltaTime;
            damageFlashVal = Math.max(0, this.damageFlashTimer / this.damageFlashDuration);
        }

        // 3. Chromatic Aberration & Distortion (Smooth transition)
        this.chromaticAberrationCurrent += (this.chromaticAberrationTarget - this.chromaticAberrationCurrent) * Math.min(1.0, deltaTime * 8.0);
        this.distortionCurrent += (this.distortionTarget - this.distortionCurrent) * Math.min(1.0, deltaTime * 8.0);

        // 4. Update Shader Pass Uniforms
        if (this.screenEffectsPass && this.screenEffectsPass.uniforms) {
            const u = this.screenEffectsPass.uniforms;
            if (u.uTime) u.uTime.value = this.elapsedTime;
            if (u.uDamageFlash) u.uDamageFlash.value = damageFlashVal;
            if (u.uChromaticAberration) u.uChromaticAberration.value = this.chromaticAberrationCurrent;
            if (u.uDistortion) u.uDistortion.value = this.distortionCurrent;
        }
    }

	/**
	 * 描画の実行
	 * @param {number} [deltaTime=0.016]
	 */
	render(deltaTime = 0.016) {
		this._updateAdaptiveQuality(deltaTime);
		this.updatePostProcessing(deltaTime);

		if (this.webGLRenderer && this.scene && this.camera) {
			if (this.composer) {
				this.composer.render();
			} else {
				this.webGLRenderer.render(this.scene, this.camera);
			}
		}
	}

    /**
     * ステージのテーマに合わせてビジュアルを動的に更新する
     * @param {Object} theme - ステージのテーマ設定
     */
    updateTheme(theme) {
        if (!theme) return;
        
        const bgColor = new THREE.Color(theme.fogColor);
        this.scene.background = bgColor;
        
        if (this.scene.fog) {
            this.scene.fog.color = bgColor;
            this.scene.fog.density = theme.fogDensity;
        }
        
        if (this.ambientLight) {
            this.ambientLight.color.setHex(theme.ambientColor);
            this.ambientLight.intensity = theme.ambientIntensity;
        }
    }

    /**
     * シャドウ用ディレクショナルライトをプレイヤーのZ座標に追従させる。
     * @param {number} playerZ - プレイヤーの現在Z座標
     */
    followPlayerZ(playerZ) {
        if (!this.dirLight) return;
        this.dirLight.position.z = playerZ + 10;
        this.dirLight.target.position.z = playerZ;
        this.dirLight.target.updateMatrixWorld();
    }
}


