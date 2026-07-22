/**
 * @fileoverview item.js
 * アイテムクラス。回復、弾丸補充、ショットパワーアップなどのアイテムモデル生成、
 * 自転アニメーション、および自機への磁力（マグネット）吸い寄せロジックを管理する。
 */

// 一時変数（GC対策）
const _itemTempVec = new THREE.Vector3();

class Item {
    /**
     * @param {THREE.Scene} scene - レンダラーのシーンオブジェクト
     */
    constructor(scene) {
        /** @type {THREE.Scene} */
        this.scene = scene;
        
        /** @type {THREE.Mesh} */
        this.mesh = null;
        
        /** @type {boolean} アクティブ状態か */
        this.active = false;
        
        /** @type {string} アイテムのタイプ ('BULLET', 'HEAL', 'POWERUP') */
        this.type = 'BULLET';
        
        /** @type {number} 個別の効果値 (弾薬補充量や回復量) */
        this.value = 0;
        
        /** @type {THREE.Sprite|null} アイテム上部に浮かぶ文字スプライト */
        this.captionSprite = null;
        
        // ポップアップ（飛び出す放物線演出）用
        /** @type {number} Y軸上昇速度 */
        this.vy = 0.0;
        /** @type {number} ポップアップ演出の残りタイマー */
        this.popupTimer = 0.0;
        
        // パラメータ
        /** @type {number} 通常時の前進（流れる）スピード (Zプラス方向) */
        this.speed = GameConfig.items.speed;
        /** @type {number} 当たり判定半径 */
        this.hitRadius = GameConfig.items.hitRadius;
        
        this.initGeometries();
        this.initMesh();
    }

    /**
     * タイプ別の3Dジオメトリを初期化・キャッシュ
     */
    initGeometries() {
        if (Item.geometries) return;

        // 1. HEAL用の3Dハート型ジオメトリの定義
        const heartShape = new THREE.Shape();
        heartShape.moveTo(0, 0);
        // 左半分のベジェ曲線
        heartShape.bezierCurveTo(-0.25, 0.25, -0.5, 0, -0.5, -0.25);
        heartShape.bezierCurveTo(-0.5, -0.55, -0.2, -0.8, 0, -1.05);
        // 右半分のベジェ曲線
        heartShape.bezierCurveTo(0.2, -0.8, 0.5, -0.55, 0.5, -0.25);
        heartShape.bezierCurveTo(0.5, 0, 0.25, 0.25, 0, 0);

        const heartGeo = new THREE.ExtrudeGeometry(heartShape, {
            depth: 0.15,
            bevelEnabled: true,
            bevelSegments: 2,
            steps: 1,
            bevelSize: 0.02,
            bevelThickness: 0.02
        });
        heartGeo.center(); // 回転の中心をオブジェクト中心に設定
        // ハートの向きを調整するために180度回転させて直立させる
        heartGeo.rotateZ(Math.PI);
        heartGeo.scale(0.8, 0.8, 0.8);

        // 2. BULLET用のカプセル型ジオメトリ (Three.js r128互換のためLatheGeometryでカプセル形状を作成)
        const points = [];
        const radius = 0.18;
        const bodyHeight = 0.4;
        // 下の半球
        for (let i = 0; i <= 8; i++) {
            const theta = (i / 8) * (Math.PI / 2) - Math.PI / 2;
            points.push(new THREE.Vector2(Math.cos(theta) * radius, Math.sin(theta) * radius - bodyHeight / 2));
        }
        // 上の半球
        for (let i = 0; i <= 8; i++) {
            const theta = (i / 8) * (Math.PI / 2);
            points.push(new THREE.Vector2(Math.cos(theta) * radius, Math.sin(theta) * radius + bodyHeight / 2));
        }
        const bulletGeo = new THREE.LatheGeometry(points, 10);
        bulletGeo.rotateX(Math.PI / 2); // 進行方向に向くように回転

        // 3. POWERUP用のトーラス(リング)型ジオメトリ
        const torusGeo = new THREE.TorusGeometry(0.32, 0.08, 6, 12);

        // 4. BARRIER用の星型(★)ジオメトリ
        const starShape = new THREE.Shape();
        const outerRadius = 0.35;
        const innerRadius = 0.15;
        for (let i = 0; i < 10; i++) {
            const r = (i % 2 === 0) ? outerRadius : innerRadius;
            const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
            const px = Math.cos(a) * r;
            const py = Math.sin(a) * r;
            if (i === 0) starShape.moveTo(px, py);
            else starShape.lineTo(px, py);
        }
        const starGeo = new THREE.ExtrudeGeometry(starShape, { depth: 0.1, bevelEnabled: false });
        starGeo.center(); // 中心を原点に合わせる

        Item.geometries = {
            HEAL: heartGeo,
            BULLET: bulletGeo,
            POWERUP: torusGeo,
            BARRIER: starGeo
        };
    }

