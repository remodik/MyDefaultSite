let library;

export async function drawGraph(host, graph, active, open, options = {}) {
    const d3 = await (library ??= import('https://esm.sh/d3-force@3.0.0'));
    const { controls, onSelect, size } = options;
    const width = size?.width || 480;
    const height = size?.height || 300;
    const nodes = [...graph.nodes].sort((a, b) => Number(b.id === active) - Number(a.id === active)).slice(0, 500).map(node => ({ ...node }));
    const ids = new Set(nodes.map(node => node.id));
    const links = graph.edges.filter(e => ids.has(e.source) && ids.has(e.target)).map(e => ({ ...e }));
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('aria-label', 'Граф заметок');
    const element = (tag, attrs, parent = svg) => {
        const el = document.createElementNS(svg.namespaceURI, tag);
        for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
        parent.append(el);
        return el;
    };
    const viewport = element('g', {});
    const edgeLayer = element('g', {}, viewport);
    const nodeLayer = element('g', {}, viewport);
    const byId = new Map(nodes.map(node => [node.id, node]));
    const connections = new Map();
    for (const { source, target } of links) {
        if (!connections.has(source)) connections.set(source, { incoming: [], outgoing: [] });
        if (!connections.has(target)) connections.set(target, { incoming: [], outgoing: [] });
        connections.get(source).outgoing.push(byId.get(target));
        connections.get(target).incoming.push(byId.get(source));
    }
    const edgeIds = links.map(({ source, target }) => ({ source, target }));
    const radius = node => Math.min(15, 5 + Math.sqrt(node.degree || 0) * 2);
    const edges = links.map(e => element('line', { class: e.source === active || e.target === active ? 'active' : '' }, edgeLayer));
    const points = nodes.map(node => {
        const g = element('g', { class: node.id === active ? 'active' : node.unresolved ? 'unresolved' : '' }, nodeLayer);
        element('circle', { r: radius(node) }, g);
        element('title', {}, g).textContent = node.title;
        if (controls || nodes.length <= 24 || node.id === active) {
            element('text', { x: radius(node) + 5, y: 4 }, g).textContent = node.title.slice(0, 38);
        }
        if (onSelect || !node.unresolved) {
            g.setAttribute('tabindex', '0');
            g.setAttribute('role', 'button');
            g.setAttribute('aria-label', node.title);
            const activate = () => onSelect ? selectNode(node) : open(node.id);
            g.onclick = activate;
            g.onkeydown = e => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); }
            };
            if (onSelect && !node.unresolved) g.ondblclick = () => open(node.id);
        }
        return g;
    });
    function selectNode(node) {
        const related = connections.get(node.id) || { incoming: [], outgoing: [] };
        const neighbors = new Set([...related.incoming, ...related.outgoing].map(item => item.id));
        points.forEach((point, i) => {
            point.classList.toggle('selected', nodes[i] === node);
            point.classList.toggle('dimmed', nodes[i] !== node && !neighbors.has(nodes[i].id));
        });
        edges.forEach((edge, i) => {
            const linked = edgeIds[i].source === node.id || edgeIds[i].target === node.id;
            edge.classList.toggle('active', linked);
            edge.classList.toggle('dimmed', !linked);
        });
        onSelect(node, related, selectNode);
    }
    if (onSelect && byId.has(active)) selectNode(byId.get(active));

    const cleanupZoom = controls ? enableNavigation(svg, viewport, controls, width, height) : () => {};
    // Start near the center so the layout does not sweep across a large canvas.
    nodes.forEach((node, i) => {
        const angle = i * Math.PI * (3 - Math.sqrt(5));
        const distance = 10 * Math.sqrt(i);
        node.x = width / 2 + distance * Math.cos(angle);
        node.y = height / 2 + distance * Math.sin(angle);
    });
    const sim = d3.forceSimulation(nodes)
        .force('links', d3.forceLink(links).id(n => n.id).distance(controls ? 105 : 65))
        .force('charge', d3.forceManyBody().strength(-65))
        .force('collision', d3.forceCollide(n => radius(n) + 3))
        .force('x', d3.forceX(width / 2).strength(.07))
        .force('y', d3.forceY(height / 2).strength(.07));
    const paint = () => {
        nodes.forEach((n, i) => {
            n.x = Math.max(16, Math.min(width - 24, n.x));
            n.y = Math.max(16, Math.min(height - 16, n.y));
            points[i].setAttribute('transform', `translate(${n.x} ${n.y})`);
        });
        links.forEach(({ source, target }, i) => {
            for (const [k, v] of Object.entries({ x1: source.x, y1: source.y, x2: target.x, y2: target.y })) {
                edges[i].setAttribute(k, v);
            }
        });
    };
    sim.tick(30);
    paint();
    sim.on('tick', paint);
    host.replaceChildren(svg);
    if (graph.nodes.length > nodes.length) host.append('Показаны первые 500 заметок. Уточните фильтр.');
    return () => { cleanupZoom(); sim.stop(); };
}


