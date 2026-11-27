/**
 * @fileoverview player.js
 * プレイヤークラス。機体の生成、入力に基づく移動（慣性・傾き）、
 * 攻撃（弾の生成）、被弾・無敵処理、パーティクル・軌跡エフェクトの管理を行う。
 */

// GC対策用の一時変数群
const _playerTempVec1 = new THREE.Vector3();
const _playerTempVec2 = new THREE.Vector3();
const _playerTempVec3 = new THREE.Vector3();
const _playerTempVec4 = new THREE.Vector3();
const _playerDirStraight = new THREE.Vector3(0, 0, -1);
const _playerDirSpreadL = new THREE.Vector3(-0.2, 0.0, -0.98).normalize();
const _playerDirSpreadR = new THREE.Vector3(0.2, 0.0, -0.98).normalize();

const PlayerState = {
    ALIVE: 'ALIVE',
    DYING: 'DYING',
    DESTROYED: 'DESTROYED'
};

class Player {
    /**
     * @param {Game} game - ゲームメインクラスへの参照
     */
    constructor(game) {
        /** @type {Game} */
        this.game = game;
        
        /** @type {THREE.Group} 複数のパーツをまとめるグループ */
        this.mesh = null;
        
        // メインマテリアルの一時発光演出用
        /** @type {THREE.MeshPhongMaterial|null} */
        this.mainMat = null;
        /** @type {number} 发光残り時間 */
        this.flashTimer = 0.0;
        
        // アニメーション用：ツインブースターのメッシュ
        /** @type {THREE.Mesh|null} */
        this.leftJet = null;
        /** @type {THREE.Mesh|null} */
        this.rightJet = null;
        
        // ステータス（GameConfigから取得）
        /** @type {number} */
        this.maxLife = GameConfig.player.maxLife;
        /** @type {number} */
        this.life = this.maxLife;
        
        // ショットパワーアップ段階 (1〜3)
        /** @type {number} */
        this.powerLevel = 1;
        /** @type {number} */
        this.maxPowerLevel = GameConfig.player.maxPowerLevel;
        
        // 弾数管理
        /** @type {number} */
        this.ammo = GameConfig.player.initialAmmo;
        /** @type {number} */
        this.maxAmmo = GameConfig.player.maxAmmo;
        /** @type {boolean} 前フレームで発射ボタンが押されていたか */
        this.wasFirePressed = false;
        
        /** @type {boolean} 無敵状態か */
        this.isInvincible = false;
        /** @type {boolean} アイテムによるバリア展開中か */
        this.hasBarrier = false;
        /** @type {number} 残り無敵時間（秒） */
        this.invincibleTimer = 0.0;
        /** @type {number} 無敵持続時間 */
        this.invincibleDuration = GameConfig.player.invincibleDuration;
        
        // ショット関連設定
        /** @type {number} 連射間隔（秒） */
        this.fireCooldown = GameConfig.player.fireCooldown;
        /** @type {number} 発射後クールダウン残り時間 */
        this.fireTimer = 0.0;
        
        // 壁衝突の跳ね返り（バウンド）用パラメータ
        /** @type {number} 壁に衝突して弾かれている残り時間 */
        this.bounceTimer = 0.0;
        /** @type {THREE.Vector3} 弾かれる移動方向ベクトル */
        this.bounceVector = new THREE.Vector3();
        
        /** @type {PlayerState} 自機の状態 */
        this.state = PlayerState.ALIVE;
        /** @type {number} 墜落演出タイマー */
        this.dyingTimer = 0.0;
        /** @type {number} 墜落中の小爆発タイマー */
        this.dyingExplosionTimer = 0.0;
        /** @type {boolean} パーツがバラバラに砕け散る物理シミュレーション中か */
        this.partsDisintegrated = false;
        
		/** @type {THREE.Vector3} 現在のフレームでの自機の移動速度ベクトル（ワールド座標系） */
		this.velocity = new THREE.Vector3();

		/** @type {boolean} 一人称コックピット視点中か */
		this.isCockpitMode = false;

		this.init();
    }