    /**
     * アイテムの3Dモデル初期化
     */
    initMesh() {
        const mat = new THREE.MeshBasicMaterial({
            color: 0xffffff, 
            transparent: true,
            opacity: 0.95
        });
        
        // 初期状態ではPOWERUPのトーラス形状でメッシュを作成
        this.mesh = new THREE.Mesh(Item.geometries.POWERUP, mat);
        this.mesh.visible = false; 
        this.scene.add(this.mesh);
    }

    /**
     * オブジェクトプールから活性化される際の初期化
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @param {string} type - アイテムタイプ
     * @param {number} [customValue] - 補充量などの値（BULLETなどで使用）
     */
    init(x, y, z, type, customValue = null) {
        this.type = type;
        
        // ジオメトリをタイプに応じて切り替え
        if (Item.geometries[type]) {
            this.mesh.geometry = Item.geometries[type];
        }
        
        this.mesh.position.set(x, y, z);
        this.mesh.rotation.set(Math.random(), Math.random(), 0);
        this.mesh.scale.set(1.5, 1.5, 1.5); // アイテムのサイズを1.5倍に拡大
        
        // ポップアップ放物線演出の初期化 (上空へフワッと放り出す)
        this.vy = 8.0 + Math.random() * 4.0; // 上方向初速
        this.popupTimer = 0.5; // 0.5秒間ポップアップ
        
        // 敵撃破出現時などに重なって見失わないよう、少しだけ手前（Zプラス）へ押し出す
        this.mesh.position.z += 2.0;

        // タイプ別に色と個別値(value)を設定
        const config = GameConfig.items.types[type];
        this.mesh.material.color.setHex(config.color);
        this.mesh.material.color.multiplyScalar(4.0); // HDR Bloom用
        
        if (type === 'BULLET') {
            this.value = (customValue !== null && customValue !== undefined) ? customValue : 30;
        } else if (type === 'HEAL') {
            this.value = (customValue !== null && customValue !== undefined) ? customValue : 20;
        } else {
            this.value = 0;
        }

        // 接近速度の決定 (補充数/回復量に応じて動的に変化)
        if (type === 'BULLET') {
            // 10: -15.0 (相対速度 15.0 - 壁より遅い)
            // 30: 0.0 (相対速度 30.0 - 壁と同期)
            // 50: 15.0 (相対速度 45.0 - 速い)
            if (this.value === 10) {
                this.speed = -15.0;
            } else if (this.value === 30) {
                this.speed = 0.0;
            } else {
                this.speed = 15.0;
            }
        } else if (type === 'HEAL') {
            // 10: -15.0 (相対速度 15.0 - 壁より遅い)
            // 20: 0.0 (相対速度 30.0 - 壁と同期)
            // 30: 15.0 (相対速度 45.0 - 速い)
            if (this.value === 10) {
                this.speed = -15.0;
            } else if (this.value === 20) {
                this.speed = 0.0;
            } else {
                this.speed = 15.0;
            }
        } else {
            // POWERUP等はデフォルト設定 (15.0)
            this.speed = GameConfig.items.speed;
        }
        
        // キャプションスプライトの生成
        this.createCaption();
        
        this.mesh.visible = true;
        this.active = true;
    }

