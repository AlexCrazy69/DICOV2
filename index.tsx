
import React, { useState, useEffect, createContext, useContext, useCallback, useMemo, useRef, useLayoutEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { GoogleGenAI, Chat } from "@google/genai";

// --- AI INITIALIZATION ---
const ai = new GoogleGenAI({apiKey: process.env.API_KEY});

// --- TYPE DEFINITIONS ---
type DictionaryEntry = {
  faka_uvea: string;
  french: string;
  type: string;
  phonetic?: string;
  audio_url?: string;
  image_url?: string;
  examples: {
    faka_uvea: string;
    french: string;
  }[];
};

type GuideCategory = {
    name: string;
    phrases: {
        faka_uvea: string;
        french: string;
    }[];
};

type ThemePreference = 'light' | 'dark' | 'system';

type ExamLevel = {
    name: 'Bronze' | 'Argent' | 'Or';
    color: string;
    questionCount: number;
    passingPercent: number;
    duration: number; // Duration in minutes
};

type User = {
    username: string;
    role: 'user' | 'admin';
};

type AppContextType = {
  themePreference: ThemePreference;
  setThemePreference: (theme: ThemePreference) => void;
  speak: (textOrEntry: string | DictionaryEntry) => void;
  favorites: string[];
  toggleFavorite: (faka_uvea: string) => void;
  history: string[];
  logHistory: (faka_uvea: string) => void;
  setCurrentPage: (page: string) => void;
};

type AuthContextType = {
    user: User | null;
    login: (username, password) => boolean;
    logout: () => void;
};

// --- HELPER: Levenshtein Distance ---
const levenshteinDistance = (s1: string, s2: string): number => {
    s1 = s1.toLowerCase();
    s2 = s2.toLowerCase();
    const costs = [];
    for (let i = 0; i <= s1.length; i++) {
        let lastValue = i;
        for (let j = 0; j <= s2.length; j++) {
            if (i === 0) {
                costs[j] = j;
            } else if (j > 0) {
                let newValue = costs[j - 1];
                if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
                    newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
                }
                costs[j - 1] = lastValue;
                lastValue = newValue;
            }
        }
        if (i > 0) {
            costs[s2.length] = lastValue;
        }
    }
    return costs[s2.length];
};


// --- DATA ---
const DICTIONARY_DATA: DictionaryEntry[] = [
  {
    faka_uvea: 'alofa',
    french: 'amour, bonjour, pitié',
    type: 'n.c.',
    phonetic: '/a.lo.fa/',
    audio_url: 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=',
    image_url: 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'400\' height=\'200\' viewBox=\'0 0 400 200\'%3E%3Crect width=\'400\' height=\'200\' fill=\'%23e0e0e0\' /%3E%3Ctext x=\'50%25\' y=\'50%25\' dominant-baseline=\'middle\' text-anchor=\'middle\' font-family=\'monospace\' font-size=\'26px\' fill=\'%23999999\'%3EImage 400x200%3C/text%3E%3C/svg%3E',
    examples: [{ faka_uvea: 'Mālō te ma\'uli, \'alofa atu.', french: 'Bonjour, je vous salue.' }],
  },
  {
    faka_uvea: 'api',
    french: 'maison, habitation',
    type: 'n.c.',
    phonetic: '/a.pi/',
    image_url: 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'400\' height=\'200\' viewBox=\'0 0 400 200\'%3E%3Crect width=\'400\' height=\'200\' fill=\'%23e0e0e0\' /%3E%3Ctext x=\'50%25\' y=\'50%25\' dominant-baseline=\'middle\' text-anchor=\'middle\' font-family=\'monospace\' font-size=\'26px\' fill=\'%23999999\'%3EImage 400x200%3C/text%3E%3C/svg%3E',
    examples: [{ faka_uvea: 'E au nofo i toku api.', french: 'Je reste dans ma maison.' }],
  },
  {
    faka_uvea: 'aho',
    french: 'jour',
    type: 'n.c.',
    phonetic: '/a.ho/',
    examples: [{ faka_uvea: 'Ko te \'aho tenei \'e lelei.', french: 'Ce jour est bon.' }],
  },
  {
    faka_uvea: 'aso',
    french: 'soleil',
    type: 'n.c.',
    phonetic: '/a.so/',
    examples: [{ faka_uvea: 'E malamalama te aso.', french: 'Le soleil brille.' }],
  },
  {
    faka_uvea: 'atua',
    french: 'dieu, esprit',
    type: 'n.c.',
    phonetic: '/a.tu.a/',
    examples: [{ faka_uvea: 'E tui ki te \'atua.', french: 'Croyance en dieu.' }],
  },
  {
    faka_uvea: 'ava',
    french: 'passe (récif)',
    type: 'n.c.',
    phonetic: '/a.va/',
    examples: [{ faka_uvea: 'E ulu te vaka i te ava.', french: 'Le bateau entre par la passe.' }],
  },
  {
    faka_uvea: 'aliki',
    french: 'roi, chef',
    type: 'n.c.',
    phonetic: '/a.li.ki/',
    examples: [{ faka_uvea: 'Ko te aliki o Uvea.', french: 'Le roi de Wallis.' }],
  },
  {
    faka_uvea: 'au',
    french: 'je, moi',
    type: 'pr.p.',
    phonetic: '/a.u/',
    examples: [{ faka_uvea: 'E alu au ki te api.', french: 'Je vais à la maison.' }],
  },
  {
    faka_uvea: '\'amuli',
    french: 'Avenir, plus tard, dans la suite',
    type: 'adv.',
    phonetic: '/ʔa.mu.li/',
    examples: [{ faka_uvea: 'Gāue mo manatu ki ’amuli.', french: 'Travaille en pensant à l’avenir.' }],
  },
  {
    faka_uvea: 'afi',
    french: 'feu',
    type: 'n.c.',
    phonetic: '/a.fi/',
    examples: [{ faka_uvea: 'Kua kā te afi.', french: 'Le feu est allumé.' }],
  },
  {
    faka_uvea: 'ano',
    french: 'lac',
    type: 'n.c.',
    phonetic: '/a.no/',
    examples: [{ faka_uvea: 'E lahi te ano o Lalolalo.', french: 'Le lac Lalolalo est grand.' }],
  },
  {
    faka_uvea: 'aku',
    french: 'mon, ma, mes (possessif)',
    type: 'adj.poss.',
    phonetic: '/a.ku/',
    examples: [{ faka_uvea: 'Ko te tohi aku.', french: 'C\'est mon livre.' }],
  },
  {
    faka_uvea: 'ama',
    french: 'balancier de pirogue',
    type: 'n.c.',
    phonetic: '/a.ma/',
    examples: [{ faka_uvea: 'E pakia te ama o te vaka.', french: 'Le balancier de la pirogue est cassé.' }],
  },
  {
    faka_uvea: '\'aka',
    french: 'racine',
    type: 'n.c.',
    phonetic: '/ʔa.ka/',
    examples: [{ faka_uvea: 'E loloto te \'aka o te fu\'u lakau.', french: 'La racine de l\'arbre est profonde.' }],
  },
  {
    faka_uvea: '\'ala',
    french: 'chemin, voie',
    type: 'n.c.',
    phonetic: '/ʔa.la/',
    examples: [{ faka_uvea: 'Toupi te \'ala ki te gata\'aga.', french: 'Le chemin vers la plage est court.' }],
  },
  {
    faka_uvea: '\'aga',
    french: 'coutume, manière d\'être',
    type: 'n.c.',
    phonetic: '/ʔa.ŋa/',
    examples: [{ faka_uvea: 'Ko te \'aga faka\'uvea.', french: 'C\'est la coutume wallisienne.' }],
  },
  {
    faka_uvea: '\'ahoa',
    french: 'collier (de fleurs ou coquillages)',
    type: 'n.c.',
    phonetic: '/ʔa.ho.a/',
    examples: [{ faka_uvea: 'Ne\'i fai he \'ahoa sisi.', french: 'Elle a fabriqué un collier de coquillages.' }],
  },
  {
    faka_uvea: '\'aele',
    french: 'se promener, marcher',
    type: 'v.',
    phonetic: '/ʔa.e.le/',
    examples: [{ faka_uvea: 'Tau olo o \'aele.', french: 'Allons nous promener.' }],
  },
  {
    faka_uvea: '\'ate',
    french: 'foie',
    type: 'n.c.',
    phonetic: '/ʔa.te/',
    examples: [{ faka_uvea: 'Ko te \'ate moa \'e lelei.', french: 'Le foie de poulet est bon.' }],
  },
  {
    faka_uvea: '\'ao',
    french: 'nuage',
    type: 'n.c.',
    phonetic: '/ʔa.o/',
    examples: [{ faka_uvea: 'E lahi te \'ao i te lagi.', french: 'Il y a beaucoup de nuages dans le ciel.' }],
  },
  {
    faka_uvea: '\'avelo',
    french: 'rapide, vitesse',
    type: 'adj.',
    phonetic: '/ʔa.ve.lo/',
    examples: [{ faka_uvea: 'E \'avelo lahi te ka.', french: 'La voiture est très rapide.' }],
  }
].sort((a, b) => a.faka_uvea.localeCompare(b.faka_uvea));


const GUIDE_DATA: GuideCategory[] = [
    {
        name: 'Salutations (Les salutations)',
        phrases: [
            { faka_uvea: 'Mālō te ma\'uli', french: 'Bonjour' },
            { faka_uvea: 'Mālō te faikole', french: 'Bonjour (en réponse)' },
            { faka_uvea: 'E fēfē hake?', french: 'Comment ça va ?' },
            { faka_uvea: 'Lelei peā', french: 'Ça va bien' },
            { faka_uvea: 'Nofo ā', french: 'Au revoir (à celui qui reste)' },
            { faka_uvea: 'Fano ā', french: 'Au revoir (à celui qui part)' },
            { faka_uvea: 'Mālō', french: 'Merci' }
        ]
    },
    {
        name: 'Questions de base (Les questions)',
        phrases: [
            { faka_uvea: 'Ko ai tou higoa?', french: 'Quel est ton nom ?' },
            { faka_uvea: 'E fia tou ta\'u?', french: 'Quel âge as-tu ?' },
            { faka_uvea: 'E ke ha\'u i fe?', french: 'D\'où viens-tu ?' },
            { faka_uvea: 'E fia te totogi?', french: 'Combien ça coûte ?' },
        ]
    }
];