	/**
	 * 近代ステルス戦闘機の3Dモデル初期化（PlayerModelBuilder に委譲）
	 */
	init() {
		const built = PlayerModelBuilder.build();
		this.mesh = built.mesh;
		this.mainMat = built.mainMat;
		this.bodyMats = built.bodyMats;
		this.leftJet = built.leftJet;
		this.rightJet = built.rightJet;

		// 初期位置
		this.mesh.position.set(0, 1.0, 0);

		// バリアエフェクト用のメッシュ（次世代 SF ハニカム・エネルギーシールド + ジャイロリング + プロジェクタードローン）
		this.barrierGroup = new THREE.Group();
		this.barrierGroup.visible = false;

		// 1. 高精細トライプラナー六角形（ハニカム）エネルギーシールド球体
		// 正確なビュー空間フレネル反射 + 前方→後方へ流れるスキャンパルス + 終了警告色シフト
		const shieldGeo = new THREE.SphereGeometry(2.55, 36, 28);
		this.barrierShieldMat = new THREE.ShaderMaterial({
			uniforms: {
				uTime: { value: 0.0 },
				uColor: { value: new THREE.Color(0x00d8ff) },
				uAccentColor: { value: new THREE.Color(0x88f8ff) },
				uWarnColor: { value: new THREE.Color(0xff4422) },
				uWarning: { value: 0.0 },
				uOpacity: { value: 0.0 }
			},
			vertexShader: `
				varying vec3 vViewNormal;
				varying vec3 vViewPos;
				varying vec3 vLocalPos;
				varying vec3 vLocalNormal;
				void main() {
					vLocalPos = position;
					vLocalNormal = normalize(normal);
					vViewNormal = normalize(normalMatrix * normal);
					vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
					vViewPos = -mvPos.xyz;
					gl_Position = projectionMatrix * mvPos;
				}
			`,
			fragmentShader: `
				uniform float uTime;
				uniform vec3 uColor;
				uniform vec3 uAccentColor;
				uniform vec3 uWarnColor;
				uniform float uWarning;
				uniform float uOpacity;
				varying vec3 vViewNormal;
				varying vec3 vViewPos;
				varying vec3 vLocalPos;
				varying vec3 vLocalNormal;

				// 2D 六角形グリッド距離場（戻り値: x=エッジからの距離, y=セルIDハッシュ）
				vec2 hexGrid(vec2 p) {
					const vec2 s = vec2(1.0, 1.7320508);
					vec4 hC = floor(vec4(p, p - vec2(0.5, 1.0)) / s.xyxy) + 0.5;
					vec4 h = vec4(p - hC.xy * s, p - (hC.zw + 0.5) * s);
					vec4 res = dot(h.xy, h.xy) < dot(h.zw, h.zw) ? vec4(h.xy, hC.xy) : vec4(h.zw, hC.zw + 0.5);
					vec2 q = abs(res.xy);
					float edgeDist = 0.5 - max(dot(q, s * 0.5), q.x);
					float cellHash = fract(sin(dot(res.zw, vec2(127.1, 311.7))) * 43758.5453);
					return vec2(edgeDist, cellHash);
				}

				void main() {
					// 正確なビュー空間フレネル（外輪郭ほど強く光り、正面中央は澄んだ透明に）
					vec3 viewDir = normalize(vViewPos);
					float ndotv = abs(dot(normalize(vViewNormal), viewDir));
					float fresnel = pow(1.0 - ndotv, 2.6);
					float sharpRim = pow(1.0 - ndotv, 5.2);

					// トライプラナー投影による極歪みのない 3D ハニカム構造
					vec3 blend = pow(abs(vLocalNormal), vec3(4.0));
					blend /= (blend.x + blend.y + blend.z + 0.0001);

					float hexScale = 2.65;
					vec2 hXY = hexGrid(vLocalPos.xy * hexScale);
					vec2 hYZ = hexGrid(vLocalPos.yz * hexScale);
					vec2 hZX = hexGrid(vLocalPos.zx * hexScale);

					float hexEdgeDist = hXY.x * blend.z + hYZ.x * blend.x + hZX.x * blend.y;
					float cellId = hXY.y * blend.z + hYZ.y * blend.x + hZX.y * blend.y;

					// 精密なハニカム境界線
					float hexLine = 1.0 - smoothstep(0.025, 0.085, hexEdgeDist);

					// 機首(-Z)から後方(+Z)へ周期的に走るエネルギー・スキャン波
					float wavePhase = fract(vLocalPos.z * 0.22 - uTime * 0.75);
					float scanWave = smoothstep(0.18, 0.0, abs(wavePhase - 0.5));

					// セル単位の微細パルス（電子エネルギー充填感）
					float cellShimmer = 0.5 + 0.5 * sin(uTime * 3.8 + cellId * 18.0);
					float activeCell = smoothstep(0.72, 0.98, cellShimmer) * scanWave;

					// 残り時間低下時は警告カラーへシフト
					vec3 baseCol = mix(uColor, uWarnColor, uWarning);
					vec3 rimCol = mix(uAccentColor, vec3(1.0, 0.75, 0.4), uWarning);

					// 正面中央のノイズを抑え、外周とスキャン波付近のハニカムを際立たせる
					float hexVisibility = mix(0.14, 1.0, fresnel) + scanWave * 0.55;
					float pattern = hexLine * hexVisibility;

					vec3 col = baseCol * (0.35 + fresnel * 1.9 + activeCell * 0.9);
					col += rimCol * (pattern * 1.6 + sharpRim * 2.6 + scanWave * hexLine * 1.5);

					float alpha = uOpacity * (0.04 + fresnel * 0.62 + pattern * 0.42 + sharpRim * 0.55 + activeCell * 0.16);
					gl_FragColor = vec4(col * 1.75, clamp(alpha, 0.0, 0.78));
				}
			`,
			transparent: true,
			blending: THREE.AdditiveBlending,
			depthWrite: false,
			side: THREE.FrontSide
		});
		this.barrierShieldMesh = new THREE.Mesh(shieldGeo, this.barrierShieldMat);
		this.barrierGroup.add(this.barrierShieldMesh);

		// 2. 外周の極細ジャイロ・ホログラムリング（2軸交差）
		this.barrierMat = new THREE.MeshBasicMaterial({
			color: 0x33e6ff,
			transparent: true,
			opacity: 0.0,
			blending: THREE.AdditiveBlending,
			depthWrite: false
		});
		this.barrierMat.color.multiplyScalar(2.4);

		const ringGeo = new THREE.TorusGeometry(2.68, 0.018, 6, 48);
		this.barrierOrbits = [];
		const ringRotations = [
			new THREE.Euler(Math.PI / 2.3, 0.25, 0),
			new THREE.Euler(-Math.PI / 2.6, -0.35, 0)
		];

		for (let i = 0; i < ringRotations.length; i++) {
			const orbit = new THREE.Group();
			orbit.rotation.copy(ringRotations[i]);
			const ringMesh = new THREE.Mesh(ringGeo, this.barrierMat);
			orbit.add(ringMesh);
			this.barrierOrbits.push(orbit);
			this.barrierGroup.add(orbit);
		}

		// 3. 編隊公転する 3 基のミニ・シールドプロジェクタードローン
		this.barrierDroneOrbit = new THREE.Group();
		this.barrierDroneOrbit.rotation.set(0.32, 0, 0.12);
		const droneHullMat = new THREE.MeshStandardMaterial({
			color: 0x1e2834,
			metalness: 0.85,
			roughness: 0.22,
			flatShading: true,
			envMapIntensity: 1.5
		});
		const droneBodyGeo = new THREE.ConeGeometry(0.11, 0.36, 4);
		droneBodyGeo.rotateX(Math.PI / 2);
		const droneFinGeo = new THREE.BoxGeometry(0.34, 0.02, 0.14);
		const droneCoreGeo = new THREE.OctahedronGeometry(0.065, 0);

		this.barrierDrones = [];
		for (let d = 0; d < 3; d++) {
			const angle = (d / 3) * Math.PI * 2;
			const drone = new THREE.Group();
			drone.add(new THREE.Mesh(droneBodyGeo, droneHullMat));
			const fin = new THREE.Mesh(droneFinGeo, droneHullMat);
			fin.position.z = 0.06;
			drone.add(fin);
			const core = new THREE.Mesh(droneCoreGeo, this.barrierMat);
			core.position.z = -0.14;
			drone.add(core);

			drone.position.set(Math.cos(angle) * 2.68, Math.sin(angle) * 2.68, 0);
			drone.rotation.z = angle + Math.PI / 2;
			this.barrierDrones.push(drone);
			this.barrierDroneOrbit.add(drone);
		}
		this.barrierGroup.add(this.barrierDroneOrbit);

		// 点滅処理や爆散対象から確実に除外できるようマーカー付与
		this.barrierGroup.traverse((child) => {
			child.userData.isBarrierPart = true;
		});

		this.mesh.add(this.barrierGroup);

		// シーンに追加
		this.game.renderer.scene.add(this.mesh);
	}

