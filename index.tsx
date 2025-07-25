
import React, { useState, useEffect, createContext, useContext, useCallback, useMemo, useRef, useLayoutEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { GoogleGenAI, Chat } from "@google/genai";

// --- AI INITIALIZATION ---
const ai = new GoogleGenAI({apiKey: process.env.API_KEY});

// --- TYPE DEFINITIONS ---
type Meaning = {
  french: string;
  type: string;
  examples: {
    faka_uvea: string;
    french: string;
  }[];
};

type DictionaryEntry = {
  faka_uvea: string;
  phonetic?: string;
  audio_url?: string;
  image_url?: string;
  meanings: Meaning[];
};

type GuideCategory = {
    name: string;
    phrases: {
        faka_uvea: string;
        french: string;
    }[];
};

type ThemePreference = 'light' | 'dark' | 'system' | 'papyrus';

type ExamLevel = {
    name: 'Bronze' | 'Argent' | 'Or';
    color: string;
    questionCount: number;
    passingPercent: number;
    duration: number; // Duration in minutes
};

type User = {
    id: string;
    username: string;
    password?: string;
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
  setHistory: React.Dispatch<React.SetStateAction<string[]>>;
  dictionary: DictionaryEntry[];
  setDictionary: React.Dispatch<React.SetStateAction<DictionaryEntry[]>>;
  resetDictionary: () => void;
};

type AuthContextType = {
    user: User | null;
    users: User[];
    login: (username, password) => boolean;
    logout: () => void;
    setUsers: React.Dispatch<React.SetStateAction<User[]>>;
    addUser: (user: User) => void;
    updateUser: (user: User) => void;
    deleteUser: (userId: string) => void;
    resetUsers: () => void;
};

type Toast = { id: number; message: string; type: 'success' | 'error' | 'info' };
type ToastContextType = { addToast: (message: string, type?: Toast['type']) => void; };


// --- HELPER HOOKS ---
function useStorageState<T>(key: string, defaultValue: T, storage: Storage): [T, React.Dispatch<React.SetStateAction<T>>] {
    const [state, setState] = useState<T>(() => {
        try {
            const storedValue = storage.getItem(key);
            return storedValue ? JSON.parse(storedValue) : defaultValue;
        } catch (error) {
            console.error("Error reading from storage", error);
            return defaultValue;
        }
    });

    useEffect(() => {
        try {
            storage.setItem(key, JSON.stringify(state));
        } catch (error) {
            console.error("Error writing to storage", error);
        }
    }, [key, state, storage]);

    return [state, setState];
}

const useLocalStorage = <T,>(key: string, defaultValue: T) => useStorageState<T>(key, defaultValue, localStorage);
const useSessionStorage = <T,>(key: string, defaultValue: T) => useStorageState<T>(key, defaultValue, sessionStorage);


// --- HELPER: Levenshtein Distance ---
const levenshteinDistance = (s1: string, s2: string): number => {
    s1 = s1.toLowerCase();
    s2 = s2.toLowerCase();
    const costs: number[] = [];
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
    phonetic: '/a.lo.fa/',
    audio_url: 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=',
    image_url: 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'400\' height=\'200\' viewBox=\'0 0 400 200\'%3E%3Crect width=\'400\' height=\'200\' fill=\'%23e0e0e0\' /%3E%3Ctext x=\'50%25\' y=\'50%25\' dominant-baseline=\'middle\' text-anchor=\'middle\' font-family=\'monospace\' font-size=\'26px\' fill=\'%23999999\'%3EImage 400x200%3C/text%3E%3C/svg%3E',
    meanings: [{
        french: 'amour, bonjour, pitié',
        type: 'n.c.',
        examples: [{ faka_uvea: 'Mālō te ma\'uli, \'alofa atu.', french: 'Bonjour, je vous salue.' }]
    }]
  },
  {
    faka_uvea: 'api',
    phonetic: '/a.pi/',
    image_url: 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'400\' height=\'200\' viewBox=\'0 0 400 200\'%3E%3Crect width=\'400\' height=\'200\' fill=\'%23e0e0e0\' /%3E%3Ctext x=\'50%25\' y=\'50%25\' dominant-baseline=\'middle\' text-anchor=\'middle\' font-family=\'monospace\' font-size=\'26px\' fill=\'%23999999\'%3EImage 400x200%3C/text%3E%3C/svg%3E',
    meanings: [{
        french: 'maison, habitation',
        type: 'n.c.',
        examples: [{ faka_uvea: 'E au nofo i toku api.', french: 'Je reste dans ma maison.' }]
    }]
  },
  {
    faka_uvea: 'afo',
    phonetic: '/a.fo/',
    meanings: [
        {
            type: 's.',
            french: 'Rang de feuilles pour la toiture',
            examples: [{ faka_uvea: 'Kua popo te afo o toku falelaú.', french: 'Le rang de feuilles pour la toiture de ma maison est dégradé/pourri.' }]
        },
        {
            type: 's.',
            french: 'Grosse ficelle pour la pêche à la ligne (forme peu usitée-tend à disparaître)',
            examples: []
        }
    ]
  },
  {
    faka_uvea: 'aho',
    phonetic: '/a.ho/',
    meanings: [{
        french: 'jour',
        type: 'n.c.',
        examples: [{ faka_uvea: 'Ko te \'aho tenei \'e lelei.', french: 'Ce jour est bon.' }]
    }]
  },
  {
    faka_uvea: 'aso',
    phonetic: '/a.so/',
    meanings: [{
        french: 'soleil',
        type: 'n.c.',
        examples: [{ faka_uvea: 'E malamalama te aso.', french: 'Le soleil brille.' }]
    }]
  },
  {
    faka_uvea: 'atua',
    phonetic: '/a.tu.a/',
    meanings: [{
        french: 'dieu, esprit',
        type: 'n.c.',
        examples: [{ faka_uvea: 'E tui ki te \'atua.', french: 'Croyance en dieu.' }]
    }]
  },
  {
    faka_uvea: 'ava',
    phonetic: '/a.va/',
    meanings: [{
        french: 'passe (récif)',
        type: 'n.c.',
        examples: [{ faka_uvea: 'E ulu te vaka i te ava.', french: 'Le bateau entre par la passe.' }]
    }]
  },
  {
    faka_uvea: 'aliki',
    phonetic: '/a.li.ki/',
    meanings: [{
        french: 'roi, chef',
        type: 'n.c.',
        examples: [{ faka_uvea: 'Ko te aliki o Uvea.', french: 'Le roi de Wallis.' }]
    }]
  },
  {
    faka_uvea: 'au',
    phonetic: '/a.u/',
    meanings: [{
        french: 'je, moi',
        type: 'pr.p.',
        examples: [{ faka_uvea: 'E alu au ki te api.', french: 'Je vais à la maison.' }]
    }]
  },
  {
    faka_uvea: '\'amuli',
    phonetic: '/ʔa.mu.li/',
    meanings: [{
        french: 'Avenir, plus tard, dans la suite',
        type: 'adv.',
        examples: [{ faka_uvea: 'Gāue mo manatu ki ’amuli.', french: 'Travaille en pensant à l’avenir.' }]
    }]
  },
  {
    faka_uvea: 'afi',
    phonetic: '/a.fi/',
    meanings: [{
        french: 'feu',
        type: 'n.c.',
        examples: [{ faka_uvea: 'Kua kā te afi.', french: 'Le feu est allumé.' }]
    }]
  },
  {
    faka_uvea: 'ano',
    phonetic: '/a.no/',
    meanings: [{
        french: 'lac',
        type: 'n.c.',
        examples: [{ faka_uvea: 'E lahi te ano o Lalolalo.', french: 'Le lac Lalolalo est grand.' }]
    }]
  },
  {
    faka_uvea: 'aku',
    phonetic: '/a.ku/',
    meanings: [{
        french: 'mon, ma, mes (possessif)',
        type: 'adj.poss.',
        examples: [{ faka_uvea: 'Ko te tohi aku.', french: 'C\'est mon livre.' }]
    }]
  },
  {
    faka_uvea: 'ama',
    phonetic: '/a.ma/',
    meanings: [{
        french: 'balancier de pirogue',
        type: 'n.c.',
        examples: [{ faka_uvea: 'E pakia te ama o te vaka.', french: 'Le balancier de la pirogue est cassé.' }]
    }]
  },
  {
    faka_uvea: '\'aka',
    phonetic: '/ʔa.ka/',
    meanings: [{
        french: 'racine',
        type: 'n.c.',
        examples: [{ faka_uvea: 'E loloto te \'aka o te fu\'u lakau.', french: 'La racine de l\'arbre est profonde.' }]
    }]
  },
  {
    faka_uvea: '\'ala',
    phonetic: '/ʔa.la/',
    meanings: [{
        french: 'chemin, voie',
        type: 'n.c.',
        examples: [{ faka_uvea: 'Toupi te \'ala ki te gata\'aga.', french: 'Le chemin vers la plage est court.' }]
    }]
  },
  {
    faka_uvea: '\'aga',
    phonetic: '/ʔa.ŋa/',
    meanings: [{
        french: 'coutume, manière d\'être',
        type: 'n.c.',
        examples: [{ faka_uvea: 'Ko te \'aga faka\'uvea.', french: 'C\'est la coutume wallisienne.' }]
    }]
  },
  {
    faka_uvea: '\'ahoa',
    phonetic: '/ʔa.ho.a/',
    meanings: [{
        french: 'collier (de fleurs ou coquillages)',
        type: 'n.c.',
        examples: [{ faka_uvea: 'Ne\'i fai he \'ahoa sisi.', french: 'Elle a fabriqué un collier de coquillages.' }]
    }]
  },
  {
    faka_uvea: '\'aele',
    phonetic: '/ʔa.e.le/',
    meanings: [{
        french: 'se promener, marcher',
        type: 'v.',
        examples: [{ faka_uvea: 'Tau olo o \'aele.', french: 'Allons nous promener.' }]
    }]
  },
  {
    faka_uvea: '\'ate',
    phonetic: '/ʔa.te/',
    meanings: [{
        french: 'foie',
        type: 'n.c.',
        examples: [{ faka_uvea: 'Ko te \'ate moa \'e lelei.', french: 'Le foie de poulet est bon.' }]
    }]
  },
  {
    faka_uvea: '\'ao',
    phonetic: '/ʔa.o/',
    meanings: [{
        french: 'nuage',
        type: 'n.c.',
        examples: [{ faka_uvea: 'E lahi te \'ao i te lagi.', french: 'Il y a beaucoup de nuages dans le ciel.' }]
    }]
  },
  {
    faka_uvea: '\'avelo',
    phonetic: '/ʔa.ve.lo/',
    meanings: [{
        french: 'rapide, vitesse',
        type: 'adj.',
        examples: [{ faka_uvea: 'E \'avelo lahi te ka.', french: 'La voiture est très rapide.' }]
    }]
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

const USERS_DATA: User[] = [
    { id: '1', username: 'admin', role: 'admin', password: 'admin' },
    { id: '2', username: 'user', role: 'user', password: 'user' },
];

const ALPHABET = ['A', 'E', 'F', 'G', 'H', 'I', 'K', 'L', 'M', 'N', 'O', 'S', 'T', 'U', 'V', '\''];

const EXAM_LEVELS: ExamLevel[] = [
    { name: 'Bronze', color: '#cd7f32', questionCount: 10, passingPercent: 70, duration: 4 },
    { name: 'Argent', color: '#667eea', questionCount: 20, passingPercent: 75, duration: 10 },
    { name: 'Or', color: '#fbbf24', questionCount: 30, passingPercent: 80, duration: 15 }
];


// --- ICONS ---
const HomeIcon = ({width=20, height=20}: {width?: number; height?: number}) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width={width} height={height}><path d="M11.47 3.84a.75.75 0 0 1 1.06 0l8.69 8.69a.75.75 0 1 1-1.06 1.06l-1.72-1.72V19.5a.75.75 0 0 1-.75.75h-5.5a.75.75 0 0 1-.75-.75v-5.5a.75.75 0 0 0-.75-.75h-1.5a.75.75 0 0 0-.75.75v5.5a.75.75 0 0 1-.75.75h-5.5a.75.75 0 0 1-.75-.75V11.88l-1.72 1.72a.75.75 0 1 1-1.06-1.06l8.69-8.69Z" /></svg>;
const CogIcon = ({width=20, height=20}: {width?: number; height?: number}) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width={width} height={height}><path fillRule="evenodd" d="M12.965 2.54a1.875 1.875 0 0 1 1.768 1.483l.08.339c.214.862.935 1.458 1.832 1.558l.41.044a1.875 1.875 0 0 1 1.815 2.164l-.1.4a1.875 1.875 0 0 1-1.33 1.516l-.374.135a1.875 1.875 0 0 0-1.298 1.298l-.135.374a1.875 1.875 0 0 1-1.516 1.33l-.4.1a1.875 1.875 0 0 1-2.164-1.815l-.044-.41a1.875 1.875 0 0 0-1.558-1.832l-.339-.08a1.875 1.875 0 0 1-1.483-1.768l-.002-1.027a1.875 1.875 0 0 1 1.483-1.768l.339-.08c.897-.1 1.618-.696 1.832-1.558l.08-.339a1.875 1.875 0 0 1 1.768-1.483h.001ZM12 15.375a3.375 3.375 0 1 0 0-6.75 3.375 3.375 0 0 0 0 6.75Z" clipRule="evenodd" /></svg>;
const UsersIcon = ({width=20, height=20}: {width?: number; height?: number}) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width={width} height={height}><path d="M10.375 2.25a4.125 4.125 0 1 0 0 8.25 4.125 4.125 0 0 0 0-8.25ZM10.375 8.625a2.25 2.25 0 1 1 0-4.5 2.25 2.25 0 0 1 0 4.5Z" /><path d="M18.813 9.395a.75.75 0 0 1 .437.695v.001c0 .414-.336.75-.75.75h-1.5a.75.75 0 0 1 0-1.5h.345a2.622 2.622 0 0 0-1.63-2.344 4.131 4.131 0 0 0-2.392-1.066.75.75 0 0 1-.363-1.454 5.63 5.63 0 0 1 3.262 1.468 4.123 4.123 0 0 1 2.091 3.445Z" /><path d="M11.625 15.375a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5a.75.75 0 0 1 .75-.75Z" /><path fillRule="evenodd" d="M6.343 12.22a.75.75 0 0 1 .638.863 3.373 3.373 0 0 0 2.23 3.037.75.75 0 1 1-.44 1.424 4.873 4.873 0 0 1-3.212-4.382.75.75 0 0 1 .863-.638ZM14.407 12.22a.75.75 0 0 1 .863.638 4.873 4.873 0 0 1-3.212 4.382.75.75 0 1 1-.44-1.424 3.373 3.373 0 0 0 2.23-3.037.75.75 0 0 1 .638-.863Z" clipRule="evenodd" /></svg>;
const SpeakerIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M14.604 3.012a.749.749 0 0 0-.965.033L8.62 7.25H5.375A2.375 2.375 0 0 0 3 9.625v4.75A2.375 2.375 0 0 0 5.375 16.75H8.62l5.019 4.205a.75.75 0 0 0 .965.033.752.752 0 0 0 .396-.688V3.7a.752.752 0 0 0-.396-.688Z" /><path d="M17.125 7.75a.75.75 0 0 0 0 1.5c.828 0 1.5.672 1.5 1.5s-.672 1.5-1.5 1.5a.75.75 0 0 0 0 1.5c1.657 0 3-1.343 3-3s-1.343-3-3-3Zm0 4.5a.75.75 0 0 0 0 1.5c2.485 0 4.5-2.015 4.5-4.5s-2.015-4.5-4.5-4.5a.75.75 0 0 0 0 1.5c1.657 0 3 1.343 3 3s-1.343 3-3 3Z" /></svg>);
const PlayIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path fillRule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.647c1.295.742 1.295 2.545 0 3.286L7.279 20.99c-1.25.717-2.779-.217-2.779-1.643V5.653Z" clipRule="evenodd" /></svg>);
const MenuIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 0 24 24" width="24px" fill="currentColor"><path d="M0 0h24v24H0z" fill="none"/><path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/></svg>);
const CloseIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 0 24 24" width="24px" fill="currentColor"><path d="M0 0h24v24H0z" fill="none"/><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>);
const MoreIcon = () => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path fillRule="evenodd" d="M4.5 12a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0Zm6 0a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0Zm6 0a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0Z" clipRule="evenodd" /></svg>;
const RestartIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 0 24 24" width="24px" fill="currentColor"><path d="M0 0h24v24H0z" fill="none"/><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/></svg>);
const TrophyIcon = ({width=20, height=20}: {width?: number; height?: number}) => (<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width={width} height={height}><path d="M15.5 13H14v-2h1.5a2.5 2.5 0 0 0 2.5-2.5A2.5 2.5 0 0 0 15.5 6h-7A2.5 2.5 0 0 0 6 8.5A2.5 2.5 0 0 0 8.5 11H10v2H8.5A4.5 4.5 0 0 1 4 8.5A4.5 4.5 0 0 1 8.5 4h7A4.5 4.5 0 0 1 20 8.5a4.5 4.5 0 0 1-4.5 4.5Zm-5.85 2h4.7L12 17.85 9.65 15ZM12 21l-3-3H4v-2h5l3 3 3-3h5v2h-5l-3 3Z"/></svg>);
const StarIcon = ({ filled, width=20, height=20 }: {filled: boolean, width?: number, height?: number}) => (<svg xmlns="http://www.w3.org/2000/svg" height={`${height}px`} viewBox="0 0 24 24" width={`${width}px`} fill="currentColor"><path d="M0 0h24v24H0z" fill="none"/><path d={filled ? "M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" : "M22 9.24l-7.19-.62L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.63-7.03L22 9.24zM12 15.4l-3.76 2.27 1-4.28-3.32-2.88 4.38-.38L12 6.1l1.71 4.04 4.38.38-3.32 2.88 1 4.28L12 15.4z"}/></svg>);
const HistoryIcon = ({width=20, height=20}: {width?: number; height?: number}) => (<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={width} height={height} fill="currentColor"><path d="M0 0h24v24H0z" fill="none"/><path d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/></svg>);
const SunIcon = () => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M12 2.25a.75.75 0 0 1 .75.75v2.25a.75.75 0 0 1-1.5 0V3a.75.75 0 0 1 .75-.75ZM7.5 12a4.5 4.5 0 1 1 9 0 4.5 4.5 0 0 1-9 0ZM18.894 6.106a.75.75 0 0 1 1.06-1.06l1.591 1.59a.75.75 0 1 1-1.06 1.06l-1.591-1.59ZM21.75 12a.75.75 0 0 1-.75.75h-2.25a.75.75 0 0 1 0-1.5h2.25a.75.75 0 0 1 .75.75ZM17.894 17.894a.75.75 0 0 1 1.06 1.06l-1.59 1.591a.75.75 0 1 1-1.06-1.06l1.59-1.591ZM12 18.75a.75.75 0 0 1 .75.75v2.25a.75.75 0 0 1-1.5 0v-2.25a.75.75 0 0 1 .75-.75ZM5.106 17.894a.75.75 0 0 1 1.06-1.06l1.591 1.59a.75.75 0 1 1-1.06 1.06l-1.591-1.59ZM4.5 12a.75.75 0 0 1-.75.75H1.5a.75.75 0 0 1 0-1.5h2.25a.75.75 0 0 1 .75.75ZM6.106 5.106a.75.75 0 0 1 1.06 1.06l-1.59 1.591a.75.75 0 1 1-1.06-1.06l1.59-1.591Z" /></svg>;
const MoonIcon = () => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path fillRule="evenodd" d="M9.528 1.718a.75.75 0 0 1 .162.819A8.97 8.97 0 0 0 9 6a9 9 0 0 0 9 9 8.97 8.97 0 0 0 3.463-.69.75.75 0 0 1 .981.981A10.503 10.503 0 0 1 18 18a10.5 10.5 0 0 1-10.5-10.5c0-1.81.46-3.516 1.255-5.042a.75.75 0 0 1 .819-.162Z" clipRule="evenodd" /></svg>;
const SystemIcon = () => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path fillRule="evenodd" d="M2.25 5.25a3 3 0 0 1 3-3h13.5a3 3 0 0 1 3 3v10.5a3 3 0 0 1-3 3H5.25a3 3 0 0 1-3-3V5.25ZM5.25 4.5a.75.75 0 0 0-.75.75v10.5a.75.75 0 0 0 .75.75h13.5a.75.75 0 0 0 .75-.75V5.25a.75.75 0 0 0-.75-.75H5.25Z" clipRule="evenodd" /></svg>;
const ScrollIcon = () => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M21 21.22V3.73c0-.8-.5-1.45-1.25-1.64C18.6 1.81 17.35 2 16.5 2c-1.5 0-2.38.62-3.5 1.25S11.25 4.5 9.75 4.5s-2.38-.62-3.5-1.25S4.5 2 3 2c-.85 0-2.1.19-3.25.49A1.75 1.75 0 0 0 1 4.14v16.14c0 .8.5 1.45 1.25 1.64C3.4 22.19 4.65 22 5.5 22c1.5 0 2.38-.62 3.5-1.25s1.75-1.25 3.25-1.25 2.38.62 3.5 1.25 1.75 1.25 3.25 1.25c.85 0 2.1-.19 3.25-.49a1.75 1.75 0 0 0-1.25-2.39ZM19.5 19.5c-1.12-.23-2.22-.64-3.25-1.25-1.03-.61-1.75-1.25-3.25-1.25s-2.22.64-3.25 1.25S8.5 19.5 7.25 19.5v-15c1.12.23 2.22.64 3.25 1.25C11.53 6.36 12.25 7 13.75 7s2.22-.64 3.25-1.25S18.5 4.5 19.75 4.5v15Z" /></svg>;
const BookOpenIcon = ({width=20, height=20}: {width?: number; height?: number}) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width={width} height={height}><path fillRule="evenodd" d="M10.5 3.75a2.25 2.25 0 0 0-2.25 2.25v10.5a2.25 2.25 0 0 0 2.25 2.25h3a2.25 2.25 0 0 0 2.25-2.25V6a2.25 2.25 0 0 0-2.25-2.25h-3ZM9 6a.75.75 0 0 1 .75-.75h4.5a.75.75 0 0 1 .75.75v10.5a.75.75 0 0 1-.75-.75h-4.5a.75.75 0 0 1-.75-.75V6Z" clipRule="evenodd" /><path d="M6.75 5.25a2.25 2.25 0 0 0-2.25 2.25v10.5a2.25 2.25 0 0 0 2.25 2.25H9v-1.5H6.75A.75.75 0 0 1 6 16.5V7.5a.75.75 0 0 1 .75-.75h2.25V5.25H6.75Z" /><path d="M17.25 5.25a2.25 2.25 0 0 1 2.25 2.25v10.5a2.25 2.25 0 0 1-2.25 2.25H15v-1.5h2.25a.75.75 0 0 0 .75-.75V7.5a.75.75 0 0 0-.75-.75h-2.25V5.25h2.25Z" /></svg>;
const PuzzlePieceIcon = ({width=20, height=20}: {width?: number; height?: number}) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width={width} height={height}><path fillRule="evenodd" d="M12.963 2.286a.75.75 0 0 0-1.071 1.052A3.75 3.75 0 0 1 15.75 6H18a.75.75 0 0 0 0-1.5h-2.25a2.25 2.25 0 0 0-1.787-2.214ZM10.5 6a.75.75 0 0 0 0 1.5h3a.75.75 0 0 0 0-1.5h-3Z" clipRule="evenodd" /><path d="M12 1.5A10.5 10.5 0 1 0 22.5 12 10.5 10.5 0 0 0 12 1.5ZM3.75 12a8.25 8.25 0 1 1 14.228 5.472.75.75 0 0 0-.584.876 9.752 9.752 0 0 1-1.65 3.423.75.75 0 0 0 1.115.986 11.252 11.252 0 0 0 1.905-3.92.75.75 0 0 0-.9-1.018 8.25 8.25 0 0 1-5.182 1.036.75.75 0 0 0-.74-1.233A8.25 8.25 0 0 1 3.75 12Z" /></svg>;
const LanguageIcon = ({width=20, height=20}: {width?: number; height?: number}) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width={width} height={height}><path fillRule="evenodd" d="M8.25 6.75a3.75 3.75 0 0 0-3.75 3.75v.518c.928.09 1.815.24 2.65.443V10.5a1.125 1.125 0 0 1 1.125-1.125h1.5v6.75h-1.5a1.125 1.125 0 0 1-1.125-1.125v-.345a3.74 3.74 0 0 0-2.65.443v.518a3.75 3.75 0 0 0 3.75 3.75h1.5a.75.75 0 0 0 .75-.75v-9a.75.75 0 0 0-.75-.75h-1.5Z" clipRule="evenodd" /><path d="M12.75 2.25a.75.75 0 0 0-1.5 0v.512a14.28 14.28 0 0 0 1.5 0V2.25Z" /><path fillRule="evenodd" d="M12.75 5.493A12.75 12.75 0 0 0 12 5.25c-3.13 0-6.064 1.138-8.467 3.003a.75.75 0 1 0 .934 1.164A11.25 11.25 0 0 1 12 6.75c3.513 0 6.756 1.62 8.878 4.148a.75.75 0 1 0 1.244-.828A12.75 12.75 0 0 0 12.75 5.493Z" clipRule="evenodd" /><path d="M12.75 20.25a.75.75 0 0 0 1.5 0v-.512a14.28 14.28 0 0 0-1.5 0v.512Z" /><path fillRule="evenodd" d="M12.75 18.507A12.75 12.75 0 0 1 12 18.75c-3.13 0-6.064-1.138-8.467-3.003a.75.75 0 1 1 .934-1.164A11.25 11.25 0 0 0 12 17.25c3.513 0 6.756-1.62 8.878-4.148a.75.75 0 1 1 1.244.828A12.75 12.75 0 0 1 12.75 18.507Z" clipRule="evenodd" /></svg>;
const ChatBubbleIcon = ({width=20, height=20}: {width?: number; height?: number}) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width={width} height={height}><path fillRule="evenodd" d="M4.848 2.771A49.144 49.144 0 0 1 12 2.25c2.43 0 4.817.178 7.152.52 1.978.292 3.348 2.024 3.348 3.97v6.02c0 1.946-1.37 3.678-3.348 3.97a48.901 48.901 0 0 1-3.476.383.75.75 0 0 0-.646.434l-1.457 2.108a2.625 2.625 0 0 1-4.45 0l-1.457-2.108a.75.75 0 0 0-.646-.434 48.9 48.9 0 0 1-3.476-.384c-1.978-.29-3.348-2.024-3.348-3.97V6.74c0-1.946 1.37-3.68 3.348-3.97Z" clipRule="evenodd" /></svg>;
const SparklesIcon = ({width=20, height=20}: {width?: number; height?: number}) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width={width} height={height}><path fillRule="evenodd" d="M9 4.5a.75.75 0 0 1 .75.75v3.546a.75.75 0 0 1-1.5 0V5.25A.75.75 0 0 1 9 4.5Zm6.375 3.75a.75.75 0 0 0-1.5 0v3.546a.75.75 0 0 0 1.5 0V8.25Zm-10.5 3.75A.75.75 0 0 1 5.625 12v3.546a.75.75 0 0 1-1.5 0V12a.75.75 0 0 1 .75-.75Zm16.5 0a.75.75 0 0 0-1.5 0v3.546a.75.75 0 0 0 1.5 0V12Zm-1.875-5.25a.75.75 0 0 0-1.5 0v3.546a.75.75 0 0 0 1.5 0V6.75ZM7.125 9a.75.75 0 0 1 .75.75v3.546a.75.75 0 0 1-1.5 0V9.75a.75.75 0 0 1 .75-.75Zm8.25 1.5a.75.75 0 0 0-1.5 0v3.546a.75.75 0 0 0 1.5 0v-3.546Zm-4.5 3.75a.75.75 0 0 1 .75.75v3.546a.75.75 0 0 1-1.5 0v-3.546a.75.75 0 0 1 .75-.75Z" clipRule="evenodd" /><path d="M12 2.25a.75.75 0 0 1 .75.75v1.285a.75.75 0 0 1-1.5 0V3a.75.75 0 0 1 .75-.75Zm-4.5 3a.75.75 0 0 0-1.5 0v1.285a.75.75 0 0 0 1.5 0V5.25Zm9 0a.75.75 0 0 0-1.5 0v1.285a.75.75 0 0 0 1.5 0V5.25Zm-9 9.75a.75.75 0 0 1 .75.75v1.285a.75.75 0 0 1-1.5 0v-1.285a.75.75 0 0 1 .75-.75Zm4.5 3a.75.75 0 0 0-1.5 0v1.285a.75.75 0 0 0 1.5 0V18Zm4.5-3a.75.75 0 0 1 .75.75v1.285a.75.75 0 0 1-1.5 0v-1.285a.75.75 0 0 1 .75-.75Z" clipRule="evenodd" /></svg>;
const RefreshIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" height="18px" viewBox="0 0 24 24" width="18px" fill="currentColor"><path d="M0 0h24v24H0z" fill="none"/><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>);
const LockIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 0 24 24" width="24px" fill="currentColor"><path d="M0 0h24v24H0z" fill="none"/><path d="M12 17c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm6-9h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM9 6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9V6z"/></svg>);
const CopyIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>);
const DownloadIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M5 20h14v-2H5v2zm14-9h-4V3H9v8H5l7 7 7-7z"/></svg>);
const UploadIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M5 20h14v-2H5v2zm14-9h-4V3H9v8H5l7 7 7-7z" transform="rotate(180 12 12)" /></svg>);


// --- CONTEXTS & TOAST SYSTEM ---
const AppContext = createContext<AppContextType | null>(null);
const AuthContext = createContext<AuthContextType | null>(null);
const ToastContext = createContext<ToastContextType | null>(null);

const useAppContext = () => {
    const context = useContext(AppContext);
    if (!context) throw new Error("useAppContext must be used within an AppProvider");
    return context;
};

const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error("useAuth must be used within an AuthProvider");
    return context;
};

