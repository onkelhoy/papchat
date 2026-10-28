/** what the user picked for a member: from the ⋯ menu, or `chat` on double-click / Enter */
export type MemberAction = "chat" | "call" | "video" | "invite";

export type MemberFilesEvent = {
    /** the member's `profile.uid` */
    uid: string;
    files: File[];
};

export type MemberActionEvent = {
    /** the member's `profile.uid` */
    uid: string;
    action: MemberAction;
};