	/**
	 * 一人称コックピット視点モードを切り替える。
	 * コックピット視点中は外装メッシュを非表示にし、バリアシェーダーを内面描画（BackSide）へ切り替える。
	 * @param {boolean} enabled
	 */
	setCockpitMode(enabled) {
		const next = !!enabled;
		if (this.isCockpitMode === next) return;
		this.isCockpitMode = next;

		if (this.mesh) {
			this.mesh.traverse((child) => {
				if (child.isMesh && !child.userData.isBarrierPart) {
					child.visible = !next;
				}
			});
		}

		if (this.barrierShieldMat) {
			this.barrierShieldMat.side = next ? THREE.BackSide : THREE.FrontSide;
			this.barrierShieldMat.needsUpdate = true;
		}
	}

    /**
     * バリアアイテム取得時の無敵時間付与
     * @param {number} duration - 無敵状態になる秒数
     */
    activateBarrier(duration) {
        if (this.state !== PlayerState.ALIVE) return;
        this.isInvincible = true;
        this.hasBarrier = true;
        this.invincibleTimer = Math.max(this.invincibleTimer, duration);
        this.barrierMaxTimer = this.invincibleTimer; // 縮小演出のために最大時間を保持
        
		// バリア取得時に、もし点滅中で消えている機体パーツがあればすべて表示状態に戻す（コックピット視点時は非表示維持）
		this.mesh.traverse((child) => {
			if (child.isMesh && !child.userData.isBarrierPart) {
				child.visible = !this.isCockpitMode;
			}
		});

		if (this.barrierGroup) {
			this.barrierGroup.scale.set(1, 1, 1);
		}
		if (this.barrierShieldMat && this.barrierShieldMat.uniforms) {
			this.barrierShieldMat.uniforms.uWarning.value = 0.0;
		}
        
        this.flash(GameConfig.items.types.BARRIER.color);
        if (window.audioManager) {
            audioManager.play('barrierGet');
        }
    }

    /**
     * デバッグコマンド等で即死させる（ゲームオーバー確認用）
     */
    dieInstantly() {
        if (this.state !== PlayerState.ALIVE) return;
        this.damage(9999, 'debug');
    }