function enableNavigation(svg, viewport, controls, width, height) {
    const lifecycle = new AbortController();
    const signal = lifecycle.signal;
    const pointers = new Map();
    let x = 0;
    let y = 0;
    let scale = 1;
    let dragged = false;

    const project = (event) => new DOMPoint(event.clientX, event.clientY)
        .matrixTransform(svg.getScreenCTM().inverse());

    function redraw() {
        viewport.setAttribute('transform', `translate(${x} ${y}) scale(${scale})`);
    }

    function zoom(factor, anchor, destination = anchor) {
        const next = Math.max(.35, Math.min(5, scale * factor));
        x = destination.x - (anchor.x - x) * next / scale;
        y = destination.y - (anchor.y - y) * next / scale;
        scale = next;
        redraw();
    }

    svg.addEventListener('wheel', event => {
        event.preventDefault();
        zoom(Math.exp(-event.deltaY * (event.deltaMode === 1 ? .05 : .002)), project(event));
    }, { passive: false, signal });

    svg.addEventListener('pointerdown', event => {
        if (event.button !== 0) return;
        if (!pointers.size) dragged = false;
        const point = project(event);
        pointers.set(event.pointerId, point);
    }, { signal });

    svg.addEventListener('pointermove', event => {
        const previous = pointers.get(event.pointerId);
        if (!previous) return;
        const point = project(event);
        const dx = point.x - previous.x;
        const dy = point.y - previous.y;
        if (!dragged && pointers.size === 1 && Math.hypot(dx, dy) < 5) return;
        dragged = true;
        if (!svg.hasPointerCapture(event.pointerId)) svg.setPointerCapture(event.pointerId);
        const other = [...pointers].find(([id]) => id !== event.pointerId)?.[1];
        pointers.set(event.pointerId, point);
        if (other) {
            const distance = Math.hypot(previous.x - other.x, previous.y - other.y);
            const next = Math.hypot(point.x - other.x, point.y - other.y);
            const midpoint = p => ({ x: (p.x + other.x) / 2, y: (p.y + other.y) / 2 });
            if (distance > 0) zoom(next / distance, midpoint(previous), midpoint(point));
        } else {
            x += dx;
            y += dy;
            redraw();
        }
    }, { signal });

    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture', 'pointerleave']) {
        svg.addEventListener(type, event => {
            if (type === 'pointerleave' && svg.hasPointerCapture(event.pointerId)) return;
            pointers.delete(event.pointerId);
        }, { signal });
    }
    for (const type of ['click', 'dblclick']) {
        svg.addEventListener(type, event => {
            if (dragged && event.detail !== 0) event.stopPropagation();
        }, { capture: true, signal });
    }
    controls.addEventListener('click', event => {
        const action = event.target.closest('button')?.dataset.zoom;
        const center = { x: width / 2, y: height / 2 };
        if (action === 'in') zoom(1.3, center);
        if (action === 'out') zoom(1 / 1.3, center);
        if (action === 'reset') {
            x = 0;
            y = 0;
            scale = 1;
            redraw();
        }
    }, { signal });

    return () => lifecycle.abort();
}
