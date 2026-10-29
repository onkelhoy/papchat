/** Detail of the `submit` event. */
export type OnboardingSubmitEvent = {
    /** trimmed, 1 to 32 characters */
    name: string;
    /** one of `colors` */
    color: string;
    /** language code of the chosen language */
    language: string;
    /** a private network to join, `null` for the public papchat one */
    network: { name: string; password: string } | null;
};

/** Detail of the `language-change` event. */
export type OnboardingLanguageEvent = { value: string };
