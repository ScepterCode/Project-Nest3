"use client";

import { createContext, useContext } from "react";
import { createClient } from "@/lib/supabase/client";

const SupabaseContext = createContext(createClient());

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  
  return (
    <SupabaseContext.Provider value={supabase}>
      {children}
    </SupabaseContext.Provider>
  );
}

export function useSupabase() {
  return useContext(SupabaseContext);
}
