/**
 * @fileoverview boss.js
 * ボス敵クラス。ステージの最後に登場する大型ボスの3Dモデル生成、
 * 複数の攻撃パターン（ウェーブ、フェーズ移行など）、および撃破演出を管理する。
 */

/**
 * ボス敵クラス
 * 各ステージの最後に出現する巨大なボスエネミーの3Dモデル、
 * 行動ルーチン（出現、追従、フェーズ別弾幕攻撃、必殺技チャージ＆ビーム）、被弾時の自己発光フラッシュ、
 * 大爆発消滅の撃破演出、およびライフ管理を司る。
 */
class Boss {
    /**
     * @param {THREE.Scene} scene - シーンオブジェクト
     * @param {number} stageIndex - ステージインデックス (0:草原, 1:海, 2:洞窟)
     */
    constructor(scene, stageIndex) {
        /** @type {THREE.Scene} */
        this.scene = scene;
        /** @type {number} */
        this.stageIndex = stageIndex;
        /** @type {boolean} */
        this.active = false;
        
        const config = GameConfig.bosses.types[stageIndex];
        /** @type {string} */
        this.name = config.name;
        /** @type {number} */
        this.maxHp = config.hp;
        /** @type {number} */
        this.hp = this.maxHp;
        /** @type {number} */
        this.color = config.color;
        /** @type {number} */
        this.score = config.score;
        /** @type {number} 当たり判定半径 */
        this.hitRadius = config.hitRadius;
        /** @type {number} X軸方向の移動速度（周回係数で外部から上書き可能） */
        this.moveSpeedX = config.moveSpeedX || 4.5;
        /** @type {number} Y軸方向の移動速度（周回係数で外部から上書き可能） */
        this.moveSpeedY = config.moveSpeedY || 2.5;
        /** @type {number} 弾の速度（周回係数で外部から上書き可能） */
        this.bulletSpeed = config.bulletSpeed || 11.0;
        
        /** @type {number} 回避確率 */
        this.evadeProb = config.evadeProb !== undefined ? config.evadeProb : 0.0;
        
        /** @type {THREE.Group} */
        this.mesh = null;
        /** @type {THREE.Group} 振動演出用ビジュアルグループ */
        this.visualGroup = null;
        /** @type {string} 行動状態 ('APPEAR', 'BATTLE', 'DEFEATED') */
        this.state = 'APPEAR';
        
        // 攻撃パターン用タイマー
        this.actionTimer = 0.0;
        this.patternTimer = 0.0;
        this.patternIndex = 0;
        this.fireTimer = 0.0;
        this.fireCount = 0;
        
        // 被弾フラッシュ
        this.flashTimer = 0.0;
        /** @type {THREE.MeshStandardMaterial[]} */
        this.materials = [];
        
        // Stage 3 浮遊クリスタル用
        /** @type {THREE.Mesh[]|null} */
        this.orbitCrystals = null;

        // 必殺技・ビーム用変数
        this.isCharging = false;
        this.isFiringBeam = false;
        this.specialTimer = 0.0;
        this.beamTargetX = 0.0;
        this.beamTargetY = 0.0;
        this.beamCurrentX = 0.0;
        this.beamCurrentY = 0.0;
        this.defeatedTimer = 0.0;

        // ビームメッシュ参照
        this.beamMesh = null;
        this.beamWarningMesh = null;
        this.beamMeshes = [];
        this.beamWarningMeshes = [];

        // 破片飛散演出用の変数
        this.debrisList = [];
        this.debrisTimer = 0.0;
        
        // 回避行動（ダッシュ）用変数
        this.evasionTimer = 0.0;
        this.evasionTargetX = 0.0;
        this.evasionTargetY = 0.0;
        
        this.initMesh();
    }