const ALPHABET_STATUS = [
    { letter: 'A', enabled: true }, { letter: 'E', enabled: false }, { letter: 'F', enabled: false }, 
    { letter: 'G', enabled: false }, { letter: 'H', enabled: false }, { letter: 'I', enabled: false },
    { letter: 'K', enabled: false }, { letter: 'L', enabled: false }, { letter: 'M', enabled: false }, 
    { letter: 'N', enabled: false }, { letter: 'O', enabled: false }, { letter: 'S', enabled: false }, 
    { letter: 'T', enabled: false }, { letter: 'U', enabled: false }, { letter: 'V', enabled: false }, 
    { letter: '\'', enabled: false }
];

const EXAM_LEVELS: ExamLevel[] = [
    { name: 'Bronze', color: '#cd7f32', questionCount: 5, passingPercent: 70, duration: 2 },
    { name: 'Argent', color: '#667eea', questionCount: 10, passingPercent: 75, duration: 5 },
    { name: 'Or', color: '#fbbf24', questionCount: 15, passingPercent: 80, duration: 8 }
];


// --- ICONS ---
const SpeakerIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M14.604 3.012a.749.749 0 0 0-.965.033L8.62 7.25H5.375A2.375 2.375 0 0 0 3 9.625v4.75A2.375 2.375 0 0 0 5.375 16.75H8.62l5.019 4.205a.75.75 0 0 0 .965.033.752.752 0 0 0 .396-.688V3.7a.752.752 0 0 0-.396-.688Z" /><path d="M17.125 7.75a.75.75 0 0 0 0 1.5c.828 0 1.5.672 1.5 1.5s-.672 1.5-1.5 1.5a.75.75 0 0 0 0 1.5c1.657 0 3-1.343 3-3s-1.343-3-3-3Zm0 4.5a.75.75 0 0 0 0 1.5c2.485 0 4.5-2.015 4.5-4.5s-2.015-4.5-4.5-4.5a.75.75 0 0 0 0 1.5c1.657 0 3 1.343 3 3s-1.343 3-3 3Z" /></svg>);
const PlayIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path fillRule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.647c1.295.742 1.295 2.545 0 3.286L7.279 20.99c-1.25.717-2.779-.217-2.779-1.643V5.653Z" clipRule="evenodd" /></svg>);
const MenuIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 0 24 24" width="24px" fill="currentColor"><path d="M0 0h24v24H0z" fill="none"/><path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/></svg>);
const CloseIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 0 24 24" width="24px" fill="currentColor"><path d="M0 0h24v24H0z" fill="none"/><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>);
const RestartIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 0 24 24" width="24px" fill="currentColor"><path d="M0 0h24v24H0z" fill="none"/><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/></svg>);
const TrophyIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M15.5 13H14v-2h1.5a2.5 2.5 0 0 0 2.5-2.5A2.5 2.5 0 0 0 15.5 6h-7A2.5 2.5 0 0 0 6 8.5A2.5 2.5 0 0 0 8.5 11H10v2H8.5A4.5 4.5 0 0 1 4 8.5A4.5 4.5 0 0 1 8.5 4h7A4.5 4.5 0 0 1 20 8.5a4.5 4.5 0 0 1-4.5 4.5Zm-5.85 2h4.7L12 17.85 9.65 15ZM12 21l-3-3H4v-2h5l3 3 3-3h5v2h-5l-3 3Z"/></svg>);
const StarIcon = ({ filled }) => (<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 0 24 24" width="24px" fill="currentColor"><path d="M0 0h24v24H0z" fill="none"/><path d={filled ? "M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" : "M22 9.24l-7.19-.62L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.63-7.03L22 9.24zM12 15.4l-3.76 2.27 1-4.28-3.32-2.88 4.38-.38L12 6.1l1.71 4.04 4.38.38-3.32 2.88 1 4.28L12 15.4z"}/></svg>);
const HistoryIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 0 24 24" width="24px" fill="currentColor"><path d="M0 0h24v24H0z" fill="none"/><path d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/></svg>);
const SunIcon = () => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M12 2.25a.75.75 0 0 1 .75.75v2.25a.75.75 0 0 1-1.5 0V3a.75.75 0 0 1 .75-.75ZM7.5 12a4.5 4.5 0 1 1 9 0 4.5 4.5 0 0 1-9 0ZM18.894 6.106a.75.75 0 0 1 1.06-1.06l1.591 1.59a.75.75 0 1 1-1.06 1.06l-1.591-1.59ZM21.75 12a.75.75 0 0 1-.75.75h-2.25a.75.75 0 0 1 0-1.5h2.25a.75.75 0 0 1 .75.75ZM17.894 17.894a.75.75 0 0 1 1.06 1.06l-1.59 1.591a.75.75 0 1 1-1.06-1.06l1.59-1.591ZM12 18.75a.75.75 0 0 1 .75.75v2.25a.75.75 0 0 1-1.5 0v-2.25a.75.75 0 0 1 .75-.75ZM5.106 17.894a.75.75 0 0 1 1.06-1.06l1.591 1.59a.75.75 0 1 1-1.06 1.06l-1.591-1.59ZM4.5 12a.75.75 0 0 1-.75.75H1.5a.75.75 0 0 1 0-1.5h2.25a.75.75 0 0 1 .75.75ZM6.106 5.106a.75.75 0 0 1 1.06 1.06l-1.59 1.591a.75.75 0 1 1-1.06-1.06l1.59-1.591Z" /></svg>;
const MoonIcon = () => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path fillRule="evenodd" d="M9.528 1.718a.75.75 0 0 1 .162.819A8.97 8.97 0 0 0 9 6a9 9 0 0 0 9 9 8.97 8.97 0 0 0 3.463-.69.75.75 0 0 1 .981.981A10.503 10.503 0 0 1 18 18a10.5 10.5 0 0 1-10.5-10.5c0-1.81.46-3.516 1.255-5.042a.75.75 0 0 1 .819-.162Z" clipRule="evenodd" /></svg>;
const SystemIcon = () => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path fillRule="evenodd" d="M2.25 5.25a3 3 0 0 1 3-3h13.5a3 3 0 0 1 3 3v10.5a3 3 0 0 1-3 3H5.25a3 3 0 0 1-3-3V5.25ZM5.25 4.5a.75.75 0 0 0-.75.75v10.5a.75.75 0 0 0 .75.75h13.5a.75.75 0 0 0 .75-.75V5.25a.75.75 0 0 0-.75-.75H5.25Z" clipRule="evenodd" /></svg>;
const BookOpenIcon = () => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path fillRule="evenodd" d="M10.5 3.75a2.25 2.25 0 0 0-2.25 2.25v10.5a2.25 2.25 0 0 0 2.25 2.25h3a2.25 2.25 0 0 0 2.25-2.25V6a2.25 2.25 0 0 0-2.25-2.25h-3ZM9 6a.75.75 0 0 1 .75-.75h4.5a.75.75 0 0 1 .75.75v10.5a.75.75 0 0 1-.75-.75h-4.5a.75.75 0 0 1-.75-.75V6Z" clipRule="evenodd" /><path d="M6.75 5.25a2.25 2.25 0 0 0-2.25 2.25v10.5a2.25 2.25 0 0 0 2.25 2.25H9v-1.5H6.75A.75.75 0 0 1 6 16.5V7.5a.75.75 0 0 1 .75-.75h2.25V5.25H6.75Z" /><path d="M17.25 5.25a2.25 2.25 0 0 1 2.25 2.25v10.5a2.25 2.25 0 0 1-2.25 2.25H15v-1.5h2.25a.75.75 0 0 0 .75-.75V7.5a.75.75 0 0 0-.75-.75h-2.25V5.25h2.25Z" /></svg>;
const PuzzlePieceIcon = () => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path fillRule="evenodd" d="M12.963 2.286a.75.75 0 0 0-1.071 1.052A3.75 3.75 0 0 1 15.75 6H18a.75.75 0 0 0 0-1.5h-2.25a2.25 2.25 0 0 0-1.787-2.214ZM10.5 6a.75.75 0 0 0 0 1.5h3a.75.75 0 0 0 0-1.5h-3Z" clipRule="evenodd" /><path d="M12 1.5A10.5 10.5 0 1 0 22.5 12 10.5 10.5 0 0 0 12 1.5ZM3.75 12a8.25 8.25 0 1 1 14.228 5.472.75.75 0 0 0-.584.876 9.752 9.752 0 0 1-1.65 3.423.75.75 0 0 0 1.115.986 11.252 11.252 0 0 0 1.905-3.92.75.75 0 0 0-.9-1.018 8.25 8.25 0 0 1-5.182 1.036.75.75 0 0 0-.74-1.233A8.25 8.25 0 0 1 3.75 12Z" /></svg>;
const LanguageIcon = () => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path fillRule="evenodd" d="M8.25 6.75a3.75 3.75 0 0 0-3.75 3.75v.518c.928.09 1.815.24 2.65.443V10.5a1.125 1.125 0 0 1 1.125-1.125h1.5v6.75h-1.5a1.125 1.125 0 0 1-1.125-1.125v-.345a3.74 3.74 0 0 0-2.65.443v.518a3.75 3.75 0 0 0 3.75 3.75h1.5a.75.75 0 0 0 .75-.75v-9a.75.75 0 0 0-.75-.75h-1.5Z" clipRule="evenodd" /><path d="M12.75 2.25a.75.75 0 0 0-1.5 0v.512a14.28 14.28 0 0 0 1.5 0V2.25Z" /><path fillRule="evenodd" d="M12.75 5.493A12.75 12.75 0 0 0 12 5.25c-3.13 0-6.064 1.138-8.467 3.003a.75.75 0 1 0 .934 1.164A11.25 11.25 0 0 1 12 6.75c3.513 0 6.756 1.62 8.878 4.148a.75.75 0 1 0 1.244-.828A12.75 12.75 0 0 0 12.75 5.493Z" clipRule="evenodd" /><path d="M12.75 20.25a.75.75 0 0 0 1.5 0v-.512a14.28 14.28 0 0 0-1.5 0v.512Z" /><path fillRule="evenodd" d="M12.75 18.507A12.75 12.75 0 0 1 12 18.75c-3.13 0-6.064-1.138-8.467-3.003a.75.75 0 1 1 .934-1.164A11.25 11.25 0 0 0 12 17.25c3.513 0 6.756-1.62 8.878-4.148a.75.75 0 1 1 1.244.828A12.75 12.75 0 0 1 12.75 18.507Z" clipRule="evenodd" /></svg>;
const ChatBubbleIcon = () => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path fillRule="evenodd" d="M4.848 2.771A49.144 49.144 0 0 1 12 2.25c2.43 0 4.817.178 7.152.52 1.978.292 3.348 2.024 3.348 3.97v6.02c0 1.946-1.37 3.678-3.348 3.97a48.901 48.901 0 0 1-3.476.383.75.75 0 0 0-.646.434l-1.457 2.108a2.625 2.625 0 0 1-4.45 0l-1.457-2.108a.75.75 0 0 0-.646-.434 48.9 48.9 0 0 1-3.476-.384c-1.978-.29-3.348-2.024-3.348-3.97V6.74c0-1.946 1.37-3.68 3.348-3.97Z" clipRule="evenodd" /></svg>;
const SparklesIcon = () => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="40px" height="40px"><path fillRule="evenodd" d="M9 4.5a.75.75 0 0 1 .75.75v3.546a.75.75 0 0 1-1.5 0V5.25A.75.75 0 0 1 9 4.5Zm6.375 3.75a.75.75 0 0 0-1.5 0v3.546a.75.75 0 0 0 1.5 0V8.25Zm-10.5 3.75A.75.75 0 0 1 5.625 12v3.546a.75.75 0 0 1-1.5 0V12a.75.75 0 0 1 .75-.75Zm16.5 0a.75.75 0 0 0-1.5 0v3.546a.75.75 0 0 0 1.5 0V12Zm-1.875-5.25a.75.75 0 0 0-1.5 0v3.546a.75.75 0 0 0 1.5 0V6.75ZM7.125 9a.75.75 0 0 1 .75.75v3.546a.75.75 0 0 1-1.5 0V9.75a.75.75 0 0 1 .75-.75Zm8.25 1.5a.75.75 0 0 0-1.5 0v3.546a.75.75 0 0 0 1.5 0v-3.546Zm-4.5 3.75a.75.75 0 0 1 .75.75v3.546a.75.75 0 0 1-1.5 0v-3.546a.75.75 0 0 1 .75-.75Z" clipRule="evenodd" /><path d="M12 2.25a.75.75 0 0 1 .75.75v1.285a.75.75 0 0 1-1.5 0V3a.75.75 0 0 1 .75-.75Zm-4.5 3a.75.75 0 0 0-1.5 0v1.285a.75.75 0 0 0 1.5 0V5.25Zm9 0a.75.75 0 0 0-1.5 0v1.285a.75.75 0 0 0 1.5 0V5.25Zm-9 9.75a.75.75 0 0 1 .75.75v1.285a.75.75 0 0 1-1.5 0v-1.285a.75.75 0 0 1 .75-.75Zm4.5 3a.75.75 0 0 0-1.5 0v1.285a.75.75 0 0 0 1.5 0V18Zm4.5-3a.75.75 0 0 1 .75.75v1.285a.75.75 0 0 1-1.5 0v-1.285a.75.75 0 0 1 .75-.75Z" /></svg>;
const SendIcon = () => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" /></svg>;
const UserIcon = () => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path fillRule="evenodd" d="M18.685 19.097A9.723 9.723 0 0 0 21.75 12c0-5.385-4.365-9.75-9.75-9.75S2.25 6.615 2.25 12a9.723 9.723 0 0 0 3.065 7.097A9.716 9.716 0 0 0 12 21.75a9.716 9.716 0 0 0 6.685-2.653Zm-12.54-1.285A7.486 7.486 0 0 1 12 15a7.486 7.486 0 0 1 5.855 2.812A8.224 8.224 0 0 1 12 20.25a8.224 8.224 0 0 1-5.855-2.438ZM15.75 9a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" clipRule="evenodd" /></svg>;
const RobotIcon = () => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M11.25 4.533A9.718 9.718 0 0 0 9.75 4.5c-2.99 0-5.632 1.306-7.518 3.332A.75.75 0 0 0 3 8.627v8.94c-1.011-.123-1.85-.964-1.977-1.983a.75.75 0 0 0-1.493.155 3.5 3.5 0 0 0 3.47 3.494.75.75 0 0 0 .75-.75v-1.727a9.702 9.702 0 0 0 6-2.122c.14-.105.277-.213.41-.325a.75.75 0 0 0 0-1.246 12.012 12.012 0 0 1-1.64-1.285 3 3 0 0 1-3.238-4.372c.414-.303.882-.544 1.396-.713A9.682 9.682 0 0 0 11.25 4.533Z" /><path d="M14.25 4.5a9.718 9.718 0 0 1 1.5.033c.316.035.628.082.934.141A3 3 0 0 1 19.5 7.5v.726a4.5 4.5 0 0 1 4.5 4.5v.001a4.5 4.5 0 0 1-4.5 4.5v.726a3 3 0 0 1-2.816 2.992 9.72 9.72 0 0 1-1.434.182 9.718 9.718 0 0 1-1.5.033A9.682 9.682 0 0 0 12 19.34a3 3 0 0 1-3.238-4.372c.414-.303.882-.544 1.396-.713A9.682 9.682 0 0 0 14.25 4.5Zm3 5.25a.75.75 0 0 0-1.5 0v3a.75.75 0 0 0 1.5 0v-3Z" /></svg>;
const ShuffleIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 0 24 24" width="24px" fill="currentColor"><path d="M0 0h24v24H0z" fill="none"/><path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"/></svg>);


