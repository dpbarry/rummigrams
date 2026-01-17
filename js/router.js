const parser = new DOMParser();

const Router = async (path, pop = false) => {
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
                // Going to Game: Content moves UP
                newPage.classList.add('slide-enter-from-bottom');
            } else {
                // Going Home: Content moves DOWN
                newPage.classList.add('slide-enter-from-top');
            }
        }

        document.body.appendChild(newPage);

        // Execute scripts immediately so they attach listeners
        newPage.querySelectorAll('script').forEach(oldScript => {
            const script = document.createElement('script');
            if (oldScript.src) script.src = oldScript.src;
            else script.textContent = oldScript.textContent;
            if (oldScript.type) script.type = oldScript.type;
            document.body.appendChild(script);
            script.remove(); // Clean up script tag
        });

        if (oldPage) {
            // Force reflow
            void newPage.offsetHeight;

            requestAnimationFrame(() => {
                if (isGame) {
                    // Move Stack UP
                    newPage.classList.remove('slide-enter-from-bottom');
                    newPage.classList.add('slide-center');

                    // Old (Home) goes UP out of view
                    oldPage.classList.add('slide-exit-to-top');
                } else {
                    // Move Stack DOWN
                    newPage.classList.remove('slide-enter-from-top');
                    newPage.classList.add('slide-center');

                    // Old (Game) goes DOWN out of view
                    oldPage.classList.add('slide-exit-to-bottom');
                }

                setTimeout(() => {
                    oldPage.remove();
                    // Ensure final state is clean
                    newPage.classList.remove('slide-center');
                }, 600); // 600ms match CSS
            });
        }

    } catch (err) {
        console.error('Router error:', err);
    }
};

window.addEventListener("popstate", e => {
    Router(e.state?.loc || 'home.html', true);
});

window.Router = Router;