    /**
     * ステージごとに特徴的な超巨大メカ3Dモデルの構築
     */
    initMesh() {
        this.mesh = new THREE.Group();
        
        // 振動演出をビジュアルだけに適用するためのサブグループ
        this.visualGroup = new THREE.Group();
        this.mesh.add(this.visualGroup);

        // 共通PBRマテリアル（被弾時に発光させる）
        const mat = new THREE.MeshStandardMaterial({
            color: this.color,
            metalness: 0.7,
            roughness: 0.3,
            flatShading: true,
            emissive: 0x000000
        });
        this.materials.push(mat);

        const darkMetalMat = new THREE.MeshStandardMaterial({
            color: 0x1e1e24,
            metalness: 0.8,
            roughness: 0.2,
            flatShading: true
        });
        this.materials.push(darkMetalMat);

        if (this.stageIndex === 0) {
            // --- Stage 1: GREEN TITAN (巨大多面体 ＋ 回転する外周リング) ---
            const bodyGeo = new THREE.IcosahedronGeometry(3.5, 1);
            const body = new THREE.Mesh(bodyGeo, mat);
            this.visualGroup.add(body);

            // 外周を囲むリング
            const ringGeo = new THREE.TorusGeometry(5.0, 0.4, 8, 28);
            ringGeo.rotateX(Math.PI / 2);
            const ring = new THREE.Mesh(ringGeo, mat);
            this.visualGroup.add(ring);
            
            // 砲台ノズル
            const nozzleGeo = new THREE.CylinderGeometry(0.3, 0.4, 1.8, 6);
            nozzleGeo.rotateX(Math.PI / 2);
            const nozzle = new THREE.Mesh(nozzleGeo, darkMetalMat);
            nozzle.position.set(0, -0.5, 3.5);
            this.visualGroup.add(nozzle);
        } 
        else if (this.stageIndex === 1) {
            // --- Stage 2: BLUE LEVIATHAN (巨大巡洋戦艦型) ---
            const bodyGeo = new THREE.BoxGeometry(9.0, 2.2, 5.0);
            const body = new THREE.Mesh(bodyGeo, mat);
            this.visualGroup.add(body);

            // 左右の巨大砲台ポッド
            const podGeo = new THREE.BoxGeometry(2.0, 1.5, 4.0);
            const leftPod = new THREE.Mesh(podGeo, darkMetalMat);
            leftPod.position.set(-5.5, 0, 0.5);
            this.visualGroup.add(leftPod);
            
            const rightPod = new THREE.Mesh(podGeo, darkMetalMat);
            rightPod.position.set(5.5, 0, 0.5);
            this.visualGroup.add(rightPod);

            // 前方突出シールド
            const shieldGeo = new THREE.ConeGeometry(1.5, 3.5, 4);
            shieldGeo.rotateX(Math.PI / 2);
            shieldGeo.scale(3.0, 0.5, 1.0);
            const shield = new THREE.Mesh(shieldGeo, mat);
            shield.position.set(0, 0, 3.8);
            this.visualGroup.add(shield);
        } 
        else {
            // --- Stage 3: VOID OVERLORD (漆黒の要塞コア ＋ 4枚の巨大結晶ブレード羽 ＋ 浮遊衛星) ---
            // 1. 中央のダークコア（高輝度の発光球体）
            const coreGeo = new THREE.SphereGeometry(2.2, 16, 16);
            const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
            const core = new THREE.Mesh(coreGeo, coreMat);
            core.position.set(0, 0, 0);
            this.visualGroup.add(core);

            // 2. コアを取り巻くアウターデビルリング
            const ringGeo = new THREE.TorusGeometry(3.6, 0.4, 8, 24);
            const ring = new THREE.Mesh(ringGeo, mat);
            ring.rotation.x = Math.PI / 4;
            this.visualGroup.add(ring);

            // 3. 4枚の凶悪な巨大結晶ブレード（羽のように上下左右からコアを包む）
            const bladeGeo = new THREE.OctahedronGeometry(3.5);
            bladeGeo.scale(0.3, 2.5, 0.8); // 縦長結晶ブレード
            bladeGeo.translate(0, 5.0, 0);

            this.blades = [];
            for (let i = 0; i < 4; i++) {
                const blade = new THREE.Mesh(bladeGeo, mat);
                blade.rotation.z = (i * Math.PI) / 2;
                blade.rotation.x = 0.25;
                this.visualGroup.add(blade);
                this.blades.push(blade);
            }

            // 4. 浮遊しつつ公転する4個の小型クリスタル衛星
            this.orbitCrystals = [];
            const cryGeo = new THREE.OctahedronGeometry(0.9);
            for (let i = 0; i < 4; i++) {
                const cry = new THREE.Mesh(cryGeo, mat);
                this.visualGroup.add(cry);
                this.orbitCrystals.push(cry);
            }
        }

        // --- 必殺技ビームメッシュの構築 ---
        const beamColor = this.color;
        const beamRadius = this.stageIndex === 0 ? 3.5 : (this.stageIndex === 1 ? 3.0 : 4.8);

        // 警告線のマテリアル
        const warnMat = new THREE.MeshBasicMaterial({
            color: 0xff0000,
            transparent: true,
            opacity: 0.0,
            depthWrite: false
        });
        warnMat.color.multiplyScalar(2.0); // HDR Bloom用

        // ビームのマテリアル
        const beamMat = new THREE.MeshBasicMaterial({
            color: beamColor,
            transparent: true,
            opacity: 0.0,
            depthWrite: false,
            blending: THREE.AdditiveBlending // 重なった時に白く発光するように加算合成を追加
        });
        beamMat.color.multiplyScalar(2.0); // HDR Bloom用

        if (this.stageIndex === 1) {
            // Stage 2: 左右のポッドから並行に2本発射
            this.beamMeshes = [];
            this.beamWarningMeshes = [];

            const bGeo = new THREE.CylinderGeometry(beamRadius, beamRadius, 180.0, 6);
            bGeo.rotateX(Math.PI / 2);
            bGeo.translate(0, 0, 90.0);

            const wGeo = new THREE.CylinderGeometry(0.15, 0.15, 180.0, 4);
            wGeo.rotateX(Math.PI / 2);
            wGeo.translate(0, 0, 90.0);

            // 左側
            const leftBeam = new THREE.Mesh(bGeo, beamMat);
            leftBeam.position.set(-5.5, 0, 1.5);
            this.mesh.add(leftBeam);
            this.beamMeshes.push(leftBeam);

            const leftWarn = new THREE.Mesh(wGeo, warnMat);
            leftWarn.position.set(-5.5, 0, 1.5);
            this.mesh.add(leftWarn);
            this.beamWarningMeshes.push(leftWarn);

            // 右側
            const rightBeam = new THREE.Mesh(bGeo, beamMat.clone());
            rightBeam.position.set(5.5, 0, 1.5);
            this.mesh.add(rightBeam);
            this.beamMeshes.push(rightBeam);

            const rightWarn = new THREE.Mesh(wGeo, warnMat.clone());
            rightWarn.position.set(5.5, 0, 1.5);
            this.mesh.add(rightWarn);
            this.beamWarningMeshes.push(rightWarn);
        } else {
            // Stage 1 & 3: 中央から1本発射
            const beamGeo = new THREE.CylinderGeometry(beamRadius, beamRadius, 180.0, 8);
            beamGeo.rotateX(Math.PI / 2);
            beamGeo.translate(0, 0, 90.0);

            this.beamMesh = new THREE.Mesh(beamGeo, beamMat);
            this.mesh.add(this.beamMesh);

            const wGeo = new THREE.CylinderGeometry(0.15, 0.15, 180.0, 4);
            wGeo.rotateX(Math.PI / 2);
            wGeo.translate(0, 0, 90.0);

            this.beamWarningMesh = new THREE.Mesh(wGeo, warnMat);
            this.mesh.add(this.beamWarningMesh);
        }

        // ボス本体の全メッシュに影設定を適用
        // ビームや警告線など半透明マテリアルを使うメッシュは影投影から除外する
        this.mesh.traverse(child => {
            if (child.isMesh) {
                const mat = child.material;
                const isTransparent = mat && (mat.transparent || mat.opacity < 1.0);
                child.castShadow    = !isTransparent;
                child.receiveShadow = !isTransparent;
            }
        });

        this.mesh.visible = false;
        this.scene.add(this.mesh);
    }

