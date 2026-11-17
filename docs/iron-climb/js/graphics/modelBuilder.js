import * as THREE from 'three';
import { textureFactory } from './textureFactory.js';

/**
 * 共通メッシュ生成ヘルパー（シャドウ付与）
 */
function makePart(geo, mat, castShadow = true, receiveShadow = true) {
	const mesh = new THREE.Mesh(geo, mat);
	mesh.castShadow = castShadow;
	mesh.receiveShadow = receiveShadow;
	return mesh;
}

function smoothstep(edge0, edge1, x) {
	const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
	return t * t * (3 - 2 * t);
}

/**
 * マイクラ風の角張った箱型ブロック（BoxGeometry）を精細に組み合わせた3頭身クライマー・ワーカーモデルを構築する
 * 肘・膝の2関節可動および歩行・ジャンプ・梯子・ハンマー・クリア演出の全モーションと完全互換を保ちつつ、
 * ゴーグル付きブラウンヘア、オレンジ×イエロー反射ライン入りスチールブルーツナギ、斜め掛けストラップ、
 * ベルト・大型サッチェルポーチ・レンチ、折り返し袖・裾、角型ワークグローブ＆ブーツを再現する。
 * @param {{ geo: Function, mat: Function }} tracker
 */
export function buildHeroWorkerModel(tracker) {
	// すべて不透明PBRマテリアルで無敵時の半透明表示・復帰と完全互換
	const suitBlueMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0x3b6982,
		metalness: 0.08,
		roughness: 0.62
	}));
	const suitBlueDarkMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0x2b5066,
		metalness: 0.1,
		roughness: 0.66
	}));
	const suitBlueLightMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0x4d7e99,
		metalness: 0.08,
		roughness: 0.56
	}));
	const safetyOrangeMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0xd96b27,
		metalness: 0.06,
		roughness: 0.52
	}));
	const reflectorYellowMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0xd8c952,
		emissive: 0x4a4210,
		emissiveIntensity: 0.18,
		metalness: 0.12,
		roughness: 0.42
	}));
	const undershirtMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0xede8de,
		metalness: 0.02,
		roughness: 0.68
	}));
	const skinMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0xebb68b,
		metalness: 0.02,
		roughness: 0.58
	}));
	const skinShadeMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0xd59b70,
		metalness: 0.02,
		roughness: 0.62
	}));
	const hairBaseMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0x57361f,
		metalness: 0.05,
		roughness: 0.68
	}));
	const hairLightMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0x6b4428,
		metalness: 0.06,
		roughness: 0.62
	}));
	const hairDarkMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0x422714,
		metalness: 0.04,
		roughness: 0.72
	}));
	const goggleFrameMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0x8f99a4,
		metalness: 0.68,
		roughness: 0.32
	}));
	const goggleRimDarkMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0x555e68,
		metalness: 0.58,
		roughness: 0.38
	}));
	const goggleStrapMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0x3b3632,
		metalness: 0.12,
		roughness: 0.68
	}));
	const goggleLensMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0x8fd3e8,
		emissive: 0x1b6ca8,
		emissiveIntensity: 0.24,
		metalness: 0.55,
		roughness: 0.14
	}));
	const goggleGlintMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0xdff6ff,
		emissive: 0xbae6fd,
		emissiveIntensity: 0.35,
		roughness: 0.12
	}));
	const gloveMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0x6d614b,
		metalness: 0.06,
		roughness: 0.68
	}));
	const gloveCuffMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0x857860,
		metalness: 0.06,
		roughness: 0.64
	}));
	const gloveDarkMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0x524837,
		metalness: 0.08,
		roughness: 0.72
	}));
	const beltLeatherMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0x593e27,
		metalness: 0.1,
		roughness: 0.62
	}));
	const pouchBrownMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0x8c522a,
		metalness: 0.1,
		roughness: 0.56
	}));
	const pouchDarkMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0x693b1c,
		metalness: 0.1,
		roughness: 0.6
	}));
	const bootBrownMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0x6e472b,
		metalness: 0.12,
		roughness: 0.58
	}));
	const bootToeMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0x573720,
		metalness: 0.14,
		roughness: 0.62
	}));
	const soleDarkMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0x292421,
		metalness: 0.18,
		roughness: 0.72
	}));
	const kneePadMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0x323b44,
		metalness: 0.22,
		roughness: 0.54
	}));
	const silverMetalMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0xa6b0bb,
		metalness: 0.82,
		roughness: 0.26
	}));
	const darkMetalMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0x454f59,
		metalness: 0.76,
		roughness: 0.34
	}));
	const eyeWhiteMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0xfafcff,
		emissive: 0xffffff,
		emissiveIntensity: 0.12,
		roughness: 0.2
	}));
	const eyeNavyMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0x162c46,
		roughness: 0.18
	}));
	const mouthMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0x593122,
		roughness: 0.58
	}));

	const box = (w, h, d, mat, cast = true, receive = true) =>
		makePart(tracker.geo(new THREE.BoxGeometry(w, h, d)), mat, cast, receive);

	const root = new THREE.Group();
	const basePelvisY = 0.62;

	// 腰・重心グループ（y=0.62 基準、全高約1.35uを頭:胴:脚=1:1:1で分割した3頭身ブロック構成）
	const pelvis = new THREE.Group();
	pelvis.position.y = basePelvisY;
	root.add(pelvis);

	// 胴体グループ（角張ったツナギ胴体＋高視認オレンジ＆イエロー反射ヨーク＋ベルト＆工具ポーチ群）
	const torso = new THREE.Group();
	pelvis.add(torso);

	// 腰ブロック（ツナギ下部）
	const hipBlock = box(0.284, 0.11, 0.182, suitBlueDarkMat);
	hipBlock.position.set(0, -0.105, 0);
	torso.add(hipBlock);

	const hipFlySeam = box(0.026, 0.095, 0.188, suitBlueMat, false, false);
	hipFlySeam.position.set(0, -0.105, 0);
	torso.add(hipFlySeam);

	// メイン胴体ブロック（スチールブルーの角型チェスト）
	const chestBlock = box(0.304, 0.26, 0.19, suitBlueMat);
	chestBlock.position.set(0, 0.13, 0);
	torso.add(chestBlock);

	// 脇腹の立体パネル段差ブロック
	for (const side of [-1, 1]) {
		const sideSeam = box(0.012, 0.22, 0.16, suitBlueDarkMat, false, false);
		sideSeam.position.set(side * 0.154, 0.125, 0);
		torso.add(sideSeam);
	}

	// 上半身の高視認オレンジヨーク＆イエロー反射ストライプ（前面・背面・肩上）
	const backOrangeYoke = box(0.244, 0.125, 0.014, safetyOrangeMat, false, false);
	backOrangeYoke.position.set(0, 0.19, -0.093);
	torso.add(backOrangeYoke);

	// 背面イエロー反射ライン（外枠U字＋水平ライン）
	const backRefBottom = box(0.268, 0.018, 0.016, reflectorYellowMat, false, false);
	backRefBottom.position.set(0, 0.122, -0.094);
	torso.add(backRefBottom);

	const backRefLowerSub = box(0.292, 0.014, 0.015, reflectorYellowMat, false, false);
	backRefLowerSub.position.set(0, 0.098, -0.093);
	torso.add(backRefLowerSub);

	for (const side of [-1, 1]) {
		const backRefVert = box(0.018, 0.132, 0.016, reflectorYellowMat, false, false);
		backRefVert.position.set(side * 0.116, 0.19, -0.094);
		torso.add(backRefVert);

		// 前面左右のオレンジヨーク＆縦イエロー反射ストライプ
		const frontOrangePanel = box(0.088, 0.086, 0.014, safetyOrangeMat, false, false);
		frontOrangePanel.position.set(side * 0.098, 0.21, 0.093);
		torso.add(frontOrangePanel);

		const frontRefVert = box(0.02, 0.09, 0.016, reflectorYellowMat, false, false);
		frontRefVert.position.set(side * 0.098, 0.21, 0.095);
		torso.add(frontRefVert);

		const frontRefHoriz = box(0.096, 0.016, 0.016, reflectorYellowMat, false, false);
		frontRefHoriz.position.set(side * 0.098, 0.162, 0.095);
		torso.add(frontRefHoriz);

		// 肩上のオレンジ＆反射ライン接続ブロック
		const shoulderYoke = box(0.086, 0.014, 0.194, safetyOrangeMat, false, false);
		shoulderYoke.position.set(side * 0.098, 0.262, 0);
		torso.add(shoulderYoke);
	}

	// 首元の白いインナーシャツ＆角張ったオープンカラー（襟）
	const undershirtV = box(0.092, 0.072, 0.016, undershirtMat, false, false);
	undershirtV.position.set(0, 0.224, 0.092);
	torso.add(undershirtV);

	const collarBack = box(0.176, 0.032, 0.028, suitBlueLightMat, false, false);
	collarBack.position.set(0, 0.268, -0.068);
	torso.add(collarBack);

	for (const side of [-1, 1]) {
		const collarSide = box(0.032, 0.036, 0.135, suitBlueLightMat, false, false);
		collarSide.position.set(side * 0.078, 0.266, -0.01);
		torso.add(collarSide);

		const lapel = box(0.046, 0.084, 0.02, suitBlueLightMat, false, false);
		lapel.position.set(side * 0.052, 0.214, 0.098);
		lapel.rotation.z = side * 0.28;
		torso.add(lapel);
	}

	// フロント中央ジッパーライン＆角型スライダー引き手
	const zipperSeam = box(0.018, 0.19, 0.014, suitBlueDarkMat, false, false);
	zipperSeam.position.set(0, 0.096, 0.094);
	torso.add(zipperSeam);

	const zipperBase = box(0.024, 0.022, 0.018, silverMetalMat, false, false);
	zipperBase.position.set(0, 0.176, 0.101);
	torso.add(zipperBase);

	const zipperPullTab = box(0.016, 0.032, 0.014, silverMetalMat, false, false);
	zipperPullTab.position.set(0, 0.154, 0.106);
	torso.add(zipperPullTab);

	// 左右の角型チェストポケット＆フラップ＋左胸ポケットのペン・工具差し
	for (const side of [-1, 1]) {
		const pocketBody = box(0.078, 0.072, 0.018, suitBlueLightMat, false, false);
		pocketBody.position.set(side * 0.086, 0.104, 0.096);
		torso.add(pocketBody);

		const pocketFlap = box(0.082, 0.022, 0.022, suitBlueMat, false, false);
		pocketFlap.position.set(side * 0.086, 0.132, 0.098);
		torso.add(pocketFlap);
	}
	const penTool1 = box(0.014, 0.03, 0.014, silverMetalMat, false, false);
	penTool1.position.set(0.072, 0.15, 0.098);
	torso.add(penTool1);

	const penTool2 = box(0.014, 0.026, 0.014, safetyOrangeMat, false, false);
	penTool2.position.set(0.094, 0.148, 0.098);
	torso.add(penTool2);

	// 斜め掛けレザーショルダーストラップ（右肩から左腰後ろへ横断）
	const backCrossStrap = box(0.042, 0.30, 0.018, beltLeatherMat);
	backCrossStrap.position.set(0.01, 0.135, -0.098);
	backCrossStrap.rotation.z = -0.56;
	torso.add(backCrossStrap);

	const frontRightStrap = box(0.038, 0.11, 0.018, beltLeatherMat);
	frontRightStrap.position.set(0.106, 0.214, 0.098);
	frontRightStrap.rotation.z = 0.22;
	torso.add(frontRightStrap);

	const topShoulderStrap = box(0.042, 0.02, 0.206, beltLeatherMat);
	topShoulderStrap.position.set(0.098, 0.266, 0);
	torso.add(topShoulderStrap);

	// ユーティリティレザーベルト＆角型シルバーバックル
	const beltBand = box(0.308, 0.054, 0.204, beltLeatherMat);
	beltBand.position.set(0, -0.024, 0);
	torso.add(beltBand);

	for (const lx of [-0.11, -0.052, 0.052, 0.11]) {
		const beltLoop = box(0.018, 0.064, 0.212, suitBlueDarkMat, false, false);
		beltLoop.position.set(lx, -0.024, 0);
		torso.add(beltLoop);
	}

	const buckleFrame = box(0.068, 0.066, 0.022, silverMetalMat, false, false);
	buckleFrame.position.set(0, -0.024, 0.104);
	torso.add(buckleFrame);

	const buckleInner = box(0.038, 0.038, 0.024, beltLeatherMat, false, false);
	buckleInner.position.set(0, -0.024, 0.105);
	torso.add(buckleInner);

	const buckleProng = box(0.024, 0.012, 0.026, silverMetalMat, false, false);
	buckleProng.position.set(0.01, -0.024, 0.106);
	torso.add(buckleProng);

	// 背面右側の大型ブラウンレザー・サッチェルバッグ（2連バックル付き）
	const backSatchel = new THREE.Group();
	backSatchel.position.set(0.056, -0.055, -0.125);
	torso.add(backSatchel);

	const satchelBody = box(0.138, 0.124, 0.068, pouchBrownMat);
	backSatchel.add(satchelBody);

	const satchelFlap = box(0.144, 0.056, 0.074, pouchDarkMat);
	satchelFlap.position.set(0, 0.038, 0);
	backSatchel.add(satchelFlap);

	for (const sx of [-0.038, 0.038]) {
		const claspStrap = box(0.018, 0.055, 0.078, beltLeatherMat, false, false);
		claspStrap.position.set(sx, 0.004, 0);
		backSatchel.add(claspStrap);

		const claspBuckle = box(0.024, 0.022, 0.082, silverMetalMat, false, false);
		claspBuckle.position.set(sx, -0.008, 0);
		backSatchel.add(claspBuckle);
	}

	// 背面左側のツールホルスター＆差し込まれた角型レンチ
	const backHolster = new THREE.Group();
	backHolster.position.set(-0.088, -0.062, -0.112);
	torso.add(backHolster);

	const holsterBody = box(0.082, 0.112, 0.052, beltLeatherMat);
	backHolster.add(holsterBody);

	const holsterRim = box(0.088, 0.024, 0.058, pouchDarkMat);
	holsterRim.position.set(0, 0.046, 0);
	backHolster.add(holsterRim);

	const backWrench = new THREE.Group();
	backWrench.position.set(0.008, 0.072, 0);
	backWrench.rotation.z = -0.22;
	backHolster.add(backWrench);

	const backWrenchShaft = box(0.022, 0.065, 0.014, silverMetalMat, false, false);
	backWrench.add(backWrenchShaft);

	const backWrenchJawBase = box(0.046, 0.02, 0.016, silverMetalMat, false, false);
	backWrenchJawBase.position.set(0, 0.036, 0);
	backWrench.add(backWrenchJawBase);

	for (const jx of [-0.015, 0.015]) {
		const jawProng = box(0.014, 0.026, 0.016, silverMetalMat, false, false);
		jawProng.position.set(jx, 0.054, 0);
		backWrench.add(jawProng);
	}

	// 左腰前〜側面に吊り下げた角型スパナ（レンチ）＆揺れ連動ストラップタブ（scarfTailLeft / scarfTailRight 互換）
	const scarfTailLeft = new THREE.Group();
	scarfTailLeft.position.set(-0.145, -0.028, -0.02);
	torso.add(scarfTailLeft);

	const sidePouchL = box(0.038, 0.11, 0.086, pouchBrownMat);
	sidePouchL.position.set(-0.012, -0.055, 0);
	scarfTailLeft.add(sidePouchL);

	const scarfTailRight = new THREE.Group();
	scarfTailRight.position.set(0.118, -0.024, 0.088);
	torso.add(scarfTailRight);

	// 右前腰（正面視で向かって右側）の大型スパナ（参考画像のベルト掛けレンチ）
	const frontWrench = new THREE.Group();
	frontWrench.position.set(0.018, -0.035, 0.016);
	scarfTailRight.add(frontWrench);

	const wrenchHandle = box(0.026, 0.145, 0.016, silverMetalMat);
	wrenchHandle.position.set(0, -0.035, 0);
	frontWrench.add(wrenchHandle);

	const wrenchGripHole = box(0.012, 0.016, 0.02, darkMetalMat, false, false);
	wrenchGripHole.position.set(0, -0.09, 0);
	frontWrench.add(wrenchGripHole);

	const wrenchHeadBase = box(0.056, 0.026, 0.02, silverMetalMat);
	wrenchHeadBase.position.set(0, 0.044, 0);
	frontWrench.add(wrenchHeadBase);

	for (const wx of [-0.018, 0.018]) {
		const wrenchJaw = box(0.018, 0.034, 0.02, silverMetalMat);
		wrenchJaw.position.set(wx, 0.068, 0);
		frontWrench.add(wrenchJaw);
	}

	// 頭部グループ（3頭身の最上段1/3：角張ったキューブ顔＋多層ブロックヘア＋額の角型ワークゴーグル）
	const head = new THREE.Group();
	head.position.set(0, 0.27, 0);
	torso.add(head);

	// 角型ネックブロック
	const neckBlock = box(0.132, 0.052, 0.122, skinShadeMat);
	neckBlock.position.set(0, 0.016, -0.006);
	head.add(neckBlock);

	// メイン頭部ブロック（マイクラ風の直線的な箱型フェイス）
	const headCube = box(0.304, 0.286, 0.268, skinMat);
	headCube.position.set(0, 0.172, 0);
	head.add(headCube);

	// 顎下の控えめなシャドウ段差ブロック
	const jawUnderBlock = box(0.26, 0.016, 0.22, skinShadeMat, false, false);
	jawUnderBlock.position.set(0, 0.026, -0.006);
	head.add(jawUnderBlock);

	// 角型ノーズ（正面中央の直方体鼻）
	const noseBlock = box(0.044, 0.036, 0.028, skinShadeMat);
	noseBlock.position.set(0, 0.132, 0.142);
	head.add(noseBlock);

	// 自信のある口元（直線ブロック＋片側が少し上がったニヤリ口角）
	const mouthMain = box(0.076, 0.014, 0.012, mouthMat, false, false);
	mouthMain.position.set(-0.004, 0.082, 0.136);
	mouthMain.rotation.z = -0.06;
	head.add(mouthMain);

	const mouthSmirkTip = box(0.018, 0.016, 0.012, mouthMat, false, false);
	mouthSmirkTip.position.set(-0.044, 0.088, 0.136);
	head.add(mouthSmirkTip);

	// 左右の角型アイ・角型眉・角型耳
	for (const side of [-1, 1]) {
		// 白目ブロック（外側）＋濃紺瞳ブロック（内側寄り）＋四角いハイライト
		const scleraBlock = box(0.068, 0.048, 0.012, eyeWhiteMat, false, false);
		scleraBlock.position.set(side * 0.068, 0.168, 0.134);
		head.add(scleraBlock);

		const irisBlock = box(0.038, 0.048, 0.015, eyeNavyMat, false, false);
		irisBlock.position.set(side * 0.056, 0.168, 0.136);
		head.add(irisBlock);

		const eyeGlint = box(0.012, 0.012, 0.017, eyeWhiteMat, false, false);
		eyeGlint.position.set(side * 0.056 - 0.008, 0.178, 0.138);
		head.add(eyeGlint);

		// 力強い角型ブラウン眉
		const browBlock = box(0.082, 0.024, 0.02, hairDarkMat, false, false);
		browBlock.position.set(side * 0.068, 0.21, 0.138);
		browBlock.rotation.z = -side * 0.06;
		head.add(browBlock);

		// 側面から張り出す角型耳ブロック＋耳穴段差
		const earOuter = box(0.038, 0.088, 0.062, skinMat);
		earOuter.position.set(side * 0.166, 0.162, -0.012);
		head.add(earOuter);

		const earInner = box(0.042, 0.048, 0.032, skinShadeMat, false, false);
		earInner.position.set(side * 0.167, 0.162, -0.012);
		head.add(earInner);
	}

	// 多層ボクセル／ブロック調ブラウンヘア（天頂・前髪・もみあげ・後頭部の段差ブロック造形）
	const hairCrownBase = box(0.326, 0.086, 0.292, hairBaseMat);
	hairCrownBase.position.set(0, 0.326, -0.006);
	head.add(hairCrownBase);

	const hairTopLayer1 = box(0.304, 0.052, 0.264, hairLightMat);
	hairTopLayer1.position.set(0, 0.382, -0.004);
	head.add(hairTopLayer1);

	const hairTopTufts = [
		{ x: -0.082, y: 0.418, z: 0.042, w: 0.105, h: 0.044, d: 0.115, mat: hairBaseMat },
		{ x: 0.018, y: 0.428, z: 0.036, w: 0.112, h: 0.052, d: 0.124, mat: hairLightMat },
		{ x: 0.102, y: 0.414, z: 0.028, w: 0.088, h: 0.04, d: 0.108, mat: hairBaseMat },
		{ x: -0.055, y: 0.436, z: -0.052, w: 0.125, h: 0.048, d: 0.118, mat: hairLightMat },
		{ x: 0.068, y: 0.424, z: -0.058, w: 0.118, h: 0.044, d: 0.112, mat: hairBaseMat },
		{ x: 0.0, y: 0.41, z: -0.115, w: 0.22, h: 0.042, d: 0.068, mat: hairDarkMat }
	];
	for (const t of hairTopTufts) {
		const tuft = box(t.w, t.h, t.d, t.mat);
		tuft.position.set(t.x, t.y, t.z);
		head.add(tuft);
	}

	// ゴーグル下から覗く前髪＆こめかみブロック
	const frontHairLine = box(0.312, 0.038, 0.042, hairBaseMat);
	frontHairLine.position.set(0, 0.242, 0.128);
	head.add(frontHairLine);

	const bangBlocks = [
		{ x: -0.122, y: 0.226, z: 0.132, w: 0.062, h: 0.036, d: 0.036, mat: hairDarkMat },
		{ x: -0.042, y: 0.232, z: 0.136, w: 0.068, h: 0.028, d: 0.034, mat: hairLightMat },
		{ x: 0.048, y: 0.234, z: 0.135, w: 0.072, h: 0.026, d: 0.034, mat: hairBaseMat },
		{ x: 0.124, y: 0.224, z: 0.132, w: 0.058, h: 0.038, d: 0.036, mat: hairDarkMat }
	];
	for (const b of bangBlocks) {
		const bang = box(b.w, b.h, b.d, b.mat);
		bang.position.set(b.x, b.y, b.z);
		head.add(bang);
	}

	// 側頭部・耳前もみあげ・耳後ろの段差ブロック
	for (const side of [-1, 1]) {
		const templeUpper = box(0.036, 0.115, 0.278, hairBaseMat);
		templeUpper.position.set(side * 0.158, 0.258, -0.008);
		head.add(templeUpper);

		// 耳前のもみあげブロック
		const sideburnUpper = box(0.034, 0.078, 0.062, hairBaseMat);
		sideburnUpper.position.set(side * 0.158, 0.195, 0.074);
		head.add(sideburnUpper);

		const sideburnTip = box(0.03, 0.054, 0.042, hairDarkMat);
		sideburnTip.position.set(side * 0.156, 0.148, 0.086);
		head.add(sideburnTip);

		// 耳後ろのサイドヘアブロック
		const behindEarBlock = box(0.042, 0.165, 0.108, hairBaseMat);
		behindEarBlock.position.set(side * 0.158, 0.158, -0.088);
		head.add(behindEarBlock);

		const lowerSideTuft = box(0.038, 0.068, 0.074, hairDarkMat);
		lowerSideTuft.position.set(side * 0.148, 0.082, -0.104);
		head.add(lowerSideTuft);
	}

	// 後頭部の多段レイヤーヘアブロック（背面視での立体的な段差を再現）
	const backHairMain = box(0.322, 0.235, 0.056, hairBaseMat);
	backHairMain.position.set(0, 0.188, -0.132);
	head.add(backHairMain);

	const backHairLayers = [
		{ x: 0, y: 0.235, z: -0.156, w: 0.286, h: 0.078, d: 0.032, mat: hairLightMat },
		{ x: -0.068, y: 0.162, z: -0.158, w: 0.132, h: 0.074, d: 0.034, mat: hairBaseMat },
		{ x: 0.068, y: 0.158, z: -0.158, w: 0.132, h: 0.078, d: 0.034, mat: hairLightMat },
		{ x: 0, y: 0.102, z: -0.152, w: 0.268, h: 0.068, d: 0.032, mat: hairDarkMat },
		{ x: -0.075, y: 0.058, z: -0.138, w: 0.095, h: 0.046, d: 0.028, mat: hairDarkMat },
		{ x: 0, y: 0.052, z: -0.142, w: 0.098, h: 0.052, d: 0.03, mat: hairBaseMat },
		{ x: 0.075, y: 0.058, z: -0.138, w: 0.095, h: 0.046, d: 0.028, mat: hairDarkMat }
	];
	for (const bl of backHairLayers) {
		const layerMesh = box(bl.w, bl.h, bl.d, bl.mat);
		layerMesh.position.set(bl.x, bl.y, bl.z);
		head.add(layerMesh);
	}

	// 額に装着した角型ワークゴーグル＆周囲を一周するダークバンド
	const goggleGroup = new THREE.Group();
	goggleGroup.position.set(0, 0.296, 0);
	head.add(goggleGroup);

	const strapBack = box(0.344, 0.044, 0.024, goggleStrapMat);
	strapBack.position.set(0, 0, -0.154);
	goggleGroup.add(strapBack);

	for (const side of [-1, 1]) {
		const strapSide = box(0.024, 0.044, 0.312, goggleStrapMat);
		strapSide.position.set(side * 0.166, 0, -0.002);
		goggleGroup.add(strapSide);

		const sideMount = box(0.032, 0.068, 0.042, goggleRimDarkMat);
		sideMount.position.set(side * 0.158, 0, 0.146);
		goggleGroup.add(sideMount);
	}

	// ゴーグル前面のシルバーフレーム＆水色レンズ（中央ブリッジ段差＋斜めハイライト付き）
	const goggleBackPlate = box(0.308, 0.104, 0.032, goggleRimDarkMat);
	goggleBackPlate.position.set(0, 0, 0.152);
	goggleGroup.add(goggleBackPlate);

	const goggleTopBar = box(0.298, 0.022, 0.042, goggleFrameMat);
	goggleTopBar.position.set(0, 0.044, 0.162);
	goggleGroup.add(goggleTopBar);

	const goggleBottomBar = box(0.288, 0.02, 0.042, goggleFrameMat);
	goggleBottomBar.position.set(0, -0.044, 0.162);
	goggleGroup.add(goggleBottomBar);

	const goggleCenterBridge = box(0.034, 0.042, 0.044, goggleFrameMat);
	goggleCenterBridge.position.set(0, -0.018, 0.163);
	goggleGroup.add(goggleCenterBridge);

	for (const side of [-1, 1]) {
		const goggleSideBar = box(0.024, 0.104, 0.042, goggleFrameMat);
		goggleSideBar.position.set(side * 0.142, 0, 0.162);
		goggleGroup.add(goggleSideBar);
	}

	const goggleLens = box(0.262, 0.068, 0.022, goggleLensMat);
	goggleLens.position.set(0, 0.002, 0.168);
	goggleGroup.add(goggleLens);

	// レンズ表面の直線的な斜め反射ハイライト
	const lensGlint1 = box(0.022, 0.062, 0.006, goggleGlintMat, false, false);
	lensGlint1.position.set(-0.062, 0.002, 0.181);
	lensGlint1.rotation.z = -0.35;
	goggleGroup.add(lensGlint1);

	const lensGlint2 = box(0.012, 0.058, 0.006, goggleGlintMat, false, false);
	lensGlint2.position.set(0.048, 0.002, 0.181);
	lensGlint2.rotation.z = -0.35;
	goggleGroup.add(lensGlint2);

	// 腕（2関節構造：角張った肩 shoulder → ロールアップ袖カフ → 肘 elbow → 角型素肌前腕 → カフ付き角型ワークグローブ）
	const buildArm = (side) => {
		const shoulder = new THREE.Group();
		shoulder.position.set(side * 0.208, 0.232, 0);
		torso.add(shoulder);

		// 角が立った上腕ブロック
		const upperArm = box(0.106, 0.165, 0.112, suitBlueMat);
		upperArm.position.set(0, -0.062, 0);
		shoulder.add(upperArm);

		// 肩先のシャープなエッジキャップ
		const shoulderCap = box(0.112, 0.032, 0.118, suitBlueLightMat);
		shoulderCap.position.set(0, 0.012, 0);
		shoulder.add(shoulderCap);

		// 肘上の2段ロールアップ袖（折り返しカフス）
		const sleeveRollUpper = box(0.118, 0.028, 0.122, suitBlueDarkMat);
		sleeveRollUpper.position.set(0, -0.122, 0);
		shoulder.add(sleeveRollUpper);

		const sleeveRollCuff = box(0.124, 0.042, 0.128, suitBlueLightMat);
		sleeveRollCuff.position.set(0, -0.148, 0);
		shoulder.add(sleeveRollCuff);

		const elbow = new THREE.Group();
		elbow.position.set(0, -0.165, 0);
		shoulder.add(elbow);

		// 角型前腕ブロック（素肌）
		const forearm = box(0.09, 0.125, 0.094, skinMat);
		forearm.position.set(0, -0.056, 0);
		elbow.add(forearm);

		// ワークグローブの厚手リストカフ（手首の折り返しバンド）
		const gloveCuff = box(0.116, 0.044, 0.12, gloveCuffMat);
		gloveCuff.position.set(0, -0.126, 0);
		elbow.add(gloveCuff);

		const gloveCuffTrim = box(0.108, 0.014, 0.112, gloveDarkMat, false, false);
		gloveCuffTrim.position.set(0, -0.148, 0);
		elbow.add(gloveCuffTrim);

		// ワークグローブ本体＋ナックルガード＋親指ブロック＋指先グリップ段差
		const gloveHand = box(0.102, 0.078, 0.106, gloveMat);
		gloveHand.position.set(0, -0.184, 0);
		elbow.add(gloveHand);

		const gloveKnuckle = box(0.106, 0.032, 0.024, gloveCuffMat, false, false);
		gloveKnuckle.position.set(0, -0.172, -0.046);
		elbow.add(gloveKnuckle);

		const gloveFingers = box(0.096, 0.028, 0.098, gloveDarkMat);
		gloveFingers.position.set(0, -0.228, 0.004);
		elbow.add(gloveFingers);

		const gloveThumb = box(0.036, 0.056, 0.046, gloveMat);
		gloveThumb.position.set(-side * 0.058, -0.186, 0.026);
		elbow.add(gloveThumb);

		return { shoulder, elbow };
	};

	const leftArmParts = buildArm(-1);
	const rightArmParts = buildArm(1);
	const leftArm = leftArmParts.shoulder;
	const rightArm = rightArmParts.shoulder;
	const leftElbow = leftArmParts.elbow;
	const rightElbow = rightArmParts.elbow;

	// パワーハンマー（金属製クロームヘッド × ガンメタル＆カッパー金属柄を右手前腕に合わせて装備）
	const hammerGroup = buildPowerHammerModel(tracker, { pivotAtGrip: true, scale: 0.94 });
	hammerGroup.position.set(0, -0.2, 0.09);
	hammerGroup.rotation.x = Math.PI * 0.78;
	hammerGroup.visible = false;
	rightElbow.add(hammerGroup);

	// 脚（2関節構造：股 hip → 角型太もも → 膝パッド knee → 角型すね＆ロールアップ裾 → 角型ワークブーツ）
	const buildLeg = (side) => {
		const hip = new THREE.Group();
		hip.position.set(side * 0.084, -0.14, 0);
		pelvis.add(hip);

		// 角型太ももブロック
		const thigh = box(0.122, 0.21, 0.132, suitBlueMat);
		thigh.position.set(0, -0.105, 0);
		hip.add(thigh);

		const thighOutseam = box(0.012, 0.19, 0.024, suitBlueDarkMat, false, false);
		thighOutseam.position.set(side * 0.062, -0.105, 0);
		hip.add(thighOutseam);

		// 膝関節グループ（y=-0.22、地面から0.26u）
		const knee = new THREE.Group();
		knee.position.set(0, -0.22, 0);
		hip.add(knee);

		// 膝のダークスレート関節バンド＆角型ニーパッド
		const kneeBand = box(0.126, 0.042, 0.136, kneePadMat);
		kneeBand.position.set(0, 0, 0);
		knee.add(kneeBand);

		const kneePadFront = box(0.108, 0.048, 0.024, darkMetalMat, false, false);
		kneePadFront.position.set(0, 0.002, 0.066);
		knee.add(kneePadFront);

		// 角型すねブロック
		const shin = box(0.118, 0.155, 0.126, suitBlueMat);
		shin.position.set(0, -0.095, 0);
		knee.add(shin);

		// 足首上のロールアップ裾（パンツの折り返しカフ）
		const pantCuffUpper = box(0.128, 0.022, 0.136, suitBlueDarkMat);
		pantCuffUpper.position.set(0, -0.148, 0);
		knee.add(pantCuffUpper);

		const pantCuff = box(0.134, 0.044, 0.142, suitBlueLightMat);
		pantCuff.position.set(0, -0.172, 0);
		knee.add(pantCuff);

		// 角張ったL字シルエットのブラウンワークブーツ＆フラットダークソール（底面 y=-0.26 → ワールド y=0.00）
		const bootShaft = box(0.122, 0.052, 0.132, bootBrownMat);
		bootShaft.position.set(0, -0.205, 0.004);
		knee.add(bootShaft);

		const bootVamp = box(0.126, 0.048, 0.188, bootBrownMat);
		bootVamp.position.set(0, -0.218, 0.032);
		knee.add(bootVamp);

		const bootToeBox = box(0.128, 0.042, 0.072, bootToeMat);
		bootToeBox.position.set(0, -0.221, 0.094);
		knee.add(bootToeBox);

		const bootHeelCounter = box(0.128, 0.044, 0.048, bootToeMat, false, false);
		bootHeelCounter.position.set(0, -0.22, -0.042);
		knee.add(bootHeelCounter);

		const bootSole = box(0.134, 0.024, 0.204, soleDarkMat, false, true);
		bootSole.position.set(0, -0.248, 0.034);
		knee.add(bootSole);

		return { hip, knee };
	};

	const leftLegParts = buildLeg(-1);
	const rightLegParts = buildLeg(1);
	const leftLeg = leftLegParts.hip;
	const rightLeg = rightLegParts.hip;
	const leftKnee = leftLegParts.knee;
	const rightKnee = rightLegParts.knee;

	return {
		root,
		pelvis,
		torso,
		head,
		leftArm,
		rightArm,
		leftElbow,
		rightElbow,
		leftLeg,
		rightLeg,
		leftKnee,
		rightKnee,
		hammerGroup,
		scarfTailLeft,
		scarfTailRight,
		basePelvisY
	};
}

