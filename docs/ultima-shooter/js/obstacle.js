/**
 * @fileoverview obstacle.js
 * 障害物クラス。ステージ内に流れてくる岩石などの生成、自転、移動を管理する。
 */

/**
 * 障害物クラス (浮遊岩専用)
 * 洞窟ステージにおいて、自転しながら浮遊するローポリ岩石（ROCK）のメッシュ生成、
 * アニメーション挙動、非活性化処理を担当する。
 */
class Obstacle {
    /**
     * @param {THREE.Scene} scene - シーンオブジェクト
     * @param {string} type - 障害物のタイプ ('ROCK')
     */
    constructor(scene, type) {
        /** @type {THREE.Scene} */
        this.scene = scene;
        /** @type {string} */
        this.type = type;
        
        /** @type {THREE.Group} */
        this.mesh = null;
        /** @type {boolean} */
        this.active = false;
        
        // 設定の読み込み
        const config = GameConfig.obstacles.types[type];
        /** @type {string} */
        this.name = config.name;
        /** @type {number} 衝突時ダメージ */
        this.damage = config.damage;
        /** @type {number} カラーコード */
        this.color = config.color;
        
        /** @type {number} ベースの当たり判定半径 */
        this.baseHitRadius = config.hitRadius;
        /** @type {number} 現在の（スケール調整後の）当たり判定半径 */
        this.hitRadius = this.baseHitRadius;
        
        // インスタンスごとの多面体タイプ（0: 4面体, 1: 8面体, 2: 12面体, 3: 20面体）
        this.geometryType = 0;
        
        // --- 浮遊岩(ROCK)用回転パラメータ ---
        this.rotationSpeed = new THREE.Vector3();
        
        this.initMesh();
    }

