const parser = new DOMParser();

const TRANSITION_MS = 550;
const TRANSITION_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';

window.runPageTransition = function (oldPage, newPage, slideUp) {
    if (!oldPage || !newPage) return Promise.resolve();
    void oldPage.offsetHeight;
    void newPage.offsetHeight;
    const style = `transform ${TRANSITION_MS}ms ${TRANSITION_EASING}`;
    oldPage.style.transition = style;
    newPage.style.transition = style;
    return new Promise(r => {
        requestAnimationFrame(() => {
            newPage.style.transform = 'translateY(0)';
            oldPage.style.transform = slideUp ? 'translateY(-100%)' : 'translateY(100%)';
            setTimeout(r, TRANSITION_MS);
        });
    });
};

let progressBar = null;
let progressTimeout = null;

const showProgress = () => {
    if (progressTimeout) clearTimeout(progressTimeout);
    progressBar?.remove();
    progressBar = null;
    progressTimeout = setTimeout(() => {
        progressBar = document.createElement('div');
        progressBar.className = 'route-progress';
        document.body.appendChild(progressBar);
        void progressBar.offsetWidth;
        progressBar.classList.add('route-progress--running');
    }, 25);
};

const DISSIPATE_MS = 220;

const completeProgress = () => {
    if (progressTimeout) clearTimeout(progressTimeout);
    progressBar?.classList.remove('route-progress--running');
    progressBar?.classList.add('route-progress--finishing');
    if (progressBar) {
        const bar = progressBar;
        progressBar = null;
        setTimeout(() => {
            bar.classList.add('route-progress--done');
            setTimeout(() => bar.remove(), 50);
        }, DISSIPATE_MS);
    }
};

const hideProgress = () => {
    if (progressTimeout) clearTimeout(progressTimeout);
    if (!progressBar) return;
    progressBar.classList.add('route-progress--done');
    const bar = progressBar;
    setTimeout(() => bar.remove(), 50);
    progressBar = null;
};

// Last-write-wins queue: new navigations while transitioning overwrite `pending`
// and are drained immediately when the current transition finishes.
let isTransitioning = false;
let pending = null;

const setTransitioning = v => {
    isTransitioning = v;
    if (!v) {
        const cbs = window.__onRouteSettled;
        window.__onRouteSettled = null;
        if (cbs) cbs.forEach(fn => fn());
    }
};

const drainPending = () => {
    if (!pending) return;
    const { path, pop } = pending;
    pending = null;
    Router(path, pop);
};

const Router = async (path, pop = false) => {
    if (isTransitioning) { pending = { path, pop }; return; }
    setTransitioning(true);
    let hasRoom = false;

    if (!pop) {
        const toHome = path.includes('home');
        hasRoom = !!window.__pendingRoom;
        const urlRoom = new URLSearchParams(location.search).get('room');

        if (toHome) {
            history.pushState({ loc: 'home.html' }, '', location.pathname);
        } else if (hasRoom) {
            const roomId = window.__pendingRoom;
            delete window.__pendingRoom;
            history.pushState({ loc: 'game.html', room: roomId }, '', `${location.pathname}?room=${roomId}`);
        } else if (urlRoom) {
            history.replaceState({ loc: 'game.html', room: urlRoom }, '', location.href);
        } else {
            history.pushState({ loc: path }, '', `${location.pathname}#${path}`);
        }
    }

    try {
        const oldPage = document.querySelector('.page');
        const isGamePath = path.includes('game');
        const isLobby = isGamePath && (hasRoom || !!new URLSearchParams(location.search).get('room'));
        const pageType = isLobby ? 'lobby' : (isGamePath ? 'game' : 'home');

        delete window.__pageReady;
        showProgress();

        const response = await fetch(path);
        if (!response.ok) throw new Error(`Failed to load ${path}`);

        const html = await response.text();
        const doc = parser.parseFromString(html, 'text/html');

        const newPage = document.createElement('div');
        newPage.className = `page ${pageType}`;

        const slideWrap = document.createElement('div');
        slideWrap.className = 'page-slide';
        while (doc.body.firstChild) slideWrap.appendChild(doc.body.firstChild);

        const overlay = slideWrap.querySelector('.info-dialog-overlay');
        if (overlay) overlay.remove();
        newPage.appendChild(slideWrap);
        if (overlay) newPage.appendChild(overlay);

        newPage.style.transition = 'none';
        if (oldPage) newPage.style.transform = isGamePath ? 'translateY(100%)' : 'translateY(-100%)';

        if (!oldPage) newPage.style.opacity = '0';

        document.body.appendChild(newPage);
        if (progressBar) document.body.appendChild(progressBar);

        for (const oldScript of [...newPage.querySelectorAll('script')]) {
            const script = document.createElement('script');
            if (oldScript.src) script.src = oldScript.src;
            else script.textContent = oldScript.textContent;
            if (oldScript.type) script.type = oldScript.type;
            document.body.appendChild(script);
            script.remove();
        }

        await Promise.race([
            new Promise(resolve => {
                const check = () => window.__pageReady ? resolve() : requestAnimationFrame(check);
                check();
            }),
            new Promise(resolve => setTimeout(resolve, 3000))
        ]);
        delete window.__pageReady;

        completeProgress();

        if (oldPage) {
            await window.runPageTransition(oldPage, newPage, isGamePath);

            if (oldPage.classList.contains('game') || oldPage.classList.contains('lobby')) {
                window.__disposeGame?.();
            }
            oldPage.remove();
        } else {
            void newPage.offsetHeight;
            newPage.style.transition = 'opacity 150ms ease-out';
            newPage.style.opacity = '1';
            setTimeout(() => { newPage.style.transition = ''; newPage.style.opacity = ''; }, 150);
        }


        newPage.style.transition = '';
        newPage.style.transform = '';
        hideProgress();
    } catch (err) {
        console.error('Router error:', err);
        hideProgress();
    } finally {
        setTransitioning(false);
        drainPending();
    }
};

window.addEventListener('popstate', e => {
    const urlRoom = new URLSearchParams(location.search).get('room');
    if (urlRoom) {
        history.replaceState({ loc: 'home.html' }, '', location.pathname);
        Router('home.html', true);
        return;
    }
    const loc = e.state?.loc || (location.hash ? location.hash.substring(1) : 'home.html');
    Router(loc, true);
});

window.Router = Router;
