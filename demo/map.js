// The live store map: racks, aisles, the robot, its trail, the target shelf and the shelf-tag light.
// Used by the stage screen (index.html) and the phone page (phone.html).
(function () {
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs = {}, text) => {
    const node = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (text != null) node.textContent = text;
    return node;
  };

  class StoreMap {
    // options.compact: phone-sized (no small labels)
    constructor(svg, layout, options = {}) {
      this.svg = svg;
      this.L = layout;
      this.compact = !!options.compact;
      this.trail = [];
      svg.setAttribute('viewBox', `-1 ${this.compact ? -1 : -2.2} ${layout.width + 2} ${layout.depth + (this.compact ? 2 : 3.2)}`);
      svg.innerHTML = '';
      const Y = (y) => layout.depth - y;                       // the map's y points to the back of the store
      this.Y = Y;
      const rect = (x0, y0, x1, y1, cls, rx = 0.15) =>
        el('rect', { x: x0, y: Y(y1), width: x1 - x0, height: y1 - y0, class: cls, rx });

      svg.append(rect(0, 0, layout.width, layout.depth, 'm-floor', 0.4));
      for (const [x0, y0, x1, y1] of layout.racks) svg.append(rect(x0, y0, x1, y1, 'm-rack'));
      for (const o of layout.obstacles) {
        svg.append(rect(o.x0, o.y0, o.x1, o.y1, o.label === 'kiosk' ? 'm-kiosk' : 'm-front'));
        if (!this.compact && !o.label.startsWith('register'))
          svg.append(el('text', { x: (o.x0 + o.x1) / 2, y: o.label === 'kiosk' ? Y(o.y1) - 0.35 : Y(o.y0) + 1.0, class: 'm-small' }, o.label));
      }
      if (!this.compact) svg.append(el('text', { x: 31.5, y: Y(1.0), class: 'm-small' }, 'registers'));
      svg.append(el('line', { x1: layout.entrance[0], y1: Y(0), x2: layout.entrance[1], y2: Y(0), class: 'm-door' }));
      svg.append(el('text', { x: (layout.entrance[0] + layout.entrance[1]) / 2, y: Y(0.45), class: 'm-small' }, 'entrance'));
      for (const a of layout.aisles) {
        svg.append(el('text', { x: a.x, y: Y(layout.rack_y[3]) - 1.2, class: 'm-aisle' }, a.number));
        if (!this.compact) {
          // department name under the aisle number, wrapped to short lines
          const lines = [];
          for (const word of a.name.split(' ')) {
            if (lines.length && (lines[lines.length - 1] + ' ' + word).length <= 9) lines[lines.length - 1] += ' ' + word;
            else lines.push(word);
          }
          lines.forEach((w, i) => svg.append(el('text', { x: a.x, y: Y(layout.rack_y[3]) - 1.2 - 1.9 - (lines.length - 1 - i) * 0.78, class: 'm-dept' }, w)));
        }
      }
      // dock
      svg.append(el('circle', { cx: layout.dock.x, cy: Y(layout.dock.y), r: 0.8, class: 'm-dock' }));
      if (!this.compact) svg.append(el('text', { x: layout.dock.x - 0.4, y: Y(layout.dock.y) - 1.15, class: 'm-small m-dock-label' }, 'robot dock'));

      this.nearRing = el('circle', { r: layout.near_m, class: 'm-near', visibility: 'hidden' });
      this.trailLine = el('polyline', { class: 'm-trail', points: '' });
      this.target = el('g', { visibility: 'hidden' });
      this.target.append(el('circle', { r: 1.6, class: 'm-light-glow' }), el('circle', { r: 0.55, class: 'm-light' }));
      this.robot = el('g', { class: 'm-robot' });
      this.robot.append(el('circle', { r: this.compact ? 1.1 : 0.75, class: 'm-robot-body' }),
        el('path', { d: this.compact ? 'M 1.9 0 L 0.6 -0.8 L 0.6 0.8 Z' : 'M 1.35 0 L 0.45 -0.55 L 0.45 0.55 Z', class: 'm-robot-nose' }));
      svg.append(this.nearRing, this.trailLine, this.target, this.robot);
    }

    // status = the robot service's GET /tour/status
    update(status) {
      const Y = this.Y;
      if (status.pose) {
        const { x, y, yaw } = status.pose;
        if (!this._placed) { this.robot.style.transition = 'none'; this._placed = true; } else this.robot.style.transition = '';
        this.robot.setAttribute('transform', `translate(${x} ${Y(y)}) rotate(${-yaw * 180 / Math.PI})`);
        const last = this.trail[this.trail.length - 1];
        if (!last || Math.hypot(last[0] - x, last[1] - y) > 0.25) {
          this.trail.push([x, y]);
          if (this.trail.length > 600) this.trail.shift();
          this.trailLine.setAttribute('points', this.trail.map(([a, b]) => `${a},${Y(b)}`).join(' '));
        }
      }
      const item = status.current_item;
      if (item) {
        const on = (status.lights_on || []).includes(item.tag_code);
        this.target.setAttribute('visibility', 'visible');
        this.target.setAttribute('transform', `translate(${item.light_x} ${Y(item.light_y)})`);
        this.target.setAttribute('class', on ? 'm-target on' : 'm-target');
        this.nearRing.setAttribute('visibility', status.state === 'navigating' && !on ? 'visible' : 'hidden');
        this.nearRing.setAttribute('cx', item.x);
        this.nearRing.setAttribute('cy', Y(item.y));
      } else {
        this.target.setAttribute('visibility', 'hidden');
        this.nearRing.setAttribute('visibility', 'hidden');
      }
      if (status.state === 'done' || status.state === 'idle' && !item) this.clearTrailSoon();
    }

    clearTrailSoon() {
      if (this.trail.length > 1 && !this._clearing) {
        this._clearing = setTimeout(() => { this.trail = []; this.trailLine.setAttribute('points', ''); this._clearing = null; }, 4000);
      }
    }
  }

  window.StoreMap = StoreMap;
})();