/**
 * 画面上部のゴールで待つ「マイクラ風の角張った箱型ブロック（BoxGeometry）で構成した3頭身キュート姫キャラ」を構築する
 * 参考画像の「金髪＋ゴールド王冠＋ロイヤルブルー＆ピンクのプリーツドレス＋階段状ゴールド縁取り＋白フリル裾＋ピンク靴」を踏襲しつつ、
 * 顔は「鼻なし・細く優しい眉・大きなキラキラ瞳・ピンクのチーク・可愛い微笑み」の若くてキュートな女の子フェイスに刷新している。
 * @param {{ geo: Function, mat: Function }} tracker
 */
export function buildPrincessNpcModel(tracker) {
	// ロイヤルブルー × ローズピンク × ブロンド × アンティークゴールドの鮮やかなPBRマテリアル
	const royalBlueMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0x2f5aa2,
		metalness: 0.08,
		roughness: 0.52
	}));
	const royalBlueDarkMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0x22437c,
		metalness: 0.1,
		roughness: 0.58
	}));
	const royalBlueLightMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0x416fb8,
		metalness: 0.08,
		roughness: 0.48
	}));
	const dressPinkMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0xe87ea8,
		metalness: 0.06,
		roughness: 0.52
	}));
	const dressPinkDarkMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0xd1608d,
		metalness: 0.06,
		roughness: 0.58
	}));
	const dressPinkLightMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0xf49ec0,
		metalness: 0.05,
		roughness: 0.48
	}));
	const whiteTrimMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0xf8f9fc,
		metalness: 0.04,
		roughness: 0.54
	}));
	const goldTrimMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0xeec04b,
		emissive: 0x5c4008,
		emissiveIntensity: 0.2,
		metalness: 0.72,
		roughness: 0.28
	}));
	const crownGoldDarkMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0xd4a030,
		metalness: 0.74,
		roughness: 0.32
	}));
	const rubyPinkMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0xf45b86,
		emissive: 0x9e1b45,
		emissiveIntensity: 0.35,
		metalness: 0.22,
		roughness: 0.2
	}));
	const skinMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0xfce0ce,
		emissive: 0x3b1b12,
		emissiveIntensity: 0.1,
		metalness: 0.02,
		roughness: 0.58
	}));
	const skinShadeMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0xedc4ab,
		metalness: 0.02,
		roughness: 0.62
	}));
	const hairBlondeMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0xefc24c,
		metalness: 0.06,
		roughness: 0.52
	}));
	const hairBlondeLightMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0xf8d672,
		metalness: 0.06,
		roughness: 0.48
	}));
	const hairBlondeDarkMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0xd6a332,
		metalness: 0.05,
		roughness: 0.58
	}));
	const eyeWhiteMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0xffffff,
		emissive: 0xffffff,
		emissiveIntensity: 0.16,
		roughness: 0.16
	}));
	const lashDarkMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0x3a2029,
		roughness: 0.32
	}));
	const irisDarkMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0x243b6b,
		roughness: 0.2
	}));
	const irisLightMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0x4876c4,
		emissive: 0x1e3a8a,
		emissiveIntensity: 0.2,
		roughness: 0.18
	}));
	const browBrownMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0x8c5a2b,
		roughness: 0.52
	}));
	const cheekBlushMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0xf798b0,
		emissive: 0xd946ef,
		emissiveIntensity: 0.08,
		roughness: 0.56
	}));
	const lipPinkMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0xd9687c,
		roughness: 0.46
	}));

	const box = (w, h, d, mat, cast = true, receive = true) =>
		makePart(tracker.geo(new THREE.BoxGeometry(w, h, d)), mat, cast, receive);

	const npc = new THREE.Group();

	// 1. 足元：可愛いピンクの角型メリージェーンパンプス＆白いソックス（底面 y=0 接地）
	for (const side of [-1, 1]) {
		const shoeSole = box(0.112, 0.02, 0.168, dressPinkDarkMat, false, true);
		shoeSole.position.set(side * 0.072, 0.01, 0.022);
		npc.add(shoeSole);

		const shoeBody = box(0.108, 0.046, 0.162, dressPinkMat);
		shoeBody.position.set(side * 0.072, 0.043, 0.02);
		npc.add(shoeBody);

		const shoeOpening = box(0.076, 0.014, 0.068, dressPinkLightMat, false, false);
		shoeOpening.position.set(side * 0.072, 0.064, 0.036);
		npc.add(shoeOpening);

		const shoeStrap = box(0.112, 0.014, 0.024, dressPinkDarkMat, false, false);
		shoeStrap.position.set(side * 0.072, 0.058, 0.028);
		npc.add(shoeStrap);

		const whiteSock = box(0.096, 0.095, 0.102, whiteTrimMat);
		whiteSock.position.set(side * 0.072, 0.11, 0.002);
		npc.add(whiteSock);
	}

	// 2. スカート部：台形に広がる角型プリーツスカート（ピンクのプリーツ＋白フリル裾＋ロイヤルブルーのオーバースカート＆階段状ゴールド縁取り）
	// 内側コアブロック
	const skirtCore = box(0.28, 0.34, 0.22, dressPinkDarkMat);
	skirtCore.position.set(0, 0.31, 0);
	npc.add(skirtCore);

	// 裾を一周する階段状の白いフリルペチコートブロック
	const frontHemWhiteMain = box(0.35, 0.044, 0.026, whiteTrimMat);
	frontHemWhiteMain.position.set(0, 0.128, 0.156);
	npc.add(frontHemWhiteMain);

	const backHemWhiteMain = box(0.36, 0.044, 0.026, whiteTrimMat);
	backHemWhiteMain.position.set(0, 0.128, -0.156);
	npc.add(backHemWhiteMain);

	for (const side of [-1, 1]) {
		const sideHemWhite = box(0.028, 0.044, 0.31, whiteTrimMat);
		sideHemWhite.position.set(side * 0.188, 0.128, 0);
		npc.add(sideHemWhite);

		const cornerHemWhiteF = box(0.048, 0.042, 0.048, whiteTrimMat);
		cornerHemWhiteF.position.set(side * 0.168, 0.136, 0.142);
		npc.add(cornerHemWhiteF);

		const cornerHemWhiteB = box(0.048, 0.042, 0.048, whiteTrimMat);
		cornerHemWhiteB.position.set(side * 0.168, 0.136, -0.142);
		npc.add(cornerHemWhiteB);
	}

	// 前面中央から覗くピンクの角型プリーツパネル（5列の立体段差でプリーツの陰影を表現）
	const frontPinkPleats = [
		{ x: 0, w: 0.068, z: 0.148, tiltX: -0.18, mat: dressPinkLightMat },
		{ x: -0.062, w: 0.062, z: 0.142, tiltX: -0.18, mat: dressPinkMat },
		{ x: 0.062, w: 0.062, z: 0.142, tiltX: -0.18, mat: dressPinkMat },
		{ x: -0.12, w: 0.058, z: 0.134, tiltX: -0.17, mat: dressPinkDarkMat },
		{ x: 0.12, w: 0.058, z: 0.134, tiltX: -0.17, mat: dressPinkDarkMat }
	];
	for (const fp of frontPinkPleats) {
		const panel = box(fp.w, 0.34, 0.032, fp.mat);
		panel.position.set(fp.x, 0.305, fp.z);
		panel.rotation.x = fp.tiltX;
		npc.add(panel);
	}

	// 背面＆側面のピンクアンダースカートパネル
	const backPinkCenter = box(0.18, 0.34, 0.034, dressPinkMat);
	backPinkCenter.position.set(0, 0.305, -0.144);
	backPinkCenter.rotation.x = 0.18;
	npc.add(backPinkCenter);

	for (const side of [-1, 1]) {
		const backPinkSide = box(0.095, 0.34, 0.032, dressPinkDarkMat);
		backPinkSide.position.set(side * 0.115, 0.305, -0.136);
		backPinkSide.rotation.x = 0.17;
		npc.add(backPinkSide);

		const sidePinkLower = box(0.034, 0.34, 0.25, dressPinkMat);
		sidePinkLower.position.set(side * 0.168, 0.305, 0);
		sidePinkLower.rotation.z = side * 0.18;
		npc.add(sidePinkLower);

		// ロイヤルブルーのオーバースカート（左右側面〜前面斜め開き・背面）
		const overskirtSide = box(0.038, 0.27, 0.245, royalBlueMat);
		overskirtSide.position.set(side * 0.164, 0.365, 0);
		overskirtSide.rotation.z = side * 0.19;
		npc.add(overskirtSide);

		const overskirtSideGoldHem = box(0.042, 0.022, 0.255, goldTrimMat, false, false);
		overskirtSideGoldHem.position.set(side * 0.188, 0.232, 0);
		overskirtSideGoldHem.rotation.z = side * 0.19;
		npc.add(overskirtSideGoldHem);

		const overskirtBack = box(0.135, 0.26, 0.036, royalBlueDarkMat);
		overskirtBack.position.set(side * 0.068, 0.365, -0.132);
		overskirtBack.rotation.x = 0.18;
		npc.add(overskirtBack);

		const overskirtBackGold = box(0.14, 0.022, 0.04, goldTrimMat, false, false);
		overskirtBackGold.position.set(side * 0.068, 0.236, -0.155);
		npc.add(overskirtBackGold);

		// 前面の階段状ロイヤルブルー・オーバースカートパネル（3段ステップで中央のピンクスカートを逆V字に見せる）
		const frontBlueTop = box(0.135, 0.085, 0.034, royalBlueMat);
		frontBlueTop.position.set(side * 0.072, 0.445, 0.118);
		frontBlueTop.rotation.x = -0.16;
		npc.add(frontBlueTop);

		const frontBlueMid = box(0.102, 0.088, 0.034, royalBlueMat);
		frontBlueMid.position.set(side * 0.095, 0.372, 0.13);
		frontBlueMid.rotation.x = -0.16;
		npc.add(frontBlueMid);

		const frontBlueLow = box(0.068, 0.085, 0.034, royalBlueMat);
		frontBlueLow.position.set(side * 0.118, 0.298, 0.142);
		frontBlueLow.rotation.x = -0.16;
		npc.add(frontBlueLow);

		// 前面オーバースカート縁の階段状（ピクセルステップ調）ゴールドトリム
		const skirtGoldSteps = [
			{ x: side * 0.018, y: 0.455, z: 0.128, w: 0.026, h: 0.042 },
			{ x: side * 0.038, y: 0.418, z: 0.134, w: 0.026, h: 0.042 },
			{ x: side * 0.058, y: 0.380, z: 0.140, w: 0.026, h: 0.042 },
			{ x: side * 0.078, y: 0.342, z: 0.146, w: 0.026, h: 0.042 },
			{ x: side * 0.098, y: 0.304, z: 0.152, w: 0.026, h: 0.042 },
			{ x: side * 0.125, y: 0.262, z: 0.158, w: 0.068, h: 0.024 }
		];
		for (const st of skirtGoldSteps) {
			const stepBlock = box(st.w, st.h, 0.022, goldTrimMat, false, false);
			stepBlock.position.set(st.x, st.y, st.z);
			npc.add(stepBlock);
		}
	}

	// 3. 上半身（ボディス）：ロイヤルブルーの角型コルセット＆白レース付きスクエアネック＆階段状ゴールドライン
	const bodiceBlock = box(0.224, 0.27, 0.164, royalBlueMat);
	bodiceBlock.position.set(0, 0.615, 0);
	npc.add(bodiceBlock);

	const waistSeamBelt = box(0.234, 0.022, 0.174, royalBlueDarkMat, false, false);
	waistSeamBelt.position.set(0, 0.485, 0);
	npc.add(waistSeamBelt);

	// 胸元スクエアネックの素肌デコルテ＆白いレースフリル縁取り（参考画像の胸元デザイン）
	const chestSkinPatch = box(0.092, 0.062, 0.016, skinMat, false, false);
	chestSkinPatch.position.set(0, 0.718, 0.078);
	npc.add(chestSkinPatch);

	const necklineWhiteCenter = box(0.092, 0.022, 0.02, whiteTrimMat, false, false);
	necklineWhiteCenter.position.set(0, 0.684, 0.082);
	npc.add(necklineWhiteCenter);

	for (const side of [-1, 1]) {
		const necklineWhiteStep = box(0.024, 0.024, 0.02, whiteTrimMat, false, false);
		necklineWhiteStep.position.set(side * 0.036, 0.696, 0.083);
		npc.add(necklineWhiteStep);

		// ボディス前面を縦〜斜めに走る階段状ゴールドライン（参考画像のコルセット金縁）
		const bodiceGoldUpper = box(0.02, 0.088, 0.018, goldTrimMat, false, false);
		bodiceGoldUpper.position.set(side * 0.056, 0.704, 0.082);
		npc.add(bodiceGoldUpper);

		const bodiceGoldStep = box(0.022, 0.032, 0.018, goldTrimMat, false, false);
		bodiceGoldStep.position.set(side * 0.044, 0.652, 0.082);
		npc.add(bodiceGoldStep);

		const bodiceGoldLower = box(0.02, 0.155, 0.018, goldTrimMat, false, false);
		bodiceGoldLower.position.set(side * 0.032, 0.568, 0.082);
		npc.add(bodiceGoldLower);
	}

	// 4. 頭部グループ（3頭身の最上段：鼻なし・細眉・キラキラ大きな瞳・ピンクチーク・可愛い微笑みの角型フェイス＋金髪＋王冠）
	const head = new THREE.Group();
	head.position.set(0, 0.755, 0);
	npc.add(head);

	// 華奢な角型ネックブロック
	const neckBlock = box(0.104, 0.046, 0.098, skinShadeMat);
	neckBlock.position.set(0, 0.012, -0.004);
	head.add(neckBlock);

	// メイン頭部キューブ（鼻を作らず、女の子らしい明るく滑らかな角型フェイス）
	const headCube = box(0.276, 0.258, 0.246, skinMat);
	headCube.position.set(0, 0.152, 0);
	head.add(headCube);

	// 可愛く小さな微笑み口元（中央のピンクブロック＋左右口角がキュッと上がったスマイル）
	const mouthCenter = box(0.042, 0.012, 0.012, lipPinkMat, false, false);
	mouthCenter.position.set(0, 0.068, 0.123);
	head.add(mouthCenter);

	for (const side of [-1, 1]) {
		const mouthCorner = box(0.014, 0.012, 0.012, lipPinkMat, false, false);
		mouthCorner.position.set(side * 0.024, 0.074, 0.123);
		head.add(mouthCorner);

		// 頬の可愛いパステルピンク・チークブロック
		const blushBlock = box(0.042, 0.024, 0.01, cheekBlushMat, false, false);
		blushBlock.position.set(side * 0.086, 0.098, 0.122);
		head.add(blushBlock);

		// 大きくてキュートな女の子の瞳（白目＋2層サファイアアイ＋大小ツインハイライト＋目尻ハネまつ毛）
		const eyeWhite = box(0.062, 0.064, 0.01, eyeWhiteMat, false, false);
		eyeWhite.position.set(side * 0.062, 0.138, 0.122);
		head.add(eyeWhite);

		const irisUpper = box(0.044, 0.042, 0.013, irisDarkMat, false, false);
		irisUpper.position.set(side * 0.056, 0.146, 0.123);
		head.add(irisUpper);

		const irisLower = box(0.044, 0.024, 0.014, irisLightMat, false, false);
		irisLower.position.set(side * 0.056, 0.118, 0.123);
		head.add(irisLower);

		// キラキラ輝く大小2つの四角いハイライト
		const glintBig = box(0.016, 0.016, 0.016, eyeWhiteMat, false, false);
		glintBig.position.set(side * 0.056 - 0.01, 0.156, 0.125);
		head.add(glintBig);

		const glintSmall = box(0.01, 0.01, 0.016, eyeWhiteMat, false, false);
		glintSmall.position.set(side * 0.056 + 0.01, 0.122, 0.125);
		head.add(glintSmall);

		// ぱっちり可愛い上アイライン＆目尻の小さなウイング
		const upperLash = box(0.068, 0.013, 0.016, lashDarkMat, false, false);
		upperLash.position.set(side * 0.063, 0.172, 0.125);
		head.add(upperLash);

		const lashWing = box(0.014, 0.012, 0.016, lashDarkMat, false, false);
		lashWing.position.set(side * 0.098, 0.176, 0.125);
		head.add(lashWing);

		// 細くて優しいアーチ感のキュート眉（参考画像の太眉から細眉へ刷新）
		const thinBrow = box(0.056, 0.0095, 0.014, browBrownMat, false, false);
		thinBrow.position.set(side * 0.062, 0.198, 0.125);
		thinBrow.rotation.z = -side * 0.05;
		head.add(thinBrow);
	}

	// 5. 多層ボクセル調ブロンドヘア（階段状斜め分け前髪＋耳横アクセントブロック＋後ろ髪ロングレイヤー）
	const hairCrown = box(0.298, 0.068, 0.268, hairBlondeMat);
	hairCrown.position.set(0, 0.288, -0.004);
	head.add(hairCrown);

	const hairTopPlate = box(0.272, 0.036, 0.242, hairBlondeLightMat);
	hairTopPlate.position.set(0, 0.332, -0.004);
	head.add(hairTopPlate);

	// 額を可愛く縁取る階段状（ピクセルステップ）のブロンド前髪ブロック
	const frontHairUpper = box(0.292, 0.048, 0.038, hairBlondeMat);
	frontHairUpper.position.set(0, 0.268, 0.118);
	head.add(frontHairUpper);

	const bangStepSpecs = [
		{ x: -0.118, y: 0.228, w: 0.058, h: 0.052, mat: hairBlondeMat },
		{ x: -0.068, y: 0.236, w: 0.052, h: 0.038, mat: hairBlondeLightMat },
		{ x: -0.022, y: 0.248, w: 0.046, h: 0.024, mat: hairBlondeLightMat },
		{ x: 0.036, y: 0.244, w: 0.054, h: 0.03, mat: hairBlondeMat },
		{ x: 0.082, y: 0.234, w: 0.052, h: 0.042, mat: hairBlondeLightMat },
		{ x: 0.12, y: 0.224, w: 0.054, h: 0.056, mat: hairBlondeMat }
	];
	for (const bs of bangStepSpecs) {
		const bMesh = box(bs.w, bs.h, 0.036, bs.mat);
		bMesh.position.set(bs.x, bs.y, 0.122);
		head.add(bMesh);
	}

	// 左右のサイドヘア＆耳横の立体ブロックアクセント（参考画像の側面デザイン）
	for (const side of [-1, 1]) {
		// 頬横を包む前サイドロック
		const cheekSideLock = box(0.032, 0.195, 0.054, hairBlondeMat);
		cheekSideLock.position.set(side * 0.144, 0.135, 0.098);
		head.add(cheekSideLock);

		const cheekLockTip = box(0.028, 0.048, 0.044, hairBlondeDarkMat);
		cheekLockTip.position.set(side * 0.142, 0.022, 0.092);
		head.add(cheekLockTip);

		// 側頭部を覆うメインサイドヘアパネル
		const sideHairPanel = box(0.034, 0.268, 0.215, hairBlondeMat);
		sideHairPanel.position.set(side * 0.146, 0.158, -0.02);
		head.add(sideHairPanel);

		// 参考画像にある側面の四角い立体ヘアブロックアクセント
		const sideAccentBox = box(0.026, 0.072, 0.058, hairBlondeLightMat);
		sideAccentBox.position.set(side * 0.164, 0.148, 0.018);
		head.add(sideAccentBox);

		const sideLowerStep = box(0.032, 0.068, 0.16, hairBlondeDarkMat);
		sideLowerStep.position.set(side * 0.142, 0.008, -0.038);
		head.add(sideLowerStep);
	}

	// 後頭部から背中上部まで段差で流れるブロンドロングヘアブロック
	const backHairCore = box(0.292, 0.32, 0.056, hairBlondeMat);
	backHairCore.position.set(0, 0.132, -0.128);
	head.add(backHairCore);

	const backHairSteps = [
		{ x: 0, y: 0.195, z: -0.152, w: 0.264, h: 0.12, d: 0.032, mat: hairBlondeLightMat },
		{ x: 0, y: 0.082, z: -0.156, w: 0.248, h: 0.11, d: 0.034, mat: hairBlondeMat },
		{ x: -0.068, y: -0.015, z: -0.148, w: 0.112, h: 0.095, d: 0.034, mat: hairBlondeDarkMat },
		{ x: 0.068, y: -0.015, z: -0.148, w: 0.112, h: 0.095, d: 0.034, mat: hairBlondeDarkMat },
		{ x: 0, y: -0.028, z: -0.152, w: 0.108, h: 0.105, d: 0.036, mat: hairBlondeMat }
	];
	for (const bh of backHairSteps) {
		const stepMesh = box(bh.w, bh.h, bh.d, bh.mat);
		stepMesh.position.set(bh.x, bh.y, bh.z);
		head.add(stepMesh);
	}

	// 6. 頭頂の角型ゴールド王冠（凹凸バトルメント＋正面ピンクルビー宝石付き）
	const crownGroup = new THREE.Group();
	crownGroup.position.set(0, 0.35, 0.006);
	head.add(crownGroup);

	const crownBase = box(0.148, 0.044, 0.142, goldTrimMat);
	crownBase.position.set(0, 0.022, 0);
	crownGroup.add(crownBase);

	const crownInner = box(0.118, 0.038, 0.112, crownGoldDarkMat, false, false);
	crownInner.position.set(0, 0.024, 0);
	crownGroup.add(crownInner);

	// 王冠上部の角型突起（バトルメント・前後左右8箇所）
	const crownMerlons = [
		{ x: -0.058, z: 0.056 },
		{ x: 0, z: 0.056 },
		{ x: 0.058, z: 0.056 },
		{ x: -0.058, z: -0.056 },
		{ x: 0, z: -0.056 },
		{ x: 0.058, z: -0.056 },
		{ x: -0.058, z: 0 },
		{ x: 0.058, z: 0 }
	];
	for (const cm of crownMerlons) {
		const merlon = box(0.032, 0.028, 0.03, goldTrimMat);
		merlon.position.set(cm.x, 0.056, cm.z);
		crownGroup.add(merlon);
	}

	// 王冠正面中央のピンクルビー宝石ブロック
	const crownGem = box(0.028, 0.032, 0.016, rubyPinkMat, false, false);
	crownGem.position.set(0, 0.024, 0.072);
	crownGroup.add(crownGem);

	// 7. 腕：ロイヤルブルーの角型パフスリーブ＆白カフス＋素肌の角型アーム＆ハンド（children[4] が hand で待機手組みテスト完全互換）
	const makeNpcArm = (side) => {
		const pivot = new THREE.Group();
		pivot.position.set(side * 0.114, 0.725, 0.008);
		pivot.rotation.order = 'XZY';

		// children[0]: ロイヤルブルーの角型パフスリーブ本体
		const puffSleeveMain = box(0.088, 0.092, 0.094, royalBlueMat);
		puffSleeveMain.position.set(side * 0.012, -0.026, 0);
		pivot.add(puffSleeveMain);

		// children[1]: パフスリーブ上段の立体肩ブロック
		const puffSleeveTop = box(0.076, 0.026, 0.082, royalBlueLightMat);
		puffSleeveTop.position.set(side * 0.01, 0.024, 0);
		pivot.add(puffSleeveTop);

		// children[2]: 袖口の白いカフスバンドブロック
		const sleeveWhiteCuff = box(0.082, 0.022, 0.088, whiteTrimMat);
		sleeveWhiteCuff.position.set(side * 0.008, -0.078, 0);
		pivot.add(sleeveWhiteCuff);

		// children[3]: 素肌の角型前腕ブロック
		const bareArm = box(0.064, 0.118, 0.068, skinMat);
		bareArm.position.set(side * 0.002, -0.145, 0.004);
		pivot.add(bareArm);

		// children[4]: 角型ハンドブロック（待機ポーズ時に両手が胸〜腰前で揃う座標）
		const hand = box(0.062, 0.052, 0.064, skinMat);
		hand.position.set(-side * 0.004, -0.222, 0.012);
		pivot.add(hand);

		// children[5]: 親指ブロック
		const thumb = box(0.024, 0.032, 0.028, skinShadeMat);
		thumb.position.set(-side * 0.032, -0.214, 0.024);
		pivot.add(thumb);

		npc.add(pivot);
		return pivot;
	};

	const npcLeftArm = makeNpcArm(-1);
	const npcRightArm = makeNpcArm(1);

	// 主人公（全高1.350u）と同じ〜少し低い身長（約1.27u）に収める
	npc.scale.setScalar(1.08);

	return {
		npc,
		head,
		npcLeftArm,
		npcRightArm
	};
}

