const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (min, max) => Math.random() * (max - min) + min;
const easeOutQuart = t => 1 - Math.pow(1 - t, 4);
const easeOutExpo = t => t === 1 ? 1 : 1 - Math.pow(2, -10 * t);

class Particle {
    constructor(x, y, angle, speed, size, hue, sat, light) {
        this.x = x;
        this.y = y;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.size = size;
        this.baseSize = size;
        this.hue = hue;
        this.sat = sat;
        this.light = light;
        this.life = 1;
        this.decay = rand(0.028, 0.042);
        this.friction = rand(0.94, 0.97);
        this.wobble = rand(0, TAU);
        this.wobbleSpeed = rand(0.08, 0.15);
        this.wobbleAmp = rand(0.2, 0.5);
    }

    update() {
        this.wobble += this.wobbleSpeed;
        this.vx += Math.sin(this.wobble) * this.wobbleAmp * 0.08;
        this.vy += Math.cos(this.wobble) * this.wobbleAmp * 0.08;
        this.vx *= this.friction;
        this.vy *= this.friction;
        this.x += this.vx;
        this.y += this.vy;
        this.life -= this.decay;
        this.size = this.baseSize * easeOutQuart(this.life);
    }

    draw(ctx) {
        const alpha = easeOutExpo(this.life) * 0.45;
        ctx.beginPath();
        ctx.arc(this.x, this.y, Math.max(0.5, this.size), 0, TAU);
        ctx.fillStyle = `hsla(${this.hue}, ${this.sat}%, ${this.light}%, ${alpha})`;
        ctx.fill();
    }
}

class RippleWave {
    constructor(x, y, hue) {
        this.x = x;
        this.y = y;
        this.radius = 0;
        this.maxRadius = rand(32, 45);
        this.life = 1;
        this.speed = rand(1.8, 2.6);
        this.hue = hue;
        this.thickness = rand(0.8, 1.4);
    }

    update() {
        this.radius += this.speed * easeOutExpo(this.life);
        this.life -= 0.045;
        this.speed *= 0.96;
    }

    draw(ctx) {
        const alpha = easeOutQuart(this.life) * 0.2;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, TAU);
        ctx.strokeStyle = `hsla(${this.hue}, 60%, 72%, ${alpha})`;
        ctx.lineWidth = this.thickness * this.life;
        ctx.stroke();
    }
}

class RippleSystem {
    constructor() {
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.canvas.className = 'ripple-canvas';
        this.particles = [];
        this.waves = [];
        this.raf = null;
        this.grid = null;
        this.resizeObserver = new ResizeObserver(() => this.resize());
    }

    attach(grid) {
        this.grid = grid;
        grid.style.position = 'relative';
        grid.appendChild(this.canvas);
        this.resizeObserver.observe(grid);
        this.resize();
    }

    resize() {
        if (!this.grid) return;
        const rect = this.grid.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        this.canvas.style.width = rect.width + 'px';
        this.canvas.style.height = rect.height + 'px';
        this.ctx.scale(dpr, dpr);
        this.width = rect.width;
        this.height = rect.height;
    }

    emit(x, y) {
        const style = getComputedStyle(document.documentElement);
        const hue = parseInt(style.getPropertyValue('--accent-h')) || 260;
        const tileSize = parseFloat(style.getPropertyValue('--tile-size')) || 40;
        const spawnRadius = tileSize * 0.45;
        
        const particleCount = 8 + Math.floor(rand(0, 4));
        for (let i = 0; i < particleCount; i++) {
            const angle = rand(0, TAU);
            const px = x + Math.cos(angle) * spawnRadius;
            const py = y + Math.sin(angle) * spawnRadius;
            const speed = rand(1.5, 3.2);
            const size = rand(1.2, 2.8);
            const hueShift = rand(-12, 12);
            const sat = rand(50, 70);
            const light = rand(65, 80);
            this.particles.push(new Particle(px, py, angle, speed, size, hue + hueShift, sat, light));
        }

        this.waves.push(new RippleWave(x, y, hue));

        if (!this.raf) this.loop();
    }

    loop() {
        this.ctx.clearRect(0, 0, this.width, this.height);

        this.waves = this.waves.filter(w => {
            w.update();
            if (w.life > 0) { w.draw(this.ctx); return true; }
            return false;
        });

        this.particles = this.particles.filter(p => {
            p.update();
            if (p.life > 0) { p.draw(this.ctx); return true; }
            return false;
        });

        if (this.particles.length || this.waves.length) {
            this.raf = requestAnimationFrame(() => this.loop());
        } else {
            this.raf = null;
        }
    }

    destroy() {
        this.resizeObserver.disconnect();
        cancelAnimationFrame(this.raf);
        this.canvas.remove();
    }
}

export const rippleSystem = new RippleSystem();
