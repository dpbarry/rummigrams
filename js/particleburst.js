const TAU = Math.PI * 2;
const rand = (min, max) => Math.random() * (max - min) + min;

const hslToRgb = (h, s, l) => {
    h = ((h % 360) + 360) % 360;
    s /= 100; l /= 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = l - c / 2;
    let r, g, b;
    if (h < 60) { r = c; g = x; b = 0; }
    else if (h < 120) { r = x; g = c; b = 0; }
    else if (h < 180) { r = 0; g = c; b = x; }
    else if (h < 240) { r = 0; g = x; b = c; }
    else if (h < 300) { r = x; g = 0; b = c; }
    else { r = c; g = 0; b = x; }
    return [(r + m) * 255 | 0, (g + m) * 255 | 0, (b + m) * 255 | 0];
};

class Particle {
    constructor(x, y, angle, speed, size, r, g, b) {
        this.x = x;
        this.y = y;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.size = size;
        this.baseSize = size;
        this.r = r; this.g = g; this.b = b;
        this.life = 1;
        this.decay = rand(0.06, 0.07);
        this.friction = rand(0.92, 0.97);
        this.wobble = rand(0, TAU);
        this.wobbleSpeed = rand(0.08, 0.15);
        this.wobbleAmp = rand(0.2, 0.5);
    }

    update(scale) {
        this.wobble += this.wobbleSpeed * scale;
        this.vx += Math.sin(this.wobble) * this.wobbleAmp * 0.08;
        this.vy += Math.cos(this.wobble) * this.wobbleAmp * 0.08;
        const f = 1 - (1 - this.friction) * scale;
        this.vx *= f;
        this.vy *= f;
        this.x += this.vx * scale;
        this.y += this.vy * scale;
        this.life -= this.decay * scale;
        const t = Math.max(0, this.life);
        this.size = this.baseSize * (1 - (1 - t) * (1 - t) * (1 - t) * (1 - t));
    }
}

class ParticleBurstSystem {
    constructor() {
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.canvas.className = 'particle-burst-canvas';
        this.particles = [];
        this.raf = null;
        this.grid = null;
        this.lastTime = 0;
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
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.width = rect.width;
        this.height = rect.height;
    }

    emit(x, y) {
        const style = getComputedStyle(document.documentElement);
        const hue = parseInt(style.getPropertyValue('--accent-h')) || 260;
        const tileSize = parseFloat(style.getPropertyValue('--tile-size')) || 40;
        const spawnRadius = tileSize * 0.45;

        const count = 8 + (Math.random() * 4 | 0);
        for (let i = 0; i < count; i++) {
            const angle = rand(0, TAU);
            const [r, g, b] = hslToRgb(hue + rand(-12, 12), rand(50, 70), rand(65, 80));
            this.particles.push(new Particle(
                x + Math.cos(angle) * spawnRadius,
                y + Math.sin(angle) * spawnRadius,
                angle, rand(1.5, 3.2), rand(1.2, 2.8), r, g, b
            ));
        }

        if (!this.raf) {
            this.lastTime = performance.now();
            this.raf = requestAnimationFrame(t => this.loop(t));
        }
    }

    loop(now) {
        const dt = now - this.lastTime;
        this.lastTime = now;
        const scale = Math.min(dt / 16.67, 3);
        const ctx = this.ctx;

        ctx.clearRect(0, 0, this.width, this.height);

        let i = this.particles.length;
        while (i--) {
            const p = this.particles[i];
            p.update(scale);
            if (p.life <= 0 || p.size < 0.5) { this.particles.splice(i, 1); continue; }
            const alpha = (1 - Math.pow(2, -10 * p.life)) * 0.45;
            ctx.beginPath();
            ctx.arc(p.x, p.y, Math.max(0.5, p.size), 0, TAU);
            ctx.fillStyle = `rgba(${p.r},${p.g},${p.b},${alpha})`;
            ctx.fill();
        }

        if (this.particles.length) {
            this.raf = requestAnimationFrame(t => this.loop(t));
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

export const particleBurstSystem = new ParticleBurstSystem();
