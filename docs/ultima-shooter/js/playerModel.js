/**
 * @fileoverview playerModel.js
 * 次世代ステルス戦闘機（ハードサーフェス多面体）の 3D モデルビルダー。
 * 断面ロフト造形、透過ブロンズキャノピー＆コックピット内部、角張ったエアインテーク、
 * 立体テーパー主翼＆翼端ミサイル、V字大型ツイン垂直尾翼、
 * 放射状ペタル付きベクタリングノズル＆ショックダイヤモンド・アフターバーナーを構築する。
 */

const PlayerModelBuilder = (() => {
	const createLoftedGeometry = (...args) => MaterialLibrary.createLoftedGeometry(...args);
	const createSpanLoftedGeometry = (...args) => MaterialLibrary.createSpanLoftedGeometry(...args);

	/**
	 * モデル全体で使用する PBR マテリアルセットを生成する
	 * @returns {Object}
	 */
	function createMaterials() {
		const bumpMap = (typeof MaterialLibrary !== 'undefined') ? MaterialLibrary.getAirframeBumpTexture() : null;
		const roughnessMap = (typeof MaterialLibrary !== 'undefined') ? MaterialLibrary.getAirframeRoughnessTexture() : null;

		// 主装甲: メタリック・スチールブルーグレー（環境マップ反射でクールな明暗コントラストを生む）
		const mainArmor = new THREE.MeshStandardMaterial({
			color: 0x6c90aa,
			metalness: 0.72,
			roughness: 0.30,
			flatShading: true,
			bumpMap: bumpMap,
			bumpScale: 0.012,
			roughnessMap: roughnessMap,
			envMapIntensity: 1.45,
			emissive: 0x000000
		});

		// サブ装甲: 主翼上面・ベベル面用の明るいシルバーブルー
		const lightArmor = new THREE.MeshStandardMaterial({
			color: 0x8fb4cc,
			metalness: 0.68,
			roughness: 0.25,
			flatShading: true,
			bumpMap: bumpMap,
			bumpScale: 0.010,
			roughnessMap: roughnessMap,
			envMapIntensity: 1.5,
			emissive: 0x000000
		});

		// ダークカーボン・マットフレーム: 垂直尾翼・背面スパイン・フレーム・ランチャー用
		const darkCarbon = new THREE.MeshStandardMaterial({
			color: 0x1a212a,
			metalness: 0.52,
			roughness: 0.42,
			flatShading: true,
			envMapIntensity: 1.1,
			emissive: 0x000000
		});

		// ダークインテーク内部・影用
		const deepRecess = new THREE.MeshStandardMaterial({
			color: 0x070a0f,
			metalness: 0.2,
			roughness: 0.85,
			flatShading: true
		});

		// 高光沢チタン／クローム金属: ミサイル先端・ノズル内輪・メカ部用
		const brightMetal = new THREE.MeshStandardMaterial({
			color: 0xc2d2de,
			metalness: 0.88,
			roughness: 0.18,
			flatShading: true,
			envMapIntensity: 1.6
		});

		// ガンメタル: ベクタリングノズルペタル用
		const gunmetal = new THREE.MeshStandardMaterial({
			color: 0x222a34,
			metalness: 0.82,
			roughness: 0.28,
			flatShading: true,
			envMapIntensity: 1.35
		});

		// アンバー・ゴールドアクセント: 尾翼・主翼・機首のコーションマーキング
		const amberAccent = new THREE.MeshStandardMaterial({
			color: 0xf4ae28,
			metalness: 0.35,
			roughness: 0.32,
			flatShading: true,
			emissive: 0x552e00,
			emissiveIntensity: 0.75
		});

		// 透過ブロンズキャノピーガラス
		const canopyGlass = new THREE.MeshPhysicalMaterial({
			color: 0x452710,
			metalness: 0.22,
			roughness: 0.08,
			clearcoat: 1.0,
			clearcoatRoughness: 0.06,
			transparent: true,
			opacity: 0.74,
			envMapIntensity: 1.9,
			depthWrite: false
		});

		// コックピットHUDホログラム（微発光シアン）
		const hudGlow = new THREE.MeshBasicMaterial({
			color: 0x00f0ff,
			transparent: true,
			opacity: 0.85
		});

		// 翼端ナビゲーションライト（白色高輝度）
		const wingtipLight = new THREE.MeshBasicMaterial({ color: 0xffffff });
		wingtipLight.color.multiplyScalar(2.4);

		// アフターバーナーリング発光（黄金白熱）
		const burnerRing = new THREE.MeshBasicMaterial({ color: 0xffd25a });
		burnerRing.color.multiplyScalar(3.4);

		// アフターバーナー内炎（白熱イエローホワイト）
		const jetCore = new THREE.MeshBasicMaterial({
			color: 0xfff0b0,
			transparent: true,
			opacity: 0.96,
			blending: THREE.NormalBlending,
			depthWrite: false,
			side: THREE.DoubleSide
		});
		jetCore.color.multiplyScalar(4.4);

		// アフターバーナー中炎（ゴールド・アンバーのショックダイヤモンド）
		const jetMid = new THREE.MeshBasicMaterial({
			color: 0xffaa22,
			transparent: true,
			opacity: 0.82,
			blending: THREE.AdditiveBlending,
			depthWrite: false,
			side: THREE.DoubleSide
		});
		jetMid.color.multiplyScalar(2.9);

		// アフターバーナー外炎（クリアなブループラズマ）
		const jetOuter = new THREE.MeshBasicMaterial({
			color: 0x2288ff,
			transparent: true,
			opacity: 0.26,
			blending: THREE.AdditiveBlending,
			depthWrite: false,
			side: THREE.DoubleSide
		});
		jetOuter.color.multiplyScalar(1.8);

		return {
			mainArmor,
			lightArmor,
			darkCarbon,
			deepRecess,
			brightMetal,
			gunmetal,
			amberAccent,
			canopyGlass,
			hudGlow,
			wingtipLight,
			burnerRing,
			jetCore,
			jetMid,
			jetOuter,
			// フラッシュ演出・被弾赤発光で対象とする装甲マテリアル配列
			bodyMats: [mainArmor, lightArmor, darkCarbon]
		};
	}

	/**
	 * 1. 中央ステルス胴体（チャインノーズ + 背面スパイン + 放熱ルーバー + センサー）
	 */
	function buildFuselage(mats) {
		const group = new THREE.Group();

		// 8点多角形断面（右チャイン → 右肩 → 上中央 → 左肩 → 左チャイン → 左腹 → 下中央 → 右腹）
		const fuselageSections = [
			{ z: -2.38, points: [[0.02, -0.01], [0.01, 0.01], [0, 0.015], [-0.01, 0.01], [-0.02, -0.01], [-0.01, -0.02], [0, -0.025], [0.01, -0.02]] },
			{ z: -1.85, points: [[0.20, -0.02], [0.13, 0.09], [0, 0.11], [-0.13, 0.09], [-0.20, -0.02], [-0.14, -0.09], [0, -0.10], [0.14, -0.09]] },
			{ z: -1.25, points: [[0.34, -0.01], [0.22, 0.16], [0, 0.19], [-0.22, 0.16], [-0.34, -0.01], [-0.24, -0.14], [0, -0.16], [0.24, -0.14]] },
			{ z: -0.45, points: [[0.46, 0.01], [0.30, 0.22], [0, 0.26], [-0.30, 0.22], [-0.46, 0.01], [-0.32, -0.16], [0, -0.18], [0.32, -0.16]] },
			{ z: 0.45,  points: [[0.52, 0.02], [0.36, 0.21], [0, 0.24], [-0.36, 0.21], [-0.52, 0.02], [-0.38, -0.15], [0, -0.16], [0.38, -0.15]] },
			{ z: 1.05,  points: [[0.48, 0.01], [0.35, 0.17], [0, 0.19], [-0.35, 0.17], [-0.48, 0.01], [-0.36, -0.13], [0, -0.13], [0.36, -0.13]] },
			{ z: 1.24,  points: [[0.42, 0.00], [0.30, 0.12], [0, 0.12], [-0.30, 0.12], [-0.42, 0.00], [-0.30, -0.11], [0, -0.10], [0.30, -0.11]] }
		];
		const hullMesh = new THREE.Mesh(createLoftedGeometry(fuselageSections, true, true), mats.mainArmor);
		group.add(hullMesh);

		// 機首上面の鋭利なノーズチャイン・サブパネル
		const noseDeckSections = [
			{ z: -2.28, points: [[0.03, 0.01], [0, 0.025], [-0.03, 0.01], [0, -0.005]] },
			{ z: -1.42, points: [[0.18, 0.13], [0, 0.175], [-0.18, 0.13], [0, 0.09]] },
			{ z: -1.18, points: [[0.20, 0.165], [0, 0.20], [-0.20, 0.165], [0, 0.12]] }
		];
		group.add(new THREE.Mesh(createLoftedGeometry(noseDeckSections, true, true), mats.darkCarbon));

		// 背面ダークスパイン（コックピット後方の背骨プレート）
		const spineSections = [
			{ z: -0.18, points: [[0.19, 0.23], [0.13, 0.285], [-0.13, 0.285], [-0.19, 0.23]] },
			{ z: 0.45,  points: [[0.21, 0.22], [0.15, 0.275], [-0.15, 0.275], [-0.21, 0.22]] },
			{ z: 1.06,  points: [[0.14, 0.17], [0.09, 0.21], [-0.09, 0.21], [-0.14, 0.17]] }
		];
		group.add(new THREE.Mesh(createLoftedGeometry(spineSections, true, true), mats.darkCarbon));

		// 背面の放熱ルーバー（機械的ディテール: 6枚の傾斜スリット板）
		const louverGeo = new THREE.BoxGeometry(0.22, 0.02, 0.075);
		for (let i = 0; i < 6; i++) {
			const louver = new THREE.Mesh(louverGeo, mats.gunmetal);
			louver.position.set(0, 0.278 - i * 0.007, 0.02 + i * 0.135);
			louver.rotation.x = 0.24;
			group.add(louver);
		}

		// 胴体後端のエンジン間テールスティンガー
		const stingerGeo = new THREE.ConeGeometry(0.085, 0.44, 4);
		stingerGeo.rotateX(Math.PI / 2);
		stingerGeo.rotateZ(Math.PI / 4);
		const stinger = new THREE.Mesh(stingerGeo, mats.darkCarbon);
		stinger.position.set(0, 0.01, 1.38);
		group.add(stinger);

		// 機首左右のアンバー・センサーストリップ
		const noseStripGeo = new THREE.BoxGeometry(0.035, 0.022, 0.18);
		for (const side of [-1, 1]) {
			const strip = new THREE.Mesh(noseStripGeo, mats.amberAccent);
			strip.position.set(side * 0.23, 0.03, -1.55);
			strip.rotation.y = side * -0.18;
			group.add(strip);
		}

		// 機首先端の金属ピトーノーズチップ
		const tipGeo = new THREE.ConeGeometry(0.025, 0.16, 6);
		tipGeo.rotateX(-Math.PI / 2);
		const tip = new THREE.Mesh(tipGeo, mats.brightMetal);
		tip.position.set(0, -0.005, -2.44);
		group.add(tip);

		return group;
	}

	/**
	 * 2. 透過ブロンズキャノピー & コックピット内部（パイロットシート・HUD・アーチフレーム）
	 */
	function buildCanopy(mats) {
		const group = new THREE.Group();

		// コックピット内部の凹みベース
		const tubGeo = new THREE.BoxGeometry(0.30, 0.10, 0.96);
		const tub = new THREE.Mesh(tubGeo, mats.deepRecess);
		tub.position.set(0, 0.18, -0.78);
		group.add(tub);

		// パイロットシート背もたれ & ヘッドレスト
		const seatBack = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.20, 0.06), mats.darkCarbon);
		seatBack.position.set(0, 0.27, -0.56);
		seatBack.rotation.x = -0.22;
		group.add(seatBack);

		const headRest = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.07, 0.055), mats.amberAccent);
		headRest.position.set(0, 0.36, -0.53);
		group.add(headRest);

		// 前方計器コンソール & 発光HUDスクリーン
		const consoleBox = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.09, 0.20), mats.darkCarbon);
		consoleBox.position.set(0, 0.24, -1.12);
		group.add(consoleBox);

		const hudPlate = new THREE.Mesh(new THREE.PlaneGeometry(0.13, 0.08), mats.hudGlow);
		hudPlate.position.set(0, 0.31, -1.08);
		hudPlate.rotation.x = -0.35;
		group.add(hudPlate);

		// 透過ブロンズ・バブルキャノピー（6点アーチ断面を流線形ロフト）
		const canopySections = [
			{ z: -1.36, points: [[0.11, 0.17], [0.06, 0.21], [0, 0.22], [-0.06, 0.21], [-0.11, 0.17], [0, 0.16]] },
			{ z: -1.06, points: [[0.19, 0.21], [0.14, 0.36], [0, 0.42], [-0.14, 0.36], [-0.19, 0.21], [0, 0.19]] },
			{ z: -0.68, points: [[0.21, 0.22], [0.16, 0.39], [0, 0.45], [-0.16, 0.39], [-0.21, 0.22], [0, 0.20]] },
			{ z: -0.30, points: [[0.19, 0.22], [0.13, 0.34], [0, 0.38], [-0.13, 0.34], [-0.19, 0.22], [0, 0.20]] },
			{ z: -0.02, points: [[0.15, 0.22], [0.09, 0.27], [0, 0.29], [-0.09, 0.27], [-0.15, 0.22], [0, 0.20]] }
		];
		const glassMesh = new THREE.Mesh(createLoftedGeometry(canopySections, true, true), mats.canopyGlass);
		group.add(glassMesh);

		// キャノピー枠フレーム（前縁＆中央アーチ）
		const archGeo = new THREE.TorusGeometry(0.195, 0.016, 6, 12, Math.PI);
		const midArch = new THREE.Mesh(archGeo, mats.darkCarbon);
		midArch.position.set(0, 0.24, -0.78);
		midArch.scale.set(1.04, 1.08, 1.0);
		group.add(midArch);

		const rearArch = new THREE.Mesh(archGeo, mats.darkCarbon);
		rearArch.position.set(0, 0.23, -0.34);
		rearArch.scale.set(0.96, 0.82, 1.0);
		group.add(rearArch);

		// キャノピー後端のダークフェアリング（胴体スパインへ接続）
		const collarGeo = new THREE.BoxGeometry(0.32, 0.06, 0.24);
		const collar = new THREE.Mesh(collarGeo, mats.darkCarbon);
		collar.position.set(0, 0.26, -0.14);
		collar.rotation.x = 0.28;
		group.add(collar);

		return group;
	}

	/**
	 * 3. サイドエアインテーク & ストレーキ（左右独立グループ）
	 * @param {-1|1} side - -1: 左, +1: 右
	 */
	function buildSideIntake(side, mats) {
		const group = new THREE.Group();
		const flip = side < 0;

		// 角張ったステルス吸気ダクトナセル（外側面が鋭く傾斜）
		const intakeSections = [
			{ z: -1.16, points: [[side * 0.62, 0.03], [side * 0.56, 0.14], [side * 0.33, 0.15], [side * 0.30, -0.10], [side * 0.54, -0.12]] },
			{ z: -0.72, points: [[side * 0.72, 0.04], [side * 0.60, 0.17], [side * 0.36, 0.19], [side * 0.34, -0.12], [side * 0.62, -0.12]] },
			{ z: 0.35,  points: [[side * 0.68, 0.04], [side * 0.54, 0.18], [side * 0.36, 0.20], [side * 0.35, -0.12], [side * 0.58, -0.11]] },
			{ z: 1.12,  points: [[side * 0.52, 0.02], [side * 0.44, 0.14], [side * 0.30, 0.16], [side * 0.28, -0.11], [side * 0.46, -0.10]] }
		];
		const nacelle = new THREE.Mesh(createLoftedGeometry(intakeSections, false, true, flip), mats.lightArmor);
		group.add(nacelle);

		// 前面ダクト開口（暗い吸気口）
		const lipGeo = new THREE.PlaneGeometry(0.26, 0.22);
		const lip = new THREE.Mesh(lipGeo, mats.deepRecess);
		lip.position.set(side * 0.46, 0.02, -1.155);
		lip.rotation.y = Math.PI + side * 0.24;
		group.add(lip);

		// エアインテーク側面下部のダークトリム（コントラストの帯）
		const trimGeo = new THREE.BoxGeometry(0.05, 0.10, 1.85);
		const trim = new THREE.Mesh(trimGeo, mats.darkCarbon);
		trim.position.set(side * 0.66, -0.02, -0.05);
		trim.rotation.y = side * -0.05;
		group.add(trim);

		// 側面ストレーキのアンバー注意マーク
		const markGeo = new THREE.BoxGeometry(0.03, 0.022, 0.22);
		const mark = new THREE.Mesh(markGeo, mats.amberAccent);
		mark.position.set(side * 0.64, 0.09, -0.82);
		group.add(mark);

		return group;
	}

	/**
	 * 4. 立体テーパー・クリップドデルタ主翼 + フラップ + 翼端ミサイル＆パイロン
	 * @param {-1|1} side - -1: 左翼, +1: 右翼
	 */
	function buildMainWing(side, mats) {
		const group = new THREE.Group();
		const flip = side < 0;

		// 4点ダイヤ断面エアフォイル [z, y]（前縁 → 上面稜線 → 後縁 → 下面稜線）
		// 上面稜線によって前側と後ろ側で明確なハードエッジ反射差が生まれる
		const wingSections = [
			{ x: side * 0.54, points: [[-0.46, 0.01], [0.16, 0.105], [0.82, 0.00], [0.16, -0.065]] },
			{ x: side * 1.18, points: [[0.14, 0.00], [0.54, 0.065], [0.90, -0.01], [0.54, -0.042]] },
			{ x: side * 1.86, points: [[0.68, -0.01], [0.86, 0.028], [1.06, -0.015], [0.86, -0.022]] }
		];
		const wingMesh = new THREE.Mesh(createSpanLoftedGeometry(wingSections, flip), mats.lightArmor);
		group.add(wingMesh);

		// 主翼上面のアンバーマーキングライン（前縁寄りのシャープな差し色）
		const stripeGeo = new THREE.BoxGeometry(0.76, 0.014, 0.065);
		const stripe = new THREE.Mesh(stripeGeo, mats.amberAccent);
		stripe.position.set(side * 1.24, 0.046, 0.42);
		stripe.rotation.y = side * -0.68;
		stripe.rotation.z = side * -0.04;
		group.add(stripe);

		// 主翼後縁フラップ／エルロン（独立ダークパネル）
		const flapGeo = new THREE.BoxGeometry(0.92, 0.028, 0.16);
		const flap = new THREE.Mesh(flapGeo, mats.darkCarbon);
		flap.position.set(side * 1.18, -0.008, 0.90);
		flap.rotation.y = side * -0.14;
		group.add(flap);

		// 翼端ミサイルランチャーレール & ウイングチップミサイル
		const rail = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.045, 0.58), mats.darkCarbon);
		rail.position.set(side * 1.88, -0.005, 0.86);
		group.add(rail);

		const missileGroup = new THREE.Group();
		missileGroup.position.set(side * 1.93, -0.01, 0.78);

		const mBodyGeo = new THREE.CylinderGeometry(0.036, 0.038, 0.76, 8);
		mBodyGeo.rotateX(Math.PI / 2);
		missileGroup.add(new THREE.Mesh(mBodyGeo, mats.darkCarbon));

		// シルバーの鋭利なミサイルノーズコーン
		const mNoseGeo = new THREE.ConeGeometry(0.036, 0.17, 8);
		mNoseGeo.rotateX(-Math.PI / 2);
		const mNose = new THREE.Mesh(mNoseGeo, mats.brightMetal);
		mNose.position.z = -0.465;
		missileGroup.add(mNose);

		// ミサイル後端の十字フィン
		const mFinH = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.01, 0.11), mats.darkCarbon);
		mFinH.position.z = 0.30;
		missileGroup.add(mFinH);
		const mFinV = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.14, 0.11), mats.darkCarbon);
		mFinV.position.z = 0.30;
		missileGroup.add(mFinV);

		// 翼端の白色ナビゲーションライト
		const navLight = new THREE.Mesh(new THREE.SphereGeometry(0.026, 8, 8), mats.wingtipLight);
		navLight.position.set(side * 0.02, 0.03, 0.16);
		missileGroup.add(navLight);

		group.add(missileGroup);

		// 翼下パイロン＆ハードポイント武装ポッド
		const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.12, 0.38), mats.darkCarbon);
		pylon.position.set(side * 1.08, -0.095, 0.56);
		group.add(pylon);

		const podGeo = new THREE.CylinderGeometry(0.042, 0.042, 0.56, 8);
		podGeo.rotateX(Math.PI / 2);
		const pod = new THREE.Mesh(podGeo, mats.gunmetal);
		pod.position.set(side * 1.08, -0.155, 0.52);
		group.add(pod);

		const podNoseGeo = new THREE.ConeGeometry(0.042, 0.14, 8);
		podNoseGeo.rotateX(-Math.PI / 2);
		const podNose = new THREE.Mesh(podNoseGeo, mats.brightMetal);
		podNose.position.set(side * 1.08, -0.155, 0.17);
		group.add(podNose);

		return group;
	}

	/**
	 * 5. 外側へ大きく傾いた V 字大型ダークツイン垂直尾翼
	 * @param {-1|1} side - -1: 左尾翼, +1: 右尾翼
	 */
	function buildVerticalTail(side, mats) {
		const group = new THREE.Group();
		group.position.set(side * 0.38, 0.14, 0.86);
		// V字型に外側へ約32度傾斜
		group.rotation.z = side * -0.56;
		group.rotation.y = side * 0.04;

		// 立体テーパー台形尾翼（厚み付き多面体）
		const finShape = new THREE.Shape();
		finShape.moveTo(-0.44, 0.0);  // 前方根元
		finShape.lineTo(0.32, 0.0);   // 後方根元
		finShape.lineTo(0.56, 0.72);  // 後方上端
		finShape.lineTo(0.18, 0.74);  // 前方上端
		finShape.closePath();

		const finGeo = new THREE.ExtrudeGeometry(finShape, {
			depth: 0.036,
			bevelEnabled: true,
			bevelThickness: 0.012,
			bevelSize: 0.012,
			bevelSegments: 1
		});
		finGeo.rotateY(-Math.PI / 2);
		finGeo.translate(0.018, 0, 0);

		const finMesh = new THREE.Mesh(finGeo, mats.darkCarbon);
		group.add(finMesh);

		// 尾翼上端のアンバー／ゴールド三角形アクセントマーキング（両面から視認可能）
		const tipMarkGeo = new THREE.BoxGeometry(0.068, 0.095, 0.18);
		const tipMark = new THREE.Mesh(tipMarkGeo, mats.amberAccent);
		tipMark.position.set(0, 0.62, 0.34);
		tipMark.rotation.x = 0.24;
		group.add(tipMark);

		// 尾翼前縁下部の小さなアンバーコーションライン
		const baseMark = new THREE.Mesh(new THREE.BoxGeometry(0.064, 0.035, 0.12), mats.amberAccent);
		baseMark.position.set(0, 0.18, -0.18);
		group.add(baseMark);

		return group;
	}

	/**
	 * 6. 後部水平尾翼（スタビレーター）
	 * @param {-1|1} side - -1: 左, +1: 右
	 */
	function buildHorizontalStab(side, mats) {
		const group = new THREE.Group();
		const flip = side < 0;

		const stabSections = [
			{ x: side * 0.44, points: [[0.76, 0.00], [1.02, 0.032], [1.26, -0.005], [1.02, -0.025]] },
			{ x: side * 1.18, points: [[1.06, -0.01], [1.20, 0.016], [1.36, -0.012], [1.20, -0.014]] }
		];
		const stabMesh = new THREE.Mesh(createSpanLoftedGeometry(stabSections, flip), mats.darkCarbon);
		group.add(stabMesh);

		// 前縁のハイライトエッジ
		const edgeGeo = new THREE.BoxGeometry(0.76, 0.018, 0.045);
		const edge = new THREE.Mesh(edgeGeo, mats.mainArmor);
		edge.position.set(side * 0.80, 0.008, 0.92);
		edge.rotation.y = side * -0.38;
		group.add(edge);

		return group;
	}

	/**
	 * 7. メカニカル・ベクタリングノズル（12枚放射状ペタル＋黄金アフターバーナーリング）
	 * @param {-1|1} side - -1: 左エンジン, +1: 右エンジン
	 */
	function buildNozzle(side, mats) {
		const group = new THREE.Group();
		group.position.set(side * 0.255, -0.005, 1.32);

		// ノズル基部カウル
		const baseGeo = new THREE.CylinderGeometry(0.185, 0.215, 0.22, 16);
		baseGeo.rotateX(Math.PI / 2);
		const base = new THREE.Mesh(baseGeo, mats.darkCarbon);
		base.position.z = -0.06;
		group.add(base);

		// 12枚の放射状ベクタリングペタル（羽根を環状配置して実機ノズルのメカ感を再現）
		const petalCount = 12;
		const petalGeo = new THREE.BoxGeometry(0.072, 0.022, 0.24);
		for (let i = 0; i < petalCount; i++) {
			const angle = (i / petalCount) * Math.PI * 2;
			const holder = new THREE.Group();
			holder.rotation.z = angle;

			const petal = new THREE.Mesh(petalGeo, mats.gunmetal);
			petal.position.set(0, 0.168, 0.08);
			// 後端に向かってわずかに絞り込む
			petal.rotation.x = -0.14;
			holder.add(petal);
			group.add(holder);
		}

		// ノズル内部の暗い奥行き壁
		const innerTubeGeo = new THREE.CylinderGeometry(0.135, 0.148, 0.24, 16, 1, true);
		innerTubeGeo.rotateX(Math.PI / 2);
		const innerTubeMat = mats.deepRecess.clone();
		innerTubeMat.side = THREE.BackSide;
		const innerTube = new THREE.Mesh(innerTubeGeo, innerTubeMat);
		innerTube.position.z = 0.06;
		group.add(innerTube);

		// ノズル内部の黄金白熱リング（Bloom発光）
		const ringGeo = new THREE.TorusGeometry(0.125, 0.018, 8, 20);
		const glowRing = new THREE.Mesh(ringGeo, mats.burnerRing);
		glowRing.position.z = 0.155;
		group.add(glowRing);

		// 内側のタービン中心コーン
		const turbineGeo = new THREE.ConeGeometry(0.055, 0.14, 8);
		turbineGeo.rotateX(Math.PI / 2);
		const turbine = new THREE.Mesh(turbineGeo, mats.burnerRing);
		turbine.position.z = 0.02;
		group.add(turbine);

		return group;
	}

	/**
	 * 8. ショックダイヤモンド型ツインアフターバーナー炎グループ
	 */
	function buildAfterburnerJet(side, mats) {
		const jetGroup = new THREE.Group();
		jetGroup.position.set(side * 0.255, -0.005, 1.47);

		// ① 内側の高輝度ホワイトゴールド・ショックダイヤモンド（鋭い6角錐）
		const coreGeo = new THREE.ConeGeometry(0.105, 0.52, 6, 1, false);
		coreGeo.translate(0, 0.26, 0);
		coreGeo.rotateX(Math.PI / 2);
		jetGroup.add(new THREE.Mesh(coreGeo, mats.jetCore));

		// ② 中間の黄金アフターバーナーコーン
		const midGeo = new THREE.ConeGeometry(0.125, 0.92, 8, 1, true);
		midGeo.translate(0, 0.46, 0);
		midGeo.rotateX(Math.PI / 2);
		jetGroup.add(new THREE.Mesh(midGeo, mats.jetMid));

		// ③ 外側のブループラズマ噴射オーラ
		const outerGeo = new THREE.ConeGeometry(0.145, 1.55, 12, 1, true);
		outerGeo.translate(0, 0.775, 0);
		outerGeo.rotateX(Math.PI / 2);
		jetGroup.add(new THREE.Mesh(outerGeo, mats.jetOuter));

		return jetGroup;
	}

	/**
	 * 自機 3D モデル一式を構築して返す
	 * @returns {{mesh: THREE.Group, mainMat: THREE.Material, bodyMats: THREE.Material[], leftJet: THREE.Group, rightJet: THREE.Group}}
	 */
	function build() {
		const root = new THREE.Group();
		const mats = createMaterials();

		// 各主要パーツを root 直下に配置（墜落時の disintegrate() でパーツ単位に爆散させるため）
		root.add(buildFuselage(mats));
		root.add(buildCanopy(mats));
		root.add(buildSideIntake(-1, mats));
		root.add(buildSideIntake(1, mats));
		root.add(buildMainWing(-1, mats));
		root.add(buildMainWing(1, mats));
		root.add(buildVerticalTail(-1, mats));
		root.add(buildVerticalTail(1, mats));
		root.add(buildHorizontalStab(-1, mats));
		root.add(buildHorizontalStab(1, mats));
		root.add(buildNozzle(-1, mats));
		root.add(buildNozzle(1, mats));

		const leftJet = buildAfterburnerJet(-1, mats);
		const rightJet = buildAfterburnerJet(1, mats);
		root.add(leftJet);
		root.add(rightJet);

		// 影設定（半透明炎・キャノピーガラス以外は影を落とす）
		root.castShadow = true;
		root.receiveShadow = true;
		root.traverse((child) => {
			if (!child.isMesh) return;
			const isTransparentFx = child.material === mats.jetCore ||
				child.material === mats.jetMid ||
				child.material === mats.jetOuter ||
				child.material === mats.burnerRing ||
				child.material === mats.hudGlow ||
				child.material === mats.wingtipLight;
			child.castShadow = !isTransparentFx;
			child.receiveShadow = !isTransparentFx;
		});

		return {
			mesh: root,
			mainMat: mats.mainArmor,
			bodyMats: mats.bodyMats,
			leftJet: leftJet,
			rightJet: rightJet
		};
	}

	return { build };
})();