    /**
     * アイテム上部にフロート表示されるテキストスプライト(ビルボード)を生成
     */
    createCaption() {
        this.destroyCaption();

        let text = "";
        let colorStr = "";

        if (this.type === 'POWERUP') {
            text = "POWER";
            colorStr = "#ff00ff";
        } else if (this.type === 'HEAL') {
            text = `+${this.value}`;
            colorStr = "#ff2255";
        } else if (this.type === 'BULLET') {
            text = `+${this.value}`;
            colorStr = "#00d2d3";
        } else if (this.type === 'BARRIER') {
            text = "BARRIER";
            colorStr = "#feca57";
        }

        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        ctx.font = 'Bold 28px "Outfit", sans-serif';
        ctx.fillStyle = colorStr;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // 輪郭（アウトライン）を描画して視認性を向上させる
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 4;
        ctx.strokeText(text, 64, 32);
        ctx.fillText(text, 64, 32);

        const texture = new THREE.CanvasTexture(canvas);
        const mat = new THREE.SpriteMaterial({ map: texture, transparent: true });
        this.captionSprite = new THREE.Sprite(mat);
        this.captionSprite.scale.set(2.0, 1.0, 1.0); // 文字を大きく
        
        // 初期位置の設定
        this.captionSprite.position.copy(this.mesh.position);
        this.captionSprite.position.y += 1.15; // スケール拡大に合わせて上方にずらす
        
        this.scene.add(this.captionSprite);
    }

    /**
     * キャプションスプライトの破棄
     */
    destroyCaption() {
        if (this.captionSprite) {
            this.scene.remove(this.captionSprite);
            if (this.captionSprite.material) {
                if (this.captionSprite.material.map) {
                    this.captionSprite.material.map.dispose();
                }
                this.captionSprite.material.dispose();
            }
            this.captionSprite = null;
        }
    }

    /**
     * 毎フレームの更新処理
     * @param {number} deltaTime
     * @param {THREE.Vector3} playerPos - プレイヤーの現在座標
     */
    update(deltaTime, playerPos) {
        if (!this.active) return;

        if (this.popupTimer > 0) {
            // --- 出現直後のポップアップ放物線挙動 ---
            this.popupTimer -= deltaTime;
            
            // 重力加速度を適用して減速上昇 ➔ 下降
            this.vy -= 22.0 * deltaTime;
            this.mesh.position.y += this.vy * deltaTime;
            
            // ポップアップ中もゆっくりと手前へ流す
            this.mesh.position.z += this.speed * 0.7 * deltaTime;
            
            // 地面にめり込まないように下限をクランプ
            this.mesh.position.y = Math.max(0.5, this.mesh.position.y);
        } else {
            // --- 通常時の挙動 (前進 + マグネット吸い寄せ) ---
            // 1. 基本移動 (Zプラスの手前方向へ流れる)
            this.mesh.position.z += this.speed * deltaTime;

            // 2. マグネット効果 (HEAL / BULLET は控えめにし、POWERUPは強力なまま)
            const dist = this.mesh.position.distanceTo(playerPos);
            let magnetRange = GameConfig.items.magnetRange;
            let magnetSpeed = GameConfig.items.magnetSpeed;
            
            if (this.type === 'HEAL' || this.type === 'BULLET') {
                // HEALとBULLETは効果を控えめ（16.0 / 25.0）に下げる
                magnetRange = 16.0;
                magnetSpeed = 25.0;
            }
            
            // 自機を通り越して背後（Z座標が自機より大きい）に回った場合はマグネットを無効化し、そのまま背後へ流す
            const isBehind = this.mesh.position.z > playerPos.z;
            
            if (!isBehind && dist < magnetRange) {
                _itemTempVec.subVectors(playerPos, this.mesh.position).normalize();
                const ratio = 1.0 - (dist / magnetRange);
                const pullSpeed = ratio * magnetSpeed;
                this.mesh.position.addScaledVector(_itemTempVec, pullSpeed * deltaTime);
            }
        }

        // 3. 自転アニメーション
        this.mesh.rotation.y += 2.5 * deltaTime;
        this.mesh.rotation.x += 1.2 * deltaTime;

        // 4. キャプションスプライトの位置同期
        if (this.captionSprite) {
            this.captionSprite.position.copy(this.mesh.position);
            this.captionSprite.position.y += 1.15;
        }
    }

    /**
     * 非活性化
     */
    deactivate() {
        this.active = false;
        this.mesh.visible = false;
        this.destroyCaption();
    }

    /**
     * リソース完全破棄
     */
    destroy() {
        this.destroyCaption();
        if (this.mesh) {
            this.scene.remove(this.mesh);
            // ジオメトリはキャッシュで共有しているためここでは解放しない
        }
        this.mesh = null;
    }
}

// 静的ジオメトリキャッシュ（メモリリーク防止とパフォーマンス最適化）
Item.geometries = null;
