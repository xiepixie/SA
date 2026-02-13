import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import HttpBackend from 'i18next-http-backend';

i18n
    // Load translation files via HTTP
    .use(HttpBackend)
    // Detect user language
    .use(LanguageDetector)
    // Pass i18n instance to react-i18next
    .use(initReactI18next)
    // Initialize i18next
    .init({
        // Fallback language
        fallbackLng: 'en',

        // Supported languages (matches directory structure: en/, zh/)
        supportedLngs: ['en', 'zh'],

        // Debug mode (only in development)
        debug: import.meta.env.DEV,

        // Namespace configuration - using modular namespaces
        ns: ['common', 'layout', 'ui', 'app', 'error', 'auth', 'dashboard', 'review', 'import', 'library', 'exams', 'sync', 'settings', 'notes', 'renderer', 'markdown'],
        defaultNS: 'common',

        // Interpolation settings
        interpolation: {
            escapeValue: false, // React already escapes by default
        },

        // Backend configuration for loading translation files
        backend: {
            loadPath: '/locales/{{lng}}/{{ns}}.json',
        },

        // Language detection settings
        detection: {
            // Order of detection methods
            order: ['localStorage', 'navigator', 'htmlTag'],
            // Cache user language in localStorage
            caches: ['localStorage'],
            // localStorage key
            lookupLocalStorage: 'i18nextLng',
            // Map detected language variants to supported ones
            convertDetectedLanguage: (lng: string) => {
                // Map Chinese variants to 'zh'
                if (lng === 'zh-CN' || lng === 'zh-TW' || lng.startsWith('zh')) {
                    return 'zh';
                }
                // For other languages, use the base language code
                return lng.split('-')[0];
            },
        },

        // React-specific settings
        react: {
            useSuspense: true,
        },
    });

export default i18n;
