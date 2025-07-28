
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

type ThemePreference = 'light' | 'dark' | 'papyrus' | 'system';

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

type Message = {
    role: 'user' | 'ai';
    text: string;
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
  chat: Chat | null;
  messages: Message[];
  isTutorLoading: boolean;
  sendMessageToTutor: (message: string) => Promise<void>;
  initializeChat: () => void;
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
const DictionaryIcon = ({width=20, height=20}: {width?: number; height?: number}) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width={width} height={height}><path fillRule="evenodd" d="M14.25 2.25a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0V3a.75.75 0 0 1 .75-.75Zm2.06 1.06a.75.75 0 0 1 0 1.06l-11.25 11.25a.75.75 0 0 1-1.06-1.06L15.25 3.31a.75.75 0 0 1 1.06 0Zm-3.593-1.06a.75.75 0 0 1 1.06 0l3.75 3.75a.75.75 0 0 1-1.06 1.06L12.75 4.372V20.25a.75.75 0 0 1-1.5 0V4.372L7.94 7.682a.75.75 0 0 1-1.06-1.06l3.75-3.75a.75.75 0 0 1 1.06 0ZM21.75 9a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1 0-1.5h1.5a.75.75 0 0 1 .75.75Z" clipRule="evenodd" /></svg>;
const GuideIcon = ({width=20, height=20}: {width?: number; height?: number}) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width={width} height={height}><path fillRule="evenodd" d="M3 6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6Zm4.5 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm1.5 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm1.5 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm1.5 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" clipRule="evenodd" /></svg>;
const BrainIcon = ({width=20, height=20}: {width?: number; height?: number}) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width={width} height={height}><path d="M15.75 2.25a.75.75 0 0 0-1.5 0v.605a13.44 13.44 0 0 0-2.312-.22h-.076a13.44 13.44 0 0 0-2.312.22V2.25a.75.75 0 0 0-1.5 0v.605a13.425 13.425 0 0 0-4.013 1.599.75.75 0 0 0 .866 1.21c1.114-.795 2.351-1.26 3.647-1.452v2.138a.75.75 0 0 0 1.5 0V6.17a12.153 12.153 0 0 1 4.5 0v.373a.75.75 0 0 0 1.5 0V6.17c1.296.192 2.533.657 3.647 1.453a.75.75 0 0 0 .866-1.21 13.425 13.425 0 0 0-4.013-1.6V2.25Z" /><path fillRule="evenodd" d="M4.5 9.75A.75.75 0 0 1 5.25 9h13.5a.75.75 0 0 1 .75.75v8.25a3 3 0 0 1-3 3H7.5a3 3 0 0 1-3-3V9.75ZM6 11.25a.75.75 0 0 1 .75-.75h10.5a.75.75 0 0 1 0 1.5H6.75a.75.75 0 0 1-.75-.75Zm.75 2.25a.75.75 0 0 0 0 1.5h10.5a.75.75 0 0 0 0-1.5H6.75Z" clipRule="evenodd" /></svg>;
const GameIcon = ({width=20, height=20}: {width?: number; height?: number}) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width={width} height={height}><path d="M10.5 1.5H8.25A2.25 2.25 0 0 0 6 3.75v16.5a2.25 2.25 0 0 0 2.25 2.25h7.5A2.25 2.25 0 0 0 18 20.25V3.75a2.25 2.25 0 0 0-2.25-2.25H13.5v1.5h2.25a.75.75 0 0 1 .75.75v16.5a.75.75 0 0 1-.75.75h-7.5a.75.75 0 0 1-.75-.75V3.75a.75.75 0 0 1 .75-.75H10.5v-1.5Z" /><path d="M12 4.5a.75.75 0 0 1 .75.75v3a.75.75 0 0 1-1.5 0V5.25A.75.75 0 0 1 12 4.5Z" /><path fillRule="evenodd" d="M8.25 12a.75.75 0 0 1 .75-.75h6a.75.75 0 0 1 0 1.5h-6a.75.75 0 0 1-.75-.75ZM9 15.75a.75.75 0 0 0 0-1.5h6a.75.75 0 0 0 0 1.5H9Z" clipRule="evenodd" /></svg>;
const TrophyIcon = ({width=20, height=20}: {width?: number; height?: number}) => (<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width={width} height={height}><path d="M15.5 13H14v-2h1.5a2.5 2.5 0 0 0 2.5-2.5A2.5 2.5 0 0 0 15.5 6H14V4h1.5a2.5 2.5 0 1 0 0-5h-9a2.5 2.5 0 1 0 0 5H10V6H8.5A2.5 2.5 0 0 0 6 8.5a2.5 2.5 0 0 0 2.5 2.5H10v2H8.5a4.5 4.5 0 0 0-4.475 4.266l.005.234H4a1 1 0 0 0 0 2h1.03l.161.965a2 2 0 0 0 1.96 1.535h9.698a2 2 0 0 0 1.96-1.535L18.97 19H20a1 1 0 0 0 0-2h-.03a4.5 4.5 0 0 0-4.47-4.266L15.5 13H15.5Z" /></svg>);
const InfoIcon = ({width=20, height=20}: {width?: number; height?: number}) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width={width} height={height}><path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm8.706-1.442c1.146-.573 2.437.463 2.126 1.706l-.709 2.836.042-.02a.75.75 0 0 1 .67 1.34l-.04.022c-1.147.573-2.438-.463-2.127-1.706l.71-2.836-.042.02a.75.75 0 1 1-.671-1.34l.041-.022ZM12 9a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z" clipRule="evenodd" /></svg>;
const CogIcon = ({width=20, height=20}: {width?: number; height?: number}) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width={width} height={height}><path fillRule="evenodd" d="M12.965 2.54a1.875 1.875 0 0 1 1.768 1.483l.08.339c.214.862.935 1.458 1.832 1.558l.41.044a1.875 1.875 0 0 1 1.815 2.164l-.1.4a1.875 1.875 0 0 1-1.33 1.516l-.374.135a1.875 1.875 0 0 0-1.298 1.298l-.135.374a1.875 1.875 0 0 1-1.516 1.33l-.4.1a1.875 1.875 0 0 1-2.164-1.815l-.044-.41a1.875 1.875 0 0 0-1.558-1.832l-.339-.08a1.875 1.875 0 0 1-1.483-1.768l-.002-1.027a1.875 1.875 0 0 1 1.483-1.768l.339-.08c.897-.1 1.618-.696 1.832-1.558l.08-.339a1.875 1.875 0 0 1 1.768-1.483h.001ZM12 15.375a3.375 3.375 0 1 0 0-6.75 3.375 3.375 0 0 0 0 6.75Z" clipRule="evenodd" /></svg>;
const UsersIcon = ({width=20, height=20}: {width?: number; height?: number}) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width={width} height={height}><path d="M10.375 2.25a4.125 4.125 0 1 0 0 8.25 4.125 4.125 0 0 0 0-8.25ZM10.375 8.625a2.25 2.25 0 1 1 0-4.5 2.25 2.25 0 0 1 0 4.5Z" /><path d="M18.813 9.395a.75.75 0 0 1 .437.695v.001c0 .414-.336.75-.75.75h-1.5a.75.75 0 0 1 0-1.5h.345a2.622 2.622 0 0 0-1.63-2.344 4.131 4.131 0 0 0-2.392-1.066.75.75 0 0 1-.363-1.454 5.63 5.63 0 0 1 3.262 1.468 4.123 4.123 0 0 1 2.091 3.445Z" /><path d="M11.625 15.375a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5a.75.75 0 0 1 .75-.75Z" /><path fillRule="evenodd" d="M6.343 12.22a.75.75 0 0 1 .638.863 3.373 3.373 0 0 0 2.23 3.037.75.75 0 1 1-.44 1.424 4.873 4.873 0 0 1-3.212-4.382.75.75 0 0 1 .863-.638ZM14.407 12.22a.75.75 0 0 1 .863.638 4.873 4.873 0 0 1-3.212 4.382.75.75 0 1 1-.44-1.424 3.373 3.373 0 0 0 2.23-3.037.75.75 0 0 1 .638-.863Z" clipRule="evenodd" /></svg>;
const SpeakerIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M14.604 3.012a.749.749 0 0 0-.965.033L8.62 7.25H5.375A2.375 2.375 0 0 0 3 9.625v4.75A2.375 2.375 0 0 0 5.375 16.75H8.62l5.019 4.205a.75.75 0 0 0 .965.033.752.752 0 0 0 .396-.688V3.7a.752.752 0 0 0-.396-.688Z" /><path d="M17.125 7.75a.75.75 0 0 0 0 1.5c.828 0 1.5.672 1.5 1.5s-.672 1.5-1.5 1.5a.75.75 0 0 0 0 1.5c1.657 0 3-1.343 3-3s-1.343-3-3-3Zm0 4.5a.75.75 0 0 0 0 1.5c2.485 0 4.5-2.015 4.5-4.5s-2.015-4.5-4.5-4.5a.75.75 0 0 0 0 1.5c1.657 0 3 1.343 3 3s-1.343 3-3 3Z" /></svg>);
const PlayIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path fillRule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.647c1.295.742 1.295 2.545 0 3.286L7.279 20.99c-1.25.717-2.779-.217-2.779-1.643V5.653Z" clipRule="evenodd" /></svg>);
const MenuIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 0 24 24" width="24px" fill="currentColor"><path d="M0 0h24v24H0z" fill="none"/><path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/></svg>);
const CloseIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 0 24 24" width="24px" fill="currentColor"><path d="M0 0h24v24H0z" fill="none"/><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>);
const MoreIcon = () => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path fillRule="evenodd" d="M4.5 12a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0Zm6 0a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0Zm6 0a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0Z" clipRule="evenodd" /></svg>;
const RestartIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 0 24 24" width="24px" fill="currentColor"><path d="M0 0h24v24H0z" fill="none"/><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/></svg>);
const SearchIcon = ({width=20, height=20}: {width?: number; height?: number}) => (<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width={width} height={height}><path fillRule="evenodd" d="M10.5 3.75a6.75 6.75 0 1 0 0 13.5 6.75 6.75 0 0 0 0-13.5ZM2.25 10.5a8.25 8.25 0 1 1 14.59 5.28l4.69 4.69a.75.75 0 1 1-1.06 1.06l-4.69-4.69A8.25 8.25 0 0 1 2.25 10.5Z" clipRule="evenodd" /></svg>);
const StarIcon = ({width=20, height=20}: {width?: number; height?: number}) => (<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width={width} height={height}><path fillRule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.006 5.404.434c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.434 2.082-5.005Z" clipRule="evenodd" /></svg>);
const HistoryIcon = ({width=20, height=20}: {width?: number; height?: number}) => (<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width={width} height={height}><path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25Zm-1.72 6.97a.75.75 0 1 0-1.06 1.06L10.94 12l-1.72 1.72a.75.75 0 1 0 1.06 1.06L12 13.06l1.72 1.72a.75.75 0 1 0 1.06-1.06L13.06 12l1.72-1.72a.75.75 0 1 0-1.06-1.06L12 10.94l-1.72-1.72Z" clipRule="evenodd" /></svg>);
const LockIcon = ({width=20, height=20}: {width?: number; height?: number}) => (<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width={width} height={height}><path fillRule="evenodd" d="M12 1.5a5.25 5.25 0 0 0-5.25 5.25v3a3 3 0 0 0-3 3v6.75a3 3 0 0 0 3 3h10.5a3 3 0 0 0 3-3v-6.75a3 3 0 0 0-3-3v-3c0-2.9-2.35-5.25-5.25-5.25Zm3.75 8.25v-3a3.75 3.75 0 1 0-7.5 0v3h7.5Z" clipRule="evenodd" /></svg>);
const UserCircleIcon = ({width=20, height=20}: {width?: number; height?: number}) => (<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width={width} height={height}><path fillRule="evenodd" d="M18.685 19.097A9.723 9.723 0 0 0 21.75 12c0-5.385-4.365-9.75-9.75-9.75S2.25 6.615 2.25 12a9.723 9.723 0 0 0 3.065 7.097A9.716 9.716 0 0 0 12 21.75a9.716 9.716 0 0 0 6.685-2.653Zm-12.54-1.285A7.486 7.486 0 0 1 12 15a7.486 7.486 0 0 1 5.855 2.812A8.224 8.224 0 0 1 12 20.25a8.224 8.224 0 0 1-5.855-2.438ZM15.75 9a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" clipRule="evenodd" /></svg>);
const AiIcon = ({width=20, height=20}: {width?: number; height?: number}) => (<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width={width} height={height}><path d="M9.75 6.335a.75.75 0 0 1 .53-1.28l4.5-1.75a.75.75 0 0 1 .94 1.498l-4.5 1.75a.75.75 0 0 1-.97-.218Z" /><path d="M8.25 8.627a.75.75 0 0 0-1.218-.868l-4.5 4.5a.75.75 0 0 0 1.06 1.061l4.5-4.5a.75.75 0 0 0-.342-1.193Z" /><path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25Zm-.094 4.504a.75.75 0 0 1 1.073.132l4.5 6a.75.75 0 0 1-1.201.904l-4.5-6a.75.75 0 0 1 .128-1.036ZM8.94 15.126a.75.75 0 0 1 1.29-.75l3 5.25a.75.75 0 0 1-1.29.75l-3-5.25Z" clipRule="evenodd" /></svg>);
const ArrowPathIcon = ({width=20, height=20}: {width?: number; height?: number}) => (<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width={width} height={height}><path fillRule="evenodd" d="M4.755 10.059a7.5 7.5 0 0 1 12.548-3.364l1.903 1.903h-3.182a.75.75 0 0 0 0 1.5h4.5a.75.75 0 0 0 .75-.75v-4.5a.75.75 0 0 0-1.5 0v3.182l-1.903-1.903a9 9 0 0 0-15.057 4.042a.75.75 0 0 0 1.482.324Z" clipRule="evenodd" /><path fillRule="evenodd" d="M19.245 13.941a7.5 7.5 0 0 1-12.548 3.364l-1.903-1.903h3.182a.75.75 0 0 0 0-1.5h-4.5a.75.75 0 0 0-.75.75v4.5a.75.75 0 0 0 1.5 0v-3.182l1.903 1.903a9 9 0 0 0 15.057-4.042a.75.75 0 0 0-1.482-.324Z" clipRule="evenodd" /></svg>);
const SendIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" /></svg>);
const SunIcon = ({width=20, height=20}: {width?: number; height?: number}) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width={width} height={height}><path d="M12 2.25a.75.75 0 0 1 .75.75v2.25a.75.75 0 0 1-1.5 0V3a.75.75 0 0 1 .75-.75ZM7.5 12a4.5 4.5 0 1 1 9 0 4.5 4.5 0 0 1-9 0Zm12.44 2.062a.75.75 0 0 0-1.06-1.062l-1.591 1.591a.75.75 0 1 0 1.06 1.062l1.591-1.591ZM12 19.5a.75.75 0 0 1 .75.75v2.25a.75.75 0 0 1-1.5 0v-2.25a.75.75 0 0 1 .75-.75ZM4.062 13.062a.75.75 0 0 0-1.06-1.062l-1.591 1.591a.75.75 0 1 0 1.06 1.062l1.591-1.591ZM21.75 12a.75.75 0 0 1-.75.75h-2.25a.75.75 0 0 1 0-1.5h2.25a.75.75 0 0 1 .75.75ZM4.062 5.938a.75.75 0 0 0 1.06-1.062L3.53 3.344a.75.75 0 0 0-1.06 1.062L3.53 5.938Z" /><path fillRule="evenodd" d="M12 5.25a.75.75 0 0 1 .75-.75h2.25a.75.75 0 0 1 0 1.5H12.75a.75.75 0 0 1-.75-.75Zm-4.5 0a.75.75 0 0 1 .75-.75h2.25a.75.75 0 0 1 0 1.5H8.25a.75.75 0 0 1-.75-.75Z" clipRule="evenodd" /></svg>;
const MoonIcon = ({width=20, height=20}: {width?: number; height?: number}) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width={width} height={height}><path fillRule="evenodd" d="M9.528 1.718a.75.75 0 0 1 .162.819A8.97 8.97 0 0 0 9 6a9 9 0 0 0 9 9 8.97 8.97 0 0 0 3.463-.69a.75.75 0 0 1 .981.981A10.503 10.503 0 0 1 12 21a10.5 10.5 0 0 1-10.5-10.5c0-4.368 2.667-8.112 6.46-9.672a.75.75 0 0 1 .818.162Z" clipRule="evenodd" /></svg>;
const BookIcon = ({width=20, height=20}: {width?: number; height?: number}) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width={width} height={height}><path fillRule="evenodd" d="M12 1.5a5.25 5.25 0 0 0-5.25 5.25v3a3 3 0 0 0-3 3v6.75a3 3 0 0 0 3 3h10.5a3 3 0 0 0 3-3v-6.75a3 3 0 0 0-3-3v-3c0-2.9-2.35-5.25-5.25-5.25Zm3.75 8.25v-3a3.75 3.75 0 1 0-7.5 0v3h7.5Z" clipRule="evenodd" /></svg>;
const ComputerDesktopIcon = ({width=20, height=20}: {width?: number; height?: number}) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width={width} height={height}><path d="M19.5 6h-15a3 3 0 0 0-3 3v6a3 3 0 0 0 3 3h15a3 3 0 0 0 3-3V9a3 3 0 0 0-3-3Zm-16.5 9a1.5 1.5 0 0 1-1.5-1.5v-6A1.5 1.5 0 0 1 4.5 6h15A1.5 1.5 0 0 1 21 7.5v6A1.5 1.5 0 0 1 19.5 15h-15Z" /><path d="M9 19.5h6a.75.75 0 0 1 .75.75v.001a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v-.001a.75.75 0 0 1 .75-.75Z" /></svg>;
const BookOpenIcon = ({width=20, height=20}: {width?: number; height?: number}) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width={width} height={height}><path fillRule="evenodd" d="M2.25 2.25a.75.75 0 0 0-.75.75v18a.75.75 0 0 0 .75.75h19.5a.75.75 0 0 0 .75-.75V3a.75.75 0 0 0-.75-.75H2.25ZM9.75 18H3V9.75h6.75V18ZM11.25 9H21V3H11.25v6ZM21 10.5H11.25V18H21v-7.5Z" clipRule="evenodd" /></svg>;
const ClipboardIcon = ({width=20, height=20}: {width?: number; height?: number}) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width={width} height={height}><path d="M11.25 3.375A2.625 2.625 0 0 1 13.875 6h.25a2.625 2.625 0 0 1 2.625 2.625v.25a2.625 2.625 0 0 1-2.625 2.625h-3.25a.75.75 0 0 0-.75.75v7.5a.75.75 0 0 1-1.5 0v-7.5a.75.75 0 0 0-.75-.75h-3.25A2.625 2.625 0 0 1 3.375 9v-.25A2.625 2.625 0 0 1 6 6h.25A2.625 2.625 0 0 1 8.875 3.375h2.375Z" /><path fillRule="evenodd" d="M12 1.5a1.5 1.5 0 0 0-1.5 1.5v1.625a1.125 1.125 0 0 0-1.125-1.125h-.25A4.125 4.125 0 0 0 5 6.375v15.25A2.375 2.375 0 0 0 7.375 24h9.25A2.375 2.375 0 0 0 19 21.625V6.375A4.125 4.125 0 0 0 14.125 3h-.25a1.125 1.125 0 0 0-1.125 1.125V3A1.5 1.5 0 0 0 12 1.5Zm-1.5 7.5a.75.75 0 0 1 .75-.75h.001a.75.75 0 1 1 0 1.5H11.25a.75.75 0 0 1-.75-.75Z" clipRule="evenodd" /></svg>;
const PlusIcon = () => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"><path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" /></svg>;
const TrashIcon = () => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"><path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.58.22-2.365.468a.75.75 0 1 0 .468 1.457A1.25 1.25 0 0 1 5.75 6.5v8.5a.75.75 0 0 0 .75.75h7a.75.75 0 0 0 .75-.75v-8.5a.75.75 0 0 0-.75-.75h-.5a.75.75 0 0 0-.75.75v8.5a.75.75 0 0 1-.75-.75h-4a.75.75 0 0 1-.75-.75v-8.5a.75.75 0 0 0-.75-.75h-.5a.75.75 0 0 0-.75.75v8.5a.75.75 0 0 1-.75-.75H14.25a.75.75 0 0 0 .75-.75v-8.5a1.25 1.25 0 0 1 1.635-1.187a.75.75 0 1 0 .468-1.457c-.784-.247-1.57-.391-2.365-.468v-.443A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4Z" clipRule="evenodd" /></svg>;
const ArrowDownOnSquareIcon = ({width=20, height=20}: {width?: number; height?: number}) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width={width} height={height}><path fillRule="evenodd" d="M12 2.25a.75.75 0 0 1 .75.75v11.69l3.22-3.22a.75.75 0 1 1 1.06 1.06l-4.5 4.5a.75.75 0 0 1-1.06 0l-4.5-4.5a.75.75 0 1 1 1.06-1.06l3.22 3.22V3a.75.75 0 0 1 .75-.75Zm-9 13.5a.75.75 0 0 1 .75.75v3a.75.75 0 0 0 .75.75h13.5a.75.75 0 0 0 .75-.75v-3a.75.75 0 0 1 1.5 0v3A2.25 2.25 0 0 1 18.75 21H5.25A2.25 2.25 0 0 1 3 18.75v-3a.75.75 0 0 1 .75-.75Z" clipRule="evenodd" /></svg>;
const ArrowUpOnSquareIcon = ({width=20, height=20}: {width?: number; height?: number}) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width={width} height={height}><path fillRule="evenodd" d="M9.353 2.647a.75.75 0 0 1 1.06 0l4.5 4.5a.75.75 0 0 1-1.06 1.06L12 6.31V15a.75.75 0 0 1-1.5 0V6.31L8.53 8.207a.75.75 0 0 1-1.06-1.06l1.883-1.883Z" clipRule="evenodd" /><path d="M4.5 18a.75.75 0 0 1 .75.75v.008c0 .414.336.75.75.75h12a.75.75 0 0 0 .75-.75V18.75a.75.75 0 0 1 1.5 0v.008A2.25 2.25 0 0 1 18 21H6A2.25 2.25 0 0 1 3.75 18.75V18a.75.75 0 0 1 .75-.75Z" /></svg>;


// --- CONTEXTS ---
const AppContext = createContext<AppContextType | null>(null);
const useApp = () => {
    const context = useContext(AppContext);
    if (!context) throw new Error("useApp must be used within an AppProvider");
    return context;
};

const AuthContext = createContext<AuthContextType | null>(null);
const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error("useAuth must be used within an AuthProvider");
    return context;
};

const ToastContext = createContext<ToastContextType | null>(null);
const useToasts = () => {
    const context = useContext(ToastContext);
    if (!context) throw new Error('useToasts must be used within a ToastProvider');
    return context;
}

// --- PROVIDERS ---
const ToastProvider = ({ children }: { children: React.ReactNode }) => {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const addToast = useCallback((message: string, type: Toast['type'] = 'info') => {
        const id = Date.now();
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => {
            setToasts(prev => prev.filter(toast => toast.id !== id));
        }, 5000);
    }, []);

    const removeToast = (id: number) => {
        setToasts(prev => prev.filter(toast => toast.id !== id));
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

const AuthProvider = ({ children }: { children: React.ReactNode }) => {
    const [users, setUsers] = useLocalStorage<User[]>('fkv2_users', USERS_DATA);
    const [user, setUser] = useSessionStorage<User | null>('fkv2_user', null);
    const { addToast } = useToasts();

    const login = useCallback((username, password) => {
        const foundUser = users.find(u => u.username === username && u.password === password);
        if (foundUser) {
            setUser(foundUser);
            addToast(`Bienvenue, ${foundUser.username}!`, 'success');
            return true;
        }
        addToast('Nom d\'utilisateur ou mot de passe incorrect.', 'error');
        return false;
    }, [users, addToast, setUser]);

    const logout = useCallback(() => {
        setUser(null);
        addToast('Vous avez été déconnecté.', 'info');
    }, [addToast, setUser]);

    const addUser = useCallback((newUser: User) => {
        setUsers(prev => [...prev, { ...newUser, id: Date.now().toString() }]);
        addToast('Utilisateur ajouté avec succès.', 'success');
    }, [addToast, setUsers]);

    const updateUser = useCallback((updatedUser: User) => {
        setUsers(prev => prev.map(u => u.id === updatedUser.id ? updatedUser : u));
        addToast('Utilisateur mis à jour.', 'success');
    }, [addToast, setUsers]);

    const deleteUser = useCallback((userId: string) => {
        if (user?.id === userId) {
            addToast('Vous ne pouvez pas supprimer votre propre compte.', 'error');
            return;
        }
        setUsers(prev => prev.filter(u => u.id !== userId));
        addToast('Utilisateur supprimé.', 'success');
    }, [user, addToast, setUsers]);

    const resetUsers = useCallback(() => {
        setUsers(USERS_DATA);
        addToast('La liste des utilisateurs a été réinitialisée.', 'info');
    }, [addToast, setUsers]);

    const value = useMemo(() => ({ user, users, login, logout, setUsers, addUser, updateUser, deleteUser, resetUsers }), 
        [user, users, login, logout, setUsers, addUser, updateUser, deleteUser, resetUsers]
    );

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

const AppProvider = ({ children }: { children: React.ReactNode }) => {
    const { user } = useAuth();
    const [themePreference, setThemePreference] = useLocalStorage<ThemePreference>('fkv2_theme', 'system');
    const [favorites, setFavorites] = useLocalStorage<string[]>('fkv2_favorites', []);
    const [history, setHistory] = useLocalStorage<string[]>('fkv2_history', []);
    const [dictionary, setDictionary] = useLocalStorage<DictionaryEntry[]>('fkv2_dictionary', DICTIONARY_DATA);
    
    const [chat, setChat] = useState<Chat | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [isTutorLoading, setIsTutorLoading] = useState(false);

    useEffect(() => {
        const applyTheme = () => {
            let theme: 'light' | 'dark' | 'papyrus' = 'light';
            if (themePreference === 'system') {
                theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
            } else {
                 theme = themePreference;
            }
            document.documentElement.setAttribute('data-theme', theme);
        };

        applyTheme();

        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        mediaQuery.addEventListener('change', applyTheme);
        return () => mediaQuery.removeEventListener('change', applyTheme);
    }, [themePreference]);

    const speak = useCallback((textOrEntry: string | DictionaryEntry) => {
        const textToSpeak = typeof textOrEntry === 'string' ? textOrEntry : textOrEntry.faka_uvea;
        if ('speechSynthesis' in window) {
            const utterance = new SpeechSynthesisUtterance(textToSpeak);
            utterance.lang = 'fr-FR'; // Fallback, no specific voice for Faka'uvea
            speechSynthesis.speak(utterance);
        }
    }, []);

    const toggleFavorite = useCallback((faka_uvea: string) => {
        setFavorites(prev =>
            prev.includes(faka_uvea)
                ? prev.filter(fav => fav !== faka_uvea)
                : [...prev, faka_uvea]
        );
    }, [setFavorites]);

    const logHistory = useCallback((faka_uvea: string) => {
        setHistory(prev => [faka_uvea, ...prev.filter(item => item !== faka_uvea)].slice(0, 50));
    }, [setHistory]);

    const resetDictionary = useCallback(() => {
        setDictionary(DICTIONARY_DATA);
    }, [setDictionary]);

    const initializeChat = useCallback(() => {
        if (!chat && user) {
            const newChat = ai.chats.create({
                model: 'gemini-2.5-flash',
                config: {
                    systemInstruction: "Tu es un tuteur expert de la langue Faka'uvea (wallisien). Tu es amical, encourageant et patient. Tes réponses doivent être claires, concises et adaptées à un apprenant. Tu peux donner des exemples, expliquer des points de grammaire, ou traduire des phrases. Tu dois toujours répondre en français, sauf si on te demande explicitement d'écrire en faka'uvea. N'hésite pas à utiliser des emojis pour rendre l'apprentissage plus amusant. 😊",
                },
            });
            setChat(newChat);
            setMessages([{role: 'ai', text: `Mālō te ma'uli, ${user.username} ! 👋 Je suis ton tuteur personnel. Comment puis-je t'aider à apprendre le faka'uvea aujourd'hui ?`}]);
        }
    }, [chat, user]);

    const sendMessageToTutor = useCallback(async (message: string) => {
        if (!chat || isTutorLoading) return;

        const userMessage: Message = { role: 'user', text: message };
        setMessages(prev => [...prev, userMessage]);
        setIsTutorLoading(true);

        try {
            const response = await chat.sendMessage({ message: userMessage.text });
            const aiMessage: Message = { role: 'ai', text: response.text };
            setMessages(prev => [...prev, aiMessage]);
        } catch (error) {
            console.error("AI Tutor Error:", error);
            setMessages(prev => [...prev, { role: 'ai', text: "Désolé, une erreur s'est produite. Veuillez réessayer." }]);
        } finally {
            setIsTutorLoading(false);
        }
    }, [chat, isTutorLoading]);


    const value = useMemo(() => ({
        themePreference, setThemePreference,
        speak,
        favorites, toggleFavorite,
        history, logHistory, setHistory,
        dictionary, setDictionary, resetDictionary,
        chat, messages, isTutorLoading, sendMessageToTutor, initializeChat
    }), [themePreference, favorites, history, dictionary, chat, messages, isTutorLoading, setThemePreference, speak, toggleFavorite, logHistory, setHistory, setDictionary, resetDictionary, sendMessageToTutor, initializeChat]);

    return (
        <AppContext.Provider value={value}>
            {children}
        </AppContext.Provider>
    );
};

// --- CORE COMPONENTS ---
const Header = ({ onNavigate, currentPage }) => {
    const { themePreference, setThemePreference } = useApp();
    const { user, logout } = useAuth();
    const [isThemeDropdownOpen, setIsThemeDropdownOpen] = useState(false);
    const themeDropdownRef = useRef(null);
    const navRef = useRef<HTMLDivElement>(null);
    const [indicatorStyle, setIndicatorStyle] = useState({});
    
    const handleNavigation = (page: string) => {
        onNavigate(page);
    };

    const navItems = useMemo(() => [
        { id: 'home', label: 'Accueil', icon: HomeIcon },
        { id: 'dictionary', label: 'Dictionnaire', icon: DictionaryIcon },
        { id: 'guide', label: 'Guide', icon: GuideIcon },
        { id: 'games', label: 'Jeux', icon: GameIcon },
        { id: 'tutor', label: 'Tuteur IA', icon: BrainIcon },
        { id: 'exams', label: 'EXAMS', icon: TrophyIcon },
        { id: 'favorites', label: 'Favoris', icon: StarIcon },
        { id: 'history', label: 'Historique', icon: HistoryIcon },
        { id: 'info', label: 'À propos', icon: InfoIcon },
        { id: 'gestion', label: 'Gestion', icon: CogIcon, adminOnly: true },
    ].filter(item => !item.adminOnly || user?.role === 'admin'), [user]);

    useLayoutEffect(() => {
        const activeLink = navRef.current?.querySelector(`[aria-current="page"]`) as HTMLElement;
        if (activeLink) {
            setIndicatorStyle({
                width: activeLink.offsetWidth,
                transform: `translateX(${activeLink.offsetLeft}px)`,
                opacity: 1
            });
        } else {
            setIndicatorStyle({ opacity: 0 });
        }
    }, [currentPage, navItems]);

    const handleThemeChange = (theme: ThemePreference) => {
        setThemePreference(theme);
        setIsThemeDropdownOpen(false);
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (themeDropdownRef.current && !(themeDropdownRef.current as any).contains(event.target)) {
                setIsThemeDropdownOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const renderNavLink = (item) => (
        <a
            key={item.id}
            href="#"
            className="nav-link"
            aria-current={currentPage === item.id ? 'page' : undefined}
            onClick={(e) => { e.preventDefault(); handleNavigation(item.id); }}
        >
            <item.icon /> {item.label}
        </a>
    );

    const ThemeSwitcher = () => (
        <div className="theme-selector-wrapper" ref={themeDropdownRef}>
            <button className="theme-switcher-button" onClick={() => setIsThemeDropdownOpen(!isThemeDropdownOpen)} aria-label="Changer de thème">
                 {themePreference === 'light' && <SunIcon />}
                 {themePreference === 'dark' && <MoonIcon />}
                 {themePreference === 'papyrus' && <BookOpenIcon />}
                 {themePreference === 'system' && <ComputerDesktopIcon />}
            </button>
            {isThemeDropdownOpen && (
                <div className="theme-dropdown">
                    <button onClick={() => handleThemeChange('light')}><SunIcon /> Clair</button>
                    <button onClick={() => handleThemeChange('dark')}><MoonIcon /> Sombre</button>
                    <button onClick={() => handleThemeChange('papyrus')}><BookOpenIcon /> Papyrus</button>
                    <button onClick={() => handleThemeChange('system')}><ComputerDesktopIcon /> Système</button>
                </div>
            )}
        </div>
    );

    return (
        <header className="app-header">
            <a href="#" className="header-title-link" onClick={(e) => { e.preventDefault(); handleNavigation('home'); }}>
                <h1 className="header-title">Faka'uvea</h1>
            </a>

            <div className="desktop-nav">
                <nav className="header-nav" ref={navRef}>
                    <div className="nav-indicator" style={indicatorStyle}></div>
                    {navItems.map(renderNavLink)}
                </nav>
            </div>
            
            <div className="header-right-panel">
                 {user ? (
                    <>
                        <span className="user-info">
                            {user.username} ({user.role})
                        </span>
                        <button onClick={logout} className="logout-button">Déconnexion</button>
                    </>
                ) : (
                    <button onClick={() => handleNavigation('login')} className="login-button">Connexion</button>
                )}
                <ThemeSwitcher />
            </div>
        </header>
    );
};


const Footer = ({ onNavigate }) => {
    const { user } = useAuth();
    return (
        <footer className="app-footer">
            <div className="footer-content">
                <div className="footer-column">
                    <h4>Faka'uvea V2</h4>
                    <p>Un dictionnaire collaboratif pour la préservation et la promotion de la langue wallisienne.</p>
                </div>
                <div className="footer-column">
                    <h4>Navigation</h4>
                    <ul className="footer-links">
                        <li><a href="#" onClick={e => {e.preventDefault(); onNavigate('home')}}>Accueil</a></li>
                        <li><a href="#" onClick={e => {e.preventDefault(); onNavigate('dictionary')}}>Dictionnaire</a></li>
                        <li><a href="#" onClick={e => {e.preventDefault(); onNavigate('guide')}}>Guide</a></li>
                        <li><a href="#" onClick={e => {e.preventDefault(); onNavigate('games')}}>Jeux</a></li>
                        <li><a href="#" onClick={e => {e.preventDefault(); onNavigate('tutor')}}>Tuteur IA</a></li>
                        <li><a href="#" onClick={e => {e.preventDefault(); onNavigate('exams')}}>EXAMS</a></li>
                        <li><a href="#" onClick={e => {e.preventDefault(); onNavigate('favorites')}}>Favoris</a></li>
                        <li><a href="#" onClick={e => {e.preventDefault(); onNavigate('history')}}>Historique</a></li>
                         {user?.role === 'admin' && (
                            <li><a href="#" onClick={e => {e.preventDefault(); onNavigate('gestion')}}>Gestion</a></li>
                        )}
                        <li><a href="#" onClick={e => {e.preventDefault(); onNavigate('info')}}>À propos</a></li>
                    </ul>
                </div>
                <div className="footer-column">
                    <h4>Contributions</h4>
                    <p>Ce projet est open-source. Les contributions sont les bienvenues pour enrichir le dictionnaire et les ressources.</p>
                </div>
            </div>
            <div className="footer-bottom">
                <p>&copy; {new Date().getFullYear()} Faka'uvea V2. Tous droits réservés.</p>
            </div>
        </footer>
    );
};

const WordCard = React.memo(({ entry, onSelect, isFavorite, onToggleFavorite, onSpeak, style }: {
    entry: DictionaryEntry;
    onSelect: (entry: DictionaryEntry) => void;
    isFavorite: boolean;
    onToggleFavorite: (faka_uvea: string) => void;
    onSpeak: (textOrEntry: string | DictionaryEntry) => void;
    style?: React.CSSProperties;
}) => {
    const handleSpeak = useCallback((e) => {
        e.stopPropagation();
        onSpeak(entry);
    }, [onSpeak, entry]);

    const handleFavorite = useCallback((e) => {
        e.stopPropagation();
        onToggleFavorite(entry.faka_uvea);
    }, [onToggleFavorite, entry]);


    const hasAudio = !!entry.audio_url && entry.audio_url.length > 50;

    return (
        <div className="word-card" style={style} onClick={() => onSelect(entry)} onKeyDown={(e) => e.key === 'Enter' && onSelect(entry)} tabIndex={0} role="button" aria-label={`Voir les détails pour ${entry.faka_uvea}`}>
            {entry.image_url && <img src={entry.image_url} alt={`Illustration pour ${entry.faka_uvea}`} className="word-card-image" loading="lazy" />}
            <div className="word-card-content">
                <div className="word-card-header">
                    <div>
                        <h3>{entry.faka_uvea}</h3>
                        {entry.phonetic && <span className="phonetic-details">{entry.phonetic}</span>}
                    </div>
                    <div className="word-card-actions">
                        <button onClick={handleSpeak} className={`tts-button ${hasAudio ? 'authentic-audio' : ''}`} aria-label={`Écouter ${entry.faka_uvea}`}>
                            <SpeakerIcon />
                        </button>
                        <button onClick={handleFavorite} className={`favorite-btn ${isFavorite ? 'active' : ''}`} aria-label={`Ajouter ${entry.faka_uvea} aux favoris`}>
                            <StarIcon />
                        </button>
                    </div>
                </div>
                {entry.meanings.slice(0, 1).map((meaning, index) => (
                    <div key={index} className="meaning-block">
                        <p className="word-details">{meaning.type}</p>
                        <p className="word-translation">{meaning.french}</p>
                        {meaning.examples && meaning.examples.length > 0 && (
                            <div className="word-example">
                                <p className="faka-uvea-example">{meaning.examples[0].faka_uvea}</p>
                                <p>{meaning.examples[0].french}</p>
                            </div>
                        )}
                    </div>
                ))}
                 {entry.meanings.length > 1 && (
                    <p className="more-meanings-indicator">...et {entry.meanings.length - 1} autre(s) sens</p>
                )}
            </div>
        </div>
    );
});

const Modal = ({ isOpen, onClose, children }) => {
    useEffect(() => {
        if (isOpen) {
            document.body.classList.add('no-scroll');
        } else {
            document.body.classList.remove('no-scroll');
        }
        return () => {
            document.body.classList.remove('no-scroll');
        };
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <button className="modal-close-btn" onClick={onClose} aria-label="Fermer la fenêtre">&times;</button>
                {children}
            </div>
        </div>
    );
};

const WordDetailModal = ({ entry, isOpen, onClose, onSpeak, isFavorite, onToggleFavorite }) => {
    if (!isOpen || !entry) return null;
    
    const hasAudio = !!entry.audio_url && entry.audio_url.length > 50;

    return (
        <Modal isOpen={isOpen} onClose={onClose}>
            <div className="word-detail-modal">
                {entry.image_url && <img src={entry.image_url} alt={`Illustration pour ${entry.faka_uvea}`} className="modal-word-image" />}
                <div className="modal-word-header">
                    <div>
                        <h2>{entry.faka_uvea}</h2>
                        {entry.phonetic && <span className="phonetic-details">{entry.phonetic}</span>}
                    </div>
                    <div className="modal-actions">
                         <button onClick={() => onSpeak(entry)} className={`tts-button ${hasAudio ? 'authentic-audio' : ''}`} aria-label={`Écouter ${entry.faka_uvea}`}>
                            <SpeakerIcon />
                        </button>
                        <button onClick={() => onToggleFavorite(entry.faka_uvea)} className={`favorite-btn ${isFavorite ? 'active' : ''}`} aria-label={`Ajouter ${entry.faka_uvea} aux favoris`}>
                            <StarIcon />
                        </button>
                    </div>
                </div>
                <div className="modal-meanings">
                    {entry.meanings.map((meaning, index) => (
                        <div key={index} className="meaning-block">
                             <p className="word-details"><span className="meaning-number">{index + 1}.</span> {meaning.type}</p>
                             <p className="word-translation">{meaning.french}</p>
                             {meaning.examples && meaning.examples.map((ex, i) => (
                                 <div key={i} className="word-example">
                                     <p className="faka-uvea-example">{ex.faka_uvea}</p>
                                     <p>{ex.french}</p>
                                 </div>
                             ))}
                        </div>
                    ))}
                </div>
            </div>
        </Modal>
    );
};


// --- PAGES ---
const HomePage = ({ onNavigate }) => {
    const { dictionary, speak, favorites, toggleFavorite } = useApp();
    const [selectedEntry, setSelectedEntry] = useState<DictionaryEntry | null>(null);
    const wordOfTheDay = useMemo(() => dictionary[new Date().getDate() % dictionary.length], [dictionary]);

    return (
        <div className="page-container">
            <div className="home-hero">
                <h1 className="hero-title">Bienvenue sur Faka'uvea V2</h1>
                <p className="hero-subtitle">Votre portail complet pour explorer, apprendre et préserver la langue et la culture de Wallis.</p>
            </div>

            <section className="home-section">
                <h2>Mot du Jour</h2>
                <div className="word-of-the-day">
                    <WordCard
                        entry={wordOfTheDay}
                        onSelect={setSelectedEntry}
                        isFavorite={favorites.includes(wordOfTheDay.faka_uvea)}
                        onToggleFavorite={toggleFavorite}
                        onSpeak={speak}
                    />
                </div>
            </section>

            <section className="home-section">
                <h2>Explorer</h2>
                <div className="features-grid">
                    <div className="feature-card" onClick={() => onNavigate('dictionary')} role="button">
                        <div className="feature-card-icon"><DictionaryIcon width={40} height={40} /></div>
                        <h4>Dictionnaire Complet</h4>
                        <p>Recherchez des milliers de mots, découvrez leurs significations, écoutez leur prononciation.</p>
                    </div>
                    <div className="feature-card" onClick={() => onNavigate('guide')} role="button">
                        <div className="feature-card-icon"><GuideIcon width={40} height={40} /></div>
                        <h4>Guide de Conversation</h4>
                        <p>Apprenez les phrases essentielles pour vos voyages ou conversations quotidiennes.</p>
                    </div>
                    <div className="feature-card" onClick={() => onNavigate('games')} role="button">
                        <div className="feature-card-icon"><GameIcon width={40} height={40} /></div>
                        <h4>Jeux Éducatifs</h4>
                        <p>Testez vos connaissances et enrichissez votre vocabulaire de manière ludique.</p>
                    </div>
                    <div className="feature-card" onClick={() => onNavigate('exams')} role="button">
                        <div className="feature-card-icon"><TrophyIcon width={40} height={40} /></div>
                        <h4>EXAMS</h4>
                        <p>Passez des examens pour valider votre niveau et obtenir des diplômes.</p>
                    </div>
                </div>
            </section>
            
            <WordDetailModal
                entry={selectedEntry}
                isOpen={!!selectedEntry}
                onClose={() => setSelectedEntry(null)}
                onSpeak={speak}
                isFavorite={selectedEntry ? favorites.includes(selectedEntry.faka_uvea) : false}
                onToggleFavorite={toggleFavorite}
            />
        </div>
    );
};

const DictionaryPage = ({ initialWord }) => {
    const { dictionary, speak, favorites, toggleFavorite, logHistory } = useApp();
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedLetter, setSelectedLetter] = useState('');
    const [selectedEntry, setSelectedEntry] = useState<DictionaryEntry | null>(null);
    
    const handleSelectEntry = useCallback((entry: DictionaryEntry) => {
        setSelectedEntry(entry);
        logHistory(entry.faka_uvea);
    }, [logHistory]);

    useEffect(() => {
        if (initialWord) {
            const entry = dictionary.find(e => e.faka_uvea === initialWord);
            if(entry) {
                handleSelectEntry(entry);
                setSearchTerm(initialWord);
            }
        }
    }, [initialWord, dictionary, handleSelectEntry]);


    const filteredDictionary = useMemo(() => {
        let results = dictionary;
        if (selectedLetter) {
            results = results.filter(entry => entry.faka_uvea.toLowerCase().startsWith(selectedLetter.toLowerCase()));
        }
        if (searchTerm) {
            const lowercasedTerm = searchTerm.toLowerCase();
            results = results.filter(entry =>
                entry.faka_uvea.toLowerCase().includes(lowercasedTerm) ||
                entry.meanings.some(m => m.french.toLowerCase().includes(lowercasedTerm))
            );
        }
        return results;
    }, [searchTerm, selectedLetter, dictionary]);
    
    const suggestedEntry = useMemo(() => {
        if (filteredDictionary.length === 0 && searchTerm.length > 2) {
            let minDistance = Infinity;
            let suggestion: DictionaryEntry | null = null;
            for (const entry of dictionary) {
                const distance = levenshteinDistance(searchTerm, entry.faka_uvea);
                if (distance < minDistance && distance <= 3) {
                    minDistance = distance;
                    suggestion = entry;
                }
            }
            return suggestion;
        }
        return null;
    }, [filteredDictionary, searchTerm, dictionary]);

    const handleLetterSelect = (letter: string) => {
        setSearchTerm('');
        setSelectedLetter(prev => prev === letter ? '' : letter);
    };
    
    const clearFilters = () => {
        setSearchTerm('');
        setSelectedLetter('');
    }

    return (
        <div className="page-container">
            <h1 className="page-title">Dictionnaire Faka'uvea</h1>
            <div className="dictionary-controls">
                <input
                    type="search"
                    className="search-bar"
                    placeholder="Rechercher un mot en faka'uvea ou en français..."
                    value={searchTerm}
                    onChange={e => { setSearchTerm(e.target.value); setSelectedLetter(''); }}
                />
                <nav className="alphabet-nav" aria-label="Filtrer par lettre">
                    {ALPHABET.map(letter => (
                        <button
                            key={letter}
                            onClick={() => handleLetterSelect(letter)}
                            className={selectedLetter === letter ? 'active' : ''}
                            aria-pressed={selectedLetter === letter}
                        >
                            {letter}
                        </button>
                    ))}
                    <button onClick={clearFilters} className="clear">Tout voir</button>
                </nav>
            </div>

            {filteredDictionary.length > 0 ? (
                <div className="word-grid" style={{ animationDelay: '200ms' }}>
                    {filteredDictionary.map((entry, index) => (
                        <WordCard
                            key={entry.faka_uvea}
                            entry={entry}
                            onSelect={handleSelectEntry}
                            isFavorite={favorites.includes(entry.faka_uvea)}
                            onToggleFavorite={toggleFavorite}
                            onSpeak={speak}
                            style={{ animationDelay: `${index * 50}ms` }}
                        />
                    ))}
                </div>
            ) : (
                 <div className="no-results">
                    <SearchIcon />
                    <p>Aucun résultat pour "{searchTerm || selectedLetter}"</p>
                    {suggestedEntry && (
                         <div className="suggestion-text">
                            Essayez avec : <a onClick={() => setSearchTerm(suggestedEntry!.faka_uvea)}>{suggestedEntry!.faka_uvea}</a> ?
                        </div>
                    )}
                    <div className="no-results-action">
                        <button className="button-secondary" onClick={clearFilters}>Voir tous les mots</button>
                    </div>
                </div>
            )}

            <WordDetailModal
                entry={selectedEntry}
                isOpen={!!selectedEntry}
                onClose={() => setSelectedEntry(null)}
                onSpeak={speak}
                isFavorite={selectedEntry ? favorites.includes(selectedEntry.faka_uvea) : false}
                onToggleFavorite={toggleFavorite}
            />
        </div>
    );
};

const GuidePage = () => {
    const { speak } = useApp();
    const [guideData] = useState(GUIDE_DATA);

    const playAllInCategory = (category: GuideCategory) => {
        category.phrases.forEach((phrase, index) => {
            setTimeout(() => {
                speak(phrase.faka_uvea);
            }, index * 2000);
        });
    };

    return (
        <div className="page-container">
            <h1 className="page-title">Guide de Conversation</h1>
            {guideData.map((category, index) => (
                <section key={index} className="guide-category">
                    <div className="guide-category-header">
                        <h3>{category.name}</h3>
                        <button className="play-all-btn" onClick={() => playAllInCategory(category)}>
                            <PlayIcon /> Écouter tout
                        </button>
                    </div>
                    <ul className="phrase-list">
                        {category.phrases.map((phrase, pIndex) => (
                            <li key={pIndex} className="phrase-item" style={{ animationDelay: `${pIndex * 50}ms` }}>
                                <div className="phrase-text">
                                    <p className="faka-uvea-phrase">{phrase.faka_uvea}</p>
                                    <p className="french-phrase">{phrase.french}</p>
                                </div>
                                <div className="phrase-actions">
                                    <button className="tts-button" onClick={() => speak(phrase.faka_uvea)}>
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

const FavoritesPage = ({ onNavigate }) => {
    const { dictionary, favorites, toggleFavorite, speak } = useApp();
    const [selectedEntry, setSelectedEntry] = useState<DictionaryEntry | null>(null);

    const favoriteEntries = useMemo(() => {
        return dictionary.filter(entry => favorites.includes(entry.faka_uvea));
    }, [dictionary, favorites]);
    
    const handleSelectEntry = useCallback((entry: DictionaryEntry) => {
        setSelectedEntry(entry);
    }, []);

    if (favoriteEntries.length === 0) {
        return (
            <div className="page-container">
                <h1 className="page-title">Mes Favoris</h1>
                <div className="no-results">
                    <StarIcon width={60} height={60} />
                    <p>Vous n'avez pas encore de mots favoris.</p>
                    <div className="no-results-action">
                        <button className="button-primary" onClick={() => onNavigate('dictionary')}>Explorer le dictionnaire</button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="page-container">
            <h1 className="page-title">Mes Favoris</h1>
            <div className="word-grid">
                {favoriteEntries.map((entry, index) => (
                    <WordCard
                        key={entry.faka_uvea}
                        entry={entry}
                        onSelect={handleSelectEntry}
                        isFavorite={true}
                        onToggleFavorite={toggleFavorite}
                        onSpeak={speak}
                        style={{ animationDelay: `${index * 50}ms` }}
                    />
                ))}
            </div>
             <WordDetailModal
                entry={selectedEntry}
                isOpen={!!selectedEntry}
                onClose={() => setSelectedEntry(null)}
                onSpeak={speak}
                isFavorite={selectedEntry ? favorites.includes(selectedEntry.faka_uvea) : false}
                onToggleFavorite={toggleFavorite}
            />
        </div>
    );
};

const HistoryPage = ({ onNavigate }) => {
    const { dictionary, history, setHistory, toggleFavorite, speak, favorites } = useApp();
    const [selectedEntry, setSelectedEntry] = useState<DictionaryEntry | null>(null);

    const historyEntries = useMemo(() => {
        return history
            .map(faka_uvea => dictionary.find(entry => entry.faka_uvea === faka_uvea))
            .filter(Boolean); // Filter out any potential undefined if a word was removed from dictionary
    }, [dictionary, history]);

    const handleClearHistory = () => {
        if (window.confirm("Êtes-vous sûr de vouloir effacer votre historique ?")) {
            setHistory([]);
        }
    };
    
    const handleSelectEntry = useCallback((entry: DictionaryEntry) => {
        setSelectedEntry(entry);
    }, []);

    if (historyEntries.length === 0) {
        return (
            <div className="page-container">
                <h1 className="page-title">Historique de Consultation</h1>
                <div className="no-results">
                    <HistoryIcon width={60} height={60} />
                    <p>Votre historique est vide.</p>
                     <div className="no-results-action">
                        <button className="button-primary" onClick={() => onNavigate('dictionary')}>Commencer à explorer</button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="page-container">
            <div className="page-header-with-action">
                <h1 className="page-title">Historique de Consultation</h1>
                <button className="button-secondary" onClick={handleClearHistory}>
                    <TrashIcon /> Effacer l'historique
                </button>
            </div>
            <div className="word-grid">
                {historyEntries.map((entry, index) => (
                    <WordCard
                        key={`${entry.faka_uvea}-${index}`} // Add index to key in case of duplicates in history
                        entry={entry}
                        onSelect={handleSelectEntry}
                        isFavorite={favorites.includes(entry.faka_uvea)}
                        onToggleFavorite={toggleFavorite}
                        onSpeak={speak}
                        style={{ animationDelay: `${index * 50}ms` }}
                    />
                ))}
            </div>
             <WordDetailModal
                entry={selectedEntry}
                isOpen={!!selectedEntry}
                onClose={() => setSelectedEntry(null)}
                onSpeak={speak}
                isFavorite={selectedEntry ? favorites.includes(selectedEntry.faka_uvea) : false}
                onToggleFavorite={toggleFavorite}
            />
        </div>
    );
};

const FakaUveaInfoPage = () => {
    return (
        <div className="page-container faka-uvea-info-page">
            <h1 className="page-title">À propos du Faka'uvea</h1>
            <section className="info-section">
                <h2>L'Alphabet</h2>
                <p>L'alphabet wallisien est plus court que l'alphabet français. Il est composé de 16 lettres.</p>
                <div className="alphabet-list">
                    {ALPHABET.map(letter => (
                        <div key={letter} className="alphabet-letter">{letter}</div>
                    ))}
                </div>
            </section>
            <section className="info-section">
                <h2>Prononciation</h2>
                <dl className="pronunciation-guide">
                    <dt>Les voyelles</dt>
                    <dd>A, E, I, O, U se prononcent comme en espagnol ou en italien. Elles sont brèves.</dd>
                    <dt>Les consonnes</dt>
                    <dd>F, H, K, L, M, N, S, T, V se prononcent globalement comme en français.</dd>
                    <dt>Le 'G'</dt>
                    <dd>Se prononce 'ng', comme dans le mot anglais "singing".</dd>
                    <dt>Le coup de glotte ' </dt>
                    <dd>Représenté par une apostrophe ('), il marque une brève interruption du son, un peu comme le "uh-oh" en anglais.</dd>
                </dl>
            </section>
        </div>
    );
};

const GamesPage = () => {
    const [activeTab, setActiveTab] = useState('memory');

    const gameTabs = [
        { id: 'memory', name: 'Memory', component: <MemoryGame /> },
        { id: 'flashcards', name: 'Flashcards', component: <FlashcardsGame /> },
        { id: 'scrabble', name: 'Mots Mêlés', component: <ScrabbleGame /> },
        { id: 'wordsearch', name: 'Mots Cachés', component: <WordSearchGame /> },
        { id: 'hangman', name: 'Le Pendu', component: <HangmanGame /> },
        { id: 'translation-quiz', name: 'Traduction Rapide', component: <TranslationQuizGame /> },
        { id: 'petit-bac', name: 'Petit Bac', component: <PetitBacGame /> },
    ];

    return (
        <div className="page-container">
            <h1 className="page-title">Jeux Éducatifs</h1>
            <div className="game-tabs">
                {gameTabs.map(tab => (
                     <button
                        key={tab.id}
                        className={activeTab === tab.id ? 'active' : ''}
                        onClick={() => setActiveTab(tab.id)}
                    >
                        {tab.name}
                    </button>
                ))}
            </div>
            <div className="game-content">
                {gameTabs.find(tab => tab.id === activeTab)?.component}
            </div>
        </div>
    );
}

const MemoryGame = () => {
    const { dictionary } = useApp();
    const [cards, setCards] = useState([]);
    const [flipped, setFlipped] = useState([]);
    const [matched, setMatched] = useState([]);
    const [moves, setMoves] = useState(0);

    const setupGame = useCallback(() => {
        const selectedWords = dictionary.slice(0, 8).flatMap(entry => [
            { type: 'word', content: entry.faka_uvea, id: entry.faka_uvea },
            { type: 'translation', content: entry.meanings[0].french.split(',')[0], id: entry.faka_uvea }
        ]);
        setCards(selectedWords.sort(() => Math.random() - 0.5));
        setFlipped([]);
        setMatched([]);
        setMoves(0);
    }, [dictionary]);

    useEffect(() => {
        setupGame();
    }, [setupGame]);

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

    const handleFlip = (index) => {
        if (flipped.length < 2 && !flipped.includes(index) && !matched.includes(cards[index].id)) {
            setFlipped(prev => [...prev, index]);
        }
    };
    
    const allMatched = matched.length === 8;

    return (
        <div>
            <div className="game-controls">
                <p>Paires trouvées : {matched.length} / 8</p>
                <p>Tentatives : {moves}</p>
                <button onClick={setupGame} aria-label="Recommencer"><RestartIcon/></button>
            </div>
             {allMatched && (
                <p className="game-win-message">
                    Félicitations ! Vous avez terminé en {moves} tentatives.
                </p>
            )}
            <div className="memory-grid">
                {cards.map((card, index) => (
                    <div
                        key={index}
                        className={`memory-card ${flipped.includes(index) || matched.includes(card.id) ? 'flipped' : ''} ${matched.includes(card.id) ? 'matched' : ''}`}
                        onClick={() => handleFlip(index)}
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
    const { dictionary } = useApp();
    const [deck, setDeck] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isFlipped, setIsFlipped] = useState(false);

    const shuffleDeck = useCallback(() => {
        const shuffled = [...dictionary].sort(() => 0.5 - Math.random()).slice(0, 20);
        setDeck(shuffled);
        setCurrentIndex(0);
        setIsFlipped(false);
    }, [dictionary]);

    useEffect(() => {
        shuffleDeck();
    }, [shuffleDeck]);

    const handleNext = () => {
        setIsFlipped(false);
        setTimeout(() => {
            setCurrentIndex(prev => (prev + 1) % deck.length);
        }, 150); // a small delay to allow card to flip back
    };
    const handlePrev = () => {
        setIsFlipped(false);
        setTimeout(() => {
            setCurrentIndex(prev => (prev - 1 + deck.length) % deck.length);
        }, 150);
    };

    if (deck.length === 0) return <div>Chargement...</div>;

    const currentCard = deck[currentIndex];

    return (
        <div className="flashcards-container">
            <button className="shuffle-button" onClick={shuffleDeck}><ArrowPathIcon /> Mélanger les cartes</button>
            <div className="flashcard-deck" onClick={() => setIsFlipped(!isFlipped)}>
                <div className={`flashcard ${isFlipped ? 'flipped' : ''}`}>
                    <div className="flashcard-face flashcard-face-front">
                        {currentCard.faka_uvea}
                        <p className="flashcard-hint">(Cliquez pour voir la traduction)</p>
                    </div>
                    <div className="flashcard-face flashcard-face-back">
                        {currentCard.meanings[0].french.split(',')[0]}
                        <p className="flashcard-hint">{currentCard.meanings[0].type}</p>
                    </div>
                </div>
            </div>
            <div className="flashcard-controls">
                <button onClick={handlePrev}>Précédent</button>
                <span>{currentIndex + 1} / {deck.length}</span>
                <button onClick={handleNext}>Suivant</button>
            </div>
        </div>
    );
}

const ScrabbleGame = () => {
    const { dictionary } = useApp();
    const [word, setWord] = useState(null);
    const [scrambled, setScrambled] = useState('');
    const [guess, setGuess] = useState('');
    const [feedback, setFeedback] = useState('');
    const [status, setStatus] = useState(''); // 'correct', 'incorrect'

    const setupGame = useCallback(() => {
        const availableWords = dictionary.filter(w => w.faka_uvea.length > 3 && w.faka_uvea.length < 8 && !w.faka_uvea.includes(' '));
        const randomWord = availableWords[Math.floor(Math.random() * availableWords.length)];
        setWord(randomWord);
        setScrambled(randomWord.faka_uvea.split('').sort(() => 0.5 - Math.random()).join(''));
        setGuess('');
        setFeedback('');
        setStatus('');
    }, [dictionary]);

    useEffect(() => {
        setupGame();
    }, [setupGame]);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (guess.toLowerCase() === word.faka_uvea.toLowerCase()) {
            setFeedback(`Bravo ! C'était bien "${word.faka_uvea}".`);
            setStatus('correct');
        } else {
            setFeedback('Incorrect, essayez encore !');
            setStatus('incorrect');
            setTimeout(() => setStatus(''), 500);
        }
    };

    if (!word) return <div>Chargement...</div>;
    
    const isCorrect = status === 'correct';

    return (
        <div className="scrabble-game-container">
             <div className="game-controls" style={{border: 'none', padding: '0', background: 'transparent'}}>
                <p>Formez le mot correct !</p>
                <button onClick={setupGame} aria-label="Nouveau mot"><RestartIcon/></button>
            </div>
            <p className="scrabble-hint">Indice : {word.meanings[0].french.split(',')[0]}</p>
            <div className="scrambled-letters">
                {scrambled.split('').map((letter, i) => <span key={i}>{letter}</span>)}
            </div>
            <form onSubmit={handleSubmit} className="scrabble-form">
                <input
                    type="text"
                    value={guess}
                    onChange={(e) => setGuess(e.target.value)}
                    className={`scrabble-input ${status}`}
                    aria-label="Votre proposition"
                    disabled={isCorrect}
                />
                <button type="submit" className="button-primary" disabled={isCorrect}>Vérifier</button>
            </form>
            {feedback && <p className={`scrabble-feedback ${isCorrect ? 'game-win-message' : 'game-lose-message'}`}>{feedback}</p>}
        </div>
    );
};

const WordSearchGame = () => {
    const { dictionary } = useApp();
    const [grid, setGrid] = useState<string[][]>([]);
    const [words, setWords] = useState<string[]>([]);
    const [foundWords, setFoundWords] = useState<string[]>([]);
    const [selection, setSelection] = useState<{row: number, col: number, id: string}[]>([]);
    const [foundCoordinates, setFoundCoordinates] = useState<Set<string>>(new Set());
    const isSelecting = useRef(false);
    const gridSize = 12;

    const setupGame = useCallback(() => {
        const availableWords = dictionary
            .map(e => e.faka_uvea.toUpperCase())
            .filter(w => w.length <= gridSize && w.length > 2 && !w.includes('\'') && !w.includes(' '));

        const chosenWords = [...new Set(availableWords)].sort(() => 0.5 - Math.random()).slice(0, 8);
        setWords(chosenWords);

        let newGrid: (string | null)[][] = Array.from({ length: gridSize }, () => Array(gridSize).fill(null));
        
        chosenWords.forEach(word => {
            let placed = false;
            let attempts = 0;
            while (!placed && attempts < 50) {
                const direction = Math.random() > 0.5 ? 'horizontal' : 'vertical';
                if (direction === 'horizontal') {
                    const row = Math.floor(Math.random() * gridSize);
                    const col = Math.floor(Math.random() * (gridSize - word.length));
                    let canPlace = true;
                    for (let i = 0; i < word.length; i++) {
                        if (newGrid[row][col + i] !== null && newGrid[row][col + i] !== word[i]) {
                            canPlace = false;
                            break;
                        }
                    }
                    if (canPlace) {
                        for (let i = 0; i < word.length; i++) newGrid[row][col + i] = word[i];
                        placed = true;
                    }
                } else { // vertical
                    const row = Math.floor(Math.random() * (gridSize - word.length));
                    const col = Math.floor(Math.random() * gridSize);
                     let canPlace = true;
                    for (let i = 0; i < word.length; i++) {
                        if (newGrid[row + i][col] !== null && newGrid[row + i][col] !== word[i]) {
                            canPlace = false;
                            break;
                        }
                    }
                    if (canPlace) {
                        for (let i = 0; i < word.length; i++) newGrid[row + i][col] = word[i];
                        placed = true;
                    }
                }
                attempts++;
            }
        });
        
        const finalGrid: string[][] = newGrid.map(row => row.map(cell => {
            if (cell === null) {
                return ALPHABET[Math.floor(Math.random() * (ALPHABET.length - 1))]; // no '
            }
            return cell;
        }));

        setGrid(finalGrid);
        setFoundWords([]);
        setFoundCoordinates(new Set());
    }, [dictionary]);

    useEffect(setupGame, [setupGame]);

    const handleCellSelection = (row: number, col: number) => {
        const cellId = `${row}-${col}`;
        if (selection.some(c => c.id === cellId)) return;
        setSelection(prev => [...prev, { row, col, id: cellId }]);
    };

    const handleMouseDown = (row: number, col: number) => {
        isSelecting.current = true;
        setSelection([{ row, col, id: `${row}-${col}` }]);
    };
    const handleMouseEnter = (row: number, col: number) => {
        if (isSelecting.current) {
            handleCellSelection(row, col);
        }
    };
    const handleMouseUp = () => {
        isSelecting.current = false;
        if (selection.length === 0) return;

        const selectedString = selection.map(cell => grid[cell.row][cell.col]).join('');
        const reversedString = [...selectedString].reverse().join('');

        let foundWord: string | null = null;
        if (words.includes(selectedString) && !foundWords.includes(selectedString)) {
            foundWord = selectedString;
        } else if (words.includes(reversedString) && !foundWords.includes(reversedString)) {
            foundWord = reversedString;
        }
        
        if (foundWord) {
            setFoundWords(prev => [...prev, foundWord!]);
            setFoundCoordinates(prev => {
                const newCoords = new Set(prev);
                selection.forEach(cell => newCoords.add(`${cell.row}-${cell.col}`));
                return newCoords;
            });
        }
        setSelection([]);
    };
    
    const isCellInSelection = (row: number, col: number) => selection.some(c => c.row === row && c.col === col);
    
    const allFound = foundWords.length === words.length && words.length > 0;

    return (
        <div className="word-search-container">
            <div className="word-search-sidebar">
                <h3>Mots à trouver</h3>
                <ul className="word-search-list">
                    {words.map(word => (
                        <li key={word} className={foundWords.includes(word) ? 'found' : ''}>
                            {word}
                        </li>
                    ))}
                </ul>
                {allFound && <p className="game-win-message">Bravo, vous avez trouvé tous les mots !</p>}
                <button onClick={setupGame} className="button-secondary"><RestartIcon/> Nouveau jeu</button>
            </div>
            <div
                className="word-search-grid"
                style={{ '--grid-size': gridSize } as React.CSSProperties}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp} // End selection if mouse leaves grid
            >
                {grid.map((row, r) =>
                    row.map((cell, c) => (
                        <div
                            key={`${r}-${c}`}
                            className={`word-search-cell ${isCellInSelection(r, c) ? 'selected' : ''} ${foundCoordinates.has(`${r}-${c}`) ? 'found' : ''}`}
                            onMouseDown={() => handleMouseDown(r, c)}
                            onMouseEnter={() => handleMouseEnter(r, c)}
                        >
                            {cell}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

const HangmanGame = () => {
    const { dictionary } = useApp();
    const [word, setWord] = useState(null);
    const [guessedLetters, setGuessedLetters] = useState([]);
    const [mistakes, setMistakes] = useState(0);

    const setupGame = useCallback(() => {
        const availableWords = dictionary.filter(w => w.faka_uvea.length > 4 && w.faka_uvea.length < 10 && !w.faka_uvea.includes(' '));
        const randomWord = availableWords[Math.floor(Math.random() * availableWords.length)];
        setWord(randomWord);
        setGuessedLetters([]);
        setMistakes(0);
    }, [dictionary]);

    useEffect(setupGame, [setupGame]);

    const handleGuess = (letter) => {
        if (guessedLetters.includes(letter)) return;
        setGuessedLetters(prev => [...prev, letter]);
        if (!word.faka_uvea.toUpperCase().includes(letter)) {
            setMistakes(prev => prev + 1);
        }
    };
    
    if (!word) return <div>Chargement...</div>;

    const displayedWord = word.faka_uvea
        .toUpperCase()
        .split('')
        .map(letter => (guessedLetters.includes(letter) || letter === ' ' ? letter : '_'))
        .join('');
        
    const isWin = !displayedWord.includes('_');
    const isLoss = mistakes >= 7;
    const isGameOver = isWin || isLoss;

    return (
        <div className="hangman-container">
            <div className="hangman-drawing-area">
                <svg className="hangman-drawing" viewBox="0 0 100 120">
                    <line x1="10" y1="115" x2="90" y2="115" stroke="currentColor" strokeWidth="4" />
                    <line x1="30" y1="115" x2="30" y2="5" stroke="currentColor" strokeWidth="4" />
                    <line x1="30" y1="5" x2="70" y2="5" stroke="currentColor" strokeWidth="4" />
                    <line x1="70" y1="5" x2="70" y2="20" stroke="currentColor" strokeWidth="4" />
                    {mistakes > 0 && <circle cx="70" cy="30" r="10" stroke="currentColor" strokeWidth="3" fill="none" />}
                    {mistakes > 1 && <line x1="70" y1="40" x2="70" y2="70" stroke="currentColor" strokeWidth="3" />}
                    {mistakes > 2 && <line x1="70" y1="50" x2="55" y2="40" stroke="currentColor" strokeWidth="3" />}
                    {mistakes > 3 && <line x1="70" y1="50" x2="85" y2="40" stroke="currentColor" strokeWidth="3" />}
                    {mistakes > 4 && <line x1="70" y1="70" x2="55" y2="90" stroke="currentColor" strokeWidth="3" />}
                    {mistakes > 5 && <line x1="70" y1="70" x2="85" y2="90" stroke="currentColor" strokeWidth="3" />}
                    {mistakes > 6 && <line x1="60" y1="25" x2="65" y2="30" stroke="currentColor" strokeWidth="2" />}
                    {mistakes > 6 && <line x1="65" y1="25" x2="60" y2="30" stroke="currentColor" strokeWidth="2" />}
                    {mistakes > 6 && <line x1="75" y1="25" x2="80" y2="30" stroke="currentColor" strokeWidth="2" />}
                    {mistakes > 6 && <line x1="80" y1="25" x2="75" y2="30" stroke="currentColor" strokeWidth="2" />}
                </svg>
            </div>
            <div className="hangman-game-area">
                {!isGameOver && <p className="hangman-hint">{word.meanings[0].french}</p>}
                <p className="hangman-word">{displayedWord}</p>
                {isGameOver ? (
                    <div className="hangman-game-over">
                        {isWin ? <p className="game-win-message">Gagné !</p> : <p className="game-lose-message">Perdu ! Le mot était : <strong>{word.faka_uvea.toUpperCase()}</strong></p>}
                        <button onClick={setupGame} className="button-primary">Rejouer</button>
                    </div>
                ) : (
                     <div className="hangman-keyboard">
                        {ALPHABET.map(letter => (
                            <button key={letter} onClick={() => handleGuess(letter)} disabled={guessedLetters.includes(letter)}>
                                {letter}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

const TranslationQuizGame = () => {
    const { dictionary } = useApp();
    const [questions, setQuestions] = useState([]);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [score, setScore] = useState(0);
    const [selectedAnswer, setSelectedAnswer] = useState(null);
    const [isCorrect, setIsCorrect] = useState(null);
    const [gameOver, setGameOver] = useState(false);
    const totalQuestions = 10;

    const setupGame = useCallback(() => {
        const gameQuestions = [];
        const dictCopy = [...dictionary];

        for (let i = 0; i < totalQuestions; i++) {
            const questionIndex = Math.floor(Math.random() * dictCopy.length);
            const questionWord = dictCopy.splice(questionIndex, 1)[0];
            
            const options = [questionWord.meanings[0].french.split(',')[0].trim()];
            while (options.length < 4) {
                const randomOption = dictionary[Math.floor(Math.random() * dictionary.length)].meanings[0].french.split(',')[0].trim();
                if (!options.includes(randomOption)) {
                    options.push(randomOption);
                }
            }
            gameQuestions.push({
                word: questionWord.faka_uvea,
                correctAnswer: options[0],
                options: options.sort(() => Math.random() - 0.5)
            });
        }
        setQuestions(gameQuestions);
        setCurrentQuestionIndex(0);
        setScore(0);
        setSelectedAnswer(null);
        setIsCorrect(null);
        setGameOver(false);
    }, [dictionary]);

    useEffect(setupGame, [setupGame]);

    const handleAnswer = (answer) => {
        if (selectedAnswer) return;
        
        setSelectedAnswer(answer);
        const correct = answer === questions[currentQuestionIndex].correctAnswer;
        setIsCorrect(correct);
        if (correct) {
            setScore(s => s + 1);
        }

        setTimeout(() => {
            if (currentQuestionIndex < totalQuestions - 1) {
                setCurrentQuestionIndex(i => i + 1);
                setSelectedAnswer(null);
                setIsCorrect(null);
            } else {
                setGameOver(true);
            }
        }, 1500);
    };

    if (questions.length === 0) return <div>Chargement du quiz...</div>;
    
    if (gameOver) {
        return (
            <div className="translation-quiz-container game-over-summary">
                 <h3>Partie terminée !</h3>
                 <p>Votre score final est de {score} sur {totalQuestions}.</p>
                 <button className="button-primary" onClick={setupGame}>Rejouer</button>
            </div>
        );
    }
    
    const currentQuestion = questions[currentQuestionIndex];

    return (
        <div className="translation-quiz-container">
            <div className="game-controls" style={{border: 'none', background: 'transparent', padding: '0'}}>
                <p>Question {currentQuestionIndex + 1} / {totalQuestions}</p>
                <p>Score : {score}</p>
            </div>
            <div className="quiz-card">
                <p className="quiz-instruction">Traduisez le mot suivant :</p>
                <h3 className="quiz-word">{currentQuestion.word}</h3>

                <div className="quiz-options-grid">
                    {currentQuestion.options.map((option, i) => (
                        <button
                            key={i}
                            className={`quiz-option-btn ${selectedAnswer ? (option === currentQuestion.correctAnswer ? 'correct' : (option === selectedAnswer ? 'incorrect' : '')) : ''}`}
                            onClick={() => handleAnswer(option)}
                            disabled={!!selectedAnswer}
                        >
                            {option}
                        </button>
                    ))}
                </div>
            </div>
             {selectedAnswer && (
                <div className="quiz-feedback-area">
                    <p className={`feedback-message ${isCorrect ? 'correct' : 'incorrect'}`}>
                        {isCorrect ? 'Bonne réponse !' : `Incorrect. La bonne réponse était "${currentQuestion.correctAnswer}".`}
                    </p>
                </div>
            )}
        </div>
    );
};

const PETIT_BAC_CATEGORIES = [
    { id: 'prenom', name: 'Prénom' },
    { id: 'animal', name: 'Animal' },
    { id: 'metier', name: 'Métier' },
    { id: 'fruit_legume', name: 'Fruit / Légume' },
    { id: 'objet', name: 'Objet' },
    { id: 'ville_pays', name: 'Ville / Pays' },
];
const PETIT_BAC_ALPHABET = ['A', 'E', 'F', 'I', 'K', 'L', 'M', 'N', 'O', 'S', 'T', 'U', 'V'];

const PetitBacGame = () => {
    const [gameState, setGameState] = useState('idle'); // idle, playing, finished
    const [letter, setLetter] = useState('');
    const [timeLeft, setTimeLeft] = useState(90);
    const [answers, setAnswers] = useState({});
    const [isLoading, setIsLoading] = useState(false);
    const [results, setResults] = useState<{ scores: any[], totalScore: number } | null>(null);

    useEffect(() => {
        if (gameState !== 'playing' || timeLeft <= 0) return;
        const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
        return () => clearTimeout(timer);
    }, [gameState, timeLeft]);

    useEffect(() => {
        if (timeLeft === 0 && gameState === 'playing') {
            handleFinishGame();
        }
    }, [timeLeft, gameState]);

    const startGame = () => {
        setLetter(PETIT_BAC_ALPHABET[Math.floor(Math.random() * PETIT_BAC_ALPHABET.length)]);
        setAnswers({});
        setResults(null);
        setTimeLeft(90);
        setGameState('playing');
    };
    
    const handleAnswerChange = (categoryId, value) => {
        setAnswers(prev => ({...prev, [categoryId]: value}));
    };

    const handleFinishGame = () => {
        setGameState('finished');
        setIsLoading(true);

        // NOTE: AI validation has been removed to avoid API costs.
        // Scoring is now based on simple checks.
        const scorePlayer = (currentAnswers) => {
            const calculatedResults = PETIT_BAC_CATEGORIES.map(category => {
                const answer = (currentAnswers[category.id] || "").trim();
                let score = 0;
                let isValid = false;
                let explanation = "";

                if (!answer) {
                    explanation = "Aucune réponse fournie.";
                } else if (answer.toLowerCase().startsWith(letter.toLowerCase())) {
                    score = 10;
                    isValid = true;
                    explanation = `Réponse acceptée.`;
                } else {
                    explanation = `La réponse ne commence pas par la lettre "${letter}".`;
                }
                
                return {
                    category: category.name,
                    word: answer || '---',
                    score,
                    isValid,
                    explanation
                };
            });
            
            const total = calculatedResults.reduce((acc, res) => acc + res.score, 0);
            
            setResults({
                scores: calculatedResults,
                totalScore: total
            });
            setIsLoading(false);
        };

        scorePlayer(answers);
    };

    if (gameState === 'idle') {
        return (
            <div className="petit-bac-intro">
                <h3>Petit Bac Faka'uvea</h3>
                <p>Trouvez un mot commençant par la lettre imposée pour chaque catégorie avant la fin du temps imparti. Bonne chance !</p>
                <button className="button-primary" onClick={startGame}>Démarrer une partie</button>
            </div>
        );
    }
    
    if (gameState === 'playing') {
        return (
            <div className="petit-bac-playing">
                <div className="petit-bac-header">
                    <div className="petit-bac-letter">Lettre : <span>{letter}</span></div>
                    <div className="petit-bac-timer">Temps restant : <span>{timeLeft}s</span></div>
                </div>
                <div className="petit-bac-form">
                    {PETIT_BAC_CATEGORIES.map(category => (
                        <div className="form-group" key={category.id}>
                            <label htmlFor={`bac-${category.id}`} className="form-label">{category.name}</label>
                            <input
                                type="text"
                                id={`bac-${category.id}`}
                                className="form-input"
                                value={answers[category.id] || ''}
                                onChange={e => handleAnswerChange(category.id, e.target.value)}
                            />
                        </div>
                    ))}
                </div>
                <button className="button-primary" onClick={handleFinishGame}>J'ai fini !</button>
            </div>
        );
    }

    if (gameState === 'finished') {
        return (
            <div className="petit-bac-results">
                <h3>Résultats pour la lettre '{letter}'</h3>
                {isLoading ? (
                     <div className="loading-container"><div className="loading-indicator"><span></span><span></span><span></span></div> <p>Correction en cours...</p></div>
                ) : results ? (
                    <>
                        <p className="total-score">Votre score total : <strong>{results.totalScore}</strong></p>
                        <div className="results-table">
                            <div className="results-row header">
                                <div>Catégorie</div>
                                <div>Votre réponse</div>
                                <div>Score</div>
                                <div>Commentaire</div>
                            </div>
                            {results.scores.map((res, i) => (
                                <div key={i} className={`results-row ${res.isValid ? 'valid' : 'invalid'}`}>
                                    <div>{res.category}</div>
                                    <div>{res.word}</div>
                                    <div>{res.score}</div>
                                    <div>{res.explanation}</div>
                                </div>
                            ))}
                        </div>
                        <button className="button-primary" onClick={startGame}>Rejouer</button>
                    </>
                ) : (
                    <p>Une erreur est survenue lors de la correction.</p>
                )}
            </div>
        );
    }

    return null;
};


const CertificationPage = ({ onNavigate }) => {
    const { user } = useAuth();
    const [highscores, setHighscores] = useLocalStorage('fkv2_highscores', {});
    
    const passedExams = Object.keys(highscores).filter(level => highscores[level] >= EXAM_LEVELS.find(l => l.name === level).passingPercent);

    return (
        <div className="page-container">
            <div className="exam-center-container">
                <div className="exam-center-header">
                    <div className="trophy-icon"><TrophyIcon width={48} height={48} /></div>
                    <h1 className="page-title">Centre d'Examens</h1>
                    <p>Choisissez votre niveau d'examen pour obtenir votre diplôme.</p>
                </div>
                <div className="exam-selection-grid">
                    {EXAM_LEVELS.map((level, index) => {
                        const isUnlocked = index === 0 || passedExams.includes(EXAM_LEVELS[index - 1].name);
                        const highscore = highscores[level.name] || 0;

                        return (
                            <div key={level.name} className="exam-card" style={{'--level-color': level.color} as React.CSSProperties}>
                                <div className="exam-card-icon" style={{backgroundColor: level.color}}>
                                    <TrophyIcon width={32} height={32}/>
                                </div>
                                <h3 style={{color: level.color}}>{level.name}</h3>
                                {highscore > 0 ? (
                                    <p className="exam-highscore" style={{color: level.color}}>
                                        Meilleur score : <strong>{highscore}%</strong>
                                        {highscore >= level.passingPercent && " (Réussi)"}
                                    </p>
                                ) : (
                                     <p className="exam-highscore">Aucune tentative</p>
                                )}
                                <p className="exam-details">
                                    {level.questionCount} questions • {level.duration} min • {level.passingPercent}% pour réussir
                                </p>
                                <button
                                    className="button-primary"
                                    onClick={() => onNavigate('quiz', { levelName: level.name })}
                                    disabled={!isUnlocked}
                                    style={{'--level-color': level.color} as React.CSSProperties}
                                >
                                    {highscore >= level.passingPercent ? 'Repasser l\'examen' : 'Démarrer'}
                                </button>
                                {!isUnlocked && <p className="unlock-info">Réussissez l'examen {EXAM_LEVELS[index - 1].name} pour débloquer.</p>}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

const QuizPage = ({ levelName, onNavigate }) => {
    const { dictionary } = useApp();
    const { user } = useAuth();
    const [highscores, setHighscores] = useLocalStorage('fkv2_highscores', {});
    
    const level = EXAM_LEVELS.find(l => l.name === levelName);
    const [questions, setQuestions] = useState([]);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [userAnswers, setUserAnswers] = useState([]);
    const [timeLeft, setTimeLeft] = useState(level.duration * 60);
    const [quizState, setQuizState] = useState('playing'); // playing, finished
    const [selectedOption, setSelectedOption] = useState(null);

    useEffect(() => {
        const generatedQuestions = [];
        const dictCopy = [...dictionary];
        for (let i = 0; i < level.questionCount; i++) {
            const qIndex = Math.floor(Math.random() * dictCopy.length);
            const questionWord = dictCopy.splice(qIndex, 1)[0];
            
            const correctAnswer = questionWord.meanings[0].french.split(',')[0].trim();
            const options = [correctAnswer];
            
            while (options.length < 4) {
                 const randIndex = Math.floor(Math.random() * dictionary.length);
                 const randomOption = dictionary[randIndex].meanings[0].french.split(',')[0].trim();
                 if (!options.includes(randomOption)) {
                    options.push(randomOption);
                 }
            }
            generatedQuestions.push({
                question: questionWord.faka_uvea,
                options: options.sort(() => Math.random() - 0.5),
                correctAnswer
            });
        }
        setQuestions(generatedQuestions);
    }, [level, dictionary]);

    useEffect(() => {
        if (quizState === 'playing' && timeLeft > 0) {
            const timer = setTimeout(() => setTimeLeft(t => t - 1), 1000);
            return () => clearTimeout(timer);
        }
        if (timeLeft === 0) {
            finishQuiz();
        }
    }, [timeLeft, quizState]);

    const handleAnswer = (answer) => {
        setSelectedOption(answer);
        setTimeout(() => {
            const isCorrect = answer === questions[currentQuestionIndex].correctAnswer;
            setUserAnswers(prev => [...prev, isCorrect]);
            
            if (currentQuestionIndex < questions.length - 1) {
                setCurrentQuestionIndex(i => i + 1);
                setSelectedOption(null);
            } else {
                finishQuiz([...userAnswers, isCorrect]);
            }
        }, 1000);
    };

    const finishQuiz = (finalAnswers = userAnswers) => {
        setQuizState('finished');
        const correctCount = finalAnswers.filter(Boolean).length;
        const score = Math.round((correctCount / questions.length) * 100);
        
        if (score > (highscores[level.name] || 0)) {
            setHighscores(prev => ({ ...prev, [level.name]: score }));
        }
    };
    
    if (questions.length === 0) return <div>Préparation de l'examen...</div>;
    
    if (quizState === 'finished') {
        const correctCount = userAnswers.filter(Boolean).length;
        const score = Math.round((correctCount / questions.length) * 100);
        const passed = score >= level.passingPercent;

        return (
            <div className="diploma-wrapper">
                <div className="diploma-container" style={{'--diploma-color': level.color} as React.CSSProperties}>
                    <div className="diploma-header">
                        <h2>{passed ? 'Félicitations !' : 'Examen Terminé'}</h2>
                        <p style={{color: level.color}}>Diplôme de Niveau {level.name}</p>
                    </div>
                    <div className="diploma-body">
                        <p>décerné à</p>
                        <h3 className="recipient-name">{user.username}</h3>
                        <p>pour avoir {passed ? 'réussi' : 'participé à'} l'examen avec un score de</p>
                        <h2 style={{color: level.color, fontSize: '3rem', margin: '1rem 0'}}>{score}%</h2>
                    </div>
                    <div className="diploma-footer">
                        <span>Date: {new Date().toLocaleDateString('fr-FR')}</span>
                        <span>Faka'uvea V2 Diplôme</span>
                    </div>
                </div>
                <div className="diploma-actions">
                    <button className="button-secondary" onClick={() => onNavigate('exams')}>Retour aux examens</button>
                    {passed && <button className="button-primary" onClick={() => window.print()}>Imprimer le diplôme</button>}
                </div>
            </div>
        )
    }

    const currentQuestion = questions[currentQuestionIndex];
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;

    return (
        <div className="quiz-container">
            <div className="quiz-header">
                <h3 style={{color: level.color}}>Examen - Niveau {level.name}</h3>
                <div className="quiz-timer">{minutes}:{seconds < 10 ? `0${seconds}` : seconds}</div>
            </div>

            <p className="quiz-question">Quelle est la traduction de <strong>"{currentQuestion.question}"</strong> ?</p>
            
            <div className="quiz-options">
                {currentQuestion.options.map((option, i) => (
                    <button 
                        key={i}
                        className={`quiz-option ${selectedOption === option ? (option === currentQuestion.correctAnswer ? 'correct' : 'incorrect') : ''}`}
                        onClick={() => handleAnswer(option)}
                        disabled={!!selectedOption}
                    >
                        {option}
                    </button>
                ))}
            </div>

            <p className="quiz-progress">Question {currentQuestionIndex + 1} / {questions.length}</p>
        </div>
    );
};

const AITutorPage = ({ onNavigate }) => {
    const { user } = useAuth();
    const { messages, isTutorLoading, sendMessageToTutor, initializeChat, chat } = useApp();
    const [input, setInput] = useState('');
    const chatWindowRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (chatWindowRef.current) {
            chatWindowRef.current.scrollTop = chatWindowRef.current.scrollHeight;
        }
    }, [messages]);
    
    useEffect(() => {
       if (user && !chat) {
            initializeChat();
       }
    }, [user, chat, initializeChat]);

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || isTutorLoading || !chat) return;

        const textToSend = input;
        setInput('');
        await sendMessageToTutor(textToSend);
    };

    if (!user) {
         return (
             <div className="ai-tutor-lock-overlay page-container">
                 <div className="lock-form-container">
                    <LockIcon />
                    <h3>Accès Réservé</h3>
                    <p>Le Tuteur IA est une fonctionnalité premium. Veuillez vous connecter pour y accéder.</p>
                     <button className="button-primary" onClick={() => onNavigate('login')}>Se connecter</button>
                 </div>
            </div>
         );
    }
    
    return (
        <div className="page-container ai-tutor-page-container">
            <div className="ai-tutor-page">
                <header className="ai-tutor-header">
                    <h1 className="page-title">Tuteur IA</h1>
                    <p className="page-subtitle">Discutez avec une IA pour pratiquer et poser vos questions.</p>
                </header>
                <div className="chat-window" ref={chatWindowRef}>
                    {messages.map((msg, index) => (
                        <div key={index} className={`chat-message ${msg.role}-message`}>
                            <div className="message-avatar">
                                {msg.role === 'ai' ? <AiIcon /> : <UserCircleIcon />}
                            </div>
                            <div className="message-content">
                                <p>{msg.text}</p>
                            </div>
                        </div>
                    ))}
                    {isTutorLoading && (
                         <div className="chat-message ai-message">
                            <div className="message-avatar"><AiIcon /></div>
                            <div className="message-content">
                               <div className="loading-indicator"><span></span><span></span><span></span></div>
                            </div>
                        </div>
                    )}
                </div>
                <div className="chat-input-area">
                    <form className="chat-input-form" onSubmit={handleSendMessage}>
                        <input
                            type="text"
                            className="chat-input"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="Posez votre question ici..."
                            disabled={isTutorLoading}
                        />
                        <button type="submit" className="send-button" disabled={isTutorLoading || !input.trim()} aria-label="Envoyer">
                            <SendIcon />
                        </button>
                    </form>
                    <p className="ai-tutor-disclaimer">L'IA peut faire des erreurs. Vérifiez les informations importantes.</p>
                </div>
            </div>
        </div>
    );
};

const LoginPage = ({ onLoginSuccess, onNavigate }) => {
    const { login } = useAuth();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        setError('');
        if (login(username, password)) {
            onLoginSuccess();
        } else {
            setError('Nom d\'utilisateur ou mot de passe incorrect.');
        }
    };

    return (
        <div className="login-page-container">
            <form className="login-card" onSubmit={handleSubmit}>
                <h2 className="login-title">Connexion</h2>
                <p className="login-subtitle">Accédez à votre dictionnaire Faka'uvea.</p>
                {error && <p className="login-error">{error}</p>}
                <div className="form-group">
                    <label htmlFor="username">Utilisateur</label>
                    <input
                        type="text"
                        id="username"
                        className="login-input"
                        placeholder="ex: admin"
                        value={username}
                        onChange={e => setUsername(e.target.value)}
                        required
                    />
                </div>
                <div className="form-group">
                    <label htmlFor="password">Mot de passe</label>
                    <input
                        type="password"
                        id="password"
                        className="login-input"
                        placeholder="ex: admin"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        required
                    />
                </div>
                <button type="submit" className="login-button">Se connecter</button>
            </form>
        </div>
    );
};

const GestionPage = () => {
    const { dictionary, setDictionary, resetDictionary, favorites, toggleFavorite, speak } = useApp();
    const { addToast } = useToasts();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [viewingEntry, setViewingEntry] = useState<DictionaryEntry | null>(null);
    const [filter, setFilter] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const openModal = (item = null) => {
        setEditingItem(item);
        setIsModalOpen(true);
    };
    const closeModal = () => {
        setIsModalOpen(false);
        setEditingItem(null);
    };
    
    const openDetailView = (entry: DictionaryEntry) => {
        setViewingEntry(entry);
    };

    const handleExport = () => {
        try {
            const jsonString = JSON.stringify(dictionary, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `faka-uvea-dictionnaire-${new Date().toISOString().slice(0, 10)}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            addToast('Dictionnaire exporté avec succès.', 'success');
        } catch (error) {
            console.error("Export failed:", error);
            addToast("L'exportation a échoué.", 'error');
        }
    };

    const handleImportClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const text = e.target?.result as string;
                const importedData = JSON.parse(text);

                if (!Array.isArray(importedData) || !importedData.every(item => item.faka_uvea && Array.isArray(item.meanings))) {
                   throw new Error("Format de fichier invalide.");
                }

                if (window.confirm("Êtes-vous sûr de vouloir remplacer le dictionnaire actuel ? Cette action est irréversible.")) {
                    setDictionary(importedData);
                    addToast('Dictionnaire importé avec succès.', 'success');
                } else {
                    addToast('Importation annulée.', 'info');
                }

            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : "Erreur inconnue";
                console.error("Import failed:", error);
                addToast(`Erreur d'importation : ${errorMessage}`, 'error');
            } finally {
                if (fileInputRef.current) {
                    fileInputRef.current.value = "";
                }
            }
        };
        reader.readAsText(file);
    };

    const handleSaveDictionary = (entry) => {
        if (editingItem) {
            setDictionary(prev => prev.map(e => e.faka_uvea === editingItem.faka_uvea ? entry : e));
            addToast('Mot mis à jour avec succès.', 'success');
        } else {
            if (dictionary.some(e => e.faka_uvea.toLowerCase() === entry.faka_uvea.toLowerCase())) {
                addToast('Ce mot existe déjà dans le dictionnaire.', 'error');
                return;
            }
            setDictionary(prev => [...prev, entry].sort((a, b) => a.faka_uvea.localeCompare(b.faka_uvea)));
            addToast('Mot ajouté avec succès.', 'success');
        }
        closeModal();
    };

    const handleDeleteDictionary = (faka_uvea) => {
        if (window.confirm(`Êtes-vous sûr de vouloir supprimer le mot "${faka_uvea}" ?`)) {
            setDictionary(prev => prev.filter(e => e.faka_uvea !== faka_uvea));
            addToast('Mot supprimé.', 'success');
        }
    };
    
    const filteredDictionary = dictionary.filter(e => 
        e.faka_uvea.toLowerCase().includes(filter.toLowerCase()) || 
        e.meanings.some(m => m.french.toLowerCase().includes(filter.toLowerCase()))
    );

    return (
        <div className="page-container gestion-page">
            <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".json"
                style={{ display: 'none' }}
            />

            <div className="gestion-page-header">
                <h1 className="page-title">Gestion du dictionnaire</h1>
                <div className="header-actions">
                    <button className="button-secondary" onClick={handleImportClick}><ArrowUpOnSquareIcon /> Importer</button>
                    <button className="button-secondary" onClick={handleExport}><ArrowDownOnSquareIcon /> Exporter</button>
                    <button className="button-secondary" onClick={() => { if(window.confirm("Réinitialiser le dictionnaire avec les données par défaut ?")) resetDictionary(); }}><RestartIcon /> Réinitialiser</button>
                    <button className="button-primary" onClick={() => openModal()}><PlusIcon /> Ajouter un mot</button>
                </div>
            </div>

            <div className="gestion-controls">
                <input
                    type="search"
                    className="search-bar"
                    placeholder="Rechercher un mot à gérer..."
                    value={filter}
                    onChange={e => setFilter(e.target.value)}
                />
            </div>
            
            <div className="info-box">
                <InfoIcon />
                <p>Information : Les modifications sont sauvegardées localement dans votre navigateur. Utilisez les boutons "Importer/Exporter" pour les sauvegarder durablement.</p>
            </div>

            <div className="gestion-table">
                 <div className="gestion-row header">
                    <span>Faka'uvea</span>
                    <span>Français (sens principal)</span>
                    <span className="actions">Actions</span>
                </div>
                {filteredDictionary.map(entry => (
                    <div key={entry.faka_uvea} className="gestion-row">
                        <span className="clickable-cell" onClick={() => openDetailView(entry)} data-label="Faka'uvea">{entry.faka_uvea}</span>
                        <span className="clickable-cell" onClick={() => openDetailView(entry)} data-label="Français (sens principal)">{entry.meanings[0]?.french}</span>
                        <span className="gestion-cell actions" data-label="Actions">
                            <button className="action-button edit" onClick={() => openModal(entry)}>Éditer</button>
                            <button className="action-button delete" onClick={() => handleDeleteDictionary(entry.faka_uvea)}>Suppr.</button>
                        </span>
                    </div>
                ))}
            </div>
            {isModalOpen && <GestionDicoModal isOpen={isModalOpen} onClose={closeModal} onSave={handleSaveDictionary} item={editingItem} />}
            <WordDetailModal
                entry={viewingEntry}
                isOpen={!!viewingEntry}
                onClose={() => setViewingEntry(null)}
                onSpeak={speak}
                isFavorite={viewingEntry ? favorites.includes(viewingEntry.faka_uvea) : false}
                onToggleFavorite={toggleFavorite}
            />
        </div>
    );
};

const GestionDicoModal = ({ isOpen, onClose, onSave, item }) => {
    const [entry, setEntry] = useState({
        faka_uvea: '',
        phonetic: '',
        image_url: '',
        audio_url: '',
        meanings: [{ french: '', type: '', examples: [] }]
    });

    useEffect(() => {
        if (item) {
            // Deep copy to avoid mutating the original item directly
            const itemCopy = JSON.parse(JSON.stringify(item));
            // Ensure there's always at least one example field for editing
            itemCopy.meanings.forEach(m => {
                if (!m.examples || m.examples.length === 0) {
                    m.examples = [{ faka_uvea: '', french: '' }];
                }
            });
            setEntry(itemCopy);
        } else {
            setEntry({
                faka_uvea: '', phonetic: '', image_url: '', audio_url: '',
                meanings: [{ french: '', type: '', examples: [{faka_uvea: '', french: ''}] }]
            });
        }
    }, [item]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setEntry(prev => ({ ...prev, [name]: value }));
    };

    const handleMeaningChange = (index, e) => {
        const { name, value } = e.target;
        const newMeanings = [...entry.meanings];
        newMeanings[index][name] = value;
        setEntry(prev => ({ ...prev, meanings: newMeanings }));
    };

    const addMeaning = () => {
        setEntry(prev => ({
            ...prev,
            meanings: [...prev.meanings, { french: '', type: '', examples: [{faka_uvea: '', french: ''}] }]
        }));
    };
    
    const removeMeaning = (index) => {
        if (entry.meanings.length <= 1) return;
        const newMeanings = entry.meanings.filter((_, i) => i !== index);
        setEntry(prev => ({ ...prev, meanings: newMeanings }));
    };

    const handleExampleChange = (meaningIndex, exIndex, e) => {
        const { name, value } = e.target;
        const newMeanings = [...entry.meanings];
        newMeanings[meaningIndex].examples[exIndex][name] = value;
        setEntry(prev => ({ ...prev, meanings: newMeanings }));
    }

    const addExample = (meaningIndex) => {
        const newMeanings = [...entry.meanings];
        newMeanings[meaningIndex].examples.push({ faka_uvea: '', french: ''});
        setEntry(prev => ({ ...prev, meanings: newMeanings }));
    }

    const removeExample = (meaningIndex, exIndex) => {
        const newMeanings = [...entry.meanings];
        if (newMeanings[meaningIndex].examples.length <= 1) { // Keep at least one empty example field
             newMeanings[meaningIndex].examples[exIndex] = { faka_uvea: '', french: '' };
        } else {
            newMeanings[meaningIndex].examples = newMeanings[meaningIndex].examples.filter((_, i) => i !== exIndex);
        }
        setEntry(prev => ({ ...prev, meanings: newMeanings }));
    }


    const handleSubmit = (e) => {
        e.preventDefault();
        // Clean up empty examples before saving
        const cleanedEntry = {
            ...entry,
            meanings: entry.meanings.map(meaning => ({
                ...meaning,
                examples: meaning.examples.filter(ex => ex.faka_uvea || ex.french)
            }))
        };
        onSave(cleanedEntry);
    };
    
    return (
        <Modal isOpen={isOpen} onClose={onClose}>
            <form onSubmit={handleSubmit} className="gestion-form dico-form">
                <h2>{item ? 'Modifier le mot' : 'Ajouter un mot'}</h2>
                
                <div className="form-group">
                    <label>Mot en Faka'uvea</label>
                    <input name="faka_uvea" value={entry.faka_uvea} onChange={handleChange} required disabled={!!item} />
                </div>
                <div className="form-group">
                    <label>Phonétique</label>
                    <input name="phonetic" value={entry.phonetic} onChange={handleChange} />
                </div>
                <div className="form-group">
                    <label>URL de l'image</label>
                    <input name="image_url" value={entry.image_url} onChange={handleChange} />
                </div>
                 <div className="form-group">
                    <label>URL de l'audio</label>
                    <input name="audio_url" value={entry.audio_url} onChange={handleChange} />
                </div>
                
                <hr />

                {entry.meanings.map((meaning, index) => (
                    <div key={index} className="meaning-form-group">
                        <div className="meaning-header">
                            <h4>Sens #{index + 1}</h4>
                            <button type="button" className="action-button delete" onClick={() => removeMeaning(index)}>
                                <TrashIcon />
                            </button>
                        </div>
                        <div className="form-group">
                            <label>Traduction française</label>
                            <input name="french" value={meaning.french} onChange={(e) => handleMeaningChange(index, e)} required />
                        </div>
                        <div className="form-group">
                            <label>Type (n.c., v., adj., ...)</label>
                            <input name="type" value={meaning.type} onChange={(e) => handleMeaningChange(index, e)} required />
                        </div>

                        <h5>Exemples</h5>
                        {meaning.examples.map((ex, exIndex) => (
                            <div key={exIndex} className="example-form-group">
                                 <input name="faka_uvea" placeholder="Exemple en faka'uvea" value={ex.faka_uvea} onChange={(e) => handleExampleChange(index, exIndex, e)} />
                                 <input name="french" placeholder="Exemple en français" value={ex.french} onChange={(e) => handleExampleChange(index, exIndex, e)} />
                                <button type="button" className="action-button delete" onClick={() => removeExample(index, exIndex)}>
                                    <TrashIcon />
                                </button>
                            </div>
                        ))}
                        <button type="button" className="button-secondary small" onClick={() => addExample(index)}><PlusIcon /> Ajouter un exemple</button>
                    </div>
                ))}

                <button type="button" className="button-secondary" onClick={addMeaning}><PlusIcon/> Ajouter un sens</button>
                
                <div className="form-actions">
                    <button type="button" className="button-secondary" onClick={onClose}>Annuler</button>
                    <button type="submit" className="button-primary">Sauvegarder</button>
                </div>
            </form>
        </Modal>
    );
};

const App = () => {
    const [page, setPage] = useState('home');
    const [pageProps, setPageProps] = useState<{ word?: string; levelName?: 'Bronze' | 'Argent' | 'Or' }>({});
    const { user } = useAuth();

    useEffect(() => {
        const pageClassMap = {
            home: 'page-default-bg',
            login: 'page-default-bg',
            tutor: 'page-default-bg',
            exams: 'page-default-bg',
            quiz: 'page-default-bg',
            guide: 'page-guide-bg',
            games: 'page-games-bg',
            dictionary: 'page-dictionary-bg',
            info: 'page-info-bg',
        };
        const defaultClass = 'page-other';
        const pageClass = pageClassMap[page] || defaultClass;

        document.body.className = pageClass;
    }, [page]);


    const handleNavigate = (newPage, props = {}) => {
        setPage(newPage);
        setPageProps(props);
        window.scrollTo(0, 0);
    };

    if (!user) {
        // When not logged in, only the login page is rendered.
        // onLoginSuccess will trigger a re-render via context, showing the main app.
        return <LoginPage onLoginSuccess={() => handleNavigate('home')} onNavigate={handleNavigate} />;
    }
    
    const renderPage = () => {
        switch (page) {
            case 'home': return <HomePage onNavigate={handleNavigate} />;
            case 'dictionary': return <DictionaryPage initialWord={pageProps.word} />;
            case 'guide': return <GuidePage />;
            case 'favorites': return <FavoritesPage onNavigate={handleNavigate} />;
            case 'history': return <HistoryPage onNavigate={handleNavigate} />;
            case 'info': return <FakaUveaInfoPage />;
            case 'games': return <GamesPage />;
            case 'tutor': return <AITutorPage onNavigate={handleNavigate} />;
            case 'exams': return <CertificationPage onNavigate={handleNavigate} />;
            case 'quiz': return <QuizPage levelName={pageProps.levelName} onNavigate={handleNavigate} />;
            case 'gestion': return user?.role === 'admin' ? <GestionPage /> : <HomePage onNavigate={handleNavigate} />;
            default: return <HomePage onNavigate={handleNavigate} />;
        }
    };

    return (
        <div className="app-container">
            <Header onNavigate={handleNavigate} currentPage={page} />
            <main className="main-content">
                {renderPage()}
            </main>
            <Footer onNavigate={handleNavigate} />
        </div>
    );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
    <React.StrictMode>
        <ToastProvider>
            <AuthProvider>
                <AppProvider>
                    <App />
                </AppProvider>
            </AuthProvider>
        </ToastProvider>
    </React.StrictMode>
);