const useToast = () => {
    const context = useContext(ToastContext);
    if (!context) throw new Error("useToast must be used within a ToastProvider");
    return context;
};

const ToastProvider: React.FC<{children: React.ReactNode}> = ({ children }) => {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const addToast = useCallback((message: string, type: Toast['type'] = 'success') => {
        const id = Date.now();
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => {
            setToasts(currentToasts => currentToasts.filter(t => t.id !== id));
        }, 4000);
    }, []);
    
    const removeToast = (id: number) => {
        setToasts(currentToasts => currentToasts.filter(t => t.id !== id));
    };

    return (
        <ToastContext.Provider value={{ addToast }}>
            {children}
            <div className="toast-container">
                {toasts.map(toast => (
                    <div key={toast.id} className={`toast-item toast-${toast.type}`} onClick={() => removeToast(toast.id)}>
                        {toast.message}
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
};


// --- PROVIDERS ---
const AppProvider: React.FC<{children: React.ReactNode}> = ({ children }) => {
    const { addToast } = useToast();
    const [themePreference, setThemePreference] = useLocalStorage<ThemePreference>('theme', 'papyrus');
    const [favorites, setFavorites] = useLocalStorage<string[]>('favorites', []);
    const [history, setHistory] = useLocalStorage<string[]>('history', []);
    const [dictionary, setDictionary] = useLocalStorage<DictionaryEntry[]>('dictionary', DICTIONARY_DATA);
    const synth = window.speechSynthesis;
    
    useEffect(() => {
        document.body.setAttribute('data-theme', themePreference);
    }, [themePreference]);

    const speak = useCallback((textOrEntry: string | DictionaryEntry) => {
        if (!synth) return;
        if (synth.speaking) synth.cancel();

        let textToSpeak = '';
        if (typeof textOrEntry === 'string') {
            textToSpeak = textOrEntry;
        } else {
            textToSpeak = textOrEntry.faka_uvea;
        }

        const utterance = new SpeechSynthesisUtterance(textToSpeak);
        const voices = synth.getVoices();
        utterance.voice = voices.find(voice => voice.lang.startsWith('fr')) || voices[0];
        utterance.lang = 'fr-FR';
        utterance.pitch = 1;
        utterance.rate = 0.9;
        synth.speak(utterance);
    }, [synth]);

    const toggleFavorite = (faka_uvea: string) => {
        const isCurrentlyFavorite = favorites.includes(faka_uvea);
        setFavorites(prev => isCurrentlyFavorite
            ? prev.filter(fav => fav !== faka_uvea)
            : [...prev, faka_uvea]
        );
        addToast(isCurrentlyFavorite ? 'Retiré des favoris' : 'Ajouté aux favoris', 'info');
    };

    const logHistory = (faka_uvea: string) => {
        setHistory(prev => [faka_uvea, ...prev.filter(item => item !== faka_uvea)].slice(0, 50));
    };

    const resetDictionary = () => {
        if (window.confirm("Êtes-vous sûr de vouloir réinitialiser le dictionnaire ? Toutes les modifications locales seront perdues.")) {
            setDictionary(DICTIONARY_DATA);
            addToast("Dictionnaire réinitialisé avec succès.", "success");
        }
    };

    const value = {
        themePreference,
        setThemePreference,
        speak,
        favorites,
        toggleFavorite,
        history,
        logHistory,
        setHistory,
        dictionary,
        setDictionary,
        resetDictionary,
    };

    return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

const AuthProvider: React.FC<{children: React.ReactNode}> = ({ children }) => {
    const [user, setUser] = useSessionStorage<User | null>('user', null);
    const [users, setUsers] = useLocalStorage<User[]>('users', USERS_DATA);

    const login = (username, password) => {
        const foundUser = users.find(u => u.username.toLowerCase() === username.toLowerCase() && u.password === password);
        if (foundUser) {
            setUser(foundUser);
            return true;
        }
        return false;
    };

    const logout = () => {
        setUser(null);
        sessionStorage.removeItem('aiTutorUnlocked');
        sessionStorage.removeItem('aiTutorMessages');
    };
    
    const addUser = (userToAdd: User) => {
        setUsers(prev => [...prev, { ...userToAdd, id: Date.now().toString() }]);
    };

    const updateUser = (userToUpdate: User) => {
        setUsers(prev => prev.map(u => {
            if (u.id === userToUpdate.id) {
                // Keep old password if new one is empty
                return { ...userToUpdate, password: userToUpdate.password || u.password };
            }
            return u;
        }));
    };

    const deleteUser = (userId: string) => {
        setUsers(prev => prev.filter(u => u.id !== userId));
    };

    const resetUsers = () => {
        if (window.confirm("Êtes-vous sûr de vouloir réinitialiser la liste des utilisateurs ? Toutes les modifications locales seront perdues.")) {
            setUsers(USERS_DATA);
        }
    };

    return (
        <AuthContext.Provider value={{ user, users, login, logout, addUser, updateUser, deleteUser, resetUsers, setUsers }}>
            {children}
        </AuthContext.Provider>
    );
};


// --- UI COMPONENTS ---

const WordCard = ({ entry, onSelect, detailed = false }: { entry: DictionaryEntry, onSelect?: (entry: DictionaryEntry) => void, detailed?: boolean }) => {
    const { speak, favorites, toggleFavorite, logHistory } = useAppContext();
    const isFavorite = favorites.includes(entry.faka_uvea);
    const hasAudio = !!entry.audio_url;

    const handleCardClick = (e: React.MouseEvent | React.KeyboardEvent) => {
        if (e.target instanceof HTMLElement) {
             // prevent card click when clicking a button
            if (e.target.closest('button')) return;
        }
        if(onSelect) {
            onSelect(entry);
        }
        logHistory(entry.faka_uvea);
    };

    const handleSpeak = (e: React.MouseEvent) => {
        e.stopPropagation();
        speak(entry);
    };

    const handleFavorite = (e: React.MouseEvent) => {
        e.stopPropagation();
        toggleFavorite(entry.faka_uvea);
    };

    return (
        <article
            className="word-card"
            onClick={handleCardClick}
            onKeyDown={(e) => { if(e.key === 'Enter' || e.key === ' ') handleCardClick(e as any);}}
            tabIndex={onSelect ? 0 : -1}
            aria-label={`Voir les détails pour ${entry.faka_uvea}`}
        >
            {entry.image_url && <img src={entry.image_url} alt={`Illustration pour ${entry.faka_uvea}`} className="word-card-image" loading="lazy" />}
            <div className="word-card-content">
                <div className="word-card-header">
                    <div>
                        <h3>{entry.faka_uvea}</h3>
                        {entry.phonetic && <p className="phonetic-details">{entry.phonetic}</p>}
                    </div>
                    <div className="word-card-actions">
                         <button
                            onClick={handleSpeak}
                            className={`tts-button ${hasAudio ? 'authentic-audio' : ''}`}
                            aria-label={`Écouter la prononciation de ${entry.faka_uvea}`}
                            title={hasAudio ? 'Écouter l\'audio authentique' : 'Écouter la prononciation'}
                        >
                            <SpeakerIcon />
                        </button>
                        <button
                            onClick={handleFavorite}
                            className={`favorite-btn ${isFavorite ? 'active' : ''}`}
                            aria-label={isFavorite ? `Retirer ${entry.faka_uvea} des favoris` : `Ajouter ${entry.faka_uvea} aux favoris`}
                            title={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                        >
                           <StarIcon filled={isFavorite} width={28} height={28} />
                        </button>
                    </div>
                </div>

                {entry.meanings.map((meaning, index) => (
                    <div key={index} className="meaning-block">
                         {entry.meanings.length > 1 && <span className="meaning-number">{index + 1}.</span>}
                        <p className="word-details">{meaning.type}</p>
                        <p className="word-translation">{meaning.french}</p>
                        {meaning.examples.length > 0 && detailed && (
                             <div className="word-example">
                                <p className="faka-uvea-example">{meaning.examples[0].faka_uvea}</p>
                                <p>{meaning.examples[0].french}</p>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </article>
    );
};

const ThemeSwitcher = () => {
    const { themePreference, setThemePreference } = useAppContext();
    const [isOpen, setIsOpen] = useState(false);
    const wrapperRef = useRef(null);

    const themes = [
        { name: 'light', label: 'Clair', icon: <SunIcon /> },
        { name: 'dark', label: 'Sombre', icon: <MoonIcon /> },
        { name: 'papyrus', label: 'Papyrus', icon: <ScrollIcon /> },
        { name: 'system', label: 'Système', icon: <SystemIcon /> },
    ];

    const currentThemeIcon = themes.find(t => t.name === themePreference)?.icon || <SystemIcon/>

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [wrapperRef]);


    return (
        <div className="theme-selector-wrapper" ref={wrapperRef}>
            <button
                className="theme-switcher-button"
                onClick={() => setIsOpen(!isOpen)}
                aria-label="Changer de thème"
                title="Changer de thème"
            >
                {currentThemeIcon}
            </button>
            {isOpen && (
                <div className="theme-dropdown" role="menu">
                    {themes.map(({ name, label, icon }) => (
                         <button
                            key={name}
                            onClick={() => {
                                setThemePreference(name as ThemePreference);
                                setIsOpen(false);
                            }}
                            role="menuitem"
                        >
                            {icon}
                            <span>{label}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};


const Header = ({ currentPage, onNavClick }: { currentPage: string, onNavClick: (page: string) => void }) => {
    const { user, logout } = useAuth();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const navRef = useRef<HTMLDivElement>(null);
    const indicatorRef = useRef<HTMLSpanElement>(null);

    const baseNavItems = [
        { id: 'home', label: 'Accueil', icon: <HomeIcon /> },
        { id: 'dictionary', label: 'Dictionnaire', icon: <BookOpenIcon /> },
        { id: 'games', label: 'Jeux', icon: <PuzzlePieceIcon /> },
        { id: 'guide', label: 'Guide', icon: <LanguageIcon /> },
        { id: 'favorites', label: 'Favoris', icon: <StarIcon filled={true} /> },
        { id: 'history', label: 'Historique', icon: <HistoryIcon /> },
        { id: 'faka-uvea', label: 'Langue Faka\'uvea', icon: <SparklesIcon /> },
        { id: 'ai_tutor', label: 'Tuteur IA', icon: <ChatBubbleIcon /> },
        { id: 'exams', label: 'EXAMS', icon: <TrophyIcon /> },
    ];
    
    const navItems = useMemo(() => {
        const items = [...baseNavItems];
        if (user?.role === 'admin') {
            items.push({ id: 'gestion', label: 'Gestion Dico', icon: <CogIcon /> });
            items.push({ id: 'user_management', label: 'Utilisateurs', icon: <UsersIcon /> });
        }
        return items;
    }, [user]);


    const handleNavClick = (pageId: string, e: React.MouseEvent) => {
        e.preventDefault();
        onNavClick(pageId);
        setIsMobileMenuOpen(false);
    };
    
    useEffect(() => {
        if (isMobileMenuOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'auto';
        }
        return () => { document.body.style.overflow = 'auto'; };
    }, [isMobileMenuOpen]);


    useLayoutEffect(() => {
        if (!navRef.current || !indicatorRef.current) return;
        
        const currentLink = navRef.current.querySelector(`[aria-current="page"]`) as HTMLElement;
        if (currentLink) {
             indicatorRef.current.style.opacity = '1';
             indicatorRef.current.style.width = `${currentLink.offsetWidth}px`;
             indicatorRef.current.style.transform = `translateX(${currentLink.offsetLeft}px)`;
        } else {
             indicatorRef.current.style.opacity = '0';
        }
    }, [currentPage, navItems]);


    const renderDesktopNavLinks = () => navItems.map(item => (
        <a
            key={item.id}
            href={`#${item.id}`}
            className="nav-link"
            aria-current={currentPage === item.id ? 'page' : undefined}
            onClick={(e) => handleNavClick(item.id, e)}
        >
            {React.cloneElement(item.icon, { width: 18, height: 18 })}
            <span>{item.label}</span>
        </a>
    ));
    
    const renderMobileNavLinks = () => navItems.map(item => (
         <li key={item.id}>
            <a
                href={`#${item.id}`}
                className={currentPage === item.id ? 'active' : ''}
                onClick={(e) => handleNavClick(item.id, e)}
            >
                {React.cloneElement(item.icon, { width: 22, height: 22 })}
                <span>{item.label}</span>
            </a>
        </li>
    ));

    return (
        <header className={`app-header ${isMobileMenuOpen ? 'mobile-menu-active' : ''}`}>
            <a href="#home" onClick={(e) => handleNavClick('home', e)} className="header-title-link">
                <h1 className="header-title">Faka'uvea</h1>
            </a>
            
             <nav className="desktop-nav" aria-label="Navigation principale">
                <div className="header-nav" ref={navRef}>
                    {renderDesktopNavLinks()}
                    <span ref={indicatorRef} className="nav-indicator"></span>
                </div>
             </nav>

            <div className="header-right-panel">
                <span className="user-info">Utilisateur: {user.username}</span>
                <button onClick={logout} className="logout-button" title="Se déconnecter">Déconnexion</button>
                <ThemeSwitcher />
            </div>

            <button
                className="mobile-menu-toggle"
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                aria-label="Ouvrir le menu"
            >
                {isMobileMenuOpen ? <CloseIcon /> : <MenuIcon />}
            </button>

             {isMobileMenuOpen && (
                <nav className="mobile-nav-menu">
                    <div className="mobile-nav-header">
                        <h2 className="mobile-nav-title">Menu</h2>
                         <button
                            className="mobile-menu-close"
                            onClick={() => setIsMobileMenuOpen(false)}
                            aria-label="Fermer le menu"
                        >
                            <CloseIcon />
                        </button>
                    </div>
                     <ul className="mobile-nav-links">
                        {renderMobileNavLinks()}
                     </ul>
                     <div className="mobile-nav-footer">
                        <div className="mobile-user-info">
                            <span>Connecté: <strong>{user.username}</strong></span>
                            <button onClick={() => { logout(); setIsMobileMenuOpen(false); }} className="logout-button">Déconnexion</button>
                        </div>
                        <ThemeSwitcher />
                     </div>
                </nav>
            )}
        </header>
    );
};


const Footer = ({ onNavClick }: { onNavClick: (page: string) => void }) => {
    const handleLinkClick = (pageId: string, e: React.MouseEvent) => {
        e.preventDefault();
        onNavClick(pageId);
    }
    return (
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-column">
            <h4>À Propos</h4>
            <p>Ce dictionnaire Faka'uvea-Français est un outil communautaire visant à préserver et promouvoir la langue wallisienne.</p>
          </div>
          <div className="footer-column">
            <h4>Navigation</h4>
            <ul className="footer-links">
              <li><a href="#home" onClick={(e) => handleLinkClick('home', e)}>Accueil</a></li>
              <li><a href="#dictionary" onClick={(e) => handleLinkClick('dictionary', e)}>Dictionnaire</a></li>
              <li><a href="#games" onClick={(e) => handleLinkClick('games', e)}>Jeux</a></li>
              <li><a href="#guide" onClick={(e) => handleLinkClick('guide', e)}>Guide de conversation</a></li>
              <li><a href="#favorites" onClick={(e) => handleLinkClick('favorites', e)}>Favoris</a></li>
              <li><a href="#history" onClick={(e) => handleLinkClick('history', e)}>Historique</a></li>
            </ul>
          </div>
          <div className="footer-column">
            <h4>Ressources</h4>
            <ul className="footer-links">
               <li><a href="#faka-uvea" onClick={(e) => handleLinkClick('faka-uvea', e)}>Langue Faka'uvea</a></li>
               <li><a href="#exams" onClick={(e) => handleLinkClick('exams', e)}>Diplômes</a></li>
               <li><a href="#ai_tutor" onClick={(e) => handleLinkClick('ai_tutor', e)}>Tuteur IA</a></li>
            </ul>
          </div>
        </div>
        <div className="footer-bottom">
          <p>&copy; {new Date().getFullYear()} Dictionnaire Faka'uvea. Tous droits réservés.</p>
        </div>
      </footer>
    );
}

// --- PAGES ---

const HomePage = ({ onNavClick }: { onNavClick: (page: string) => void }) => {
    const { dictionary } = useAppContext();
    const wordOfTheDay = useMemo(() => dictionary.length > 0 ? dictionary[Math.floor(Math.random() * dictionary.length)] : null, [dictionary]);

    const features = [
        {
            title: "Dictionnaire Complet",
            description: "Explorez des milliers de mots, avec prononciations et exemples.",
            icon: <BookOpenIcon width={32} height={32}/>,
            page: "dictionary"
        },
        {
            title: "Jeux Interactifs",
            description: "Apprenez en vous amusant avec nos jeux de mémoire, flashcards et plus.",
            icon: <PuzzlePieceIcon width={32} height={32}/>,
            page: "games"
        },
        {
            title: "Guide de Conversation",
            description: "Maîtrisez les phrases essentielles pour vos échanges quotidiens.",
            icon: <LanguageIcon width={32} height={32}/>,
            page: "guide"
        },
        {
            title: "Tuteur IA",
            description: "Posez vos questions et pratiquez avec notre tuteur intelligent.",
            icon: <ChatBubbleIcon width={32} height={32}/>,
            page: "ai_tutor"
        },
        {
            title: "Obtenez un Diplôme",
            description: "Testez vos connaissances et obtenez des diplômes pour valider votre niveau.",
            icon: <TrophyIcon width={32} height={32}/>,
            page: "exams"
        },
         {
            title: "La Langue Faka'uvea",
            description: "Découvrez l'alphabet, la prononciation et l'histoire de la langue.",
            icon: <SparklesIcon width={32} height={32}/>,
            page: "faka-uvea"
        }
    ];

    return (
        <div className="page-container">
            <section className="home-hero">
                <h1 className="hero-title">Faka'uvea</h1>
                <p className="hero-subtitle">Le portail de référence pour la langue et la culture de Wallis ('Uvea)</p>
                <button className="button-primary" onClick={() => onNavClick('dictionary')}>Explorer le dictionnaire</button>
            </section>

            <section className="home-section">
                <h2>Fonctionnalités Principales</h2>
                <div className="features-grid">
                    {features.map(feature => (
                        <div key={feature.page} className="feature-card" onClick={() => onNavClick(feature.page)}>
                             <div className="feature-card-icon">{feature.icon}</div>
                            <h4>{feature.title}</h4>
                            <p>{feature.description}</p>
                        </div>
                    ))}
                </div>
            </section>

            <section className="home-section">
                <h2>Mot du Jour</h2>
                <div className="word-of-the-day">
                    {wordOfTheDay ? (
                        <WordCard entry={wordOfTheDay} detailed={true}/>
                    ) : (
                        <p>Chargement du mot du jour...</p>
                    )}
                </div>
            </section>
        </div>
    );
};


const DictionaryPage = () => {
    const { dictionary, logHistory } = useAppContext();
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedLetter, setSelectedLetter] = useState('');
    
    const alphabetStatus = useMemo(() => {
        const activeLetters = new Set(dictionary.map(entry => entry.faka_uvea.charAt(0).toUpperCase()));
        return ALPHABET.map(letter => ({
            letter,
            enabled: activeLetters.has(letter)
        }));
    }, [dictionary]);

    const filteredDictionary = useMemo(() => {
        let results = dictionary;
        if (selectedLetter) {
            results = results.filter(entry => entry.faka_uvea.toLowerCase().startsWith(selectedLetter.toLowerCase()));
        }
        if (searchTerm) {
            const lowerCaseSearch = searchTerm.toLowerCase();
            results = results.filter(entry =>
                entry.faka_uvea.toLowerCase().includes(lowerCaseSearch) ||
                entry.meanings.some(m => m.french.toLowerCase().includes(lowerCaseSearch))
            );
        }
        return results;
    }, [searchTerm, selectedLetter, dictionary]);

    const handleLetterSelect = (letter: string) => {
        setSelectedLetter(letter);
        setSearchTerm('');
    };

    const clearFilter = () => {
        setSelectedLetter('');
        setSearchTerm('');
    };

    const getSuggestion = () => {
        if (searchTerm.length > 2 && filteredDictionary.length === 0) {
            let bestMatch: DictionaryEntry | null = null;
            let minDistance = Infinity;

            dictionary.forEach(entry => {
                const distance = levenshteinDistance(searchTerm, entry.faka_uvea);
                if (distance < minDistance && distance < 4) {
                    minDistance = distance;
                    bestMatch = entry;
                }
            });

            return bestMatch;
        }
        return null;
    };

    const suggestion = getSuggestion();

    return (
        <div className="page-container">
            <h1 className="page-title">Dictionnaire Faka'uvea</h1>
            <div className="dictionary-controls">
                <input
                    type="search"
                    className="search-bar"
                    placeholder="Rechercher un mot en faka'uvea ou en français..."
                    value={searchTerm}
                    onChange={(e) => {
                        setSearchTerm(e.target.value);
                        setSelectedLetter('');
                    }}
                />
                <nav className="alphabet-nav" aria-label="Filtre par lettre">
                    {alphabetStatus.map(({ letter, enabled }) => (
                        <button
                            key={letter}
                            onClick={() => handleLetterSelect(letter)}
                            className={selectedLetter === letter ? 'active' : ''}
                        >
                            {letter}
                        </button>
                    ))}
                    <button onClick={clearFilter} className="clear">Tout</button>
                </nav>
            </div>
            <div className="word-grid">
                {filteredDictionary.length > 0 ? (
                    filteredDictionary.map((entry, index) => (
                        <WordCard key={entry.faka_uvea + index} entry={entry} detailed={true} onSelect={() => logHistory(entry.faka_uvea)} />
                    ))
                ) : (
                    <div className="no-results">
                         <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M11.25 2.25c-5.18 0-9.447 4.033-9.948 9.135a.75.75 0 0 0 .736.865h3.455a.75.75 0 0 0 .713-.56C6.425 8.74 8.635 6.75 11.25 6.75c2.31 0 4.295 1.592 4.88 3.73a.75.75 0 0 0 .712.57h3.456a.75.75 0 0 0 .735-.865C20.697 6.283 16.43 2.25 11.25 2.25Z" /><path fillRule="evenodd" d="M3.569 14.25a.75.75 0 0 1 .74-.65h.335c1.173 0 2.278.43 3.123 1.159a.75.75 0 0 1-.962 1.15A2.999 2.999 0 0 0 4.598 15h-.25a.75.75 0 0 1-.78-.75ZM15.268 15.91a.75.75 0 0 1 .962-1.15c.844-.729 1.95-1.159 3.122-1.159h.335a.75.75 0 0 1 .74.65.75.75 0 0 1-.78.75h-.25a3 3 0 0 0-2.202.841.75.75 0 0 1-.962-1.15Z" clipRule="evenodd" /><path d="M11.25 12.75a2.25 2.25 0 1 0 0 4.5 2.25 2.25 0 0 0 0-4.5Z" /></svg>
                        <p>Aucun résultat trouvé pour "{searchTerm || `lettre ${selectedLetter}`}".</p>
                        {suggestion && (
                           <p className="suggestion-text">
                                Vouliez-vous dire <a onClick={() => setSearchTerm(suggestion.faka_uvea)}>{suggestion.faka_uvea}</a> ?
                           </p>
                        )}
                         <div className="no-results-action">
                             <button className="button-secondary" onClick={clearFilter}>Voir tous les mots</button>
                         </div>
                    </div>
                )}
            </div>
        </div>
    );
};

const FavoritesPage = () => {
    const { favorites, dictionary, logHistory } = useAppContext();
    const favoriteEntries = useMemo(() =>
        dictionary.filter(entry => favorites.includes(entry.faka_uvea)),
        [favorites, dictionary]
    );

    return (
        <div className="page-container">
            <h1 className="page-title">Mes Favoris</h1>
            {favoriteEntries.length > 0 ? (
                <div className="word-grid">
                    {favoriteEntries.map((entry, index) => (
                        <WordCard key={entry.faka_uvea + index} entry={entry} detailed={true} onSelect={() => logHistory(entry.faka_uvea)} />
                    ))}
                </div>
            ) : (
                <div className="empty-page-state">
                    <StarIcon filled={true} width={48} height={48} />
                    <h2>Aucun favori pour le moment</h2>
                    <p>Cliquez sur l'étoile sur un mot pour l'ajouter à vos favoris.</p>
                </div>
            )}
        </div>
    );
};

const HistoryPage = () => {
    const { history, dictionary, setHistory, logHistory } = useAppContext();
    const historyEntries = useMemo(() =>
        history.map(faka_uvea => dictionary.find(entry => entry.faka_uvea === faka_uvea)).filter(Boolean) as DictionaryEntry[],
        [history, dictionary]
    );

    const handleClearHistory = () => {
        if (window.confirm("Êtes-vous sûr de vouloir vider votre historique de consultation ?")) {
            setHistory([]);
        }
    };

    return (
        <div className="page-container">
             <div className="gestion-header" style={{ gridTemplateAreas: '"title actions"' } as React.CSSProperties}>
                <h1 className="page-title">Historique</h1>
                {history.length > 0 && (
                     <div className="gestion-actions">
                        <button className="button-secondary" onClick={handleClearHistory}>
                             Vider l'historique
                        </button>
                    </div>
                )}
            </div>
            {historyEntries.length > 0 ? (
                <div className="word-grid">
                    {historyEntries.map((entry, index) => (
                        <WordCard key={entry.faka_uvea + index} entry={entry} detailed={true} onSelect={() => logHistory(entry.faka_uvea)} />
                    ))}
                </div>
            ) : (
                <div className="empty-page-state">
                    <HistoryIcon width={48} height={48} />
                    <h2>Aucun historique</h2>
                    <p>Votre historique de consultation des mots apparaîtra ici.</p>
                </div>
            )}
        </div>
    );
};

const GuidePage = () => {
    const { speak } = useAppContext();
    const { addToast } = useToast();
    const [search, setSearch] = useState("");

    const filteredGuideData = useMemo(() => {
        if (!search) return GUIDE_DATA;
        const lowerSearch = search.toLowerCase();
        return GUIDE_DATA.map(category => {
            const filteredPhrases = category.phrases.filter(phrase =>
                phrase.faka_uvea.toLowerCase().includes(lowerSearch) ||
                phrase.french.toLowerCase().includes(lowerSearch)
            );
            return { ...category, phrases: filteredPhrases };
        }).filter(category => category.phrases.length > 0);
    }, [search]);

    const playAll = (phrases: {faka_uvea: string; french: string}[]) => {
        phrases.forEach((phrase, index) => {
            setTimeout(() => {
                speak(phrase.faka_uvea);
            }, index * 2000); // 2 seconds delay between each phrase
        });
    };
    
    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text).then(() => {
            addToast('Phrase copiée !', 'success');
        }, () => {
            addToast('Erreur lors de la copie', 'error');
        });
    };

    return (
        <div className="page-container">
            <h1 className="page-title">Guide de Conversation</h1>
            <div className="guide-controls">
                 <input
                    type="search"
                    className="search-bar"
                    placeholder="Rechercher une phrase..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
            </div>
            {filteredGuideData.map((category, index) => (
                <section key={category.name} className="guide-category" style={{animationDelay: `${index * 100}ms`}}>
                    <div className="guide-category-header">
                        <h3>{category.name}</h3>
                        <button className="play-all-btn" onClick={() => playAll(category.phrases)} title="Écouter toutes les phrases de cette catégorie">
                            <PlayIcon />
                            Tout écouter
                        </button>
                    </div>

                    <ul className="phrase-list">
                        {category.phrases.map((phrase, pIndex) => (
                            <li key={pIndex} className="phrase-item" style={{animationDelay: `${(pIndex * 50)}ms`}}>
                                <div className="phrase-text">
                                    <p className="faka-uvea-phrase">{phrase.faka_uvea}</p>
                                    <p className="french-phrase">{phrase.french}</p>
                                </div>
                                <div className="phrase-actions">
                                    <button
                                        onClick={() => handleCopy(phrase.faka_uvea)}
                                        className="tts-button"
                                        aria-label={`Copier : ${phrase.faka_uvea}`}
                                        title="Copier la phrase"
                                    >
                                        <CopyIcon />
                                    </button>
                                    <button
                                        onClick={() => speak(phrase.faka_uvea)}
                                        className="tts-button"
                                        aria-label={`Écouter : ${phrase.faka_uvea}`}
                                        title="Écouter la phrase"
                                    >
                                        <SpeakerIcon />
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                </section>
            ))}
        </div>
    );
};

const AITutorPage = () => {
    const [isUnlocked, setIsUnlocked] = useSessionStorage('aiTutorUnlocked', false);
    const [passwordInput, setPasswordInput] = useState('');
    const [unlockError, setUnlockError] = useState('');
    
    const [messages, setMessages] = useSessionStorage<{text: string; sender: 'user' | 'ai'}[]>('aiTutorMessages', []);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const chatWindowRef = useRef<HTMLDivElement>(null);
    const chat = useRef<Chat | null>(null);

     useEffect(() => {
        if (!isUnlocked) return;

        chat.current = ai.chats.create({
          model: 'gemini-2.5-flash',
          config: {
            systemInstruction: 'You are a friendly and helpful tutor for the Faka\'uvea (Wallisian) language. Your name is Tali. Your goal is to help users learn and practice Faka\'uvea. Always be encouraging. If a user asks a question about something other than the language, gently guide them back to the topic of Faka\'uvea. Answer in French, but you can use Faka\'uvea words and phrases in your explanations. Start the first message by introducing yourself.',
          },
        });
        
        if (messages.length === 0) {
            setIsLoading(true);
            chat.current.sendMessage({ message: "Introduce yourself" }).then(response => {
                 setMessages([{ text: response.text, sender: 'ai' }]);
            }).finally(() => {
                 setIsLoading(false);
            });
        }
    }, [isUnlocked]);


    useEffect(() => {
        if (chatWindowRef.current) {
            chatWindowRef.current.scrollTop = chatWindowRef.current.scrollHeight;
        }
    }, [messages]);

    const handleUnlockSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (passwordInput === '123') {
            setIsUnlocked(true);
            setUnlockError('');
        } else {
            setUnlockError('Mot de passe incorrect.');
            setPasswordInput('');
        }
    };

    const sendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || isLoading || !isUnlocked) return;

        const userMessage = { text: input, sender: 'user' as const };
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);

        try {
            if (chat.current) {
                const response = await chat.current.sendMessage({ message: input });
                const aiMessage = { text: response.text, sender: 'ai' as const };
                setMessages(prev => [...prev, aiMessage]);
            }
        } catch (error) {
            console.error("Error sending message to AI:", error);
            const errorMessage = { text: "Désolé, une erreur est survenue. Veuillez réessayer.", sender: 'ai' as const };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsLoading(false);
        }
    };

    const UserAvatar = () => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path fillRule="evenodd" d="M7.5 6a4.5 4.5 0 1 1 9 0 4.5 4.5 0 0 1-9 0ZM3.751 20.105a8.25 8.25 0 0 1 16.498 0 .75.75 0 0 1-.437.695A18.683 18.683 0 0 1 12 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 0 1-.437-.695Z" clipRule="evenodd" /></svg>;
    const AIAvatar = () => <SparklesIcon width={24} height={24} />;

    if (!isUnlocked) {
        return (
            <div className="page-container ai-tutor-lock-overlay">
                <form onSubmit={handleUnlockSubmit} className="lock-form-container">
                    <LockIcon />
                    <h3>Accès sécurisé</h3>
                    <p>Veuillez entrer le mot de passe pour accéder au Tuteur IA.</p>
                    <input
                        type="password"
                        value={passwordInput}
                        onChange={(e) => setPasswordInput(e.target.value)}
                        className="login-input"
                        placeholder="Mot de passe"
                    />
                    {unlockError && <p className="login-error">{unlockError}</p>}
                    <button type="submit" className="button-primary">Déverrouiller</button>
                </form>
            </div>
        );
    }

    return (
        <div className="page-container ai-tutor-page-container">
            <div className="ai-tutor-page">
                 <header className="ai-tutor-header">
                    <h1 className="page-title">Tuteur IA</h1>
                    <p className="page-subtitle">Discutez avec Tali, votre assistant personnel pour apprendre le Faka'uvea.</p>
                 </header>
                <div className="chat-window" ref={chatWindowRef}>
                    {messages.map((msg, index) => (
                        <div key={index} className={`chat-message ${msg.sender}-message`}>
                            <div className="message-avatar">
                                {msg.sender === 'user' ? <UserAvatar /> : <AIAvatar />}
                            </div>
                            <div className="message-content">
                                <p>{msg.text}</p>
                            </div>
                        </div>
                    ))}
                    {isLoading && (
                        <div className="chat-message ai-message">
                             <div className="message-avatar"><AIAvatar /></div>
                             <div className="message-content">
                                <div className="loading-indicator">
                                    <span></span><span></span><span></span>
                                </div>
                             </div>
                        </div>
                    )}
                </div>
                <div className="chat-input-area">
                    <form onSubmit={sendMessage} className="chat-input-form">
                        <input
                            type="text"
                            className="chat-input"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="Posez votre question à Tali..."
                            disabled={isLoading}
                            aria-label="Votre message"
                        />
                        <button type="submit" className="send-button" disabled={isLoading || !input.trim()} aria-label="Envoyer" title="Envoyer">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" /></svg>
                        </button>
                    </form>
                    <p className="ai-tutor-disclaimer">Ceci est un outil de conversation expérimental en test. Les informations peuvent être incorrectes.</p>
                </div>
            </div>
        </div>
    );
};

const FakaUveaInfoPage = () => {
    return (
        <div className="page-container faka-uvea-info-page">
            <h1 className="page-title">La Langue Faka'uvea</h1>
            <section className="info-section">
                <h2>L'Alphabet (Te 'Alafapeti)</h2>
                <p>L'alphabet wallisien est simple et phonétique. Il se compose de 16 lettres, dont une consonne spéciale appelée 'gutu' (apostrophe) qui représente un coup de glotte.</p>
                <div className="alphabet-list">
                    {ALPHABET.map(letter => <span key={letter} className="alphabet-letter">{letter}</span>)}
                </div>
            </section>
             <section className="info-section">
                <h2>Guide de Prononciation</h2>
                <dl className="pronunciation-guide">
                    <div>
                        <dt>Voyelles</dt>
                        <dd>Les voyelles (A, E, I, O, U) se prononcent comme en espagnol ou en italien, et non comme en français. Par exemple, 'U' se prononce "ou".</dd>
                    </div>
                     <div>
                        <dt>Consonnes</dt>
                        <dd>La plupart des consonnes (F, H, K, L, M, N, S, T, V) se prononcent comme en français. 'G' est une exception, il se prononce toujours "ng" comme dans "parking".</dd>
                    </div>
                     <div>
                        <dt>Le 'Gutu' (')</dt>
                        <dd>L'apostrophe représente un "coup de glotte", une brève pause ou une coupure de son, similaire au "uh-oh" en anglais. C'est une consonne à part entière.</dd>
                    </div>
                </dl>
            </section>
        </div>
    );
};

const GamesPage = () => {
    type GameTab = 'Memory' | 'Mots Mêlés' | 'Le Pendu' | 'Flashcards' | 'Scrabble';
    const [activeTab, setActiveTab] = useState<GameTab>('Memory');

    const gameTabs: { id: GameTab, label: string }[] = [
        { id: 'Memory', label: 'Memory' },
        { id: 'Scrabble', label: 'Scrabble' },
        { id: 'Mots Mêlés', label: 'Mots Mêlés' },
        { id: 'Le Pendu', label: 'Le Pendu' },
        { id: 'Flashcards', label: 'Flashcards' },
    ];

    const renderGameContent = () => {
        switch (activeTab) {
            case 'Memory':
                return <MemoryGame />;
            case 'Scrabble':
                return <ScrabbleGame />;
            case 'Mots Mêlés':
                return <WordSearchGame />;
            case 'Le Pendu':
                return <HangmanGame />;
            case 'Flashcards':
                return <FlashcardsGame />;
            default:
                return null;
        }
    }

    return (
        <div className="page-container">
            <h1 className="page-title">Jeux Éducatifs</h1>
            <div className="game-tabs">
                {gameTabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={activeTab === tab.id ? 'active' : ''}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>
            <div className="game-content">
                {renderGameContent()}
            </div>
        </div>
    );
};

const MemoryGame = () => {
    const { dictionary } = useAppContext();
    const [cards, setCards] = useState<{type: string; content: string; id: string}[]>([]);
    const [flipped, setFlipped] = useState<number[]>([]);
    const [matched, setMatched] = useState<string[]>([]);
    const [moves, setMoves] = useState(0);

    const initializeGame = useCallback(() => {
        const wordPool = dictionary.filter(entry => entry.meanings.length > 0 && entry.meanings[0].french);
        const shuffled = wordPool.sort(() => 0.5 - Math.random());
        const selectedWords = shuffled.slice(0, 8);

        const gameCards = selectedWords.flatMap(word => ([
            { type: 'word', content: word.faka_uvea, id: word.faka_uvea },
            { type: 'translation', content: word.meanings[0].french, id: word.faka_uvea }
        ]));

        setCards(gameCards.sort(() => Math.random() - 0.5));
        setFlipped([]);
        setMatched([]);
        setMoves(0);
    }, [dictionary]);

    useEffect(() => {
        initializeGame();
    }, [initializeGame]);

    useEffect(() => {
        if (flipped.length === 2) {
            setMoves(m => m + 1);
            const [first, second] = flipped;
            if (cards[first].id === cards[second].id) {
                setMatched(prev => [...prev, cards[first].id]);
            }
            setTimeout(() => setFlipped([]), 1200);
        }
    }, [flipped, cards]);

    const handleCardClick = (index: number) => {
        if (flipped.length < 2 && !flipped.includes(index) && !matched.includes(cards[index].id)) {
            setFlipped(prev => [...prev, index]);
        }
    };
    
    const isWon = matched.length === 8;

    return (
        <div>
            <div className="game-controls">
                <p>Paires trouvées : {matched.length} / 8</p>
                <p>Coups : {moves}</p>
                <button onClick={initializeGame} aria-label="Recommencer la partie" title="Recommencer"><RestartIcon/></button>
            </div>
            {isWon && <p className="game-win-message">Félicitations ! Vous avez trouvé toutes les paires !</p>}
            <div className="memory-grid">
                {cards.map((card, index) => (
                    <div
                        key={index}
                        className={`memory-card ${flipped.includes(index) || matched.includes(card.id) ? 'flipped' : ''} ${matched.includes(card.id) ? 'matched' : ''}`}
                        onClick={() => handleCardClick(index)}
                    >
                        <div className="card-face card-face-front"></div>
                        <div className="card-face card-face-back">{card.content}</div>
                    </div>
                ))}
            </div>
        </div>
    );
};

const FlashcardsGame = () => {
    const { dictionary } = useAppContext();
    const [deck, setDeck] = useState<DictionaryEntry[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isFlipped, setIsFlipped] = useState(false);

    const shuffleDeck = useCallback(() => {
        const wordPool = dictionary.filter(entry => entry.meanings.length > 0 && entry.meanings[0].french);
        const shuffled = wordPool.sort(() => 0.5 - Math.random());
        setDeck(shuffled);
        setCurrentIndex(0);
        setIsFlipped(false);
    }, [dictionary]);
    
    useEffect(() => {
        if (dictionary.length > 0) {
            shuffleDeck();
        }
    }, [dictionary, shuffleDeck]);

    const handleNext = () => {
        setIsFlipped(false);
        setTimeout(() => setCurrentIndex((prev) => (prev + 1) % deck.length), 150);
    };

    const handlePrev = () => {
        setIsFlipped(false);
        setTimeout(() => setCurrentIndex((prev) => (prev - 1 + deck.length) % deck.length), 150);
    };

    if (deck.length === 0) return <p>Chargement des flashcards...</p>;

    const currentCard = deck[currentIndex];

    return (
        <div className="flashcards-container">
             <div className="flashcard-deck">
                <div className={`flashcard ${isFlipped ? 'flipped' : ''}`} onClick={() => setIsFlipped(!isFlipped)}>
                    <div className="flashcard-face flashcard-face-front">
                        {currentCard.faka_uvea}
                        <span className="flashcard-hint">(cliquez pour voir la réponse)</span>
                    </div>
                    <div className="flashcard-face flashcard-face-back">
                        {currentCard.meanings[0].french}
                    </div>
                </div>
            </div>
            <div className="flashcard-controls">
                <button onClick={handlePrev}>Précédent</button>
                <span>{currentIndex + 1} / {deck.length}</span>
                <button onClick={handleNext}>Suivant</button>
            </div>
            <button onClick={shuffleDeck} className="shuffle-button" title="Mélanger les cartes">
                <RefreshIcon />
                Mélanger
            </button>
        </div>
    );
};

const ScrabbleGame = () => {
    const { dictionary } = useAppContext();
    const [currentWord, setCurrentWord] = useState<DictionaryEntry | null>(null);
    const [scrambled, setScrambled] = useState('');
    const [userInput, setUserInput] = useState('');
    const [feedback, setFeedback] = useState('');

    const startNewGame = useCallback(() => {
        const validWords = dictionary.filter(e => e.faka_uvea.length > 3 && !e.faka_uvea.includes(' ') && e.meanings[0]?.french);
        if (validWords.length === 0) return;

        const newWord = validWords[Math.floor(Math.random() * validWords.length)];
        setCurrentWord(newWord);
        
        const wordLetters = newWord.faka_uvea.split('');
        let shuffled;
        do {
            shuffled = [...wordLetters].sort(() => 0.5 - Math.random()).join('');
        } while (shuffled === newWord.faka_uvea); // Ensure it's actually scrambled
        
        setScrambled(shuffled.toUpperCase());
        setUserInput('');
        setFeedback('');
    }, [dictionary]);

    useEffect(() => {
        if (dictionary.length > 0) {
            startNewGame();
        }
    }, [dictionary, startNewGame]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (userInput.toLowerCase() === currentWord.faka_uvea.toLowerCase()) {
            setFeedback('correct');
        } else {
            setFeedback('incorrect');
            setTimeout(() => setFeedback(''), 1500);
        }
    };
    
    if (!currentWord) return <p>Chargement du jeu...</p>;

    return (
        <div className="scrabble-game-container">
            <p className="scrabble-hint"><strong>Indice :</strong> {currentWord.meanings[0].french}</p>
            <div className="scrambled-letters">
                {scrambled.split('').map((letter, index) => <span key={index}>{letter}</span>)}
            </div>
            <form onSubmit={handleSubmit} className="scrabble-form">
                <input
                    type="text"
                    value={userInput}
                    onChange={(e) => setUserInput(e.target.value)}
                    className={`scrabble-input ${feedback}`}
                    placeholder="Écrivez le mot ici"
                    aria-label="Votre réponse"
                />
                <button type="submit" className="button-primary">Vérifier</button>
            </form>
            {feedback === 'correct' && (
                <div className="scrabble-feedback correct">
                    <p className="game-win-message">Félicitations !</p>
                    <button className="button-secondary" onClick={startNewGame}>Mot suivant</button>
                </div>
            )}
        </div>
    );
};


const WordSearchGame = () => {
    const { dictionary } = useAppContext();
    const GRID_SIZE = 12;
    const NUM_WORDS = 6;

    type GridCell = { char: string | null; wordRef: string | null };
    type Position = { r: number; c: number };

    const [grid, setGrid] = useState<GridCell[][]>([]);
    const [words, setWords] = useState<string[]>([]);
    const [foundWords, setFoundWords] = useState<string[]>([]);
    const [selection, setSelection] = useState<Position[]>([]);
    const isSelecting = useRef(false);

    const generateNewGame = useCallback(() => {
        const wordPool = dictionary.filter(w => w.faka_uvea.length <= GRID_SIZE && w.faka_uvea.length > 2 && !w.faka_uvea.includes(' '));
        if (wordPool.length < NUM_WORDS) {
            console.error("Not enough words in dictionary to start game.");
            return;
        }

        const shuffledWords = [...wordPool].sort(() => 0.5 - Math.random());
        const wordsToPlace = shuffledWords.slice(0, NUM_WORDS).map(w => w.faka_uvea.toUpperCase());
        
        const newGrid: GridCell[][] = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill({ char: null, wordRef: null }));
        const placedWords: string[] = [];
        
        const directions = [ { r: 0, c: 1 }, { r: 1, c: 0 }, { r: 1, c: 1 } ];

        for (const word of wordsToPlace) {
            let placed = false;
            for (let i = 0; i < 100 && !placed; i++) {
                const dir = directions[Math.floor(Math.random() * directions.length)];
                const startRow = Math.floor(Math.random() * GRID_SIZE);
                const startCol = Math.floor(Math.random() * GRID_SIZE);

                let canPlace = true;
                const cellsToPlace: { r: number; c: number; char: string }[] = [];
                for (let j = 0; j < word.length; j++) {
                    const r = startRow + j * dir.r;
                    const c = startCol + j * dir.c;
                    if (r >= GRID_SIZE || c >= GRID_SIZE || (newGrid[r][c].char && newGrid[r][c].char !== word[j])) {
                        canPlace = false;
                        break;
                    }
                    cellsToPlace.push({ r, c, char: word[j] });
                }

                if (canPlace) {
                    cellsToPlace.forEach(({ r, c, char }) => { newGrid[r][c] = { char, wordRef: word }; });
                    placedWords.push(word);
                    placed = true;
                }
            }
        }
        
        for (let r = 0; r < GRID_SIZE; r++) {
            for (let c = 0; c < GRID_SIZE; c++) {
                if (!newGrid[r][c].char) {
                    newGrid[r][c] = { char: ALPHABET[Math.floor(Math.random() * ALPHABET.length)], wordRef: null };
                }
            }
        }

        setGrid(newGrid);
        setWords(placedWords);
        setFoundWords([]);
        setSelection([]);
    }, [dictionary]);

    useEffect(() => {
        if (dictionary.length > 0) {
            generateNewGame();
        }
    }, [dictionary, generateNewGame]);

    const getSelectedWord = (currentSelection: Position[]) => {
        if (currentSelection.length < 2) return "";
        return currentSelection.map(pos => grid[pos.r][pos.c].char).join('');
    };

    const handleMouseDown = (r: number, c: number) => {
        isSelecting.current = true;
        setSelection([{ r, c }]);
    };
    
    const handleMouseEnter = (r: number, c: number) => {
        if (!isSelecting.current || selection.length === 0) return;
        const start = selection[0];
        const newSelection: Position[] = [];
        const dr = Math.sign(r - start.r);
        const dc = Math.sign(c - start.c);

        if (Math.abs(r - start.r) === Math.abs(c - start.c) || r === start.r || c === start.c) {
            let currR = start.r;
            let currC = start.c;
            while(true) {
                newSelection.push({ r: currR, c: currC });
                if (currR === r && currC === c) break;
                currR += dr;
                currC += dc;
            }
            setSelection(newSelection);
        }
    };
    
    const handleMouseUp = () => {
        isSelecting.current = false;
        const selectedWord = getSelectedWord(selection);
        const reversedSelectedWord = selectedWord.split('').reverse().join('');
        
        if (words.includes(selectedWord) && !foundWords.includes(selectedWord)) {
            setFoundWords(prev => [...prev, selectedWord]);
        } else if (words.includes(reversedSelectedWord) && !foundWords.includes(reversedSelectedWord)) {
            setFoundWords(prev => [...prev, reversedSelectedWord]);
        }
        setSelection([]);
    };
    
    const isCellInSelection = (r: number, c: number) => selection.some(pos => pos.r === r && pos.c === c);
    const isCellInFoundWord = (r: number, c: number) => {
        const cell = grid[r]?.[c];
        return cell && cell.wordRef && foundWords.includes(cell.wordRef);
    };

    const isWon = words.length > 0 && foundWords.length === words.length;

    return (
        <div className="word-search-container" onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
            <div className="word-search-sidebar">
                <h3>Mots à trouver</h3>
                <ul className="word-search-list">
                    {words.map(word => (
                        <li key={word} className={foundWords.includes(word) ? 'found' : ''}>
                            {word}
                        </li>
                    ))}
                </ul>
                <button className="button-secondary" onClick={generateNewGame}>
                    <RestartIcon/>
                    Nouvelle Partie
                </button>
                 {isWon && <p className="game-win-message">Félicitations !</p>}
            </div>
            <div className="word-search-grid">
                {grid.map((row, r) =>
                    row.map((cell, c) => (
                        <div
                            key={`${r}-${c}`}
                            className={`word-search-cell ${isCellInSelection(r, c) ? 'selected' : ''} ${isCellInFoundWord(r, c) ? 'found' : ''}`}
                            onMouseDown={() => handleMouseDown(r, c)}
                            onMouseEnter={() => handleMouseEnter(r, c)}
                        >
                            {cell.char}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

const HangmanGame = () => {
    const { dictionary } = useAppContext();
    const [word, setWord] = useState('');
    const [hint, setHint] = useState('');
    const [guessedLetters, setGuessedLetters] = useState(new Set<string>());
    const [wrongGuesses, setWrongGuesses] = useState(0);

    const normalize = (str: string) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();

    const startNewGame = useCallback(() => {
        const validWords = dictionary.filter(e => e.faka_uvea.length > 3 && !e.faka_uvea.includes(' '));
        if (validWords.length === 0) return;
        const newEntry = validWords[Math.floor(Math.random() * validWords.length)];
        setWord(normalize(newEntry.faka_uvea));
        setHint(newEntry.meanings[0].french);
        setGuessedLetters(new Set());
        setWrongGuesses(0);
    }, [dictionary]);
    
    useEffect(startNewGame, [startNewGame]);

    const handleGuess = (letter: string) => {
        const normalizedLetter = normalize(letter);
        if (guessedLetters.has(normalizedLetter) || isGameOver) return;
        
        setGuessedLetters(prev => new Set(prev).add(normalizedLetter));
        if (!word.includes(normalizedLetter)) {
            setWrongGuesses(prev => prev + 1);
        }
    };
    
    const displayWord = word.split('').map(letter => (
        guessedLetters.has(letter) || letter === '\'' ? letter : '_'
    )).join(' ');

    const isWon = word && word.split('').every(letter => guessedLetters.has(letter) || letter === '\'');
    const isLost = wrongGuesses >= 6;
    const isGameOver = isWon || isLost;

    const HangmanDrawing = ({ errors }: { errors: number }) => (
        <svg className="hangman-drawing" viewBox="0 0 100 120">
            <line x1="10" y1="115" x2="90" y2="115" stroke="currentColor" strokeWidth="4" />
            <line x1="30" y1="115" x2="30" y2="10" stroke="currentColor" strokeWidth="4" />
            <line x1="30" y1="10" x2="70" y2="10" stroke="currentColor" strokeWidth="4" />
            <line x1="70" y1="10" x2="70" y2="25" stroke="currentColor" strokeWidth="3" />
            {errors > 0 && <circle cx="70" cy="35" r="10" stroke="currentColor" strokeWidth="3" fill="none" />}
            {errors > 1 && <line x1="70" y1="45" x2="70" y2="80" stroke="currentColor" strokeWidth="3" />}
            {errors > 2 && <line x1="70" y1="55" x2="55" y2="70" stroke="currentColor" strokeWidth="3" />}
            {errors > 3 && <line x1="70" y1="55" x2="85" y2="70" stroke="currentColor" strokeWidth="3" />}
            {errors > 4 && <line x1="70" y1="80" x2="55" y2="100" stroke="currentColor" strokeWidth="3" />}
            {errors > 5 && <line x1="70" y1="80" x2="85" y2="100" stroke="currentColor" strokeWidth="3" />}
        </svg>
    );

    return (
        <div className="hangman-container">
            <div className="hangman-drawing-area">
                <HangmanDrawing errors={wrongGuesses} />
            </div>
            <div className="hangman-game-area">
                <p className="hangman-hint">Indice : {hint}</p>
                <p className="hangman-word">{displayWord}</p>
                {isGameOver ? (
                    <div className="hangman-game-over">
                        {isWon ? <p className="game-win-message">Félicitations, vous avez trouvé !</p> : <p className="game-lose-message">Dommage... Le mot était : {word}</p>}
                        <button className="button-primary" onClick={startNewGame}>Rejouer</button>
                    </div>
                ) : (
                    <div className="hangman-keyboard">
                        {ALPHABET.map(letter => (
                            <button 
                                key={letter}
                                onClick={() => handleGuess(letter)}
                                disabled={guessedLetters.has(normalize(letter))}
                            >
                                {letter}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};


const ExamsPage = () => {
    const { dictionary } = useAppContext();
    const { user } = useAuth();
    const [highScores, setHighScores] = useLocalStorage<Record<string, number>>('highScores', {});
    const [showDiploma, setShowDiploma] = useState<{score: number; level: ExamLevel} | null>(null);
    const [username, setUsername] = useState(user?.username || "");
    const [startExam, setStartExam] = useState(false);
    const [selectedLevel, setSelectedLevel] = useState<ExamLevel | null>(null);

    const handleStartExam = (level: ExamLevel) => {
        if(username.trim() === "") {
            alert("Veuillez entrer votre nom pour commencer l'examen.");
            return;
        }
        setSelectedLevel(level);
        setStartExam(true);
    };

    const handleExamFinish = (score: number, level: ExamLevel) => {
        const oldHighScore = highScores[level.name] || 0;
        if (score > oldHighScore) {
            setHighScores(prev => ({ ...prev, [level.name]: score }));
        }
        const passingScore = Math.floor(level.questionCount * (level.passingPercent / 100));
        if (score >= passingScore) {
            setShowDiploma({ score, level });
        } else {
             alert(`Examen terminé. Votre score est de ${score}/${level.questionCount}. Il faut ${passingScore} bonnes réponses pour réussir. Essayez encore !`);
        }
        setStartExam(false);
    };

    if (startExam) {
        return <Quiz level={selectedLevel} dictionary={dictionary} onFinish={handleExamFinish} />;
    }

    if (showDiploma) {
        return <Diploma data={showDiploma} username={username} onBack={() => { setShowDiploma(null); setSelectedLevel(null); }} />;
    }
    
    const isLevelUnlocked = (levelName: string) => {
        if(levelName === 'Bronze') return true;
        if(levelName === 'Argent') return (highScores['Bronze'] || 0) >= EXAM_LEVELS[0].questionCount * (EXAM_LEVELS[0].passingPercent/100);
        if(levelName === 'Or') return (highScores['Argent'] || 0) >= EXAM_LEVELS[1].questionCount * (EXAM_LEVELS[1].passingPercent/100);
        return false;
    }


    return (
        <div className="page-container exam-center-container">
            <header className="exam-center-header">
                 <TrophyIcon width={48} height={48} />
                <h1 className="page-title">Centre d'Examens</h1>
                <p>Choisissez votre niveau d'examen pour obtenir votre diplôme.</p>
                 <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Entrez votre nom pour le diplôme"
                    className="input-field"
                    readOnly={!!user?.username}
                />
            </header>
            <div className="exam-selection-grid">
                {EXAM_LEVELS.map(level => {
                    const unlocked = isLevelUnlocked(level.name);
                    return (
                        <div key={level.name} className="exam-card" style={{'--level-color': level.color} as React.CSSProperties}>
                            <div className="exam-card-icon">
                               <TrophyIcon width={32} height={32} />
                            </div>
                            <h3>Diplôme {level.name}</h3>
                            <p>{level.questionCount} questions</p>
                            <span className="exam-details">Score min: {level.passingPercent}% | Durée: {level.duration} min</span>
                             <span className="exam-highscore">Meilleur score: {highScores[level.name] || 0}/{level.questionCount}</span>
                            <button
                                className="button-primary"
                                onClick={() => handleStartExam(level)}
                                disabled={!unlocked || username.trim() === ""}
                            >
                                Commencer
                            </button>
                            {!unlocked && <p className="unlock-info">Réussissez le niveau précédent pour débloquer.</p>}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

type QuizQuestion = {
    question: string;
    options: string[];
    answer: string;
};

const Quiz = ({ level, dictionary, onFinish }: { level: ExamLevel, dictionary: DictionaryEntry[], onFinish: (score: number, level: ExamLevel) => void}) => {
    const [questions, setQuestions] = useState<QuizQuestion[]>([]);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [score, setScore] = useState(0);
    const [timeLeft, setTimeLeft] = useState(level.duration * 60);
    const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
    const [isAnswered, setIsAnswered] = useState(false);

    useEffect(() => {
        const generatedQuestions: QuizQuestion[] = [];
        const wordPool = [...dictionary].sort(() => 0.5 - Math.random());

        for (let i = 0; i < level.questionCount; i++) {
            const questionWord = wordPool[i];
            const correctAnswer = questionWord.meanings[0].french;
            
            let incorrectOptions = wordPool
                .filter(w => w.faka_uvea !== questionWord.faka_uvea)
                .slice(0, 3)
                .map(w => w.meanings[0].french);
                
            const options = [correctAnswer, ...incorrectOptions].sort(() => 0.5 - Math.random());

            generatedQuestions.push({
                question: questionWord.faka_uvea,
                options: options,
                answer: correctAnswer
            });
        }
        setQuestions(generatedQuestions);
    }, [level, dictionary]);

    useEffect(() => {
        if (timeLeft <= 0) {
            onFinish(score, level);
            return;
        }
        const timer = setInterval(() => {
            setTimeLeft(prev => prev - 1);
        }, 1000);
        return () => clearInterval(timer);
    }, [timeLeft, onFinish, score, level]);

    const handleAnswer = (option: string) => {
        if (isAnswered) return;
        setIsAnswered(true);
        setSelectedAnswer(option);
        
        let currentScore = score;
        if (option === questions[currentQuestionIndex].answer) {
            currentScore = score + 1;
            setScore(currentScore);
        }

        setTimeout(() => {
            if (currentQuestionIndex < questions.length - 1) {
                setCurrentQuestionIndex(prev => prev + 1);
                setIsAnswered(false);
                setSelectedAnswer(null);
            } else {
                onFinish(currentScore, level);
            }
        }, 1500);
    };

    if (questions.length === 0) return <p>Génération du quiz...</p>;

    const currentQuestion = questions[currentQuestionIndex];
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;

    return (
        <div className="quiz-container">
            <div className="quiz-header">
                <h3>{level.name} - Question {currentQuestionIndex + 1}/{questions.length}</h3>
                <div className="quiz-timer">{String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}</div>
            </div>
            <p className="quiz-question">Que signifie le mot <strong>"{currentQuestion.question}"</strong> ?</p>
            <div className="quiz-options">
                {currentQuestion.options.map((option, index) => (
                    <button
                        key={index}
                        onClick={() => handleAnswer(option)}
                        disabled={isAnswered}
                        className={`quiz-option ${isAnswered && (option === currentQuestion.answer ? 'correct' : (option === selectedAnswer ? 'incorrect' : ''))}`}
                    >
                        {option}
                    </button>
                ))}
            </div>
            <div className="quiz-progress">Score: {score}</div>
        </div>
    );
};

const Diploma = ({ data, username, onBack }: { data: { score: number, level: ExamLevel }, username: string, onBack: () => void }) => {
    const { level, score } = data;

    const printDiploma = () => {
        window.print();
    };

    return (
        <div className="page-container diploma-wrapper">
             <div className="diploma-container" style={{'--diploma-color': level.color} as React.CSSProperties}>
                <header className="diploma-header">
                    <h2>Diplôme de Faka'uvea</h2>
                    <p>Niveau {level.name}</p>
                </header>
                <div className="diploma-body">
                    <p>Ce diplôme est fièrement décerné à</p>
                    <h3 className="recipient-name">{username}</h3>
                    <p>
                        pour avoir réussi l'examen de niveau {level.name} avec un score de {score}/{level.questionCount}
                        <br/>
                        le {new Date().toLocaleDateString('fr-FR')}.
                    </p>
                </div>
                <footer className="diploma-footer">
                    <div>Signature de l'Académie</div>
                    <div>Fait à Mata-Utu</div>
                </footer>
            </div>
            <div className="diploma-actions">
                <button className="button-secondary" onClick={onBack}>Retour aux examens</button>
                <button className="button-primary" onClick={printDiploma}>Imprimer le diplôme</button>
            </div>
        </div>
    );
};


const GestionPage = () => {
    const { dictionary, setDictionary, resetDictionary } = useAppContext();
    const { addToast } = useToast();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingEntry, setEditingEntry] = useState<DictionaryEntry | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const importFileRef = useRef<HTMLInputElement>(null);

    const filteredDictionary = useMemo(() => {
        if (!searchTerm) return dictionary;
        const lowerSearch = searchTerm.toLowerCase();
        return dictionary.filter(entry =>
            entry.faka_uvea.toLowerCase().includes(lowerSearch) ||
            entry.meanings.some(m => m.french.toLowerCase().includes(lowerSearch))
        );
    }, [searchTerm, dictionary]);

    const handleAdd = () => {
        setEditingEntry(null);
        setIsModalOpen(true);
    };

    const handleEdit = (entry: DictionaryEntry) => {
        setEditingEntry(entry);
        setIsModalOpen(true);
    };

    const handleDelete = (faka_uvea: string) => {
        if (window.confirm(`Êtes-vous sûr de vouloir supprimer le mot "${faka_uvea}" ?`)) {
            setDictionary(prev => prev.filter(entry => entry.faka_uvea !== faka_uvea));
            addToast(`"${faka_uvea}" a été supprimé.`, 'info');
        }
    };

    const handleSaveWord = (wordToSave: DictionaryEntry) => {
        setDictionary(prev => {
            const isEditing = prev.some(e => e.faka_uvea === wordToSave.faka_uvea);
            let newDict;
            if (isEditing) {
                newDict = prev.map(e => e.faka_uvea === wordToSave.faka_uvea ? wordToSave : e);
            } else {
                newDict = [...prev, wordToSave];
            }
            return newDict.sort((a, b) => a.faka_uvea.localeCompare(b.faka_uvea));
        });
        addToast(`"${wordToSave.faka_uvea}" a été sauvegardé.`, 'success');
        setIsModalOpen(false);
    };

    const handleExport = () => {
        const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
            JSON.stringify(dictionary, null, 2)
        )}`;
        const link = document.createElement("a");
        link.href = jsonString;
        link.download = "dictionnaire_faka-uvea.json";
        link.click();
        addToast('Dictionnaire exporté !', 'success');
    };

    const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const text = e.target?.result;
                const data = JSON.parse(text as string);
                // Simple validation
                if (Array.isArray(data) && data.every(item => 'faka_uvea' in item && 'meanings' in item)) {
                    setDictionary(data);
                    addToast('Dictionnaire importé avec succès !', 'success');
                } else {
                    addToast("Le fichier JSON n'est pas un dictionnaire valide.", 'error');
                }
            } catch (error) {
                addToast("Erreur lors de la lecture du fichier.", 'error');
                console.error("Import error:", error);
            }
        };
        reader.readAsText(file);
    };

    return (
        <div className="page-container">
            <div className="gestion-header">
                <h1 className="page-title">Gestion du dictionnaire</h1>
                 <div className="gestion-actions">
                    <input type="file" ref={importFileRef} onChange={handleImport} accept=".json" style={{ display: 'none' }} />
                    <button className="button-secondary" onClick={() => importFileRef.current?.click()} title="Importer des données depuis un fichier JSON"><UploadIcon /> Importer</button>
                    <button className="button-secondary" onClick={handleExport} title="Exporter les données actuelles vers un fichier JSON"><DownloadIcon /> Exporter</button>
                    <button className="button-secondary" onClick={resetDictionary} title="Restaurer les données d'origine">
                        <RestartIcon/> Réinitialiser
                    </button>
                    <button className="button-primary" onClick={handleAdd}>Ajouter un mot</button>
                </div>
                <div className="gestion-search">
                    <input
                        type="search"
                        className="search-bar"
                        placeholder="Rechercher un mot à gérer..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>
            
            <div className="gestion-warning">
                <strong>Information :</strong> Les modifications sont sauvegardées localement dans votre navigateur. Utilisez les boutons "Importer/Exporter" pour les sauvegarder durablement.
            </div>

            <div className="gestion-table">
                <div className="gestion-row header">
                    <div className="gestion-cell">Faka'uvea</div>
                    <div className="gestion-cell">Français (sens principal)</div>
                    <div className="gestion-cell actions">Actions</div>
                </div>
                {filteredDictionary.map(entry => (
                    <div key={entry.faka_uvea} className="gestion-row">
                        <div className="gestion-cell">{entry.faka_uvea}</div>
                        <div className="gestion-cell">{entry.meanings[0]?.french || 'N/A'}</div>
                        <div className="gestion-cell actions">
                            <button className="action-button edit" onClick={() => handleEdit(entry)}>Éditer</button>
                            <button className="action-button delete" onClick={() => handleDelete(entry.faka_uvea)}>Suppr.</button>
                        </div>
                    </div>
                ))}
            </div>

            {isModalOpen && (
                <GestionModal
                    entryToEdit={editingEntry}
                    onClose={() => setIsModalOpen(false)}
                    onSave={handleSaveWord}
                />
            )}
        </div>
    );
};

const GestionModal = ({ entryToEdit, onClose, onSave }: { entryToEdit: DictionaryEntry | null, onClose: () => void, onSave: (entry: DictionaryEntry) => void }) => {
    const [entry, setEntry] = useState<DictionaryEntry>(
        entryToEdit ? JSON.parse(JSON.stringify(entryToEdit)) : { faka_uvea: '', meanings: [{ french: '', type: '', examples: [] }] }
    );
    const isEditing = !!entryToEdit;
    
    const handleMainChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setEntry(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const handleMeaningChange = (e: React.ChangeEvent<HTMLInputElement>, meaningIndex: number, field: 'french' | 'type') => {
        const { value } = e.target;
        setEntry(prev => {
            const newMeanings = [...prev.meanings];
            newMeanings[meaningIndex] = {...newMeanings[meaningIndex], [field]: value};
            return { ...prev, meanings: newMeanings };
        });
    };

    const addMeaning = () => {
        setEntry(prev => ({
            ...prev,
            meanings: [...prev.meanings, { french: '', type: '', examples: [] }]
        }));
    };
    
    const removeMeaning = (index: number) => {
        if (entry.meanings.length <= 1) return; // Keep at least one
        setEntry(prev => ({
            ...prev,
            meanings: prev.meanings.filter((_, i) => i !== index)
        }));
    };

    const handleExampleChange = (e: React.ChangeEvent<HTMLInputElement>, meaningIndex: number, exampleIndex: number, field: 'faka_uvea' | 'french') => {
        const { value } = e.target;
        setEntry(prev => {
            const newMeanings = [...prev.meanings];
            const newExamples = [...newMeanings[meaningIndex].examples];
            newExamples[exampleIndex] = { ...newExamples[exampleIndex], [field]: value };
            newMeanings[meaningIndex] = { ...newMeanings[meaningIndex], examples: newExamples };
            return { ...prev, meanings: newMeanings };
        });
    };

    const addExample = (meaningIndex: number) => {
        setEntry(prev => {
            const newMeanings = JSON.parse(JSON.stringify(prev.meanings));
            if (!newMeanings[meaningIndex].examples) {
                newMeanings[meaningIndex].examples = [];
            }
            newMeanings[meaningIndex].examples.push({ faka_uvea: '', french: '' });
            return { ...prev, meanings: newMeanings };
        });
    };

    const removeExample = (meaningIndex: number, exampleIndex: number) => {
        setEntry(prev => {
            const newMeanings = JSON.parse(JSON.stringify(prev.meanings));
            newMeanings[meaningIndex].examples.splice(exampleIndex, 1);
            return { ...prev, meanings: newMeanings };
        });
    };


    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(entry);
    };

    return (
        <div className="modal-overlay">
            <div className="modal-content">
                <header className="modal-header">
                    <h2>{isEditing ? 'Éditer le mot' : 'Ajouter un mot'}</h2>
                    <button onClick={onClose} className="close-button"><CloseIcon /></button>
                </header>
                <form onSubmit={handleSubmit} className="modal-form">
                    <div className="form-group">
                        <label htmlFor="faka_uvea">Mot en Faka'uvea</label>
                        <input type="text" id="faka_uvea" name="faka_uvea" value={entry.faka_uvea} onChange={handleMainChange} required disabled={isEditing} />
                    </div>
                     <div className="form-group">
                        <label htmlFor="phonetic">Phonétique</label>
                        <input type="text" id="phonetic" name="phonetic" value={entry.phonetic || ''} onChange={handleMainChange} />
                    </div>
                     <div className="form-group">
                        <label htmlFor="image_url">URL de l'image</label>
                        <input type="text" id="image_url" name="image_url" value={entry.image_url || ''} onChange={handleMainChange} />
                    </div>
                     <div className="form-group">
                        <label htmlFor="audio_url">URL de l'audio</label>
                        <input type="text" id="audio_url" name="audio_url" value={entry.audio_url || ''} onChange={handleMainChange} />
                    </div>

                    <div className="meanings-section">
                        <h4>Significations</h4>
                        {entry.meanings.map((meaning, index) => (
                             <div key={index} className="meaning-form-block">
                                {entry.meanings.length > 1 && <button type="button" className="remove-meaning-btn" onClick={() => removeMeaning(index)} title="Supprimer cette signification">×</button>}
                                <div className="form-group">
                                    <label htmlFor={`french-${index}`}>Traduction Française</label>
                                    <input type="text" id={`french-${index}`} value={meaning.french} onChange={(e) => handleMeaningChange(e, index, 'french')} required />
                                </div>
                                 <div className="form-group">
                                    <label htmlFor={`type-${index}`}>Type (n.c., v., etc.)</label>
                                    <input type="text" id={`type-${index}`} value={meaning.type} onChange={(e) => handleMeaningChange(e, index, 'type')} />
                                </div>
                                <div className="examples-section">
                                    <label>Exemples</label>
                                    {(meaning.examples || []).map((example, exIndex) => (
                                        <div key={exIndex} className="example-form-block">
                                            <input 
                                                type="text" 
                                                placeholder="Exemple en Faka'uvea" 
                                                value={example.faka_uvea} 
                                                onChange={(e) => handleExampleChange(e, index, exIndex, 'faka_uvea')} 
                                            />
                                            <input 
                                                type="text" 
                                                placeholder="Traduction en Français" 
                                                value={example.french} 
                                                onChange={(e) => handleExampleChange(e, index, exIndex, 'french')} 
                                            />
                                            <button type="button" className="remove-example-btn" onClick={() => removeExample(index, exIndex)} title="Supprimer cet exemple">×</button>
                                        </div>
                                    ))}
                                    <button type="button" className="add-example-btn" onClick={() => addExample(index)}>+ Ajouter un exemple</button>
                                </div>
                             </div>
                        ))}
                        <button type="button" className="add-meaning-btn" onClick={addMeaning}>+ Ajouter une signification</button>
                    </div>

                    <footer className="modal-footer">
                        <button type="button" className="button-secondary" onClick={onClose}>Annuler</button>
                        <button type="submit" className="button-primary">Sauvegarder</button>
                    </footer>
                </form>
            </div>
        </div>
    );
};


const LoginPage = ({ onNavClick }: { onNavClick: (page: string) => void; }) => {
    const { login } = useAuth();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const success = login(username, password);
        if (!success) {
            setError('Nom d\'utilisateur ou mot de passe incorrect.');
        }
    };

    return (
        <div className="login-page-layout">
            <form onSubmit={handleSubmit} className="login-form">
                <h1 className="header-title">Faka'uvea</h1>
                <h2 className="login-title">Connexion</h2>
                <p className="login-subtitle">Accès à l'espace membre et admin.</p>
                {error && <p className="login-error">{error}</p>}
                <div className="form-group">
                    <input
                        type="text"
                        className="login-input"
                        placeholder="Nom d'utilisateur (admin/user)"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        required
                    />
                </div>
                <div className="form-group">
                    <input
                        type="password"
                        className="login-input"
                        placeholder="Mot de passe (admin/user)"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                    />
                </div>
                <button type="submit" className="login-button">
                    <LockIcon />
                    Se connecter
                </button>
            </form>
        </div>
    );
};

const UserManagementPage = () => {
    const { user: currentUser } = useAuth();
    const { users, addUser, updateUser, deleteUser, resetUsers, setUsers } = useAuth();
    const { addToast } = useToast();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const importFileRef = useRef<HTMLInputElement>(null);

    const handleAdd = () => {
        setEditingUser(null);
        setIsModalOpen(true);
    };

    const handleEdit = (user: User) => {
        setEditingUser(user);
        setIsModalOpen(true);
    };

    const handleDelete = (userId: string) => {
        if (userId === currentUser.id) {
            alert("Vous ne pouvez pas supprimer votre propre compte.");
            return;
        }
        if (users.length <= 1) {
            alert("Vous ne pouvez pas supprimer le dernier utilisateur.");
            return;
        }
        if (window.confirm(`Êtes-vous sûr de vouloir supprimer cet utilisateur ?`)) {
            deleteUser(userId);
            addToast("Utilisateur supprimé.", "info");
        }
    };
    
    const handleSave = (userToSave: User) => {
        if (editingUser) {
            updateUser(userToSave);
            addToast(`Utilisateur "${userToSave.username}" mis à jour.`, 'success');
        } else {
            addUser(userToSave);
            addToast(`Utilisateur "${userToSave.username}" ajouté.`, 'success');
        }
        setIsModalOpen(false);
    };

    const handleExport = () => {
        // Exclude passwords from export
        const usersToExport = users.map(({password, ...rest}) => rest);
        const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
            JSON.stringify(usersToExport, null, 2)
        )}`;
        const link = document.createElement("a");
        link.href = jsonString;
        link.download = "utilisateurs_faka-uvea.json";
        link.click();
        addToast('Liste des utilisateurs exportée !', 'success');
    };

    const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const text = e.target?.result;
                const data = JSON.parse(text as string);
                if (Array.isArray(data) && data.every(item => 'id' in item && 'username' in item && 'role' in item)) {
                    setUsers(data);
                    addToast('Utilisateurs importés avec succès !', 'success');
                } else {
                    addToast("Fichier JSON invalide.", 'error');
                }
            } catch (error) {
                addToast("Erreur lors de la lecture du fichier.", 'error');
            }
        };
        reader.readAsText(file);
    };


    return (
        <div className="page-container">
             <div className="gestion-header">
                <h1 className="page-title">Gestion des Utilisateurs</h1>
                <div className="gestion-actions">
                    <input type="file" ref={importFileRef} onChange={handleImport} accept=".json" style={{ display: 'none' }} />
                    <button className="button-secondary" onClick={() => importFileRef.current?.click()} title="Importer des utilisateurs"><UploadIcon /> Importer</button>
                    <button className="button-secondary" onClick={handleExport} title="Exporter les utilisateurs"><DownloadIcon /> Exporter</button>
                    <button className="button-secondary" onClick={resetUsers} title="Restaurer les utilisateurs par défaut">
                        <RestartIcon/> Réinitialiser
                    </button>
                    <button className="button-primary" onClick={handleAdd}>Ajouter un utilisateur</button>
                </div>
            </div>
             <div className="gestion-warning">
                <strong>Information :</strong> Les modifications sont sauvegardées localement dans votre navigateur. Les mots de passe ne sont pas inclus dans l'export.
            </div>
            <div className="gestion-table">
                <div className="gestion-row header">
                    <div className="gestion-cell">Nom d'utilisateur</div>
                    <div className="gestion-cell">Rôle</div>
                    <div className="gestion-cell actions">Actions</div>
                </div>
                {users.map(user => (
                    <div key={user.id} className="gestion-row">
                        <div className="gestion-cell">{user.username}</div>
                        <div className="gestion-cell">{user.role}</div>
                        <div className="gestion-cell actions">
                            <button className="action-button edit" onClick={() => handleEdit(user)}>Éditer</button>
                            <button className="action-button delete" onClick={() => handleDelete(user.id)}>Suppr.</button>
                        </div>
                    </div>
                ))}
            </div>
            {isModalOpen && (
                <UserModal
                    userToEdit={editingUser}
                    onClose={() => setIsModalOpen(false)}
                    onSave={handleSave}
                />
            )}
        </div>
    )
}

const UserModal = ({ userToEdit, onClose, onSave }: { userToEdit: User | null, onClose: () => void, onSave: (user: User) => void }) => {
    const [user, setUser] = useState<Omit<User, 'id'> & { id?: string }>(
        userToEdit || { username: '', role: 'user', password: '' }
    );
    const isEditing = !!userToEdit;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setUser(prev => ({ ...prev, [name]: value }));
    };
    
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(user as User);
    };

    return (
        <div className="modal-overlay">
            <div className="modal-content">
                <header className="modal-header">
                    <h2>{isEditing ? 'Éditer l\'utilisateur' : 'Ajouter un utilisateur'}</h2>
                    <button onClick={onClose} className="close-button"><CloseIcon /></button>
                </header>
                 <form onSubmit={handleSubmit} className="modal-form">
                    <div className="form-group">
                        <label htmlFor="username">Nom d'utilisateur</label>
                        <input type="text" id="username" name="username" value={user.username} onChange={handleChange} required />
                    </div>
                     <div className="form-group">
                        <label htmlFor="password">Mot de passe</label>
                        <input type="password" id="password" name="password" placeholder={isEditing ? 'Laisser vide pour ne pas changer' : ''} onChange={handleChange} required={!isEditing} />
                    </div>
                     <div className="form-group">
                        <label htmlFor="role">Rôle</label>
                        <select id="role" name="role" value={user.role} onChange={handleChange} required>
                            <option value="user">Utilisateur</option>
                            <option value="admin">Administrateur</option>
                        </select>
                    </div>
                     <footer className="modal-footer">
                        <button type="button" className="button-secondary" onClick={onClose}>Annuler</button>
                        <button type="submit" className="button-primary">Sauvegarder</button>
                    </footer>
                </form>
            </div>
        </div>
    )
}

const AccessDeniedPage = ({ onNavClick }: { onNavClick: (page: string) => void }) => {
    return (
        <div className="page-container access-denied-container">
            <LockIcon />
            <h1 className="page-title">Accès Refusé</h1>
            <p>Vous n'avez pas les permissions nécessaires pour accéder à cette page.</p>
            <button className="button-primary" onClick={() => onNavClick('home')}>
                Retour à l'accueil
            </button>
        </div>
    );
};


// --- APP STRUCTURE ---
const AuthenticatedApp = () => {
    const { user } = useAuth();
    const [currentPage, setCurrentPage] = useState('home');

    const handlePageNavigation = (pageId: string) => {
        setCurrentPage(pageId);
        window.scrollTo(0, 0);
    };

    const renderPage = () => {
        switch (currentPage) {
            case 'home': return <HomePage onNavClick={handlePageNavigation} />;
            case 'dictionary': return <DictionaryPage />;
            case 'guide': return <GuidePage />;
            case 'favorites': return <FavoritesPage />;
            case 'history': return <HistoryPage />;
            case 'ai_tutor': return <AITutorPage />;
            case 'faka-uvea': return <FakaUveaInfoPage />;
            case 'games': return <GamesPage />;
            case 'exams': return <ExamsPage />;
            case 'gestion':
                return user?.role === 'admin' ? <GestionPage /> : <AccessDeniedPage onNavClick={handlePageNavigation} />;
            case 'user_management':
                return user?.role === 'admin' ? <UserManagementPage /> : <AccessDeniedPage onNavClick={handlePageNavigation} />;
            default: return <HomePage onNavClick={handlePageNavigation} />;
        }
    };

    return (
        <div className="app-layout">
            <Header currentPage={currentPage} onNavClick={handlePageNavigation} />
            <main>
                {renderPage()}
            </main>
            <Footer onNavClick={handlePageNavigation}/>
        </div>
    );
};

const App = () => {
    const { user } = useAuth();
    return user ? <AuthenticatedApp /> : <LoginPage onNavClick={() => {}} />;
};

const Root = () => (
    <ToastProvider>
        <AuthProvider>
            <AppProvider>
                <App />
            </AppProvider>
        </AuthProvider>
    </ToastProvider>
);

ReactDOM.createRoot(document.getElementById('root')!).render(<Root />);