    /**
     * 自機の状態更新
     * @param {number} deltaTime - 通常の経過時間
     * @param {number} gameDeltaTime - 早回し（背景・Z進行）用の経過時間
     */
    update(deltaTime, gameDeltaTime = deltaTime) {
        if (this.state === PlayerState.DESTROYED) return;
        
        if (this.state === PlayerState.DYING) {
            this.dyingTimer -= deltaTime;
            
            // Z座標は定速で前進（スクロールが減速しても元のスピードを維持して離れていく）
            this.mesh.position.z -= GameConfig.game.scrollSpeed * gameDeltaTime;
            
            // 墜落中の速度ベクトルを設定
            this.velocity.set(0, 0, -GameConfig.game.scrollSpeed);

            // 各パーツの飛び散り物理シミュレーション
            if (this.partsDisintegrated) {
                this.mesh.children.forEach((part) => {
                    if (part === this.leftJet || part === this.rightJet) return;
                    if (part.velocity && part.angularVelocity) {
                        // 重力を適用して徐々に落下
                        part.velocity.y -= 12.0 * deltaTime;
                        
                        // 位置の更新
                        part.position.addScaledVector(part.velocity, deltaTime);
                        
                        // 回転の更新
                        part.rotation.x += part.angularVelocity.x * deltaTime;
                        part.rotation.y += part.angularVelocity.y * deltaTime;
                        part.rotation.z += part.angularVelocity.z * deltaTime;
                    }
                });
            }
            
            // 定期的な小爆発（パーツの隙間から吹き出るような煙と火花）
            this.dyingExplosionTimer -= deltaTime;
            if (this.dyingExplosionTimer <= 0) {
                const p = this.mesh.position;
                const activeParts = this.mesh.children.filter(part => part.visible && part !== this.leftJet && part !== this.rightJet);
                if (activeParts.length > 0) {
                    const randPart = activeParts[Math.floor(Math.random() * activeParts.length)];
                    const partWorldPos = randPart.position.clone().applyMatrix4(this.mesh.matrixWorld);
                    this.game.effectManager.spawnExplosion(partWorldPos.x, partWorldPos.y, partWorldPos.z, 0xff5500, 4, false);
                } else {
                    this.game.effectManager.spawnExplosion(p.x, p.y, p.z, 0xff3300, 5, false);
                }
                this.dyingExplosionTimer = 0.10;
            }
            
            if (this.dyingTimer <= 0) {
                // 大爆発してゲームオーバー画面へ移行
                const p = this.mesh.position;
                this.game.effectManager.spawnExplosion(p.x, p.y, p.z, 0xffaa00, 32, false);
                this.state = PlayerState.DESTROYED;
                this.mesh.visible = false;
                this.game.handleGameOver();
            }
            return;
        }

        // 通常状態: 移動前の座標を記録
        const prevPos = this.mesh.position.clone();

        this.handleMovement(deltaTime, gameDeltaTime);
        this.handleShooting(deltaTime);
        this.handleInvincibility(deltaTime);
        this.animateBooster();
        this.handleFlash(deltaTime);

        // 実際の移動速度を計算（前フレームとの座標差分 / deltaTime）
        if (deltaTime > 0) {
            this.velocity.subVectors(this.mesh.position, prevPos).multiplyScalar(1.0 / deltaTime);
        } else {
            this.velocity.set(0, 0, 0);
        }
    }

    /**
     * 八角形の境界内に座標をクランプし、衝突情報（プッシュバックベクトルなど）を返す
     */
    _clampToOctagon(px, py, cx, cy, a, b_h, margin, z = 0) {
        let newPx = px;
        let newPy = py;
        let wallHit = false;
        let pushX = 0;
        let pushY = 0;

        const section = getCaveCrossSectionVertices({ centerX: cx, centerY: cy, width: a * 2, height: b_h * 2 }, z);
        const radialDivs = section.length / 2;
        for (let i = 0; i < radialDivs; i++) {
            const next = (i + 1) % radialDivs;
            const x1 = section[i * 2];
            const y1 = section[i * 2 + 1];
            const x2 = section[next * 2];
            const y2 = section[next * 2 + 1];
            
            // エッジベクトル
            const edgeX = x2 - x1;
            const edgeY = y2 - y1;
            
            // 内向き法線ベクトル（エッジを反時計回りに90度回転）
            let normX = -edgeY;
            let normY = edgeX;
            const len = Math.sqrt(normX * normX + normY * normY);
            normX /= len;
            normY /= len;
            
            // プレイヤーからの相対ベクトル
            const dx = newPx - x1;
            const dy = newPy - y1;
            
            // 法線方向の距離（正なら直線の内側、負なら外側）
            const dist = dx * normX + dy * normY;
            
            // プレイヤーを margin 分だけ内側に収める
            if (dist < margin) {
                wallHit = true;
                const pushDist = margin - dist;
                newPx += normX * pushDist;
                newPy += normY * pushDist;
                
                // 跳ね返り用のプッシュバックを合成
                pushX += normX * 1.4;
                pushY += normY * 1.0;
            }
        }
        
        return { x: newPx, y: newPy, hit: wallHit, pushX, pushY };
    }

