import * as THREE from 'three';

/**
 * 事前確保プールによる軽量パーティクルエフェクトマネージャー
 * 毎フレームのメッシュ生成・GCを抑制し、砂煙・火花・破壊破片・火の粉を滑らかに描画する。
 */
export class EffectManager {
	/**
	 * @param {THREE.Scene} scene
	 * @param {number} [poolSize]
	 */
	constructor(scene, poolSize = 160) {
		this.scene = scene;
		this.group = new THREE.Group();
		this.scene.add(this.group);

		this._qualityScale = 1.0;
		this._sharedGeo = new THREE.DodecahedronGeometry(0.14, 0);
		this._particles = [];
		this._popups = [];
		this._popupTextures = {
			BONUS: this._createPopupTextTexture('BONUS', ['#fffbe6', '#ffd166', '#ff9f1c']),
			'1UP': this._createPopupTextTexture('1UP', ['#ecfdf5', '#4ade80', '#16a34a'])
		};

		for (let i = 0; i < 8; i += 1) {
			const mat = new THREE.SpriteMaterial({
				map: this._popupTextures.BONUS,
				transparent: true,
				opacity: 0,
				depthWrite: false,
				depthTest: false
			});
			const sprite = new THREE.Sprite(mat);
			sprite.visible = false;
			sprite.renderOrder = 20;
			this.group.add(sprite);

			this._popups.push({
				active: false,
				text: 'BONUS',
				x: 0,
				y: 0,
				z: 0,
				vy: 0,
				gravity: 0,
				age: 0,
				life: 0.85,
				baseWidth: 1.38,
				baseHeight: 0.52,
				sprite,
				mat
			});
		}

		for (let i = 0; i < poolSize; i += 1) {
			const mat = new THREE.MeshBasicMaterial({
				color: 0xffffff,
				transparent: true,
				opacity: 0,
				depthWrite: false
			});
			const mesh = new THREE.Mesh(this._sharedGeo, mat);
			mesh.visible = false;
			this.group.add(mesh);

			this._particles.push({
				active: false,
				x: 0,
				y: 0,
				z: 0,
				vx: 0,
				vy: 0,
				vz: 0,
				gravity: 0,
				age: 0,
				life: 1,
				startScale: 1,
				endScale: 0.1,
				mesh,
				mat
			});
		}
	}

	_acquire() {
		for (const p of this._particles) {
			if (!p.active) {
				return p;
			}
		}
		return null;
	}

	_spawnOne(opts) {
		const p = this._acquire();
		if (!p) {
			return;
		}
		p.active = true;
		p.x = opts.x;
		p.y = opts.y;
		p.z = opts.z ?? 0;
		p.vx = opts.vx ?? 0;
		p.vy = opts.vy ?? 0;
		p.vz = opts.vz ?? 0;
		p.gravity = opts.gravity ?? 0;
		p.age = 0;
		p.life = opts.life ?? 0.5;
		p.startScale = opts.startScale ?? 1.0;
		p.endScale = opts.endScale ?? 0.1;

		p.mat.color.setHex(opts.color ?? 0xffffff);
		p.mat.opacity = 1;
		p.mesh.visible = true;
		p.mesh.position.set(p.x, p.y, p.z);
		p.mesh.scale.setScalar(p.startScale);
	}

	/**
	 * GPU品質ティアに応じて発生粒数の倍率を調整する
	 * @param {number} scale
	 */
	setQualityScale(scale) {
		this._qualityScale = Math.max(0.25, Math.min(1.0, scale));
	}

	_scaledCount(baseCount) {
		return Math.max(1, Math.round(baseCount * this._qualityScale));
	}

	/**
	 * 着地・ジャンプ時の砂煙
	 */
	emitDust(x, y, count = 6) {
		const n = this._scaledCount(count);
		for (let i = 0; i < n; i += 1) {
			const side = i % 2 === 0 ? 1 : -1;
			this._spawnOne({
				x: x + (Math.random() - 0.5) * 0.4,
				y: y + 0.08,
				z: (Math.random() - 0.5) * 0.35,
				vx: side * (1.2 + Math.random() * 1.8),
				vy: 0.6 + Math.random() * 1.2,
				vz: (Math.random() - 0.5) * 1.2,
				gravity: 2.5,
				life: 0.35 + Math.random() * 0.2,
				startScale: 0.85,
				endScale: 0.15,
				color: 0xb8c2d1
			});
		}
	}

	/**
	 * 樽のバウンド時や衝突時の火花バースト
	 */
	emitSparks(x, y, color = 0xffb703, count = 10) {
		const n = this._scaledCount(count);
		for (let i = 0; i < n; i += 1) {
			const angle = Math.random() * Math.PI * 2;
			const speed = 2.0 + Math.random() * 4.5;
			this._spawnOne({
				x,
				y,
				z: (Math.random() - 0.5) * 0.4,
				vx: Math.cos(angle) * speed,
				vy: Math.abs(Math.sin(angle)) * speed + 1.5,
				vz: (Math.random() - 0.5) * 2.5,
				gravity: 16.0,
				life: 0.35 + Math.random() * 0.25,
				startScale: 0.65,
				endScale: 0.05,
				color
			});
		}
	}

