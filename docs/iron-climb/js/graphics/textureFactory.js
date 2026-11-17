import * as THREE from 'three';

/**
 * HTML5 Canvas を用いてオフライン環境で PBR 用テクスチャを動的生成・キャッシュするファクトリ
 * file:// 環境での CORS 制限を受けず、素材感（金属・木目・コンクリート・警告縞・窓明かり）を表現する。
 */
class TextureFactory {
	constructor() {
		this._cache = new Map();
	}

	_getOrCreate(key, creator) {
		if (this._cache.has(key)) {
			return this._cache.get(key);
		}
		const tex = creator();
		this._cache.set(key, tex);
		return tex;
	}

	_makeCanvas(width, height) {
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		return canvas;
	}

	/**
	 * 鉄骨ガーダー用テクスチャ（塗装金属＋リベット＋微細な擦れ）
	 */
	getGirderTexture(baseHex = '#c84b26') {
		return this._getOrCreate(`girder_${baseHex}`, () => {
			const canvas = this._makeCanvas(256, 128);
			const ctx = canvas.getContext('2d');

			ctx.fillStyle = baseHex;
			ctx.fillRect(0, 0, 256, 128);

			// 縦方向の微細な刷毛目・金属ノイズ
			for (let i = 0; i < 420; i += 1) {
				const x = Math.random() * 256;
				const y = Math.random() * 128;
				const w = 6 + Math.random() * 24;
				ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.09)';
				ctx.fillRect(x, y, w, 2);
			}

			// 上下フランジ縁の影・ハイライト
			ctx.fillStyle = 'rgba(255,255,255,0.14)';
			ctx.fillRect(0, 0, 256, 5);
			ctx.fillStyle = 'rgba(0,0,0,0.28)';
			ctx.fillRect(0, 120, 256, 8);

			// リベット列
			for (let rx = 16; rx < 256; rx += 32) {
				for (const ry of [18, 110]) {
					ctx.fillStyle = 'rgba(0,0,0,0.45)';
					ctx.beginPath();
					ctx.arc(rx + 1, ry + 1, 4, 0, Math.PI * 2);
					ctx.fill();

					ctx.fillStyle = 'rgba(255,255,255,0.28)';
					ctx.beginPath();
					ctx.arc(rx, ry, 3.5, 0, Math.PI * 2);
					ctx.fill();
				}
			}

			const tex = new THREE.CanvasTexture(canvas);
			tex.wrapS = THREE.RepeatWrapping;
			tex.wrapT = THREE.RepeatWrapping;
			tex.repeat.set(4, 1);
			tex.colorSpace = THREE.SRGBColorSpace;
			return tex;
		});
	}

	/**
	 * 足場上面の縞鋼板＋警告ストライプ縁取りテクスチャ
	 */
	getDeckPlateTexture() {
		return this._getOrCreate('deck_plate', () => {
			const canvas = this._makeCanvas(256, 256);
			const ctx = canvas.getContext('2d');

			ctx.fillStyle = '#394352';
			ctx.fillRect(0, 0, 256, 256);

			// 縞鋼板のダイアモンド凸パターン
			ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
			ctx.lineWidth = 2;
			for (let y = 24; y < 232; y += 24) {
				for (let x = 12; x < 256; x += 24) {
					ctx.beginPath();
					if (((x + y) / 24) % 2 === 0) {
						ctx.moveTo(x - 5, y - 5);
						ctx.lineTo(x + 5, y + 5);
					} else {
						ctx.moveTo(x + 5, y - 5);
						ctx.lineTo(x - 5, y + 5);
					}
					ctx.stroke();
				}
			}

			// 手前・奥エッジに警戒イエロー／ブラックのゼブラライン
			const drawHazardStrip = (yStart, h) => {
				ctx.save();
				ctx.beginPath();
				ctx.rect(0, yStart, 256, h);
				ctx.clip();
				ctx.fillStyle = '#e09f1f';
				ctx.fillRect(0, yStart, 256, h);
				ctx.fillStyle = '#1b2028';
				for (let sx = -32; sx < 288; sx += 32) {
					ctx.beginPath();
					ctx.moveTo(sx, yStart);
					ctx.lineTo(sx + 16, yStart);
					ctx.lineTo(sx + 6, yStart + h);
					ctx.lineTo(sx - 10, yStart + h);
					ctx.closePath();
					ctx.fill();
				}
				ctx.restore();
			};

			drawHazardStrip(0, 18);
			drawHazardStrip(238, 18);

			const tex = new THREE.CanvasTexture(canvas);
			tex.wrapS = THREE.RepeatWrapping;
			tex.wrapT = THREE.ClampToEdgeWrapping;
			tex.repeat.set(6, 1);
			tex.colorSpace = THREE.SRGBColorSpace;
			return tex;
		});
	}

	/**
	 * 敵メカ・工業危険部位用の黒×黄ハザードストライプテクスチャ
	 */
	getCautionStripeTexture(repeatX = 1, repeatY = 1) {
		return this._getOrCreate(`caution_stripe_${repeatX}_${repeatY}`, () => {
			const canvas = this._makeCanvas(128, 128);
			const ctx = canvas.getContext('2d');

			ctx.fillStyle = '#eab308';
			ctx.fillRect(0, 0, 128, 128);

			ctx.fillStyle = '#181c22';
			for (let sx = -128; sx < 256; sx += 32) {
				ctx.beginPath();
				ctx.moveTo(sx, 0);
				ctx.lineTo(sx + 16, 0);
				ctx.lineTo(sx - 48, 128);
				ctx.lineTo(sx - 64, 128);
				ctx.closePath();
				ctx.fill();
			}

			// 工業機械らしい金属スクラッチ・境界縁取り
			ctx.strokeStyle = 'rgba(255,255,255,0.14)';
			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.rect(1, 1, 126, 126);
			ctx.stroke();

			const tex = new THREE.CanvasTexture(canvas);
			tex.wrapS = THREE.RepeatWrapping;
			tex.wrapT = THREE.RepeatWrapping;
			tex.repeat.set(repeatX, repeatY);
			tex.colorSpace = THREE.SRGBColorSpace;
			return tex;
		});
	}

	/**
	 * ベルトコンベア上面テクスチャ（方向性スラット＋エッジ警告ガイド）
	 */
	getConveyorTexture(reverse = false) {
		return this._getOrCreate(`conveyor_${reverse ? 'rev' : 'fwd'}`, () => {
			const canvas = this._makeCanvas(256, 128);
			const ctx = canvas.getContext('2d');

			ctx.fillStyle = '#1f2630';
			ctx.fillRect(0, 0, 256, 128);

			// コンベアラバー横スラット＋進行方向シェブロン
			for (let x = 0; x < 256; x += 32) {
				ctx.fillStyle = '#141920';
				ctx.fillRect(x, 12, 4, 104);

				const tipX = reverse ? x + 10 : x + 22;
				const tailX = reverse ? x + 22 : x + 10;
				ctx.strokeStyle = '#ff9f1c';
				ctx.lineWidth = 4;
				ctx.beginPath();
				ctx.moveTo(tailX, 34);
				ctx.lineTo(tipX, 64);
				ctx.lineTo(tailX, 94);
				ctx.stroke();
			}

			// サイドレール帯
			ctx.fillStyle = '#d97706';
			ctx.fillRect(0, 0, 256, 10);
			ctx.fillRect(0, 118, 256, 10);

			const tex = new THREE.CanvasTexture(canvas);
			tex.wrapS = THREE.RepeatWrapping;
			tex.wrapT = THREE.ClampToEdgeWrapping;
			tex.repeat.set(6, 1);
			tex.colorSpace = THREE.SRGBColorSpace;
			return tex;
		});
	}

	/**
	 * 樽胴体テクスチャ（板張り目地＋木目）
	 */
	getBarrelBodyTexture(isFast = false) {
		return this._getOrCreate(`barrel_body_${isFast ? 'fast' : 'wood'}`, () => {
			const canvas = this._makeCanvas(256, 256);
			const ctx = canvas.getContext('2d');

			ctx.fillStyle = isFast ? '#1d4d63' : '#a85b22';
			ctx.fillRect(0, 0, 256, 256);

			// 縦板の境界線と色味変化
			const plankCount = 12;
			const plankW = 256 / plankCount;
			for (let i = 0; i < plankCount; i += 1) {
				const x = i * plankW;
				ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)';
				ctx.fillRect(x, 0, plankW, 256);

				ctx.fillStyle = 'rgba(0,0,0,0.38)';
				ctx.fillRect(x, 0, 2, 256);
			}

			// 細かい木目/金属スクラッチ
			for (let i = 0; i < 180; i += 1) {
				const x = Math.random() * 256;
				const y = Math.random() * 256;
				ctx.fillStyle = isFast ? 'rgba(130, 230, 255, 0.14)' : 'rgba(60, 25, 8, 0.2)';
				ctx.fillRect(x, y, 2, 16 + Math.random() * 34);
			}

			if (isFast) {
				// 高速樽のエネルギー警告バンド
				ctx.fillStyle = 'rgba(76, 201, 240, 0.45)';
				ctx.fillRect(0, 114, 256, 28);
			}

			const tex = new THREE.CanvasTexture(canvas);
			tex.colorSpace = THREE.SRGBColorSpace;
			return tex;
		});
	}

	/**
	 * 樽の側面（円形キャップ）テクスチャ：横から見ても回転と立体感が明確に分かる板目＋放射ライン＋中心栓
	 */
	getBarrelCapTexture(isFast = false) {
		return this._getOrCreate(`barrel_cap_${isFast ? 'fast' : 'wood'}`, () => {
			const canvas = this._makeCanvas(256, 256);
			const ctx = canvas.getContext('2d');
			const cx = 128;
			const cy = 128;

			ctx.fillStyle = isFast ? '#163a4d' : '#8a4618';
			ctx.fillRect(0, 0, 256, 256);

			// 縦方向の板継ぎ目
			for (let x = 0; x < 256; x += 32) {
				ctx.fillStyle = x % 64 === 0 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.08)';
				ctx.fillRect(x, 0, 32, 256);
				ctx.fillStyle = 'rgba(0,0,0,0.42)';
				ctx.fillRect(x, 0, 3, 256);
			}

			// 内周の凹み影リング
			const ringGrad = ctx.createRadialGradient(cx, cy, 40, cx, cy, 126);
			ringGrad.addColorStop(0, 'rgba(0,0,0,0)');
			ringGrad.addColorStop(0.76, 'rgba(0,0,0,0.18)');
			ringGrad.addColorStop(0.92, 'rgba(0,0,0,0.58)');
			ringGrad.addColorStop(1, 'rgba(0,0,0,0.75)');
			ctx.fillStyle = ringGrad;
			ctx.fillRect(0, 0, 256, 256);

			// 回転が視覚的にすぐ伝わるクロス/放射マーカー＋ボルト
			ctx.save();
			ctx.translate(cx, cy);
			ctx.strokeStyle = isFast ? '#4cc9f0' : '#d4a373';
			ctx.lineWidth = 8;
			for (let a = 0; a < 4; a += 1) {
				const angle = (a * Math.PI) / 2;
				ctx.beginPath();
				ctx.moveTo(Math.cos(angle) * 28, Math.sin(angle) * 28);
				ctx.lineTo(Math.cos(angle) * 92, Math.sin(angle) * 92);
				ctx.stroke();
			}

			// 中心ハブ＆栓
			ctx.fillStyle = isFast ? '#4cc9f0' : '#2d333d';
			ctx.beginPath();
			ctx.arc(0, 0, 26, 0, Math.PI * 2);
			ctx.fill();

			ctx.fillStyle = isFast ? '#caf0f8' : '#7b8794';
			ctx.beginPath();
			ctx.arc(-5, -5, 10, 0, Math.PI * 2);
			ctx.fill();
			ctx.restore();

			const tex = new THREE.CanvasTexture(canvas);
			tex.colorSpace = THREE.SRGBColorSpace;
			return tex;
		});
	}

	/**
	 * 夕暮れ〜夜間建設現場用のグラデーションスカイドームテクスチャ
	 */
	getSunsetSkyTexture() {
		return this._getOrCreate('sky_sunset_city', () => {
			const canvas = this._makeCanvas(64, 512);
			const ctx = canvas.getContext('2d');
			const grad = ctx.createLinearGradient(0, 0, 0, 512);
			grad.addColorStop(0.0, '#070b16');
			grad.addColorStop(0.32, '#111d35');
			grad.addColorStop(0.55, '#253352');
			grad.addColorStop(0.72, '#5a3538');
			grad.addColorStop(0.84, '#9c492a');
			grad.addColorStop(0.95, '#221720');
			grad.addColorStop(1.0, '#0a0e17');
			ctx.fillStyle = grad;
			ctx.fillRect(0, 0, 64, 512);

			const tex = new THREE.CanvasTexture(canvas);
			tex.colorSpace = THREE.SRGBColorSpace;
			return tex;
		});
	}

	/**
	 * 遠景ビルの窓明かりテクスチャ
	 */
	getBuildingWindowsTexture() {
		return this._getOrCreate('building_windows', () => {
			const canvas = this._makeCanvas(128, 256);
			const ctx = canvas.getContext('2d');

			ctx.fillStyle = '#0e1522';
			ctx.fillRect(0, 0, 128, 256);

			for (let row = 10; row < 246; row += 14) {
				for (let col = 8; col < 120; col += 12) {
					const r = Math.random();
					if (r < 0.28) {
						ctx.fillStyle = r < 0.14 ? 'rgba(255, 209, 102, 0.75)' : 'rgba(130, 196, 255, 0.55)';
						ctx.fillRect(col, row, 7, 8);
					} else {
						ctx.fillStyle = 'rgba(20, 30, 48, 0.9)';
						ctx.fillRect(col, row, 7, 8);
					}
				}
			}

			const tex = new THREE.CanvasTexture(canvas);
			tex.wrapS = THREE.RepeatWrapping;
			tex.wrapT = THREE.RepeatWrapping;
			tex.colorSpace = THREE.SRGBColorSpace;
			return tex;
		});
	}

	/**
	 * 鉄骨ガーダー用バンプマップ（上下フランジ縁・リベット・微細な縦筋凹凸）
	 */
	getGirderBumpTexture() {
		return this._getOrCreate('girder_bump', () => {
			const canvas = this._makeCanvas(256, 128);
			const ctx = canvas.getContext('2d');

			ctx.fillStyle = '#808080';
			ctx.fillRect(0, 0, 256, 128);

			ctx.fillStyle = '#c8c8c8';
			ctx.fillRect(0, 0, 256, 8);
			ctx.fillRect(0, 120, 256, 8);

			// 縦の継ぎ目ライン
			ctx.fillStyle = '#505050';
			ctx.fillRect(0, 0, 3, 128);
			ctx.fillRect(128, 0, 3, 128);

			// リベット突起
			for (let rx = 16; rx < 256; rx += 32) {
				for (const ry of [18, 110]) {
					ctx.fillStyle = '#e6e6e6';
					ctx.beginPath();
					ctx.arc(rx, ry, 4, 0, Math.PI * 2);
					ctx.fill();
				}
			}

			const tex = new THREE.CanvasTexture(canvas);
			tex.wrapS = THREE.RepeatWrapping;
			tex.wrapT = THREE.RepeatWrapping;
			tex.repeat.set(4, 1);
			return tex;
		});
	}

	/**
	 * 鉄骨・重鋼材用のラフネスマップ（金属光沢のムラと使用感を表現）
	 */
	getSteelRoughnessTexture() {
		return this._getOrCreate('steel_roughness', () => {
			const canvas = this._makeCanvas(256, 256);
			const ctx = canvas.getContext('2d');

			ctx.fillStyle = '#626262';
			ctx.fillRect(0, 0, 256, 256);

			for (let i = 0; i < 650; i += 1) {
				const x = Math.random() * 256;
				const y = Math.random() * 256;
				const w = 8 + Math.random() * 40;
				const h = 2 + Math.random() * 6;
				ctx.fillStyle = i % 3 === 0 ? 'rgba(255,255,255,0.08)' : 'rgba(20,20,20,0.09)';
				ctx.fillRect(x, y, w, h);
			}

			// パネル境界の汚し
			ctx.fillStyle = 'rgba(210, 210, 210, 0.18)';
			ctx.fillRect(0, 0, 256, 6);
			ctx.fillRect(0, 126, 256, 4);

			const tex = new THREE.CanvasTexture(canvas);
			tex.wrapS = THREE.RepeatWrapping;
			tex.wrapT = THREE.RepeatWrapping;
			tex.repeat.set(3, 1);
			return tex;
		});
	}

	/**
	 * 縞鋼板デッキ用バンプマップ（踏み面のダイヤモンド突起がライトを拾う）
	 */
	getDeckBumpTexture() {
		return this._getOrCreate('deck_bump', () => {
			const canvas = this._makeCanvas(256, 256);
			const ctx = canvas.getContext('2d');

			ctx.fillStyle = '#5a5a5a';
			ctx.fillRect(0, 0, 256, 256);

			ctx.strokeStyle = '#e5e5e5';
			ctx.lineWidth = 3;
			for (let y = 24; y < 232; y += 24) {
				for (let x = 12; x < 256; x += 24) {
					ctx.beginPath();
					if (((x + y) / 24) % 2 === 0) {
						ctx.moveTo(x - 6, y - 6);
						ctx.lineTo(x + 6, y + 6);
					} else {
						ctx.moveTo(x + 6, y - 6);
						ctx.lineTo(x - 6, y + 6);
					}
					ctx.stroke();
				}
			}

			// 縁のガイドリブ
			ctx.fillStyle = '#b4b4b4';
			ctx.fillRect(0, 0, 256, 16);
			ctx.fillRect(0, 240, 256, 16);

			const tex = new THREE.CanvasTexture(canvas);
			tex.wrapS = THREE.RepeatWrapping;
			tex.wrapT = THREE.ClampToEdgeWrapping;
			tex.repeat.set(6, 1);
			return tex;
		});
	}

	/**
	 * 網目グレーチング歩道用透過テクスチャ（下が透ける立体金属格子＋端の補強バー）
	 */
	getGratingTexture() {
		return this._getOrCreate('grating_alpha', () => {
			const canvas = this._makeCanvas(256, 256);
			const ctx = canvas.getContext('2d');

			// 縦の細長いベアリングバー群（光沢を拾う金属バー、隙間は透明）
			for (let x = 0; x < 256; x += 16) {
				ctx.fillStyle = '#9aa6b8';
				ctx.fillRect(x, 0, 5, 256);
				ctx.fillStyle = '#475569';
				ctx.fillRect(x + 5, 0, 2, 256);
			}

			// 横のクロスバー（細め）
			for (let y = 0; y < 256; y += 32) {
				ctx.fillStyle = '#7c889b';
				ctx.fillRect(0, y, 256, 4);
			}

			// 手前・奥エッジの強化フレーム帯（黄色のセーフティ縁）
			ctx.fillStyle = '#d99b1c';
			ctx.fillRect(0, 0, 256, 14);
			ctx.fillRect(0, 242, 256, 14);
			ctx.fillStyle = '#1e2530';
			ctx.fillRect(0, 14, 256, 4);
			ctx.fillRect(0, 238, 256, 4);

			const tex = new THREE.CanvasTexture(canvas);
			tex.wrapS = THREE.RepeatWrapping;
			tex.wrapT = THREE.ClampToEdgeWrapping;
			tex.repeat.set(4, 1);
			tex.colorSpace = THREE.SRGBColorSpace;
			return tex;
		});
	}

	/**
	 * 工場・機械塔の制御コンソールパネル用テクスチャ（LED計器・スイッチ・波形）
	 */
	getControlPanelTexture() {
		return this._getOrCreate('control_panel', () => {
			const canvas = this._makeCanvas(256, 128);
			const ctx = canvas.getContext('2d');

			ctx.fillStyle = '#18212f';
			ctx.fillRect(0, 0, 256, 128);
			ctx.strokeStyle = '#3b4a62';
			ctx.lineWidth = 4;
			ctx.strokeRect?.(2, 2, 252, 124);

			// メーターモニター枠
			ctx.fillStyle = '#0c1824';
			ctx.fillRect(14, 14, 108, 56);
			ctx.strokeStyle = '#38bdf8';
			ctx.lineWidth = 3;
			ctx.beginPath();
			ctx.moveTo(20, 46);
			ctx.lineTo(42, 32);
			ctx.lineTo(64, 54);
			ctx.lineTo(88, 24);
			ctx.lineTo(114, 42);
			ctx.stroke();

			// 右側ゲージ群
			const lampColors = ['#22c55e', '#f59e0b', '#ef4444', '#38bdf8'];
			for (let i = 0; i < 4; i += 1) {
				ctx.fillStyle = lampColors[i];
				ctx.beginPath();
				ctx.arc(146 + i * 26, 30, 8, 0, Math.PI * 2);
				ctx.fill();
			}

			// 下段バーインジケータ＆スイッチ
			for (let i = 0; i < 6; i += 1) {
				ctx.fillStyle = i < 4 ? '#f59e0b' : '#ef4444';
				ctx.fillRect(18 + i * 36, 86, 22, 26);
			}

			const tex = new THREE.CanvasTexture(canvas);
			tex.colorSpace = THREE.SRGBColorSpace;
			return tex;
		});
	}

	/**
	 * 工業用金属壁パネルテクスチャ（パネル目地＋リベット＋微細な汚れグラデーション）
	 */
	getIndustrialWallTexture(baseHex = '#232c3b', repeatX = 4, repeatY = 3) {
		return this._getOrCreate(`wall_${baseHex}_${repeatX}x${repeatY}`, () => {
			const canvas = this._makeCanvas(256, 256);
			const ctx = canvas.getContext('2d');

			ctx.fillStyle = baseHex;
			ctx.fillRect(0, 0, 256, 256);

			// 縦横パネル分割シーム
			ctx.fillStyle = 'rgba(0,0,0,0.42)';
			for (let p = 0; p < 256; p += 64) {
				ctx.fillRect(p, 0, 3, 256);
				ctx.fillRect(0, p, 256, 3);
			}
			ctx.fillStyle = 'rgba(255,255,255,0.08)';
			for (let p = 3; p < 256; p += 64) {
				ctx.fillRect(p, 0, 2, 256);
				ctx.fillRect(0, p, 256, 2);
			}

			// 金属スクラッチ・サビ色味
			for (let i = 0; i < 220; i += 1) {
				const x = Math.random() * 256;
				const y = Math.random() * 256;
				ctx.fillStyle = i % 3 === 0 ? 'rgba(130, 62, 34, 0.14)' : 'rgba(255,255,255,0.04)';
				ctx.fillRect(x, y, 4 + Math.random() * 14, 3 + Math.random() * 14);
			}

			// 四隅リベット
			for (let py = 0; py < 256; py += 64) {
				for (let px = 0; px < 256; px += 64) {
					for (const ox of [10, 54]) {
						for (const oy of [10, 54]) {
							ctx.fillStyle = 'rgba(0,0,0,0.5)';
							ctx.beginPath();
							ctx.arc(px + ox + 1, py + oy + 1, 2.2, 0, Math.PI * 2);
							ctx.fill();
							ctx.fillStyle = 'rgba(255,255,255,0.22)';
							ctx.beginPath();
							ctx.arc(px + ox, py + oy, 2.0, 0, Math.PI * 2);
							ctx.fill();
						}
					}
				}
			}

			const tex = new THREE.CanvasTexture(canvas);
			tex.wrapS = THREE.RepeatWrapping;
			tex.wrapT = THREE.RepeatWrapping;
			tex.repeat.set(repeatX, repeatY);
			tex.colorSpace = THREE.SRGBColorSpace;
			return tex;
		});
	}

	/**
	 * ボイラー・大型タンク塗装テクスチャ（溶接リング＋縦継ぎ目＋擦れ）
	 */
	getBoilerTexture(baseHex = '#a62626', repeatX = 1, repeatY = 1) {
		return this._getOrCreate(`boiler_${baseHex}_${repeatX}x${repeatY}`, () => {
			const canvas = this._makeCanvas(256, 256);
			const ctx = canvas.getContext('2d');

			ctx.fillStyle = baseHex;
			ctx.fillRect(0, 0, 256, 256);

			for (let i = 0; i < 240; i += 1) {
				const x = Math.random() * 256;
				const y = Math.random() * 256;
				ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.1)';
				ctx.fillRect(x, y, 8 + Math.random() * 28, 3);
			}

			// 横の溶接シームとリベット帯
			for (const sy of [64, 128, 192]) {
				ctx.fillStyle = 'rgba(0,0,0,0.35)';
				ctx.fillRect(0, sy, 256, 4);
				for (let rx = 12; rx < 256; rx += 24) {
					ctx.fillStyle = 'rgba(255,255,255,0.22)';
					ctx.beginPath();
					ctx.arc(rx, sy - 6, 2.6, 0, Math.PI * 2);
					ctx.fill();
				}
			}

			const tex = new THREE.CanvasTexture(canvas);
			tex.wrapS = THREE.RepeatWrapping;
			tex.wrapT = THREE.RepeatWrapping;
			tex.repeat.set(repeatX, repeatY);
			tex.colorSpace = THREE.SRGBColorSpace;
			return tex;
		});
	}

	/**
	 * 照明レンズや炎用のソフトな放射グロー・スプライトテクスチャ
	 */
	getGlowSpriteTexture() {
		return this._getOrCreate('glow_sprite', () => {
			const canvas = this._makeCanvas(128, 128);
			const ctx = canvas.getContext('2d');
			// キャンバス端に到達する前にアルファを完全に 0 へ落とし、矩形枠のにじみを防ぐ
			const grad = ctx.createRadialGradient(64, 64, 2, 64, 64, 52);
			grad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
			grad.addColorStop(0.22, 'rgba(255, 245, 220, 0.62)');
			grad.addColorStop(0.55, 'rgba(255, 210, 140, 0.16)');
			grad.addColorStop(1.0, 'rgba(255, 180, 100, 0.0)');
			ctx.fillStyle = grad;
			ctx.fillRect(0, 0, 128, 128);

			const tex = new THREE.CanvasTexture(canvas);
			tex.colorSpace = THREE.SRGBColorSpace;
			return tex;
		});
	}

	/**
	 * 廃墟・老朽コンクリート構造物用の風化壁面テクスチャ（汚れ・雨だれ・ひび割れ・ブロック目地）
	 */
	getRuinedStructureTexture(baseHex = '#2a2d35') {
		return this._getOrCreate(`ruined_struct_${baseHex}`, () => {
			const canvas = this._makeCanvas(256, 256);
			const ctx = canvas.getContext('2d');

			ctx.fillStyle = baseHex;
			ctx.fillRect(0, 0, 256, 256);

			// 老朽パネル・コンクリート打ち継ぎ目地
			ctx.fillStyle = 'rgba(0, 0, 0, 0.36)';
			for (let y = 0; y < 256; y += 64) {
				ctx.fillRect(0, y, 256, 3);
			}
			for (let x = 0; x < 256; x += 64) {
				ctx.fillRect(x, 0, 2, 256);
			}

			// 雨だれ・錆汁・煤汚れの縦筋
			for (let i = 0; i < 160; i += 1) {
				const x = Math.random() * 256;
				const y = Math.random() * 256;
				const h = 16 + Math.random() * 68;
				const w = 2 + Math.random() * 8;
				ctx.fillStyle = i % 3 === 0 ? 'rgba(92, 44, 24, 0.16)' : 'rgba(8, 10, 14, 0.22)';
				ctx.fillRect(x, y, w, h);
			}

			// コンクリート剥落パッチ＆ひび割れ
			for (let i = 0; i < 18; i += 1) {
				const cx = Math.random() * 256;
				const cy = Math.random() * 256;
				ctx.fillStyle = 'rgba(14, 16, 22, 0.34)';
				ctx.fillRect(cx - 8, cy - 5, 10 + Math.random() * 18, 8 + Math.random() * 14);

				ctx.strokeStyle = 'rgba(8, 10, 14, 0.65)';
				ctx.lineWidth = 1.6;
				ctx.beginPath();
				ctx.moveTo(cx, cy);
				ctx.lineTo(cx + (Math.random() - 0.5) * 34, cy + 12 + Math.random() * 24);
				ctx.lineTo(cx + (Math.random() - 0.5) * 44, cy + 28 + Math.random() * 32);
				ctx.stroke();
			}

			const tex = new THREE.CanvasTexture(canvas);
			tex.wrapS = THREE.RepeatWrapping;
			tex.wrapT = THREE.RepeatWrapping;
			tex.repeat.set(3, 3);
			tex.colorSpace = THREE.SRGBColorSpace;
			return tex;
		});
	}

	/**
	 * 境界・先端が滑らかに空気中へ溶け込むボリュメトリック風サーチライトビーム用 ShaderMaterial
	 * 一様な不透明度コーンによる「ラッパ状の切れ目」を防ぐ。
	 * ※ インスタンスごとに返却するため、呼び出し側（StageManager 等）で dispose 管理する。
	 * @param {number} [colorHex]
	 * @param {number} [opacity]
	 */
	createVolumetricBeamMaterial(colorHex = 0xffe4b8, opacity = 0.24) {
		return new THREE.ShaderMaterial({
			uniforms: {
				uColor: { value: new THREE.Color(colorHex) },
				uOpacity: { value: opacity },
				uTime: { value: 0 }
			},
			vertexShader: `
				varying vec2 vUv;
				varying vec3 vViewNormal;
				varying vec3 vViewDir;
				void main() {
					vUv = uv;
					vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
					vViewNormal = normalize(normalMatrix * normal);
					vViewDir = normalize(-mvPos.xyz);
					gl_Position = projectionMatrix * mvPos;
				}
			`,
			fragmentShader: `
				uniform vec3 uColor;
				uniform float uOpacity;
				uniform float uTime;
				varying vec2 vUv;
				varying vec3 vViewNormal;
				varying vec3 vViewDir;
				void main() {
					// vUv.y = 1.0 が光源側、0.0 が拡散端。終端より十分に手前でゼロへ減衰させて切れ目を消す
					float topSoft = smoothstep(1.0, 0.93, vUv.y);
					float axial = smoothstep(0.08, 0.88, vUv.y);
					axial = axial * axial * topSoft;

					// 輪郭のフレネル減衰（正面側が最も濃く、側面エッジが空気へ溶ける）
					float ndotv = clamp(abs(dot(normalize(vViewNormal), normalize(vViewDir))), 0.0, 1.0);
					float fresnel = pow(ndotv, 2.6);

					// 微弱な空気中の塵・揺らぎ
					float shimmer = 0.92 + 0.08 * sin(vUv.y * 10.0 - uTime * 1.4);

					float alpha = uOpacity * axial * fresnel * shimmer;
					if (alpha < 0.002) {
						discard;
					}
					gl_FragColor = vec4(uColor, alpha);
				}
			`,
			transparent: true,
			depthWrite: false,
			blending: THREE.AdditiveBlending,
			side: THREE.FrontSide
		});
	}

	/**
	 * ゆらゆら揺らめく有機的な炎用 ShaderMaterial
	 * 頂点シェーダーで先端を S 字に揺らし、フラグメントの FBM 乱流ノイズで立ち昇る火の舌を切り出す。
	 * @param {{ speed?: number, sway?: number, intensity?: number, seed?: number, coreBias?: number }} [opts]
	 */
	createRealisticFlameMaterial(opts = {}) {
		return new THREE.ShaderMaterial({
			uniforms: {
				uTime: { value: 0 },
				uSpeed: { value: opts.speed ?? 2.35 },
				uSway: { value: opts.sway ?? 0.22 },
				uIntensity: { value: opts.intensity ?? 1.35 },
				uSeed: { value: opts.seed ?? 0.0 },
				uCoreBias: { value: opts.coreBias ?? 0.0 }
			},
			vertexShader: `
				uniform float uTime;
				uniform float uSpeed;
				uniform float uSway;
				uniform float uSeed;
				varying vec2 vUv;
				void main() {
					vUv = uv;
					vec3 pos = position;
					float h = clamp(uv.y, 0.0, 1.0);
					float swayFactor = h * h;
					float t = uTime * (uSpeed * 0.95) + uSeed;
					float waveX = sin(t * 2.3 + h * 5.2) * 0.65 + cos(t * 3.7 + h * 8.4) * 0.35;
					float waveZ = cos(t * 1.9 + h * 4.6 + 1.3) * 0.55 + sin(t * 3.1 + h * 7.2) * 0.25;
					pos.x += waveX * uSway * swayFactor;
					pos.z += waveZ * uSway * swayFactor;
					// 先端側を細らせつつわずかに脈動させる
					float pinch = mix(1.0, 0.42 + 0.14 * sin(t * 4.2 + h * 6.0), h);
					pos.x *= mix(1.0, pinch, 0.45);
					gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
				}
			`,
			fragmentShader: `
				uniform float uTime;
				uniform float uSpeed;
				uniform float uIntensity;
				uniform float uSeed;
				uniform float uCoreBias;
				varying vec2 vUv;

				float hash21(vec2 p) {
					p = fract(p * vec2(123.34, 456.21));
					p += dot(p, p + 45.32);
					return fract(p.x * p.y);
				}

				float noise2d(vec2 p) {
					vec2 i = floor(p);
					vec2 f = fract(p);
					f = f * f * (3.0 - 2.0 * f);
					float a = hash21(i);
					float b = hash21(i + vec2(1.0, 0.0));
					float c = hash21(i + vec2(0.0, 1.0));
					float d = hash21(i + vec2(1.0, 1.0));
					return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
				}

				float fbm(vec2 p) {
					float v = 0.0;
					float amp = 0.52;
					for (int i = 0; i < 4; i++) {
						v += amp * noise2d(p);
						p = p * 2.07 + vec2(1.7, 3.1);
						amp *= 0.5;
					}
					return v;
				}

				void main() {
					float y = clamp(vUv.y, 0.0, 1.0);
					float distFromCenter = abs(vUv.x - 0.5) * 2.0;

					// 上昇する乱流と左右のゆらぎで三角形の輪郭を崩す
					float t = uTime * uSpeed + uSeed;
					vec2 flowUv = vec2(vUv.x * 3.8 + sin(y * 5.0 - t * 1.6) * 0.28, y * 2.5 - t * 1.15);
					float n1 = fbm(flowUv);
					float n2 = fbm(flowUv * 1.9 + vec2(2.4, -t * 0.7));
					float turb = mix(n1, n2, 0.45);

					// 炎の幅プロファイル：根元は丸く太く、上に向かって乱流でちぎれながら細まる
					float halfWidth = mix(0.88, 0.14, pow(y, 0.82)) + (turb - 0.48) * (0.42 + y * 0.25);
					float radial = 1.0 - smoothstep(max(0.02, halfWidth - 0.34), max(0.08, halfWidth), distFromCenter);

					// 縦方向の出現・先端のちぎれ消滅
					float baseFade = smoothstep(0.0, 0.12, y);
					float tipCut = 1.0 - smoothstep(0.45, 1.0, y + (0.52 - turb) * 0.62);
					float flicker = 0.86 + 0.14 * sin(t * 5.3 + y * 4.0);

					float density = clamp(radial * baseFade * tipCut * (0.72 + turb * 0.75) * flicker, 0.0, 1.0);
					if (density < 0.015) {
						discard;
					}

					// 温度に応じた色彩グラデーション（深紅 → オレンジ → 白熱イエロー）
					float heat = clamp(density * (1.15 - y * 0.55) + uCoreBias * 0.35, 0.0, 1.0);
					vec3 deepRed = vec3(0.88, 0.12, 0.02);
					vec3 brightOrange = vec3(1.0, 0.46, 0.05);
					vec3 hotYellow = vec3(1.0, 0.94, 0.66);

					vec3 col = mix(deepRed, brightOrange, smoothstep(0.08, 0.52, heat));
					col = mix(col, hotYellow, smoothstep(0.54, 0.94, heat));

					float alpha = pow(density, 1.15) * 0.92;
					gl_FragColor = vec4(col * alpha * uIntensity, alpha);
				}
			`,
			transparent: true,
			depthWrite: false,
			blending: THREE.AdditiveBlending,
			side: THREE.DoubleSide
		});
	}

	/**
	 * 姫キャラ頭部用の高精細アニメ調フェイステクスチャ（1024x512 正距円筒：正面 +Z が u=0.25, x=256）
	 * Node.js 等の Canvas2D 非対応環境では null を返し、フォールバック単色肌マテリアルを使えるようにする。
	 */
	getPrincessFaceTexture() {
		if (typeof document === 'undefined') {
			return null;
		}
		if (this._cache.has('princess_face_v7')) {
			return this._cache.get('princess_face_v7');
		}
		const canvas = this._makeCanvas(1024, 512);
		const ctx = canvas?.getContext?.('2d');
		if (!ctx || typeof ctx.bezierCurveTo !== 'function' || typeof ctx.createRadialGradient !== 'function') {
			return null;
		}
		return this._getOrCreate('princess_face_v7', () => {
			// 首・耳・鼻（0xfce0cf）と継ぎ目の出ない、明るく透明感のあるウォームピーチベース肌色
			ctx.fillStyle = '#fce0cf';
			ctx.fillRect(0, 0, 1024, 512);

			const cx = 256;

			// 顔前面全体と顎下に透明感・血色感を与える柔らかなバウンスハイライト
			const lowerBounce = ctx.createLinearGradient(cx, 250, cx, 490);
			lowerBounce.addColorStop(0, 'rgba(255, 236, 224, 0.10)');
			lowerBounce.addColorStop(0.42, 'rgba(255, 230, 218, 0.42)');
			lowerBounce.addColorStop(1, 'rgba(252, 222, 206, 0.34)');
			ctx.fillStyle = lowerBounce;
			ctx.fillRect(0, 250, 512, 250);

			const faceGlow = ctx.createRadialGradient(cx, 282, 24, cx, 282, 170);
			faceGlow.addColorStop(0, 'rgba(255, 248, 242, 0.55)');
			faceGlow.addColorStop(0.7, 'rgba(255, 240, 230, 0.22)');
			faceGlow.addColorStop(1, 'rgba(255, 240, 230, 0)');
			ctx.fillStyle = faceGlow;
			ctx.fillRect(cx - 180, 120, 360, 300);

			// 頬のふんわりとした温かいコーラルチーク
			for (const side of [-1, 1]) {
				const bx = cx + side * 72;
				const by = 302;
				const blush = ctx.createRadialGradient(bx, by, 4, bx, by, 40);
				blush.addColorStop(0, 'rgba(248, 128, 150, 0.38)');
				blush.addColorStop(0.55, 'rgba(248, 128, 150, 0.14)');
				blush.addColorStop(1, 'rgba(248, 128, 150, 0)');
				ctx.fillStyle = blush;
				ctx.beginPath();
				ctx.ellipse(bx, by, 40, 24, 0, 0, Math.PI * 2);
				ctx.fill();
			}

			// 小顔に映え、正面〜斜め〜真横のすべてから愛らしく輝く大きなサファイア〜ターコイズの瞳
			for (const side of [-1, 1]) {
				const ex = cx + side * 49;
				const ey = 266;

				// 目尻側を外へ優しく伸ばした大きな丸みアーモンド輪郭
				const traceEyeShape = () => {
					ctx.beginPath();
					ctx.moveTo(ex - side * 24.5, ey + 3.0);
					ctx.bezierCurveTo(
						ex - side * 14.5, ey - 27.5,
						ex + side * 16.0, ey - 28.5,
						ex + side * 31.5, ey - 2.0
					);
					ctx.bezierCurveTo(
						ex + side * 22.0, ey + 25.0,
						ex - side * 12.5, ey + 24.5,
						ex - side * 24.5, ey + 3.0
					);
					ctx.closePath();
				};

				ctx.save();
				traceEyeShape();
				ctx.fillStyle = '#ffffff';
				ctx.fill();
				ctx.clip();

				// 白目上部の清潔で柔らかなシャドウ
				const scleraGrad = ctx.createLinearGradient(ex, ey - 28, ex, ey + 24);
				scleraGrad.addColorStop(0, 'rgba(176, 198, 236, 0.38)');
				scleraGrad.addColorStop(0.32, 'rgba(176, 198, 236, 0.06)');
				scleraGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
				ctx.fillStyle = scleraGrad;
				ctx.fillRect(ex - 36, ey - 34, 72, 68);

				// 大きめで澄んだロイヤルブルー〜ターコイズ虹彩
				const ix = ex + side * 0.5;
				const iy = ey + 1.0;
				const irisGrad = ctx.createLinearGradient(ix, iy - 24, ix, iy + 24);
				irisGrad.addColorStop(0, '#0b2563');
				irisGrad.addColorStop(0.38, '#0369a1');
				irisGrad.addColorStop(0.72, '#06b6d4');
				irisGrad.addColorStop(0.94, '#67e8f9');
				irisGrad.addColorStop(1, '#cffafe');
				ctx.fillStyle = irisGrad;
				ctx.beginPath();
				ctx.ellipse(ix, iy, 21.5, 23.8, 0, 0, Math.PI * 2);
				ctx.fill();

				// 虹彩外縁の引き締めリム
				ctx.strokeStyle = '#091942';
				ctx.lineWidth = 2.3;
				ctx.stroke();

				// 存在感のある大きめの瞳孔
				ctx.fillStyle = '#071024';
				ctx.beginPath();
				ctx.ellipse(ix, iy + 0.5, 10.0, 11.2, 0, 0, Math.PI * 2);
				ctx.fill();

				// 主星・副星・アクセントの透明感あるハイライト
				ctx.fillStyle = '#ffffff';
				ctx.beginPath();
				ctx.ellipse(ix - 6.5, iy - 7.2, 6.7, 6.3, -0.25, 0, Math.PI * 2);
				ctx.fill();

				ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
				ctx.beginPath();
				ctx.arc(ix + 6.0, iy + 7.0, 2.9, 0, Math.PI * 2);
				ctx.fill();

				ctx.fillStyle = 'rgba(255, 255, 255, 0.84)';
				ctx.beginPath();
				ctx.arc(ix + 7.0, iy - 6.6, 2.0, 0, Math.PI * 2);
				ctx.fill();

				ctx.restore();

				// 濃茶ブラックの美しい上まつ毛アーチ
				ctx.strokeStyle = '#211412';
				ctx.lineWidth = 6.4;
				ctx.lineCap = 'round';
				ctx.beginPath();
				ctx.moveTo(ex - side * 24.5, ey + 3.0);
				ctx.bezierCurveTo(
					ex - side * 14.5, ey - 27.5,
					ex + side * 16.0, ey - 28.5,
					ex + side * 31.5, ey - 2.0
				);
				ctx.stroke();

				// 目尻上部の3本のキュートな跳ねまつ毛
				const outerLashes = [
					{ bx: 16.5, by: -19.5, tx: 23.0, ty: -28.0, w: 3.1 },
					{ bx: 23.0, by: -13.0, tx: 32.5, ty: -20.0, w: 3.3 },
					{ bx: 28.5, by: -5.5, tx: 38.0, ty: -9.5, w: 2.9 }
				];
				for (const lash of outerLashes) {
					ctx.lineWidth = lash.w;
					ctx.beginPath();
					ctx.moveTo(ex + side * lash.bx, ey + lash.by);
					ctx.quadraticCurveTo(
						ex + side * ((lash.bx + lash.tx) * 0.52),
						ey + (lash.by + lash.ty) * 0.46,
						ex + side * lash.tx,
						ey + lash.ty
					);
					ctx.stroke();
				}

				// 下まぶたの柔らかな輪郭ライン
				ctx.strokeStyle = 'rgba(136, 78, 70, 0.28)';
				ctx.lineWidth = 1.5;
				ctx.beginPath();
				ctx.moveTo(ex - side * 11.0, ey + 20.5);
				ctx.quadraticCurveTo(ex + side * 7.0, ey + 23.5, ex + side * 24.5, ey + 10.5);
				ctx.stroke();

				// 優しい二重まぶたライン
				ctx.strokeStyle = 'rgba(186, 118, 104, 0.46)';
				ctx.lineWidth = 1.6;
				ctx.beginPath();
				ctx.moveTo(ex - side * 18.0, ey - 20.0);
				ctx.quadraticCurveTo(ex + side * 3.0, ey - 34.5, ex + side * 24.5, ey - 21.0);
				ctx.stroke();

				// 柔和で上品なアーチのブロンドブラウン眉
				ctx.strokeStyle = '#9b662c';
				ctx.lineWidth = 3.9;
				ctx.beginPath();
				ctx.moveTo(ex - side * 20.5, ey - 38.5);
				ctx.quadraticCurveTo(ex + side * 3.0, ey - 48.5, ex + side * 27.0, ey - 37.0);
				ctx.stroke();
			}

			// 鼻すぐ下に愛らしく微笑む、白い歯が綺麗に覗く横広めのスマイル口元
			const my = 332.0;
			const traceSmileShape = () => {
				ctx.beginPath();
				ctx.moveTo(cx - 21.5, my - 3.0);
				ctx.quadraticCurveTo(cx - 9.0, my - 5.2, cx, my - 2.6);
				ctx.quadraticCurveTo(cx + 9.0, my - 5.2, cx + 21.5, my - 3.0);
				ctx.bezierCurveTo(cx + 13.0, my + 9.2, cx - 13.0, my + 9.2, cx - 21.5, my - 3.0);
				ctx.closePath();
			};

			ctx.save();
			traceSmileShape();
			ctx.fillStyle = '#eb7288';
			ctx.fill();
			ctx.clip();

			// 上側の清潔な白い前歯と、下側の明るいコーラルピンクの舌
			ctx.fillStyle = '#ffffff';
			ctx.beginPath();
			ctx.ellipse(cx, my - 1.6, 17.0, 4.2, 0, 0, Math.PI * 2);
			ctx.fill();

			ctx.fillStyle = '#f8a5b4';
			ctx.beginPath();
			ctx.ellipse(cx, my + 5.8, 11.0, 3.6, 0, 0, Math.PI * 2);
			ctx.fill();
			ctx.restore();

			// 柔らかいローズコーラルの上下リップライン
			ctx.strokeStyle = '#d16478';
			ctx.lineWidth = 2.0;
			ctx.lineCap = 'round';
			ctx.beginPath();
			ctx.moveTo(cx - 21.5, my - 3.0);
			ctx.quadraticCurveTo(cx - 9.0, my - 5.2, cx, my - 2.6);
			ctx.quadraticCurveTo(cx + 9.0, my - 5.2, cx + 21.5, my - 3.0);
			ctx.stroke();

			ctx.strokeStyle = 'rgba(222, 114, 134, 0.78)';
			ctx.lineWidth = 1.8;
			ctx.beginPath();
			ctx.moveTo(cx - 19.5, my - 2.0);
			ctx.bezierCurveTo(cx - 11.5, my + 8.4, cx + 11.5, my + 8.4, cx + 19.5, my - 2.0);
			ctx.stroke();

			// 下唇のほのかな艶感
			ctx.fillStyle = 'rgba(255, 232, 228, 0.58)';
			ctx.beginPath();
			ctx.ellipse(cx, my + 9.6, 9.0, 2.0, 0, 0, Math.PI * 2);
			ctx.fill();

			const tex = new THREE.CanvasTexture(canvas);
			tex.colorSpace = THREE.SRGBColorSpace;
			return tex;
		});
	}

	disposeAll() {
		for (const tex of this._cache.values()) {
			tex?.dispose?.();
		}
		this._cache.clear();
	}
}

export const textureFactory = new TextureFactory();
