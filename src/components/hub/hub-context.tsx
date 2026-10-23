import { createContext, useContext } from "react";

export const HubContext = createContext(false);
export const useHubSurface = () => useContext(HubContext);
