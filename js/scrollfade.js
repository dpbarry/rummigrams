export const initScrollFade = (scrollEl) => {
    if (!scrollEl) return null;

    const wrapper = document.createElement('div');
    wrapper.className = 'scroll-fade-wrap';
    scrollEl.parentNode.insertBefore(wrapper, scrollEl);
    wrapper.appendChild(scrollEl);

    const topFade = document.createElement('div');
    topFade.className = 'scroll-fade scroll-fade--top';
    const bottomFade = document.createElement('div');
    bottomFade.className = 'scroll-fade scroll-fade--bottom';
    wrapper.appendChild(topFade);
    wrapper.appendChild(bottomFade);

    const update = () => {
        const style = getComputedStyle(scrollEl);
        const padTop = parseFloat(style.paddingTop) + 10 || 10;
        const padBottom = parseFloat(style.paddingBottom) + 10 || 10;
        const hasScroll = scrollEl.scrollHeight > scrollEl.clientHeight;
        const atTop = scrollEl.scrollTop <= padTop;
        const atBottom = scrollEl.scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - padBottom;
        topFade.classList.toggle('visible', hasScroll && !atTop);
        bottomFade.classList.toggle('visible', hasScroll && !atBottom);
    };

    const ro = new ResizeObserver(update);
    ro.observe(scrollEl);
    const mo = new MutationObserver(update);
    mo.observe(scrollEl, { childList: true, subtree: true });
    scrollEl.addEventListener('scroll', update, { passive: true });
    update();

    return () => {
        ro.disconnect();
        mo.disconnect();
        scrollEl.removeEventListener('scroll', update);
        wrapper.parentNode.insertBefore(scrollEl, wrapper);
        wrapper.remove();
    };
};
