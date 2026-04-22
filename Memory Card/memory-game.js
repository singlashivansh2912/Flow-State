import { ICONS } from './icons.js';

export class MemoryGame {
    constructor(container, config = {}) {
        if (!container) throw new Error('Container element is required');
        
        this.container = container;
        this.config = {
            rows: 4,
            cols: 4,
            cardSet: Object.keys(ICONS),
            flipDelay: 1000,
            theme: 'low_poly_scifi',
            ...config
        };

        this.state = {
            cards: [],
            flippedCards: [],
            matchedPairs: 0,
            moves: 0,
            timer: 0,
            timerInterval: null,
            isLocked: false,
            gameActive: false
        };

        this.initDOM();
    }

    initDOM() {
        this.container.innerHTML = `
            <div class="memory-game-container">
                <div class="mg-header">
                    <div class="mg-stat">Moves: <span id="mg-moves">0</span></div>
                    <div class="mg-stat">Time: <span id="mg-timer">00:00</span></div>
                </div>
                <div id="mg-grid" class="mg-grid"></div>
            </div>
        `;
        
        this.gridElement = this.container.querySelector('#mg-grid');
        this.movesDisplay = this.container.querySelector('#mg-moves');
        this.timerDisplay = this.container.querySelector('#mg-timer');
    }

    startGame(config = {}) {
        this.config = { ...this.config, ...config };
        this.resetGame();
        
        const totalCards = this.config.rows * this.config.cols;
        const totalPairs = totalCards / 2;
        
        // Select and double cards
        let selectedIcons = [...this.config.cardSet];
        while (selectedIcons.length < totalPairs) {
            selectedIcons = [...selectedIcons, ...this.config.cardSet];
        }
        selectedIcons = selectedIcons.slice(0, totalPairs);
        
        const cardData = [...selectedIcons, ...selectedIcons]
            .sort(() => Math.random() - 0.5) // Initial shuffle
            .map((iconId, index) => ({
                id: index,
                iconId: iconId,
                isFlipped: false,
                isMatched: false
            }));

        this.state.cards = cardData;
        this.renderGrid();
        
        this.state.gameActive = true;
        this.emit('onGameStart');
    }

    resetGame() {
        clearInterval(this.state.timerInterval);
        this.state = {
            ...this.state,
            flippedCards: [],
            matchedPairs: 0,
            moves: 0,
            timer: 0,
            isLocked: false,
            gameActive: false
        };
        this.updateStats();
    }

    destroyGame() {
        this.resetGame();
        this.container.innerHTML = '';
    }

    renderGrid() {
        this.gridElement.className = `mg-grid grid-${this.config.rows}x${this.config.cols}`;
        this.gridElement.style.gridTemplateColumns = `repeat(${this.config.cols}, 1fr)`;
        
        this.gridElement.innerHTML = this.state.cards.map(card => `
            <div class="mg-card" data-id="${card.id}">
                <div class="mg-card-face mg-card-front">
                    ${ICONS[card.iconId]}
                </div>
                <div class="mg-card-face mg-card-back"></div>
            </div>
        `).join('');

        this.gridElement.querySelectorAll('.mg-card').forEach(cardEl => {
            cardEl.addEventListener('click', () => this.handleCardClick(cardEl));
        });
    }

    handleCardClick(cardEl) {
        if (this.state.isLocked || !this.state.gameActive) return;
        
        const cardId = parseInt(cardEl.dataset.id);
        const card = this.state.cards[cardId];

        // 1. Prevent matched or already flipped cards from being selected
        if (card.isMatched || card.isFlipped) return;

        // Start timer on first move
        if (this.state.moves === 0 && !this.state.timerInterval) {
            this.startTimer();
        }

        // 2. Flip the card visually and in state
        this.visualFlip(cardEl, true);
        card.isFlipped = true;
        this.state.flippedCards.push({ el: cardEl, data: card });

        // 3. If two cards are flipped, trigger match check
        if (this.state.flippedCards.length === 2) {
            this.state.moves++;
            this.updateStats();
            this.checkMatch();
        }
    }

    visualFlip(cardEl, faceUp) {
        if (faceUp) {
            cardEl.classList.add('flipped');
        } else {
            cardEl.classList.remove('flipped');
        }
    }

    checkMatch() {
        const [card1, card2] = this.state.flippedCards;
        this.state.isLocked = true;

        if (card1.data.iconId === card2.data.iconId) {
            // MATCH FOUND
            this.handleMatch(card1, card2);
        } else {
            // MISMATCH
            this.handleMismatch(card1, card2);
        }
    }

    handleMatch(card1, card2) {
        // Mark as permanently matched
        card1.data.isMatched = true;
        card2.data.isMatched = true;
        
        // Persist flipped state
        card1.data.isFlipped = true;
        card2.data.isFlipped = true;

        // Apply matched visual style (which keeps it face up)
        card1.el.classList.add('matched');
        card2.el.classList.add('matched');
        
        this.state.matchedPairs++;
        
        // IMMEDIATE: Reset selection and unlock
        this.state.flippedCards = [];
        this.state.isLocked = false;

        this.emit('onMatch', { pairId: card1.data.iconId });

        const totalPairsNeeded = (this.config.rows * this.config.cols) / 2;
        if (this.state.matchedPairs === totalPairsNeeded) {
            this.endGame();
        }
    }

    handleMismatch(card1, card2) {
        this.emit('onMismatch');
        
        // Delay before flipping back
        setTimeout(() => {
            // Double check: don't flip back if somehow it was matched (redundant but safe)
            if (!card1.data.isMatched) {
                card1.data.isFlipped = false;
                this.visualFlip(card1.el, false);
            }
            if (!card2.data.isMatched) {
                card2.data.isFlipped = false;
                this.visualFlip(card2.el, false);
            }

            // Reset selection and unlock after delay
            this.state.flippedCards = [];
            this.state.isLocked = false;
        }, this.config.flipDelay);
    }

    startTimer() {
        this.state.timerInterval = setInterval(() => {
            this.state.timer++;
            this.updateStats();
        }, 1000);
    }

    updateStats() {
        this.movesDisplay.textContent = this.state.moves;
        
        const mins = Math.floor(this.state.timer / 60).toString().padStart(2, '0');
        const secs = (this.state.timer % 60).toString().padStart(2, '0');
        this.timerDisplay.textContent = `${mins}:${secs}`;
    }

    endGame() {
        clearInterval(this.state.timerInterval);
        this.state.gameActive = false;
        
        const stats = {
            moves: this.state.moves,
            time: this.state.timer,
            difficulty: `${this.config.rows}x${this.config.cols}`
        };
        
        this.emit('onGameComplete', stats);

        // Notify parent (main game) that this minigame was won
        if (window.parent && window.parent !== window) {
            window.parent.postMessage({ type: 'minigame-won', game: 'chair1' }, '*');
        }
    }

    emit(event, data = {}) {
        if (this.config[event] && typeof this.config[event] === 'function') {
            this.config[event](data);
        }
    }
}
