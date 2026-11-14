// src/components/deskPet/PetPropLayer.tsx
import React from 'react';
import type { PropLayerType } from './petStateRegistry';
import type { CoatPalette } from './petProgression';

interface PetPropLayerProps {
    propLayer: PropLayerType;
    palette: CoatPalette;
}

export const PetPropLayer: React.FC<PetPropLayerProps> = ({ propLayer, palette }) => {
    switch (propLayer) {
        case 'tape-measure':
            return (
                <g className="texcat-tape-measure" aria-hidden="true">
                    <rect x="18" y="45" width="28" height="5" rx="1" fill="#facc15" stroke="#ca8a04" strokeWidth="1" />
                    {[22, 26, 30, 34, 38, 42].map((x, idx) => (
                        <line
                            key={x}
                            x1={x}
                            y1="45"
                            x2={x}
                            y2={idx % 2 === 0 ? 48 : 49.5}
                            stroke="#713f12"
                            strokeWidth="0.8"
                        />
                    ))}
                    <ellipse cx="22" cy="51" rx="4" ry="3" fill={palette.furFill} stroke={palette.furStroke} strokeWidth="1.4" />
                    <ellipse cx="42" cy="51" rx="4" ry="3" fill={palette.furFill} stroke={palette.furStroke} strokeWidth="1.4" />
                </g>
            );

        case 'magnifier':
            return (
                <g className="texcat-magnifier" aria-hidden="true" style={{ transformOrigin: '44px 42px' }}>
                    <ellipse cx="23" cy="52" rx="4.5" ry="3.5" fill={palette.furFill} stroke={palette.furStroke} strokeWidth="1.5" />
                    <circle cx="44" cy="40" r="6" stroke="#38bdf8" strokeWidth="2" fill="rgba(56,189,248,0.22)" />
                    <path d="M48.5 44.5 L 54.5 50.5" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" />
                    <ellipse cx="41" cy="47" rx="4" ry="3.2" fill={palette.furFill} stroke={palette.furStroke} strokeWidth="1.4" />
                </g>
            );

        case 'coffee-sip':
            return (
                <g className="texcat-coffee-sip" aria-hidden="true">
                    <path d="M29 36 Q 27 33 29 30" stroke="#cbd5e1" strokeWidth="1.1" strokeLinecap="round" fill="none" className="steam-wisp-1" />
                    <path d="M35 36 Q 37 33 35 30" stroke="#cbd5e1" strokeWidth="1.1" strokeLinecap="round" fill="none" className="steam-wisp-2" />
                    <rect x="26" y="40" width="12" height="11" rx="2" fill="#f8fafc" stroke="#64748b" strokeWidth="1.2" />
                    <path d="M38 42 Q 42 45.5 38 49" stroke="#64748b" strokeWidth="1.4" fill="none" />
                    <text x="32" y="47" fontSize="4.2" fill="#0284c7" fontWeight="bold" textAnchor="middle">TeX</text>
                    <ellipse cx="24" cy="47" rx="3.8" ry="3.2" fill={palette.furFill} stroke={palette.furStroke} strokeWidth="1.3" />
                    <ellipse cx="40" cy="47" rx="3.8" ry="3.2" fill={palette.furFill} stroke={palette.furStroke} strokeWidth="1.3" />
                </g>
            );

        case 'origami-crane':
            return (
                <g className="texcat-origami-crane" aria-hidden="true">
                    <polygon points="34,43 44,34 42,44" fill="#bae6fd" stroke="#0284c7" strokeWidth="0.9" />
                    <polygon points="34,43 42,44 38,48" fill="#7dd3fc" stroke="#0284c7" strokeWidth="0.9" />
                    <polygon points="42,44 48,39 45,45" fill="#e0f2fe" stroke="#0284c7" strokeWidth="0.9" />
                    <polygon points="34,43 29,39 33,45" fill="#e0f2fe" stroke="#0284c7" strokeWidth="0.9" />
                    <ellipse cx="23" cy="52" rx="4.5" ry="3.5" fill={palette.furFill} stroke={palette.furStroke} strokeWidth="1.5" />
                    <ellipse cx="39" cy="49" rx="4" ry="3.2" fill={palette.furFill} stroke={palette.furStroke} strokeWidth="1.4" />
                </g>
            );

        case 'paper-shred':
            return (
                <g className="texcat-paper-shred" aria-hidden="true">
                    <rect x="17" y="45" width="7" height="10" rx="0.8" fill="#f8fafc" stroke="#94a3b8" strokeWidth="0.9" transform="rotate(-14 20 50)" />
                    <rect x="40" y="45" width="7" height="10" rx="0.8" fill="#f8fafc" stroke="#94a3b8" strokeWidth="0.9" transform="rotate(16 43 50)" />
                    <line x1="19" y1="48" x2="22" y2="48" stroke="#ef4444" strokeWidth="0.9" />
                    <line x1="41" y1="48" x2="45" y2="48" stroke="#ef4444" strokeWidth="0.9" />
                    <ellipse cx="24" cy="47" rx="4" ry="3.2" fill={palette.furFill} stroke={palette.furStroke} strokeWidth="1.4" className="paw-knead-left" />
                    <ellipse cx="40" cy="47" rx="4" ry="3.2" fill={palette.furFill} stroke={palette.furStroke} strokeWidth="1.4" className="paw-knead-right" />
                </g>
            );

        case 'hairball-cough':
            return (
                <g className="texcat-hairball" aria-hidden="true">
                    <ellipse cx="32" cy="53" rx="6.5" ry="3.8" fill="#475569" stroke="#1e293b" strokeWidth="1.1" />
                    <text x="32" y="54.5" fontSize="4.2" fill="#f8fafc" fontWeight="bold" textAnchor="middle">{'{}'}</text>
                    <ellipse cx="21" cy="51" rx="4.2" ry="3.4" fill={palette.furFill} stroke={palette.furStroke} strokeWidth="1.4" />
                    <ellipse cx="43" cy="51" rx="4.2" ry="3.4" fill={palette.furFill} stroke={palette.furStroke} strokeWidth="1.4" />
                </g>
            );

        case 'keyboard-sprawl':
            return (
                <g className="texcat-keyboard-sprawl" aria-hidden="true">
                    <rect x="11" y="49" width="42" height="7" rx="1.8" fill="#1e293b" stroke="#475569" strokeWidth="1.1" />
                    {[15, 20, 25, 30, 35, 40, 45].map((x) => (
                        <rect key={x} x={x} y="51" width="3.5" height="2" rx="0.4" fill="#94a3b8" />
                    ))}
                    <ellipse cx="19" cy="48" rx="5.5" ry="3" fill={palette.furFill} stroke={palette.furStroke} strokeWidth="1.4" />
                    <ellipse cx="45" cy="48" rx="5.5" ry="3" fill={palette.furFill} stroke={palette.furStroke} strokeWidth="1.4" />
                </g>
            );

        case 'loaf':
            return <g className="texcat-paws-loaf" />;

        case 'lifted-scruff':
            return (
                <g className="texcat-paws-dangling">
                    <ellipse cx="25" cy="54" rx="3.5" ry="5.5" fill={palette.furFill} stroke={palette.furStroke} strokeWidth="1.5" />
                    <ellipse cx="39" cy="54" rx="3.5" ry="5.5" fill={palette.furFill} stroke={palette.furStroke} strokeWidth="1.5" />
                </g>
            );

        default:
            return (
                <g className="texcat-paws-resting">
                    <ellipse cx="24" cy="52" rx="4.5" ry="3.5" fill={palette.furFill} stroke={palette.furStroke} strokeWidth="1.5" />
                    <ellipse cx="40" cy="52" rx="4.5" ry="3.5" fill={palette.furFill} stroke={palette.furStroke} strokeWidth="1.5" />
                </g>
            );
    }
};

