/**
 * @fileoverview enemy.js
 * 敵クラス。種類 (A〜F) ごとに異なる 3Dモデル生成・移動パターン・攻撃パターンを管理する。
 */

// GC対策用一時変数
const _enemyTempFirePos = new THREE.Vector3();
const _enemyTempDir = new THREE.Vector3();

/**
 * 敵機クラス（基底クラス）
 * すべての敵機の基本ステータス、モデル初期化、被弾処理、クリーンアップを担当。
 */
class Enemy {
    /**
     * @param {THREE.Scene} scene - シーンオブジェクト
     * @param {string} type - 敵のタイプ ('A', 'B', 'C', 'D')
     */
    constructor(scene, type) {
        /** @type {THREE.Scene} */
        this.scene = scene;
        /** @type {string} */
        this.type = type;
        
        /** @type {THREE.Group} 敵のメッシュグループ */
        this.mesh = null;
        
        /** @type {boolean} アクティブ状態か */
        this.active = false;
        
        // 設定オブジェクトからパラメータを取得
        const enemiesConfig = GameConfig.enemies;
        const config = enemiesConfig.types[type];
        const scale = enemiesConfig.scale || 1.0;
        this.scale = scale;
        
        /** @type {string} */
        this.name = config.name;
        /** @type {number} */
        this.maxHp = config.hp;
        /** @type {number} */
        this.hp = this.maxHp;
        /** @type {number} */
        this.score = config.score;
        /** @type {number} */
        this.speed = config.speed;
        /** @type {number} 当たり判定半径 */
        this.hitRadius = config.hitRadius * scale;
        /** @type {number} カラーコード */
        this.color = config.color;

        // 個別行動用タイマー等
        this.actionTimer = 0.0;
        this.fireTimer = 0.0;
        
        // 行動制御フラグ（Dタイプ用など）
        this.state = 'APPROACH'; // 'APPROACH', 'STAY_AND_SHOOT', 'RETREAT'
        this.stayTimer = 0.0;

        // 被弾フラッシュ用タイマー
        this.flashTimer = 0.0;

        this.initMesh();
    }

