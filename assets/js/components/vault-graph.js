let library;

export async function drawGraph(host, graph, active, open) {
    const d3 = await (library ??= import('https://esm.sh/d3-force@3.0.0'));
    const nodes = graph.nodes.slice(0, 500).map(node => ({ ...node }));
    const ids = new Set(nodes.map(node => node.id));
    const links = graph.edges.filter(e => ids.has(e.source) && ids.has(e.target)).map(e => ({ ...e }));
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 480 300');
    svg.setAttribute('aria-label', 'Граф заметок');
    const element = (tag, attrs, parent = svg) => {
        const el = document.createElementNS(svg.namespaceURI, tag);
        for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
        parent.append(el);
        return el;
    };
    const radius = node => Math.min(15, 5 + Math.sqrt(node.degree || 0) * 2);
    const edges = links.map(e => element('line', { class: e.source === active || e.target === active ? 'active' : '' }));
    const points = nodes.map(node => {
        const g = element('g', { class: node.id === active ? 'active' : node.unresolved ? 'unresolved' : '' });
        element('circle', { r: radius(node) }, g);
        element('title', {}, g).textContent = node.title;
        if (nodes.length <= 24 || node.id === active) {
            element('text', { x: radius(node) + 4, y: 4 }, g).textContent = node.title.slice(0, 32);
        }
        if (!node.unresolved) {
            g.setAttribute('tabindex', '0');
            g.setAttribute('role', 'button');
            g.setAttribute('aria-label', node.title);
            g.onclick = () => open(node.id);
            g.onkeydown = e => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(node.id); }
            };
        }
        return g;
    });
    const sim = d3.forceSimulation(nodes)
        .force('links', d3.forceLink(links).id(n => n.id).distance(65))
        .force('charge', d3.forceManyBody().strength(-65))
        .force('collision', d3.forceCollide(n => radius(n) + 3))
        .force('x', d3.forceX(240).strength(.07))
        .force('y', d3.forceY(150).strength(.07));
    sim.on('tick', () => {
        nodes.forEach((n, i) => {
            n.x = Math.max(16, Math.min(464, n.x));
            n.y = Math.max(16, Math.min(284, n.y));
            points[i].setAttribute('transform', `translate(${n.x} ${n.y})`);
        });
        links.forEach(({ source, target }, i) => {
            for (const [k, v] of Object.entries({ x1: source.x, y1: source.y, x2: target.x, y2: target.y })) {
                edges[i].setAttribute(k, v);
            }
        });
    });
    host.replaceChildren(svg);
    if (graph.nodes.length > nodes.length) host.append('Показаны первые 500 заметок. Уточните фильтр.');
    return () => sim.stop();
}