// --- CONTEXT ---
const AppContext = createContext<AppContextType | null>(null);
const AuthContext = createContext<AuthContextType | null>(null);
const useAuth = () => useContext(AuthContext);

// --- HELPER HOOK for keyboard accessibility ---
const useAccessibleClick = (onClick, deps = []) => {
    return useCallback((e) => {
        if (e.type === 'click' || e.key === 'Enter' || e.key === ' ') {
            if(e.type !== 'click') e.preventDefault();
            onClick();
        }
    }, deps);
};


// --- COMPONENTS ---
const Header = ({ currentPage, setCurrentPage }) => {
  const { themePreference, setThemePreference } = useContext(AppContext);
  const { user, logout } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const linkRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [indicatorStyle, setIndicatorStyle] = useState({});
  
  const navLinks = useMemo(() => {
    const links = ['Accueil', 'Dictionnaire', 'Tuteur IA', 'Favoris', 'Historique', 'Guide', 'Le Faka\'uvea', 'Jeux', 'Certification'];
    if (user?.role === 'admin') {
        links.push('Gestion');
    }
    return links;
  }, [user]);

  useLayoutEffect(() => {
    const activeLinkIndex = navLinks.findIndex(p => p === currentPage);
    const activeLinkEl = linkRefs.current[activeLinkIndex];

    if (activeLinkEl && navRef.current) {
        // Only apply sliding indicator styles if not in mobile view
        if (window.innerWidth > 950) {
            setIndicatorStyle({
                transform: `translateX(${activeLinkEl.offsetLeft}px)`,
                width: `${activeLinkEl.offsetWidth}px`,
                opacity: 1,
            });
        } else {
             setIndicatorStyle({ opacity: 0 });
        }
    }
  }, [currentPage, navLinks, isMenuOpen]); // Re-calculate on page change and when menu opens/closes


  const handleNavClick = (page) => {
    setCurrentPage(page);
    setIsMenuOpen(false);
  }
  
  const handleThemeChange = (theme: ThemePreference) => {
    setThemePreference(theme);
    setIsThemeMenuOpen(false);
  }

  const NavContent = () => (
    <>
      <nav className="header-nav" ref={navRef}>
        <div className="nav-indicator" style={indicatorStyle} />
        {navLinks.map((page, index) => (
          <button
            key={page}
            ref={el => { linkRefs.current[index] = el; }}
            onClick={() => handleNavClick(page)}
            className="nav-link"
            aria-current={currentPage === page ? 'page' : undefined}
          >
            {page}
          </button>
        ))}
      </nav>
      <div className="header-right-panel">
        {user && <span className="user-info">Bonjour, {user.username}</span>}
        {user && <button onClick={logout} className="logout-button">Déconnexion</button>}
        <div className="theme-selector-wrapper">
          <button onClick={() => setIsThemeMenuOpen(!isThemeMenuOpen)} className="theme-switcher-button" aria-label="Changer le thème">
             {themePreference === 'light' ? <SunIcon/> : themePreference === 'dark' ? <MoonIcon/> : <SystemIcon/>}
          </button>
          {isThemeMenuOpen && (
              <div className="theme-dropdown">
                  <button onClick={() => handleThemeChange('light')}><SunIcon /> Clair</button>
                  <button onClick={() => handleThemeChange('dark')}><MoonIcon /> Sombre</button>
                  <button onClick={() => handleThemeChange('system')}><SystemIcon /> Système</button>
              </div>
          )}
        </div>
      </div>
    </>
  );

  return (
    <header className="app-header">
      <h1 className="header-title">Faka'uvea</h1>
      <div className="desktop-nav">
        <NavContent />
      </div>
      <button className="mobile-menu-button" onClick={() => setIsMenuOpen(!isMenuOpen)} aria-label="Ouvrir le menu de navigation">
        {isMenuOpen ? <CloseIcon /> : <MenuIcon />}
      </button>
      {isMenuOpen && <div className="mobile-nav"><NavContent /></div>}
    </header>
  );
};

const WordCard = ({ entry, index }) => {
  const { speak, favorites, toggleFavorite, logHistory } = useContext(AppContext);
  const isFavorite = favorites.includes(entry.faka_uvea);
  const hasAuthenticAudio = !!entry.audio_url;

  const handleFavoriteClick = (e) => {
    e.stopPropagation();
    toggleFavorite(entry.faka_uvea);
  };

  const handleSpeakClick = (e) => {
      e.stopPropagation();
      speak(entry);
  };

  const handleCardKeyDown = (e) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        logHistory(entry.faka_uvea);
    }
  };

  return (
    <article 
        className="word-card" 
        style={{ animationDelay: `${index * 50}ms` }}
        onClick={() => logHistory(entry.faka_uvea)} 
        onKeyDown={handleCardKeyDown}
        role="button" 
        tabIndex={0}
        aria-label={`Voir les détails pour le mot ${entry.faka_uvea}`}
    >
        {entry.image_url && <img src={entry.image_url} alt={`Illustration pour ${entry.faka_uvea}`} className="word-card-image" />}
        <div className="word-card-content">
            <div className="word-card-header">
                <div>
                    <h3>{entry.faka_uvea}</h3>
                    {entry.phonetic && <span className="word-details">{entry.phonetic}</span>}
                </div>
                <div className="word-card-actions">
                    <button 
                        className={`favorite-btn ${isFavorite ? 'active' : ''}`} 
                        onClick={handleFavoriteClick} 
                        aria-label={isFavorite ? `Retirer ${entry.faka_uvea} des favoris` : `Ajouter ${entry.faka_uvea} aux favoris`}
                    >
                        <StarIcon filled={isFavorite} />
                    </button>
                    <button 
                        className={`tts-button ${hasAuthenticAudio ? 'authentic-audio' : ''}`}
                        onClick={handleSpeakClick} 
                        aria-label={`Écouter le mot ${entry.faka_uvea}`}
                    >
                        <SpeakerIcon />
                    </button>
                </div>
            </div>
            <p className="word-details">{entry.type}</p>
            <p className="word-translation">{entry.french}</p>
            {entry.examples.length > 0 && (
                <div className="word-example">
                    <p className="faka-uvea-example">{entry.examples[0].faka_uvea}</p>
                    <p>{entry.examples[0].french}</p>
                </div>
            )}
        </div>
    </article>
  );
};

