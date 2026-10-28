export type Language = {
    /** language code, e.g. "en" */
    code: string;
    /** name in its own language, e.g. "Svenska" */
    label: string;
    /** `pap-icon` name of the flag svg, e.g. "/icons/flags/sv.svg" */
    flag: string;
};

export type LanguageChangeEvent = { value: string };