export const PrestigeAccessoryLayer: React.FC<{ accessory: string }> = ({ accessory }) => {
    if (accessory === 'monocle') {
        return (
            <g className="texcat-accessory-monocle" aria-hidden="true">
                <circle cx="39" cy="26" r="5" stroke="#eab308" strokeWidth="1.5" fill="rgba(254,240,138,0.14)" />
                <path d="M44 27 Q 48 33 45 39" stroke="#eab308" strokeWidth="1.1" fill="none" strokeDasharray="2 1.5" />
            </g>
        );
    }
    if (accessory === 'laurel') {
        return (
            <g className="texcat-accessory-laurel" aria-hidden="true">
                <path d="M18 20 Q 19 11 30 11" stroke="#16a34a" strokeWidth="1.8" fill="none" strokeLinecap="round" />
                <path d="M46 20 Q 45 11 34 11" stroke="#16a34a" strokeWidth="1.8" fill="none" strokeLinecap="round" />
                <circle cx="32" cy="11" r="1.6" fill="#facc15" />
            </g>
        );
    }
    if (accessory === 'knuth-visor') {
        return (
            <g className="texcat-accessory-visor" aria-hidden="true">
                <path d="M17 18 Q 32 13 47 18 L 49 22 Q 32 18 15 22 Z" fill="rgba(16,185,129,0.72)" stroke="#065f46" strokeWidth="1.1" />
                <path d="M18 17 Q 32 13 46 17" stroke="#f8fafc" strokeWidth="1.6" fill="none" />
            </g>
        );
    }
    return null;
};