	/**
	 * ハンマーによる樽破壊時の派手な破片＆スパーク
	 */
	emitBarrelSmash(x, y, isFast = false) {
		this.emitSparks(x, y, isFast ? 0x4cc9f0 : 0xff9f1c, 14);
		for (let i = 0; i < 6; i += 1) {
			this._spawnOne({
				x,
				y,
				z: (Math.random() - 0.5) * 0.3,
				vx: (Math.random() - 0.5) * 5.5,
				vy: 3.0 + Math.random() * 4.5,
				vz: (Math.random() - 0.5) * 4.0,
				gravity: 20.0,
				life: 0.55,
				startScale: 1.2,
				endScale: 0.3,
				color: isFast ? 0x264653 : 0xa85b22
			});
		}
	}

	/**
	 * 燃焼ピットの立ち上る火の粉
	 */
	emitEmber(x, y) {
		this._spawnOne({
			x: x + (Math.random() - 0.5) * 0.6,
			y: y + 0.3,
			z: (Math.random() - 0.5) * 0.5,
			vx: (Math.random() - 0.5) * 0.6,
			vy: 1.8 + Math.random() * 1.6,
			vz: (Math.random() - 0.5) * 0.6,
			gravity: -0.6,
			life: 0.65 + Math.random() * 0.4,
			startScale: 0.55,
			endScale: 0.05,
			color: Math.random() < 0.5 ? 0xff9f1c : 0xff4d4d
		});
	}

	/**
	 * 炎バーナー噴出時の火の粉ジェット
	 */
	emitFlameJet(x, y, dirX = 0, dirY = 1) {
		const count = this._scaledCount(2);
		for (let i = 0; i < count; i += 1) {
			this._spawnOne({
				x: x + (Math.random() - 0.5) * 0.28,
				y: y + 0.25,
				z: (Math.random() - 0.5) * 0.28,
				vx: dirX * (2.6 + Math.random() * 1.6) + (Math.random() - 0.5) * 0.9,
				vy: dirY * (2.6 + Math.random() * 1.8) + 0.4,
				vz: (Math.random() - 0.5) * 0.8,
				gravity: -0.4,
				life: 0.35 + Math.random() * 0.2,
				startScale: 0.72,
				endScale: 0.08,
				color: Math.random() < 0.45 ? 0xffe066 : 0xff5400
			});
		}
	}

	/**
	 * 高圧電気アーク発生時のシアン放電スパーク
	 */
	emitElectricArc(x1, y1, x2, y2) {
		const t = Math.random();
		const mx = x1 + (x2 - x1) * t;
		const my = y1 + (y2 - y1) * t;
		const count = this._scaledCount(2);
		for (let i = 0; i < count; i += 1) {
			this._spawnOne({
				x: mx + (Math.random() - 0.5) * 0.2,
				y: my + (Math.random() - 0.5) * 0.2,
				z: (Math.random() - 0.5) * 0.2,
				vx: (Math.random() - 0.5) * 3.8,
				vy: (Math.random() - 0.5) * 3.8,
				vz: (Math.random() - 0.5) * 2.4,
				gravity: 8.0,
				life: 0.22 + Math.random() * 0.14,
				startScale: 0.55,
				endScale: 0.04,
				color: Math.random() < 0.5 ? 0x7dd3fc : 0xffffff
			});
		}
	}

	/**
	 * 配管・プレス稼働時の白いスチームパフ
	 */
	emitSteamPuff(x, y, count = 4) {
		const n = this._scaledCount(count);
		for (let i = 0; i < n; i += 1) {
			this._spawnOne({
				x: x + (Math.random() - 0.5) * 0.4,
				y: y + 0.1,
				z: (Math.random() - 0.5) * 0.3,
				vx: (Math.random() - 0.5) * 1.4,
				vy: 1.4 + Math.random() * 1.3,
				vz: (Math.random() - 0.5) * 0.8,
				gravity: -0.5,
				life: 0.48 + Math.random() * 0.25,
				startScale: 0.75,
				endScale: 1.55,
				color: 0xdbeafe
			});
		}
	}