    /**
     * 移動入力の処理とクランプ制限
     * @param {number} deltaTime
     * @param {number} gameDeltaTime
     */
    handleMovement(deltaTime, gameDeltaTime = deltaTime) {
        const input = this.game.input;
        const moveX = input.getMoveX();
        const moveY = input.getMoveY();
        
        const speed = GameConfig.player.speed;
        
        // 自動前進スクロール (バウンド状態に関わらず前進、早回し適用)
        this.mesh.position.z -= this.game.scrollSpeed * gameDeltaTime;

        // 壁バウンド（弾き返され）中の移動処理
        if (this.bounceTimer > 0) {
            this.bounceTimer -= deltaTime;
            // バウンドベクトルで強制移動
            this.mesh.position.x += this.bounceVector.x * deltaTime;
            this.mesh.position.y += this.bounceVector.y * deltaTime;
            // 速度減衰 (摩擦)
            this.bounceVector.multiplyScalar(0.90);
        } else {
            // 通常のキーボード入力による移動
            this.mesh.position.x += moveX * speed * deltaTime;
            this.mesh.position.y -= moveY * speed * deltaTime;
        }
        
        // Z座標における洞窟の動的境界を取得して移動クランプ
        const stage = this.game.stageManager ? this.game.stageManager.getCurrentStage() : null;
        const bounds = getCaveBoundsAt(this.mesh.position.z, stage, this.game.bossActiveRatio);
        
        // シェーダの凹凸を加味したマージン（基本1.0 + シェーダ最大オフセット1.5）
        const margin = GameConfig.player.hitRadius + 1.5;
        // 八角形の基準半径（マージンは _clampToOctagon 側で考慮するため引かない）
        const a = Math.max(0.1, bounds.width / 2);
        const b_h = Math.max(0.1, bounds.height / 2);
        const cx = bounds.centerX;
        const cy = bounds.centerY;

        const clampResult = this._clampToOctagon(this.mesh.position.x, this.mesh.position.y, cx, cy, a, b_h, margin, this.mesh.position.z);
        
        this.mesh.position.x = clampResult.x;
        this.mesh.position.y = clampResult.y;
        
        const wallHit = clampResult.hit;
        const pushX = clampResult.pushX;
        const pushY = clampResult.pushY;

        if (wallHit) {
            this.handleWallCollision(pushX, pushY);
        }

        // ロール・ヨーの姿勢傾き演出 (カクつきを抑え、滑らかに傾くように補間)
        const targetRoll = -moveX * 0.65;
        const targetYaw = -moveX * 0.30;
        this.mesh.rotation.z = THREE.MathUtils.lerp(this.mesh.rotation.z, targetRoll, 0.18);
        this.mesh.rotation.y = THREE.MathUtils.lerp(this.mesh.rotation.y, targetYaw, 0.18);

        // ピッチ（機首の上下傾き）の制御：
        // 上端または下端の境界に達しており、さらに限界方向へキー入力されている場合は、
        // 実際には進めないため、機首を水平（目標値 0.0）に戻す。
        // これにより、下限に達して止まった瞬間にミサイルが機体と被って見えなくなるのを根本防止する。
        let targetPitch = -moveY * 0.32; // ピッチの上下限界を強調
        if (wallHit && ((pushY < -0.01 && moveY < 0) || (pushY > 0.01 && moveY > 0))) {
            targetPitch = 0.0;
        }

        // 滑らかに目標のピッチ角へ補間（カクつきを抑え、スッと水平に戻る）
        this.mesh.rotation.x = THREE.MathUtils.lerp(this.mesh.rotation.x, targetPitch, 0.18);
    }

    handleWallCollision(pushX, pushY) {
        // 即時押し戻し（クランプによるめり込みを1フレームで確実に安全圏に戻す）
        this.mesh.position.x += pushX * 0.5;
        this.mesh.position.y += pushY * 0.5;

        // 跳ね返り（バウンド）の開始
        this.bounceTimer = 0.22; // 0.22秒間、逆方向に弾き飛ばされる
        this.bounceVector.set(pushX * 18.0, pushY * 18.0, 0.0); // バウンド速度ベクトル

        if (this.invincibleTimer <= 0) {
            // ダメージ適用 (無敵モード時は damage() 内で無視されます)
            const damageAmount = 15; // 壁衝突ダメージ
            this.damage(damageAmount, 'collision');

            // 壁被弾による無敵時間 (通常の被弾無敵より短い0.4秒に設定し、壁擦りへのペナルティを強める)
            this.invincibleTimer = 0.4;

            // 火花・爆発エフェクトを壁の接触地点に生成
            if (this.game && this.game.effectManager) {
                const px = this.mesh.position.x - pushX * 0.5;
                const py = this.mesh.position.y - pushY * 0.5;
                const pz = this.mesh.position.z;
                this.game.effectManager.spawnExplosion(px, py, pz, 0xff5500, 6, false);
            }
        }
    }

    /**
     * ツインブースター火炎の小刻みな伸縮アニメーション
     */
    animateBooster() {
        if (this.leftJet && this.rightJet) {
            const scaleYLeft = 0.8 + Math.random() * 0.4;
            const scaleYRight = 0.8 + Math.random() * 0.4;
            const scaleX = 0.9 + Math.random() * 0.2;
            
            this.leftJet.scale.set(scaleX, scaleX, scaleYLeft);
            this.rightJet.scale.set(scaleX, scaleX, scaleYRight);
        }
    }

    /**
     * ショット入力とクールダウン処理
     * @param {number} deltaTime
     */
    handleShooting(deltaTime) {
        if (this.fireTimer > 0) {
            this.fireTimer -= deltaTime;
        }

        const pressed = this.game.input.isFirePressed();
        const justPressed = pressed && !this.wasFirePressed;

        if (pressed) {
            if (this.ammo > 0) {
                // 新規入力(トリガー)時、または押しっぱなしのオート射撃クールダウン終了時
                if (justPressed || this.fireTimer <= 0) {
                    this.fire();
                    // 発射後はクールダウンをオート射撃の間隔に設定
                    this.fireTimer = GameConfig.player.autoFireInterval;
                }
            } else {
                // 弾数0で新規にボタンが押された時のみ「空撃ち警告」をトリガー
                if (justPressed) {
                    if (this.game.triggerNoAmmoWarning) {
                        this.game.triggerNoAmmoWarning();
                    }
                }
            }
        }

        this.wasFirePressed = pressed;
    }

