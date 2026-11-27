/**
 * @fileoverview bossModel.js
 * ステージボス 3 体（GREEN TITAN / BLUE LEVIATHAN / VOID OVERLORD）の
 * 大型ハードサーフェス 3D モデルビルダー。
 * 各ボスの正面は +Z（プレイヤー方向）。
 */

const BossModelBuilder = (() => {
	/**
	 * ボス用 PBR マテリアルセットを生成する
	 * @param {number} colorHex - ボス固有のテーマカラー
	 * @returns {Object}
	 */
	function createMaterials(colorHex) {
		const bumpMap = (typeof MaterialLibrary !== 'undefined') ? MaterialLibrary.getAirframeBumpTexture() : null;
		const roughnessMap = (typeof MaterialLibrary !== 'undefined') ? MaterialLibrary.getAirframeRoughnessTexture() : null;

		// 主装甲（メタリック塗装 + パネルライン）
		const primaryArmor = new THREE.MeshStandardMaterial({
			color: colorHex,
			metalness: 0.74,
			roughness: 0.28,
			flatShading: true,
			bumpMap: bumpMap,
			bumpScale: 0.025,
			roughnessMap: roughnessMap,
			envMapIntensity: 1.5,
			emissive: 0x000000
		});

		// サブ装甲（クールシルバーグレー系で巨大構造物の陰影差を際立たせる）
		const subArmor = new THREE.MeshStandardMaterial({
			color: 0x5c7084,
			metalness: 0.72,
			roughness: 0.30,
			flatShading: true,
			bumpMap: bumpMap,
			bumpScale: 0.02,
			roughnessMap: roughnessMap,
			envMapIntensity: 1.4,
			emissive: 0x000000
		});

		// 重装甲ダークフレーム
		const darkMetal = new THREE.MeshStandardMaterial({
			color: 0x171c24,
			metalness: 0.78,
			roughness: 0.30,
			flatShading: true,
			envMapIntensity: 1.25,
			emissive: 0x000000
		});

		// ガンメタル（砲身・冷却フィン・機械構造用）
		const gunmetal = new THREE.MeshStandardMaterial({
			color: 0x384452,
			metalness: 0.86,
			roughness: 0.22,
			flatShading: true,
			envMapIntensity: 1.5,
			emissive: 0x000000
		});

		// テーマカラー高輝度発光（リアクター・砲口・エネルギーライン）
		const glowAccent = new THREE.MeshBasicMaterial({ color: colorHex });
		glowAccent.color.lerp(new THREE.Color(0xffffff), 0.30);
		glowAccent.color.multiplyScalar(2.8);

		// 超高輝度ホワイトコア
		const glowWhite = new THREE.MeshBasicMaterial({ color: 0xffffff });
		glowWhite.color.multiplyScalar(3.2);

		// 警戒・アクセントアンバー発光
		const glowAmber = new THREE.MeshBasicMaterial({ color: 0xffb833 });
		glowAmber.color.multiplyScalar(2.6);

		return {
			primaryArmor,
			subArmor,
			darkMetal,
			gunmetal,
			glowAccent,
			glowWhite,
			glowAmber,
			flashMats: [primaryArmor, subArmor, darkMetal, gunmetal]
		};
	}

	/**
	 * Stage 1 Boss: GREEN TITAN（軌道防衛重装甲コア要塞）
	 * 重装甲多面体コア + 2重メカニカル・ジャイロリング + 4枚装甲シールド + 大型粒子砲
	 */
	function buildGreenTitan(visualGroup, mats) {
		const rotatingRings = [];

		// 1. 中央コア本体（ダーク内殻 + グリーン多面体装甲シェル）
		const coreInner = new THREE.Mesh(new THREE.IcosahedronGeometry(3.1, 1), mats.darkMetal);
		visualGroup.add(coreInner);

		const coreShell = new THREE.Mesh(new THREE.IcosahedronGeometry(3.35, 1), mats.primaryArmor);
		coreShell.scale.set(1.0, 0.92, 0.96);
		visualGroup.add(coreShell);

		// コア赤道部のダーク装甲ベルト
		const beltGeo = new THREE.CylinderGeometry(3.55, 3.55, 1.0, 12);
		const belt = new THREE.Mesh(beltGeo, mats.darkMetal);
		visualGroup.add(belt);

		// 上下極点の装甲キャップ
		const capGeo = new THREE.CylinderGeometry(1.4, 2.2, 0.8, 8);
		const topCap = new THREE.Mesh(capGeo, mats.gunmetal);
		topCap.position.y = 3.2;
		visualGroup.add(topCap);

		const botCap = new THREE.Mesh(capGeo, mats.gunmetal);
		botCap.rotation.x = Math.PI;
		botCap.position.y = -3.2;
		visualGroup.add(botCap);

		// 前面の高輝度リアクターアイ + 装甲リテーナーリング
		const eyeFrame = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.24, 8, 12), mats.gunmetal);
		eyeFrame.position.set(0, 0.65, 3.05);
		visualGroup.add(eyeFrame);

		const eyeCore = new THREE.Mesh(new THREE.OctahedronGeometry(1.05, 1), mats.glowAccent);
		eyeCore.scale.set(1.0, 1.0, 0.45);
		eyeCore.position.set(0, 0.65, 3.12);
		visualGroup.add(eyeCore);

		// 2. アウター・メカニカルジャイロリング（装甲ブロック & 発光ノード付き）
		const outerRingGroup = new THREE.Group();
		const outerTorusGeo = new THREE.TorusGeometry(5.35, 0.36, 8, 24);
		outerTorusGeo.rotateX(Math.PI / 2);
		outerRingGroup.add(new THREE.Mesh(outerTorusGeo, mats.primaryArmor));

		const outerGlowGeo = new THREE.TorusGeometry(4.92, 0.08, 6, 24);
		outerGlowGeo.rotateX(Math.PI / 2);
		outerRingGroup.add(new THREE.Mesh(outerGlowGeo, mats.glowAccent));

		const blockGeo = new THREE.BoxGeometry(1.2, 0.85, 0.95);
		const nodeGeo = new THREE.BoxGeometry(0.45, 0.30, 0.25);
		for (let i = 0; i < 8; i++) {
			const angle = (i / 8) * Math.PI * 2;
			const holder = new THREE.Group();
			holder.rotation.y = angle;

			const block = new THREE.Mesh(blockGeo, i % 2 === 0 ? mats.darkMetal : mats.subArmor);
			block.position.set(5.45, 0, 0);
			holder.add(block);

			if (i % 2 === 0) {
				const node = new THREE.Mesh(nodeGeo, mats.glowAccent);
				node.position.set(6.05, 0, 0);
				holder.add(node);
			}
			outerRingGroup.add(holder);
		}
		visualGroup.add(outerRingGroup);
		rotatingRings.push({ object: outerRingGroup, speedY: 1.1, speedZ: 0.35, speedX: 0.0 });

		// 3. インナー・ジャイロリング（逆回転するダークフレームリング）
		const innerRingGroup = new THREE.Group();
		const innerTorusGeo = new THREE.TorusGeometry(4.35, 0.22, 6, 20);
		innerTorusGeo.rotateX(Math.PI / 2);
		innerRingGroup.add(new THREE.Mesh(innerTorusGeo, mats.darkMetal));

		const finGeo = new THREE.BoxGeometry(0.9, 0.25, 0.5);
		for (let i = 0; i < 4; i++) {
			const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
			const holder = new THREE.Group();
			holder.rotation.y = angle;
			const fin = new THREE.Mesh(finGeo, mats.gunmetal);
			fin.position.set(4.35, 0, 0);
			holder.add(fin);
			innerRingGroup.add(holder);
		}
		visualGroup.add(innerRingGroup);
		rotatingRings.push({ object: innerRingGroup, speedY: -1.6, speedZ: -0.5, speedX: 0.25 });

		// 4. 斜め四方の重装甲ウィングシールド
		const shieldGeo = new THREE.BoxGeometry(2.4, 0.32, 1.8);
		for (const sx of [-1, 1]) {
			for (const sy of [-1, 1]) {
				const shield = new THREE.Mesh(shieldGeo, mats.darkMetal);
				shield.position.set(sx * 3.1, sy * 2.1, 0.6);
				shield.rotation.z = sx * sy * -0.55;
				shield.rotation.y = sx * -0.25;
				visualGroup.add(shield);
			}
		}

		// 5. 前面・大型粒子砲バレル（ビーム発射口 z = +3.5 付近）
		const cannonGroup = new THREE.Group();
		cannonGroup.position.set(0, -0.75, 3.35);

		const barrelGeo = new THREE.CylinderGeometry(0.55, 0.78, 2.2, 8);
		barrelGeo.rotateX(Math.PI / 2);
		cannonGroup.add(new THREE.Mesh(barrelGeo, mats.gunmetal));

		// 砲身周囲の4枚冷却フィン
		const coolFinGeo = new THREE.BoxGeometry(0.14, 0.42, 1.8);
		for (let i = 0; i < 4; i++) {
			const holder = new THREE.Group();
			holder.rotation.z = (i * Math.PI) / 2 + Math.PI / 4;
			const cf = new THREE.Mesh(coolFinGeo, mats.darkMetal);
			cf.position.set(0, 0.72, -0.1);
			holder.add(cf);
			cannonGroup.add(holder);
		}

		// 砲口発光マズルリング
		const muzzle = new THREE.Mesh(new THREE.TorusGeometry(0.50, 0.10, 8, 16), mats.glowAccent);
		muzzle.position.z = 1.08;
		cannonGroup.add(muzzle);

		visualGroup.add(cannonGroup);

		return { rotatingRings };
	}

	/**
	 * Stage 2 Boss: BLUE LEVIATHAN（超大型ステルス巡洋戦艦）
	 * 多面体戦艦ハル + 艦橋ブリッジ + 左右巨大ツイン粒子砲ポッド (x = ±5.5, z = +1.5) + 前方ラムシールド
	 */
	function buildBlueLeviathan(visualGroup, mats) {
		// 1. 中央ステルス戦艦ハル（後方 -Z → 前方 +Z）
		const hullSections = [
			{ z: -3.2, points: [[3.6, 0.0], [2.4, 1.2], [0, 1.4], [-2.4, 1.2], [-3.6, 0.0], [-2.4, -1.0], [0, -1.2], [2.4, -1.0]] },
			{ z: -0.6, points: [[4.5, 0.0], [3.2, 1.4], [0, 1.7], [-3.2, 1.4], [-4.5, 0.0], [-3.4, -1.2], [0, -1.4], [3.4, -1.2]] },
			{ z: 2.2,  points: [[3.4, 0.0], [2.2, 1.1], [0, 1.3], [-2.2, 1.1], [-3.4, 0.0], [-2.2, -0.9], [0, -1.1], [2.2, -0.9]] },
			{ z: 4.0,  points: [[1.4, 0.0], [0.9, 0.45], [0, 0.55], [-0.9, 0.45], [-1.4, 0.0], [-0.9, -0.4], [0, -0.5], [0.9, -0.4]] }
		];
		visualGroup.add(new THREE.Mesh(MaterialLibrary.createLoftedGeometry(hullSections, true, true), mats.primaryArmor));

		// 中央デッキのダーク重装甲カバー＆放熱スリット
		const deck = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.45, 4.6), mats.darkMetal);
		deck.position.set(0, 1.45, -0.2);
		visualGroup.add(deck);

		for (let i = 0; i < 4; i++) {
			const slit = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.10, 0.22), mats.glowAccent);
			slit.position.set(0, 1.70, -1.6 + i * 0.9);
			visualGroup.add(slit);
		}

		// 2. ステルス艦橋ブリッジタワー
		const bridgeBase = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.1, 2.2), mats.subArmor);
		bridgeBase.position.set(0, 2.15, -0.9);
		visualGroup.add(bridgeBase);

		const bridgeTop = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.65, 1.6), mats.darkMetal);
		bridgeTop.position.set(0, 2.95, -1.0);
		visualGroup.add(bridgeTop);

		// 艦橋の発光メインウィンドウ
		const bridgeWin = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.24, 0.14), mats.glowAccent);
		bridgeWin.position.set(0, 2.95, -0.16);
		visualGroup.add(bridgeWin);

		// 艦橋左右の通信アンテナフィン
		for (const side of [-1, 1]) {
			const mast = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.1, 0.55), mats.gunmetal);
			mast.position.set(side * 1.15, 3.55, -1.1);
			mast.rotation.z = side * -0.35;
			visualGroup.add(mast);
		}

		// 3. 前方突出ステルス・ラムシールド（艦首装甲）
		const ramSections = [
			{ z: 2.2, points: [[2.6, 0.0], [1.6, 0.65], [0, 0.85], [-1.6, 0.65], [-2.6, 0.0], [-1.6, -0.55], [0, -0.75], [1.6, -0.55]] },
			{ z: 4.8, points: [[0.5, 0.0], [0.25, 0.20], [0, 0.26], [-0.25, 0.20], [-0.5, 0.0], [-0.25, -0.18], [0, -0.24], [0.25, -0.18]] }
		];
		visualGroup.add(new THREE.Mesh(MaterialLibrary.createLoftedGeometry(ramSections, true, true), mats.subArmor));

		const bowCore = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.26, 0.22), mats.glowAccent);
		bowCore.position.set(0, 0.0, 4.78);
		visualGroup.add(bowCore);

		// 4. 左右アウトリガー翼 + 巨大ツイン粒子砲ポッド（中心 x = ±5.5, y = 0, z = +1.5 でビーム発射座標と一致）
		for (const side of [-1, 1]) {
			// 接続アウトリガー翼
			const wingSections = [
				{ x: side * 3.2, points: [[-2.0, 0.0], [0.0, 0.65], [2.0, 0.0], [0.0, -0.55]] },
				{ x: side * 5.2, points: [[-1.6, 0.0], [0.2, 0.45], [1.8, 0.0], [0.2, -0.40]] }
			];
			visualGroup.add(new THREE.Mesh(MaterialLibrary.createSpanLoftedGeometry(wingSections, side < 0), mats.primaryArmor));

			// 巨大砲台ナセルポッド本体
			const podGroup = new THREE.Group();
			podGroup.position.set(side * 5.5, 0.0, 0.6);

			const podSections = [
				{ z: -2.4, points: [[1.15, 0.0], [0.80, 0.85], [0, 1.05], [-0.80, 0.85], [-1.15, 0.0], [-0.80, -0.85], [0, -1.05], [0.80, -0.85]] },
				{ z: 0.8,  points: [[1.30, 0.0], [0.95, 1.00], [0, 1.18], [-0.95, 1.00], [-1.30, 0.0], [-0.95, -1.00], [0, -1.18], [0.95, -1.00]] },
				{ z: 2.2,  points: [[0.92, 0.0], [0.68, 0.72], [0, 0.85], [-0.68, 0.72], [-0.92, 0.0], [-0.68, -0.72], [0, -0.85], [0.68, -0.72]] }
			];
			podGroup.add(new THREE.Mesh(MaterialLibrary.createLoftedGeometry(podSections, true, true), mats.darkMetal));

			// ポッド外側のブルー装甲ブレード
			const sideArmor = new THREE.Mesh(new THREE.BoxGeometry(0.38, 1.5, 3.4), mats.primaryArmor);
			sideArmor.position.set(side * 1.25, 0, -0.2);
			podGroup.add(sideArmor);

			// ポッド上下の放熱安定フィン
			const topFin = new THREE.Mesh(new THREE.BoxGeometry(0.24, 1.2, 2.8), mats.gunmetal);
			topFin.position.set(side * 0.25, 1.45, -0.4);
			topFin.rotation.z = side * -0.28;
			podGroup.add(topFin);

			const botFin = new THREE.Mesh(new THREE.BoxGeometry(0.24, 1.2, 2.8), mats.gunmetal);
			botFin.position.set(side * 0.25, -1.45, -0.4);
			botFin.rotation.z = side * 0.28;
			podGroup.add(botFin);

			// 前面・粒子砲マズルバレル & 高輝度シアン発光リング
			const muzzleTubeGeo = new THREE.CylinderGeometry(0.62, 0.76, 1.0, 10);
			muzzleTubeGeo.rotateX(Math.PI / 2);
			const muzzleTube = new THREE.Mesh(muzzleTubeGeo, mats.gunmetal);
			muzzleTube.position.z = 2.4;
			podGroup.add(muzzleTube);

			const muzzleRing = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.12, 8, 16), mats.glowAccent);
			muzzleRing.position.z = 2.88;
			podGroup.add(muzzleRing);

			const muzzleCore = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 10), mats.glowWhite);
			muzzleCore.position.z = 2.65;
			podGroup.add(muzzleCore);

			// ポッド後部の推進スラスター
			const rearGlow = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.4, 0.4, 10), mats.glowAccent);
			rearGlow.rotation.x = Math.PI / 2;
			rearGlow.position.z = -2.55;
			podGroup.add(rearGlow);

			visualGroup.add(podGroup);
		}

		return {};
	}

	/**
	 * Stage 3 Boss: VOID OVERLORD（次元侵食・漆黒結晶要塞）
	 * 特異点コア＋ダークマター拘束ケージ＋2重ルーンリング＋4枚多層結晶ブレード羽＋4基武装ビット衛星
	 */
	function buildVoidOverlord(visualGroup, mats) {
		const rotatingRings = [];
		const blades = [];
		const orbitCrystals = [];

		// 1. 中央の特異点コア（超高輝度ホワイト球＋周囲のパープルオーラ殻）
		const coreSphere = new THREE.Mesh(new THREE.IcosahedronGeometry(1.95, 2), mats.glowWhite);
		visualGroup.add(coreSphere);

		// コアを包む漆黒のダークマター拘束ケージ（交差アーチ＆上下スパイク）
		const cageGeo = new THREE.TorusGeometry(2.55, 0.28, 6, 12);
		const cage1 = new THREE.Mesh(cageGeo, mats.darkMetal);
		cage1.rotation.y = Math.PI / 4;
		visualGroup.add(cage1);

		const cage2 = new THREE.Mesh(cageGeo, mats.darkMetal);
		cage2.rotation.y = -Math.PI / 4;
		visualGroup.add(cage2);

		const poleGeo = new THREE.ConeGeometry(0.75, 2.2, 6);
		const topPole = new THREE.Mesh(poleGeo, mats.darkMetal);
		topPole.position.y = 3.2;
		visualGroup.add(topPole);

		const botPole = new THREE.Mesh(poleGeo, mats.darkMetal);
		botPole.rotation.x = Math.PI;
		botPole.position.y = -3.2;
		visualGroup.add(botPole);

		// 2. 2重の傾斜ルーンリング（逆回転）
		const outerRingGroup = new THREE.Group();
		outerRingGroup.rotation.x = Math.PI / 4;
		outerRingGroup.add(new THREE.Mesh(new THREE.TorusGeometry(3.95, 0.34, 8, 24), mats.darkMetal));
		outerRingGroup.add(new THREE.Mesh(new THREE.TorusGeometry(3.52, 0.09, 6, 24), mats.glowAccent));

		const runeNodeGeo = new THREE.OctahedronGeometry(0.42, 0);
		for (let i = 0; i < 8; i++) {
			const angle = (i / 8) * Math.PI * 2;
			const node = new THREE.Mesh(runeNodeGeo, i % 2 === 0 ? mats.primaryArmor : mats.glowAccent);
			node.position.set(Math.cos(angle) * 4.35, Math.sin(angle) * 4.35, 0);
			outerRingGroup.add(node);
		}
		visualGroup.add(outerRingGroup);
		rotatingRings.push({ object: outerRingGroup, speedY: 0.7, speedZ: 1.2, speedX: 0.0 });

		const innerRingGroup = new THREE.Group();
		innerRingGroup.rotation.x = -Math.PI / 4;
		innerRingGroup.add(new THREE.Mesh(new THREE.TorusGeometry(3.15, 0.20, 6, 18), mats.primaryArmor));
		visualGroup.add(innerRingGroup);
		rotatingRings.push({ object: innerRingGroup, speedY: -1.1, speedZ: -1.5, speedX: 0.3 });

		// 3. 4枚の超巨大・多層クリスタルウィングブレード（手裏剣スピン＆呼吸スイング対象）
		const mainBladeGeo = new THREE.OctahedronGeometry(3.4, 0);
		mainBladeGeo.scale(0.32, 2.35, 0.58);
		mainBladeGeo.translate(0, 5.2, 0);

		const coreBladeGeo = new THREE.OctahedronGeometry(2.6, 0);
		coreBladeGeo.scale(0.14, 2.25, 0.24);
		coreBladeGeo.translate(0, 5.1, 0.26);

		const subEdgeGeo = new THREE.OctahedronGeometry(2.2, 0);
		subEdgeGeo.scale(0.18, 1.45, 0.32);

		const rootCollarGeo = new THREE.BoxGeometry(1.5, 1.2, 1.1);

		for (let i = 0; i < 4; i++) {
			const bladeGroup = new THREE.Group();
			bladeGroup.rotation.z = (i * Math.PI) / 2;
			bladeGroup.rotation.x = 0.25;

			// 装甲基部ホルダー
			const collar = new THREE.Mesh(rootCollarGeo, mats.darkMetal);
			collar.position.set(0, 2.8, 0);
			bladeGroup.add(collar);

			// メイン結晶ブレード
			bladeGroup.add(new THREE.Mesh(mainBladeGeo, mats.primaryArmor));

			// 中央の高輝度エネルギーライン
			bladeGroup.add(new THREE.Mesh(coreBladeGeo, mats.glowAccent));

			// 左右の漆黒エッジフィン
			for (const side of [-1, 1]) {
				const edge = new THREE.Mesh(subEdgeGeo, mats.darkMetal);
				edge.position.set(side * 0.85, 4.4, -0.12);
				edge.rotation.z = side * -0.18;
				bladeGroup.add(edge);
			}

			visualGroup.add(bladeGroup);
			blades.push(bladeGroup);
		}

		// 4. 周囲を公転する 4 個の武装クリスタルビット衛星
		const satCoreGeo = new THREE.OctahedronGeometry(0.85, 0);
		const satRingGeo = new THREE.TorusGeometry(1.15, 0.14, 6, 12);
		const satSpikeGeo = new THREE.ConeGeometry(0.28, 0.9, 4);

		for (let i = 0; i < 4; i++) {
			const satGroup = new THREE.Group();
			satGroup.add(new THREE.Mesh(satCoreGeo, mats.glowAccent));

			const satRing = new THREE.Mesh(satRingGeo, mats.darkMetal);
			satRing.rotation.x = Math.PI / 2;
			satGroup.add(satRing);

			const topSp = new THREE.Mesh(satSpikeGeo, mats.primaryArmor);
			topSp.position.y = 1.05;
			satGroup.add(topSp);

			const botSp = new THREE.Mesh(satSpikeGeo, mats.primaryArmor);
			botSp.rotation.x = Math.PI;
			botSp.position.y = -1.05;
			satGroup.add(botSp);

			visualGroup.add(satGroup);
			orbitCrystals.push(satGroup);
		}

		return { rotatingRings, blades, orbitCrystals };
	}

	/**
	 * ステージインデックスに応じたボス 3D モデルを visualGroup 内に構築する
	 * @param {THREE.Group} visualGroup
	 * @param {number} stageIndex - 0 | 1 | 2
	 * @param {number} colorHex
	 * @returns {{materials: THREE.Material[], rotatingRings: Array, blades: THREE.Object3D[]|null, orbitCrystals: THREE.Object3D[]|null}}
	 */
	function build(visualGroup, stageIndex, colorHex) {
		const mats = createMaterials(colorHex);
		let parts = {};

		if (stageIndex === 0) {
			parts = buildGreenTitan(visualGroup, mats);
		} else if (stageIndex === 1) {
			parts = buildBlueLeviathan(visualGroup, mats);
		} else {
			parts = buildVoidOverlord(visualGroup, mats);
		}

		return {
			materials: mats.flashMats,
			rotatingRings: parts.rotatingRings || [],
			blades: parts.blades || null,
			orbitCrystals: parts.orbitCrystals || null
		};
	}

	return { build };
})();