    /**
     * ボス戦出現時の初期化
     * @param {number} x
     * @param {number} y
     * @param {number} z
     */
    init(x, y, z) {
        this.mesh.position.set(x, y, z);
        this.mesh.rotation.set(0, 0, 0);
        this.visualGroup.position.set(0, 0, 0);
        this.visualGroup.scale.set(1, 1, 1);
        this.mesh.scale.set(1, 1, 1);
        
        this.hp = this.maxHp;
        this.state = 'APPEAR';
        this.actionTimer = 0.0;
        this.patternTimer = 0.0;
        this.patternIndex = 0;
        this.fireTimer = 0.8;
        this.fireCount = 0;
        this.flashTimer = 0.0;

        this.spawnZ = z;
        this.appearTimer = 0.0;
        this.targetRoll = 0.0;

        this.isCharging = false;
        this.isFiringBeam = false;
        this.specialTimer = 0.0;
        this.beamTargetX = 0.0;
        this.beamTargetY = 0.0;
        this.beamCurrentX = 0.0;
        this.beamCurrentY = 0.0;
        this.defeatedTimer = 0.0;

        // ビーム非表示化
        this.setBeamVisibility(0.0, 0.0);
        
        this.active = true;
        this.mesh.visible = true;
    }

    /**
     * ビームと警告線の表示制御
     * @param {number} warnOpacity
     * @param {number} beamOpacity
     */
    setBeamVisibility(warnOpacity, beamOpacity) {
        if (this.stageIndex === 1) {
            this.beamWarningMeshes.forEach(m => {
                m.material.opacity = warnOpacity;
                m.visible = warnOpacity > 0;
            });
            this.beamMeshes.forEach(m => {
                m.material.opacity = beamOpacity;
                m.visible = beamOpacity > 0;
            });
        } else {
            if (this.beamWarningMesh) {
                this.beamWarningMesh.material.opacity = warnOpacity;
                this.beamWarningMesh.visible = warnOpacity > 0;
            }
            if (this.beamMesh) {
                this.beamMesh.material.opacity = beamOpacity;
                this.beamMesh.visible = beamOpacity > 0;
            }
        }
    }

    /**
     * ボスの毎フレームの行動更新
     * @param {number} deltaTime
     * @param {THREE.Vector3} playerPos
     * @param {Game} game
     */
    update(deltaTime, playerPos, game) {
        if (!this.active) return;

        this.actionTimer += deltaTime;

        // 被弾フラッシュのフェード
        if (this.flashTimer > 0) {
            this.flashTimer -= deltaTime;
            if (this.flashTimer <= 0) {
                this.materials.forEach(m => m.emissive.setHex(0x000000));
            }
        }

        this._updateAnimations(deltaTime);

        switch (this.state) {
            case 'APPEAR':
                this._updateStateAppear(deltaTime, playerPos);
                break;
            case 'BATTLE':
                this._updateStateBattle(deltaTime, playerPos, game);
                break;
            case 'DEFEATED':
                this._updateStateDefeated(deltaTime, playerPos, game);
                break;
            case 'DEBRIS':
                this._updateStateDebris(deltaTime, playerPos);
                break;
        }
    }