/**
 * リンクを90度交互に連結したリアルな金属鎖チェーンを構築する（吊り荷・溶鉱炉クレーン用）
 */
export function buildChainLinkString(group, tracker, length, linkRadius, mat, startPos) {
	const step = linkRadius * 2.15;
	const count = Math.max(2, Math.floor(length / step));
	const linkGeo = tracker.geo(new THREE.TorusGeometry(linkRadius, linkRadius * 0.34, 6, 12));

	const chainGroup = new THREE.Group();
	chainGroup.position.set(startPos[0], startPos[1], startPos[2]);

	for (let i = 0; i < count; i += 1) {
		const link = new THREE.Mesh(linkGeo, mat);
		link.position.y = -i * step;
		link.scale.set(0.75, 1.25, 1);
		if (i % 2 === 1) {
			link.rotation.y = Math.PI * 0.5;
		}
		chainGroup.add(link);
	}
	group.add(chainGroup);
	return chainGroup;
}

/**
 * 三角ジグザグのオープン鉄骨トラス梁を構築する（Image 2 上部トラス相当）
 */
export function buildTrussBeam(group, tracker, length, height, depth, mat, pos, rotZ = 0) {
	const truss = new THREE.Group();
	truss.position.set(pos[0], pos[1], pos[2]);
	truss.rotation.z = rotZ;

	const chordGeo = tracker.geo(new THREE.BoxGeometry(length, 0.1, 0.1));
	for (const sy of [-height * 0.5, height * 0.5]) {
		for (const sz of [-depth * 0.5, depth * 0.5]) {
			const chord = new THREE.Mesh(chordGeo, mat);
			chord.position.set(0, sy, sz);
			truss.add(chord);
		}
	}

	const bays = Math.max(3, Math.floor(length / (height * 1.1)));
	const bayW = length / bays;
	const diagLen = Math.hypot(bayW, height);
	const diagAngle = Math.atan2(height, bayW);
	const strutGeo = tracker.geo(new THREE.BoxGeometry(diagLen, 0.065, 0.065));
	const crossGeo = tracker.geo(new THREE.BoxGeometry(0.07, 0.07, depth));

	for (let i = 0; i < bays; i += 1) {
		const bx = -length * 0.5 + (i + 0.5) * bayW;
		for (const sz of [-depth * 0.5, depth * 0.5]) {
			const diag = new THREE.Mesh(strutGeo, mat);
			diag.position.set(bx, 0, sz);
			diag.rotation.z = i % 2 === 0 ? diagAngle : -diagAngle;
			truss.add(diag);
		}
		const xCross = -length * 0.5 + i * bayW;
		for (const sy of [-height * 0.5, height * 0.5]) {
			const cross = new THREE.Mesh(crossGeo, mat);
			cross.position.set(xCross, sy, 0);
			truss.add(cross);
		}
	}

	group.add(truss);
	return truss;
}