    /**
     * 敵機モデルの構築（タイプ別にカクカクしたSFデザインを作成）
     */
    initMesh() {
        this.mesh = new THREE.Group();

        // 敵共通のPBRマテリアル
        const mat = new THREE.MeshStandardMaterial({
            color: this.color,
            metalness: 0.6, // 暗くなりすぎないように元の値に戻す
            roughness: 0.15, // クールな強い光沢を出す
            flatShading: true // カクカク感は維持
        });

        const darkMetalMat = new THREE.MeshStandardMaterial({
            color: 0x222228,
            metalness: 0.7, // 0.9から0.7に下げて暗さを軽減
            roughness: 0.1, // 強い光沢
            flatShading: true
        });

        switch (this.type) {
            case 'A': // Straight (鋭い赤色の三角錐戦闘機)
                {
                    const geo = new THREE.ConeGeometry(0.45, 1.8, 12);
                    // -Math.PI/2だと底面が向いていたため、Math.PI/2で鋭い頂点を手前(進行方向)に向ける
                    // さらに真正面からでも背面の立体感が見えるよう、機首を少し下げる(+0.25)
                    geo.rotateX(Math.PI / 2 + 0.25); 
                    const body = new THREE.Mesh(geo, mat);
                    this.mesh.add(body);
                    
                    // 左右のウイング (機体に合わせてピッチを傾け、斜めの角度をつける)
                    const wingGeo = new THREE.BoxGeometry(0.7, 0.04, 0.4);
                    
                    const leftWing = new THREE.Mesh(wingGeo, mat);
                    leftWing.position.set(-0.3, 0.05, -0.2);
                    leftWing.rotation.x = 0.25; // 胴体と同じピッチ
                    leftWing.rotation.y = -0.3; // 後退翼
                    leftWing.rotation.z = -0.2; // 翼を下反角気味にして立体感を出す
                    this.mesh.add(leftWing);

                    const rightWing = new THREE.Mesh(wingGeo, mat);
                    rightWing.position.set(0.3, 0.05, -0.2);
                    rightWing.rotation.x = 0.25;
                    rightWing.rotation.y = 0.3;
                    rightWing.rotation.z = 0.2;
                    this.mesh.add(rightWing);
                }
                break;

            case 'B': // Zigzag (ネオンオレンジのダイヤ型多面体)
                {
                    const geo = new THREE.IcosahedronGeometry(0.55, 2); // detail 1 -> 2
                    geo.scale(1.2, 0.35, 1.2); // 横に扁平化
                    const body = new THREE.Mesh(geo, mat);
                    this.mesh.add(body);
                    
                    // 背部フィン
                    const finGeo = new THREE.BoxGeometry(0.04, 0.4, 0.3);
                    const fin = new THREE.Mesh(finGeo, mat);
                    fin.position.set(0, 0.25, 0);
                    this.mesh.add(fin);
                }
                break;

            case 'C': // Charger (非常に鋭く細長いライトオレンジの突撃機)
                {
                    const geo = new THREE.ConeGeometry(0.35, 2.0, 16);
                    // 頂点を手前に向け、立体感を出すためピッチを少し傾ける
                    geo.rotateX(Math.PI / 2 + 0.15);
                    geo.scale(1.0, 0.6, 1.3); // Y軸スケールを0.3 -> 0.6に増やし、ペラペラ感を解消して厚みを持たせる
                    const body = new THREE.Mesh(geo, mat);
                    this.mesh.add(body);
                    
                    // 前進した鋭い両翼
                    const leftWingGeo = new THREE.BoxGeometry(1.4, 0.04, 0.4);
                    leftWingGeo.translate(-0.7, 0, 0); // 原点を右端（付け根）に移動して回転軸を合わせる
                    const leftWing = new THREE.Mesh(leftWingGeo, mat);
                    leftWing.position.set(0, 0.05, -0.2); // 付け根を本体内部に配置
                    leftWing.rotation.x = 0.15; // 胴体と同じピッチ
                    leftWing.rotation.y = -Math.PI / 6; // 前進翼
                    leftWing.rotation.z = Math.PI / 10; // 下反角で立体感を強調
                    this.mesh.add(leftWing);
                    
                    const rightWingGeo = new THREE.BoxGeometry(1.4, 0.04, 0.4);
                    rightWingGeo.translate(0.7, 0, 0); // 原点を左端（付け根）に移動して回転軸を合わせる
                    const rightWing = new THREE.Mesh(rightWingGeo, mat);
                    rightWing.position.set(0, 0.05, -0.2); // 付け根を本体内部に配置
                    rightWing.rotation.x = 0.15;
                    rightWing.rotation.y = Math.PI / 6;
                    rightWing.rotation.z = -Math.PI / 10;
                    this.mesh.add(rightWing);
                }
                break;

            case 'D': // Shooter (重厚なマゼンタの多面体砲台)
                {
                    // 重厚な多角胴体
                    const geo = new THREE.CylinderGeometry(0.45, 0.6, 1.2, 24); // 12 -> 24
                    geo.rotateX(Math.PI / 2);
                    const body = new THREE.Mesh(geo, mat);
                    this.mesh.add(body);
                    
                    // 砲身
                    const gunGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.8, 12); // 8 -> 12
                    gunGeo.rotateX(Math.PI / 2);
                    const gun = new THREE.Mesh(gunGeo, darkMetalMat);
                    gun.position.set(0, -0.15, 0.6); // 前方にせり出す
                    this.mesh.add(gun);
                    
                    // 左右の大型安定フィン
                    const finGeo = new THREE.BoxGeometry(1.6, 0.06, 0.5);
                    const fin = new THREE.Mesh(finGeo, mat);
                    fin.position.set(0, -0.1, 0);
                    this.mesh.add(fin);
                }
                break;

            case 'E': // Sniper (長距離スナイパー: シールド付きネオングリーンの狙撃機)
                {
                    // 細長い本体
                    const geo = new THREE.CylinderGeometry(0.15, 0.35, 1.8, 16); // 10 -> 16
                    geo.rotateX(Math.PI / 2); // -Math.PI/2 から Math.PI/2 に修正（手前が細い形状になる）
                    const body = new THREE.Mesh(geo, mat);
                    this.mesh.add(body);
                    
                    // 左右の薄いシールドプレート
                    const shieldGeo = new THREE.BoxGeometry(0.06, 1.0, 0.8);
                    
                    const leftShield = new THREE.Mesh(shieldGeo, darkMetalMat);
                    leftShield.position.set(-0.55, 0, 0.2);
                    leftShield.rotation.y = Math.PI / 12; // 少しハの字に傾ける
                    this.mesh.add(leftShield);
                    
                    const rightShield = new THREE.Mesh(shieldGeo, darkMetalMat);
                    rightShield.position.set(0.55, 0, 0.2);
                    rightShield.rotation.y = -Math.PI / 12;
                    this.mesh.add(rightShield);
                    
                    // 長い砲身
                    const barrelGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.2, 12); // 8 -> 12
                    barrelGeo.rotateX(Math.PI / 2); // 砲身も手前を向くように修正
                    const barrel = new THREE.Mesh(barrelGeo, darkMetalMat);
                    barrel.position.set(0, 0, 0.8); // 前方に長く伸ばす
                    this.mesh.add(barrel);
                }
                break;

