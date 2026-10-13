/* Stands in for the accounts area's session (U08) until it lands: no one is signed in here. */

export interface Account {
  id: string;
  username: string | null;
  name: string;
  image: string | null;
  role: "admin" | "user";
}

/** The signed-in account; null when signed out, and undefined until the session is known. */
export const account = (): Account | null | undefined => null;

export const isAdmin = (): boolean => account()?.role === "admin";