    /**
     * ショット（弾）の発射処理 (パワーアップレベルに応じた拡散分岐)
     * 
     * 【物理挙動の補正に関する設計意図】：
     * 自機が移動している（機首が傾いている）際、弾を単に機首の向き（3Dモデルの正面）へ固定速度で射出すると、
     * 自機の移動速度（慣性）が加算されないため、画面上で弾が機首の向きから左右または上下に流れてしまう（＝Z軸方向に寄る）
     * という視覚的・体感的な違和感が生じます。
     * 
     * これを解消するため、以下の計算式に基づいて弾のワールド速度ベクトル (v_bullet) を求めます。
     *   v_bullet = v_player + d_world * v_relative_base
     * 
     * ここで：
     *   - v_player: 自機のワールド座標系での移動速度（スクロール速度を含む）
     *   - d_world: 弾の射出方向（機首の向き）
     *   - v_relative_base: 自機から見た弾の相対速度基準値（GameConfig.bullet.speed - scrollSpeed）
     * 
     * これにより、自機がどのような速度で移動・旋回していても、プレイヤーの視点（カメラ追従）からは、
     * 常に弾が「機首の向いている方向へ、一定の相対速度で綺麗に直進する」ように見え、体感的な違和感が解消されます。
     */
    fire() {
        // 弾数を1減算
        this.ammo = Math.max(0, this.ammo - 1);
        this.game.updateUI();

        // 効果音再生
        if (window.audioManager) {
            audioManager.play('playerShoot');
        }

		// 当フレームの移動・回転をワールド行列へ即時反映し、発射口座標の1フレーム遅延を防止
		this.mesh.updateMatrixWorld();
		const playerRot = this.mesh.quaternion;

		// 発射口のローカル座標から世界座標へ変換
		const centerPos = _playerTempVec1.set(0.0, 0.0, -1.9).applyMatrix4(this.mesh.matrixWorld);
        const leftPos = _playerTempVec2.set(-0.35, 0.0, -1.8).applyMatrix4(this.mesh.matrixWorld);
        const rightPos = _playerTempVec3.set(0.35, 0.0, -1.8).applyMatrix4(this.mesh.matrixWorld);

        // 自機から見た相対的な弾速の基準値 (通常は 60.0 - 30.0 = 30.0)
        const relativeSpeedBase = GameConfig.bullet.speed - this.game.scrollSpeed;

        /**
         * 弾を発射するヘルパー関数
         * 射撃位置とローカル射出方向を受け取り、自機の移動速度（慣性）を加味したワールド進行方向・速度を計算して生成する。
         * @param {THREE.Vector3} pos - 発射開始位置 (ワールド座標系)
         * @param {THREE.Vector3} dirLocal - ローカル射出方向ベクトル
         */
        const spawnHelper = (pos, dirLocal) => {
            // 1. ローカル射出方向を機体の回転に合わせてワールド座標系に変換
            const dirWorld = _playerTempVec4.copy(dirLocal).applyQuaternion(playerRot);
            
            // 2. 弾のワールド速度ベクトルを計算 = 自機速度 + (射出方向 * 自機から見た相対速度)
            // bVel (再利用のため _playerTempVec4 は使い終わっているので使いまわさない、ここは素直に let 等で宣言せず、別途変数を使うか、
            // new THREE.Vector3 を使わず _playerTempVec2 等を再利用するが、引数として pos に _playerTempVec1等 を渡しているので安全なものを利用する)
            const speedX = this.velocity.x + dirWorld.x * relativeSpeedBase;
            const speedY = this.velocity.y + dirWorld.y * relativeSpeedBase;
            const speedZ = this.velocity.z + dirWorld.z * relativeSpeedBase;
            
            // 3. ワールド速度ベクトルから、弾の進行方向（正規化）と速度（大きさ）を算出
            const speed = Math.sqrt(speedX*speedX + speedY*speedY + speedZ*speedZ);
            if (speed > 0.001) {
                const dirX = speedX / speed;
                const dirY = speedY / speed;
                const dirZ = speedZ / speed;
                this.game.spawnPlayerBullet(pos.x, pos.y, pos.z, dirX, dirY, dirZ, speed);
            } else {
                // 速度が極小になった場合のフォールバック（デフォルトの弾速を適用）
                this.game.spawnPlayerBullet(pos.x, pos.y, pos.z, dirWorld.x, dirWorld.y, dirWorld.z, GameConfig.bullet.speed);
            }
        };

        if (this.powerLevel === 1) {
            // Lv1: 中央から平行に1連装
            spawnHelper(centerPos, _playerDirStraight);
        } 
        else if (this.powerLevel === 2) {
            // Lv2: 左右ノーズから平行に2連装
            spawnHelper(leftPos, _playerDirStraight);
            spawnHelper(rightPos, _playerDirStraight);
        } 
        else {
            // Lv3: 3方向スプレッドショット (中央1発 + 左右に約12度拡散した2発)
            spawnHelper(centerPos, _playerDirStraight);
            spawnHelper(leftPos, _playerDirSpreadL);
            spawnHelper(rightPos, _playerDirSpreadR);
        }
    }

    /**
     * 自機を一瞬カラー発光させる (パワー吸収演出)
     * @param {number} color - 発光するRGBカラー値
     */
    flash(color) {
        if (this.bodyMats) {
            this.bodyMats.forEach(mat => mat.emissive.setHex(color));
        }
        this.flashTimer = 0.15; // 0.15秒間フラッシュ
    }

    /**
     * 自己発光フラッシュのフェードアウト更新
     * @param {number} deltaTime
     */
    handleFlash(deltaTime) {
        if (this.flashTimer > 0) {
            this.flashTimer -= deltaTime;
            if (this.flashTimer <= 0) {
                if (this.bodyMats) {
                    this.bodyMats.forEach(mat => mat.emissive.setHex(0x000000)); // 通常色に戻す
                }
            }
        }
    }

