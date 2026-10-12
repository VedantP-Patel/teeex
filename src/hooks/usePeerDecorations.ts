import { StateEffect, StateField } from '@codemirror/state';
import { Decoration, type DecorationSet, WidgetType, EditorView } from '@codemirror/view';
import type { Collaborator } from '../types/latex';

export const setPeersEffect = StateEffect.define<Collaborator[]>();

class PeerCursorWidget extends WidgetType {
  name: string;
  color: string;

  constructor(name: string, color: string) {
    super();
    this.name = name;
    this.color = color;
  }

  toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'cm-peer-cursor';
    span.style.borderLeft = `2px solid ${this.color}`;
    span.style.marginLeft = '-1px';
    span.style.marginRight = '-1px';
    span.style.position = 'relative';
    span.style.display = 'inline-block';
    span.style.height = '1.25em';
    span.style.verticalAlign = 'text-bottom';
    span.style.pointerEvents = 'none';

    const label = document.createElement('span');
    label.className = 'cm-peer-label';
    label.textContent = this.name;
    label.style.position = 'absolute';
    label.style.top = '-1.35em';
    label.style.left = '-1px';
    label.style.backgroundColor = this.color;
    label.style.color = '#ffffff';
    label.style.fontSize = '10px';
    label.style.fontWeight = '600';
    label.style.lineHeight = '1';
    label.style.padding = '2px 5px';
    label.style.borderRadius = '3px';
    label.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
    label.style.whiteSpace = 'nowrap';
    label.style.pointerEvents = 'none';
    label.style.zIndex = '20';

    span.appendChild(label);
    return span;
  }

  eq(other: PeerCursorWidget): boolean {
    return other.name === this.name && other.color === this.color;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

/**
 * StateField that manages real-time peer collaborator cursor flags on the CodeMirror 6 canvas.
 */
export const peerDecorationsField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(decorations, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setPeersEffect)) {
        const peers = effect.value;
        const widgets: { from: number; widget: Decoration }[] = [];

        for (const peer of peers) {
          if (peer.isSelf) continue;

          const targetLine = Math.max(1, Math.min(peer.cursorLine || 1, tr.state.doc.lines));
          const lineInfo = tr.state.doc.line(targetLine);
          const targetCol = Math.max(0, Math.min(peer.cursorCol || 0, lineInfo.length));
          const pos = lineInfo.from + targetCol;

          widgets.push({
            from: pos,
            widget: Decoration.widget({
              widget: new PeerCursorWidget(peer.name, peer.color || '#38bdf8'),
              side: 1,
            }),
          });
        }

        // Sort widgets by position to build valid range set
        widgets.sort((a, b) => a.from - b.from);
        return Decoration.set(widgets.map((w) => w.widget.range(w.from)));
      }
    }
    return decorations.map(tr.changes);
  },
  provide: (f) => EditorView.decorations.from(f),
});
