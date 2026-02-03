/**
 * Background Eraser - 배경 제거 도구
 * 클릭한 영역의 배경을 투명하게 만드는 웹 애플리케이션
 */

class BackgroundEraser {
    constructor() {
        // DOM Elements
        this.uploadArea = document.getElementById('upload-area');
        this.fileInput = document.getElementById('file-input');
        this.editorArea = document.getElementById('editor-area');
        this.canvas = document.getElementById('image-canvas');
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
        this.instructions = document.getElementById('instructions');
        this.loadingOverlay = document.getElementById('loading-overlay');
        
        // Controls
        this.toleranceSlider = document.getElementById('tolerance-slider');
        this.toleranceValue = document.getElementById('tolerance-value');
        this.undoBtn = document.getElementById('undo-btn');
        this.resetBtn = document.getElementById('reset-btn');
        this.downloadBtn = document.getElementById('download-btn');
        this.newImageBtn = document.getElementById('new-image-btn');
        this.zoomInBtn = document.getElementById('zoom-in');
        this.zoomOutBtn = document.getElementById('zoom-out');
        this.zoomLevel = document.getElementById('zoom-level');
        
        // State
        this.originalImageData = null;
        this.history = [];
        this.maxHistory = 20;
        this.zoom = 1;
        this.tolerance = 32;
        
        this.init();
    }
    
    init() {
        this.bindEvents();
    }
    
