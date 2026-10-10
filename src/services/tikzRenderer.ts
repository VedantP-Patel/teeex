/**
 * Teeex Studio — Pure Deterministic TikZ to SVG Vector Graphics Engine
 * Translates standard \begin{tikzpicture} environments into pixel-perfect,
 * crisp, scalable SVG vector elements without external cloud dependencies.
 */

interface TikzNode {
  id: string;
  x: number;
  y: number;
  label: string;
  isBox: boolean;
  isCircle: boolean;
  fillColor?: string;
  strokeColor?: string;
}

export function renderTikzToSvg(tikzCode: string): string {
  if (!tikzCode || !tikzCode.trim()) return '';

  const clean = tikzCode.trim();
  const scaleMatch = clean.match(/scale\s*=\s*([0-9.]+)/);
  const userScale = scaleMatch ? parseFloat(scaleMatch[1]) : 1;
  const unitPx = 36 * userScale;

  const nodes = new Map<string, TikzNode>();
  const svgElements: string[] = [];

  let minX = -1;
  let maxX = 5;
  let minY = -1;
  let maxY = 5;

  const trackBounds = (x: number, y: number) => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };

  const parseCoord = (coordStr: string): [number, number] | null => {
    const trimmed = coordStr.trim();
    if (nodes.has(trimmed)) {
      const n = nodes.get(trimmed)!;
      return [n.x, n.y];
    }
    const m = trimmed.match(/\(?\s*(-?[0-9.]+)\s*,\s*(-?[0-9.]+)\s*\)?/);
    if (m) {
      const x = parseFloat(m[1]);
      const y = parseFloat(m[2]);
      trackBounds(x, y);
      return [x, y];
    }
    return null;
  };

  const parseColor = (opts: string, defaultColor = '#38bdf8'): string => {
    if (opts.includes('red')) return '#f43f5e';
    if (opts.includes('blue')) return '#38bdf8';
    if (opts.includes('green')) return '#10b981';
    if (opts.includes('yellow') || opts.includes('orange')) return '#f59e0b';
    if (opts.includes('purple')) return '#a855f7';
    if (opts.includes('white')) return '#ffffff';
    if (opts.includes('black')) return 'var(--text-primary)';
    if (opts.includes('gray') || opts.includes('grey')) return '#64748b';
    return defaultColor;
  };

  const parseStrokeWidth = (opts: string): number => {
    if (opts.includes('very thick')) return 3;
    if (opts.includes('thick')) return 2;
    if (opts.includes('thin')) return 1;
    if (opts.includes('very thin')) return 0.5;
    return 1.5;
  };

  // Strip comments and split by semicolon (TikZ statements end in ;)
  const lines = clean
    .split('\n')
    .map(l => l.replace(/%.*$/, '').trim())
    .join(' ')
    .split(';')
    .map(s => s.trim())
    .filter(Boolean);

  for (const stmt of lines) {
    // 1. Parse \node statements: \node[options] (name)? at (x,y) {label}
    const nodeMatch = stmt.match(/\\node(?:\s*\[(.*?)\])?(?:\s*\(([a-zA-Z0-9_-]+)\))?\s*(?:at\s*(\([^)]+\)))?(?:\s*\(([a-zA-Z0-9_-]+)\))?\s*\{([^}]*)\}/);
    if (nodeMatch) {
      const opts = nodeMatch[1] || '';
      const name = nodeMatch[2] || nodeMatch[4] || `node_${nodes.size}`;
      const coordRaw = nodeMatch[3] || '(0,0)';
      const label = nodeMatch[5] || '';

      const coord = parseCoord(coordRaw);
      if (coord) {
        const [x, y] = coord;
        const isBox = opts.includes('rectangle') || opts.includes('draw');
        const isCircle = opts.includes('circle');
        const strokeColor = opts.includes('draw') ? parseColor(opts, '#38bdf8') : undefined;
        const fillColor = opts.includes('fill') ? parseColor(opts, 'rgba(56, 189, 248, 0.15)') : undefined;

        nodes.set(name, { id: name, x, y, label, isBox, isCircle, fillColor, strokeColor });
      }
      continue;
    }

    // 2. Parse \draw or \fill statements
    if (stmt.startsWith('\\draw') || stmt.startsWith('\\fill')) {
      const isFillOnly = stmt.startsWith('\\fill');
      const optMatch = stmt.match(/\\(?:draw|fill)(?:\s*\[(.*?)\])?/);
      const opts = optMatch?.[1] || '';
      const color = parseColor(opts, isFillOnly ? 'rgba(56, 189, 248, 0.2)' : '#38bdf8');
      const strokeW = parseStrokeWidth(opts);
      const hasArrow = opts.includes('->') || opts.includes('-latex') || opts.includes('-stealth');
      const isDashed = opts.includes('dashed');

      // 2a. Circle: (x,y) circle (radius)
      const circleMatch = stmt.match(/(\([^)]+\))\s*circle\s*(?:\(([^)]+)\)|\{([^}]+)\})/);
      if (circleMatch) {
        const c = parseCoord(circleMatch[1]);
        const rVal = parseFloat(circleMatch[2] || circleMatch[3] || '1');
        if (c) {
          const [cx, cy] = c;
          trackBounds(cx - rVal, cy - rVal);
          trackBounds(cx + rVal, cy + rVal);
          svgElements.push(
            `<circle cx="{{X:${cx}}}" cy="{{Y:${cy}}}" r="${rVal * unitPx}" fill="${isFillOnly ? color : 'none'}" stroke="${color}" stroke-width="${strokeW}" ${isDashed ? 'stroke-dasharray="4,4"' : ''} />`
          );
        }
        continue;
      }

      // 2b. Rectangle: (x1,y1) rectangle (x2,y2)
      const rectMatch = stmt.match(/(\([^)]+\))\s*rectangle\s*(\([^)]+\))/);
      if (rectMatch) {
        const c1 = parseCoord(rectMatch[1]);
        const c2 = parseCoord(rectMatch[2]);
        if (c1 && c2) {
          const rx = Math.min(c1[0], c2[0]);
          const ry = Math.max(c1[1], c2[1]);
          const rw = Math.abs(c2[0] - c1[0]);
          const rh = Math.abs(c2[1] - c1[1]);
          svgElements.push(
            `<rect x="{{X:${rx}}}" y="{{Y:${ry}}}" width="${rw * unitPx}" height="${rh * unitPx}" fill="${isFillOnly ? color : 'rgba(56, 189, 248, 0.08)'}" stroke="${color}" stroke-width="${strokeW}" rx="3" ${isDashed ? 'stroke-dasharray="4,4"' : ''} />`
          );
        }
        continue;
      }

      // 2c. Multi-point path / lines: (x1,y1) -- (x2,y2) ...
      const points = [...stmt.matchAll(/(?:\(([a-zA-Z0-9_.-]+)\s*,?\s*([a-zA-Z0-9_.-]*)\)|([a-zA-Z0-9_-]+))/g)]
        .map(m => {
          if (m[3] && nodes.has(m[3])) {
            const n = nodes.get(m[3])!;
            return [n.x, n.y] as [number, number];
          }
          if (m[1] && m[2]) {
            return parseCoord(`(${m[1]},${m[2]})`);
          }
          return null;
        })
        .filter((p): p is [number, number] => p !== null);

      if (points.length >= 2) {
        let pathD = `M {{X:${points[0][0]}}} {{Y:${points[0][1]}}}`;
        for (let i = 1; i < points.length; i++) {
          pathD += ` L {{X:${points[i][0]}}} {{Y:${points[i][1]}}}`;
        }
        const marker = hasArrow ? 'marker-end="url(#tikz-arrowhead)"' : '';
        svgElements.push(
          `<path d="${pathD}" fill="none" stroke="${color}" stroke-width="${strokeW}" ${isDashed ? 'stroke-dasharray="4,4"' : ''} ${marker} stroke-linecap="round" stroke-linejoin="round" />`
        );
      }
    }
  }

  // Render Nodes
  nodes.forEach(n => {
    if (n.isBox) {
      svgElements.push(
        `<rect x="{{X:${n.x - 0.7}}}" y="{{Y:${n.y + 0.35}}}" width="${1.4 * unitPx}" height="${0.7 * unitPx}" fill="${n.fillColor || 'var(--bg-surface-1)'}" stroke="${n.strokeColor || '#38bdf8'}" stroke-width="1.5" rx="4" />`
      );
    } else if (n.isCircle) {
      svgElements.push(
        `<circle cx="{{X:${n.x}}}" cy="{{Y:${n.y}}}" r="${0.45 * unitPx}" fill="${n.fillColor || 'var(--bg-surface-1)'}" stroke="${n.strokeColor || '#38bdf8'}" stroke-width="1.5" />`
      );
    }

    if (n.label) {
      const cleanLabel = n.label.replace(/\$|\{|\}/g, '');
      svgElements.push(
        `<text x="{{X:${n.x}}}" y="{{Y:${n.y}}}" fill="var(--text-primary)" font-size="11" font-family="var(--font-mono)" font-weight="600" text-anchor="middle" dominant-baseline="central">${cleanLabel}</text>`
      );
    }
  });

  // Calculate SVG ViewBox and Coordinates
  const pad = 0.8;
  const boundMinX = minX - pad;
  const boundMaxX = maxX + pad;
  const boundMinY = minY - pad;
  const boundMaxY = maxY + pad;

  const totalW = Math.max(120, (boundMaxX - boundMinX) * unitPx);
  const totalH = Math.max(90, (boundMaxY - boundMinY) * unitPx);

  const toSvgX = (x: number) => ((x - boundMinX) * unitPx).toFixed(1);
  const toSvgY = (y: number) => (((boundMaxY - y) * unitPx)).toFixed(1);

  let svgContent = svgElements.join('\n');
  svgContent = svgContent.replace(/\{\{X:(-?[0-9.]+)\}\}/g, (_, v) => toSvgX(parseFloat(v)));
  svgContent = svgContent.replace(/\{\{Y:(-?[0-9.]+)\}\}/g, (_, v) => toSvgY(parseFloat(v)));

  return `
    <div class="latex-tikz-wrapper" style="display: flex; flex-direction: column; align-items: center; margin: 16px 0; overflow-x: auto;">
      <svg
        viewBox="0 0 ${totalW.toFixed(0)} ${totalH.toFixed(0)}"
        width="${Math.min(520, totalW).toFixed(0)}"
        height="${Math.min(360, totalH).toFixed(0)}"
        style="max-width: 100%; height: auto; background-color: var(--bg-surface-0); border: 1px solid var(--border-subtle); border-radius: 6px; box-shadow: 0 2px 8px rgba(0,0,0,0.18);"
      >
        <defs>
          <marker id="tikz-arrowhead" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#38bdf8" />
          </marker>
        </defs>
        ${svgContent}
      </svg>
      <div style="font-size: 10px; color: var(--text-muted); font-family: var(--font-mono); margin-top: 4px; display: flex; align-items: center; gap: 4px;">
        <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background-color: #38bdf8;"></span>
        TikZ Vector Diagram (Physical SVG Render)
      </div>
    </div>
  `.trim();
}
