import { createContext, useContext } from "react";
import type { ViewId } from "../components/Sidebar";

/** Permite navegar entre secciones desde cualquier vista (ej: click en el donut). */
export const NavContext = createContext<(view: ViewId) => void>(() => {});
export const useNav = () => useContext(NavContext);