const NoResults = ({ message, icon = null, suggestion = null, onSuggestionClick = null, children = null }) => (
    <div className="no-results">
        {icon || <svg xmlns="http://www.w3.org/2000/svg" height="60px" viewBox="0 0 24 24" width="60px" fill="currentColor"><path d="M0 0h24v24H0V0z" fill="none"/><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>}
        <p>{message}</p>
        {suggestion && onSuggestionClick && (
            <p className="suggestion-text">
                Vouliez-vous dire : <a href="#" onClick={(e) => { e.preventDefault(); onSuggestionClick(suggestion); }}>{suggestion}</a> ?
            </p>
        )}
        {children && <div className="no-results-action">{children}</div>}
    </div>
);


const HomePage = ({ setCurrentPage }) => {
    const wordOfTheDay = useMemo(() => {
        const dayOfYear = Math.floor((new Date().getTime() - new Date(new Date().getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24));
        return DICTIONARY_DATA[dayOfYear % DICTIONARY_DATA.length];
    }, []);

    const createClickHandler = (page) => (e: React.MouseEvent | React.KeyboardEvent) => {
        if (e.type === 'click' || (e as React.KeyboardEvent).key === 'Enter' || (e as React.KeyboardEvent).key === ' ') {
            if(e.type !== 'click') e.preventDefault();
            setCurrentPage(page);
        }
    };
    
    const features = [
        { page: 'Dictionnaire', title: 'Dictionnaire', description: "Cherchez, filtrez et découvrez des mots.", icon: <BookOpenIcon /> },
        { page: 'Tuteur IA', title: 'Tuteur IA', description: "Pratiquez la conversation avec notre tuteur intelligent.", icon: <SparklesIcon/> },
        { page: 'Favoris', title: 'Mots Favoris', description: "Consultez votre liste de mots sauvegardés.", icon: <StarIcon filled={true} /> },
        { page: 'Guide', title: 'Guide de conversation', description: "Apprenez les phrases essentielles pour le quotidien.", icon: <ChatBubbleIcon /> },
        { page: 'Le Faka\'uvea', title: 'La Langue', description: "Explorez l'alphabet, la prononciation et la grammaire.", icon: <LanguageIcon /> },
        { page: 'Jeux', title: 'Jeux Ludiques', description: "Testez vos connaissances de manière amusante.", icon: <PuzzlePieceIcon /> },
        { page: 'Certification', title: 'Certification', description: "Validez votre niveau et obtenez un certificat.", icon: <TrophyIcon /> },
    ];

    return (
        <div className="home-page">
            <section className="home-hero">
                <h1 className="hero-title">Mālō te ma'uli i te Lalolagi o Faka'uvea</h1>
                <p className="hero-subtitle">Votre portail pour explorer la richesse de la langue et de la culture wallisienne.</p>
                <button className="button-primary" onClick={() => setCurrentPage('Dictionnaire')}>
                    Explorer le dictionnaire
                </button>
            </section>

            <section className="home-section">
                <h2>Mot du jour</h2>
                <div className="word-of-the-day">
                    {wordOfTheDay && <WordCard entry={wordOfTheDay} index={0} />}
                </div>
            </section>
            
            <section className="home-section">
                <h2>Commencez votre voyage</h2>
                <div className="features-grid">
                    {features.map(({ page, title, description, icon }) => (
                         <div key={page} className="feature-card" onClick={createClickHandler(page)} onKeyDown={createClickHandler(page)} role="button" tabIndex={0}>
                            <div className="feature-card-icon">{icon}</div>
                            <h4>{title}</h4>
                            <p>{description}</p>
                        </div>
                    ))}
                </div>
            </section>
        </div>
    );
};

const DictionaryPage = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeLetter, setActiveLetter] = useState('A');
  const [suggestion, setSuggestion] = useState<string | null>(null);

  const filteredData = useMemo(() => {
    return DICTIONARY_DATA.filter(entry => {
        const matchesSearch = searchTerm === '' ||
            entry.faka_uvea.toLowerCase().includes(searchTerm.toLowerCase()) ||
            entry.french.toLowerCase().includes(searchTerm.toLowerCase());
        
        const matchesLetter = activeLetter === null ||
            entry.faka_uvea.toLowerCase().startsWith(activeLetter.toLowerCase());

        return matchesSearch && matchesLetter;
    });
  }, [searchTerm, activeLetter]);
  
  useEffect(() => {
    if (filteredData.length === 0 && searchTerm.length > 2) {
        let bestMatch: string | null = null;
        let minDistance = 4; // Max distance to consider a suggestion

        DICTIONARY_DATA.forEach(entry => {
            const distance = levenshteinDistance(searchTerm, entry.faka_uvea);
            if (distance < minDistance) {
                minDistance = distance;
                bestMatch = entry.faka_uvea;
            }
        });
        setSuggestion(bestMatch);
    } else {
        setSuggestion(null);
    }
  }, [filteredData, searchTerm]);

  const handleLetterClick = (letter) => {
    setActiveLetter(letter === activeLetter ? null : letter);
  }

  const handleSuggestionClick = (suggestedTerm) => {
    setSearchTerm(suggestedTerm);
    setSuggestion(null);
  }

  return (
    <>
      <h1 className="page-title">Dictionnaire</h1>
      <div className="dictionary-controls">
        <input type="search" placeholder="Rechercher en faka'uvea ou en français..." className="search-bar" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        <div className="alphabet-nav" role="navigation" aria-label="Navigation alphabétique">
          {ALPHABET_STATUS.map(({ letter, enabled }) => (
            <button key={letter} onClick={() => handleLetterClick(letter)} className={activeLetter === letter ? 'active' : ''} disabled={!enabled} aria-pressed={activeLetter === letter}>
              {letter}
            </button>
          ))}
          {activeLetter && <button className="clear" onClick={() => setActiveLetter(null)}>Tout</button>}
        </div>
      </div>
      <section className="word-grid" aria-live="polite">
        {filteredData.length > 0 ? (
          filteredData.map((entry, index) => <WordCard key={entry.faka_uvea} entry={entry} index={index} />)
        ) : (
          <NoResults 
            message="Aucun mot trouvé pour votre recherche." 
            suggestion={suggestion}
            onSuggestionClick={handleSuggestionClick}
          />
        )}
      </section>
    </>
  );
};

const FavoritesPage = () => {
    const { favorites, setCurrentPage } = useContext(AppContext);
    
    const favoriteEntries = useMemo(() => {
        return DICTIONARY_DATA.filter(entry => favorites.includes(entry.faka_uvea));
    }, [favorites]);

    return (
        <>
            <h1 className="page-title">Mes Favoris</h1>
            <section className="word-grid">
                {favoriteEntries.length > 0 ? (
                    favoriteEntries.map((entry, index) => <WordCard key={entry.faka_uvea} entry={entry} index={index} />)
                ) : (
                    <NoResults 
                        message="Vous n'avez pas encore ajouté de mots à vos favoris."
                        icon={<StarIcon filled={false} />}
                    >
                      <button className="button-primary" onClick={() => setCurrentPage('Dictionnaire')}>
                          Explorer le dictionnaire
                      </button>
                    </NoResults>
                )}
            </section>
        </>
    );
};

const HistoryPage = () => {
    const { history, setCurrentPage } = useContext(AppContext);
    
    const historyEntries = useMemo(() => {
        return history.map(word => DICTIONARY_DATA.find(entry => entry.faka_uvea === word)).filter(Boolean);
    }, [history]);

    return (
        <>
            <h1 className="page-title">Mon Historique</h1>
            <section className="word-grid">
                {historyEntries.length > 0 ? (
                    historyEntries.map((entry, index) => <WordCard key={entry.faka_uvea} entry={entry} index={index} />)
                ) : (
                    <NoResults 
                        message="Votre historique de consultation est vide."
                        icon={<HistoryIcon />}
                    >
                      <button className="button-primary" onClick={() => setCurrentPage('Dictionnaire')}>
                          Commencer à explorer
                      </button>
                    </NoResults>
                )}
            </section>
        </>
    );
};


const GuidePage = () => {
    const { speak } = useContext(AppContext);
    const [searchTerm, setSearchTerm] = useState('');

    const playCategory = (category) => {
        category.phrases.forEach((phrase, index) => {
            setTimeout(() => speak(phrase.faka_uvea), index * 2000);
        });
    };
    
    const filteredGuideData = useMemo(() => {
        if (!searchTerm) return GUIDE_DATA;
        const lowercasedFilter = searchTerm.toLowerCase();
        return GUIDE_DATA.map(category => {
            const matchingPhrases = category.phrases.filter(
                phrase => phrase.faka_uvea.toLowerCase().includes(lowercasedFilter) ||
                          phrase.french.toLowerCase().includes(lowercasedFilter)
            );
            return { ...category, phrases: matchingPhrases };
        }).filter(category => category.phrases.length > 0);
    }, [searchTerm]);

    return (
        <>
            <h1 className="page-title">Guide de conversation</h1>
            <div className="guide-controls">
                 <input 
                    type="search" 
                    placeholder="Rechercher une phrase..." 
                    className="search-bar" 
                    value={searchTerm} 
                    onChange={e => setSearchTerm(e.target.value)}
                 />
            </div>
            {filteredGuideData.map(category => (
                <section key={category.name} className="guide-category">
                    <div className="guide-category-header">
                        <h3>{category.name}</h3>
                        <button className="play-all-btn" onClick={() => playCategory(category)} aria-label={`Écouter toutes les phrases de la catégorie ${category.name}`}>
                            <PlayIcon />
                            <span>Tout lire</span>
                        </button>
                    </div>
                    <ul className="phrase-list">
                        {category.phrases.map((phrase, index) => (
                            <li key={phrase.faka_uvea} className="phrase-item" style={{ animationDelay: `${index * 50}ms` }}>
                                <div className="phrase-text">
                                    <p className="faka-uvea-phrase">{phrase.faka_uvea}</p>
                                    <p className="french-phrase">{phrase.french}</p>
                                </div>
                                <button className="tts-button" onClick={() => speak(phrase.faka_uvea)} aria-label={`Écouter la phrase ${phrase.faka_uvea}`}>
                                    <SpeakerIcon />
                                </button>
                            </li>
                        ))}
                    </ul>
                </section>
            ))}
            {filteredGuideData.length === 0 && (
                <NoResults message="Aucune phrase trouvée pour votre recherche." />
            )}
        </>
    );
};