    _updateAnimations(deltaTime) {
        // ビジュアル固有アニメーション
        if (this.stageIndex === 0) {
            // リングを傾けながら回転
            if (this.visualGroup.children[1]) {
                this.visualGroup.children[1].rotation.y = this.actionTimer * 1.2;
                this.visualGroup.children[1].rotation.z = this.actionTimer * 0.4;
            }
        } 
        else if (this.stageIndex === 2) {
            // 4個の浮遊クリスタルを周囲で回す
            if (this.orbitCrystals) {
                this.orbitCrystals.forEach((cry, idx) => {
                    const angle = this.actionTimer * 1.8 + (idx * Math.PI / 2);
                    cry.position.set(
                        Math.cos(angle) * 7.5,
                        Math.sin(angle * 0.5) * 2.0,
                        Math.sin(angle) * 7.5
                    );
                    cry.rotation.x += deltaTime * 2.0;
                    cry.rotation.y += deltaTime * 1.5;
                });
            }

            // 巨大結晶ブレード羽の手裏剣スピン回転演出
            if (this.blades) {
                let targetSpinSpeed = 0.5; // 通常時
                if (this.state === 'DEFEATED') {
                    targetSpinSpeed = 0.08; // 撃破後はゆっくり惰性回転
                    if (this.game && this.game.renderer) {
                        this.game.renderer.setChromaticAberration(0.7);
                        this.game.renderer.setDistortion(0.4);
                    }
                } else if (this.isFiringBeam) {
                    targetSpinSpeed = 8.0; // ビーム発射中は超高速スピン
                    if (this.game && this.game.renderer) {
                        this.game.renderer.setChromaticAberration(0.5);
                        this.game.renderer.setDistortion(0.6);
                    }
                } else if (this.isCharging) {
                    targetSpinSpeed = 3.0; // チャージ中は高速スピン
                    if (this.game && this.game.renderer) {
                        this.game.renderer.setChromaticAberration(0.3);
                        this.game.renderer.setDistortion(0.2);
                    }
                } else {
                    if (this.game && this.game.renderer) {
                        this.game.renderer.setChromaticAberration(0.0);
                        this.game.renderer.setDistortion(0.0);
                    }
                }

                this.currentSpinSpeed = THREE.MathUtils.lerp(this.currentSpinSpeed || 0.5, targetSpinSpeed, 3.0 * deltaTime);
                this.bladeSpin = (this.bladeSpin || 0.0) + this.currentSpinSpeed * deltaTime;

                // 呼吸スイング（羽ばたき）
                const swingAngle = Math.sin(this.actionTimer * 1.5) * 0.32;

                this.blades.forEach((blade, idx) => {
                    blade.rotation.x = 0.25 + swingAngle;
                    blade.rotation.z = (idx * Math.PI) / 2 + this.bladeSpin;
                });
            }
        }
    }

    _updateStateAppear(deltaTime, playerPos) {
        this.appearTimer += deltaTime;
        const duration = 4.5;
        const ratio = Math.min(1.0, this.appearTimer / duration);
        // Smoothstep
        const t = ratio * ratio * (3.0 - 2.0 * ratio);

        const targetZ = playerPos.z - 75.0;
        const targetY = GameConfig.player.limitYMin + 4.5;
        const targetX = 0;

        this.mesh.position.z = this.spawnZ + (targetZ - this.spawnZ) * t;
        this.mesh.position.y += (targetY - this.mesh.position.y) * 1.5 * deltaTime;
        this.mesh.position.x += (targetX - this.mesh.position.x) * 1.5 * deltaTime;

        if (ratio >= 1.0 || Math.abs(this.mesh.position.z - targetZ) < 1.0) {
            this.state = 'BATTLE';
            this.patternTimer = 0.0;
            this.fireTimer = 0.3;
        }
    }

    _updateStateBattle(deltaTime, playerPos, game) {
        // Zはプレイヤーと等速スクロール同期しつつ、サイン波でゆっくり揺れる
        const zSway = Math.sin(this.actionTimer * 0.8) * 22.0;
        this.mesh.position.z = playerPos.z - 75.0 + zSway;

        if (this.patternIndex === 3) {
            this._updateSpecialAttack(deltaTime, playerPos);
        } else {
            this._updateNormalMovement(deltaTime, playerPos, game);
        }
    }

