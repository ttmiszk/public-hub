/**
 * @fileoverview enemyModel.js
 * 敵機 6 種（TYPE-A〜F）のハードサーフェス多面体 3D モデルビルダー。
 * 自機と世界観を統一した PBR 金属装甲・ダークフレーム・Bloom 発光センサー/コアで構成する。
 * 敵機は +Z（プレイヤー方向）を正面として造形される。
 */

const EnemyModelBuilder = (() => {
	/**
	 * 敵機タイプ共通の PBR マテリアルセットを生成する
	 * @param {number} accentColorHex - 敵タイプ固有カラー
	 * @returns {Object}
	 */
	function createMaterials(accentColorHex) {
		const bumpMap = (typeof MaterialLibrary !== 'undefined') ? MaterialLibrary.getAirframeBumpTexture() : null;
		const roughnessMap = (typeof MaterialLibrary !== 'undefined') ? MaterialLibrary.getAirframeRoughnessTexture() : null;

		// 主装甲（タイプ固有色・メタリック塗装）
		const primaryArmor = new THREE.MeshStandardMaterial({
			color: accentColorHex,
			metalness: 0.70,
			roughness: 0.28,
			flatShading: true,
			bumpMap: bumpMap,
			bumpScale: 0.014,
			roughnessMap: roughnessMap,
			envMapIntensity: 1.45,
			emissive: 0x000000
		});

		// ダークカーボン・ステルス装甲
		const darkArmor = new THREE.MeshStandardMaterial({
			color: 0x1a2029,
			metalness: 0.62,
			roughness: 0.36,
			flatShading: true,
			envMapIntensity: 1.2,
			emissive: 0x000000
		});

		// メカニカル金属（砲身・スパイク・フレーム用）
		const gunmetal = new THREE.MeshStandardMaterial({
			color: 0x526070,
			metalness: 0.85,
			roughness: 0.22,
			flatShading: true,
			envMapIntensity: 1.5,
			emissive: 0x000000
		});

		// 高光沢シルバー金属（先端ブレード・ノズルリング用）
		const brightMetal = new THREE.MeshStandardMaterial({
			color: 0xc8d8e4,
			metalness: 0.90,
			roughness: 0.16,
			flatShading: true,
			envMapIntensity: 1.65,
			emissive: 0x000000
		});

		// 発光センサー・エネルギーコア（emissive 非依存の BasicMaterial で被弾フラッシュ中も色維持）
		const glowCore = new THREE.MeshBasicMaterial({ color: accentColorHex });
		glowCore.color.lerp(new THREE.Color(0xffffff), 0.35);
		glowCore.color.multiplyScalar(2.8);

		// スラスター炎（ウォームゴールド）
		const thrusterGlow = new THREE.MeshBasicMaterial({ color: 0xffb84d });
		thrusterGlow.color.multiplyScalar(2.6);

		return {
			primaryArmor,
			darkArmor,
			gunmetal,
			brightMetal,
			glowCore,
			thrusterGlow,
			flashMats: [primaryArmor, darkArmor, gunmetal, brightMetal]
		};
	}

	/**
	 * TYPE-A: CRIMSON DART（高速ステルス迎撃機）
	 * シャープなチャイン胴体＋下反角デルタ翼＋V字尾翼＋赤色発光バイザー
	 */
	function buildTypeA(root, mats) {
		const hullGroup = new THREE.Group();
		// 正面から上面の立体感が見えるよう軽く機首を前傾させる
		hullGroup.rotation.x = 0.22;

		// 後方(-Z) → 機首(+Z) の順で断面を定義
		const bodySections = [
			{ z: -0.92, points: [[0.24, 0.00], [0.16, 0.14], [0, 0.17], [-0.16, 0.14], [-0.24, 0.00], [-0.14, -0.10], [0, -0.11], [0.14, -0.10]] },
			{ z: -0.20, points: [[0.34, 0.00], [0.22, 0.18], [0, 0.22], [-0.22, 0.18], [-0.34, 0.00], [-0.20, -0.14], [0, -0.15], [0.20, -0.14]] },
			{ z: 0.55,  points: [[0.20, -0.01], [0.12, 0.10], [0, 0.12], [-0.12, 0.10], [-0.20, -0.01], [-0.12, -0.08], [0, -0.09], [0.12, -0.08]] },
			{ z: 1.05,  points: [[0.03, -0.01], [0.02, 0.01], [0, 0.02], [-0.02, 0.01], [-0.03, -0.01], [-0.02, -0.02], [0, -0.02], [0.02, -0.02]] }
		];
		hullGroup.add(new THREE.Mesh(MaterialLibrary.createLoftedGeometry(bodySections, true, true), mats.primaryArmor));

		// ダークキャノピー & 発光センサーバイザー
		const visor = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.08, 0.44), mats.darkArmor);
		visor.position.set(0, 0.17, 0.12);
		visor.rotation.x = 0.18;
		hullGroup.add(visor);

		const eyeStrip = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.035, 0.12), mats.glowCore);
		eyeStrip.position.set(0, 0.16, 0.34);
		hullGroup.add(eyeStrip);

		// 左右立体テーパー後退翼（下反角付き）
		for (const side of [-1, 1]) {
			const wingSections = [
				{ x: side * 0.26, points: [[-0.62, 0.01], [-0.10, 0.09], [0.36, -0.01], [-0.10, -0.05]] },
				{ x: side * 0.98, points: [[-0.86, -0.09], [-0.60, -0.04], [-0.32, -0.10], [-0.60, -0.12]] }
			];
			hullGroup.add(new THREE.Mesh(MaterialLibrary.createSpanLoftedGeometry(wingSections, side < 0), mats.primaryArmor));

			// 翼端ダークトリム & 砲口ピン
			const tip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.48), mats.darkArmor);
			tip.position.set(side * 0.98, -0.09, -0.58);
			hullGroup.add(tip);

			// 小型ツインV字尾翼
			const fin = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.34, 0.36), mats.darkArmor);
			fin.position.set(side * 0.24, 0.22, -0.68);
			fin.rotation.z = side * -0.45;
			hullGroup.add(fin);

			// 後部スラスター発光
			const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.04, 0.16, 8), mats.thrusterGlow);
			jet.rotation.x = Math.PI / 2;
			jet.position.set(side * 0.12, 0.01, -0.96);
			hullGroup.add(jet);
		}

		root.add(hullGroup);
	}

	/**
	 * TYPE-B: SOLAR VIPER（ステルス全翼マンタ機）
	 * 横長に展開するガルウィング多面体＋デュアル光学センサー＋ツイン背面フィン
	 */
	function buildTypeB(root, mats) {
		// 中央扁平ステルス胴体（後方 -Z → 前方 +Z）
		const coreSections = [
			{ z: -0.72, points: [[0.32, 0.00], [0.20, 0.14], [0, 0.18], [-0.20, 0.14], [-0.32, 0.00], [-0.18, -0.10], [0, -0.12], [0.18, -0.10]] },
			{ z: 0.08,  points: [[0.52, 0.00], [0.30, 0.20], [0, 0.25], [-0.30, 0.20], [-0.52, 0.00], [-0.32, -0.15], [0, -0.17], [0.32, -0.15]] },
			{ z: 0.78,  points: [[0.22, -0.01], [0.12, 0.07], [0, 0.09], [-0.12, 0.07], [-0.22, -0.01], [-0.12, -0.06], [0, -0.07], [0.12, -0.06]] }
		];
		root.add(new THREE.Mesh(MaterialLibrary.createLoftedGeometry(coreSections, true, true), mats.primaryArmor));

		// 中央ダークキャノピーパネル & 発光デュアルセンサー
		const deck = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.10, 0.78), mats.darkArmor);
		deck.position.set(0, 0.18, -0.02);
		root.add(deck);

		for (const side of [-1, 1]) {
			const eye = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.05, 0.10), mats.glowCore);
			eye.position.set(side * 0.16, 0.10, 0.56);
			eye.rotation.y = side * -0.35;
			root.add(eye);

			// ガルウィング立体翼（2段折れ曲がり）
			const wingSections = [
				{ x: side * 0.42, points: [[-0.56, 0.02], [-0.04, 0.12], [0.46, 0.00], [-0.04, -0.08]] },
				{ x: side * 0.96, points: [[-0.44, 0.16], [-0.06, 0.22], [0.28, 0.12], [-0.06, 0.08]] },
				{ x: side * 1.28, points: [[-0.58, -0.02], [-0.32, 0.02], [-0.04, -0.04], [-0.32, -0.06]] }
			];
			root.add(new THREE.Mesh(MaterialLibrary.createSpanLoftedGeometry(wingSections, side < 0), mats.primaryArmor));

			// 翼上面のダークアーマープレート
			const plate = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.04, 0.34), mats.darkArmor);
			plate.position.set(side * 0.74, 0.14, -0.06);
			plate.rotation.z = side * 0.22;
			root.add(plate);

			// 背面ツイン垂直フィン
			const fin = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.38, 0.44), mats.darkArmor);
			fin.position.set(side * 0.28, 0.28, -0.34);
			fin.rotation.z = side * -0.25;
			root.add(fin);
		}

		// 後部ワイドスラスター
		const thruster = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.09, 0.10), mats.thrusterGlow);
		thruster.position.set(0, 0.01, -0.75);
		root.add(thruster);
	}

	/**
	 * TYPE-C: BLAZE LANCE（前進翼・高速突撃機）
	 * 鋭利な槍型胴体＋シルバーラムスパイク＋前進翼＋白熱ターゲティングコア
	 */
	function buildTypeC(root, mats) {
		const hullGroup = new THREE.Group();
		hullGroup.rotation.x = 0.14;

		// 細長い槍型ステルス胴体（後方 -Z → 前方 +Z）
		const lanceSections = [
			{ z: -1.05, points: [[0.22, 0.00], [0.14, 0.14], [0, 0.17], [-0.14, 0.14], [-0.22, 0.00], [-0.14, -0.11], [0, -0.13], [0.14, -0.11]] },
			{ z: -0.15, points: [[0.32, 0.00], [0.20, 0.18], [0, 0.23], [-0.20, 0.18], [-0.32, 0.00], [-0.20, -0.14], [0, -0.16], [0.20, -0.14]] },
			{ z: 0.75,  points: [[0.14, 0.00], [0.08, 0.09], [0, 0.11], [-0.08, 0.09], [-0.14, 0.00], [-0.08, -0.07], [0, -0.08], [0.08, -0.07]] },
			{ z: 1.32,  points: [[0.02, 0.00], [0.01, 0.015], [0, 0.02], [-0.01, 0.015], [-0.02, 0.00], [-0.01, -0.015], [0, -0.02], [0.01, -0.015]] }
		];
		hullGroup.add(new THREE.Mesh(MaterialLibrary.createLoftedGeometry(lanceSections, true, true), mats.primaryArmor));

		// 先端の金属ラムスパイク
		const spikeGeo = new THREE.ConeGeometry(0.06, 0.36, 4);
		spikeGeo.rotateX(Math.PI / 2);
		const spike = new THREE.Mesh(spikeGeo, mats.brightMetal);
		spike.position.set(0, 0, 1.42);
		hullGroup.add(spike);

		// 機首上部の白熱ターゲティングアイ
		const coreEye = new THREE.Mesh(new THREE.OctahedronGeometry(0.11, 0), mats.glowCore);
		coreEye.scale.set(1.2, 0.65, 1.8);
		coreEye.position.set(0, 0.16, 0.42);
		hullGroup.add(coreEye);

		// 中央大型ダーク背びれ
		const dorsal = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.36, 0.72), mats.darkArmor);
		dorsal.position.set(0, 0.28, -0.45);
		dorsal.rotation.x = -0.18;
		hullGroup.add(dorsal);

		// 攻撃的な立体テーパー前進翼（Forward-Swept Wings）
		for (const side of [-1, 1]) {
			const fwdWingSections = [
				{ x: side * 0.24, points: [[-0.68, 0.02], [-0.28, 0.09], [0.14, 0.00], [-0.28, -0.06]] },
				{ x: side * 1.18, points: [[0.14, -0.14], [0.46, -0.09], [0.76, -0.15], [0.46, -0.17]] }
			];
			hullGroup.add(new THREE.Mesh(MaterialLibrary.createSpanLoftedGeometry(fwdWingSections, side < 0), mats.primaryArmor));

			// 翼端の鋭利なシルバーブレード
			const blade = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 0.68), mats.brightMetal);
			blade.position.set(side * 1.18, -0.13, 0.48);
			hullGroup.add(blade);

			// 翼根のダークインテークブロック
			const intake = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.16, 0.56), mats.darkArmor);
			intake.position.set(side * 0.36, 0.02, -0.28);
			hullGroup.add(intake);
		}

		// 後部大型ブースター発光
		const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.08, 0.24, 8), mats.thrusterGlow);
		jet.rotation.x = Math.PI / 2;
		jet.position.set(0, 0, -1.12);
		hullGroup.add(jet);

		root.add(hullGroup);
	}

	/**
	 * TYPE-D: CRIMSON BASTION（重装甲ツインレールガン・ガンシップ）
	 * 八角多面体装甲ハル＋肩部アーマー＋ツインレールガン砲身＋発光モノアイ
	 */
	function buildTypeD(root, mats) {
		// 重装甲多角ハル（後方 -Z → 前方 +Z）
		const hullSections = [
			{ z: -0.78, points: [[0.42, 0.00], [0.30, 0.28], [0, 0.34], [-0.30, 0.28], [-0.42, 0.00], [-0.30, -0.24], [0, -0.28], [0.30, -0.24]] },
			{ z: 0.12,  points: [[0.56, 0.00], [0.40, 0.38], [0, 0.44], [-0.40, 0.38], [-0.56, 0.00], [-0.40, -0.32], [0, -0.36], [0.40, -0.32]] },
			{ z: 0.68,  points: [[0.40, 0.00], [0.28, 0.24], [0, 0.28], [-0.28, 0.24], [-0.40, 0.00], [-0.28, -0.22], [0, -0.25], [0.28, -0.22]] }
		];
		root.add(new THREE.Mesh(MaterialLibrary.createLoftedGeometry(hullSections, true, true), mats.primaryArmor));

		// 前面ダークバイザー & マゼンタ発光モノアイ
		const facePlate = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.22, 0.16), mats.darkArmor);
		facePlate.position.set(0, 0.08, 0.66);
		root.add(facePlate);

		const monoEye = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 10), mats.glowCore);
		monoEye.scale.set(1.6, 0.65, 0.6);
		monoEye.position.set(0, 0.08, 0.75);
		root.add(monoEye);

		// 左右の肩部装甲＋ツインレールガン砲身＋大型スタビライザー
		for (const side of [-1, 1]) {
			// 肩部装甲ポッド
			const shoulder = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.34, 0.92), mats.darkArmor);
			shoulder.position.set(side * 0.68, 0.02, -0.02);
			root.add(shoulder);

			// 肩上部の主装甲シールド
			const cap = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.10, 0.76), mats.primaryArmor);
			cap.position.set(side * 0.68, 0.22, -0.04);
			cap.rotation.z = side * -0.18;
			root.add(cap);

			// 前方に突き出すツインレールガン砲身
			const barrelGeo = new THREE.CylinderGeometry(0.065, 0.085, 0.88, 8);
			barrelGeo.rotateX(Math.PI / 2);
			const barrel = new THREE.Mesh(barrelGeo, mats.gunmetal);
			barrel.position.set(side * 0.62, -0.04, 0.72);
			root.add(barrel);

			// 砲身のチャージ発光リング
			const muzzleRing = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.018, 6, 12), mats.glowCore);
			muzzleRing.position.set(side * 0.62, -0.04, 1.12);
			root.add(muzzleRing);

			// 左右スタビライザー翼
			const wingSections = [
				{ x: side * 0.78, points: [[-0.44, 0.00], [-0.08, 0.07], [0.26, -0.02], [-0.08, -0.06]] },
				{ x: side * 1.32, points: [[-0.56, -0.14], [-0.30, -0.10], [-0.04, -0.16], [-0.30, -0.18]] }
			];
			root.add(new THREE.Mesh(MaterialLibrary.createSpanLoftedGeometry(wingSections, side < 0), mats.primaryArmor));
		}

		// 後部スラスターリング
		const rearRing = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.04, 6, 12), mats.thrusterGlow);
		rearRing.position.set(0, 0, -0.80);
		root.add(rearRing);
	}

	/**
	 * TYPE-E: EMERALD PHANTOM（長距離ステルス狙撃機）
	 * 精密細身ボディ＋展開式エネルギーシールド＋超ロング・レールスナイパー砲
	 */
	function buildTypeE(root, mats) {
		// 細身のステルス胴体（後方 -Z → 前方 +Z）
		const bodySections = [
			{ z: -0.96, points: [[0.24, 0.00], [0.16, 0.18], [0, 0.22], [-0.16, 0.18], [-0.24, 0.00], [-0.16, -0.14], [0, -0.17], [0.16, -0.14]] },
			{ z: -0.05, points: [[0.30, 0.00], [0.20, 0.24], [0, 0.28], [-0.20, 0.24], [-0.30, 0.00], [-0.20, -0.18], [0, -0.22], [0.20, -0.18]] },
			{ z: 0.68,  points: [[0.14, 0.00], [0.10, 0.11], [0, 0.13], [-0.10, 0.11], [-0.14, 0.00], [-0.10, -0.09], [0, -0.10], [0.10, -0.09]] }
		];
		root.add(new THREE.Mesh(MaterialLibrary.createLoftedGeometry(bodySections, true, true), mats.primaryArmor));

		// 超ロング・スナイパーレールガン（上下2本のレール + 中央の発光アクセラレーターライン）
		const railGeo = new THREE.BoxGeometry(0.08, 0.045, 1.38);
		const topRail = new THREE.Mesh(railGeo, mats.gunmetal);
		topRail.position.set(0, 0.06, 0.92);
		root.add(topRail);

		const botRail = new THREE.Mesh(railGeo, mats.gunmetal);
		botRail.position.set(0, -0.06, 0.92);
		root.add(botRail);

		const accelCore = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.036, 1.24), mats.glowCore);
		accelCore.position.set(0, 0, 0.96);
		root.add(accelCore);

		// 精密光学照準スコープ（高輝度レンズ）
		const scopeBody = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.42), mats.darkArmor);
		scopeBody.position.set(0, 0.24, 0.36);
		root.add(scopeBody);

		const scopeLens = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.05, 10), mats.glowCore);
		scopeLens.rotation.x = Math.PI / 2;
		scopeLens.position.set(0, 0.24, 0.59);
		root.add(scopeLens);

		// 左右の展開式ステルスシールド（ダーク装甲＋エメラルド発光トリム）
		for (const side of [-1, 1]) {
			const shieldGroup = new THREE.Group();
			shieldGroup.position.set(side * 0.62, 0.0, 0.12);
			shieldGroup.rotation.y = side * -0.26;

			// 多角形シールドプレート
			const shieldMain = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.96, 0.72), mats.darkArmor);
			shieldGroup.add(shieldMain);

			const shieldArmor = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.62, 0.44), mats.primaryArmor);
			shieldArmor.position.set(side * 0.02, 0, 0.06);
			shieldGroup.add(shieldArmor);

			// シールド前縁の発光エネルギーエッジ
			const trim = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.88, 0.05), mats.glowCore);
			trim.position.set(0, 0, 0.37);
			shieldGroup.add(trim);

			// 接続アーム
			const arm = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.10, 0.14), mats.gunmetal);
			arm.position.set(side * -0.22, 0, -0.10);
			shieldGroup.add(arm);

			root.add(shieldGroup);
		}
	}

	/**
	 * TYPE-F: CYBER VORTEX（高速自転プラズマ円盤）
	 * 多層ソーサーリング＋6枚の斜め装甲ブレード＋中央ダークケージ＆白熱プラズマコア
	 */
	function buildTypeF(root, mats) {
		// メイン外周装甲リング（水平）
		const outerRingGeo = new THREE.TorusGeometry(1.18, 0.24, 8, 24);
		outerRingGeo.rotateX(Math.PI / 2);
		root.add(new THREE.Mesh(outerRingGeo, mats.primaryArmor));

		// リング内側の発光プラズマ溝
		const glowRingGeo = new THREE.TorusGeometry(0.96, 0.06, 6, 24);
		glowRingGeo.rotateX(Math.PI / 2);
		root.add(new THREE.Mesh(glowRingGeo, mats.glowCore));

		// 外周に突き出す 6 枚の斜めステルスブレード（回転シルエットを強烈に強調）
		const bladeGeo = new THREE.BoxGeometry(0.56, 0.10, 0.26);
		for (let i = 0; i < 6; i++) {
			const angle = (i / 6) * Math.PI * 2;
			const holder = new THREE.Group();
			holder.rotation.y = angle;

			const blade = new THREE.Mesh(bladeGeo, mats.darkArmor);
			blade.position.set(1.36, 0, 0.12);
			blade.rotation.y = -0.45;
			holder.add(blade);

			const tip = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.06, 0.08), mats.glowCore);
			tip.position.set(1.60, 0, 0.22);
			tip.rotation.y = -0.45;
			holder.add(tip);

			root.add(holder);
		}

		// 中央の高輝度プラズマリアクターコア
		const coreSphere = new THREE.Mesh(new THREE.OctahedronGeometry(0.52, 1), mats.glowCore);
		root.add(coreSphere);

		// 上下のダーク多面体リアクタースピンドル
		const topCone = new THREE.Mesh(new THREE.ConeGeometry(0.68, 1.15, 6), mats.darkArmor);
		topCone.position.y = 0.72;
		root.add(topCone);

		const botCone = new THREE.Mesh(new THREE.ConeGeometry(0.68, 1.15, 6), mats.darkArmor);
		botCone.rotation.x = Math.PI;
		botCone.position.y = -0.72;
		root.add(botCone);

		// 上下スピンドルを繋ぐ金属フレーム支柱 3 本
		const strutGeo = new THREE.BoxGeometry(0.10, 1.10, 0.12);
		for (let i = 0; i < 3; i++) {
			const angle = (i / 3) * Math.PI * 2;
			const strut = new THREE.Mesh(strutGeo, mats.brightMetal);
			strut.position.set(Math.cos(angle) * 0.68, 0, Math.sin(angle) * 0.68);
			strut.rotation.y = -angle;
			root.add(strut);
		}
	}

	/**
	 * 指定タイプの敵機 3D モデルを構築して返す
	 * @param {string} type - 'A' | 'B' | 'C' | 'D' | 'E' | 'F'
	 * @param {number} colorHex - テーマカラー
	 * @returns {{mesh: THREE.Group, flashMats: THREE.Material[]}}
	 */
	function build(type, colorHex) {
		const root = new THREE.Group();
		const mats = createMaterials(colorHex);

		switch (type) {
			case 'A': buildTypeA(root, mats); break;
			case 'B': buildTypeB(root, mats); break;
			case 'C': buildTypeC(root, mats); break;
			case 'D': buildTypeD(root, mats); break;
			case 'E': buildTypeE(root, mats); break;
			case 'F': buildTypeF(root, mats); break;
			default: buildTypeA(root, mats); break;
		}

		// 影設定（発光パーツ以外は影を落とす・受ける）
		root.castShadow = true;
		root.receiveShadow = true;
		root.traverse((child) => {
			if (!child.isMesh) return;
			const isGlow = child.material === mats.glowCore || child.material === mats.thrusterGlow;
			child.castShadow = !isGlow;
			child.receiveShadow = !isGlow;
		});

		return {
			mesh: root,
			flashMats: mats.flashMats
		};
	}

	return { build };
})();
