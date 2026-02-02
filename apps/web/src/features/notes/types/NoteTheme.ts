export const COLOR_KEYS = ['primary', 'yellow', 'blue', 'green', 'plum', 'graphite'] as const;
export type NoteColor = typeof COLOR_KEYS[number];

export const NOTE_COLORS: Record<NoteColor, { bg: string; border: string; text: string; accent: string; muted: string; hover: string }> = {
    primary: {
        bg: 'bg-primary/10 dark:bg-primary/20',
        border: 'border-primary/20 dark:border-primary/30',
        text: 'text-primary dark:text-primary-content',
        accent: 'bg-primary/20',
        muted: 'text-primary/60 dark:text-primary-content/60',
        hover: 'hover:bg-primary/10',
    },
    yellow: {
        bg: 'bg-[#fff9db] dark:bg-[#3d3a2b]',
        border: 'border-[#fcc419]/40 dark:border-[#fcc419]/20',
        text: 'text-[#5c4402] dark:text-[#ffde7a]',
        accent: 'bg-[#fcc419]/20',
        muted: 'text-[#856404]/60 dark:text-[#f3d371]/60',
        hover: 'hover:bg-[#856404]/10 dark:hover:bg-[#f3d371]/10',
    },
    blue: {
        bg: 'bg-[#e7f5ff] dark:bg-[#1a2b3b]',
        border: 'border-[#339af0]/40 dark:border-[#339af0]/20',
        text: 'text-[#004a8f] dark:text-[#a5d8ff]',
        accent: 'bg-[#339af0]/20',
        muted: 'text-[#1864ab]/60 dark:text-[#74c0fc]/60',
        hover: 'hover:bg-[#1864ab]/10 dark:hover:bg-[#74c0fc]/10',
    },
    green: {
        bg: 'bg-[#ebfbee] dark:bg-[#1b2b1e]',
        border: 'border-[#40c057]/40 dark:border-[#40c057]/20',
        text: 'text-[#0d5a1f] dark:text-[#b2f2bb]',
        accent: 'bg-[#40c057]/20',
        muted: 'text-[#2b8a3e]/60 dark:text-[#8ce99a]/60',
        hover: 'hover:bg-[#2b8a3e]/10 dark:hover:bg-[#8ce99a]/10',
    },
    plum: {
        bg: 'bg-[#f8f0fc] dark:bg-[#2b1b2d]',
        border: 'border-[#ae3ec9]/40 dark:border-[#ae3ec9]/20',
        text: 'text-[#5f1970] dark:text-[#eebefa]',
        accent: 'bg-[#ae3ec9]/20',
        muted: 'text-[#862e9c]/60 dark:text-[#da77f2]/60',
        hover: 'hover:bg-[#862e9c]/10 dark:hover:bg-[#da77f2]/10',
    },
    graphite: {
        bg: 'bg-[#f1f3f5] dark:bg-[#25262b]',
        border: 'border-[#adb5bd]/40 dark:border-[#adb5bd]/20',
        text: 'text-[#212529] dark:text-[#f8f9fa]',
        accent: 'bg-[#adb5bd]/20',
        muted: 'text-[#495057]/60 dark:text-[#ced4da]/60',
        hover: 'hover:bg-[#495057]/10 dark:hover:bg-[#ced4da]/10',
    },
};