    /**
     * アイテム取得：弾薬補充
     * @param {number} amount
     */
    addAmmo(amount) {
        this.ammo = Math.min(this.maxAmmo, this.ammo + amount);
        this.game.updateUI();
    }

    /**
     * アイテム取得：回復
     * @param {number} amount
     */
    heal(amount) {
        this.life = Math.min(this.maxLife, this.life + amount);
        this.game.updateUI();
    }

    /**
     * アイテム取得：パワーアップ
     */
    powerUp() {
        if (this.powerLevel < this.maxPowerLevel) {
            this.powerLevel++;
        } else {
            this.game.score += 1000;
        }
        this.game.updateUI();
    }

    /**
     * 被弾によるダメージ処理
     * @param {number} amount - ダメージ量
     * @param {string} source - ダメージの要因 ('hit': 被弾, 'collision': 衝突)
     */
    damage(amount, source = 'hit') {
        if (this.isInvincible || this.isDebugInvincible || this.state !== PlayerState.ALIVE) return;

        this.life = Math.max(0, this.life - amount);
        
        if (this.powerLevel > 1) {
            this.powerLevel--;
        }

        this.isInvincible = true;
        this.invincibleTimer = this.invincibleDuration;

        // ポストプロセッシングの画面ダメージフラッシュを発動
        if (this.game && this.game.renderer) {
            this.game.renderer.triggerDamageFlash(0.4);
        }
        
        this.game.updateUI();

        if (this.life <= 0) {
            // ライフゼロで爆発効果音
            if (window.audioManager) {
                audioManager.play('playerExplode');
            }
            if (this.game.input) {
                this.game.input.vibrate(800, 1.0, 1.0);
            }
            this.state = PlayerState.DYING;
            this.dyingTimer = 3.5;
            this.dyingExplosionTimer = 0.0;
            if (this.bodyMats) {
                this.bodyMats.forEach(mat => mat.emissive.setHex(0xff0000)); // 墜落中は赤く発光
            }
			if (this.game.cameraController) {
				this.game.cameraController.isDyingMode = true;
			}
			// 墜落見送りカメラへ切り替わるため自機モデルを再表示する
			this.setCockpitMode(false);
			if (this.game.uiManager) {
				this.game.uiManager.setCockpitOverlayVisible(false);
			}
			this.disintegrate();
        } else {
            // 被弾または衝突効果音
            if (window.audioManager) {
                if (source === 'collision') {
                    audioManager.play('playerCollide');
                } else {
                    audioManager.play('playerHit');
                }
            }
            if (this.game.input) {
                this.game.input.vibrate(200, 0.5, 0.5);
            }
        }
    }

    /**
     * 無敵時間および点滅の更新処理
     * @param {number} deltaTime
     */
    handleInvincibility(deltaTime) {
		if (!this.isInvincible) {
			// 無敵終了後のバリアのフェードアウト収束処理
			if (this.barrierGroup && this.barrierGroup.visible) {
				this.barrierMat.opacity = Math.max(0, this.barrierMat.opacity - deltaTime * 4.0);
				if (this.barrierShieldMat && this.barrierShieldMat.uniforms) {
					this.barrierShieldMat.uniforms.uOpacity.value = Math.max(
						0,
						this.barrierShieldMat.uniforms.uOpacity.value - deltaTime * 3.5
					);
				}

				const currentScale = this.barrierGroup.scale.x;
				const nextScale = Math.max(0, currentScale - deltaTime * 3.2);
				this.barrierGroup.scale.set(nextScale, nextScale, nextScale);

				if (nextScale <= 0.01) {
					this.barrierGroup.visible = false;
				}
			}
			return;
		}

		this.invincibleTimer -= deltaTime;

		// バリア状態の描画更新
		if (this.hasBarrier) {
			this.barrierGroup.visible = true;

			if (this.barrierShieldMat && this.barrierShieldMat.uniforms) {
				this.barrierShieldMat.uniforms.uTime.value += deltaTime;
			}

			const overallRatio = this.barrierMaxTimer > 0 ? (this.invincibleTimer / this.barrierMaxTimer) : 1.0;
			const ratio = Math.min(1.0, overallRatio / 0.2);
			const droneScale = Math.max(0.25, ratio);

			// バリア球体（六角形ハニカム模様）自体をゆっくり 2 軸回転させる
			if (this.barrierShieldMesh) {
				const shieldSpin = Math.max(0.4, ratio);
				this.barrierShieldMesh.rotation.y += deltaTime * 0.55 * shieldSpin;
				this.barrierShieldMesh.rotation.x += deltaTime * 0.22 * shieldSpin;
			}

			// 残り 2.0 秒未満でシアンから警告アンバー/レッドへ滑らかにシフト
			const warningFactor = this.invincibleTimer < 2.0
				? Math.min(1.0, (2.0 - this.invincibleTimer) / 1.5)
				: 0.0;

			if (this.barrierShieldMat && this.barrierShieldMat.uniforms) {
				this.barrierShieldMat.uniforms.uWarning.value = warningFactor;
			}

			if (this.invincibleTimer < 1.5) {
				const flash = 0.35 + 0.65 * Math.abs(Math.sin(this.invincibleTimer * 24.0));
				this.barrierMat.opacity = flash * 0.75;
				if (this.barrierShieldMat) {
					this.barrierShieldMat.uniforms.uOpacity.value = flash * 0.85;
				}
			} else {
				this.barrierMat.opacity = Math.min(0.65, this.barrierMat.opacity + deltaTime * 2.5);
				if (this.barrierShieldMat) {
					this.barrierShieldMat.uniforms.uOpacity.value = Math.min(
						0.85,
						this.barrierShieldMat.uniforms.uOpacity.value + deltaTime * 2.8
					);
				}
			}

			// 2軸ジャイロリングと 3 基のシールドプロジェクタードローンの滑らかな回転
			const speedRatio = Math.max(0.35, ratio);
			if (this.barrierOrbits[0]) {
				this.barrierOrbits[0].rotation.z += deltaTime * 1.8 * speedRatio;
				this.barrierOrbits[0].rotation.y += deltaTime * 0.9 * speedRatio;
			}
			if (this.barrierOrbits[1]) {
				this.barrierOrbits[1].rotation.z -= deltaTime * 2.2 * speedRatio;
				this.barrierOrbits[1].rotation.x += deltaTime * 0.7 * speedRatio;
			}
			if (this.barrierDroneOrbit) {
				this.barrierDroneOrbit.rotation.z += deltaTime * 4.8 * speedRatio;
			}
			if (this.barrierDrones) {
				for (let i = 0; i < this.barrierDrones.length; i++) {
					this.barrierDrones[i].scale.set(droneScale, droneScale, droneScale);
				}
			}

			// バリア持続音のループ再生
			if (this.barrierSoundTimer === undefined) {
				this.barrierSoundTimer = 0;
			}
			this.barrierSoundTimer -= deltaTime;
			if (this.barrierSoundTimer <= 0) {
				if (window.audioManager) {
					audioManager.play('barrierLoop');
				}
				this.barrierSoundTimer = 0.15 + (1.0 - ratio) * 0.30;
			}
		}

		if (this.invincibleTimer <= 0) {
			this.isInvincible = false;
			this.hasBarrier = false;
			this.mesh.traverse((child) => {
				if (child.isMesh && !child.userData.isBarrierPart) {
					child.visible = !this.isCockpitMode;
				}
			});
		} else if (!this.hasBarrier && !this.isCockpitMode) {
			// 被弾直後の無敵時間中は機体のみ点滅させる（コックピット視点時は非表示維持）
			const blinkInterval = 0.05;
			const step = Math.floor(this.invincibleTimer / blinkInterval);
			const isVis = (step % 2 === 0);
			this.mesh.traverse((child) => {
				if (child.isMesh && !child.userData.isBarrierPart) {
					child.visible = isVis;
				}
			});
		}
    }

