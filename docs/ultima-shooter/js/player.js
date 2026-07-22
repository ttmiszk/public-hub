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

        this.init();
    }

    /**
     * 近代ステルス戦闘機の3Dモデル初期化
     */
    init() {
        this.mesh = new THREE.Group();

        // 配色定義（白飛びしないように少し暗めのグレー基調にする）
        const bodyColor = 0xb0b5bc; // 機体中央（強い光が当たると白く見える）
        const wingColor = 0x9ba2ab; // 主翼
        const noseColor = 0xb0b5bc; // 機首
        const stabColor = 0x8a929e; // 垂直尾翼
        const canopyColor = 0x334455; // キャノピー（暗すぎない青灰色）
        const metalColor = 0x778899; // 推進器などの金属パーツ（明るめのグレー）

        this.mainMat = new THREE.MeshStandardMaterial({ 
            color: bodyColor, 
            metalness: 0.2, // 塗装された金属のイメージ
            roughness: 0.3,
            flatShading: true,
            emissive: 0x000000
        });

        const wingMat = new THREE.MeshStandardMaterial({ 
            color: wingColor, 
            metalness: 0.2,
            roughness: 0.3,
            flatShading: true,
            emissive: 0x000000
        });

        const noseMat = new THREE.MeshStandardMaterial({ 
            color: noseColor, 
            metalness: 0.2,
            roughness: 0.3,
            flatShading: true,
            emissive: 0x000000
        });

        const stabMat = new THREE.MeshStandardMaterial({ 
            color: stabColor, 
            metalness: 0.2,
            roughness: 0.3,
            flatShading: true,
            emissive: 0x000000
        });

        this.bodyMats = [this.mainMat, wingMat, noseMat, stabMat];

        const metalMat = new THREE.MeshStandardMaterial({ 
            color: metalColor, 
            metalness: 0.4, // 0.9だと環境マップがないと真っ黒になるため下げる
            roughness: 0.3,
            flatShading: true
        });

        // 1. 中央胴体 (Fuselage)
        const bodyGeo = new THREE.BoxGeometry(0.7, 0.28, 2.5);
        const body = new THREE.Mesh(bodyGeo, this.mainMat);
        body.position.z = 0.0;
        this.mesh.add(body);

        // 機首 (Nose Cone) - 丸みを持たせて滑らかな流線形に
        const noseGeo = new THREE.ConeGeometry(0.35, 1.2, 16);
        // 先端（+Y）を前方向（-Z）に向けるためにマイナス90度回転
        noseGeo.rotateX(-Math.PI / 2); 
        noseGeo.scale(1.0, 0.4, 1.0); 
        const nose = new THREE.Mesh(noseGeo, noseMat);
        nose.position.set(0, 0.0, -1.85); 
        this.mesh.add(nose);

        // 2. コックピットキャノピー (流線形に平たく伸ばす)
        const canopyGeo = new THREE.SphereGeometry(0.14, 12, 12);
        canopyGeo.scale(1.0, 0.6, 3.8); // 縦を潰し、前後に長く伸ばして滑らかに
        const canopyMat = new THREE.MeshStandardMaterial({ 
            color: canopyColor,
            metalness: 0.4, // 0.8から下げて環境光を反射させる
            roughness: 0.2,
            flatShading: true
        });
        const canopy = new THREE.Mesh(canopyGeo, canopyMat);
        canopy.position.set(0, 0.16, -0.65); // 機体に埋め込むように高さを下げる
        this.mesh.add(canopy);

        // 3. 主翼 (戦闘機風のデルタウィング)
        const extrudeSettings = { depth: 0.04, bevelEnabled: false };
        
        // 左翼の形状定義
        const leftShape = new THREE.Shape();
        leftShape.moveTo(0, -0.7); // 機首側の付け根
        leftShape.lineTo(-1.6, 0.6); // 翼端（後退角）
        leftShape.lineTo(0, 0.6); // 機尾側の付け根
        leftShape.lineTo(0, -0.7);
        const leftWingGeo = new THREE.ExtrudeGeometry(leftShape, extrudeSettings);
        leftWingGeo.rotateX(Math.PI / 2); // XZ平面に寝かせる
        leftWingGeo.translate(0, 0.02, 0); // Y軸の中心合わせ

        const leftWing = new THREE.Mesh(leftWingGeo, wingMat);
        leftWing.position.set(-0.35, 0.0, 0.3); // 胴体の左側面に配置
        this.mesh.add(leftWing);

        // 右翼の形状定義
        const rightShape = new THREE.Shape();
        rightShape.moveTo(0, -0.7); // 機首側の付け根
        rightShape.lineTo(1.6, 0.6); // 翼端（後退角）
        rightShape.lineTo(0, 0.6); // 機尾側の付け根
        rightShape.lineTo(0, -0.7);
        const rightWingGeo = new THREE.ExtrudeGeometry(rightShape, extrudeSettings);
        rightWingGeo.rotateX(Math.PI / 2); // XZ平面に寝かせる
        rightWingGeo.translate(0, 0.02, 0); // Y軸の中心合わせ

        const rightWing = new THREE.Mesh(rightWingGeo, wingMat);
        rightWing.position.set(0.35, 0.0, 0.3); // 胴体の右側面に配置
        this.mesh.add(rightWing);

        // 4. 水平尾翼
        const stabGeo = new THREE.BoxGeometry(0.65, 0.03, 0.45);
        
        const leftStab = new THREE.Mesh(stabGeo, stabMat);
        leftStab.position.set(-0.65, 0.0, 1.05);
        leftStab.rotation.y = Math.PI / 6; 
        this.mesh.add(leftStab);

        const rightStab = new THREE.Mesh(stabGeo, stabMat);
        rightStab.position.set(0.65, 0.0, 1.05);
        rightStab.rotation.y = -Math.PI / 6;
        this.mesh.add(rightStab);

        // 5. 垂直尾翼 (高さを抑えた三角形)
        const finShape = new THREE.Shape();
        finShape.moveTo(-0.25, 0); // 前方の付け根
        finShape.lineTo(0.25, 0); // 後方の付け根
        finShape.lineTo(0.25, 0.4); // 後方上部の先端（高さを0.65から0.4へ低下）
        finShape.lineTo(-0.25, 0);
        
        const finExtrudeSettings = { depth: 0.03, bevelEnabled: false };
        const finGeo = new THREE.ExtrudeGeometry(finShape, finExtrudeSettings);
        finGeo.rotateY(-Math.PI / 2); // 向きをZ軸に沿わせる
        finGeo.translate(-0.015, 0, 0); // 中心合わせ
        
        const leftFin = new THREE.Mesh(finGeo, stabMat);
        leftFin.position.set(-0.3, 0.14, 0.95); // Y座標を胴体上部に合わせる
        leftFin.rotation.z = -Math.PI / 18; 
        leftFin.rotation.y = -Math.PI / 24; 
        this.mesh.add(leftFin);

        const rightFin = new THREE.Mesh(finGeo, stabMat);
        rightFin.position.set(0.3, 0.14, 0.95);
        rightFin.rotation.z = Math.PI / 18;  
        rightFin.rotation.y = Math.PI / 24;
        this.mesh.add(rightFin);

        // 6. 双発エンジンノズル (滑らかな円柱にするためポリゴン数を増加)
        const nozzleGeo = new THREE.CylinderGeometry(0.15, 0.18, 0.35, 16);
        nozzleGeo.rotateX(Math.PI / 2);
        
        const leftNozzle = new THREE.Mesh(nozzleGeo, metalMat);
        leftNozzle.position.set(-0.2, 0.0, 1.35);
        this.mesh.add(leftNozzle);

        const rightNozzle = new THREE.Mesh(nozzleGeo, metalMat);
        rightNozzle.position.set(0.2, 0.0, 1.35);
        this.mesh.add(rightNozzle);

        // 7. ツインジェットブースター (アフターバーナーの表現)
        // 7. ツインジェットブースター (アフターバーナーの表現)
        // ① 最も外側の長い青い炎
        const jetOuterGeo = new THREE.ConeGeometry(0.12, 1.6, 16, 1, true);
        jetOuterGeo.translate(0, 0.8, 0); 
        jetOuterGeo.rotateX(Math.PI / 2); 
        const jetOuterMat = new THREE.MeshBasicMaterial({
            color: 0x0044ff, // 深い青
            transparent: true,
            opacity: 0.2, // 透明度を下げて内側を見えやすく
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        jetOuterMat.color.multiplyScalar(1.5); // 発光を控えめに

        // ② 内側のライトブルーの炎
        const jetInnerGeo = new THREE.ConeGeometry(0.08, 1.0, 12, 1, true);
        jetInnerGeo.translate(0, 0.5, 0);
        jetInnerGeo.rotateX(Math.PI / 2);
        const jetInnerMat = new THREE.MeshBasicMaterial({
            color: 0x2288ff, // 青
            transparent: true,
            opacity: 0.4, // 透明度を下げて内側を見えやすく
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        jetInnerMat.color.multiplyScalar(2.0); // 中程度の発光

        // ③ 根本のオレンジ色の強力な発光（白飛びを防ぐためノーマルブレンド）
        const jetBaseGeo = new THREE.ConeGeometry(0.06, 0.5, 12, 1, true);
        jetBaseGeo.translate(0, 0.25, 0);
        jetBaseGeo.rotateX(Math.PI / 2);
        const jetBaseMat = new THREE.MeshBasicMaterial({
            color: 0xffaa00, // 鮮やかなオレンジ・黄色
            transparent: true,
            opacity: 1.0,
            blending: THREE.NormalBlending, // 加算合成を外して色を保つ
            depthWrite: false,
            side: THREE.DoubleSide
        });
        jetBaseMat.color.multiplyScalar(6.0); // 中心だけ強烈に発光させる

        // 左ブースター
        this.leftJet = new THREE.Group();
        const leftOuter = new THREE.Mesh(jetOuterGeo, jetOuterMat);
        const leftInner = new THREE.Mesh(jetInnerGeo, jetInnerMat);
        const leftBase = new THREE.Mesh(jetBaseGeo, jetBaseMat);
        this.leftJet.add(leftOuter);
        this.leftJet.add(leftInner);
        this.leftJet.add(leftBase);
        this.leftJet.position.set(-0.2, 0.0, 1.5);
        this.mesh.add(this.leftJet);

        // 右ブースター
        this.rightJet = new THREE.Group();
        const rightOuter = new THREE.Mesh(jetOuterGeo, jetOuterMat);
        const rightInner = new THREE.Mesh(jetInnerGeo, jetInnerMat);
        const rightBase = new THREE.Mesh(jetBaseGeo, jetBaseMat);
        this.rightJet.add(rightOuter);
        this.rightJet.add(rightInner);
        this.rightJet.add(rightBase);
        this.rightJet.position.set(0.2, 0.0, 1.5);
        this.mesh.add(this.rightJet);

        // 初期位置
        this.mesh.position.set(0, 1.0, 0);
        
        // バリアエフェクト用のメッシュ（ホログラムシールド球体 + 衛星クリスタル）
        this.barrierGroup = new THREE.Group();
        this.barrierGroup.visible = false;

        // 1. 中央のエネルギーシールド球体（3D回転ホログラム緯度リング＋高透明シースルー膜）
        const shieldGeo = new THREE.IcosahedronGeometry(2.6, 3);
        this.barrierShieldMat = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uColor: { value: new THREE.Color(0x00d2ff) },
                uOpacity: { value: 0.35 }
            },
            vertexShader: `
                varying vec3 vNormal;
                varying vec3 vPosition;
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    vNormal = normalize(normalMatrix * normal);
                    vPosition = position;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform float uTime;
                uniform vec3 uColor;
                uniform float uOpacity;
                varying vec3 vNormal;
                varying vec3 vPosition;
                varying vec2 vUv;

                vec3 rotateY(vec3 p, float angle) {
                    float c = cos(angle);
                    float s = sin(angle);
                    return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
                }

                void main() {
                    vec3 viewDir = normalize(-vPosition);
                    float dotNV = abs(dot(viewDir, vNormal));
                    float fresnel = pow(1.0 - dotNV, 2.5);

                    // 時間経過で3D回転する球体表面座標
                    vec3 rotPos = rotateY(vPosition, uTime * 0.8);

                    // 正面カメラ方向のライン視認性をすっきりさせるフェード係数
                    float frontFade = mix(0.35, 1.0, fresnel);

                    // 1. 3Dホログラム緯度リング（極細・繊細なシャープライン）
                    float latLine = abs(sin(rotPos.y * 4.5 + uTime * 1.5));
                    float gridLine = smoothstep(0.965, 0.995, latLine) * frontFade;

                    // 2. 補助的な経度グリッド線（極細）
                    float lonLine = abs(sin(atan(rotPos.z, rotPos.x) * 4.0 + uTime * 1.0));
                    float gridCross = smoothstep(0.975, 0.996, lonLine) * 0.35 * frontFade;

                    float pulse = sin(uTime * 3.5) * 0.1 + 0.9;

                    vec3 lineColor = vec3(0.3, 0.95, 1.0);
                    vec3 baseGlow = uColor * (0.8 + fresnel * 2.5);
                    vec3 finalColor = mix(baseGlow, lineColor * 2.8, max(gridLine, gridCross));

                    // 正面中央の膜は非常に薄く透明、極細ホログラムラインと外周輪郭で上品な3D球体を表現
                    float alpha = uOpacity * (0.10 + fresnel * 0.75 + gridLine * 0.5 + gridCross * 0.25) * pulse;

                    gl_FragColor = vec4(finalColor * 2.2, clamp(alpha, 0.0, 0.60));
                }
            `,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        this.barrierShieldMesh = new THREE.Mesh(shieldGeo, this.barrierShieldMat);
        this.barrierGroup.add(this.barrierShieldMesh);

        // 2. 衛星クリスタル
        const satGeo = new THREE.OctahedronGeometry(0.12, 0);
        this.barrierMat = new THREE.MeshStandardMaterial({
            color: 0xfeca57,
            emissive: 0xaa6600,
            metalness: 0.1,
            roughness: 0.1,
            flatShading: true,
            transparent: true,
            opacity: 0.0,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        this.barrierOrbits = [];
        const orbitAngles = [
            new THREE.Euler(0, 0, 0),
            new THREE.Euler(Math.PI / 4, Math.PI / 4, 0),
            new THREE.Euler(-Math.PI / 4, -Math.PI / 4, 0),
            new THREE.Euler(Math.PI / 2, 0, Math.PI / 4)
        ];

        for (let i = 0; i < orbitAngles.length; i++) {
            const orbit = new THREE.Group();
            orbit.rotation.copy(orbitAngles[i]);
            
            for (let j = 0; j < 3; j++) {
                const sat = new THREE.Mesh(satGeo, this.barrierMat);
                const angle = (j / 3) * Math.PI * 2;
                sat.position.set(Math.cos(angle) * 2.5, Math.sin(angle) * 2.5, 0);
                sat.scale.set(1.0, 1.0, 1.0);
                orbit.add(sat);
            }
            
            this.barrierOrbits.push(orbit);
            this.barrierGroup.add(orbit);
        }

        this.mesh.add(this.barrierGroup);
        
        // 影を落とす・受ける設定を有効化
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        this.mesh.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });

        // シーンに追加
        this.game.renderer.scene.add(this.mesh);
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
        
        // バリア取得時に、もし点滅中で消えているパーツがあればすべて表示状態に戻す
        this.mesh.traverse((child) => {
            if (child.isMesh && child.material !== this.barrierMat) {
                child.visible = true;
            }
        });

        if (this.barrierGroup) {
            this.barrierGroup.scale.set(1, 1, 1); // グループ全体のスケールをリセット
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
            // 無敵終了後のバリアのフェードアウト処理
            if (this.barrierGroup && this.barrierGroup.visible) {
                this.barrierMat.opacity = Math.max(0, this.barrierMat.opacity - deltaTime * 4.0);
                
                // フェードアウトと同時にグループ全体を急激に縮小させて消滅感を出す
                const currentScale = this.barrierGroup.scale.x;
                const nextScale = Math.max(0, currentScale - deltaTime * 3.0);
                this.barrierGroup.scale.set(nextScale, nextScale, nextScale);

                if (this.barrierMat.opacity <= 0) {
                    this.barrierGroup.visible = false;
                }
            }
            return;
        }

        this.invincibleTimer -= deltaTime;

        // バリア状態の描画更新
        if (this.hasBarrier) {
            this.barrierGroup.visible = true;

            // シェーダーのアニメーション時間を進める
            if (this.barrierShieldMat && this.barrierShieldMat.uniforms) {
                this.barrierShieldMat.uniforms.uTime.value += deltaTime;
            }

            // 全体の残り時間の割合
            const overallRatio = this.barrierMaxTimer > 0 ? (this.invincibleTimer / this.barrierMaxTimer) : 1.0;
            const ratio = Math.min(1.0, overallRatio / 0.2);

            const satScale = Math.max(0.03, ratio);

            if (this.invincibleTimer < 1.5) {
                const flashOpacity = 0.3 + 0.7 * Math.abs(Math.sin(this.invincibleTimer * 30.0));
                this.barrierMat.opacity = flashOpacity;
                if (this.barrierShieldMat) {
                    this.barrierShieldMat.uniforms.uOpacity.value = flashOpacity * 0.35;
                }
            } else {
                this.barrierMat.opacity = Math.min(0.9, this.barrierMat.opacity + deltaTime * 2.0);
                if (this.barrierShieldMat) {
                    this.barrierShieldMat.uniforms.uOpacity.value = Math.min(0.35, this.barrierShieldMat.uniforms.uOpacity.value + deltaTime * 1.2);
                }
            }
            // 軌道面は固定し、Z軸（軌道面上での回転）のみを回すことで、安定した衛星軌道を表現
            // ラスト20%の期間にのみ周回速度も徐々に遅くする（最低で元の30%の速度）
            const speedRatio = Math.max(0.3, ratio);
            const speedBase = 10.0 * speedRatio;
            this.barrierOrbits[0].rotation.z += deltaTime * speedBase;
            this.barrierOrbits[1].rotation.z -= deltaTime * (speedBase * 1.2); 
            this.barrierOrbits[2].rotation.z += deltaTime * (speedBase * 0.9); 
            this.barrierOrbits[3].rotation.z -= deltaTime * (speedBase * 1.1);
            
            // 衛星自体も回転させる（キラキラさせる）と同時にスケールも更新
            this.barrierOrbits.forEach(orbit => {
                orbit.children.forEach(sat => {
                    sat.rotation.x += deltaTime * 5.0;
                    sat.rotation.y += deltaTime * 6.0;
                    sat.scale.set(satScale, satScale, satScale);
                });
            });

            // バリア持続音のループ再生
            if (this.barrierSoundTimer === undefined) {
                this.barrierSoundTimer = 0;
            }
            this.barrierSoundTimer -= deltaTime;
            if (this.barrierSoundTimer <= 0) {
                if (window.audioManager) {
                    audioManager.play('barrierLoop');
                }
                // 周回速度の低下に合わせて、効果音が鳴る間隔も広げる（0.15秒 〜 最長0.45秒）
                this.barrierSoundTimer = 0.15 + (1.0 - ratio) * 0.30;
            }
        }

        if (this.invincibleTimer <= 0) {
            this.isInvincible = false;
            this.hasBarrier = false;
            // バリア以外のメッシュをすべて表示状態に戻す
            this.mesh.traverse((child) => {
                if (child.isMesh && child.material !== this.barrierMat) {
                    child.visible = true;
                }
            });
        } else {
            // ダメージによる無敵時間中は機体を点滅させる（バリア展開中は点滅しない）
            if (!this.hasBarrier) {
                const blinkInterval = 0.05;
                const step = Math.floor(this.invincibleTimer / blinkInterval);
                const isVis = (step % 2 === 0);
                this.mesh.traverse((child) => {
                    if (child.isMesh && child.material !== this.barrierMat) {
                        child.visible = isVis;
                    }
                });
            }
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
            if (part === this.leftJet || part === this.rightJet) return;

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
