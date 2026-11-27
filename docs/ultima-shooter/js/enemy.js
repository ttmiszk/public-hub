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
	 * 敵機モデルの構築（EnemyModelBuilder に委譲）
	 */
	initMesh() {
		const built = EnemyModelBuilder.build(this.type, this.color);
		this.mesh = built.mesh;
		/** @type {THREE.Material[]} 被弾フラッシュ対象マテリアル */
		this.flashMats = built.flashMats;

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
	 * 敵モデルの装甲マテリアルに対して自己発光色（emissive）を設定するヘルパー
	 * @param {number} colorHex
	 */
	setEmissiveColor(colorHex) {
		if (this.flashMats && this.flashMats.length > 0) {
			for (let i = 0; i < this.flashMats.length; i++) {
				if (this.flashMats[i].emissive) {
					this.flashMats[i].emissive.setHex(colorHex);
				}
			}
			return;
		}
		if (!this.mesh) return;
		this.mesh.traverse(child => {
			if (child.isMesh && child.material && child.material.emissive) {
				child.material.emissive.setHex(colorHex);
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