    _updateSpecialAttack(deltaTime, playerPos) {
        this.specialTimer += deltaTime;

        // ボス本体の位置を微調整してプレイヤーに追従
        if (this.specialTimer > 0.0 && this.specialTimer < 3.8) {
            this.beamCurrentX += (playerPos.x - this.beamCurrentX) * 3.5 * deltaTime;
            this.beamCurrentY += (playerPos.y - this.beamCurrentY) * 3.5 * deltaTime;
            this.beamTargetX += (playerPos.x - this.beamTargetX) * 1.5 * deltaTime;
            this.beamTargetY += (playerPos.y - this.beamTargetY) * 1.5 * deltaTime;
        }

        let targetX = this.beamCurrentX;
        let targetY = this.beamCurrentY;

        if (this.specialTimer < 1.8) {
            this.isCharging = true;
            this.isFiringBeam = false;

            if (this.specialTimer - deltaTime <= 0) {
                if (window.audioManager) audioManager.play('bossBeamLockOn');
                this.beamTargetX = playerPos.x;
                this.beamTargetY = playerPos.y;
                this.beamCurrentX = this.mesh.position.x;
                this.beamCurrentY = this.mesh.position.y;

                if (this.stageIndex === 1) {
                    const rolls = [0, Math.PI / 2, Math.PI / 4, -Math.PI / 4];
                    this.targetRoll = rolls[Math.floor(Math.random() * rolls.length)];
                }
            }

            if (this.stageIndex === 1) {
                this.mesh.rotation.z = THREE.MathUtils.lerp(this.mesh.rotation.z, this.targetRoll, 4.0 * deltaTime);
            }

            const vib = 0.35;
            this.visualGroup.position.set((Math.random() - 0.5) * vib, (Math.random() - 0.5) * vib, 0.0);

            const ratio = this.specialTimer / 1.8;
            const hexColor = Math.floor(ratio * 255) << 16;
            this.materials.forEach(m => m.emissive.setHex(hexColor));

            this.setBeamVisibility(0.2 + ratio * 0.6, 0.0);
            this.orientBeam(this.beamTargetX, this.beamTargetY);

        } else if (this.specialTimer < 3.8) {
            this.isCharging = false;

            if (!this.isFiringBeam && window.audioManager) {
                const beamSounds = ['bossBeamSingle', 'bossBeamDual', 'bossBeamHeavy'];
                audioManager.play(beamSounds[this.stageIndex] || 'bossBeamSingle');
            }
            this.isFiringBeam = true;

            if (this.stageIndex === 1) {
                this.mesh.rotation.z = THREE.MathUtils.lerp(this.mesh.rotation.z, this.targetRoll, 4.0 * deltaTime);
            }

            const vib = 0.45;
            this.visualGroup.position.set((Math.random() - 0.5) * vib, (Math.random() - 0.5) * vib, 0.0);

            this.setBeamVisibility(0.0, 0.85);
            this.orientBeam(this.beamTargetX, this.beamTargetY);

        } else if (this.specialTimer < 5.0) {
            this.isFiringBeam = false;
            this.setBeamVisibility(0.0, 0.0);
            this.visualGroup.position.set(0, 0, 0);

            if (this.stageIndex === 1) {
                this.mesh.rotation.z = THREE.MathUtils.lerp(this.mesh.rotation.z, 0.0, 2.0 * deltaTime);
            }

            const ratio = (5.0 - this.specialTimer) / 1.2;
            const hexColor = Math.floor(ratio * 255) << 16;
            this.materials.forEach(m => m.emissive.setHex(hexColor));
        } else {
            this.specialTimer = 0.0;
            this.patternIndex = 0;
            this.patternTimer = 0.0;
            this.fireTimer = 0.2;
            this.materials.forEach(m => m.emissive.setHex(0x000000));
            if (this.stageIndex === 1) {
                this.mesh.rotation.z = 0.0;
            }
        }
        
        // Apply position
        this.mesh.position.x = targetX;
        this.mesh.position.y = targetY;
    }

    _updateNormalMovement(deltaTime, playerPos, game) {
        let targetX = playerPos.x;
        let targetY = playerPos.y + 1.0;

        if (this.stageIndex === 0) {
            targetX += Math.sin(this.actionTimer * 1.5) * 8.0;
            targetY += Math.cos(this.actionTimer * 1.8) * 1.8;
        } else if (this.stageIndex === 1) {
            targetX += Math.sin(this.actionTimer * 1.0) * 12.0;
            targetY += Math.sin(this.actionTimer * 2.0) * 3.0;
            const bankAngle = -Math.cos(this.actionTimer * 1.0) * 0.5;
            this.mesh.rotation.z = THREE.MathUtils.lerp(this.mesh.rotation.z, bankAngle, 3.0 * deltaTime);
        } else {
            targetX += Math.sin(this.actionTimer * 2.5) * 10.0;
            targetY += Math.cos(this.actionTimer * 3.0) * 4.0;
        }

        if (this.evasionTimer > 0) {
            this.evasionTimer -= deltaTime;
            targetX = this.evasionTargetX;
            targetY = this.evasionTargetY;
        }

        const stage = game.stageManager ? game.stageManager.getCurrentStage() : null;
        const bounds = getCaveBoundsAt(this.mesh.position.z, stage, game.bossActiveRatio);
        
        const marginX = this.hitRadius + 2.5;
        const marginY = this.hitRadius + 1.5;
        const clampXMin = bounds.left + marginX;
        const clampXMax = bounds.right - marginX;
        const clampYMin = bounds.bottom + marginY;
        const clampYMax = bounds.top - marginY;

        const finalTargetX = Math.max(clampXMin, Math.min(clampXMax, targetX));
        const finalTargetY = Math.max(clampYMin, Math.min(clampYMax, targetY));

        if (this.evasionTimer > 0) {
            this.mesh.position.x += (finalTargetX - this.mesh.position.x) * 6.0 * deltaTime;
            this.mesh.position.y += (finalTargetY - this.mesh.position.y) * 6.0 * deltaTime;
        } else {
            this.mesh.position.x += (finalTargetX - this.mesh.position.x) * this.moveSpeedX * 0.4 * deltaTime;
            this.mesh.position.y += (finalTargetY - this.mesh.position.y) * this.moveSpeedY * 0.4 * deltaTime;
        }

        this.patternTimer += deltaTime;
        if (this.patternTimer >= 4.8) {
            this.patternTimer = 0.0;
            this.patternIndex = (this.patternIndex + 1) % 4;
            this.fireTimer = 0.2;
            this.fireCount = 0;
        }

        this.fireTimer -= deltaTime;
        if (this.fireTimer <= 0) {
            this.executeAttackPattern(playerPos, game);
        }
    }

