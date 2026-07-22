/**
 * @fileoverview bullet.js
 * 弾クラス。プレイヤーの弾および敵の弾の生成・移動・描画を共通管理する。
 */

// 弾の基準となる前方向ベクトル（Z軸マイナス）
const _BULLET_FORWARD = new THREE.Vector3(0, 0, -1);

/**
 * 弾クラス
 * プレイヤーの弾および敵の弾を共通管理する。進行方向ベクトル（direction）による拡散弾をサポート。
 */
class Bullet {
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
        
        /** @type {boolean} 敵の弾か */
        this.isEnemy = false;
        
        /** @type {number} 移動速度 */
        this.speed = 0.0;
        
        /** @type {number} 当たり判定半径 */
        this.hitRadius = 0.0;
        
        /** @type {THREE.Vector3} 進行方向ベクトル */
        this.direction = new THREE.Vector3();
        
        this.initMesh();
    }

    /**
     * 弾の3Dモデル初期化
     */
    initMesh() {
        // 先端が細く、後端が太い流線型の楔レーザー
        const radiusTop = 0.01;
        const radiusBottom = 0.12;
        const height = 3.5;
        const radialSegments = 4;
        
        const geo = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, radialSegments);
        geo.rotateX(Math.PI / 2); // 進行方向に沿わせる
        
        // 外部ライトの影響を受けずに自己発光するBasicMaterial
        const mat = new THREE.MeshBasicMaterial({ 
            color: 0x00f9ff, // デフォルトはプレイヤー弾（ネオンシアン）
        });
        mat.color.multiplyScalar(5.0); // HDR Bloom用
        
        this.mesh = new THREE.Mesh(geo, mat);
        this.mesh.visible = false;
        
        this.scene.add(this.mesh);
    }

    /**
     * オブジェクトプールから取得された際の初期化・活性化
     * @param {number} x - 発射時のX座標
     * @param {number} y - 発射時のY座標
     * @param {number} z - 発射時のZ座標
     * @param {boolean} isEnemy - 敵の弾か
     * @param {number} dirX - 進行方向のX成分
     * @param {number} dirY - 進行方向のY成分
     * @param {number} dirZ - 進行方向のZ成分
     * @param {number|null} customSpeed - 上書き速度（null の場合は config 設定値を使用）
     */
    init(x, y, z, isEnemy = false, dirX = 0, dirY = 0, dirZ = -1, customSpeed = null) {
        this.isEnemy = isEnemy;
        this.mesh.position.set(x, y, z);
        this.direction.set(dirX, dirY, dirZ).normalize(); // 方向を正規化
        
        if (this.isEnemy) {
            // 敵弾の設定（customSpeed が指定された場合はそちらを優先する）
            this.speed = (customSpeed !== null) ? customSpeed : GameConfig.enemyBullet.speed;
            this.hitRadius = GameConfig.enemyBullet.hitRadius;
            this.mesh.material.color.setHex(0xff3300); // 敵弾はネオンレッド
            this.mesh.material.color.setHex(0xff00ff);
            this.mesh.material.color.multiplyScalar(5.0); // HDR Bloom用
            
            // 進行方向に合わせて弾のモデルを回転させる
            // 弾はデフォルトでZ軸マイナスを向いているので、direction（進行方向）の向きへクォータニオンで回転
            this.mesh.quaternion.setFromUnitVectors(_BULLET_FORWARD, this.direction);
        } else {
            // プレイヤー弾の設定（customSpeed が指定された場合はそちらを優先する）
            this.speed = (customSpeed !== null) ? customSpeed : GameConfig.bullet.speed;
            this.hitRadius = GameConfig.bullet.hitRadius;
            this.mesh.material.color.setHex(0x00f9ff);
            this.mesh.material.color.multiplyScalar(5.0); // HDR Bloom用
            
            this.mesh.quaternion.setFromUnitVectors(_BULLET_FORWARD, this.direction);
        }
        
        this.mesh.visible = true;
        this.active = true;
    }

    /**
     * 毎フレームの更新処理
     * @param {number} deltaTime
     * @param {number} scrollSpeed
     */
    update(deltaTime, scrollSpeed = 0) {
        if (!this.active) return;
        
        // 進行方向ベクトルに従って進む
        this.mesh.position.addScaledVector(this.direction, this.speed * deltaTime);
    }

    /**
     * プールに戻すための非活性化
     */
    deactivate() {
        this.active = false;
        this.mesh.visible = false;
    }

    /**
     * 弾オブジェクトの完全破棄
     */
    destroy() {
        if (this.mesh) {
            this.scene.remove(this.mesh);
            if (this.mesh.geometry) this.mesh.geometry.dispose();
            if (this.mesh.material) this.mesh.material.dispose();
        }
        this.mesh = null;
    }
}