/**
 * フランジ接続リング＆赤い手動バルブ付きの工業配管システムを構築する
 */
export function buildIndustrialPipeRun(group, tracker, points, radius, pipeMat, flangeMat, valveMat, hasValve = true) {
	const pipeGroup = new THREE.Group();

	for (let i = 0; i < points.length - 1; i += 1) {
		const a = new THREE.Vector3(...points[i]);
		const b = new THREE.Vector3(...points[i + 1]);
		const diff = new THREE.Vector3().subVectors(b, a);
		const len = diff.length();
		if (len < 0.01) {
			continue;
		}
		const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);

		const seg = new THREE.Mesh(tracker.geo(new THREE.CylinderGeometry(radius, radius, len, 14)), pipeMat);
		seg.position.copy(mid);
		seg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), diff.clone().normalize());
		seg.castShadow = true;
		seg.receiveShadow = true;
		pipeGroup.add(seg);

		// 接続フランジリング（一定間隔）
		const flangeCount = Math.max(1, Math.floor(len / 5.5));
		const flangeGeo = tracker.geo(new THREE.CylinderGeometry(radius * 1.32, radius * 1.32, 0.16, 14));
		for (let f = 1; f <= flangeCount; f += 1) {
			const t = f / (flangeCount + 1);
			const fl = new THREE.Mesh(flangeGeo, flangeMat);
			fl.position.lerpVectors(a, b, t);
			fl.quaternion.copy(seg.quaternion);
			pipeGroup.add(fl);
		}
	}

	// 角部のエルボ球継手
	for (let i = 1; i < points.length - 1; i += 1) {
		const elbow = new THREE.Mesh(tracker.geo(new THREE.SphereGeometry(radius * 1.2, 12, 10)), flangeMat);
		elbow.position.set(points[i][0], points[i][1], points[i][2]);
		pipeGroup.add(elbow);
	}

	// 手動の赤い丸バルブハンドル
	if (hasValve && points.length >= 2) {
		const p0 = new THREE.Vector3(...points[0]);
		const p1 = new THREE.Vector3(...points[1]);
		const vPos = new THREE.Vector3().lerpVectors(p0, p1, 0.35);

		const stem = new THREE.Mesh(tracker.geo(new THREE.CylinderGeometry(radius * 0.25, radius * 0.25, radius * 1.4, 8)), flangeMat);
		stem.rotation.x = Math.PI * 0.5;
		stem.position.set(vPos.x, vPos.y, vPos.z + radius * 1.1);
		pipeGroup.add(stem);

		const wheel = new THREE.Mesh(tracker.geo(new THREE.TorusGeometry(radius * 1.35, radius * 0.22, 8, 16)), valveMat);
		wheel.position.set(vPos.x, vPos.y, vPos.z + radius * 1.75);
		pipeGroup.add(wheel);
	}

	group.add(pipeGroup);
	return pipeGroup;
}

/**
 * 計器パネル・表示灯付きの工業操作コンソールを構築する
 */
export function buildControlConsole(group, tracker, chassisMat, accentMat, pos, rotY = 0) {
	const consoleGroup = new THREE.Group();
	consoleGroup.position.set(pos[0], pos[1], pos[2]);
	consoleGroup.rotation.y = rotY;

	const base = makePart(tracker.geo(new THREE.BoxGeometry(1.5, 0.85, 0.8)), chassisMat);
	base.position.y = 0.425;
	consoleGroup.add(base);

	const panelTex = textureFactory.getControlPanelTexture();
	const panelMat = tracker.mat(new THREE.MeshStandardMaterial({
		map: panelTex,
		emissiveMap: panelTex,
		emissive: 0xffffff,
		emissiveIntensity: 0.9,
		roughness: 0.35
	}));

	const topSlope = makePart(tracker.geo(new THREE.BoxGeometry(1.42, 0.14, 0.72)), panelMat);
	topSlope.position.set(0, 0.9, 0.05);
	topSlope.rotation.x = 0.42;
	consoleGroup.add(topSlope);

	// 操作レバー2本
	for (const lx of [-0.45, -0.2]) {
		const lever = new THREE.Mesh(tracker.geo(new THREE.CylinderGeometry(0.03, 0.03, 0.24, 8)), chassisMat);
		lever.position.set(lx, 1.02, 0.12);
		lever.rotation.x = 0.25;
		consoleGroup.add(lever);

		const knob = new THREE.Mesh(tracker.geo(new THREE.SphereGeometry(0.06, 8, 8)), accentMat);
		knob.position.set(lx, 1.14, 0.15);
		consoleGroup.add(knob);
	}

	group.add(consoleGroup);
	return consoleGroup;
}

/**
 * 鎖チェーン＋赤クレーンハンガーで吊られた溶鉱鍋クルーシブルを構築する（Image 2 相当）
 */
export function buildMoltenCrucible(group, tracker, darkSteelMat, redHookMat, moltenMat, chainLen, pos, enableLight = true) {
	const cGroup = new THREE.Group();
	cGroup.position.set(pos[0], pos[1], pos[2]);

	buildChainLinkString(cGroup, tracker, chainLen, 0.14, darkSteelMat, [0, chainLen + 1.55, 0]);

	// 滑車・フックブロック
	const block = makePart(tracker.geo(new THREE.BoxGeometry(0.68, 0.56, 0.52)), redHookMat);
	block.position.y = 1.55;
	cGroup.add(block);

	// コの字吊りフレーム
	const yokeTop = makePart(tracker.geo(new THREE.BoxGeometry(2.15, 0.2, 0.28)), redHookMat);
	yokeTop.position.y = 1.15;
	cGroup.add(yokeTop);
	for (const side of [-1, 1]) {
		const yokeSide = makePart(tracker.geo(new THREE.BoxGeometry(0.18, 1.35, 0.26)), redHookMat);
		yokeSide.position.set(side * 1.02, 0.45, 0);
		cGroup.add(yokeSide);
	}

	// 耐熱溶鉱鍋＋リベット帯＋灼熱の溶鉄面
	const pot = makePart(tracker.geo(new THREE.CylinderGeometry(0.92, 0.68, 1.38, 18)), darkSteelMat);
	pot.position.y = -0.05;
	cGroup.add(pot);

	const rim = makePart(tracker.geo(new THREE.TorusGeometry(0.93, 0.08, 8, 22)), darkSteelMat);
	rim.rotation.x = Math.PI * 0.5;
	rim.position.y = 0.62;
	cGroup.add(rim);

	const molten = new THREE.Mesh(tracker.geo(new THREE.CylinderGeometry(0.84, 0.84, 0.14, 18)), moltenMat);
	molten.position.y = 0.6;
	cGroup.add(molten);

	if (enableLight) {
		const potLight = new THREE.PointLight(0xff7b00, 15, 14);
		potLight.position.set(0, 1.05, 0.85);
		cGroup.add(potLight);
	}

	group.add(cGroup);
	return cGroup;
}

/**
 * 工場ライン沿いの多関節イエロー工作ロボットアーム（ゆっくり動作するジオラマ演出用）
 */
export function buildArticulatedRobotArm(group, tracker, yellowMat, darkMat, tipMat, pos, rotY = 0, scale = 1.0) {
	const root = new THREE.Group();
	root.position.set(pos[0], pos[1], pos[2]);
	root.rotation.y = rotY;
	root.scale.setScalar(scale);

	const pedestal = makePart(tracker.geo(new THREE.CylinderGeometry(0.42, 0.54, 0.35, 14)), darkMat);
	pedestal.position.y = 0.175;
	root.add(pedestal);

	const waist = new THREE.Group();
	waist.position.y = 0.36;
	root.add(waist);

	const turret = makePart(tracker.geo(new THREE.CylinderGeometry(0.32, 0.36, 0.42, 12)), yellowMat);
	turret.position.y = 0.2;
	waist.add(turret);

	const shoulder = new THREE.Group();
	shoulder.position.y = 0.42;
	waist.add(shoulder);

	const lowerArm = makePart(tracker.geo(new THREE.BoxGeometry(0.24, 1.05, 0.24)), yellowMat);
	lowerArm.position.y = 0.5;
	shoulder.add(lowerArm);

	const elbow = new THREE.Group();
	elbow.position.y = 1.02;
	shoulder.add(elbow);

	const jointPin = makePart(tracker.geo(new THREE.CylinderGeometry(0.16, 0.16, 0.32, 12)), darkMat);
	jointPin.rotation.z = Math.PI * 0.5;
	elbow.add(jointPin);

	const upperArm = makePart(tracker.geo(new THREE.BoxGeometry(0.18, 0.9, 0.18)), yellowMat);
	upperArm.position.set(0, 0.42, 0.14);
	upperArm.rotation.x = 0.48;
	elbow.add(upperArm);

	const emitter = new THREE.Mesh(tracker.geo(new THREE.SphereGeometry(0.11, 10, 8)), tipMat);
	emitter.position.set(0, 0.84, 0.36);
	elbow.add(emitter);

	group.add(root);
	return { root, waist, shoulder, elbow };
}

/**
 * STAGE 1 ボス：建設現場の鉄骨・油圧シリンダー・警戒ストライプで組まれた重工業ロボットゴリラ「IRON KONG」を構築する
 * BarrelThrower 互換ジョイント（body, torso, leftArm, rightArm, heldBarrel）を返す。
 * @param {{ geo: Function, mat: Function }} tracker
 * @param {number} [throwDir]
 */
