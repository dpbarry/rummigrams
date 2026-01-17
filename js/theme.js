export const themes = ['light', 'dark'];

export const toggleTheme = () => {
    document.body.classList.add('is-remodeling');
    const html = document.documentElement;
    const current = html.dataset.theme || 'light';
    const next = themes[(themes.indexOf(current) + 1) % themes.length];

    html.dataset.theme = next;
    localStorage.setItem('rummigrams-theme', next);

    requestAnimationFrame(() => {
        setTimeout(() => document.body.classList.remove('is-remodeling'), 50);
    });
};

export const initTheme = () => {
    const saved = localStorage.getItem('rummigrams-theme');
    if (saved && themes.includes(saved)) {
        document.documentElement.dataset.theme = saved;
    }
};
