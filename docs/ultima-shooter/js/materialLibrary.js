/**
 * @fileoverview materialLibrary.js
 * プロシージャル PBR テクスチャ（機体パネルライン／ラフネス）および
 * 環境マップ（IBL: Image-Based Lighting）生成ユーティリティ。
 * 外部画像ファイルに依存せず、金属反射とハードサーフェスの陰影を劇的に向上させる。
 */

const MaterialLibrary = (() => {
	/** @type {THREE.CanvasTexture|null} */
	let airframeBumpTex = null;
	/** @type {THREE.CanvasTexture|null} */
	let airframeRoughnessTex = null;
	/** @type {THREE.CanvasTexture|null} */
	let rockBumpTex = null;
	/** @type {THREE.CanvasTexture|null} */
	let rockRoughnessTex = null;
	/** @type {THREE.CanvasTexture|null} */
	let caveBumpTex = null;
	/** @type {THREE.CanvasTexture|null} */
	let caveRoughnessTex = null;

	/**
	 * 航空機外板のパネルライン・リベット・微細ブラッシュド加工のバンプマップを生成
	 * @returns {THREE.CanvasTexture}
	 */
	function getAirframeBumpTexture() {
		if (airframeBumpTex) return airframeBumpTex;

		const size = 256;
		const canvas = document.createElement('canvas');
		canvas.width = size;
		canvas.height = size;
		const ctx = canvas.getContext('2d');

		// ベース面（中間グレー）
		ctx.fillStyle = '#888888';
		ctx.fillRect(0, 0, size, size);

		// パネルごとの僅かな高さ・艶のバリエーション
		const panels = [
			[0, 0, 128, 128, '#929292'],
			[128, 0, 128, 96, '#808080'],
			[128, 96, 128, 160, '#8d8d8d'],
			[0, 128, 128, 128, '#848484']
		];
		for (const [x, y, w, h, col] of panels) {
			ctx.fillStyle = col;
			ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
		}

		// 縦方向の微細なブラッシュドメタル筋
		for (let i = 0; i < 420; i++) {
			const x = Math.random() * size;
			const y = Math.random() * size;
			const len = 18 + Math.random() * 48;
			const shade = Math.random() > 0.5 ? 150 : 118;
			ctx.fillStyle = `rgba(${shade},${shade},${shade},0.16)`;
			ctx.fillRect(x, y, 1, len);
		}

		// シャープなパネルライン溝（暗線＋隣接ハイライトエッジ）
		ctx.strokeStyle = '#303030';
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.moveTo(0, 128);
		ctx.lineTo(size, 128);
		ctx.moveTo(128, 0);
		ctx.lineTo(128, size);
		ctx.moveTo(128, 96);
		ctx.lineTo(size, 96);
		ctx.moveTo(0, 64);
		ctx.lineTo(128, 64);
		ctx.stroke();

		ctx.strokeStyle = '#b4b4b4';
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.moveTo(0, 130);
		ctx.lineTo(size, 130);
		ctx.moveTo(130, 0);
		ctx.lineTo(130, size);
		ctx.stroke();

		// リベット点描
		ctx.fillStyle = '#484848';
		for (let p = 12; p < size; p += 20) {
			ctx.fillRect(122, p, 2, 2);
			ctx.fillRect(133, p, 2, 2);
			ctx.fillRect(p, 122, 2, 2);
			ctx.fillRect(p, 133, 2, 2);
		}

		const tex = new THREE.CanvasTexture(canvas);
		tex.wrapS = THREE.RepeatWrapping;
		tex.wrapT = THREE.RepeatWrapping;
		tex.repeat.set(2, 2);
		airframeBumpTex = tex;
		return tex;
	}

	/**
	 * 航空機外板のラフネスマップを生成（パネル面は滑らか、溝や継ぎ目はマット）
	 * @returns {THREE.CanvasTexture}
	 */
	function getAirframeRoughnessTexture() {
		if (airframeRoughnessTex) return airframeRoughnessTex;

		const size = 256;
		const canvas = document.createElement('canvas');
		canvas.width = size;
		canvas.height = size;
		const ctx = canvas.getContext('2d');

		// 基本は低〜中ラフネス（金属光沢が映える）
		ctx.fillStyle = '#5a5a5a';
		ctx.fillRect(0, 0, size, size);

		// パネル単位の光沢差
		ctx.fillStyle = '#484848';
		ctx.fillRect(2, 2, 124, 124);
		ctx.fillStyle = '#686868';
		ctx.fillRect(130, 2, 124, 92);
		ctx.fillStyle = '#525252';
		ctx.fillRect(130, 98, 124, 156);

		// 溝部分は粗く（白寄り）して反射を切る
		ctx.strokeStyle = '#d8d8d8';
		ctx.lineWidth = 3;
		ctx.beginPath();
		ctx.moveTo(0, 128);
		ctx.lineTo(size, 128);
		ctx.moveTo(128, 0);
		ctx.lineTo(128, size);
		ctx.moveTo(128, 96);
		ctx.lineTo(size, 96);
		ctx.stroke();

		const tex = new THREE.CanvasTexture(canvas);
		tex.wrapS = THREE.RepeatWrapping;
		tex.wrapT = THREE.RepeatWrapping;
		tex.repeat.set(2, 2);
		airframeRoughnessTex = tex;
		return tex;
	}

	/**
	 * 決定論的な簡易2Dハッシュ（0.0〜1.0）
	 */
	function _hash2d(ix, iy, seed) {
		const n = Math.sin(ix * 127.1 + iy * 311.7 + seed * 74.7) * 43758.5453123;
		return n - Math.floor(n);
	}

	/**
	 * タイリング可能な2Dバリューノイズ（周期 period）
	 */
	function _tileNoise2d(x, y, period, seed) {
		const xi = Math.floor(x);
		const yi = Math.floor(y);
		const xf = x - xi;
		const yf = y - yi;
		const u = xf * xf * (3.0 - 2.0 * xf);
		const v = yf * yf * (3.0 - 2.0 * yf);

		const x0 = ((xi % period) + period) % period;
		const x1 = (x0 + 1) % period;
		const y0 = ((yi % period) + period) % period;
		const y1 = (y0 + 1) % period;

		const v00 = _hash2d(x0, y0, seed);
		const v10 = _hash2d(x1, y0, seed);
		const v01 = _hash2d(x0, y1, seed);
		const v11 = _hash2d(x1, y1, seed);

		const nx0 = v00 + (v10 - v00) * u;
		const nx1 = v01 + (v11 - v01) * u;
		return nx0 + (nx1 - nx0) * v;
	}

	/**
	 * 岩石・小惑星用の多層 FBM＋亀裂バンプ＆ラフネステクスチャを生成
	 */
	function _buildRockTexturePair(seed, repeatX, repeatY, strataStrength) {
		const size = 256;
		const bumpCanvas = document.createElement('canvas');
		bumpCanvas.width = size;
		bumpCanvas.height = size;
		const bCtx = bumpCanvas.getContext('2d');
		const bImg = bCtx.createImageData(size, size);

		const roughCanvas = document.createElement('canvas');
		roughCanvas.width = size;
		roughCanvas.height = size;
		const rCtx = roughCanvas.getContext('2d');
		const rImg = rCtx.createImageData(size, size);

		for (let py = 0; py < size; py++) {
			const ny = py / size;
			for (let px = 0; px < size; px++) {
				const nx = px / size;
				// 3オクターブのタイリング FBM ノイズ
				const n1 = _tileNoise2d(nx * 6, ny * 6, 6, seed);
				const n2 = _tileNoise2d(nx * 14, ny * 14, 14, seed + 19);
				const n3 = _tileNoise2d(nx * 32, ny * 32, 32, seed + 47);
				let h = n1 * 0.55 + n2 * 0.30 + n3 * 0.15;

				// 層状（地層）うねりと亀裂リッジ
				if (strataStrength > 0) {
					const strata = Math.sin((ny * 8.0 + n1 * 1.4) * Math.PI * 2) * 0.5 + 0.5;
					h = h * (1.0 - strataStrength) + strata * strataStrength;
				}
				const ridge = 1.0 - Math.abs(n2 * 2.0 - 1.0);
				const crack = ridge > 0.88 ? (ridge - 0.88) / 0.12 : 0.0;
				const bumpVal = Math.max(0, Math.min(255, Math.round((h - crack * 0.35) * 255)));

				// 凸面はやや光沢ある鉱物面、亀裂・窪みは完全にマット
				const roughNorm = Math.max(0.45, Math.min(0.98, 0.88 - h * 0.32 + crack * 0.25));
				const roughVal = Math.round(roughNorm * 255);

				const idx = (py * size + px) * 4;
				bImg.data[idx] = bumpVal;
				bImg.data[idx + 1] = bumpVal;
				bImg.data[idx + 2] = bumpVal;
				bImg.data[idx + 3] = 255;

				rImg.data[idx] = roughVal;
				rImg.data[idx + 1] = roughVal;
				rImg.data[idx + 2] = roughVal;
				rImg.data[idx + 3] = 255;
			}
		}

		bCtx.putImageData(bImg, 0, 0);
		rCtx.putImageData(rImg, 0, 0);

		const bump = new THREE.CanvasTexture(bumpCanvas);
		bump.wrapS = THREE.RepeatWrapping;
		bump.wrapT = THREE.RepeatWrapping;
		bump.repeat.set(repeatX, repeatY);

		const rough = new THREE.CanvasTexture(roughCanvas);
		rough.wrapS = THREE.RepeatWrapping;
		rough.wrapT = THREE.RepeatWrapping;
		rough.repeat.set(repeatX, repeatY);

		return { bump, rough };
	}

	/**
	 * 浮遊岩・小惑星用バンプマップを取得
	 * @returns {THREE.CanvasTexture}
	 */
	function getRockBumpTexture() {
		if (!rockBumpTex) {
			const pair = _buildRockTexturePair(101, 2, 2, 0.12);
			rockBumpTex = pair.bump;
			rockRoughnessTex = pair.rough;
		}
		return rockBumpTex;
	}

	/**
	 * 浮遊岩・小惑星用ラフネスマップを取得
	 * @returns {THREE.CanvasTexture}
	 */
	function getRockRoughnessTexture() {
		if (!rockRoughnessTex) getRockBumpTexture();
		return rockRoughnessTex;
	}

	/**
	 * 洞窟壁面用（地層＋亀裂）バンプマップを取得
	 * @returns {THREE.CanvasTexture}
	 */
	function getCaveBumpTexture() {
		if (!caveBumpTex) {
			const pair = _buildRockTexturePair(307, 4, 2, 0.28);
			caveBumpTex = pair.bump;
			caveRoughnessTex = pair.rough;
		}
		return caveBumpTex;
	}

	/**
	 * 洞窟壁面用ラフネスマップを取得
	 * @returns {THREE.CanvasTexture}
	 */
	function getCaveRoughnessTexture() {
		if (!caveRoughnessTex) getCaveBumpTexture();
		return caveRoughnessTex;
	}

	/**
	 * 高コントラストなスタジオ＆スカイ型プロシージャル環境マップ（PMREM）を生成する。
	 * PBR 金属面・キャノピー・ハードエッジに鋭いハイライトと深い陰影を与える。
	 * @param {THREE.WebGLRenderer} webGLRenderer
	 * @returns {{texture: THREE.Texture, dispose: Function}|null}
	 */
	function createEnvironmentMap(webGLRenderer) {
		if (!webGLRenderer || typeof THREE.PMREMGenerator !== 'function') {
			return null;
		}

		const width = 512;
		const height = 256;
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		const ctx = canvas.getContext('2d');

		// 1. ベース空〜地平線〜地面グラデーション
		const skyGrad = ctx.createLinearGradient(0, 0, 0, height);
		skyGrad.addColorStop(0.0, '#d8f0ff');   // 天頂: クールホワイト・ブルー
		skyGrad.addColorStop(0.22, '#6ea6cc');  // 上空: メタリックな青空
		skyGrad.addColorStop(0.46, '#22384c');  // 地平線直上: 引き締まったスレート
		skyGrad.addColorStop(0.50, '#a8d6f0');  // 地平線バンド: 鋭い反射ライン
		skyGrad.addColorStop(0.54, '#141e2a');  // 地平線直下: 暗部コントラスト
		skyGrad.addColorStop(1.0, '#070b12');   // 地面側: 深いダークトーン
		ctx.fillStyle = skyGrad;
		ctx.fillRect(0, 0, width, height);

		// 2. スタジオ用ソフトボックス反射パネル（上面・斜め前方に鋭い光沢帯を作る）
		const drawSoftbox = (cx, cy, rx, ry, colorCore, colorEdge) => {
			ctx.save();
			ctx.translate(cx, cy);
			ctx.scale(rx, ry);
			const g = ctx.createRadialGradient(0, 0, 0.05, 0, 0, 1.0);
			g.addColorStop(0.0, colorCore);
			g.addColorStop(0.55, colorEdge);
			g.addColorStop(1.0, 'rgba(0,0,0,0)');
			ctx.fillStyle = g;
			ctx.beginPath();
			ctx.arc(0, 0, 1.0, 0, Math.PI * 2);
			ctx.fill();
			ctx.restore();
		};

		// メインキー光反射（斜め上方）
		drawSoftbox(width * 0.28, height * 0.20, 110, 36, 'rgba(255,255,255,0.95)', 'rgba(180,225,255,0.45)');
		// 対角リム光反射（クールシアン）
		drawSoftbox(width * 0.78, height * 0.28, 95, 30, 'rgba(210,242,255,0.85)', 'rgba(90,175,230,0.30)');
		// 地平線付近のわずかなウォーム・アンバー反射（キャノピーやエッジの差し色）
		drawSoftbox(width * 0.62, height * 0.49, 80, 14, 'rgba(255,210,140,0.65)', 'rgba(255,150,60,0.12)');

		const equirectTex = new THREE.CanvasTexture(canvas);
		equirectTex.mapping = THREE.EquirectangularReflectionMapping;

		const pmremGenerator = new THREE.PMREMGenerator(webGLRenderer);
		pmremGenerator.compileEquirectangularShader();
		const envRT = pmremGenerator.fromEquirectangular(equirectTex);

		equirectTex.dispose();
		pmremGenerator.dispose();

		return {
			texture: envRT.texture,
			dispose: () => envRT.dispose()
		};
	}

	/**
	 * Z軸方向の複数断面（[x, y] 頂点列）を補間してハードサーフェス多面体 BufferGeometry を生成する。
	 * 各断面の頂点列は +Z 側から見て反時計回り（右 → 上 → 左 → 下）を基準とする。
	 * @param {Array<{z: number, points: Array<[number, number]>}>} sections - 前方(-Z)から後方(+Z)順の断面配列
	 * @param {boolean} [capFront=true]
	 * @param {boolean} [capRear=true]
	 * @param {boolean} [flipWinding=false]
	 * @returns {THREE.BufferGeometry}
	 */
	function createLoftedGeometry(sections, capFront = true, capRear = true, flipWinding = false) {
		const positions = [];
		const uvs = [];

		const pushTri = (a, b, c, uva, uvb, uvc) => {
			if (flipWinding) {
				positions.push(a[0], a[1], a[2], c[0], c[1], c[2], b[0], b[1], b[2]);
				uvs.push(uva[0], uva[1], uvc[0], uvc[1], uvb[0], uvb[1]);
			} else {
				positions.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
				uvs.push(uva[0], uva[1], uvb[0], uvb[1], uvc[0], uvc[1]);
			}
		};

		const ringLen = sections[0].points.length;
		const totalZ = Math.max(0.001, Math.abs(sections[sections.length - 1].z - sections[0].z));
		const zStart = sections[0].z;

		for (let s = 0; s < sections.length - 1; s++) {
			const sec0 = sections[s];
			const sec1 = sections[s + 1];
			const v0 = Math.abs(sec0.z - zStart) / totalZ;
			const v1 = Math.abs(sec1.z - zStart) / totalZ;

			for (let i = 0; i < ringLen; i++) {
				const j = (i + 1) % ringLen;
				const p00 = [sec0.points[i][0], sec0.points[i][1], sec0.z];
				const p01 = [sec0.points[j][0], sec0.points[j][1], sec0.z];
				const p11 = [sec1.points[j][0], sec1.points[j][1], sec1.z];
				const p10 = [sec1.points[i][0], sec1.points[i][1], sec1.z];

				const u0 = i / ringLen;
				const u1 = (i + 1) / ringLen;

				pushTri(p00, p01, p11, [u0, v0], [u1, v0], [u1, v1]);
				pushTri(p00, p11, p10, [u0, v0], [u1, v1], [u0, v1]);
			}
		}

		if (capFront) {
			const first = sections[0];
			let cx = 0;
			let cy = 0;
			for (const pt of first.points) {
				cx += pt[0];
				cy += pt[1];
			}
			cx /= ringLen;
			cy /= ringLen;
			const center = [cx, cy, first.z];

			for (let i = 0; i < ringLen; i++) {
				const j = (i + 1) % ringLen;
				const pi = [first.points[i][0], first.points[i][1], first.z];
				const pj = [first.points[j][0], first.points[j][1], first.z];
				pushTri(center, pj, pi, [0.5, 0.5], [1, 0], [0, 0]);
			}
		}

		if (capRear) {
			const last = sections[sections.length - 1];
			let cx = 0;
			let cy = 0;
			for (const pt of last.points) {
				cx += pt[0];
				cy += pt[1];
			}
			cx /= ringLen;
			cy /= ringLen;
			const center = [cx, cy, last.z];

			for (let i = 0; i < ringLen; i++) {
				const j = (i + 1) % ringLen;
				const pi = [last.points[i][0], last.points[i][1], last.z];
				const pj = [last.points[j][0], last.points[j][1], last.z];
				pushTri(center, pi, pj, [0.5, 0.5], [0, 1], [1, 1]);
			}
		}

		const geo = new THREE.BufferGeometry();
		geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
		geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
		geo.computeVertexNormals();
		return geo;
	}

	/**
	 * X軸方向に断面を並べて翼・フィン用の立体テーパージオメトリを生成する
	 * @param {Array<{x: number, points: Array<[number, number]>}>} sections - X断面配列（points は [z, y]）
	 * @param {boolean} [flipWinding=false]
	 * @returns {THREE.BufferGeometry}
	 */
	function createSpanLoftedGeometry(sections, flipWinding = false) {
		const positions = [];
		const uvs = [];

		const pushTri = (a, b, c, uva, uvb, uvc) => {
			if (flipWinding) {
				positions.push(a[0], a[1], a[2], c[0], c[1], c[2], b[0], b[1], b[2]);
				uvs.push(uva[0], uva[1], uvc[0], uvc[1], uvb[0], uvb[1]);
			} else {
				positions.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
				uvs.push(uva[0], uva[1], uvb[0], uvb[1], uvc[0], uvc[1]);
			}
		};

		const ringLen = sections[0].points.length;
		const xStart = sections[0].x;
		const totalSpan = Math.max(0.001, Math.abs(sections[sections.length - 1].x - xStart));

		for (let s = 0; s < sections.length - 1; s++) {
			const sec0 = sections[s];
			const sec1 = sections[s + 1];
			const u0 = Math.abs(sec0.x - xStart) / totalSpan;
			const u1 = Math.abs(sec1.x - xStart) / totalSpan;

			for (let i = 0; i < ringLen; i++) {
				const j = (i + 1) % ringLen;
				const p00 = [sec0.x, sec0.points[i][1], sec0.points[i][0]];
				const p01 = [sec0.x, sec0.points[j][1], sec0.points[j][0]];
				const p11 = [sec1.x, sec1.points[j][1], sec1.points[j][0]];
				const p10 = [sec1.x, sec1.points[i][1], sec1.points[i][0]];

				const v0 = i / ringLen;
				const v1 = (i + 1) / ringLen;

				pushTri(p00, p01, p11, [u0, v0], [u0, v1], [u1, v1]);
				pushTri(p00, p11, p10, [u0, v0], [u1, v1], [u1, v0]);
			}
		}

		const tip = sections[sections.length - 1];
		let cz = 0;
		let cy = 0;
		for (const pt of tip.points) {
			cz += pt[0];
			cy += pt[1];
		}
		cz /= ringLen;
		cy /= ringLen;
		const tipCenter = [tip.x, cy, cz];
		for (let i = 0; i < ringLen; i++) {
			const j = (i + 1) % ringLen;
			const pi = [tip.x, tip.points[i][1], tip.points[i][0]];
			const pj = [tip.x, tip.points[j][1], tip.points[j][0]];
			pushTri(tipCenter, pi, pj, [1, 0.5], [1, 0], [1, 1]);
		}

		const root = sections[0];
		let rcz = 0;
		let rcy = 0;
		for (const pt of root.points) {
			rcz += pt[0];
			rcy += pt[1];
		}
		rcz /= ringLen;
		rcy /= ringLen;
		const rootCenter = [root.x, rcy, rcz];
		for (let i = 0; i < ringLen; i++) {
			const j = (i + 1) % ringLen;
			const pi = [root.x, root.points[i][1], root.points[i][0]];
			const pj = [root.x, root.points[j][1], root.points[j][0]];
			pushTri(rootCenter, pj, pi, [0, 0.5], [0, 1], [0, 0]);
		}

		const geo = new THREE.BufferGeometry();
		geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
		geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
		geo.computeVertexNormals();
		return geo;
	}

	return {
		getAirframeBumpTexture,
		getAirframeRoughnessTexture,
		getRockBumpTexture,
		getRockRoughnessTexture,
		getCaveBumpTexture,
		getCaveRoughnessTexture,
		createEnvironmentMap,
		createLoftedGeometry,
		createSpanLoftedGeometry
	};
})();
