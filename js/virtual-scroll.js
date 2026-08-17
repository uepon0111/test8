export class VirtualScroll {
  constructor(containerId, renderItem, itemHeight) {
    this.container = document.getElementById(containerId);
    this.content = this.container.querySelector('.vs-content');
    this.renderItem = renderItem;
    this.itemHeight = itemHeight;
    this.items = [];
    
    this.container.addEventListener('scroll', () => {
      requestAnimationFrame(() => this.render());
    });
    // ResizeObserverで高さ変更に対応
    new ResizeObserver(() => this.render()).observe(this.container);
  }
  
  setItems(items) {
    this.items = items;
    this.content.style.height = `${items.length * this.itemHeight}px`;
    this.render();
  }

  render() {
    const scrollTop = this.container.scrollTop;
    const viewportHeight = this.container.clientHeight;
    
    // Gridの場合は列数を考慮する拡張が必要だが、要件では一覧は高さ固定のリスト
    const startIndex = Math.max(0, Math.floor(scrollTop / this.itemHeight) - 2);
    const endIndex = Math.min(this.items.length - 1, Math.floor((scrollTop + viewportHeight) / this.itemHeight) + 2);
    
    this.content.innerHTML = '';
    for (let i = startIndex; i <= endIndex; i++) {
      const el = this.renderItem(this.items[i], i);
      el.style.top = `${i * this.itemHeight}px`;
      this.content.appendChild(el);
    }
    // アイコン再描画
    if (window.lucide) window.lucide.createIcons();
  }
}

