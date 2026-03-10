export const initScrollFade = (scrollEl, options = {}) => {
    if (!scrollEl) return null;
    const axis = options.axis === 'x' ? 'x' : 'y';

    const wrapper = document.createElement('div');
    wrapper.className = axis === 'x' ? 'scroll-fade-wrap scroll-fade-wrap--x' : 'scroll-fade-wrap';
    scrollEl.parentNode.insertBefore(wrapper, scrollEl);
    wrapper.appendChild(scrollEl);

    const topFade = document.createElement('div');
    topFade.className = 'scroll-fade scroll-fade--top';
    const bottomFade = document.createElement('div');
    bottomFade.className = 'scroll-fade scroll-fade--bottom';
    const leftFade = document.createElement('div');
    leftFade.className = 'scroll-fade scroll-fade--left';
    const rightFade = document.createElement('div');
    rightFade.className = 'scroll-fade scroll-fade--right';
    wrapper.appendChild(topFade);
    wrapper.appendChild(bottomFade);
    wrapper.appendChild(leftFade);
    wrapper.appendChild(rightFade);

    const update = () => {
        const pad = 4;
        if (axis === 'y') {
            const style = getComputedStyle(scrollEl);
            const padTop = (parseFloat(style.paddingTop) || 0) + pad;
            const padBottom = (parseFloat(style.paddingBottom) || 0) + pad;
            const hasScroll = scrollEl.scrollHeight > scrollEl.clientHeight + 1;
            const atTop = scrollEl.scrollTop <= padTop;
            const atBottom = scrollEl.scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - padBottom;
            topFade.classList.toggle('visible', hasScroll && !atTop);
            bottomFade.classList.toggle('visible', hasScroll && !atBottom);
            leftFade.classList.remove('visible');
            rightFade.classList.remove('visible');
        } else {
            const hasScroll = scrollEl.scrollWidth > scrollEl.clientWidth + 1;
            const atLeft = scrollEl.scrollLeft <= pad;
            const atRight = scrollEl.scrollLeft + scrollEl.clientWidth >= scrollEl.scrollWidth - pad;
            leftFade.classList.toggle('visible', hasScroll && !atLeft);
            rightFade.classList.toggle('visible', hasScroll && !atRight);
            topFade.classList.remove('visible');
            bottomFade.classList.remove('visible');
        }
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