    _updateStateDefeated(deltaTime, playerPos, game) {
        this.mesh.position.z = playerPos.z - 75.0;
        this.defeatedTimer += deltaTime;

        const ratio = Math.min(1.0, this.defeatedTimer / 3.0);
        const colorVal = Math.floor(ratio * 255);
        const whiteHex = (colorVal << 16) | (colorVal << 8) | colorVal;
        this.materials.forEach(m => m.emissive.setHex(whiteHex));

        const shake = ratio * 1.5;
        this.visualGroup.position.set(
            (Math.random() - 0.5) * shake,
            (Math.random() - 0.5) * shake,
            (Math.random() - 0.5) * shake
        );

        if (this.defeatedTimer - (this.lastMiniExplosionTime || 0.0) > 0.25) {
            this.lastMiniExplosionTime = this.defeatedTimer;
            const ox = (Math.random() - 0.5) * 6.0;
            const oy = (Math.random() - 0.5) * 4.0;
            const oz = (Math.random() - 0.5) * 3.0;
            game.effectManager.spawnExplosion(
                this.mesh.position.x + ox,
                this.mesh.position.y + oy,
                this.mesh.position.z + oz,
                0xff7700, 12, false
            );
        }

        if (this.defeatedTimer >= 3.0) {
            game.effectManager.spawnExplosion(this.mesh.position.x, this.mesh.position.y, this.mesh.position.z, 0xffffff, 250, false);
            const finalExpColor = (this.stageIndex === 2) ? 0xff5500 : this.color;
            game.effectManager.spawnExplosion(this.mesh.position.x, this.mesh.position.y, this.mesh.position.z, finalExpColor, 180, false);
            
            if (game.cameraController && typeof game.cameraController.shake === 'function') {
                game.cameraController.shake(2.2, 1.5);
            }
            this.startDebrisDispersal();
            game.scrollSpeed = GameConfig.game.scrollSpeed;
        }
    }

    _updateStateDebris(deltaTime, playerPos) {
        this.mesh.position.z = playerPos.z - 75.0;
        this.debrisTimer += deltaTime;

        this.debrisList.forEach(d => {
            d.mesh.position.addScaledVector(d.velocity, deltaTime);
            d.mesh.rotation.x += d.angularVelocity.x * deltaTime;
            d.mesh.rotation.y += d.angularVelocity.y * deltaTime;
            d.mesh.rotation.z += d.angularVelocity.z * deltaTime;
            
            d.velocity.y -= 9.8 * 0.3 * deltaTime;
            d.velocity.multiplyScalar(0.98);

            const lifeRatio = Math.max(0, 1.0 - this.debrisTimer / 2.0);
            d.mesh.scale.set(
                d.initialScale.x * lifeRatio,
                d.initialScale.y * lifeRatio,
                d.initialScale.z * lifeRatio
            );

            if (d.mesh.material) {
                d.mesh.material.transparent = true;
                d.mesh.material.opacity = lifeRatio;
            }
        });

        if (Math.random() < 0.20 && this.debrisList.length > 0) {
            const rd = this.debrisList[Math.floor(Math.random() * this.debrisList.length)];
            if (rd) {
                const wp = new THREE.Vector3();
                rd.mesh.getWorldPosition(wp);
                window.game.effectManager.spawnExplosion(wp.x, wp.y, wp.z, 0xffaa00, 6, false);
            }
        }

        if (this.debrisTimer >= 2.0) {
            this.deactivate();
        }
    }

    orientBeam(targetX, targetY) {
        const localTarget = new THREE.Vector3(targetX - this.mesh.position.x, targetY - this.mesh.position.y, 75.0);
        const direction = localTarget.clone().normalize();
        const defaultZ = new THREE.Vector3(0, 0, 1);

        if (this.stageIndex === 1) {
            this.beamWarningMeshes.forEach(m => {
                m.quaternion.setFromUnitVectors(defaultZ, direction);
            });
            this.beamMeshes.forEach(m => {
                m.quaternion.setFromUnitVectors(defaultZ, direction);
            });
        } else {
            if (this.beamWarningMesh) {
                this.beamWarningMesh.quaternion.setFromUnitVectors(defaultZ, direction);
            }
            if (this.beamMesh) {
                this.beamMesh.quaternion.setFromUnitVectors(defaultZ, direction);
            }
        }
    }

    /**
     * 通常攻撃パターンの実行
     * @param {THREE.Vector3} playerPos
     * @param {Game} game
     */
    executeAttackPattern(playerPos, game) {
        if (window.audioManager) audioManager.play('bossShoot');

        const firePos = this.mesh.position.clone();
        firePos.z += 3.5;

        const config = GameConfig.bosses.types[this.stageIndex];
        const baseBulletSpeed = this.bulletSpeed;
        const intervalScale = config.fireIntervalScale || 1.0;

        if (this.stageIndex === 0) {
            this._executePatternStage1(firePos, playerPos, baseBulletSpeed, intervalScale, game);
        } else if (this.stageIndex === 1) {
            this._executePatternStage2(firePos, playerPos, baseBulletSpeed, intervalScale, game);
        } else {
            this._executePatternStage3(firePos, playerPos, baseBulletSpeed, intervalScale, game);
        }
    }