	_createPopupTextTexture(label, colors) {
		if (typeof document === 'undefined') {
			return null;
		}
		const canvas = document.createElement('canvas');
		canvas.width = 256;
		canvas.height = 96;
		const ctx = canvas.getContext('2d');
		if (!ctx) {
			return null;
		}

		ctx.clearRect(0, 0, canvas.width, canvas.height);
		ctx.font = 'bold 58px Impact, "Arial Black", "Segoe UI", sans-serif';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.lineJoin = 'round';

		const cx = canvas.width * 0.5;
		const cy = canvas.height * 0.52;

		ctx.shadowColor = 'rgba(0, 0, 0, 0.72)';
		ctx.shadowBlur = 6;
		ctx.shadowOffsetY = 3;
		ctx.lineWidth = 10;
		ctx.strokeStyle = '#0b1120';
		ctx.strokeText(label, cx, cy);

		ctx.shadowColor = 'transparent';
		const grad = ctx.createLinearGradient(0, 18, 0, canvas.height - 18);
		grad.addColorStop(0, colors[0]);
		grad.addColorStop(0.48, colors[1]);
		grad.addColorStop(1, colors[2]);
		ctx.fillStyle = grad;
		ctx.fillText(label, cx, cy);

		const tex = new THREE.CanvasTexture(canvas);
		tex.colorSpace = THREE.SRGBColorSpace;
		tex.needsUpdate = true;
		return tex;
	}

	_spawnPopupText({ text, x, y, z = 0.35, vy = 2.6, gravity = 4.6, life = 0.85, width = 1.38, height = 0.52 }) {
		for (const pop of this._popups) {
			if (pop.active) {
				continue;
			}
			pop.active = true;
			pop.text = text;
			pop.x = x;
			pop.y = y;
			pop.z = z;
			pop.vy = vy;
			pop.gravity = gravity;
			pop.age = 0;
			pop.life = life;
			pop.baseWidth = width;
			pop.baseHeight = height;

			pop.mat.map = this._popupTextures[text] || this._popupTextures.BONUS;
			pop.mat.needsUpdate = true;
			pop.mat.opacity = 1;
			pop.sprite.visible = true;
			pop.sprite.position.set(x, y, z);
			pop.sprite.scale.set(width * 0.7, height * 0.7, 1);
			return;
		}
	}

	/**
	 * ボーナスアイテム取得時にアイテム位置から「BONUS」（1UP時は「1UP」も）の文字が跳ねて上昇する演出
	 * @param {number} x
	 * @param {number} y
	 * @param {boolean} [isOneUp=false]
	 */
	emitBonusPickup(x, y, isOneUp = false) {
		this._spawnPopupText({
			text: 'BONUS',
			x,
			y: y + 0.15,
			z: 0.38,
			vy: 2.65,
			gravity: 4.8,
			life: 0.85,
			width: 1.38,
			height: 0.52
		});
		if (isOneUp) {
			this._spawnPopupText({
				text: '1UP',
				x,
				y: y + 0.62,
				z: 0.44,
				vy: 3.15,
				gravity: 4.5,
				life: 1.05,
				width: 1.28,
				height: 0.52
			});
		}
	}

	update(dt) {
		for (const p of this._particles) {
			if (!p.active) {
				continue;
			}
			p.age += dt;
			if (p.age >= p.life) {
				p.active = false;
				p.mesh.visible = false;
				continue;
			}

			const t = p.age / p.life;
			p.vy -= p.gravity * dt;
			p.x += p.vx * dt;
			p.y += p.vy * dt;
			p.z += p.vz * dt;

			p.mesh.position.set(p.x, p.y, p.z);
			p.mesh.rotation.x += dt * 6;
			p.mesh.rotation.y += dt * 5;
			p.mesh.scale.setScalar(p.startScale + (p.endScale - p.startScale) * t);
			p.mat.opacity = Math.max(0, 1 - t);
		}

		for (const pop of this._popups) {
			if (!pop.active) {
				continue;
			}
			pop.age += dt;
			if (pop.age >= pop.life) {
				pop.active = false;
				pop.sprite.visible = false;
				continue;
			}
			const t = pop.age / pop.life;
			pop.vy = Math.max(0.18, pop.vy - pop.gravity * dt);
			pop.y += pop.vy * dt;
			pop.sprite.position.set(pop.x, pop.y, pop.z);

			const scaleMul = t < 0.14
				? 0.7 + (t / 0.14) * 0.42
				: (t < 0.28 ? 1.12 - ((t - 0.14) / 0.14) * 0.12 : 1.0);
			pop.sprite.scale.set(pop.baseWidth * scaleMul, pop.baseHeight * scaleMul, 1);

			const alpha = t < 0.68 ? 1.0 : Math.max(0, 1 - (t - 0.68) / 0.32);
			pop.mat.opacity = alpha;
		}
	}

	clear() {
		for (const p of this._particles) {
			p.active = false;
			p.mesh.visible = false;
		}
		for (const pop of this._popups) {
			pop.active = false;
			pop.sprite.visible = false;
		}
	}

	dispose() {
		this.clear();
		this.scene.remove(this.group);
		this._sharedGeo.dispose();
		for (const p of this._particles) {
			p.mat.dispose();
		}
		for (const pop of this._popups) {
			pop.mat.dispose();
		}
		for (const tex of Object.values(this._popupTextures)) {
			tex?.dispose?.();
		}
	}
}
