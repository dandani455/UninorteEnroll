import { create } from "zustand";

export type User = {
  name: string;
  semester: number;
  career: string;
};

type State = {
  user: User | null;
  setUser: (u: User) => void;
  signOut: () => void;
};

const KEY = "uninorte-user";

export const useUser = create<State>((set) => ({
  user:
    typeof window !== "undefined"
      ? JSON.parse(sessionStorage.getItem(KEY) || "null")
      : null,
  setUser: (u) => {
    sessionStorage.setItem(KEY, JSON.stringify(u));
    set({ user: u });
  },
  signOut: () => {
    sessionStorage.removeItem(KEY);
    set({ user: null });
  },
}));