    _executePatternStage1(firePos, playerPos, baseBulletSpeed, intervalScale, game) {
        if (this.patternIndex === 0) {
            const count = 5;
            const spreadAngle = 0.55;
            for (let i = 0; i < count; i++) {
                const ratio = count > 1 ? i / (count - 1) : 0.5;
                const angle = (ratio - 0.5) * spreadAngle;
                game.spawnEnemyBullet(firePos.x, firePos.y, firePos.z, Math.sin(angle), 0, Math.cos(angle), baseBulletSpeed);
            }
            this.fireTimer = 1.2 * intervalScale;
        } else if (this.patternIndex === 1) {
            const count = 4;
            const rotSpeed = 3.8;
            const angleOffset = this.actionTimer * rotSpeed;
            for (let i = 0; i < count; i++) {
                const angle = angleOffset + (i * Math.PI * 2 / count);
                const dir = new THREE.Vector3(Math.sin(angle) * 0.75, Math.cos(angle) * 0.75, 1.0).normalize();
                game.spawnEnemyBullet(firePos.x, firePos.y, firePos.z, dir.x, dir.y, dir.z, baseBulletSpeed);
            }
            this.fireTimer = 0.18 * intervalScale;
        } else if (this.patternIndex === 2) {
            const dir = playerPos.clone().sub(firePos).normalize();
            dir.x += (Math.random() - 0.5) * 0.05;
            dir.y += (Math.random() - 0.5) * 0.05;
            dir.normalize();
            game.spawnEnemyBullet(firePos.x, firePos.y, firePos.z, dir.x, dir.y, dir.z, baseBulletSpeed * 1.25);
            
            this.fireCount++;
            if (this.fireCount >= 3) {
                this.fireCount = 0;
                this.fireTimer = 1.3 * intervalScale;
            } else {
                this.fireTimer = 0.15;
            }
        }
    }

    _executePatternStage2(firePos, playerPos, baseBulletSpeed, intervalScale, game) {
        if (this.patternIndex === 0) {
            const leftFire = new THREE.Vector3(-5.5, 0, 1.5).applyMatrix4(this.mesh.matrixWorld);
            const rightFire = new THREE.Vector3(5.5, 0, 1.5).applyMatrix4(this.mesh.matrixWorld);
            game.spawnEnemyBullet(leftFire.x, leftFire.y, leftFire.z, 0, 0, 1.0, baseBulletSpeed);
            game.spawnEnemyBullet(rightFire.x, rightFire.y, rightFire.z, 0, 0, 1.0, baseBulletSpeed);
            
            this.fireCount++;
            if (this.fireCount >= 6) {
                this.fireCount = 0;
                this.fireTimer = 0.9 * intervalScale;
            } else {
                this.fireTimer = 0.14;
            }
        } else if (this.patternIndex === 1) {
            const toPlayer = playerPos.clone().sub(firePos).normalize();
            const rightVec = new THREE.Vector3(0, 1, 0).cross(toPlayer).normalize().multiplyScalar(0.12);
            const dir1 = toPlayer.clone().add(rightVec).normalize();
            const dir2 = toPlayer.clone().sub(rightVec).normalize();
            game.spawnEnemyBullet(firePos.x, firePos.y, firePos.z, dir1.x, dir1.y, dir1.z, baseBulletSpeed * 0.95);
            game.spawnEnemyBullet(firePos.x, firePos.y, firePos.z, dir2.x, dir2.y, dir2.z, baseBulletSpeed * 0.95);
            this.fireTimer = 0.7 * intervalScale;
        } else if (this.patternIndex === 2) {
            const count = 7;
            const spreadAngle = 0.75;
            for (let i = 0; i < count; i++) {
                const ratio = count > 1 ? i / (count - 1) : 0.5;
                const angle = (ratio - 0.5) * spreadAngle;
                game.spawnEnemyBullet(firePos.x, firePos.y, firePos.z, Math.sin(angle), 0, Math.cos(angle), baseBulletSpeed);
            }
            this.fireTimer = 1.2 * intervalScale;
        }
    }

