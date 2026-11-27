/**
 * @fileoverview scoreManager.js
 * ハイスコアおよびランキングデータの永続化（localStorage）、
 * ランクイン判定、表示用フォーマット処理を担当する。
 */

/**
 * スコア・ランキング管理クラス
 */
class ScoreManager {
	constructor() {
		/** @type {number} 現在の最高スコア */
		this.highScore = 0;
		/** @type {Array<{score: number, name: string, date: string, stage: number, loop: number}>} 上位10件のスコア履歴 */
		this.highScores = [];
		/** @type {boolean} 今回のプレイでハイスコアを更新したか */
		this.isNewHighScore = false;

		this.load();
	}

	/**
	 * localStorage からランキングデータを読み込む（旧形式からのマイグレーション対応）
	 */
	load() {
		this.highScores = [];
		this.highScore = 0;

		try {
			const savedArray = localStorage.getItem('ultima_highscores');
			if (savedArray) {
				this.highScores = JSON.parse(savedArray);
			} else {
				// 旧形式（単一ハイスコア保存）からのマイグレーション
				const saved = localStorage.getItem('ultima_highscore');
				if (saved) {
					if (saved.startsWith('{')) {
						const data = JSON.parse(saved);
						if (!data.name) data.name = 'NO NAME';
						this.highScores.push(data);
					} else {
						this.highScores.push({
							score: parseInt(saved, 10) || 0,
							name: 'NO NAME',
							date: 'UNKNOWN',
							stage: 1,
							loop: 1
						});
					}
				}
			}

			if (this.highScores.length > 0) {
				this.highScores.sort((a, b) => b.score - a.score);
				this.highScore = this.highScores[0].score;
			}
		} catch (e) {
			console.warn('Failed to load high scores from localStorage', e);
		}
	}

	/**
	 * ランキングデータを localStorage へ保存する
	 */
	save() {
		try {
			localStorage.setItem('ultima_highscores', JSON.stringify(this.highScores));
		} catch (e) {
			console.warn('Failed to save high scores to localStorage', e);
		}
	}

	/**
	 * ランキングデータを全削除する
	 */
	clear() {
		this.highScores = [];
		this.highScore = 0;
		try {
			localStorage.removeItem('ultima_highscores');
			localStorage.removeItem('ultima_highscore');
		} catch (e) {
			console.warn('Failed to clear high scores from localStorage', e);
		}
	}

	/**
	 * 現在のスコアがトップ10にランクインするか判定する
	 * @param {number} score - 現在のスコア
	 * @param {boolean} isRecordable - チート無効で記録可能か
	 * @returns {boolean}
	 */
	isScoreInTop10(score, isRecordable) {
		if (!isRecordable) return false;
		if (score <= 0) return false;
		if (this.highScores.length < 10) return true;
		return score > this.highScores[this.highScores.length - 1].score;
	}

	/**
	 * スコアをランキングに登録し保存する
	 * @param {number} score - 登録するスコア
	 * @param {string} rawName - 入力されたプレイヤー名
	 * @param {number} stageNum - 到達ステージ番号
	 * @param {number} loopCount - 到達周回数
	 */
	registerScore(score, rawName, stageNum, loopCount) {
		const name = (rawName || '').trim().toUpperCase() || 'NO NAME';
		const now = new Date();
		const year = now.getFullYear();
		const month = this.padZero(now.getMonth() + 1, 2);
		const day = this.padZero(now.getDate(), 2);
		const hours = this.padZero(now.getHours(), 2);
		const minutes = this.padZero(now.getMinutes(), 2);
		const seconds = this.padZero(now.getSeconds(), 2);
		const dateStr = `${year}.${month}.${day} - ${hours}:${minutes}:${seconds}`;

		this.highScores.push({
			score: score,
			name: name,
			date: dateStr,
			stage: stageNum,
			loop: loopCount
		});

		this.highScores.sort((a, b) => b.score - a.score);
		if (this.highScores.length > 10) {
			this.highScores = this.highScores.slice(0, 10);
		}
		if (this.highScores.length > 0) {
			this.highScore = this.highScores[0].score;
		}

		this.save();
	}

	/**
	 * 数値のゼロ埋めフォーマット
	 * @param {number|string} num
	 * @param {number} size
	 * @returns {string}
	 */
	padZero(num, size) {
		let s = String(num);
		while (s.length < size) s = '0' + s;
		return s;
	}

	/**
	 * 日付文字列を表示用フォーマットに統一する
	 * @param {string} dateStr
	 * @returns {string}
	 */
	formatDateDisplay(dateStr) {
		if (!dateStr || dateStr === 'UNKNOWN') return 'UNKNOWN';
		const match = dateStr.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})(?:\s*[-]?\s*(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
		if (!match) return dateStr;

		const y = match[1];
		const m = this.padZero(parseInt(match[2], 10), 2);
		const d = this.padZero(parseInt(match[3], 10), 2);
		const hh = match[4] !== undefined ? this.padZero(parseInt(match[4], 10), 2) : '00';
		const mm = match[5] !== undefined ? this.padZero(parseInt(match[5], 10), 2) : '00';
		const ss = match[6] !== undefined ? this.padZero(parseInt(match[6], 10), 2) : '00';
		return `${y}.${m}.${d} - ${hh}:${mm}:${ss}`;
	}
}