export function buildIronKongModel(tracker, throwDir = -1) {
	const hasDom = typeof document !== 'undefined';
	const roughnessTex = hasDom ? textureFactory.getSteelRoughnessTexture() : null;
	const girderMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0xd9562b,
		map: hasDom ? textureFactory.getGirderTexture('#c84b26') : null,
		roughnessMap: roughnessTex,
		metalness: 0.72,
		roughness: 0.36
	}));
	const darkFrameMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0x1e2636,
		roughnessMap: roughnessTex,
		metalness: 0.86,
		roughness: 0.32
	}));
	const steelSilverMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0xb8c4d4,
		roughnessMap: roughnessTex,
		metalness: 0.9,
		roughness: 0.22
	}));
	const chromePistonMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0xe2e8f0,
		metalness: 0.95,
		roughness: 0.14
	}));
	const cautionMat = tracker.mat(new THREE.MeshStandardMaterial({
		map: textureFactory.getCautionStripeTexture(),
		metalness: 0.38,
		roughness: 0.44
	}));
	const coreGlowMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0xffd166,
		emissive: 0xff6b00,
		emissiveIntensity: 2.3,
		roughness: 0.18
	}));
	const eyeLedMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0xff5e4d,
		emissive: 0xff2a1a,
		emissiveIntensity: 2.6,
		roughness: 0.15
	}));
	const barrelBodyMat = tracker.mat(new THREE.MeshStandardMaterial({
		map: textureFactory.getBarrelBodyTexture(false),
		metalness: 0.2,
		roughness: 0.68
	}));
	const barrelCapMat = tracker.mat(new THREE.MeshStandardMaterial({
		map: textureFactory.getBarrelCapTexture(false),
		metalness: 0.25,
		roughness: 0.65
	}));

	const body = new THREE.Group();
	body.rotation.y = throwDir < 0 ? -Math.PI * 0.34 : Math.PI * 0.34;

	// 1. 重厚な鉄骨油圧脚＆爪先ガード付き鋼鉄フット
	for (const side of [-0.5, 0.5]) {
		const footBase = makePart(tracker.geo(new THREE.BoxGeometry(0.46, 0.2, 0.78)), darkFrameMat);
		footBase.position.set(side, 0.1, 0.08);
		body.add(footBase);

		const toeBlock = makePart(tracker.geo(new THREE.BoxGeometry(0.42, 0.14, 0.22)), girderMat);
		toeBlock.position.set(side, 0.08, 0.46);
		body.add(toeBlock);

		const shinPlate = makePart(tracker.geo(new THREE.BoxGeometry(0.36, 0.58, 0.38)), girderMat);
		shinPlate.position.set(side, 0.46, 0.02);
		body.add(shinPlate);

		const kneeGuard = makePart(tracker.geo(new THREE.BoxGeometry(0.4, 0.2, 0.14)), cautionMat);
		kneeGuard.position.set(side, 0.62, 0.22);
		body.add(kneeGuard);

		// 背面のクローム油圧ピストンロッド
		const pistonCylinder = makePart(tracker.geo(new THREE.CylinderGeometry(0.08, 0.08, 0.42, 10)), darkFrameMat);
		pistonCylinder.position.set(side, 0.38, -0.2);
		body.add(pistonCylinder);
		const pistonRod = makePart(tracker.geo(new THREE.CylinderGeometry(0.048, 0.048, 0.44, 10)), chromePistonMat);
		pistonRod.position.set(side, 0.58, -0.2);
		body.add(pistonRod);
	}

	// 腰部フレーム＆警戒ストライプバンパー
	const pelvis = makePart(tracker.geo(new THREE.BoxGeometry(1.16, 0.28, 0.72)), darkFrameMat);
	pelvis.position.set(0, 0.8, 0);
	body.add(pelvis);

	// 2. 逆三角形ゴリラ体型を強調する鉄骨トラス胸郭＆溶鉱炉コア
	const torso = new THREE.Group();
	torso.position.y = 0.9;
	body.add(torso);

	const innerChassis = makePart(tracker.geo(new THREE.BoxGeometry(1.38, 1.02, 0.88)), darkFrameMat);
	innerChassis.position.set(0, 0.54, -0.02);
	torso.add(innerChassis);

	// 張り出した左右の鉄骨胸部アーマー（ハの字傾斜）
	const chestArmorGeo = tracker.geo(new THREE.BoxGeometry(0.68, 0.68, 0.32));
	for (const side of [-1, 1]) {
		const chestWing = makePart(chestArmorGeo, girderMat);
		chestWing.position.set(side * 0.44, 0.64, 0.4);
		chestWing.rotation.y = -side * 0.18;
		chestWing.rotation.z = -side * 0.08;
		torso.add(chestWing);

		const bolt = makePart(tracker.geo(new THREE.CylinderGeometry(0.06, 0.06, 0.08, 8)), steelSilverMat, false, false);
		bolt.rotation.x = Math.PI * 0.5;
		bolt.position.set(side * 0.64, 0.84, 0.54);
		torso.add(bolt);
	}

	// 中央の円形動力炉コア＆保護トラスリング
	const coreRing = makePart(tracker.geo(new THREE.TorusGeometry(0.24, 0.06, 8, 18)), steelSilverMat);
	coreRing.position.set(0, 0.62, 0.54);
	torso.add(coreRing);
	const coreLamp = new THREE.Mesh(tracker.geo(new THREE.SphereGeometry(0.18, 12, 10)), coreGlowMat);
	coreLamp.scale.set(1, 1, 0.45);
	coreLamp.position.set(0, 0.62, 0.52);
	torso.add(coreLamp);

	// 腹部警戒プレート＆中央タイ風ハザードプレート
	const bellyPlate = makePart(tracker.geo(new THREE.BoxGeometry(0.92, 0.28, 0.16)), cautionMat);
	bellyPlate.position.set(0, 0.18, 0.42);
	torso.add(bellyPlate);

	// 肩甲骨フレーム＆背面の2連排気マフラー＋放熱グリッド
	const upperYoke = makePart(tracker.geo(new THREE.BoxGeometry(1.76, 0.24, 0.64)), steelSilverMat);
	upperYoke.position.set(0, 1.04, -0.02);
	torso.add(upperYoke);

	const backPack = makePart(tracker.geo(new THREE.BoxGeometry(1.06, 0.78, 0.36)), girderMat);
	backPack.position.set(0, 0.64, -0.56);
	torso.add(backPack);

	for (const side of [-0.42, 0.42]) {
		const pipe = makePart(tracker.geo(new THREE.CylinderGeometry(0.095, 0.12, 0.74, 10)), chromePistonMat);
		pipe.position.set(side, 1.18, -0.54);
		pipe.rotation.x = -0.18;
		torso.add(pipe);

		const pipeTip = makePart(tracker.geo(new THREE.CylinderGeometry(0.12, 0.1, 0.14, 10)), darkFrameMat);
		pipeTip.position.set(side, 1.54, -0.6);
		pipeTip.rotation.x = -0.18;
		torso.add(pipeTip);
	}

	// 3. 鉄骨ロボット・ゴリラ頭部（角ばった眉庇バイザー＋鋼鉄顎＋鋭いLEDアイ）
	const headGroup = new THREE.Group();
	headGroup.position.set(0, 1.38, 0.14);
	torso.add(headGroup);

	const skullBlock = makePart(tracker.geo(new THREE.BoxGeometry(0.74, 0.62, 0.72)), girderMat);
	skullBlock.position.set(0, 0.08, 0);
	headGroup.add(skullBlock);

	const crestPlate = makePart(tracker.geo(new THREE.BoxGeometry(0.24, 0.22, 0.66)), steelSilverMat);
	crestPlate.position.set(0, 0.42, -0.02);
	headGroup.add(crestPlate);

	// 頭頂の警告ランプ（作業ロボットらしいアクセント）
	const headBeacon = new THREE.Mesh(tracker.geo(new THREE.CylinderGeometry(0.075, 0.09, 0.12, 10)), coreGlowMat);
	headBeacon.position.set(0, 0.56, 0.04);
	headGroup.add(headBeacon);

	// ゴリラ風の深い眉庇（バイザーフード）＆暗いアイスリット
	const browVisor = makePart(tracker.geo(new THREE.BoxGeometry(0.84, 0.16, 0.26)), darkFrameMat);
	browVisor.position.set(0, 0.2, 0.34);
	browVisor.rotation.x = 0.12;
	headGroup.add(browVisor);

	const eyeRecess = makePart(tracker.geo(new THREE.BoxGeometry(0.66, 0.18, 0.12)), darkFrameMat);
	eyeRecess.position.set(0, 0.08, 0.34);
	headGroup.add(eyeRecess);

	// 張り出した鋼鉄ゴリラ顎マズル＋排気スリット＋金属牙
	const jawBlock = makePart(tracker.geo(new THREE.BoxGeometry(0.64, 0.32, 0.44)), steelSilverMat);
	jawBlock.position.set(0, -0.18, 0.28);
	headGroup.add(jawBlock);

	const jawBumper = makePart(tracker.geo(new THREE.BoxGeometry(0.56, 0.14, 0.12)), darkFrameMat);
	jawBumper.position.set(0, -0.18, 0.48);
	headGroup.add(jawBumper);

	for (const side of [-1, 1]) {
		// 側頭部のボルト耳カバー＆通信アンテナ
		const earHub = makePart(tracker.geo(new THREE.CylinderGeometry(0.16, 0.16, 0.12, 12)), darkFrameMat);
		earHub.rotation.z = Math.PI * 0.5;
		earHub.position.set(side * 0.42, 0.06, 0);
		headGroup.add(earHub);

		if (side > 0) {
			const antenna = makePart(tracker.geo(new THREE.CylinderGeometry(0.02, 0.03, 0.36, 8)), steelSilverMat);
			antenna.position.set(0.42, 0.32, -0.08);
			headGroup.add(antenna);
		}

		// 吊り上がった鋭いロボットLEDアイ
		const eye = new THREE.Mesh(tracker.geo(new THREE.BoxGeometry(0.2, 0.075, 0.06)), eyeLedMat);
		eye.position.set(side * 0.17, 0.08, 0.4);
		eye.rotation.z = side * 0.16;
		headGroup.add(eye);

		// 鋼鉄の牙
		const fang = makePart(tracker.geo(new THREE.ConeGeometry(0.045, 0.14, 4)), chromePistonMat, false, false);
		fang.position.set(side * 0.16, -0.09, 0.46);
		fang.rotation.y = Math.PI * 0.25;
		headGroup.add(fang);
	}

	// 4. 巨大な鉄骨＆油圧パワーアーム（左右）
	const makeArm = (side) => {
		const shoulder = new THREE.Group();
		shoulder.position.set(side * 1.04, 0.88, 0.04);
		torso.add(shoulder);

		// 関節ボール＆リベット付き大型鉄骨ショルダーアーマー
		const jointSphere = makePart(tracker.geo(new THREE.SphereGeometry(0.24, 12, 10)), steelSilverMat);
		shoulder.add(jointSphere);

		const shoulderArmor = makePart(tracker.geo(new THREE.BoxGeometry(0.54, 0.42, 0.58)), girderMat);
		shoulderArmor.position.set(side * 0.08, 0.08, 0);
		shoulderArmor.rotation.z = -side * 0.16;
		shoulder.add(shoulderArmor);

		const shoulderStripe = makePart(tracker.geo(new THREE.BoxGeometry(0.56, 0.11, 0.6)), cautionMat);
		shoulderStripe.position.set(side * 0.08, -0.06, 0);
		shoulderStripe.rotation.z = -side * 0.16;
		shoulder.add(shoulderStripe);

		// 上腕骨格＋外側のクローム油圧シリンダー
		const upperArm = makePart(tracker.geo(new THREE.BoxGeometry(0.32, 0.52, 0.32)), darkFrameMat);
		upperArm.position.set(side * 0.06, -0.32, 0);
		shoulder.add(upperArm);

		const armPiston = makePart(tracker.geo(new THREE.CylinderGeometry(0.055, 0.055, 0.5, 8)), chromePistonMat);
		armPiston.position.set(side * 0.24, -0.34, 0.06);
		shoulder.add(armPiston);

		// ゴリラらしく太く頑丈な前腕ガントレット
		const forearm = makePart(tracker.geo(new THREE.BoxGeometry(0.46, 0.48, 0.48)), girderMat);
		forearm.position.set(side * 0.06, -0.74, 0.02);
		shoulder.add(forearm);

		// 巨大な鋼鉄パワーフィスト＆ナックルガード
		const fist = makePart(tracker.geo(new THREE.BoxGeometry(0.5, 0.34, 0.52)), steelSilverMat);
		fist.position.set(side * 0.06, -1.08, 0.05);
		shoulder.add(fist);

		for (let fi = -1; fi <= 1; fi += 1) {
			const finger = makePart(tracker.geo(new THREE.BoxGeometry(0.11, 0.14, 0.16)), darkFrameMat);
			finger.position.set(side * 0.06 + fi * 0.15, -1.24, 0.16);
			shoulder.add(finger);
		}
		return shoulder;
	};

	const leftArm = makeArm(-1);
	const rightArm = makeArm(1);

	const heldBarrel = new THREE.Mesh(
		tracker.geo(new THREE.CylinderGeometry(0.39, 0.39, 0.7, 16)),
		[barrelBodyMat, barrelCapMat, barrelCapMat]
	);
	heldBarrel.rotation.x = Math.PI * 0.5;
	heldBarrel.position.set(0, 1.82, 0.7);
	heldBarrel.castShadow = true;
	heldBarrel.visible = false;
	torso.add(heldBarrel);

	return {
		body,
		torso,
		leftArm,
		rightArm,
		heldBarrel
	};
}

/**
 * STAGE 3 最終ボス「OVERLORD MK-III」の重工業シージメック風精密3Dモデルを構築する
 * 面取り装甲・関節球・油圧シリンダー・背面タービン・3指クラッシャークローを組み合わせ、立体感を高める。
 * @param {{ geo: Function, mat: Function }} tracker
 */
