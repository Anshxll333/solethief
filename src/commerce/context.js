import { createContext, useContext } from 'react';

export const CommerceContext = createContext(null);
export const useCommerce = () => useContext(CommerceContext);
