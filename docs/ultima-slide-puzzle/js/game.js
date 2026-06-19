/**
	* Ultima Slide Puzzle - Core Game Logic
	* 表示に依存しない、純粋なスライドパズルの状態とルールを管理するクラス
	*/
class SlidePuzzle {
	/**
		* @param {number} size 盤面の1辺のサイズ (3x3 〜 7x7)
		*/
	constructor(size = 5) {
		this.setSize(size);
	}

	/**
		* 盤面サイズを設定して初期化する
		* @param {number} size
		*/
	setSize(size) {
		if (size < 3 || size > 7) {
			throw new Error('サイズは3から7の間で指定してください。');
		}
		this.size = size;
		this.reset();
	}

	/**
		* パズルを初期状態（完成形）にリセットする
		*/
	reset() {
		this.tiles = [];
		const totalTiles = this.size * this.size;
		
		// 1 から size^2 - 1 までの値をセット
		for (let i = 1; i < totalTiles; i++) {
			this.tiles.push(i);
		}
		// 最後のセルは空（0）
		this.tiles.push(0);
		
		this.moves = 0;
		this.isGameActive = false;
		this.startTime = null;
		this.elapsedTime = 0; // 秒単位
		this.timerId = null;
	}

	/**
		* パズルをシャッフルする（必ず解ける状態にするため、完成状態からランダム移動を行う）
		*/
	shuffle() {
		this.reset();
		
		// 十分な回数のランダムスライドを繰り返す
		const shuffleSteps = this.size * this.size * 20;
		let lastMovedValue = -1; // 直前に動かしたピースを再び戻すのを避けるためのヒント
		
		for (let i = 0; i < shuffleSteps; i++) {
			const validMoves = this.getValidMoves();
			// 直前に動かしたピースは選択肢から除外する（戻り防止、ただし選択肢がそれしかない場合は許可）
			let filteredMoves = validMoves.filter(idx => this.tiles[idx] !== lastMovedValue);
			if (filteredMoves.length === 0) {
				filteredMoves = validMoves;
			}
			
			const randomIdx = filteredMoves[Math.floor(Math.random() * filteredMoves.length)];
			const val = this.tiles[randomIdx];
			
			// 直接スライドを実行（手数を増やさない簡易移動）
			this.swap(randomIdx, this.getBlankIndex());
			lastMovedValue = val;
		}
		
		this.moves = 0;
		this.isGameActive = true;
		this.startTime = Date.now();
		this.elapsedTime = 0;
	}

	/**
		* 空白（0）のインデックスを取得する
		* @returns {number}
		*/
	getBlankIndex() {
		return this.tiles.indexOf(0);
	}

	/**
		* 現在移動可能なピースのインデックスの配列を返す
		* @returns {number[]}
		*/
	getValidMoves() {
		const blankIdx = this.getBlankIndex();
		const blankRow = Math.floor(blankIdx / this.size);
		const blankCol = blankIdx % this.size;
		const moves = [];

		// 上下左右の隣接セル
		const directions = [
			{ r: -1, c: 0 }, // 上
			{ r: 1, c: 0 },  // 下
			{ r: 0, c: -1 }, // 左
			{ r: 0, c: 1 }   // 右
		];

		for (const dir of directions) {
			const nr = blankRow + dir.r;
			const nc = blankCol + dir.c;
			
			if (nr >= 0 && nr < this.size && nc >= 0 && nc < this.size) {
				moves.push(nr * this.size + nc);
			}
		}

		return moves;
	}

	/**
		* 指定したインデックスのピースが移動可能か判定する
		* @param {number} index 
		* @returns {boolean}
		*/
	canMove(index) {
		if (index < 0 || index >= this.tiles.length) return false;
		if (this.tiles[index] === 0) return false; // 空白自身は動かせない

		const blankIdx = this.getBlankIndex();
		const r1 = Math.floor(index / this.size);
		const c1 = index % this.size;
		const r2 = Math.floor(blankIdx / this.size);
		const c2 = blankIdx % this.size;

		// マンハッタン距離が1（隣接）なら移動可能
		return Math.abs(r1 - r2) + Math.abs(c1 - c2) === 1;
	}

	/**
		* 指定したインデックスのピースを空白位置にスライドさせる
		* @param {number} index 
		* @returns {boolean} 移動に成功したかどうか
		*/
	move(index) {
		if (!this.isGameActive) return false;
		if (!this.canMove(index)) return false;

		const blankIdx = this.getBlankIndex();
		this.swap(index, blankIdx);
		this.moves++;

		// クリア判定
		if (this.isSolved()) {
			this.isGameActive = false;
		}
		return true;
	}

	/**
		* キーボードの方向キーによる移動（空白をその方向に動かすのではなく、その方向にあるピースを空白に押し込む操作）
		* @param {string} direction 'up' | 'down' | 'left' | 'right'
		* @returns {boolean}
		*/
	moveByDirection(direction) {
		if (!this.isGameActive) return false;

		const blankIdx = this.getBlankIndex();
		const blankRow = Math.floor(blankIdx / this.size);
		const blankCol = blankIdx % this.size;
		
		let targetRow = blankRow;
		let targetCol = blankCol;

		switch (direction) {
			case 'up':
				targetRow = blankRow + 1; // 下にあるピースを上に押し上げる
				break;
			case 'down':
				targetRow = blankRow - 1; // 上にあるピースを下に押し下げる
				break;
			case 'left':
				targetCol = blankCol + 1; // 右にあるピースを左に押し込む
				break;
			case 'right':
				targetCol = blankCol - 1; // 左にあるピースを右に押し込む
				break;
			default:
				return false;
		}

		if (targetRow >= 0 && targetRow < this.size && targetCol >= 0 && targetCol < this.size) {
			const targetIdx = targetRow * this.size + targetCol;
			return this.move(targetIdx);
		}

		return false;
	}

	/**
		* 2つのインデックス of 要素を入れ替える
		* @param {number} idx1 
		* @param {number} idx2 
		*/
	swap(idx1, idx2) {
		const temp = this.tiles[idx1];
		this.tiles[idx1] = this.tiles[idx2];
		this.tiles[idx2] = temp;
	}

	/**
		* 現在の盤面が完成状態か判定する
		* @returns {boolean}
		*/
	isSolved() {
		const totalTiles = this.size * this.size;
		for (let i = 0; i < totalTiles - 1; i++) {
			if (this.tiles[i] !== i + 1) {
				return false;
			}
		}
		return this.tiles[totalTiles - 1] === 0;
	}

	/**
		* 経過時間を更新する
		*/
	updateElapsedTime() {
		if (this.isGameActive && this.startTime) {
			this.elapsedTime = Math.floor((Date.now() - this.startTime) / 1000);
		}
	}
}

// グローバルスコープに公開 (CORS回避用)
window.SlidePuzzle = SlidePuzzle;