export function buildOverlordBossModel(tracker) {
	const hullMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0x334155,
		metalness: 0.88,
		roughness: 0.24
	}));
	const darkFrameMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0x1a2232,
		metalness: 0.86,
		roughness: 0.34
	}));
	const chromeMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0xe2e8f0,
		metalness: 0.94,
		roughness: 0.14
	}));
	const armorRedMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0xc22026,
		metalness: 0.7,
		roughness: 0.3
	}));
	const goldTrimMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0xf59e0b,
		metalness: 0.84,
		roughness: 0.22
	}));
	const coreMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0xff4d4d,
		emissive: 0xff2a1f,
		emissiveIntensity: 2.35,
		roughness: 0.18
	}));
	const visorMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0x38bdf8,
		emissive: 0x0ea5e9,
		emissiveIntensity: 2.2
	}));

	const root = new THREE.Group();

	// 1. 4本のアウトリガー油圧脚を備えた重装甲八角ベースユニット
	const basePedestal = makePart(tracker.geo(new THREE.CylinderGeometry(1.38, 1.72, 0.54, 8)), darkFrameMat);
	basePedestal.position.y = 0.28;
	basePedestal.rotation.y = Math.PI / 8;
	root.add(basePedestal);

	const waistTurret = makePart(tracker.geo(new THREE.CylinderGeometry(1.12, 1.32, 0.48, 12)), hullMat);
	waistTurret.position.y = 0.72;
	root.add(waistTurret);

	const baseRim = makePart(tracker.geo(new THREE.TorusGeometry(1.56, 0.08, 8, 24)), goldTrimMat);
	baseRim.rotation.x = Math.PI * 0.5;
	baseRim.position.y = 0.42;
	root.add(baseRim);

	const toothGeo = tracker.geo(new THREE.BoxGeometry(0.18, 0.14, 0.22));
	for (let i = 0; i < 12; i += 1) {
		const angle = (i / 12) * Math.PI * 2;
		const tooth = makePart(toothGeo, goldTrimMat);
		tooth.position.set(Math.sin(angle) * 1.18, 0.88, Math.cos(angle) * 1.18);
		tooth.rotation.y = angle;
		root.add(tooth);
	}

	const hipJointGeo = tracker.geo(new THREE.SphereGeometry(0.24, 12, 10));
	const legStrutGeo = tracker.geo(new THREE.CylinderGeometry(0.16, 0.19, 0.92, 10));
	const shinArmorGeo = tracker.geo(new THREE.CylinderGeometry(0.2, 0.26, 0.52, 6));
	const footPadGeo = tracker.geo(new THREE.CylinderGeometry(0.36, 0.44, 0.18, 6));
	const clawToeGeo = tracker.geo(new THREE.ConeGeometry(0.08, 0.34, 6));
	for (const side of [-1, 1]) {
		for (const depthSide of [-1, 1]) {
			const legGroup = new THREE.Group();
			legGroup.position.set(side * 1.28, 0.68, depthSide * 0.62);

			const hip = makePart(hipJointGeo, chromeMat);
			legGroup.add(hip);

			const strut = makePart(legStrutGeo, hullMat);
			strut.position.set(side * 0.24, -0.3, depthSide * 0.12);
			strut.rotation.z = side * 0.58;
			strut.rotation.x = -depthSide * 0.22;
			legGroup.add(strut);

			const knee = makePart(hipJointGeo, goldTrimMat);
			knee.scale.setScalar(0.82);
			knee.position.set(side * 0.46, -0.45, depthSide * 0.2);
			legGroup.add(knee);

			const shin = makePart(shinArmorGeo, armorRedMat);
			shin.position.set(side * 0.5, -0.62, depthSide * 0.22);
			shin.rotation.y = Math.PI / 6;
			legGroup.add(shin);

			const foot = makePart(footPadGeo, darkFrameMat);
			foot.position.set(side * 0.54, -0.68, depthSide * 0.24);
			legGroup.add(foot);

			const toe = makePart(clawToeGeo, goldTrimMat);
			toe.rotation.z = -side * Math.PI * 0.44;
			toe.position.set(side * 0.88, -0.68, depthSide * 0.28);
			legGroup.add(toe);

			root.add(legGroup);
		}
	}

	// 2. 上半身シャーシ（面取り胸甲・油圧ダンパー・タービン排気パック）
	const chassis = new THREE.Group();
	chassis.position.y = 1.9;
	root.add(chassis);

	// 中心の八角インナーコア機関ブロック
	const innerBlock = makePart(tracker.geo(new THREE.CylinderGeometry(1.38, 1.18, 1.95, 8)), darkFrameMat);
	innerBlock.rotation.y = Math.PI / 8;
	chassis.add(innerBlock);

	// 面取り付き角度付き胸甲（ExtrudeGeometry）
	const chestShape = new THREE.Shape();
	chestShape.moveTo(-1.32, -0.82);
	chestShape.lineTo(1.32, -0.82);
	chestShape.lineTo(1.56, 0.26);
	chestShape.lineTo(1.08, 0.96);
	chestShape.lineTo(-1.08, 0.96);
	chestShape.lineTo(-1.56, 0.26);
	chestShape.closePath();

	const chestArmorGeo = tracker.geo(new THREE.ExtrudeGeometry(chestShape, {
		depth: 1.56,
		bevelEnabled: true,
		bevelThickness: 0.14,
		bevelSize: 0.12,
		bevelSegments: 2
	}));
	chestArmorGeo.center();
	const chestArmor = makePart(chestArmorGeo, hullMat);
	chestArmor.position.set(0, 0.06, 0.04);
	chassis.add(chestArmor);

	// 前面V字クリムゾン重装甲プレート
	const breastShape = new THREE.Shape();
	breastShape.moveTo(-0.88, -0.66);
	breastShape.lineTo(0.88, -0.66);
	breastShape.lineTo(1.2, 0.48);
	breastShape.lineTo(0.56, 0.84);
	breastShape.lineTo(-0.56, 0.84);
	breastShape.lineTo(-1.2, 0.48);
	breastShape.closePath();

	const breastGeo = tracker.geo(new THREE.ExtrudeGeometry(breastShape, {
		depth: 0.36,
		bevelEnabled: true,
		bevelThickness: 0.08,
		bevelSize: 0.08,
		bevelSegments: 2
	}));
	breastGeo.center();
	const breastPlate = makePart(breastGeo, armorRedMat);
	breastPlate.position.set(0, 0.1, 0.92);
	chassis.add(breastPlate);

	// 腹部ラジエーターフィン＆側面高圧クローム配管
	const louverGeo = tracker.geo(new THREE.BoxGeometry(1.16, 0.08, 0.22));
	for (let ly = -0.78; ly <= -0.5; ly += 0.13) {
		const louver = makePart(louverGeo, chromeMat);
		louver.position.set(0, ly, 0.98);
		louver.rotation.x = 0.25;
		chassis.add(louver);
	}

	for (const side of [-1, 1]) {
		const pistonOuter = makePart(tracker.geo(new THREE.CylinderGeometry(0.14, 0.16, 0.95, 10)), hullMat);
		pistonOuter.position.set(side * 1.18, -0.65, 0.68);
		pistonOuter.rotation.z = side * 0.18;
		chassis.add(pistonOuter);

		const pistonRod = makePart(tracker.geo(new THREE.CylinderGeometry(0.08, 0.08, 1.55, 10)), chromeMat);
		pistonRod.position.set(side * 1.12, -0.35, 0.68);
		pistonRod.rotation.z = side * 0.18;
		chassis.add(pistonRod);

		// 側面を巻く高圧エネルギー導管
		const ribTube = makePart(tracker.geo(new THREE.TorusGeometry(0.54, 0.07, 8, 14, Math.PI * 0.92)), chromeMat);
		ribTube.position.set(side * 1.12, 0.14, 0.28);
		ribTube.rotation.y = side * Math.PI * 0.36;
		chassis.add(ribTube);

		const collarFin = makePart(tracker.geo(new THREE.CylinderGeometry(0.2, 0.28, 0.56, 6)), goldTrimMat);
		collarFin.position.set(side * 0.72, 1.06, 0.32);
		collarFin.rotation.z = -side * 0.32;
		chassis.add(collarFin);
	}

	// 3. 中央リアクターコア（歯車ベゼル・4枚遮蔽ルーバー・脈動エネルギー球）
	const coreHousing = makePart(tracker.geo(new THREE.CylinderGeometry(0.76, 0.84, 0.28, 16)), darkFrameMat);
	coreHousing.rotation.x = Math.PI * 0.5;
	coreHousing.position.set(0, 0.14, 1.06);
	chassis.add(coreHousing);

	const coreRing = new THREE.Group();
	coreRing.position.set(0, 0.14, 1.16);
	const coreTorus = makePart(tracker.geo(new THREE.TorusGeometry(0.62, 0.095, 10, 24)), goldTrimMat);
	coreRing.add(coreTorus);
	const coreNotchGeo = tracker.geo(new THREE.BoxGeometry(0.14, 0.2, 0.14));
	for (let i = 0; i < 6; i += 1) {
		const a = (i / 6) * Math.PI * 2;
		const notch = makePart(coreNotchGeo, chromeMat);
		notch.position.set(Math.cos(a) * 0.62, Math.sin(a) * 0.62, 0.04);
		notch.rotation.z = a;
		coreRing.add(notch);
	}
	chassis.add(coreRing);

	const coreSphere = new THREE.Mesh(tracker.geo(new THREE.SphereGeometry(0.46, 18, 14)), coreMat);
	coreSphere.position.set(0, 0.14, 1.12);
	chassis.add(coreSphere);

	// 4. 多面装甲ヘルメット＋センサーバイザー＋ツインツノアンテナ
	const headGroup = new THREE.Group();
	headGroup.position.set(0, 1.48, 0.18);
	chassis.add(headGroup);

	const neckCollar = makePart(tracker.geo(new THREE.CylinderGeometry(0.56, 0.68, 0.28, 10)), darkFrameMat);
	neckCollar.position.y = -0.38;
	headGroup.add(neckCollar);

	const helmShape = new THREE.Shape();
	helmShape.moveTo(-0.56, -0.36);
	helmShape.lineTo(0.56, -0.36);
	helmShape.lineTo(0.74, 0.06);
	helmShape.lineTo(0.42, 0.44);
	helmShape.lineTo(-0.42, 0.44);
	helmShape.lineTo(-0.74, 0.06);
	helmShape.closePath();

	const helmGeo = tracker.geo(new THREE.ExtrudeGeometry(helmShape, {
		depth: 1.02,
		bevelEnabled: true,
		bevelThickness: 0.08,
		bevelSize: 0.08,
		bevelSegments: 2
	}));
	helmGeo.center();
	const helmMesh = makePart(helmGeo, armorRedMat);
	headGroup.add(helmMesh);

	const crownCrest = makePart(tracker.geo(new THREE.CylinderGeometry(0.1, 0.26, 0.34, 6)), goldTrimMat);
	crownCrest.position.set(0, 0.48, 0.08);
	crownCrest.scale.set(0.75, 1.0, 2.2);
	headGroup.add(crownCrest);

	const jawPlate = makePart(tracker.geo(new THREE.CylinderGeometry(0.38, 0.26, 0.26, 6)), hullMat);
	jawPlate.position.set(0, -0.24, 0.44);
	headGroup.add(jawPlate);

	// 凹んだバイザー枠＋発光パノラマオプティック＋中央モノアイ
	const visorFrame = makePart(tracker.geo(new THREE.BoxGeometry(1.12, 0.28, 0.2)), darkFrameMat);
	visorFrame.position.set(0, 0.05, 0.56);
	headGroup.add(visorFrame);

	const visor = new THREE.Mesh(tracker.geo(new THREE.BoxGeometry(0.98, 0.16, 0.12)), visorMat);
	visor.position.set(0, 0.05, 0.63);
	headGroup.add(visor);

	const browGuard = makePart(tracker.geo(new THREE.BoxGeometry(1.2, 0.12, 0.28)), hullMat);
	browGuard.position.set(0, 0.2, 0.58);
	browGuard.rotation.x = 0.18;
	headGroup.add(browGuard);

	for (const side of [-1, 1]) {
		const earPod = makePart(tracker.geo(new THREE.CylinderGeometry(0.22, 0.22, 0.24, 10)), chromeMat);
		earPod.rotation.z = Math.PI * 0.5;
		earPod.position.set(side * 0.78, 0.04, -0.02);
		headGroup.add(earPod);

		const hornBase = makePart(tracker.geo(new THREE.CylinderGeometry(0.11, 0.15, 0.22, 8)), hullMat);
		hornBase.position.set(side * 0.48, 0.52, 0.06);
		hornBase.rotation.z = -side * 0.28;
		headGroup.add(hornBase);

		const horn = makePart(tracker.geo(new THREE.ConeGeometry(0.1, 0.66, 8)), goldTrimMat);
		horn.position.set(side * 0.62, 0.88, 0.04);
		horn.rotation.z = -side * 0.34;
		headGroup.add(horn);
	}

	// 5. 多層肩アーマー・連装ロータリー迫撃砲・背面排気スタック＆回転タービン
	const cannons = [];
	const turbines = [];
	const arms = [];

	const pauldronShape = new THREE.Shape();
	pauldronShape.moveTo(-0.56, -0.42);
	pauldronShape.lineTo(0.56, -0.42);
	pauldronShape.lineTo(0.68, 0.18);
	pauldronShape.lineTo(0.22, 0.52);
	pauldronShape.lineTo(-0.48, 0.44);
	pauldronShape.closePath();
	const pauldronGeo = tracker.geo(new THREE.ExtrudeGeometry(pauldronShape, {
		depth: 1.24,
		bevelEnabled: true,
		bevelThickness: 0.09,
		bevelSize: 0.09,
		bevelSegments: 2
	}));
	pauldronGeo.center();

	for (const side of [-1, 1]) {
		const pauldronGroup = new THREE.Group();
		pauldronGroup.position.set(side * 1.94, 0.74, 0.02);
		pauldronGroup.rotation.z = -side * 0.14;
		chassis.add(pauldronGroup);

		const pauldron = makePart(pauldronGeo, armorRedMat);
		if (side < 0) {
			pauldron.rotation.y = Math.PI;
		}
		pauldronGroup.add(pauldron);

		const pauldronCap = makePart(tracker.geo(new THREE.BoxGeometry(1.18, 0.18, 1.38)), goldTrimMat);
		pauldronCap.position.y = 0.48;
		pauldronGroup.add(pauldronCap);

		// 肩部連装迫撃砲ポッド
		const cannonGroup = new THREE.Group();
		cannonGroup.position.set(side * 1.92, 1.48, 0.12);
		cannonGroup.rotation.x = 0.28;
		cannonGroup.rotation.z = -side * 0.1;

		const breech = makePart(tracker.geo(new THREE.CylinderGeometry(0.32, 0.36, 0.62, 12)), darkFrameMat);
		cannonGroup.add(breech);

		for (const bx of [-0.14, 0.14]) {
			const barrel = makePart(tracker.geo(new THREE.CylinderGeometry(0.11, 0.13, 1.05, 10)), chromeMat);
			barrel.position.set(bx, 0.48, 0.04);
			cannonGroup.add(barrel);

			const muzzle = makePart(tracker.geo(new THREE.CylinderGeometry(0.145, 0.135, 0.16, 10)), goldTrimMat);
			muzzle.position.set(bx, 0.96, 0.04);
			cannonGroup.add(muzzle);
		}
		chassis.add(cannonGroup);
		cannons.push(cannonGroup);

		// 背面リアクター排気煙突＋シュラウド付き冷却タービン
		const stack = makePart(tracker.geo(new THREE.CylinderGeometry(0.16, 0.22, 1.35, 10)), hullMat);
		stack.position.set(side * 0.72, 0.96, -0.96);
		stack.rotation.x = -0.26;
		stack.rotation.z = -side * 0.15;
		chassis.add(stack);

		const stackTip = makePart(tracker.geo(new THREE.TorusGeometry(0.17, 0.04, 6, 12)), goldTrimMat);
		stackTip.rotation.x = Math.PI * 0.5 - 0.26;
		stackTip.position.set(side * 0.82, 1.6, -1.14);
		chassis.add(stackTip);

		const shroud = makePart(tracker.geo(new THREE.CylinderGeometry(0.74, 0.74, 0.28, 16)), darkFrameMat);
		shroud.rotation.x = Math.PI * 0.5;
		shroud.position.set(side * 1.24, 0.32, -1.06);
		chassis.add(shroud);

		const turbine = new THREE.Group();
		turbine.position.set(side * 1.24, 0.32, -1.16);
		const turbRim = makePart(tracker.geo(new THREE.TorusGeometry(0.66, 0.09, 8, 18)), goldTrimMat);
		turbine.add(turbRim);
		const bladeGeo = tracker.geo(new THREE.BoxGeometry(0.14, 1.18, 0.06));
		for (let b = 0; b < 3; b += 1) {
			const blade = makePart(bladeGeo, chromeMat);
			blade.rotation.z = (b / 3) * Math.PI;
			turbine.add(blade);
		}
		chassis.add(turbine);
		turbines.push(turbine);

		// 多関節油圧アーム＋3指クラッシャークロー
		const armPivot = new THREE.Group();
		armPivot.position.set(side * 2.28, 0.24, 0.24);

		const shoulderBall = makePart(tracker.geo(new THREE.SphereGeometry(0.42, 14, 12)), chromeMat);
		armPivot.add(shoulderBall);

		for (const pz of [-0.14, 0.14]) {
			const armRod = makePart(tracker.geo(new THREE.CylinderGeometry(0.14, 0.14, 0.86, 10)), hullMat);
			armRod.position.set(0, -0.46, pz);
			armPivot.add(armRod);
		}
		const armSleeve = makePart(tracker.geo(new THREE.CylinderGeometry(0.28, 0.25, 0.5, 8)), armorRedMat);
		armSleeve.position.set(0, -0.36, 0);
		armPivot.add(armSleeve);

		const elbow = makePart(tracker.geo(new THREE.CylinderGeometry(0.28, 0.28, 0.56, 12)), goldTrimMat);
		elbow.rotation.z = Math.PI * 0.5;
		elbow.position.set(0, -0.92, 0.04);
		armPivot.add(elbow);

		const gauntlet = makePart(tracker.geo(new THREE.CylinderGeometry(0.36, 0.44, 0.72, 8)), hullMat);
		gauntlet.position.set(0, -1.32, 0.18);
		gauntlet.rotation.x = -0.22;
		armPivot.add(gauntlet);

		const knuckleGuard = makePart(tracker.geo(new THREE.BoxGeometry(0.76, 0.24, 0.64)), goldTrimMat);
		knuckleGuard.position.set(0, -1.66, 0.28);
		armPivot.add(knuckleGuard);

		// 3本の爪フィンガー＋親指爪
		const fingerGeo = tracker.geo(new THREE.ConeGeometry(0.1, 0.42, 6));
		for (const fx of [-0.22, 0, 0.22]) {
			const finger = makePart(fingerGeo, chromeMat);
			finger.rotation.x = Math.PI * 0.88;
			finger.position.set(fx, -1.88, 0.36);
			armPivot.add(finger);
		}
		const thumb = makePart(fingerGeo, goldTrimMat);
		thumb.rotation.x = Math.PI * 0.68;
		thumb.rotation.z = side * 0.5;
		thumb.position.set(-side * 0.32, -1.78, 0.14);
		armPivot.add(thumb);

		chassis.add(armPivot);
		arms.push(armPivot);
	}

	const bossLight = new THREE.PointLight(0xff4d3b, 22, 20);
	bossLight.position.set(0, 2.3, 2.6);
	root.add(bossLight);

	return {
		root,
		chassis,
		coreMat,
		coreSphere,
		coreRing,
		visorMat,
		cannons,
		turbines,
		arms,
		bossLight
	};
}

/**
 * STAGE 2 工場ボス「FORGE LOADER MK-II」（ドラム缶投擲用・重工業パワーローダー型ボス）を構築する
 * BarrelThrower 互換ジョイント（body, torso, leftArm, rightArm, heldBarrel）を返す。
 * @param {{ geo: Function, mat: Function }} tracker
 * @param {number} [throwDir]
 */
