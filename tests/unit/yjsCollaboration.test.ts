import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as Y from 'yjs';
import { Awareness, encodeAwarenessUpdate, applyAwarenessUpdate } from 'y-protocols/awareness';
import * as buffer from 'lib0/buffer';
import { SupabaseYjsProvider, CHUNK_SIZE } from '../../src/services/yjsProvider';
import type { Collaborator, ProjectFile, ReviewComment, TrackedChange } from '../../src/types/latex';

describe('Stage 7: Yjs CRDT Collaboration Engine', () => {
  let docA: Y.Doc;
  let docB: Y.Doc;

  beforeEach(() => {
    docA = new Y.Doc();
    docB = new Y.Doc();
  });

  afterEach(() => {
    docA.destroy();
    docB.destroy();
  });

  it('converges to 100% identical text on concurrent insertions at different positions', () => {
    const textA = docA.getText('file:main.tex');
    const textB = docB.getText('file:main.tex');

    // Initial synchronized baseline
    textA.insert(0, '\\documentclass{article}\n\\begin{document}\nHello World\n\\end{document}');
    const initUpdate = Y.encodeStateAsUpdate(docA);
    Y.applyUpdate(docB, initUpdate);
    expect(textB.toString()).toBe(textA.toString());

    // Concurrent independent edits without immediate exchange
    textA.insert(23, '% Added by Alice\n');
    textB.insert(textB.toString().indexOf('Hello World'), 'Collaborative ');

    // Exchange updates
    const updateFromA = Y.encodeStateAsUpdate(docA, Y.encodeStateVector(docB));
    const updateFromB = Y.encodeStateAsUpdate(docB, Y.encodeStateVector(docA));

    Y.applyUpdate(docB, updateFromA);
    Y.applyUpdate(docA, updateFromB);

    // CRDT mathematical convergence
    expect(textA.toString()).toBe(textB.toString());
    expect(textA.toString()).toContain('% Added by Alice');
    expect(textA.toString()).toContain('Collaborative Hello World');
  });

  it('resolves conflicting concurrent deletions and insertions gracefully', () => {
    const textA = docA.getText('file:main.tex');
    const textB = docB.getText('file:main.tex');

    textA.insert(0, 'The quick brown fox jumps over the lazy dog');
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));

    // Alice deletes "brown fox "
    textA.delete(10, 10);

    // Bob simultaneously modifies "fox" to "silver fox"
    textB.insert(13, 'silver ');

    // Exchange updates
    const updateFromA = Y.encodeStateAsUpdate(docA, Y.encodeStateVector(docB));
    const updateFromB = Y.encodeStateAsUpdate(docB, Y.encodeStateVector(docA));

    Y.applyUpdate(docB, updateFromA);
    Y.applyUpdate(docA, updateFromB);

    expect(textA.toString()).toBe(textB.toString());
  });

  it('manages multi-file LaTeX project separation inside a single root Y.Doc', () => {
    const mainA = docA.getText('file:main.tex');
    const introA = docA.getText('file:sections/intro.tex');
    const bibA = docA.getText('file:references.bib');

    mainA.insert(0, '\\input{sections/intro.tex}');
    introA.insert(0, '\\section{Introduction}\nCollaborative writing is fun.');
    bibA.insert(0, '@article{knuth1984, author={Knuth, Donald}}');

    // Sync all files to Doc B in one delta
    const fullProjectUpdate = Y.encodeStateAsUpdate(docA);
    Y.applyUpdate(docB, fullProjectUpdate);

    const mainB = docB.getText('file:main.tex');
    const introB = docB.getText('file:sections/intro.tex');
    const bibB = docB.getText('file:references.bib');

    expect(mainB.toString()).toBe('\\input{sections/intro.tex}');
    expect(introB.toString()).toBe('\\section{Introduction}\nCollaborative writing is fun.');
    expect(bibB.toString()).toContain('Knuth, Donald');

    // Edit intro on B and bib on A
    introB.insert(introB.length, '\nAdded section 1.1.');
    bibA.insert(bibA.length, '\n@book{lamport1994}');

    // Sync deltas
    Y.applyUpdate(docA, Y.encodeStateAsUpdate(docB, Y.encodeStateVector(docA)));
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA, Y.encodeStateVector(docB)));

    expect(introA.toString()).toBe(introB.toString());
    expect(bibA.toString()).toBe(bibB.toString());
    expect(introA.toString()).toContain('Added section 1.1.');
    expect(bibB.toString()).toContain('lamport1994');
  });

  it('slices large updates into 48KB binary chunks and correctly reassembles them', () => {
    const textA = docA.getText('file:paper.tex');

    // Generate a payload > 100KB (exceeds CHUNK_SIZE = 48000)
    let largeLatex = '\\documentclass{article}\n\\begin{document}\n';
    for (let i = 1; i <= 1500; i++) {
      largeLatex += `\\section{Experiment ${i}}\nWe observe equation: $E_${i} = mc^2 + \\int_0^1 x^${i} dx$.\n`;
    }
    largeLatex += '\\end{document}';
    textA.insert(0, largeLatex);

    const fullUpdate = Y.encodeStateAsUpdate(docA);
    expect(fullUpdate.byteLength).toBeGreaterThan(CHUNK_SIZE * 2);

    // Simulate binary chunking
    const totalChunks = Math.ceil(fullUpdate.byteLength / CHUNK_SIZE);
    const chunks: Uint8Array[] = [];

    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, fullUpdate.byteLength);
      chunks.push(fullUpdate.subarray(start, end));
    }

    expect(chunks.length).toBeGreaterThanOrEqual(2);

    // Reassemble chunks
    let totalLength = 0;
    for (const c of chunks) totalLength += c.byteLength;
    expect(totalLength).toBe(fullUpdate.byteLength);

    const reassembled = new Uint8Array(totalLength);
    let offset = 0;
    for (const c of chunks) {
      reassembled.set(c, offset);
      offset += c.byteLength;
    }

    // Apply to Doc B
    Y.applyUpdate(docB, reassembled);
    const textB = docB.getText('file:paper.tex');
    expect(textB.toString()).toBe(textA.toString());
    expect(textB.toString()).toContain('\\section{Experiment 600}');
  });

  it('isolates undo/redo per user so undoing does not revert a collaborator’s edits', () => {
    const textA = docA.getText('file:main.tex');
    const textB = docB.getText('file:main.tex');

    textA.insert(0, 'Base sentence. ');
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));

    // Configure per-user UndoManagers tracking only local origin
    const undoManagerA = new Y.UndoManager(textA, {
      trackedOrigins: new Set(['user-alice']),
    });

    // Alice types with origin 'user-alice'
    docA.transact(() => {
      textA.insert(textA.length, 'Alice added this. ');
    }, 'user-alice');

    // Bob types on B with origin 'user-bob'
    docB.transact(() => {
      textB.insert(textB.length, 'Bob added that. ');
    }, 'user-bob');

    // Sync updates between A and B
    Y.applyUpdate(docA, Y.encodeStateAsUpdate(docB, Y.encodeStateVector(docA)));
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA, Y.encodeStateVector(docB)));

    expect(textA.toString()).toContain('Alice added this.');
    expect(textA.toString()).toContain('Bob added that.');

    // Alice presses Undo
    undoManagerA.undo();

    // Alice's edits should be undone, but Bob's edits must remain intact!
    expect(textA.toString()).not.toContain('Alice added this.');
    expect(textA.toString()).toContain('Bob added that.');

    // Sync Alice's undo to Bob
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA, Y.encodeStateVector(docB)));
    expect(textB.toString()).toBe(textA.toString());
  });

  it('synchronizes real-time cursor awareness positions and selections', () => {
    const awarenessA = new Awareness(docA);
    const awarenessB = new Awareness(docB);

    awarenessA.setLocalState({
      user: {
        id: 'usr_alice',
        name: 'Alice Cooper',
        color: '#10b981',
      },
      cursor: {
        fileId: 'main.tex',
        line: 42,
        col: 15,
        updatedAt: Date.now(),
      },
    });

    // Encode awareness update from A and apply on B
    const update = encodeAwarenessUpdate(awarenessA, [docA.clientID]);
    applyAwarenessUpdate(awarenessB, update, 'remote');

    const statesOnB = awarenessB.getStates();
    const aliceState = statesOnB.get(docA.clientID);

    expect(aliceState).toBeDefined();
    expect(aliceState?.user.name).toBe('Alice Cooper');
    expect(aliceState?.user.color).toBe('#10b981');
    expect(aliceState?.cursor.line).toBe(42);
    expect(aliceState?.cursor.col).toBe(15);
    expect(aliceState?.cursor.fileId).toBe('main.tex');

    awarenessA.destroy();
    awarenessB.destroy();
  });

  it('synchronizes review comments and tracked suggestions collaboratively via CRDT arrays', () => {
    const commentsA = docA.getArray<ReviewComment>('project-comments');
    const commentsB = docB.getArray<ReviewComment>('project-comments');

    const newComment: ReviewComment = {
      id: 'comment-101',
      fileId: 'main.tex',
      line: 14,
      authorName: 'Dr. Elena',
      authorAvatar: 'DE',
      authorColor: '#a855f7',
      text: 'Please cite Knuth 1984 here.',
      createdAt: '12:00',
      resolved: false,
    };

    commentsA.push([newComment]);

    // Sync
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));

    expect(commentsB.length).toBe(1);
    expect(commentsB.get(0).text).toBe('Please cite Knuth 1984 here.');
    expect(commentsB.get(0).authorName).toBe('Dr. Elena');

    // Bob resolves the comment on B
    docB.transact(() => {
      const existing = commentsB.get(0);
      commentsB.delete(0, 1);
      commentsB.insert(0, [{ ...existing, resolved: true }]);
    });

    // Sync back to A
    Y.applyUpdate(docA, Y.encodeStateAsUpdate(docB));
    expect(commentsA.get(0).resolved).toBe(true);
  });

  it('provides zero-credential BroadcastChannel local fallback for offline multi-tab dev', () => {
    const userA: Collaborator = {
      id: 'usr_tab_a',
      name: 'Tab A User',
      color: '#38bdf8',
      cursorLine: 1,
      cursorCol: 1,
      activeFile: 'main.tex',
      status: 'active',
      isSelf: true,
    };

    const initialFiles: ProjectFile[] = [
      { id: 'main.tex', name: 'main.tex', content: '\\documentclass{article}', type: 'tex' },
    ];

    const providerA = new SupabaseYjsProvider('proj_offline_test', userA, initialFiles);
    expect(providerA.ydoc).toBeDefined();
    expect(providerA.getText('main.tex').toString()).toBe('\\documentclass{article}');

    const peers = providerA.getConnectedPeers();
    expect(Array.isArray(peers)).toBe(true);

    providerA.destroy();
  });
});
