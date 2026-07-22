/**
 * @fileoverview effect.js
 * パーティクルエフェクトクラス。爆発（四散）、衝撃波リング、
 * およびアイテム取得時の吸い込み（インプロージョン）など各種エフェクトを管理する。
 */

// GC対策用の一時変数
const _effectTempVec = new THREE.Vector3();

/**
 * 個別パーティクルクラス
 */
class Particle {
    /**
     * @param {THREE.Scene} scene
     */
    constructor(scene) {
        /** @type {THREE.Scene} */
        this.scene = scene;
        /** @type {THREE.Mesh} */
        this.mesh = null;
        
        /** @type {THREE.Vector3} 移動速度ベクトル */
        this.velocity = new THREE.Vector3();
        /** @type {number} 最大寿命 */
        this.maxLife = 0.0;
        /** @type {number} 残り寿命 */
        this.life = 0.0;
        /** @type {boolean} アクティブ状態か */
        this.active = false;
        
        /** @type {boolean} アイテム取得時の吸い込み演出か */
        this.isItemPickup = false;
        
        this.initMesh();
    }

    /**
     * パーティクルメッシュ生成 (極小のキューブ)
     */
    initMesh() {
        const geo = new THREE.BoxGeometry(0.14, 0.14, 0.14);
        const mat = new THREE.MeshBasicMaterial({
            color: 0xffaa00,
            transparent: true,
            opacity: 1.0,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        mat.color.multiplyScalar(4.0); // HDR Bloom用
        
        this.mesh = new THREE.Mesh(geo, mat);
        this.mesh.visible = false;
        this.scene.add(this.mesh);
    }

    /**
     * 再利用時の初期化
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @param {number} color
     * @param {boolean} isItemPickup
     */
    init(x, y, z, color, isItemPickup = false) {
        this.isItemPickup = isItemPickup;
        this.mesh.position.set(x, y, z);
        this.mesh.scale.set(1.0, 1.0, 1.0);
        this.mesh.material.color.setHex(color);
        this.mesh.material.color.multiplyScalar(4.0); // HDR Bloom用
        this.mesh.material.opacity = 1.0;
        
        if (this.isItemPickup) {
            const scatterSpeed = 3.0 + Math.random() * 3.0;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos((Math.random() * 2) - 1);
            this.velocity.set(
                Math.sin(phi) * Math.cos(theta),
                Math.sin(phi) * Math.sin(theta),
                Math.cos(phi)
            ).multiplyScalar(scatterSpeed);

            this.maxLife = 0.6;
        } else {
            const speed = 12.0 + Math.random() * 14.0;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos((Math.random() * 2) - 1);
            this.velocity.set(
                Math.sin(phi) * Math.cos(theta),
                Math.sin(phi) * Math.sin(theta),
                Math.cos(phi)
            ).multiplyScalar(speed);
            
            this.maxLife = 0.35 + Math.random() * 0.45;
        }
        
        this.life = this.maxLife;
        this.mesh.visible = true;
        this.active = true;
    }

    /**
     * 毎フレームの更新
     * @param {number} deltaTime
     * @param {THREE.Vector3|null} playerPos
     * @param {number} [scrollSpeed=0.0]
     */
    update(deltaTime, playerPos, scrollSpeed = 0.0) {
        if (!this.active) return;
        
        this.life -= deltaTime;
        if (this.life <= 0) {
            this.deactivate();
            return;
        }

        if (this.isItemPickup && playerPos) {
            _effectTempVec.subVectors(playerPos, this.mesh.position);
            const dist = _effectTempVec.length();
            
            if (dist <= 0.6) {
                this.deactivate();
                return;
            }
            
            _effectTempVec.normalize();
            const pullForce = 15.0 + (1.0 - Math.min(1.0, dist / 20.0)) * 30.0;
            
            this.velocity.lerp(_effectTempVec.multiplyScalar(pullForce), 0.15);
            this.mesh.position.addScaledVector(this.velocity, deltaTime);
        } else {
            this.mesh.position.z -= scrollSpeed * deltaTime;
            this.mesh.position.addScaledVector(this.velocity, deltaTime);
            this.velocity.multiplyScalar(0.91);
        }
        
        const ratio = Math.max(0, this.life / this.maxLife);
        this.mesh.scale.set(ratio, ratio, ratio);
        this.mesh.material.opacity = ratio;
    }

    deactivate() {
        this.active = false;
        this.mesh.visible = false;
    }

    destroy() {
        if (this.mesh) {
            this.scene.remove(this.mesh);
            if (this.mesh.geometry) this.mesh.geometry.dispose();
            if (this.mesh.material) this.mesh.material.dispose();
        }
        this.mesh = null;
    }
}

/**
 * 爆発用衝撃波ディスククラス（穴の開かない円盤型・動的波紋シェーダー）
 * 中に黒い穴が開かず、中心の閃光と外側に広がる波動リングをシームレスに描画
 */
class ShockwaveRing {
    constructor(scene) {
        this.scene = scene;
        // 穴を開けずに内側が詰まった CircleGeometry を使用
        const geo = new THREE.CircleGeometry(1.0, 32);
        const mat = new THREE.ShaderMaterial({
            uniforms: {
                uColor: { value: new THREE.Color(0xffaa00) },
                uOpacity: { value: 0.5 },
                uProgress: { value: 0.0 }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform vec3 uColor;
                uniform float uOpacity;
                uniform float uProgress;
                varying vec2 vUv;

                void main() {
                    vec2 center = vUv - vec2(0.5);
                    float dist = length(center) * 2.0;

                    if (dist > 1.0) {
                        discard;
                    }

                    // 外縁に向かってスムーズに透明化
                    float outerFade = smoothstep(1.0, 0.5, dist);

                    // 拡散するメインの波動リング
                    float wavePos = uProgress * 0.85;
                    float waveWidth = 0.22;
                    float wave = 1.0 - smoothstep(0.0, waveWidth, abs(dist - wavePos));
                    wave = pow(wave, 1.5);

                    // 中心部の残光フラッシュ（拡散するにつれて消える）
                    float centerFlash = (1.0 - smoothstep(0.0, 0.4, dist)) * (1.0 - uProgress) * 0.45;

                    float alpha = (wave * 0.75 + centerFlash) * outerFade * uOpacity;

                    vec3 glowColor = uColor * 2.5;
                    gl_FragColor = vec4(glowColor, clamp(alpha, 0.0, 1.0));
                }
            `,
            side: THREE.DoubleSide,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        this.mesh = new THREE.Mesh(geo, mat);
        this.mesh.visible = false;
        this.scene.add(this.mesh);

        this.life = 0;
        this.maxLife = 0;
        this.active = false;
        this.maxScale = 5.0;
    }

    init(x, y, z, color = 0xffaa00, maxScale = 5.0, duration = 0.3) {
        this.mesh.position.set(x, y, z);
        this.mesh.rotation.x = 0;
        this.mesh.rotation.y = 0;
        this.mesh.rotation.z = Math.random() * Math.PI;
        this.mesh.scale.set(0.1, 0.1, 0.1);
        
        if (this.mesh.material.uniforms) {
            this.mesh.material.uniforms.uColor.value.setHex(color);
            this.mesh.material.uniforms.uOpacity.value = 0.5;
            this.mesh.material.uniforms.uProgress.value = 0.0;
        }

        this.maxLife = duration;
        this.life = duration;
        this.maxScale = maxScale;
        this.active = true;
        this.mesh.visible = true;
    }

    update(deltaTime, scrollSpeed = 0.0) {
        if (!this.active) return;
        this.life -= deltaTime;
        if (this.life <= 0) {
            this.deactivate();
            return;
        }

        const ratio = 1.0 - (this.life / this.maxLife);
        const scale = 0.1 + (this.maxScale - 0.1) * Math.sin(ratio * Math.PI * 0.5);
        this.mesh.scale.set(scale, scale, scale);

        if (this.mesh.material.uniforms) {
            this.mesh.material.uniforms.uProgress.value = ratio;
            this.mesh.material.uniforms.uOpacity.value = 0.5 * (1.0 - ratio);
        }
        this.mesh.position.z -= scrollSpeed * deltaTime;
    }

    deactivate() {
        this.active = false;
        this.mesh.visible = false;
    }

    destroy() {
        if (this.mesh) {
            this.scene.remove(this.mesh);
            if (this.mesh.geometry) this.mesh.geometry.dispose();
            if (this.mesh.material) this.mesh.material.dispose();
        }
        this.mesh = null;
    }
}

/**
 * 爆発エフェクト・パーティクル管理クラス
 */
class EffectManager {
    /**
     * @param {Game} game
     */
    constructor(game) {
        this.game = game;
        
        /** @type {Particle[]} */
        this.particles = [];
        /** @type {ShockwaveRing[]} */
        this.rings = [];
        
        /** @type {ObjectPool} */
        this.particlePool = new ObjectPool(
            () => new Particle(this.game.renderer.scene),
            (particle, x, y, z, color, isItemPickup) => particle.init(x, y, z, color, isItemPickup),
            60
        );

        /** @type {ObjectPool} */
        this.ringPool = new ObjectPool(
            () => new ShockwaveRing(this.game.renderer.scene),
            (ring, x, y, z, color, maxScale, duration) => ring.init(x, y, z, color, maxScale, duration),
            15
        );
    }

    /**
     * 爆発エフェクトの発生
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @param {number} color
     * @param {number} count
     * @param {boolean} isItemPickup - アイテム取得時の上昇演出か
     */
    spawnExplosion(x, y, z, color = 0xff5500, count = 20, isItemPickup = false) {
        for (let i = 0; i < count; i++) {
            let pColor = color;
            if (!isItemPickup && color === 0xff5500) {
                const rand = Math.random();
                if (rand < 0.35) pColor = 0xffaa00; 
                else if (rand < 0.65) pColor = 0xff2200; 
                else if (rand < 0.85) pColor = 0xffffff;
            }
            
            const p = this.particlePool.obtain(x, y, z, pColor, isItemPickup);
            this.particles.push(p);
        }

        // 爆発時は控えめで繊細な衝撃波リングを伴わせる
        if (!isItemPickup) {
            const ringScale = count > 30 ? 7.0 : 4.5;
            const ring = this.ringPool.obtain(x, y, z, color, ringScale, 0.3);
            this.rings.push(ring);

            // 爆発が大きい場合は一時的なBloomブーストを発動
            if (this.game && this.game.renderer && count >= 25) {
                this.game.renderer.triggerBloomBoost(1.2, 0.4);
            }
        }
    }

    /**
     * エフェクトの更新
     * @param {number} deltaTime
     * @param {THREE.Vector3|null} playerPos - プレイヤー自機の座標
     */
    update(deltaTime, playerPos = null) {
        const scrollSpeed = this.game ? this.game.scrollSpeed : 0.0;
        
        // パーティクルの更新
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.update(deltaTime, playerPos, scrollSpeed);
            
            if (!p.active) {
                this.particlePool.release(p);
                const last_particle = this.particles.pop();
                if (i < this.particles.length) this.particles[i] = last_particle;
            }
        }

        // 衝撃波リングの更新
        for (let i = this.rings.length - 1; i >= 0; i--) {
            const ring = this.rings[i];
            ring.update(deltaTime, scrollSpeed);

            if (!ring.active) {
                this.ringPool.release(ring);
                const last_ring = this.rings.pop();
                if (i < this.rings.length) this.rings[i] = last_ring;
            }
        }
    }

    /**
     * 全てのエフェクトを即時回収
     */
    clearAll() {
        for (let p of this.particles) {
            p.deactivate();
            this.particlePool.release(p);
        }
        this.particles = [];

        for (let ring of this.rings) {
            ring.deactivate();
            this.ringPool.release(ring);
        }
        this.rings = [];
    }

    /**
     * リソース破棄
     */
    destroy() {
        this.clearAll();
        for (let p of this.particlePool.pool) {
            p.destroy();
        }
        this.particlePool = null;

        for (let r of this.ringPool.pool) {
            r.destroy();
        }
        this.ringPool = null;
    }
}