    bindEvents() {
        // Upload events
        this.uploadArea.addEventListener('click', () => this.fileInput.click());
        this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
        
        // Drag and drop
        this.uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.uploadArea.classList.add('drag-over');
        });
        
        this.uploadArea.addEventListener('dragleave', () => {
            this.uploadArea.classList.remove('drag-over');
        });
        
        this.uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            this.uploadArea.classList.remove('drag-over');
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                this.loadImage(files[0]);
            }
        });
        
        // Canvas click
        this.canvas.addEventListener('click', (e) => this.handleCanvasClick(e));
        
        // Controls
        this.toleranceSlider.addEventListener('input', (e) => {
            this.tolerance = parseInt(e.target.value);
            this.toleranceValue.textContent = this.tolerance;
        });
        
        this.undoBtn.addEventListener('click', () => this.undo());
        this.resetBtn.addEventListener('click', () => this.reset());
        this.downloadBtn.addEventListener('click', () => this.download());
        this.newImageBtn.addEventListener('click', () => this.newImage());
        
        // Zoom controls
        this.zoomInBtn.addEventListener('click', () => this.setZoom(this.zoom + 0.25));
        this.zoomOutBtn.addEventListener('click', () => this.setZoom(this.zoom - 0.25));
    }
    
    handleFileSelect(e) {
        const file = e.target.files[0];
        if (file) {
            this.loadImage(file);
        }
    }
    
    loadImage(file) {
        // Validate file type
        if (!file.type.startsWith('image/')) {
            alert('이미지 파일만 업로드할 수 있습니다.');
            return;
        }
        
        // Validate file size (10MB)
        if (file.size > 10 * 1024 * 1024) {
            alert('파일 크기는 10MB 이하여야 합니다.');
            return;
        }
        
        this.showLoading();
        
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                this.setupCanvas(img);
                this.showEditor();
                this.hideLoading();
            };
            img.onerror = () => {
                alert('이미지를 불러오는데 실패했습니다.');
                this.hideLoading();
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }
    
    setupCanvas(img) {
        // Set canvas dimensions
        this.canvas.width = img.width;
        this.canvas.height = img.height;
        
        // Draw image
        this.ctx.drawImage(img, 0, 0);
        
        // Store original image data
        this.originalImageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        
        // Reset state
        this.history = [];
        this.zoom = 1;
        this.updateUndoButton();
        this.updateZoomLevel();
    }
    
    showEditor() {
        this.uploadArea.classList.add('hidden');
        this.editorArea.classList.remove('hidden');
        this.instructions.classList.add('hidden');
    }
    
    showUploader() {
        this.uploadArea.classList.remove('hidden');
        this.editorArea.classList.add('hidden');
        this.instructions.classList.remove('hidden');
    }
    
    showLoading() {
        this.loadingOverlay.classList.remove('hidden');
    }
    
    hideLoading() {
        this.loadingOverlay.classList.add('hidden');
    }
    
    handleCanvasClick(e) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        
        const x = Math.floor((e.clientX - rect.left) * scaleX);
        const y = Math.floor((e.clientY - rect.top) * scaleY);
        
        // Validate coordinates
        if (x < 0 || x >= this.canvas.width || y < 0 || y >= this.canvas.height) {
            return;
        }
        
        this.showLoading();
        
        // Use setTimeout to allow UI to update before heavy computation
        setTimeout(() => {
            this.saveToHistory();
            this.floodFill(x, y);
            this.hideLoading();
        }, 10);
    }
    
    floodFill(startX, startY) {
        const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        const data = imageData.data;
        const width = this.canvas.width;
        const height = this.canvas.height;
        
        // Get the color at the clicked position
        const startIdx = (startY * width + startX) * 4;
        const targetR = data[startIdx];
        const targetG = data[startIdx + 1];
        const targetB = data[startIdx + 2];
        const targetA = data[startIdx + 3];
        
        // If already transparent, do nothing
        if (targetA === 0) {
            return;
        }
        
        const tolerance = this.tolerance;
        const visited = new Uint8Array(width * height);
        const stack = [[startX, startY]];
        
        // Color distance function
        const colorMatch = (idx) => {
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];
            const a = data[idx + 3];
            
            // Skip transparent pixels
            if (a === 0) return false;
            
            const diff = Math.abs(r - targetR) + Math.abs(g - targetG) + Math.abs(b - targetB);
            return diff <= tolerance * 3;
        };
        
        while (stack.length > 0) {
            const [x, y] = stack.pop();
            
            // Boundary check
            if (x < 0 || x >= width || y < 0 || y >= height) {
                continue;
            }
            
            const pixelIdx = y * width + x;
            
            // Skip if already visited
            if (visited[pixelIdx]) {
                continue;
            }
            
            const idx = pixelIdx * 4;
            
            // Check if color matches
            if (!colorMatch(idx)) {
                continue;
            }
            
            // Mark as visited
            visited[pixelIdx] = 1;
            
            // Make transparent
            data[idx + 3] = 0;
            
            // Add neighbors to stack
            stack.push([x + 1, y]);
            stack.push([x - 1, y]);
            stack.push([x, y + 1]);
            stack.push([x, y - 1]);
        }
        
        this.ctx.putImageData(imageData, 0, 0);
    }
    
    saveToHistory() {
        const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        this.history.push(imageData);
        
        // Limit history size
        if (this.history.length > this.maxHistory) {
            this.history.shift();
        }
        
        this.updateUndoButton();
    }
    
    undo() {
        if (this.history.length === 0) {
            return;
        }
        
        const imageData = this.history.pop();
        this.ctx.putImageData(imageData, 0, 0);
        this.updateUndoButton();
    }
    
    reset() {
        if (this.originalImageData) {
            this.ctx.putImageData(this.originalImageData, 0, 0);
            this.history = [];
            this.updateUndoButton();
        }
    }
    
    updateUndoButton() {
        this.undoBtn.disabled = this.history.length === 0;
    }
    
    setZoom(newZoom) {
        this.zoom = Math.max(0.25, Math.min(3, newZoom));
        this.canvas.style.transform = `scale(${this.zoom})`;
        this.updateZoomLevel();
    }
    
    updateZoomLevel() {
        this.zoomLevel.textContent = `${Math.round(this.zoom * 100)}%`;
    }
    
    download() {
        const link = document.createElement('a');
        link.download = 'background-removed.png';
        link.href = this.canvas.toDataURL('image/png');
        link.click();
    }
    
    newImage() {
        this.fileInput.value = '';
        this.originalImageData = null;
        this.history = [];
        this.zoom = 1;
        this.canvas.style.transform = 'scale(1)';
        this.showUploader();
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    new BackgroundEraser();
});