    /**
     * プレイヤーの破棄
     */
    destroy() {
        if (this.mesh) {
            this.game.renderer.scene.remove(this.mesh);
            this.mesh.traverse((child) => {
                if (child.isMesh) {
                    if (child.geometry) child.geometry.dispose();
                    if (child.material) {
                        if (Array.isArray(child.material)) {
                            child.material.forEach(m => m.dispose());
                        } else {
                            child.material.dispose();
                        }
                    }
                }
            });
        }
        this.mesh = null;
        this.mainMat = null;
        this.bodyMats = null;
        this.leftJet = null;
        this.rightJet = null;
    }



    /**
     * ノックバック中などの壁外へのはみ出しを防止するフェイルセーフ制限
     */
    applyFailSafeLimits() {
        const stage = this.game.stageManager ? this.game.stageManager.getCurrentStage() : null;
        const bounds = getCaveBoundsAt(this.mesh.position.z, stage, this.game.bossActiveRatio);
        
        // 洞窟境界からさらに 2.0 ユニット外側にバッファを持たせる
        const bufferMargin = -2.0;
        const a = bounds.width / 2;
        const b_h = bounds.height / 2;
        const cx = bounds.centerX;
        const cy = bounds.centerY;

        const clampResult = this._clampToOctagon(this.mesh.position.x, this.mesh.position.y, cx, cy, a, b_h, bufferMargin, this.mesh.position.z);
        this.mesh.position.x = clampResult.x;
        this.mesh.position.y = clampResult.y;
    }

    /**
     * 自機を構成するパーツをバラバラに爆散させる初期化処理
     */
    disintegrate() {
        if (!this.mesh) return;

        // ジェットブースターを即時非表示にする
        if (this.leftJet) this.leftJet.visible = false;
        if (this.rightJet) this.rightJet.visible = false;

		this.mesh.children.forEach((part) => {
			if (part === this.leftJet || part === this.rightJet || part === this.barrierGroup) return;

            // 放射状の初期移動ベクトル
            const radialDir = part.position.clone();
            if (radialDir.lengthSq() < 0.01) {
                // 機体中心部にあるパーツはランダム方向に飛ばす
                radialDir.set(
                    (Math.random() - 0.5) * 2.0,
                    (Math.random() - 0.5) * 2.0,
                    (Math.random() - 0.5) * 2.0
                );
            }
            radialDir.normalize();

            // 飛び散る初期速度（放射状の勢い ＋ 上向きの吹き飛び ＋ ランダムノイズ）
            const force = 3.5 + Math.random() * 5.0;
            part.velocity = radialDir.multiplyScalar(force);
            part.velocity.y += 2.0 + Math.random() * 3.5; // 上方向に吹き飛ぶような成分
            part.velocity.z += (Math.random() - 0.5) * 3.0; // 進行方向にも散らす

            // 回転速度
            part.angularVelocity = new THREE.Vector3(
                (Math.random() - 0.5) * 12.0,
                (Math.random() - 0.5) * 12.0,
                (Math.random() - 0.5) * 12.0
            );
        });

        this.partsDisintegrated = true;
    }
}
