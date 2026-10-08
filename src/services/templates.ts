import type { Template } from '../types/latex';

const IEEE_PAPER_TEX = `\\documentclass[conference,twocolumn]{IEEEtran}
\\usepackage{amsmath,amssymb,amsfonts}
\\usepackage{graphicx}
\\usepackage{cite}

\\title{Neural Quantum State Tomography with Self-Attention Mechanisms}
\\author{Dr. Elena Rostova\\and Dr. Marcus Chen\\and Dr. Aris Thorne}
\\date{\\today}

\\begin{document}

\\maketitle

\\begin{abstract}
Quantum state tomography is essential for characterizing quantum information processors. However, conventional maximum likelihood estimation scales exponentially with the number of qubits $N$. In this paper, we propose an attention-augmented transformer framework capable of reconstructing density matrices $\\rho$ with $99.4\\%$ fidelity in polynomial time.
\\end{abstract}

\\section{Introduction}
Characterization of quantum computational devices requires robust reconstruction of quantum density operators. Given an ensemble of Pauli measurements, reconstructing the density operator $\\rho \\in \\mathbb{C}^{2^N \\times 2^N}$ poses a fundamental challenge in quantum verification \\cite{thorne2025quantum}.

Traditional tomography relies on matrix inversion and compressed sensing. Our approach utilizes neural representations where the probability distribution $P(\\sigma)$ of measurement outcomes is modeled directly:
\\begin{equation}
P(\\boldsymbol{\\sigma}) = \\frac{1}{Z} \\exp\\left( -\\sum_{j=1}^M \\theta_j \\phi_j(\\boldsymbol{\\sigma}) \\right)
\\end{equation}

\\section{System Architecture}
The quantum variational autoencoder comprises an encoder module $E_\\phi$ that maps projective basis states to continuous latent representations:
\\begin{equation}
\\mathcal{L}_{\\text{rec}}(\\theta, \\phi) = \\mathbb{E}_{x \\sim \\mathcal{D}}\\left[ -\\log p_\\theta(x | z) \\right] + D_{\\text{KL}}\\left( q_\\phi(z|x) \\parallel p(z) \\right)
\\end{equation}

\\section{Experimental Results}
We evaluated our framework against synthetic GHZ and W-states across system sizes up to $N = 12$ qubits. Table I summarizes the reconstruction fidelity and convergence latency.

\\begin{tabular}{l c c c}
\\hline
Quantum State & Qubits ($N$) & Fidelity (\\%) & Runtime (ms) \\\\
\\hline
GHZ State & 4 & 99.82 & 14.2 \\\\
W-State & 6 & 99.45 & 28.6 \\\\
Cluster State & 8 & 98.91 & 62.4 \\\\
Random Haar & 10 & 97.80 & 145.0 \\\\
\\hline
\\end{tabular}

\\section{Conclusion}
We demonstrated that attention-based quantum state tomography scales effectively beyond the reach of standard convex optimization solvers. Future work will explore real-time hardware deployment on superconducting architectures.

\\end{document}`;

const REFERENCES_BIB = `@article{thorne2025quantum,
  title={Scalable Quantum State Tomography via Deep Generative Modeling},
  author={Thorne, Aris and Rostova, Elena and Chen, Marcus},
  journal={Physical Review Letters},
  volume={134},
  number={4},
  pages={040501},
  year={2025}
}`;

const ACADEMIC_CV_TEX = `\\documentclass{article}
\\usepackage{amsmath}

\\title{Curriculum Vitae --- Dr. Julian Vance}
\\author{Quantum Information Laboratory, MIT}
\\date{Updated: October 2026}

\\begin{document}

\\maketitle

\\section{Academic Appointments}
\\begin{itemize}
\\item \\textbf{Associate Professor of Physics}, Massachusetts Institute of Technology (2023--Present)
\\item \\textbf{Postdoctoral Fellow}, Max Planck Institute for Quantum Optics (2020--2023)
\\item \\textbf{Ph.D. in Theoretical Physics}, Stanford University (2020)
\\end{itemize}

\\section{Selected Publications}
\\begin{enumerate}
\\item \\textbf{J. Vance}, E. Rostova, \`\`Fault-tolerant topological quantum error correction on non-Abelian anyon lattices,\'\' \\textit{Nature Physics}, vol. 22, pp. 412--420, 2026.
\\item \\textbf{J. Vance}, M. Chen, \`\`Polynomial-time Hamiltonian simulation with quantum walks,\'\' \\textit{Physical Review X}, vol. 15, no. 2, 2025.
\\end{enumerate}

\\section{Honors \\& Awards}
\\begin{itemize}
\\item Sloan Research Fellowship in Physics (2025)
\\item NSF Early CAREER Award (2024)
\\item Stanford Outstanding Dissertation Prize in Physics (2020)
\\end{itemize}

\\end{document}`;

const BEAMER_DECK_TEX = `\\documentclass{beamer}

\\title{Topological Phases of Quantum Matter}
\\author{Dr. Elena Rostova}
\\date{October 2026}

\\begin{document}

\\maketitle

\\section{Motivation}
\\begin{itemize}
\\item Decoherence presents the primary bottleneck in contemporary quantum computing.
\\item Topological quantum computation protects quantum information by encoding it non-locally.
\\end{itemize}

\\section{The Kitaev Honeycomb Model}
The Hamiltonian of the spin-$1/2$ honeycomb lattice with directional Ising couplings is:
\\begin{equation}
H = -J_x \\sum_{x\\text{-links}} \\sigma_j^x \\sigma_k^x - J_y \\sum_{y\\text{-links}} \\sigma_j^y \\sigma_k^y - J_z \\sum_{z\\text{-links}} \\sigma_j^z \\sigma_k^z
\\end{equation}

\\section{Key Findings}
\\begin{itemize}
\\item Exact solution via representation in terms of four Majorana fermions per site.
\\item Emergence of a gapped $Z_2$ spin liquid phase with Abelian anyons.
\\item Introduction of magnetic fields produces non-Abelian Ising anyons with chiral Majorana edge modes.
\\end{itemize}

\\end{document}`;

export const STARTER_TEMPLATES: Template[] = [
  {
    id: 'ieee-conference',
    name: 'IEEE Conference Paper',
    category: 'Academic Paper',
    description: 'Two-column academic research paper format with abstract, mathematical model, and citations.',
    badge: 'IEEE Style',
    files: [
      {
        id: 'main.tex',
        name: 'main.tex',
        type: 'tex',
        isEntry: true,
        content: IEEE_PAPER_TEX,
      },
      {
        id: 'references.bib',
        name: 'references.bib',
        type: 'bib',
        content: REFERENCES_BIB,
      }
    ]
  },
  {
    id: 'academic-cv',
    name: 'Executive Academic CV',
    category: 'Resume / CV',
    description: 'Clean, elegant one-page academic and research curriculum vitae.',
    badge: 'Curriculum Vitae',
    files: [
      {
        id: 'main.tex',
        name: 'main.tex',
        type: 'tex',
        isEntry: true,
        content: ACADEMIC_CV_TEX,
      }
    ]
  },
  {
    id: 'beamer-presentation',
    name: 'Academic Presentation Deck',
    category: 'Presentation',
    description: 'Slide-deck layout for research talks, defense presentations, and conferences.',
    badge: 'Presentation',
    files: [
      {
        id: 'main.tex',
        name: 'main.tex',
        type: 'tex',
        isEntry: true,
        content: BEAMER_DECK_TEX,
      }
    ]
  }
];
