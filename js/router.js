const parser = new DOMParser();
let isTransitioning = false;

const Router = async (path, pop = false) => {
    if (isTransitioning) return;
    isTransitioning = true;

    if (!pop) history.pushState({ loc: path }, "", "#" + path);

    try {
        const response = await fetch(path);
        if (!response.ok) throw new Error(`Failed to load ${path}`);

        const html = await response.text();
        const doc = parser.parseFromString(html, 'text/html');

        const newPage = document.createElement('div');
        newPage.className = `page ${path.includes('game') ? 'game' : 'home'}`;

        while (doc.body.firstChild) {
            newPage.appendChild(doc.body.firstChild);
        }

        const oldPage = document.querySelector('.page');
        const isGame = path.includes('game');

        if (oldPage) {
            if (isGame) {
                newPage.classList.add('slide-enter-from-bottom');
            } else {
                newPage.classList.add('slide-enter-from-top');
            }
        }

        document.body.appendChild(newPage);

        newPage.querySelectorAll('script').forEach(oldScript => {
            const script = document.createElement('script');
            if (oldScript.src) script.src = oldScript.src;
            else script.textContent = oldScript.textContent;
            if (oldScript.type) script.type = oldScript.type;
            document.body.appendChild(script);
            script.remove();
        });

        await new Promise(resolve => {
            const check = () => window.__pageReady ? resolve() : requestAnimationFrame(check);
            check();
        });
        delete window.__pageReady;

        if (oldPage) {
            void newPage.offsetHeight;

            requestAnimationFrame(() => {
                if (isGame) {
                    newPage.classList.remove('slide-enter-from-bottom');
                    newPage.classList.add('slide-center');
                    oldPage.classList.add('slide-exit-to-top');
                } else {
                    newPage.classList.remove('slide-enter-from-top');
                    newPage.classList.add('slide-center');
                    oldPage.classList.add('slide-exit-to-bottom');
                }

                setTimeout(() => {
                    oldPage.remove();
                    newPage.classList.remove('slide-center');
                    isTransitioning = false;
                }, 600);
            });
        } else {
            isTransitioning = false;
        }

    } catch (err) {
        console.error('Router error:', err);
        isTransitioning = false;
    }
};

window.addEventListener("popstate", e => {
    Router(e.state?.loc || 'home.html', true);
});

window.Router = Router;