            case 'F': // Helix (螺旋突撃機: ネオンシアンのUFO型高速回転機 - 円盤水平・コーン上下)
                {
                    // 中央のドーナツリング (UFOの円盤部分: 水平)
                    const ringGeo = new THREE.TorusGeometry(1.2, 0.35, 16, 48); // 12, 32 -> 16, 48
                    ringGeo.rotateX(Math.PI / 2); // 水平にする
                    const ring = new THREE.Mesh(ringGeo, mat);
                    this.mesh.add(ring);
                    
                    // 上下の円錐 (UFOのドーム部分: 垂直)
                    const topConeGeo = new THREE.ConeGeometry(0.8, 1.6, 16); // 12 -> 16
                    const topCone = new THREE.Mesh(topConeGeo, darkMetalMat);
                    topCone.position.set(0, 0.6, 0);
                    this.mesh.add(topCone);
                    
                    const bottomConeGeo = new THREE.ConeGeometry(0.8, 1.6, 16); // 12 -> 16
                    bottomConeGeo.rotateX(Math.PI); // 真下に向ける
                    const bottomCone = new THREE.Mesh(bottomConeGeo, darkMetalMat);
                    bottomCone.position.set(0, -0.6, 0);
                    this.mesh.add(bottomCone);
                }
                break;
        }

        // 影を落とす・受ける設定を有効化
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        this.mesh.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });

        // スケールをメッシュ全体に適用
        this.mesh.scale.set(this.scale, this.scale, this.scale);

        this.mesh.visible = false;
        this.scene.add(this.mesh);
    }

    /**
     * オブジェクトプールから再利用される際の設定
     * @param {number} x
     * @param {number} y
     * @param {number} z
     */
    init(x, y, z) {
        this.mesh.position.set(x, y, z);
        // 出現時は進行方向（Zプラス＝手前）へ向け、ピッチやロールはリセット
        this.mesh.rotation.set(0, 0, 0);
        
        this.hp = this.maxHp;
        this.actionTimer = 0.0;
        this.fireTimer = 0.0;
        this.state = 'APPROACH';
        this.stayTimer = 0.0;
        
        this.flashTimer = 0.0;
        this.setEmissiveColor(0x000000);
        
        this.mesh.visible = true;
        this.active = true;
    }

    /**
     * 毎フレームの行動処理
     * @param {number} deltaTime - 経過時間 (秒)
     * @param {Player} player - プレイヤーインスタンス
     * @param {Game} game - ゲームインスタンス
     */
    update(deltaTime, player, game) {
        // プレイヤー破棄と同じフレームに更新される場合があるため、防御的に終了する。
        if (!this.active || !this.mesh || !player || !player.mesh) return;

        // 被弾フラッシュのフェードアウト更新
        if (this.flashTimer > 0) {
            this.flashTimer -= deltaTime;
            if (this.flashTimer <= 0) {
                this.setEmissiveColor(0x000000);
            } else {
                const ratio = this.flashTimer / 0.08;
                const hexColor = Math.floor(0xff * ratio) << 16 | Math.floor(0x44 * ratio) << 8 | Math.floor(0x44 * ratio);
                this.setEmissiveColor(hexColor);
            }
        }

        this.actionTimer += deltaTime;
        const playerPos = player.mesh.position;

        switch (this.type) {
            case 'A': this._updateTypeA(deltaTime); break;
            case 'B': this._updateTypeB(deltaTime); break;
            case 'C': this._updateTypeC(deltaTime, playerPos); break;
            case 'D': this._updateTypeD(deltaTime, playerPos, game); break;
            case 'E': this._updateTypeE(deltaTime, playerPos, game); break;
            case 'F': this._updateTypeF(deltaTime, playerPos); break;
        }
    }

    _updateTypeA(deltaTime) {
        // Straight (真っ直ぐ手前に向かって飛ぶ)
        this.mesh.position.z += this.speed * deltaTime;
    }

    _updateTypeB(deltaTime) {
        // Zigzag (左右に蛇行しながら前進)
        this.mesh.position.z += this.speed * deltaTime;
        const config = GameConfig.enemies.types.B;
        this.mesh.position.x += Math.cos(this.actionTimer * config.waveFreq) * config.waveAmp * deltaTime;
        this.mesh.rotation.z = Math.sin(this.actionTimer * config.waveFreq) * 0.3;
    }

    _updateTypeC(deltaTime, playerPos) {
        // Charger (プレイヤーに向かって高速で角度を合わせて突撃)
        if (this.state === 'APPROACH') {
            const dx = playerPos.x - this.mesh.position.x;
            const dy = playerPos.y - this.mesh.position.y;
            const homingSpeed = 4.0;
            this.mesh.position.x += Math.sign(dx) * Math.min(Math.abs(dx), homingSpeed) * deltaTime;
            this.mesh.position.y += Math.sign(dy) * Math.min(Math.abs(dy), homingSpeed) * deltaTime;
            
            if (this.mesh.position.z > playerPos.z - 20.0) {
                this.state = 'RETREAT';
            }
        }
        this.mesh.position.z += this.speed * deltaTime;
    }

    _updateTypeD(deltaTime, playerPos, game) {
        // Shooter (接近して停止 ➔ 3連射射撃 ➔ 上空へ離脱)
        const config = GameConfig.enemies.types.D;
        const distZ = Math.abs(this.mesh.position.z - playerPos.z);

        if (this.state === 'APPROACH') {
            this.mesh.position.z += this.speed * deltaTime;
            if (distZ <= config.stopZOffset) {
                this.state = 'STAY_AND_SHOOT';
                this.stayTimer = 3.0;
                this.fireTimer = 0.5;
            }
        } else if (this.state === 'STAY_AND_SHOOT') {
            this.mesh.position.z -= game.scrollSpeed * deltaTime;
            const dx = playerPos.x - this.mesh.position.x;
            this.mesh.position.x += dx * 2.0 * deltaTime;
            this.stayTimer -= deltaTime;
            this.fireTimer -= deltaTime;
            if (this.fireTimer <= 0) {
                this.shootAtPlayer(playerPos, game);
                this.fireTimer = config.fireInterval;
            }
            if (this.stayTimer <= 0) {
                this.state = 'RETREAT';
            }
        } else if (this.state === 'RETREAT') {
            this.mesh.position.y += 12.0 * deltaTime;
            this.mesh.position.z += 5.0 * deltaTime;
        }
    }

    _updateTypeE(deltaTime, playerPos, game) {
        // Sniper (遠距離でスクロール同期して留まり、自機狙い連射 ➔ 上空へ離脱)
        const config = GameConfig.enemies.types.E;
        const distZ = Math.abs(this.mesh.position.z - playerPos.z);

        if (this.state === 'APPROACH') {
            this.mesh.position.z += this.speed * deltaTime;
            if (distZ <= config.stopZOffset) {
                this.state = 'STAY_AND_SHOOT';
                this.stayTimer = config.stayDuration;
                this.fireTimer = 0.5;
            }
        } else if (this.state === 'STAY_AND_SHOOT') {
            this.mesh.position.z -= game.scrollSpeed * deltaTime;
            const dx = playerPos.x - this.mesh.position.x;
            this.mesh.position.x += dx * 0.8 * deltaTime;
            this.stayTimer -= deltaTime;
            this.fireTimer -= deltaTime;
            if (this.fireTimer <= 0) {
                this.shootAtPlayer(playerPos, game);
                this.fireTimer = config.fireInterval;
            }
            if (this.stayTimer <= 0) {
                this.state = 'RETREAT';
            }
        } else if (this.state === 'RETREAT') {
            this.mesh.position.y += 10.0 * deltaTime;
            this.mesh.position.z += 8.0 * deltaTime;
        }
    }

    _updateTypeF(deltaTime, playerPos) {
        // Helix (毎フレーム自機を追従 + 螺旋ウェーブでUFOのように執拗に突撃、水平自転)
        const config = GameConfig.enemies.types.F;
        const dx = playerPos.x - this.mesh.position.x;
        const dy = playerPos.y - this.mesh.position.y;
        
        const homingSpeedX = 8.5;
        const homingSpeedY = 6.5;
        this.mesh.position.x += Math.sign(dx) * Math.min(Math.abs(dx), homingSpeedX) * deltaTime;
        this.mesh.position.y += Math.sign(dy) * Math.min(Math.abs(dy), homingSpeedY) * deltaTime;
        
        this.mesh.position.z += this.speed * deltaTime;
        
        this.mesh.position.x += Math.cos(this.actionTimer * config.waveFreqX) * config.waveAmpX * deltaTime;
        this.mesh.position.y += Math.sin(this.actionTimer * config.waveFreqY) * config.waveAmpY * deltaTime;
        
        this.mesh.rotation.y += 6.0 * deltaTime;
    }

    shootAtPlayer(playerPos, game) {
        // 砲身先端付近の位置を計算
        _enemyTempFirePos.copy(this.mesh.position);
        _enemyTempFirePos.z += 1.0; // 敵機の前方
        
        // 自機への方向ベクトルを算出
        _enemyTempDir.subVectors(playerPos, _enemyTempFirePos).normalize();
        
        const baseSpeed = GameConfig.enemyBullet.speed;
        const bulletSpeed = baseSpeed;

        // 敵の弾（isEnemy = true）を生成
        game.spawnEnemyBullet(_enemyTempFirePos.x, _enemyTempFirePos.y, _enemyTempFirePos.z, _enemyTempDir.x, _enemyTempDir.y, _enemyTempDir.z, bulletSpeed);

        // 敵の弾発射効果音
        if (window.audioManager) {
            audioManager.play('enemyShoot');
        }
    }

    /**
     * 被弾によるダメージ処理
     * @param {number} amount
     * @returns {boolean} 撃破されたら true
     */
    damage(amount) {
        if (!this.active) return false;

        this.hp -= amount;
        if (this.hp <= 0) {
            this.deactivate();
            return true;
        } else {
            // 被弾フラッシュ開始（HDR Bloomで強烈に発光する白熱色）
            this.flashTimer = 0.08;
            this.setEmissiveColor(0xffffff);
        }
        return false;
    }

    /**
     * 敵モデルの全メッシュに対して自己発光色（emissive）を設定するヘルパー
     * @param {number} colorHex
     */
    setEmissiveColor(colorHex) {
        if (!this.mesh) return;
        this.mesh.traverse(child => {
            if (child.isMesh && child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach(mat => {
                        if (mat.emissive) mat.emissive.setHex(colorHex);
                    });
                } else {
                    if (child.material.emissive) child.material.emissive.setHex(colorHex);
                }
            }
        });
    }

    /**
     * 非活性化処理
     */
    deactivate() {
        this.active = false;
        this.mesh.visible = false;
    }

    /**
     * 完全破棄
     */
    destroy() {
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
    }
}
