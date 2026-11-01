/** One row. Same shape as `SavedAccount` in @papchat/core. */
export type AccountRow = { slot: string; uid: string; name: string; color: string };

/** Detail of the `account-pick` event. */
export type AccountPickEvent = { slot: string };