    /**
     * 障害物（岩）メッシュの初期生成
     */
    initMesh() {
        this.mesh = new THREE.Group();
        // プロシージャルノイズテクスチャ（バンプマップ用）の生成
        if (!window.rockNoiseTexture) {
            const createNoise = (size, repeat) => {
                const canvas = document.createElement('canvas');
                canvas.width = size; canvas.height = size;
                const ctx = canvas.getContext('2d');
                const imgData = ctx.createImageData(size, size);
                for (let i = 0; i < imgData.data.length; i += 4) {
                    const val = Math.random() * 255;
                    imgData.data[i] = val; imgData.data[i+1] = val; imgData.data[i+2] = val;
                    imgData.data[i+3] = 255;
                }
                ctx.putImageData(imgData, 0, 0);
                const tex = new THREE.CanvasTexture(canvas);
                tex.wrapS = THREE.RepeatWrapping;
                tex.wrapT = THREE.RepeatWrapping;
                tex.repeat.set(repeat, repeat);
                return tex;
            };
            window.rockNoiseTexture = createNoise(32, 2);
        }

        // PBRマテリアルで重厚な岩の質感を出す
        const mat = new THREE.MeshStandardMaterial({
            color: this.color,
            roughness: 0.9,     // 光沢を抑えて石っぽく
            metalness: 0.1,     // 少しだけ環境光を拾うように
            flatShading: true,
            bumpMap: window.rockNoiseTexture,
            bumpScale: 0.25 // 遠くからでもわかるように強めに設定
        });

        // 多面体（面数違い）のバリエーションをランダムに決定
        const geomType = Math.floor(Math.random() * 4);
        this.geometryType = geomType;
        
        const radius = this.baseHitRadius;
        let geo;
        switch (geomType) {
            case 0: geo = new THREE.IcosahedronGeometry(radius, 1); break; // 80面 (小)
            case 1: geo = new THREE.IcosahedronGeometry(radius, 2); break; // 320面 (中)
            case 2: geo = new THREE.IcosahedronGeometry(radius, 3); break; // 1280面 (大)
            case 3: geo = new THREE.IcosahedronGeometry(radius, 4); break; // 5120面 (特大)
        }

        // フラットシェーディングを正しく効かせるためにインデックスを解除
        geo = geo.toNonIndexed();

        // 頂点をランダムに移動させてゴツゴツとした小惑星の形を作る (Vertex Displacement)
        const posAttr = geo.attributes.position;
        const v = new THREE.Vector3();
        
        // 頂点ごとにランダムなノイズ値を計算
        // (非インデックス化されているため、同じ位置の頂点（同じ面を構成する頂点）が
        // バラバラに移動すると面が割れる。そのため位置をキーにしてノイズ値を共有する)
        const noiseMap = new Map();
        
        for (let i = 0; i < posAttr.count; i++) {
            v.fromBufferAttribute(posAttr, i);
            
            // 座標を文字列にしてキーにする（小数の誤差を丸める）
            const key = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
            
            let noise = noiseMap.get(key);
            if (noise === undefined) {
                noise = 0.9 + Math.random() * 0.2; // 0.8~1.2 から 0.9~1.1 に変更して滑らかに
                noiseMap.set(key, noise);
            }
            
            v.multiplyScalar(noise);
            posAttr.setXYZ(i, v.x, v.y, v.z);
        }
        geo.computeVertexNormals();

        const rock = new THREE.Mesh(geo, mat);
        rock.name = 'rock';
        this.mesh.add(rock);

        // 影を落とす・受ける設定を有効化
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        this.mesh.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });

        this.mesh.visible = false;
        this.scene.add(this.mesh);
    }

    /**
     * オブジェクトプールからの再利用時初期化
     * @param {number} x
     * @param {number} y
     * @param {number} z
     */
    init(x, y, z) {
        this.mesh.position.set(x, y, z);
        this.mesh.rotation.set(0, 0, 0);
        
        this.active = true;
        this.mesh.visible = true;

        const game = window.game;
        const stage = game && game.stageManager ? game.stageManager.getCurrentStage() : null;
        const bounds = getCaveBoundsAt(z, stage);

        // 1. 岩のサイズ（Scale）をランダム化 ＆ 洞窟の狭さに応じて制限 (進路ふさぎ防止)
        const caveW = bounds.right - bounds.left;
        const caveH = bounds.top - bounds.bottom;
        
        // 自機が通り抜けるための最低安全スペース (自機のhitRadiusは1.0、確実に避けるためのバッファを含めて 8.0 とする)
        const minPassableSpace = 8.0;
        // 岩の最大許容半径
        const maxAllowedRadius = Math.max(0.8, (Math.min(caveW, caveH) - minPassableSpace) * 0.5);
        
        // ジオメトリのタイプ(面数)に応じてサイズスケールの許容幅を決定
        // 面数が多いほど荒さが目立たないので巨大化を許可し、4面体は小さく抑える
        let baseMinScale = 0.4;
        let baseMaxScale = 2.5;
        
        switch (this.geometryType) {
            case 0: // 8面体 (Octahedron)
                baseMinScale = 0.4;
                baseMaxScale = 1.0;
                break;
            case 1: // 12面体 (Dodecahedron)
                baseMinScale = 0.8;
                baseMaxScale = 2.2;
                break;
            case 2: // 20面体 (Icosahedron)
                baseMinScale = 1.5;
                baseMaxScale = 4.5;
                break;
            case 3: // 32面体 (Octahedron detail 1)
                baseMinScale = 2.2;
                baseMaxScale = 7.5;
                break;
        }
        
        // 基本のランダムスケール
        const randomScale = baseMinScale + Math.random() * (baseMaxScale - baseMinScale);
        
        // スケール上限値 (岩の基本半径である baseHitRadius で割る)
        const maxScaleLimit = maxAllowedRadius / this.baseHitRadius;
        
        // 最終スケール (上限を超えないようにクランプ)
        const finalScale = Math.max(baseMinScale, Math.min(randomScale, maxScaleLimit));

        // 当たり判定半径を最終スケールに合わせて正確に更新する
        this.hitRadius = this.baseHitRadius * finalScale;

        const rock = this.mesh.getObjectByName('rock');
        if (rock) {
            // アスペクト比を個別にわずかにランダム変形 (0.8 〜 1.25 倍の範囲で各軸を揺らす)
            const rx = finalScale * (0.8 + Math.random() * 0.4);
            const ry = finalScale * (0.8 + Math.random() * 0.4);
            const rz = finalScale * (0.8 + Math.random() * 0.4);
            rock.scale.set(rx, ry, rz);
        }

        // 2. 岩の色を茶色系・グレー系ベースのランダムな色合いに設定 (隕石風)
        const isBrown = Math.random() < 0.5;
        const rockColor = new THREE.Color();
        if (isBrown) {
            // 茶色〜褐色系
            const r = 0.35 + Math.random() * 0.20; // 0.35 〜 0.55
            const g = r * (0.45 + Math.random() * 0.15); // Rの約半分
            const b = g * (0.4 + Math.random() * 0.2); // Gの半分以下
            rockColor.setRGB(r, g, b);
        } else {
            // グレー〜暗灰色系
            const val = 0.25 + Math.random() * 0.25; // 0.25 〜 0.50
            rockColor.setRGB(val, val, val);
        }

        this.mesh.traverse((child) => {
            if (child.isMesh && child.material) {
                child.material.color.copy(rockColor);
            }
        });

        // 3. ゆっくりランダム自転の速度設定 (最低速度を設定して確実に回転が視認できるようにする)
        this.mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
        
        const minRotSpeed = 0.35; // 最低回転速度 (約20度/秒)
        const maxRotSpeed = 0.85; // 最高回転速度 (約50度/秒)
        const rotX = (minRotSpeed + Math.random() * (maxRotSpeed - minRotSpeed)) * (Math.random() < 0.5 ? 1 : -1);
        const rotY = (minRotSpeed + Math.random() * (maxRotSpeed - minRotSpeed)) * (Math.random() < 0.5 ? 1 : -1);
        const rotZ = (minRotSpeed + Math.random() * (maxRotSpeed - minRotSpeed)) * (Math.random() < 0.5 ? 1 : -1);
        
        this.rotationSpeed.set(rotX, rotY, rotZ);

        // 4. 岩が絶対に壁にめり込まないクランプスポーン
        const marginX = this.hitRadius + 1.2; // 壁とのバッファマージン
        const marginY = this.hitRadius + 1.2;
        
        const spawnRangeX = bounds.right - bounds.left - marginX * 2;
        const spawnRangeY = bounds.top - bounds.bottom - marginY * 2;
        
        this.mesh.position.set(
            bounds.left + marginX + Math.random() * Math.max(0, spawnRangeX),
            bounds.bottom + marginY + Math.random() * Math.max(0, spawnRangeY),
            z
        );
    }

    /**
     * 毎フレームの移動とアニメーション更新
     * @param {number} deltaTime
     * @param {number} playerZ - 自機のZ座標
     * @param {number} scrollSpeed - ゲームの現在のスクロール速度
     */
    update(deltaTime, playerZ, scrollSpeed) {
        if (!this.active) return;

        // 1. スクロールによる手前への移動 (ワールド座標で静止させるため、Z更新は行わない)
        // プレイヤーが前進するため、相対的に手前に流れる

        // 2. 浮遊岩の3軸自転
        this.mesh.rotation.x += this.rotationSpeed.x * deltaTime;
        this.mesh.rotation.y += this.rotationSpeed.y * deltaTime;
        this.mesh.rotation.z += this.rotationSpeed.z * deltaTime;
    }

    /**
     * 非活性化
     */
    deactivate() {
        this.active = false;
        this.mesh.visible = false;
    }

    /**
     * メモリ破棄
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
