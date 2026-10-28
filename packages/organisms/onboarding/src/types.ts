/** Detail of the `submit` event. */
export type OnboardingSubmitEvent = {
    /** trimmed, 1 to 32 characters */
    name: string;
    /** one of `colors` */
    color: string;
    /** language code of the chosen language */
    language: string;
};

/** Detail of the `language-change` event. */
export type OnboardingLanguageEvent = { value: string };