    _executePatternStage3(firePos, playerPos, baseBulletSpeed, intervalScale, game) {
        if (this.patternIndex === 0) {
            if (this.orbitCrystals) {
                this.orbitCrystals.forEach(cry => {
                    const cryPos = new THREE.Vector3().setFromMatrixPosition(cry.matrixWorld);
                    const dir = playerPos.clone().sub(cryPos).normalize();
                    game.spawnEnemyBullet(cryPos.x, cryPos.y, cryPos.z, dir.x, dir.y, dir.z, baseBulletSpeed * 0.95);
                });
            }
            this.fireTimer = 1.0 * intervalScale;
        } else if (this.patternIndex === 1) {
            const count = 6;
            const rotSpeed = -4.5;
            const angleOffset = this.actionTimer * rotSpeed;
            for (let i = 0; i < count; i++) {
                const angle = angleOffset + (i * Math.PI * 2 / count);
                const dir = new THREE.Vector3(Math.sin(angle) * 0.8, Math.cos(angle) * 0.8, 1.0).normalize();
                game.spawnEnemyBullet(firePos.x, firePos.y, firePos.z, dir.x, dir.y, dir.z, baseBulletSpeed);
            }
            this.fireTimer = 0.13 * intervalScale;
        } else if (this.patternIndex === 2) {
            const count = 10;
            for (let i = 0; i < count; i++) {
                const angle = (i / count) * Math.PI * 2;
                const dir = new THREE.Vector3(Math.sin(angle) * 0.7, Math.cos(angle) * 0.7, 0.7).normalize();
                game.spawnEnemyBullet(firePos.x, firePos.y, firePos.z, dir.x, dir.y, dir.z, baseBulletSpeed * 0.85);
            }
            this.fireTimer = 0.95 * intervalScale;
        }
    }

    damage(amount) {
        if (!this.active || this.state === 'DEFEATED') return false;

        this.hp -= amount;

        // 全マテリアルを明るい赤に発光させて被弾フラッシュ
        this.materials.forEach(m => {
            m.emissive.setHex(0xff3333);
        });
        this.flashTimer = 0.10;

        if (this.hp <= 0) {
            this.state = 'DEFEATED';
            this.defeatedTimer = 0.0;
            this.lastMiniExplosionTime = 0.0;
            this.isCharging = false;
            this.isFiringBeam = false;
            this.setBeamVisibility(0.0, 0.0);
            return true;
        }
        
        // 撃破されていない場合、指定された確率でランダムな方向へダッシュで回避（1.0秒間）
        // 必殺技（ビーム）発射中以外で発動
        if (this.state === 'BATTLE' && this.patternIndex !== 3 && Math.random() < this.evadeProb) {
            this.evasionTimer = 1.0;
            const angle = Math.random() * Math.PI * 2;
            const distance = 8.0 + Math.random() * 4.0;
            this.evasionTargetX = this.mesh.position.x + Math.cos(angle) * distance;
            this.evasionTargetY = this.mesh.position.y + Math.sin(angle) * distance;
        }
        
        return false;
    }

    /**
     * ボス撃破時に各パーツをバラバラに吹き飛ばす演出を開始する
     */
    startDebrisDispersal() {
        this.state = 'DEBRIS';
        this.debrisTimer = 0.0;
        this.debrisList = [];

        // visualGroup内のすべての子オブジェクト（メッシュ）を収集
        const meshes = [];
        this.visualGroup.traverse(child => {
            if (child.isMesh && child !== this.beamMesh && child !== this.beamWarningMesh && !this.beamMeshes.includes(child) && !this.beamWarningMeshes.includes(child)) {
                meshes.push(child);
            }
        });

        // すべてのメッシュを破片リストに登録
        meshes.forEach(m => {
            // 初期スケールを保存
            const initialScale = m.scale.clone();
            
            // パーツが外に向かって吹き飛ぶ速度ベクトルを決定
            const dir = m.position.clone();
            if (dir.lengthSq() < 0.01) {
                dir.set(
                    (Math.random() - 0.5) * 2.0,
                    (Math.random() - 0.5) * 2.0,
                    (Math.random() - 0.5) * 2.0
                );
            }
            dir.normalize();

            // 吹き飛ぶスピード（ランダム性）
            const speed = 10.0 + Math.random() * 15.0;
            const velocity = dir.multiplyScalar(speed);
            // Y軸（上方向）に少し浮き上がる力
            velocity.y += 3.0 + Math.random() * 5.0;
            // Z軸方向にも少し前後に散らばるように
            velocity.z += (Math.random() - 0.5) * 8.0;

            // 回転速度
            const angularVelocity = new THREE.Vector3(
                (Math.random() - 0.5) * 10.0,
                (Math.random() - 0.5) * 10.0,
                (Math.random() - 0.5) * 10.0
            );

            // マテリアルをクローンして個別マテリアル化し、破片ごとに透明度を制御できるようにする
            if (m.material) {
                m.material = m.material.clone();
            }

            this.debrisList.push({
                mesh: m,
                velocity: velocity,
                angularVelocity: angularVelocity,
                initialScale: initialScale
            });
        });

        // ビーム関連のメッシュは即座に非表示
        if (this.beamMesh) this.beamMesh.visible = false;
        if (this.beamWarningMesh) this.beamWarningMesh.visible = false;
        this.beamMeshes.forEach(bm => bm.visible = false);
        this.beamWarningMeshes.forEach(bwm => bwm.visible = false);
    }

    /**
     * 非活性化
     */
    deactivate() {
        this.active = false;
        this.mesh.visible = false;
    }

    /**
     * 破棄
     */
    destroy() {
        this.setBeamVisibility(0.0, 0.0);
        if (this.mesh) {
            this.scene.remove(this.mesh);
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
        this.visualGroup = null;
        this.materials = [];
        this.orbitCrystals = null;
        this.beamMesh = null;
        this.beamWarningMesh = null;
        this.beamMeshes = [];
        this.beamWarningMeshes = [];
    }
}