export function buildFactoryBossModel(tracker, throwDir = -1) {
	const hullMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0x263142,
		metalness: 0.84,
		roughness: 0.3
	}));
	const loaderOrangeMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0xf97316,
		metalness: 0.52,
		roughness: 0.34
	}));
	const hazardAmberMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0xfbbf24,
		metalness: 0.58,
		roughness: 0.3
	}));
	const chromeMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0xdbe6f2,
		metalness: 0.92,
		roughness: 0.18
	}));
	const visorMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0x38bdf8,
		emissive: 0x0ea5e9,
		emissiveIntensity: 1.65,
		roughness: 0.18
	}));
	const beaconMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0xff4d3b,
		emissive: 0xe63946,
		emissiveIntensity: 1.45,
		roughness: 0.22
	}));
	const drumBodyMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0xd9480f,
		metalness: 0.65,
		roughness: 0.34
	}));
	const drumBandMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0xe2e8f0,
		metalness: 0.88,
		roughness: 0.22
	}));

	const body = new THREE.Group();
	body.rotation.y = throwDir < 0 ? -Math.PI * 0.34 : Math.PI * 0.34;

	// 重機クローラー脚＆油圧スタビライザー足
	for (const side of [-0.5, 0.5]) {
		const footPad = makePart(tracker.geo(new THREE.BoxGeometry(0.48, 0.22, 0.86)), hullMat);
		footPad.position.set(side, 0.11, 0.06);
		body.add(footPad);

		const shin = makePart(tracker.geo(new THREE.CylinderGeometry(0.2, 0.24, 0.68, 10)), loaderOrangeMat);
		shin.position.set(side, 0.52, 0);
		body.add(shin);

		const piston = makePart(tracker.geo(new THREE.CylinderGeometry(0.06, 0.06, 0.52, 8)), chromeMat);
		piston.position.set(side, 0.5, -0.2);
		body.add(piston);
	}

	// 重厚な工場ローダー胴体
	const torso = new THREE.Group();
	torso.position.y = 0.85;
	body.add(torso);

	const chassis = makePart(tracker.geo(new THREE.BoxGeometry(1.5, 1.05, 1.05)), hullMat);
	chassis.position.y = 0.54;
	torso.add(chassis);

	const frontPlate = makePart(tracker.geo(new THREE.BoxGeometry(1.22, 0.72, 0.22)), loaderOrangeMat);
	frontPlate.position.set(0, 0.56, 0.54);
	torso.add(frontPlate);

	const grill = makePart(tracker.geo(new THREE.BoxGeometry(0.76, 0.32, 0.08)), hazardAmberMat, false, false);
	grill.position.set(0, 0.44, 0.66);
	torso.add(grill);

	const furnaceCore = makePart(tracker.geo(new THREE.CylinderGeometry(0.22, 0.22, 0.12, 14)), beaconMat, false, false);
	furnaceCore.rotation.x = Math.PI * 0.5;
	furnaceCore.position.set(0, 0.76, 0.64);
	torso.add(furnaceCore);

	// 背面ボイラー＆2本マフラー排気管
	const boiler = makePart(tracker.geo(new THREE.CylinderGeometry(0.46, 0.46, 0.9, 14)), loaderOrangeMat);
	boiler.rotation.z = Math.PI * 0.5;
	boiler.position.set(0, 0.68, -0.62);
	torso.add(boiler);

	for (const side of [-0.46, 0.46]) {
		const stack = makePart(tracker.geo(new THREE.CylinderGeometry(0.11, 0.14, 0.92, 10)), chromeMat);
		stack.position.set(side, 1.32, -0.52);
		stack.rotation.x = -0.18;
		torso.add(stack);
	}

	// 装甲ヘルメット頭部＋シアン発光カメラバイザー＋回転警告ビーコン
	const headGroup = new THREE.Group();
	headGroup.position.set(0, 1.28, 0.12);
	torso.add(headGroup);

	const headBox = makePart(tracker.geo(new THREE.BoxGeometry(0.78, 0.52, 0.72)), loaderOrangeMat);
	headGroup.add(headBox);

	const visorFrame = makePart(tracker.geo(new THREE.BoxGeometry(0.68, 0.2, 0.14)), hullMat);
	visorFrame.position.set(0, 0.03, 0.36);
	headGroup.add(visorFrame);

	const visor = new THREE.Mesh(tracker.geo(new THREE.BoxGeometry(0.56, 0.11, 0.08)), visorMat);
	visor.position.set(0, 0.03, 0.41);
	headGroup.add(visor);

	const beacon = new THREE.Mesh(tracker.geo(new THREE.CylinderGeometry(0.1, 0.13, 0.18, 12)), beaconMat);
	beacon.position.set(0, 0.34, 0);
	headGroup.add(beacon);

	// パワーフォークアーム＋工業用グラップルクロー
	const makeArm = (side) => {
		const shoulder = new THREE.Group();
		shoulder.position.set(side * 0.96, 0.92, 0.06);
		torso.add(shoulder);

		const pauldron = makePart(tracker.geo(new THREE.BoxGeometry(0.46, 0.42, 0.52)), loaderOrangeMat);
		shoulder.add(pauldron);

		const armRod = makePart(tracker.geo(new THREE.CylinderGeometry(0.15, 0.15, 0.68, 10)), hullMat);
		armRod.position.y = -0.45;
		shoulder.add(armRod);

		const piston = makePart(tracker.geo(new THREE.CylinderGeometry(0.06, 0.06, 0.58, 8)), chromeMat);
		piston.position.set(side * 0.12, -0.45, -0.1);
		shoulder.add(piston);

		const clawHand = makePart(tracker.geo(new THREE.BoxGeometry(0.44, 0.36, 0.52)), hazardAmberMat);
		clawHand.position.y = -0.92;
		shoulder.add(clawHand);
		return shoulder;
	};

	const leftArm = makeArm(-1);
	const rightArm = makeArm(1);

	// 頭上に掲げる投擲用鋼鉄ドラム缶
	const heldBarrel = new THREE.Group();
	heldBarrel.position.set(0, 1.82, 0.68);
	heldBarrel.visible = false;

	const drumShell = makePart(tracker.geo(new THREE.CylinderGeometry(0.39, 0.39, 0.72, 18)), drumBodyMat);
	drumShell.rotation.x = Math.PI * 0.5;
	heldBarrel.add(drumShell);
	for (const sz of [-0.2, 0.2]) {
		const band = makePart(tracker.geo(new THREE.CylinderGeometry(0.415, 0.415, 0.06, 18)), drumBandMat);
		band.rotation.x = Math.PI * 0.5;
		band.position.z = sz;
		heldBarrel.add(band);
	}
	torso.add(heldBarrel);

	return {
		body,
		torso,
		leftArm,
		rightArm,
		heldBarrel
	};
}

/**
 * 一目で危険な敵と判別できる「スパイク・チェイサーボット」3Dモデルを構築する
 * （黒×黄の警告ストライプ装甲・鋭い金属スパイク・吊り上がった赤い発光目・ギザ歯・クロー・鋸歯車輪）
 * @param {{ geo: Function, mat: Function }} tracker
 * @param {number} [radius=0.36] 物理当たり判定半径（足元接地位置 -radius に合わせる）
 * @param {number} [visualScale=1.48] 物理判定を変えずにディテール視認性を高めるビジュアル拡大倍率
 */
export function buildSpikedChaserBotModel(tracker, radius = 0.36, visualScale = 1.48) {
	const s = radius / 0.36;
	const hasDoc = typeof document !== 'undefined';
	const cautionTex = hasDoc ? textureFactory.getCautionStripeTexture(1, 1) : null;

	const armorDarkMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0x262c35,
		metalness: 0.78,
		roughness: 0.34
	}));
	const armorPlateMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0x3b4452,
		metalness: 0.82,
		roughness: 0.28
	}));
	const steelTrimMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0x8d99ae,
		metalness: 0.88,
		roughness: 0.2
	}));
	const spikeMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0xd1d5db,
		metalness: 0.92,
		roughness: 0.16
	}));
	const hazardMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: cautionTex ? 0xffffff : 0xeab308,
		map: cautionTex,
		metalness: 0.35,
		roughness: 0.42
	}));
	const recessBlackMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0x07090d,
		metalness: 0.25,
		roughness: 0.78
	}));
	const tireMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0x16191e,
		metalness: 0.3,
		roughness: 0.75
	}));
	const eyeMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0xff2a2a,
		emissive: 0xff1100,
		emissiveIntensity: 2.2,
		roughness: 0.14
	}));
	const coreGlowMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0xff4518,
		emissive: 0xdc2626,
		emissiveIntensity: 1.4,
		roughness: 0.2
	}));

	const root = new THREE.Group();
	// 物理当たり判定（radius）は維持したまま、足元タイヤ最下端(-radius)を接地基準に保って見た目だけを拡大する
	const visualPivot = new THREE.Group();
	visualPivot.scale.setScalar(visualScale);
	visualPivot.position.y = radius * (visualScale - 1);
	root.add(visualPivot);

	const bodyGroup = new THREE.Group();
	visualPivot.add(bodyGroup);

	// 1. 面取りされた八角形の重装甲シャーシ
	const mainHull = makePart(tracker.geo(new THREE.BoxGeometry(0.46 * s, 0.38 * s, 0.36 * s)), armorDarkMat);
	mainHull.position.y = 0.04 * s;
	bodyGroup.add(mainHull);

	const crownBevel = makePart(tracker.geo(new THREE.BoxGeometry(0.34 * s, 0.1 * s, 0.32 * s)), armorPlateMat);
	crownBevel.position.y = 0.255 * s;
	bodyGroup.add(crownBevel);

	const chinBevel = makePart(tracker.geo(new THREE.BoxGeometry(0.34 * s, 0.09 * s, 0.3 * s)), armorPlateMat);
	chinBevel.position.y = -0.175 * s;
	bodyGroup.add(chinBevel);

	// 2. 外周を縁取る黒×黄ハザードストライプフレーム
	const hazardBack = makePart(tracker.geo(new THREE.BoxGeometry(0.5 * s, 0.41 * s, 0.24 * s)), hazardMat);
	hazardBack.position.y = 0.04 * s;
	bodyGroup.add(hazardBack);

	const hazardTop = makePart(tracker.geo(new THREE.BoxGeometry(0.38 * s, 0.06 * s, 0.35 * s)), hazardMat);
	hazardTop.position.y = 0.23 * s;
	bodyGroup.add(hazardTop);

	const hazardBottom = makePart(tracker.geo(new THREE.BoxGeometry(0.36 * s, 0.055 * s, 0.33 * s)), hazardMat);
	hazardBottom.position.y = -0.155 * s;
	bodyGroup.add(hazardBottom);

	// 前面装甲プレート（濃いガンメタルで目と口を引き立てる）
	const frontPlate = makePart(tracker.geo(new THREE.BoxGeometry(0.4 * s, 0.34 * s, 0.05 * s)), armorPlateMat);
	frontPlate.position.set(0, 0.04 * s, 0.175 * s);
	bodyGroup.add(frontPlate);

	// 3. バイザー凹み＆怒りの吊り上がり赤い発光目
	const visorFrame = makePart(tracker.geo(new THREE.BoxGeometry(0.34 * s, 0.115 * s, 0.03 * s)), steelTrimMat, false, false);
	visorFrame.position.set(0, 0.105 * s, 0.195 * s);
	bodyGroup.add(visorFrame);

	const visorRecess = makePart(tracker.geo(new THREE.BoxGeometry(0.3 * s, 0.08 * s, 0.034 * s)), recessBlackMat, false, false);
	visorRecess.position.set(0, 0.105 * s, 0.201 * s);
	bodyGroup.add(visorRecess);

	for (const side of [-1, 1]) {
		const eye = new THREE.Mesh(tracker.geo(new THREE.BoxGeometry(0.082 * s, 0.034 * s, 0.02 * s)), eyeMat);
		eye.position.set(side * 0.078 * s, 0.106 * s, 0.214 * s);
		// 内側に向かって鋭く吊り上げる
		eye.rotation.z = side * 0.28;
		bodyGroup.add(eye);

		const eyePupilHighlight = new THREE.Mesh(tracker.geo(new THREE.SphereGeometry(0.016 * s, 8, 8)), eyeMat);
		eyePupilHighlight.scale.set(1.4, 0.85, 0.5);
		eyePupilHighlight.position.set(side * 0.072 * s, 0.105 * s, 0.222 * s);
		bodyGroup.add(eyePupilHighlight);
	}

	// 4. ギザギザの口グリル＋赤い内部発光＋上下の鋭いキバ
	const mouthFrame = makePart(tracker.geo(new THREE.BoxGeometry(0.24 * s, 0.115 * s, 0.03 * s)), steelTrimMat, false, false);
	mouthFrame.position.set(0, -0.045 * s, 0.195 * s);
	bodyGroup.add(mouthFrame);

	const mouthBack = new THREE.Mesh(tracker.geo(new THREE.BoxGeometry(0.2 * s, 0.082 * s, 0.022 * s)), coreGlowMat);
	mouthBack.position.set(0, -0.045 * s, 0.203 * s);
	bodyGroup.add(mouthBack);

	// 上下のノコギリキバ（計7本）
	for (let i = -3; i <= 3; i += 1) {
		const isUpper = i % 2 === 0;
		const tooth = makePart(tracker.geo(new THREE.ConeGeometry(0.021 * s, 0.052 * s, 4)), spikeMat, false, false);
		tooth.position.set(i * 0.028 * s, (isUpper ? -0.02 : -0.07) * s, 0.214 * s);
		tooth.rotation.x = isUpper ? Math.PI : 0;
		bodyGroup.add(tooth);
	}

	// 側面ダクトの赤い3連スリットLED
	for (const side of [-1, 1]) {
		for (let row = 0; row < 3; row += 1) {
			const vent = new THREE.Mesh(tracker.geo(new THREE.BoxGeometry(0.016 * s, 0.022 * s, 0.065 * s)), coreGlowMat);
			vent.position.set(side * 0.252 * s, (0.09 - row * 0.04) * s, 0.07 * s);
			bodyGroup.add(vent);
		}
	}

	// 5. 頭頂＆前面＆背面へ突き出す鋭利な金属スパイク群
	const addSpike = (x, y, z, rx = 0, rz = 0, rScale = 1, hScale = 1) => {
		const spike = makePart(
			tracker.geo(new THREE.ConeGeometry(0.034 * s * rScale, 0.135 * s * hScale, 8)),
			spikeMat
		);
		spike.position.set(x * s, y * s, z * s);
		spike.rotation.set(rx, 0, rz);
		bodyGroup.add(spike);
	};
	// 頭頂スパイク（外向きに広がる5本＋前後エッジ2本）
	addSpike(-0.1, 0.34, 0.02, 0, 0.24, 1.0, 1.1);
	addSpike(0.1, 0.34, 0.02, 0, -0.24, 1.0, 1.1);
	addSpike(-0.04, 0.35, -0.08, -0.18, 0.08, 0.9, 1.0);
	addSpike(0.04, 0.35, -0.08, -0.18, -0.08, 0.9, 1.0);
	addSpike(0, 0.285, 0.145, 0.52, 0, 0.85, 0.9);
	addSpike(-0.185, 0.28, 0.02, 0, 0.62, 0.9, 0.95);
	addSpike(0.185, 0.28, 0.02, 0, -0.62, 0.9, 0.95);

	// 6. 両脇のハサミ型クローアーム（肩ハザードアーマー＋上下開閉するペンチ爪）
	const buildClawArm = (side) => {
		const shoulder = new THREE.Group();
		shoulder.position.set(side * 0.275 * s, 0.065 * s, 0.02 * s);
		bodyGroup.add(shoulder);

		const shoulderArmor = makePart(tracker.geo(new THREE.BoxGeometry(0.11 * s, 0.12 * s, 0.15 * s)), hazardMat);
		shoulderArmor.position.set(side * 0.025 * s, 0.02 * s, 0);
		shoulder.add(shoulderArmor);

		// 肩アーマーの上部トゲ
		const shoulderSpike = makePart(tracker.geo(new THREE.ConeGeometry(0.025 * s, 0.09 * s, 6)), spikeMat);
		shoulderSpike.position.set(side * 0.04 * s, 0.115 * s, 0);
		shoulderSpike.rotation.z = -side * 0.35;
		shoulder.add(shoulderSpike);

		const upperArm = makePart(tracker.geo(new THREE.CylinderGeometry(0.032 * s, 0.028 * s, 0.16 * s, 8)), steelTrimMat);
		upperArm.position.set(side * 0.055 * s, -0.08 * s, 0.02 * s);
		upperArm.rotation.z = side * 0.32;
		upperArm.rotation.x = -0.35;
		shoulder.add(upperArm);

		const forearm = makePart(tracker.geo(new THREE.BoxGeometry(0.065 * s, 0.065 * s, 0.15 * s)), armorPlateMat);
		forearm.position.set(side * 0.082 * s, -0.15 * s, 0.11 * s);
		shoulder.add(forearm);

		const clawPivot = new THREE.Group();
		clawPivot.position.set(side * 0.082 * s, -0.15 * s, 0.185 * s);
		shoulder.add(clawPivot);

		const clawTop = makePart(tracker.geo(new THREE.ConeGeometry(0.024 * s, 0.1 * s, 5)), steelTrimMat);
		clawTop.rotation.x = Math.PI * 0.5 + 0.25;
		clawTop.position.set(0, 0.028 * s, 0.045 * s);
		clawPivot.add(clawTop);

		const clawBottom = makePart(tracker.geo(new THREE.ConeGeometry(0.024 * s, 0.1 * s, 5)), steelTrimMat);
		clawBottom.rotation.x = Math.PI * 0.5 - 0.25;
		clawBottom.position.set(0, -0.028 * s, 0.045 * s);
		clawPivot.add(clawBottom);

		return { shoulder, clawTop, clawBottom };
	};

	const leftClawArm = buildClawArm(-1);
	const rightClawArm = buildClawArm(1);

	// 7. 足元のトゲ付き鋸歯（ノコギリ刃）車輪＋スパイクフェンダー（最下端 y = -0.36 * s = -radius）
	const buildSawWheel = (side) => {
		// フェンダーアーマー（ボディ側、車輪と一緒に回らない）
		const fender = makePart(tracker.geo(new THREE.BoxGeometry(0.11 * s, 0.11 * s, 0.26 * s)), armorDarkMat);
		fender.position.set(side * 0.24 * s, -0.075 * s, 0);
		bodyGroup.add(fender);

		const fenderSpike = makePart(tracker.geo(new THREE.ConeGeometry(0.024 * s, 0.08 * s, 6)), spikeMat);
		fenderSpike.position.set(side * 0.265 * s, 0.01 * s, 0.075 * s);
		fenderSpike.rotation.x = 0.35;
		fenderSpike.rotation.z = -side * 0.3;
		bodyGroup.add(fenderSpike);

		// 回転車輪グループ（中心 y = -0.20 * s、外径＋スパイク = 0.16 * s → 地面 y = -0.36 * s にぴったり接地）
		const wheelPivot = new THREE.Group();
		wheelPivot.position.set(side * 0.24 * s, -0.2 * s, 0);
		visualPivot.add(wheelPivot);

		const tread = makePart(tracker.geo(new THREE.CylinderGeometry(0.132 * s, 0.132 * s, 0.092 * s, 16)), tireMat);
		tread.rotation.z = Math.PI * 0.5;
		wheelPivot.add(tread);

		const sawDisc = makePart(tracker.geo(new THREE.CylinderGeometry(0.11 * s, 0.11 * s, 0.105 * s, 14)), steelTrimMat);
		sawDisc.rotation.z = Math.PI * 0.5;
		wheelPivot.add(sawDisc);

		const hubGlow = new THREE.Mesh(tracker.geo(new THREE.CylinderGeometry(0.048 * s, 0.048 * s, 0.114 * s, 12)), coreGlowMat);
		hubGlow.rotation.z = Math.PI * 0.5;
		wheelPivot.add(hubGlow);

		// 車輪外周のスパイク＆鋸歯ブレード（8方向）
		for (let i = 0; i < 8; i += 1) {
			const a = (i / 8) * Math.PI * 2;
			const tooth = makePart(tracker.geo(new THREE.ConeGeometry(0.018 * s, 0.042 * s, 4)), spikeMat, false, false);
			tooth.position.set(0, Math.cos(a) * 0.138 * s, Math.sin(a) * 0.138 * s);
			tooth.rotation.x = a;
			wheelPivot.add(tooth);
		}
		return wheelPivot;
	};

	const leftWheel = buildSawWheel(-1);
	const rightWheel = buildSawWheel(1);

	return {
		root,
		visualPivot,
		visualScale,
		bodyGroup,
		eyeMat,
		coreGlowMat,
		leftArm: leftClawArm.shoulder,
		rightArm: rightClawArm.shoulder,
		leftClawTop: leftClawArm.clawTop,
		leftClawBottom: leftClawArm.clawBottom,
		rightClawTop: rightClawArm.clawTop,
		rightClawBottom: rightClawArm.clawBottom,
		leftWheel,
		rightWheel
	};
}