const AITutorPage = () => {
    const [chat, setChat] = useState<Chat | null>(null);
    const [messages, setMessages] = useState<{ role: 'user' | 'model', text: string }[]>([]);
    const [userInput, setUserInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const chatWindowRef = useRef<HTMLDivElement>(null);

    // System instruction for the AI tutor
    const systemInstruction = `You are a friendly and patient language tutor for Faka'uvea (Wallisian language). Your name is 'Kele'.
- If the user speaks in French, respond primarily in Faka'uvea with the French translation below it in parentheses. For example: "Io, e lelei. (Oui, c'est bien.)"
- If the user speaks in Faka'uvea, respond in Faka'uvea. If their Faka'uvea has a minor error, gently correct it in your response and explain the correction briefly in French in parentheses. For example: "Mālō te ma'uli! (Note: 'lelei ma'uli' is less common, 'mālō te ma'uli' is the standard greeting)".
- Keep your answers relatively short and conversational, suitable for a language learner.
- Your goal is to encourage practice and make learning fun.
- Start the conversation by introducing yourself in Faka'uvea and asking how you can help.`;

    // Initialize chat
    useEffect(() => {
        const initChat = async () => {
            setIsLoading(true);
            try {
                const newChat = ai.chats.create({
                    model: 'gemini-2.5-flash',
                    config: { systemInstruction },
                    history: []
                });
                setChat(newChat);
    
                const stream = await newChat.sendMessageStream({ message: "Introduce yourself and greet the user." });
                
                let fullText = "";
                for await (const chunk of stream) {
                    fullText += chunk.text;
                }
                
                setMessages([{ role: 'model', text: fullText }]);
            } catch (error) {
                console.error("AI Tutor Initialization Error:", error);
                setMessages([{ role: 'model', text: "Désolé, une erreur est survenue lors de l'initialisation du tuteur. Assurez-vous que la clé API est configurée."}]);
            } finally {
                setIsLoading(false);
            }
        };
        initChat();
    }, []);

    // Scroll to bottom of chat window
    useEffect(() => {
        if (chatWindowRef.current) {
            chatWindowRef.current.scrollTop = chatWindowRef.current.scrollHeight;
        }
    }, [messages, isLoading]);

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!userInput.trim() || isLoading || !chat) return;

        const userMessage = { role: 'user' as const, text: userInput };
        setMessages(prev => [...prev, userMessage]);
        const currentInput = userInput;
        setUserInput('');
        setIsLoading(true);

        try {
            const stream = await chat.sendMessageStream({ message: currentInput });
            
            let fullText = "";
            setMessages(prev => [...prev, { role: 'model', text: '' }]);

            for await (const chunk of stream) {
                fullText += chunk.text;
                setMessages(prev => {
                    const newMessages = [...prev];
                    newMessages[newMessages.length - 1] = { role: 'model', text: fullText };
                    return newMessages;
                });
            }

        } catch (error) {
            console.error("Error sending message:", error);
            setMessages(prev => [...prev, { role: 'model', text: "Désolé, une erreur s'est produite. Veuillez réessayer." }]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="ai-tutor-page-container">
            <div className="ai-tutor-page">
                <div className="ai-tutor-header">
                    <h1 className="page-title">Tuteur IA</h1>
                    <p className="page-subtitle">Discutez avec Kele, votre partenaire de conversation en Faka'uvea.</p>
                </div>
                <div className="chat-window" ref={chatWindowRef}>
                    {messages.map((msg, index) => (
                        <div key={index} className={`chat-message ${msg.role === 'user' ? 'user-message' : 'ai-message'}`}>
                            <div className="message-avatar">
                                {msg.role === 'user' ? <UserIcon /> : <RobotIcon />}
                            </div>
                            <div className="message-content">
                                <p>{msg.text}</p>
                            </div>
                        </div>
                    ))}
                    {isLoading && messages[messages.length-1]?.role === 'user' && (
                         <div className="chat-message ai-message">
                            <div className="message-avatar"><RobotIcon /></div>
                            <div className="message-content">
                                <div className="loading-indicator">
                                    <span></span><span></span><span></span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
                <form onSubmit={handleSendMessage} className="chat-input-form">
                    <input
                        type="text"
                        className="chat-input"
                        value={userInput}
                        onChange={(e) => setUserInput(e.target.value)}
                        placeholder="Envoyer un message à Kele..."
                        disabled={isLoading || !chat}
                        aria-label="Votre message"
                    />
                    <button type="submit" className="send-button" disabled={isLoading || !userInput.trim() || !chat} aria-label="Envoyer">
                        <SendIcon />
                    </button>
                </form>
            </div>
        </div>
    );
};


const FakaUveaInfoPage = () => {
    return (
        <div className="faka-uvea-info-page">
            <h1 className="page-title">À propos du Faka'uvea</h1>
            
            <section className="info-section">
                <h2>L'Alphabet (Te 'Alefapeto)</h2>
                <p>L'alphabet wallisien est un alphabet latin qui comporte 16 lettres.</p>
                <div className="alphabet-list">
                    {ALPHABET_STATUS.map(({ letter }) => <span key={letter} className="alphabet-letter">{letter}</span>)}
                </div>
            </section>
            
            <section className="info-section">
                <h2>La Prononciation</h2>
                <p>La prononciation est assez régulière et phonétique.</p>
                <dl className="pronunciation-guide">
                    <dt>Voyelles</dt>
                    <dd>Les 5 voyelles <strong>(a, e, i, o, u)</strong> se prononcent comme en espagnol ou en italien : [a], [e], [i], [o], [u]. Elles peuvent être brèves ou longues (notées avec un macron, ex: ā), ce qui peut changer le sens du mot.</dd>
                    
                    <dt>Consonne 'g'</dt>
                    <dd>La lettre <strong>g</strong> se prononce toujours comme le son "ng" dans le mot anglais "singer" ou le mot français "parking". Elle correspond au son nasal vélaire [ŋ].</dd>

                    <dt>Le coup de glotte (fakau'a)</dt>
                    <dd>Représenté par une apostrophe ' (nommée <em>fakau'a</em>), il marque une brève interruption du son, similaire à la pause au milieu de l'interjection anglaise "uh-oh!". C'est une consonne à part entière.</dd>
                </dl>
            </section>

            <section className="info-section">
                <h2>Structure de la Phrase</h2>
                <p>Le Faka'uvea suit majoritairement un ordre <strong>Verbe-Sujet-Objet (VSO)</strong>.</p>
                <div className="word-example">
                    <p className="faka-uvea-example">E alu au ki te api.</p>
                    <p><em>(Verbe: alu - Sujet: au - Objet: ki te api)</em></p>
                    <p>"Je vais à la maison." (Lit: "Va je à la maison.")</p>
                </div>
            </section>
        </div>
    );
};


const MemoryGame = () => {
    const [cards, setCards] = useState([]);
    const [flipped, setFlipped] = useState([]);
    const [matched, setMatched] = useState([]);
    const [moves, setMoves] = useState(0);

    const setupGame = useCallback(() => {
        const words = [...DICTIONARY_DATA].sort(() => 0.5 - Math.random()).slice(0, 6);
        const gameCards = words.flatMap((word, i) => [
            { id: i + '_w', value: word.faka_uvea, pairId: i },
            { id: i + '_f', value: word.french, pairId: i },
        ]).sort(() => 0.5 - Math.random());
        setCards(gameCards);
        setFlipped([]);
        setMatched([]);
        setMoves(0);
    }, []);

    useEffect(() => {
        setupGame();
    }, [setupGame]);

    const handleFlip = (index) => {
        if (flipped.length === 2 || flipped.includes(index) || matched.includes(cards[index].pairId)) return;
        const newFlipped = [...flipped, index];
        setFlipped(newFlipped);
    
        if (newFlipped.length === 2) {
            setMoves(m => m + 1);
            const [firstIndex, secondIndex] = newFlipped;
            if (cards[firstIndex].pairId === cards[secondIndex].pairId) {
                setMatched(m => [...m, cards[firstIndex].pairId]);
                setFlipped([]);
            } else {
                setTimeout(() => setFlipped([]), 1200);
            }
        }
    };
    
    return (
        <div className="memory-game-container">
            <div className="game-controls">
                <p>Paires trouvées: {matched.length} / 6</p>
                <p>Mouvements: {moves}</p>
                <button onClick={setupGame} aria-label="Recommencer la partie"><RestartIcon /></button>
            </div>
            {matched.length === 6 && <p className="game-win-message">Félicitations ! Vous avez gagné !</p>}
            <div className="memory-grid">
                {cards.map((card, index) => (
                    <div
                        key={card.id}
                        className={`memory-card ${flipped.includes(index) ? 'flipped' : ''} ${matched.includes(card.pairId) ? 'matched' : ''}`}
                        onClick={() => handleFlip(index)}
                        role="button"
                        aria-pressed={flipped.includes(index)}
                    >
                        <div className="card-face card-face-front"></div>
                        <div className="card-face card-face-back">{card.value}</div>
                    </div>
                ))}
            </div>
        </div>
    );
};

const Flashcards = () => {
    const [cards, setCards] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isFlipped, setIsFlipped] = useState(false);

    const shuffleAndSetCards = useCallback(() => {
        const shuffled = [...DICTIONARY_DATA].sort(() => 0.5 - Math.random());
        setCards(shuffled);
        setCurrentIndex(0);
        setIsFlipped(false);
    }, []);

    useEffect(() => {
        shuffleAndSetCards();
    }, [shuffleAndSetCards]);

    if (cards.length === 0) {
        return <p>Chargement des flashcards...</p>;
    }

    const card = cards[currentIndex];

    const handleNext = () => {
        setIsFlipped(false);
        setTimeout(() => setCurrentIndex((i) => (i + 1) % cards.length), 150);
    };

    const handlePrev = () => {
        setIsFlipped(false);
        setTimeout(() => setCurrentIndex((i) => (i - 1 + cards.length) % cards.length), 150);
    };

    return (
        <div className="flashcards-container">
            <div className="flashcard-deck">
                <div 
                    className={`flashcard ${isFlipped ? 'flipped' : ''}`}
                    onClick={() => setIsFlipped(!isFlipped)}
                >
                    <div className="flashcard-face flashcard-face-front">{card.faka_uvea}</div>
                    <div className="flashcard-face flashcard-face-back">{card.french}</div>
                </div>
            </div>
            <div className="flashcard-controls">
                <button onClick={handlePrev}>Précédent</button>
                <span>{currentIndex + 1} / {cards.length}</span>
                <button onClick={handleNext}>Suivant</button>
            </div>
             <button onClick={shuffleAndSetCards} className="shuffle-button"><RestartIcon/> Mélanger</button>
        </div>
    );
};

const WordScrambleGame = () => {
    const [currentWord, setCurrentWord] = useState<DictionaryEntry | null>(null);
    const [scrambled, setScrambled] = useState<string[]>([]);
    const [answer, setAnswer] = useState<string[]>([]);
    const [feedback, setFeedback] = useState<'correct' | 'incorrect' | ''>('');
    const [isSolved, setIsSolved] = useState(false);

    const setupNewWord = useCallback(() => {
        const wordPool = DICTIONARY_DATA.filter(w => w.faka_uvea.length > 3 && w.faka_uvea.length < 10 && !w.faka_uvea.includes(' '));
        const word = wordPool[Math.floor(Math.random() * wordPool.length)];
        setCurrentWord(word);
        
        let shuffledLetters = word.faka_uvea.split('').sort(() => Math.random() - 0.5);
        // Ensure it's not the same as the original word
        while (shuffledLetters.join('') === word.faka_uvea) {
            shuffledLetters = word.faka_uvea.split('').sort(() => Math.random() - 0.5);
        }
        
        setScrambled(shuffledLetters);
        setAnswer([]);
        setFeedback('');
        setIsSolved(false);
    }, []);

    useEffect(() => {
        setupNewWord();
    }, [setupNewWord]);

    const handleLetterClick = (letter, index) => {
        setAnswer([...answer, letter]);
        const newScrambled = [...scrambled];
        newScrambled.splice(index, 1);
        setScrambled(newScrambled);
    };

    const handleAnswerLetterClick = (letter, index) => {
        setScrambled([...scrambled, letter]);
        const newAnswer = [...answer];
        newAnswer.splice(index, 1);
        setAnswer(newAnswer);
    };

    useEffect(() => {
        if (currentWord && answer.length === currentWord.faka_uvea.length) {
            const isCorrect = answer.join('') === currentWord.faka_uvea;
            setFeedback(isCorrect ? 'correct' : 'incorrect');
            if (isCorrect) {
                setIsSolved(true);
            }
        } else {
            setFeedback('');
        }
    }, [answer, currentWord]);
    
    if (!currentWord) return <div>Chargement du jeu...</div>;

    return (
        <div className="word-scramble-game">
            <div className="scramble-clue">
                {currentWord.image_url && <img src={currentWord.image_url} alt="Indice visuel" className="scramble-image"/>}
                <p className="scramble-translation">Traduction : <strong>{currentWord.french}</strong></p>
            </div>
            
            <div className={`scramble-answer-area ${feedback}`}>
                {answer.map((letter, index) => (
                    <button key={index} className="scramble-tile in-answer" onClick={() => handleAnswerLetterClick(letter, index)}>
                        {letter}
                    </button>
                ))}
                {Array(currentWord.faka_uvea.length - answer.length).fill(0).map((_, index) => (
                    <div key={index} className="scramble-slot" />
                ))}
            </div>

            <div className="scramble-letters">
                {scrambled.map((letter, index) => (
                    <button key={index} className="scramble-tile" onClick={() => handleLetterClick(letter, index)} disabled={isSolved}>
                        {letter}
                    </button>
                ))}
            </div>
            
            {isSolved && (
                 <div className="scramble-feedback correct">
                    <p>Bravo ! C'était bien "{currentWord.faka_uvea}".</p>
                </div>
            )}
            
            <div className="scramble-controls">
                <button onClick={setupNewWord} className="button-primary">
                    <ShuffleIcon /> Mot suivant
                </button>
            </div>
        </div>
    );
};


const GamesPage = () => {
    const [activeTab, setActiveTab] = useState('Memory');
    return (
        <>
            <h1 className="page-title">Jeux Ludiques</h1>
            <div className="game-tabs">
                <button onClick={() => setActiveTab('Memory')} className={activeTab === 'Memory' ? 'active' : ''}>Jeu de Mémoire</button>
                <button onClick={() => setActiveTab('Flashcards')} className={activeTab === 'Flashcards' ? 'active' : ''}>Flashcards</button>
                <button onClick={() => setActiveTab('Mots Mêlés')} className={activeTab === 'Mots Mêlés' ? 'active' : ''}>Mots Mêlés</button>
            </div>
            <div className="game-content">
                {activeTab === 'Memory' && <MemoryGame />}
                {activeTab === 'Flashcards' && <Flashcards />}
                {activeTab === 'Mots Mêlés' && <WordScrambleGame />}
            </div>
        </>
    );
};

const Quiz = ({ questions, duration, onComplete }) => {
    const [currentQ, setCurrentQ] = useState(0);
    const [selectedAnswer, setSelectedAnswer] = useState(null);
    const [score, setScore] = useState(0);
    const [timeLeft, setTimeLeft] = useState(duration * 60);

    const question = questions[currentQ];
    
    const handleQuizEnd = useCallback((finalScore) => {
        onComplete(finalScore);
    }, [onComplete]);

    useEffect(() => {
        if (timeLeft <= 0) {
            handleQuizEnd(score);
            return;
        }
        const timerId = setInterval(() => {
            setTimeLeft(t => t - 1);
        }, 1000);
        return () => clearInterval(timerId);
    }, [timeLeft, score, handleQuizEnd]);

    const handleAnswer = (option) => {
        setSelectedAnswer(option);
        const isCorrect = option === question.correctAnswer;
        const newScore = isCorrect ? score + 1 : score;
        if(isCorrect) setScore(newScore);

        setTimeout(() => {
            if (currentQ < questions.length - 1) {
                setCurrentQ(q => q + 1);
                setSelectedAnswer(null);
            } else {
                handleQuizEnd(newScore);
            }
        }, 1200);
    };
    
    const formatTime = (seconds) => {
        const minutes = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
    };

    return (
        <div className="quiz-container">
            <div className="quiz-header">
                <p className="quiz-progress">Question {currentQ + 1} / {questions.length}</p>
                <div className="quiz-timer">{formatTime(timeLeft)}</div>
            </div>
            <p className="quiz-question">Quelle est la traduction de <strong>"{question.word}"</strong> ?</p>
            <div className="quiz-options">
                {question.options.map(option => (
                    <button 
                        key={option} 
                        className={`quiz-option ${selectedAnswer === option ? (option === question.correctAnswer ? 'correct' : 'incorrect') : ''}`}
                        onClick={() => handleAnswer(option)}
                        disabled={selectedAnswer !== null}
                    >
                        {option}
                    </button>
                ))}
            </div>
        </div>
    );
};

const Diploma = ({ score, total, userName, level, onRestart }) => {
    const date = new Date().toLocaleDateString('fr-FR');
    return (
        <div className="diploma-wrapper">
             <div className="diploma-container" style={{'--diploma-color': level.color} as React.CSSProperties}>
                <div className="diploma-header">
                    <h2>Certificat de Réussite</h2>
                    <p style={{ color: level.color, fontWeight: 'bold' }}>Niveau {level.name}</p>
                </div>
                <div className="diploma-body">
                    <p>Ce certificat est fièrement présenté à</p>
                    <h3 className="recipient-name">{userName || "Nom de l'Apprenant"}</h3>
                    <p>pour avoir brillamment réussi le test de certification avec un score de</p>
                    <p><strong>{score} / {total}</strong></p>
                </div>
                <div className="diploma-footer">
                    <span>Fait le, {date}</span>
                    <span>Dictionnaire Faka'uvea</span>
                </div>
            </div>
            <div className="diploma-actions">
                <button className="button-primary" onClick={() => window.print()}>Imprimer le certificat</button>
                <button className="button-primary" onClick={onRestart}>Retour</button>
            </div>
        </div>
    );
}

const CertificationPage = () => {
    const [quizState, setQuizState] = useState('selection'); // selection, playing, finished
    const [userName, setUserName] = useState('');
    const [score, setScore] = useState(0);
    const [selectedLevel, setSelectedLevel] = useState<ExamLevel | null>(null);
    const [questions, setQuestions] = useState([]);
    const [highScores, setHighScores] = useState(() => {
        try {
            const scores = localStorage.getItem('faka-uvea-highscores');
            return scores ? JSON.parse(scores) : { Bronze: 0, Argent: 0, Or: 0 };
        } catch (e) {
            return { Bronze: 0, Argent: 0, Or: 0 };
        }
    });

    const startQuiz = (level: ExamLevel) => {
        const q = [...DICTIONARY_DATA].sort(() => 0.5 - Math.random()).slice(0, level.questionCount).map(word => {
            const others = DICTIONARY_DATA.filter(o => o.faka_uvea !== word.faka_uvea).sort(() => 0.5 - Math.random()).slice(0, 3);
            const options = [word.french, ...others.map(o => o.french)].sort(() => 0.5 - Math.random());
            return {
                word: word.faka_uvea,
                options,
                correctAnswer: word.french
            }
        });
        setQuestions(q);
        setSelectedLevel(level);
        setQuizState('playing');
    };
    
    const handleQuizComplete = (finalScore) => {
        setScore(finalScore);
        if (finalScore > highScores[selectedLevel.name]) {
            const newHighScores = { ...highScores, [selectedLevel.name]: finalScore };
            setHighScores(newHighScores);
            localStorage.setItem('faka-uvea-highscores', JSON.stringify(newHighScores));
        }
        setQuizState('finished');
    };

    const handleRestart = () => {
        setQuizState('selection');
        setScore(0);
        setSelectedLevel(null);
    }
    
    if (quizState === 'playing') {
        return <Quiz questions={questions} duration={selectedLevel.duration} onComplete={handleQuizComplete} />;
    }

    if (quizState === 'finished') {
        const passingScore = Math.ceil(selectedLevel.questionCount * (selectedLevel.passingPercent / 100));
        if (score >= passingScore) {
            return <Diploma score={score} total={questions.length} userName={userName} level={selectedLevel} onRestart={handleRestart}/>;
        } else {
            return (
                <div className="certification-container">
                    <h3>Dommage !</h3>
                    <p>Votre score de {score}/{questions.length} n'est pas suffisant pour obtenir le certificat {selectedLevel.name} (score requis : {passingScore}).</p>
                    <p>N'hésitez pas à revoir le dictionnaire et à réessayer !</p>
                    <button className="button-primary" onClick={handleRestart}>Réessayer</button>
                </div>
            );
        }
    }

    return (
        <div className="exam-center-container">
            <div className="exam-center-header">
                <TrophyIcon />
                <h1 className="page-title">Centre de Examen</h1>
                <p>Choisissez votre niveau d'examen pour obtenir un certificat.</p>
                <input 
                    type="text" 
                    placeholder="Entrez votre nom pour le certificat" 
                    className="input-field" 
                    value={userName} 
                    onChange={e => setUserName(e.target.value)}
                />
            </div>
            <div className="exam-selection-grid">
                {EXAM_LEVELS.map(level => {
                     const passingScore = Math.ceil(level.questionCount * (level.passingPercent / 100));
                     const isUnlocked = level.name === 'Bronze' || (level.name === 'Argent' && highScores.Bronze >= Math.ceil(EXAM_LEVELS[0].questionCount * (EXAM_LEVELS[0].passingPercent / 100))) || (level.name === 'Or' && highScores.Argent >= Math.ceil(EXAM_LEVELS[1].questionCount * (EXAM_LEVELS[1].passingPercent / 100)));
                     return (
                        <div key={level.name} className={`exam-card exam-card-${level.name.toLowerCase()}`} style={{'--level-color': level.color} as React.CSSProperties}>
                            <div className="exam-card-icon">
                                <TrophyIcon />
                            </div>
                            <h3>Certificat {level.name}</h3>
                            <span className="exam-details">{level.questionCount} questions • {level.duration} min</span>
                            <p><strong>{level.passingPercent}% requis pour réussir</strong> ({passingScore} bonnes réponses)</p>
                            <span className="exam-highscore">Meilleur score : {highScores[level.name] || 0} / {level.questionCount}</span>
                            <button className="button-primary" onClick={() => startQuiz(level)} disabled={!userName || !isUnlocked}>
                                {isUnlocked ? "Commencer l'examen" : "Verrouillé"}
                            </button>
                             {!isUnlocked && <span className="unlock-info">Réussissez le niveau précédent pour débloquer.</span>}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

const GestionModal = ({ isOpen, onClose, onSave, word }) => {
    const [formData, setFormData] = useState({ faka_uvea: '', french: '', type: '', phonetic: '', audio_url: '', image_url: '' });
    const [examples, setExamples] = useState([{ faka_uvea: '', french: '' }]);
    const [audioFile, setAudioFile] = useState<File | null>(null);
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const modalRef = useRef<HTMLDivElement>(null);
    const firstInputRef = useRef<HTMLInputElement>(null);
    const triggerRef = useRef<HTMLElement | null>(null);

    useEffect(() => {
        if (isOpen) {
            triggerRef.current = document.activeElement as HTMLElement;
            firstInputRef.current?.focus();
            
            const handleKeyDown = (e: KeyboardEvent) => {
                if (e.key === 'Escape') onClose();
                if (e.key === 'Tab' && modalRef.current) {
                    const focusableElements = Array.from(modalRef.current.querySelectorAll(
                        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
                    )) as HTMLElement[];
                    const firstElement = focusableElements[0];
                    const lastElement = focusableElements[focusableElements.length - 1];

                    if (e.shiftKey) { // Shift+Tab
                        if (document.activeElement === firstElement) {
                            lastElement.focus();
                            e.preventDefault();
                        }
                    } else { // Tab
                        if (document.activeElement === lastElement) {
                            firstElement.focus();
                            e.preventDefault();
                        }
                    }
                }
            };

            document.addEventListener('keydown', handleKeyDown);
            return () => {
                document.removeEventListener('keydown', handleKeyDown);
                triggerRef.current?.focus();
            };
        }
    }, [isOpen, onClose]);


    useEffect(() => {
        if (word) {
            setFormData({
                faka_uvea: word.faka_uvea,
                french: word.french,
                type: word.type,
                phonetic: word.phonetic || '',
                audio_url: word.audio_url || '',
                image_url: word.image_url || '',
            });
            setExamples(word.examples.length > 0 ? JSON.parse(JSON.stringify(word.examples)) : [{ faka_uvea: '', french: '' }]);
            setImagePreview(word.image_url || null);
        } else {
            setFormData({ faka_uvea: '', french: '', type: '', phonetic: '', audio_url: '', image_url: '' });
            setExamples([{ faka_uvea: '', french: '' }]);
            setImagePreview(null);
        }
        setAudioFile(null);
        setImageFile(null);
    }, [word, isOpen]);

    if (!isOpen) return null;

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleExampleChange = (index, field, value) => {
        const newExamples = [...examples];
        newExamples[index][field] = value;
        setExamples(newExamples);
    };

    const addExample = () => {
        setExamples([...examples, { faka_uvea: '', french: '' }]);
    };

    const removeExample = (index) => {
        if (examples.length > 1) {
            setExamples(examples.filter((_, i) => i !== index));
        } else {
            setExamples([{ faka_uvea: '', french: '' }]);
        }
    };

    const handleAudioFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setAudioFile(file);
            const reader = new FileReader();
            reader.onloadend = () => {
                setFormData(prev => ({ ...prev, audio_url: reader.result as string }));
            };
            reader.readAsDataURL(file);
        }
    };

    const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setImageFile(file);
            const reader = new FileReader();
            reader.onloadend = () => {
                const result = reader.result as string;
                setImagePreview(result);
                setFormData(prev => ({ ...prev, image_url: result }));
            };
            reader.readAsDataURL(file);
        }
    };


    const previewAudio = () => {
        if (formData.audio_url) {
            const audio = new Audio(formData.audio_url);
            audio.play().catch(e => console.error("Error playing preview audio:", e));
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        // V2-TODO: This object structure is ready for the database.
        // Gemini CLI will use this to map to the dico_faka.db columns.
        const finalData = {
            ...formData,
            examples: examples.filter(ex => ex.faka_uvea.trim() !== '' && ex.french.trim() !== '')
        };
        onSave(finalData);
    };

    return (
        <div className="modal-overlay">
            <div className="modal-content" ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="modal-title">
                <div className="modal-header">
                    <h2 id="modal-title">{word ? 'Modifier le mot' : 'Ajouter un mot'}</h2>
                    <button className="close-button" onClick={onClose} aria-label="Fermer"><CloseIcon /></button>
                </div>
                <form onSubmit={handleSubmit} className="modal-form">
                    <div className="form-group">
                        <label>Faka'uvea</label>
                        <input type="text" name="faka_uvea" value={formData.faka_uvea} onChange={handleChange} required ref={firstInputRef} />
                    </div>
                    <div className="form-group">
                        <label>Français</label>
                        <input type="text" name="french" value={formData.french} onChange={handleChange} required />
                    </div>
                    <div className="form-group">
                        <label>Type</label>
                        <input type="text" name="type" value={formData.type} onChange={handleChange} required />
                    </div>
                    <div className="form-group">
                        <label>Phonétique</label>
                        <input type="text" name="phonetic" value={formData.phonetic} onChange={handleChange} />
                    </div>
                    <div className="form-group">
                        <label htmlFor="image-upload">Image (Optionnel)</label>
                        <div className="image-upload-control">
                            {imagePreview && <img src={imagePreview} alt="Aperçu de l'image" className="image-preview" />}
                             <input 
                                type="file" 
                                id="image-upload"
                                accept="image/png, image/jpeg, image/webp, image/svg+xml"
                                onChange={handleImageFileChange}
                                className="visually-hidden"
                            />
                            <label htmlFor="image-upload" className="button-secondary image-upload-label">
                                {imagePreview ? 'Changer...' : 'Choisir une image...'}
                            </label>
                            <span className="image-file-name">{imageFile?.name || (formData.image_url && !imageFile ? 'Image existante' : '')}</span>
                        </div>
                    </div>
                    <div className="form-group">
                        <label htmlFor="audio-upload">Prononciation (Audio)</label>
                        <div className="audio-upload-control">
                            <input 
                                type="file" 
                                id="audio-upload"
                                accept="audio/mp3, audio/wav, audio/mpeg"
                                onChange={handleAudioFileChange}
                                className="visually-hidden"
                            />
                            <label htmlFor="audio-upload" className="button-secondary audio-upload-label">
                                Choisir un fichier...
                            </label>
                            <span className="audio-file-name">
                                {audioFile?.name || (formData.audio_url && !audioFile ? 'Fichier audio existant' : 'Aucun fichier')}
                            </span>
                            {formData.audio_url && (
                                <button type="button" className="preview-audio-btn" onClick={previewAudio} aria-label="Écouter l'audio actuel">
                                    <PlayIcon />
                                </button>
                            )}
                        </div>
                    </div>
                     <div className="form-group">
                        <label>Exemples</label>
                        <div className="examples-list">
                            {examples.map((ex, index) => (
                                <div key={index} className="example-row">
                                    <input type="text" placeholder="Exemple en faka'uvea" value={ex.faka_uvea} onChange={e => handleExampleChange(index, 'faka_uvea', e.target.value)} />
                                    <input type="text" placeholder="Exemple en français" value={ex.french} onChange={e => handleExampleChange(index, 'french', e.target.value)} />
                                    <button type="button" className="remove-example-btn" onClick={() => removeExample(index)} aria-label={`Supprimer l'exemple ${index + 1}`}>&times;</button>
                                </div>
                            ))}
                        </div>
                        <button type="button" className="add-example-btn" onClick={addExample}>Ajouter un exemple</button>
                    </div>
                    <div className="modal-footer">
                        <button type="button" className="button-secondary" onClick={onClose}>Annuler</button>
                        <button type="submit" className="button-primary">Sauvegarder</button>
                    </div>
                </form>
            </div>
        </div>
    );
};


const GestionPage = () => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingWord, setEditingWord] = useState<DictionaryEntry | null>(null);

    const openModal = (word = null) => {
        setEditingWord(word);
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setEditingWord(null);
    };

    const handleSave = (formData) => {
        // V2-TODO: Connect this to the database (dico_faka.db) using Gemini CLI.
        // This will involve making an API call to an endpoint that performs the CREATE or UPDATE operation.
        // For now, we simulate the action with an alert.
        const action = editingWord ? 'Modification' : 'Ajout';
        alert(`${action} simulée pour "${formData.faka_uvea}". Prêt pour l'intégration en V2.`);
        console.log("Data to save:", formData);
        closeModal();
    };

    const handleDelete = (word) => {
        if (window.confirm(`Êtes-vous sûr de vouloir supprimer le mot "${word}" ?`)) {
            // V2-TODO: Connect this to the database for the DELETE operation.
            alert(`Suppression simulée pour "${word}". Prêt pour l'intégration en V2.`);
        }
    };
    
    const exportToCSV = () => {
        // V2-TODO: This can be adapted to fetch all data from the database before exporting.
        alert("Préparation de l'export CSV. Cette fonctionnalité sera entièrement fonctionnelle en V2.");
        const headers = ['faka_uvea', 'french', 'type', 'phonetic', 'examples'];
        let csvContent = "data:text/csv;charset=utf-8," + headers.join(",") + "\n";
        
        DICTIONARY_DATA.forEach(row => {
            const values = headers.map(header => {
                let value = row[header];
                if (header === 'examples') {
                    // Serialize array of objects into a JSON string, escaping quotes
                    value = JSON.stringify(value).replace(/"/g, '""');
                }
                return `"${value}"`;
            });
            csvContent += values.join(",") + "\n";
        });

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "dictionnaire_faka-uvea.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleImportCSV = (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            // V2-TODO: Parse the CSV content and send it to the backend to update the database.
            // Add validation and error handling for the CSV format.
            alert(`Fichier "${file.name}" sélectionné. L'importation et la mise à jour de la base de données seront activées en V2.`);
        };
        reader.readAsText(file, 'UTF-8');
    };

    const triggerImport = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.csv';
        input.onchange = handleImportCSV;
        input.click();
    };


    return (
        <>
            <GestionModal isOpen={isModalOpen} onClose={closeModal} onSave={handleSave} word={editingWord} />
            <div className="gestion-page">
                <div className="gestion-header">
                    <h1 className="page-title">Gestion du Dictionnaire</h1>
                    <div className="gestion-actions">
                        <button className="button-secondary" onClick={triggerImport}>Importer CSV</button>
                        <button className="button-secondary" onClick={exportToCSV}>Exporter CSV</button>
                        <button className="button-primary" onClick={() => openModal()}>Ajouter un mot</button>
                    </div>
                </div>
                <div className="gestion-table">
                    <div className="gestion-row header">
                        <div className="gestion-cell">Faka'uvea</div>
                        <div className="gestion-cell">Français</div>
                        <div className="gestion-cell actions">Actions</div>
                    </div>
                    {DICTIONARY_DATA.map(entry => (
                        <div key={entry.faka_uvea} className="gestion-row">
                            <div className="gestion-cell">{entry.faka_uvea}</div>
                            <div className="gestion-cell">{entry.french}</div>
                            <div className="gestion-cell actions">
                                <button className="action-button edit" onClick={() => openModal(entry)}>Modifier</button>
                                <button className="action-button delete" onClick={() => handleDelete(entry.faka_uvea)}>Supprimer</button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </>
    );
};


// --- AUTH & APP ---
const AuthProvider = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);

    const login = (username, password) => {
        // V2-TODO: Replace with an API call to the database for authentication.
        if (username === 'admin' && password === 'admin123') {
            setUser({ username: 'admin', role: 'admin' });
            return true;
        }
        if (username === 'user' && password === 'user123') {
            setUser({ username: 'user', role: 'user' });
            return true;
        }
        return false;
    };

    const logout = () => {
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{ user, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
};

const LoginPage = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const { login } = useAuth();

    const handleSubmit = (e) => {
        e.preventDefault();
        setError('');
        const success = login(username, password);
        if (!success) {
            setError('Nom d\'utilisateur ou mot de passe incorrect.');
        }
    };

    return (
        <div className="login-container">
            <form className="login-form" onSubmit={handleSubmit}>
                <h1 className="login-title">Connexion</h1>
                <p className="login-subtitle">Accédez au dictionnaire Faka'uvea</p>
                {error && <p className="login-error">{error}</p>}
                <input
                    type="text"
                    className="login-input"
                    placeholder="Nom d'utilisateur (user / admin)"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                />
                <input
                    type="password"
                    className="login-input"
                    placeholder="Mot de passe (user123 / admin123)"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                />
                <button type="submit" className="login-button">Se connecter</button>
            </form>
        </div>
    );
};

const Footer = ({ setCurrentPage }) => {
  const handleLinkClick = (page) => (e) => {
    e.preventDefault();
    setCurrentPage(page);
  };
  return (
    <footer className="app-footer">
      <div className="footer-content">
        <div className="footer-column">
          <h4>Faka'uvea</h4>
          <p>Un projet pour la préservation et la promotion de la langue wallisienne.</p>
        </div>
        <div className="footer-column">
          <h4>Navigation</h4>
          <ul className="footer-links">
            <li><a href="#" onClick={handleLinkClick('Accueil')}>Accueil</a></li>
            <li><a href="#" onClick={handleLinkClick('Dictionnaire')}>Dictionnaire</a></li>
            <li><a href="#" onClick={handleLinkClick('Tuteur IA')}>Tuteur IA</a></li>
            <li><a href="#" onClick={handleLinkClick('Le Faka\'uvea')}>La Langue</a></li>
          </ul>
        </div>
        <div className="footer-column">
          <h4>Légal</h4>
          <ul className="footer-links">
            <li><a href="#">Politique de confidentialité</a></li>
            <li><a href="#">Conditions d'utilisation</a></li>
          </ul>
        </div>
      </div>
      <div className="footer-bottom">
        <p>© {new Date().getFullYear()} Dictionnaire Faka'uvea. Tous droits réservés.</p>
      </div>
    </footer>
  );
};


const MainApp = () => {
  const [themePreference, setThemePreference] = useState<ThemePreference>(() => {
    return (window.localStorage.getItem('faka-uvea-theme') as ThemePreference) || 'system';
  });
  const [currentPage, setCurrentPage] = useState('Accueil');
  const [favorites, setFavorites] = useState(() => {
      try {
        const item = window.localStorage.getItem('faka-uvea-favorites');
        return item ? JSON.parse(item) : [];
      } catch (error) {
        console.error("Error reading favorites from localStorage", error);
        return [];
      }
  });
  const [history, setHistory] = useState(() => {
    try {
        const item = window.localStorage.getItem('faka-uvea-history');
        return item ? JSON.parse(item) : [];
    } catch (error) {
        console.error("Error reading history from localStorage", error);
        return [];
    }
  });

  useEffect(() => {
    try {
        window.localStorage.setItem('faka-uvea-favorites', JSON.stringify(favorites));
    } catch (error) {
        console.error("Error saving favorites to localStorage", error);
    }
  }, [favorites]);
  
  useEffect(() => {
    try {
        window.localStorage.setItem('faka-uvea-history', JSON.stringify(history));
    } catch (error) {
        console.error("Error saving history to localStorage", error);
    }
  }, [history]);

  const speak = useCallback((textOrEntry: string | DictionaryEntry) => {
    let textToSpeak: string;
    let audioUrl: string | undefined;

    if (typeof textOrEntry === 'string') {
        textToSpeak = textOrEntry;
        const entry = DICTIONARY_DATA.find(e => e.faka_uvea === textToSpeak);
        audioUrl = entry?.audio_url;
    } else {
        textToSpeak = textOrEntry.faka_uvea;
        audioUrl = textOrEntry.audio_url;
    }

    if (audioUrl) {
        const audio = new Audio(audioUrl);
        audio.play().catch(e => console.error("Error playing custom audio:", e));
    } else if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(textToSpeak);
      const voices = window.speechSynthesis.getVoices();
      let voice = voices.find(v => v.lang === 'wls'); 
      if (!voice) voice = voices.find(v => v.lang.startsWith('fr'));
      
      utterance.voice = voice;
      utterance.lang = voice ? voice.lang : 'fr-FR';
      utterance.rate = 0.9;
      window.speechSynthesis.speak(utterance);
    } else {
      alert("La synthèse vocale n'est pas supportée par votre navigateur.");
    }
  }, []);

  useEffect(() => {
    const applyTheme = (theme: ThemePreference) => {
        window.localStorage.setItem('faka-uvea-theme', theme);
        if (theme === 'system') {
            const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            document.body.setAttribute('data-theme', systemPrefersDark ? 'dark' : 'light');
        } else {
            document.body.setAttribute('data-theme', theme);
        }
    };
    
    applyTheme(themePreference);
    
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSystemThemeChange = () => {
        if (themePreference === 'system') {
            applyTheme('system');
        }
    };
    
    mediaQuery.addEventListener('change', handleSystemThemeChange);
    return () => mediaQuery.removeEventListener('change', handleSystemThemeChange);
  }, [themePreference]);
  
  useEffect(() => {
    if ('speechSynthesis' in window && window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
    }
  }, []);

  const toggleFavorite = (faka_uvea: string) => {
      setFavorites(prev => {
          if (prev.includes(faka_uvea)) {
              return prev.filter(word => word !== faka_uvea);
          } else {
              return [...prev, faka_uvea];
          }
      });
  };
  
  const logHistory = (faka_uvea: string) => {
    setHistory(prev => {
        const newHistory = prev.filter(word => word !== faka_uvea);
        newHistory.unshift(faka_uvea);
        return newHistory.slice(0, 50);
    });
  };

  const contextValue = { themePreference, setThemePreference, speak, favorites, toggleFavorite, history, logHistory, setCurrentPage };
  
  const renderPage = () => {
      switch(currentPage) {
          case 'Accueil': return <HomePage setCurrentPage={setCurrentPage} />;
          case 'Dictionnaire': return <DictionaryPage />;
          case 'Favoris': return <FavoritesPage />;
          case 'Historique': return <HistoryPage />;
          case 'Guide': return <GuidePage />;
          case 'Tuteur IA': return <AITutorPage />;
          case 'Le Faka\'uvea': return <FakaUveaInfoPage />;
          case 'Jeux': return <GamesPage />;
          case 'Certification': return <CertificationPage />;
          case 'Gestion': return <GestionPage />;
          default: return <HomePage setCurrentPage={setCurrentPage} />;
      }
  }

  return (
    <AppContext.Provider value={contextValue}>
      <div className="app-layout">
        <Header currentPage={currentPage} setCurrentPage={setCurrentPage} />
        <main>
          <div key={currentPage} className="page-container">
            {renderPage()}
          </div>
        </main>
        <Footer setCurrentPage={setCurrentPage} />
      </div>
    </AppContext.Provider>
  );
};

const App = () => {
    const { user } = useAuth();
    return user ? <MainApp /> : <LoginPage />;
}

// --- RENDER ---
const container = document.getElementById('root');
if (container) {
    const root = ReactDOM.createRoot(container);
    root.render(
        <AuthProvider>
            <App />
        </AuthProvider>
    );
}