/**
 * 全ステージ左下端共通の「燃焼ドラム缶ピット台＋有機的シェーダー炎」を構築し、フレーム更新関数を返す
 * @param {THREE.Group} group
 * @param {{ geo: Function, mat: Function }} tracker
 * @param {number} [x=-14.8]
 * @param {number} [baseY=0]
 * @param {boolean} [enableLights=true]
 * @returns {(time: number) => void}
 */
export function buildPitFireStand(group, tracker, x = -14.8, baseY = 0, enableLights = true) {
	const drumSteelMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0x262d38,
		metalness: 0.78,
		roughness: 0.38
	}));
	const emberBedMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0x3b0f05,
		emissive: 0xff4500,
		emissiveIntensity: 1.9,
		roughness: 0.9
	}));
	const outerFlameMat = tracker.mat(textureFactory.createRealisticFlameMaterial({
		speed: 2.3,
		sway: 0.24,
		intensity: 1.25,
		seed: 0.7,
		coreBias: 0.0
	}));
	const coreFlameMat = tracker.mat(textureFactory.createRealisticFlameMaterial({
		speed: 2.9,
		sway: 0.16,
		intensity: 1.55,
		seed: 2.4,
		coreBias: 0.85
	}));

	const drumMesh = new THREE.Mesh(
		tracker.geo(new THREE.CylinderGeometry(0.68, 0.68, 1.25, 18)),
		drumSteelMat
	);
	drumMesh.position.set(x, baseY + 0.62, 0);
	drumMesh.castShadow = true;
	drumMesh.receiveShadow = true;
	group.add(drumMesh);

	const emberBed = new THREE.Mesh(tracker.geo(new THREE.CircleGeometry(0.6, 16)), emberBedMat);
	emberBed.position.set(x, baseY + 1.25, 0);
	emberBed.rotation.x = -Math.PI * 0.5;
	group.add(emberBed);

	const flameGroup = new THREE.Group();
	flameGroup.position.set(x, baseY + 1.15, 0);
	group.add(flameGroup);

	const outerFlameGeo = tracker.geo(new THREE.PlaneGeometry(1.38, 1.9, 8, 18));
	outerFlameGeo.translate(0, 0.95, 0);
	for (let i = 0; i < 3; i += 1) {
		const plane = new THREE.Mesh(outerFlameGeo, outerFlameMat);
		plane.rotation.y = (i * Math.PI) / 3;
		flameGroup.add(plane);
	}

	const coreFlameGeo = tracker.geo(new THREE.PlaneGeometry(0.84, 1.32, 6, 14));
	coreFlameGeo.translate(0, 0.66, 0);
	for (let i = 0; i < 2; i += 1) {
		const corePlane = new THREE.Mesh(coreFlameGeo, coreFlameMat);
		corePlane.rotation.y = Math.PI / 6 + (i * Math.PI) / 2;
		flameGroup.add(corePlane);
	}

	let fireLight = null;
	if (enableLights) {
		fireLight = new THREE.PointLight(0xff6b1a, 16, 12);
		fireLight.position.set(x, baseY + 2.2, 0.6);
		group.add(fireLight);
	}

	return (time) => {
		outerFlameMat.uniforms.uTime.value = time;
		coreFlameMat.uniforms.uTime.value = time;
		if (fireLight) {
			const flicker = 0.88 + Math.sin(time * 13) * 0.12 + Math.cos(time * 21) * 0.08;
			fireLight.intensity = 16 * flicker;
		}
	};
}

/**
 * 工場・建築壁面に固定される立体2灯式インダストリアル蛍光灯ユニットを構築する
 * （単なる発光長方形ではなく、背面アーム・反射シェード・ソケット・保護リング・円筒管・ソフトグローで構成）
 * @param {THREE.Group} group
 * @param {{ geo: Function, mat: Function }} tracker
 * @param {THREE.Material} housingMat
 * @param {THREE.Material} socketMat
 * @param {THREE.Material} tubeMat
 * @param {THREE.SpriteMaterial} haloMat
 * @param {object} [options]
 * @returns {THREE.Group}
 */
export function buildWallFluorescentLight(group, tracker, housingMat, socketMat, tubeMat, haloMat, options = {}) {
	const x = options.x ?? 0;
	const y = options.y ?? 0;
	const z = options.z ?? -10.5;
	const length = options.length ?? 6.2;
	const mountDepth = options.mountDepth ?? 1.2;

	const fixture = new THREE.Group();
	fixture.position.set(x, y, z);
	group.add(fixture);

	// 背面壁／棚へ固定するブラケットアーム2基
	const armGeo = tracker.geo(new THREE.BoxGeometry(0.24, 0.24, mountDepth));
	const flangeGeo = tracker.geo(new THREE.BoxGeometry(0.46, 0.46, 0.14));
	for (const ax of [-length * 0.34, length * 0.34]) {
		const arm = new THREE.Mesh(armGeo, socketMat);
		arm.position.set(ax, 0.14, -mountDepth * 0.5);
		fixture.add(arm);

		const flange = new THREE.Mesh(flangeGeo, housingMat);
		flange.position.set(ax, 0.14, -mountDepth + 0.06);
		fixture.add(flange);
	}

	// 上部フード＆斜め反射傘（金属シェード）
	const topPlate = new THREE.Mesh(
		tracker.geo(new THREE.BoxGeometry(length, 0.12, 0.72)),
		housingMat
	);
	topPlate.position.set(0, 0.18, 0.02);
	fixture.add(topPlate);

	const visorGeo = tracker.geo(new THREE.BoxGeometry(length, 0.08, 0.34));
	const frontVisor = new THREE.Mesh(visorGeo, housingMat);
	frontVisor.position.set(0, 0.08, 0.44);
	frontVisor.rotation.x = 0.58;
	fixture.add(frontVisor);

	const backVisor = new THREE.Mesh(visorGeo, housingMat);
	backVisor.position.set(0, 0.08, -0.4);
	backVisor.rotation.x = -0.58;
	fixture.add(backVisor);

	// 両端の絶縁ソケットエンドブロック
	const endCapGeo = tracker.geo(new THREE.BoxGeometry(0.26, 0.34, 0.78));
	for (const sx of [-length * 0.5 + 0.13, length * 0.5 - 0.13]) {
		const cap = new THREE.Mesh(endCapGeo, socketMat);
		cap.position.set(sx, 0.02, 0.02);
		fixture.add(cap);
	}

	// 2本の円筒蛍光管（CylinderGeometry）
	const tubeLen = Math.max(0.8, length - 0.46);
	const tubeGeo = tracker.geo(new THREE.CylinderGeometry(0.075, 0.075, tubeLen, 12));
	for (const tz of [-0.14, 0.18]) {
		const tube = new THREE.Mesh(tubeGeo, tubeMat);
		tube.rotation.z = Math.PI * 0.5;
		tube.position.set(0, -0.02, tz);
		fixture.add(tube);
	}

	// 中間の保護ワイヤーガード（立体的なバンド構造）
	const guardGeo = tracker.geo(new THREE.TorusGeometry(0.32, 0.028, 6, 14, Math.PI));
	for (const gx of [-length * 0.25, 0, length * 0.25]) {
		const guard = new THREE.Mesh(guardGeo, housingMat);
		guard.rotation.y = Math.PI * 0.5;
		guard.rotation.z = Math.PI;
		guard.position.set(gx, 0.02, 0.02);
		fixture.add(guard);
	}

	// 柔らかな周囲光滲みスプライト（左右2点配置）
	if (haloMat) {
		for (const hx of [-length * 0.24, length * 0.24]) {
			const glow = new THREE.Sprite(haloMat);
			glow.position.set(hx, -0.08, 0.32);
			glow.scale.set(length * 0.52, 1.9, 1);
			fixture.add(glow);
		}
	}

	return fixture;
}

/**
 * 角度を変えて空間を照らすムービング・ワークスポットライト（壁/柱マウント＋U字ヨーク＋鏡筒＋光束コーン）を構築する
 * @param {THREE.Group} group
 * @param {{ geo: Function, mat: Function }} tracker
 * @param {THREE.Material} housingMat
 * @param {THREE.Material} trimMat
 * @param {THREE.Material} lensMat
 * @param {THREE.ShaderMaterial} beamMat
 * @param {THREE.SpriteMaterial} haloMat
 * @param {object} [options]
 * @returns {{ root: THREE.Group, yokePivot: THREE.Group, headPivot: THREE.Group, baseYaw: number, basePitch: number }}
 */
export function buildMovingSpotLight(group, tracker, housingMat, trimMat, lensMat, beamMat, haloMat, options = {}) {
	const x = options.x ?? 0;
	const y = options.y ?? 10;
	const z = options.z ?? -8;
	const armLen = options.armLen ?? 1.4;
	const baseYaw = options.baseYaw ?? 0;
	const basePitch = options.basePitch ?? -0.55;
	const beamLen = options.beamLen ?? 16.0;
	const beamRadius = options.beamRadius ?? 2.6;
	const scale = options.scale ?? 1.0;

	const root = new THREE.Group();
	root.position.set(x, y, z);
	root.scale.setScalar(scale);
	group.add(root);

	// 背面柱／壁面固定フランジ＆延長ブラケットアーム
	const wallPlate = new THREE.Mesh(tracker.geo(new THREE.BoxGeometry(0.75, 0.75, 0.18)), trimMat);
	wallPlate.position.set(0, 0, -armLen);
	root.add(wallPlate);

	const mountArm = new THREE.Mesh(tracker.geo(new THREE.BoxGeometry(0.26, 0.26, armLen)), housingMat);
	mountArm.position.set(0, 0, -armLen * 0.5);
	root.add(mountArm);

	const swivelBase = new THREE.Mesh(tracker.geo(new THREE.CylinderGeometry(0.32, 0.36, 0.24, 14)), trimMat);
	swivelBase.position.set(0, -0.1, 0);
	root.add(swivelBase);

	// パン回転するU字ヨーク
	const yokePivot = new THREE.Group();
	yokePivot.position.set(0, -0.22, 0);
	yokePivot.rotation.y = baseYaw;
	root.add(yokePivot);

	const yokeCross = new THREE.Mesh(tracker.geo(new THREE.BoxGeometry(0.95, 0.14, 0.22)), trimMat);
	yokeCross.position.set(0, 0, 0);
	yokePivot.add(yokeCross);

	const yokeArmGeo = tracker.geo(new THREE.BoxGeometry(0.12, 0.65, 0.18));
	for (const side of [-0.46, 0.46]) {
		const yArm = new THREE.Mesh(yokeArmGeo, trimMat);
		yArm.position.set(side, -0.3, 0);
		yokePivot.add(yArm);
	}

	// チルト回転するランプヘッド本体
	const headPivot = new THREE.Group();
	headPivot.position.set(0, -0.52, 0);
	headPivot.rotation.x = basePitch;
	yokePivot.add(headPivot);

	const barrelBody = new THREE.Mesh(tracker.geo(new THREE.CylinderGeometry(0.36, 0.3, 0.92, 16)), housingMat);
	barrelBody.rotation.x = Math.PI * 0.5;
	headPivot.add(barrelBody);

	// 放熱フィンリング
	const finGeo = tracker.geo(new THREE.TorusGeometry(0.35, 0.035, 8, 18));
	for (const fz of [-0.26, -0.1, 0.06]) {
		const fin = new THREE.Mesh(finGeo, trimMat);
		fin.position.z = fz;
		headPivot.add(fin);
	}

	// 前面フードベゼル＆発光レンズ
	const frontBezel = new THREE.Mesh(tracker.geo(new THREE.TorusGeometry(0.36, 0.055, 8, 18)), trimMat);
	frontBezel.position.z = 0.45;
	headPivot.add(frontBezel);

	const lens = new THREE.Mesh(tracker.geo(new THREE.CircleGeometry(0.32, 16)), lensMat);
	lens.position.z = 0.46;
	headPivot.add(lens);

	if (haloMat) {
		const halo = new THREE.Sprite(haloMat);
		halo.position.z = 0.56;
		halo.scale.set(2.4, 2.4, 1);
		headPivot.add(halo);
	}

	// 先端へ向かって滑らかに減衰するボリュメトリック光束コーン（+Z方向へ照射）
	if (beamMat) {
		const beamGeo = tracker.geo(new THREE.CylinderGeometry(0.3, beamRadius, beamLen, 24, 1, true));
		beamGeo.translate(0, -beamLen * 0.5, 0);
		beamGeo.rotateX(-Math.PI * 0.5);
		const beamMesh = new THREE.Mesh(beamGeo, beamMat);
		beamMesh.position.z = 0.44;
		headPivot.add(beamMesh);
	}

	return { root, yokePivot, headPivot, baseYaw, basePitch };
}

/**
 * ステージアイテムおよびプレイヤー装備兼用の金属製パワーハンマーを構築する
 * （高光沢ポリッシュドクローム鋼鉄ヘッド × ダークガンメタル＆カッパー金属柄 × 真鍮バンド）
 * @param {{ geo: Function, mat: Function }} tracker
 * @param {{ pivotAtGrip?: boolean, scale?: number }} [options]
 * @returns {THREE.Group}
 */
export function buildPowerHammerModel(tracker, options = {}) {
	const pivotAtGrip = Boolean(options.pivotAtGrip);
	const scale = options.scale ?? 1.0;
	const roughnessTex = typeof document !== 'undefined' ? textureFactory.getSteelRoughnessTexture() : null;

	const chromeHeadMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0xe2e8f0,
		roughnessMap: roughnessTex,
		metalness: 0.94,
		roughness: 0.15
	}));
	const strikeFaceMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0xf8fafc,
		metalness: 0.96,
		roughness: 0.1
	}));
	const gunmetalShaftMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0x334155,
		roughnessMap: roughnessTex,
		metalness: 0.84,
		roughness: 0.34
	}));
	const copperGripMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0xb86b35,
		roughnessMap: roughnessTex,
		metalness: 0.86,
		roughness: 0.28
	}));
	const brassBandMat = tracker.mat(new THREE.MeshStandardMaterial({
		color: 0xf59e0b,
		metalness: 0.88,
		roughness: 0.22
	}));

	const root = new THREE.Group();
	root.scale.setScalar(scale);

	const assembly = new THREE.Group();
	// アイテム浮遊時は全体重心 y=0、プレイヤー手持ち時はグリップ基点基準かつヘッドを振り下ろし面（Z軸）へ90度向ける
	assembly.position.y = pivotAtGrip ? 0.38 : 0.0;
	if (pivotAtGrip) {
		assembly.rotation.y = Math.PI * 0.5;
	}
	root.add(assembly);

	// 1. ダークガンメタル金属シャフト＋カッパー金属ローレットグリップ＋金属ポンメル
	const shaft = makePart(tracker.geo(new THREE.CylinderGeometry(0.042, 0.048, 0.74, 12)), gunmetalShaftMat);
	shaft.position.y = -0.06;
	assembly.add(shaft);

	const gripSleeve = makePart(tracker.geo(new THREE.CylinderGeometry(0.056, 0.058, 0.26, 12)), copperGripMat);
	gripSleeve.position.y = -0.25;
	assembly.add(gripSleeve);

	const gripRingGeo = tracker.geo(new THREE.TorusGeometry(0.058, 0.014, 8, 16));
	for (const ry of [-0.34, -0.25, -0.16]) {
		const ring = makePart(gripRingGeo, gunmetalShaftMat, false, false);
		ring.rotation.x = Math.PI * 0.5;
		ring.position.y = ry;
		assembly.add(ring);
	}

	const pommel = makePart(tracker.geo(new THREE.CylinderGeometry(0.068, 0.052, 0.08, 12)), brassBandMat);
	pommel.position.y = -0.43;
	assembly.add(pommel);

	const neckCollar = makePart(tracker.geo(new THREE.CylinderGeometry(0.072, 0.056, 0.1, 12)), brassBandMat);
	neckCollar.position.y = 0.16;
	assembly.add(neckCollar);

	// 2. 高光沢クロームスチール製ハンマーヘッド（中央補強リング＋多角ベベル両端打撃ヘッド）
	const headY = 0.29;
	const headCore = makePart(tracker.geo(new THREE.CylinderGeometry(0.165, 0.165, 0.42, 12)), chromeHeadMat);
	headCore.rotation.z = Math.PI * 0.5;
	headCore.position.y = headY;
	assembly.add(headCore);

	const centerBand = makePart(tracker.geo(new THREE.CylinderGeometry(0.184, 0.184, 0.13, 12)), brassBandMat);
	centerBand.rotation.z = Math.PI * 0.5;
	centerBand.position.y = headY;
	assembly.add(centerBand);

	const capGeo = tracker.geo(new THREE.CylinderGeometry(0.165, 0.195, 0.095, 12));
	const faceGeo = tracker.geo(new THREE.CylinderGeometry(0.18, 0.18, 0.03, 12));
	const rivetGeo = tracker.geo(new THREE.SphereGeometry(0.024, 8, 6));
	for (const side of [-1, 1]) {
		const cap = makePart(capGeo, chromeHeadMat);
		cap.rotation.z = side * Math.PI * 0.5;
		cap.position.set(side * 0.25, headY, 0);
		assembly.add(cap);

		const strikeFace = makePart(faceGeo, strikeFaceMat);
		strikeFace.rotation.z = Math.PI * 0.5;
		strikeFace.position.set(side * 0.305, headY, 0);
		assembly.add(strikeFace);

		for (const rz of [-0.15, 0.15]) {
			const rivet = makePart(rivetGeo, brassBandMat, false, false);
			rivet.position.set(side * 0.13, headY, rz);
			assembly.add(rivet);
		}
	}

	return root;
}
